import { basename, extname } from "node:path";
import type { HierarchicalDocumentTool } from "../../config/schema.js";
import { ToolError } from "../../lib/errors.js";
import { getModuleLogger } from "../../lib/logger.js";
import { createBackends } from "./backends/factory.js";
import { MarkdownChunker } from "./chunker.js";
import { getConverter } from "./converters/factory.js";
import { discoverFiles } from "./discovery.js";
import type { EmbeddingProvider } from "./embeddings/types.js";
import type { DocumentChunk, SearchResponse, SearchResult } from "./types.js";

const logger = getModuleLogger("vectorstore.index");

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface SearchOptions {
	readonly top_k?: number;
	readonly search_mode?: "semantic" | "keyword" | "exact" | "hybrid";
	readonly min_score?: number;
}

export interface VectorstoreServer {
	search(query: string, options: SearchOptions): Promise<SearchResponse>;
	initialize(): Promise<void>;
	reingest(): Promise<void>;
	close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal state per tracked file
// ---------------------------------------------------------------------------

interface FileIndexState {
	modifiedAt: Date;
	chunkIds: string[];
}

// ---------------------------------------------------------------------------
// RRF constants
// ---------------------------------------------------------------------------

const RRF_K = 60;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class VectorstoreServerImpl implements VectorstoreServer {
	private readonly toolConfig: HierarchicalDocumentTool;
	private readonly embeddingProvider: EmbeddingProvider;

	/** Backends — created lazily so we can await initialize() */
	private readonly backendPair: ReturnType<typeof createBackends>;

	/** In-memory chunk store: chunkId → full DocumentChunk */
	private readonly chunkStore = new Map<string, DocumentChunk>();

	/** Per-file tracking: filePath → { modifiedAt, chunkIds } */
	private readonly fileIndex = new Map<string, FileIndexState>();

	/** Lazy initialization guard — null = not yet started */
	private initPromise: Promise<void> | null = null;

	private readonly chunker = new MarkdownChunker();

	constructor(toolConfig: HierarchicalDocumentTool, embeddingProvider: EmbeddingProvider) {
		this.toolConfig = toolConfig;
		this.embeddingProvider = embeddingProvider;
		this.backendPair = createBackends(
			toolConfig.database,
			embeddingProvider.dimensions(),
			toolConfig.name,
			toolConfig.keyword_search,
		);
	}

	// -------------------------------------------------------------------------
	// Public interface
	// -------------------------------------------------------------------------

	async initialize(): Promise<void> {
		if (!this.initPromise) {
			this.initPromise = this.doInitialize();
		}
		await this.initPromise;
	}

	async reingest(): Promise<void> {
		// Force a fresh ingest pass regardless of the current init state
		await this.ingestAll();
	}

	async search(query: string, options: SearchOptions): Promise<SearchResponse> {
		// Lazy init
		await this.initialize();

		const searchMode = options.search_mode ?? this.toolConfig.search_mode;
		const topK = options.top_k ?? this.toolConfig.top_k;
		const minScore = options.min_score ?? this.toolConfig.min_score;

		let results: SearchResult[];

		try {
			results = await this.runSearch(query, searchMode, topK, minScore);
		} catch (err) {
			logger.warn`Search failed, returning empty results: ${err instanceof Error ? err.message : String(err)}`;
			return {
				query,
				search_mode: searchMode,
				total_results: 0,
				results: [],
				degraded: true,
				degraded_details: err instanceof Error ? err.message : String(err),
			};
		}

		return {
			query,
			search_mode: searchMode,
			total_results: results.length,
			results,
		};
	}

	async close(): Promise<void> {
		await Promise.all([this.backendPair.vector.close(), this.backendPair.keyword.close()]);
		this.chunkStore.clear();
		this.fileIndex.clear();
		this.initPromise = null;
	}

	// -------------------------------------------------------------------------
	// Initialization
	// -------------------------------------------------------------------------

	private async doInitialize(): Promise<void> {
		logger.debug`Initializing vectorstore backends for tool '${this.toolConfig.name}'`;
		await this.backendPair.vector.initialize();
		await this.backendPair.keyword.initialize();
		await this.ingestAll();
	}

	// -------------------------------------------------------------------------
	// Ingestion pipeline
	// -------------------------------------------------------------------------

	private async ingestAll(): Promise<void> {
		let discoveredFiles: Awaited<ReturnType<typeof discoverFiles>>;
		try {
			discoveredFiles = await discoverFiles(this.toolConfig.source);
		} catch (err) {
			throw new ToolError(`Failed to discover files in '${this.toolConfig.source}'`, {
				cause: err,
				operation: "ingestAll",
			});
		}

		const discoveredPaths = new Set(discoveredFiles.map((f) => f.path));

		// --- Delete stale chunks for removed files ---
		let deletedCount = 0;
		for (const [filePath, state] of this.fileIndex) {
			if (!discoveredPaths.has(filePath)) {
				await this.deleteFileChunks(filePath, state.chunkIds);
				this.fileIndex.delete(filePath);
				deletedCount++;
				logger.debug`Removed stale file from index: ${filePath}`;
			}
		}

		// --- Process each discovered file ---
		let skippedCount = 0;
		let updatedCount = 0;

		for (const file of discoveredFiles) {
			const existing = this.fileIndex.get(file.path);

			// Skip unchanged files
			if (existing && existing.modifiedAt.getTime() === file.modifiedAt.getTime()) {
				skippedCount++;
				continue;
			}

			// Delete old chunks for changed files
			if (existing) {
				await this.deleteFileChunks(file.path, existing.chunkIds);
			}

			try {
				const chunkIds = await this.ingestFile(file.path, file.extension, file.modifiedAt);
				this.fileIndex.set(file.path, { modifiedAt: file.modifiedAt, chunkIds });
				updatedCount++;
			} catch (err) {
				logger.warn`Failed to ingest file '${file.path}': ${err instanceof Error ? err.message : String(err)}`;
			}
		}

		logger.info`Ingestion complete — skipped: ${skippedCount}, updated: ${updatedCount}, deleted: ${deletedCount}`;
	}

	private async deleteFileChunks(filePath: string, chunkIds: string[]): Promise<void> {
		if (chunkIds.length === 0) return;
		await Promise.all([
			this.backendPair.vector.delete(chunkIds),
			this.backendPair.keyword.delete(chunkIds),
		]);
		for (const id of chunkIds) {
			this.chunkStore.delete(id);
		}
		logger.debug`Deleted ${chunkIds.length} chunks for file: ${filePath}`;
	}

	private async ingestFile(
		filePath: string,
		extension: string,
		modifiedAt: Date,
	): Promise<string[]> {
		// 1. Read + convert
		const buffer = Buffer.from(await Bun.file(filePath).arrayBuffer());
		const converter = getConverter(extension);
		const markdown = await converter.convert(buffer, { sourcePath: filePath });

		// 2. Chunk
		const chunkConfig = {
			strategy: this.toolConfig.chunking_strategy,
			max_chunk_tokens: this.toolConfig.max_chunk_tokens,
			chunk_overlap: this.toolConfig.chunk_overlap,
		};
		const rawChunks = this.chunker.chunk(markdown, chunkConfig);

		if (rawChunks.length === 0) {
			logger.warn`No chunks produced from file: ${filePath}`;
			return [];
		}

		// 3. Derive document_id from file path
		const documentId = this.deriveDocumentId(filePath);

		// 4. Build texts for embedding (use content directly; contextual embeddings omitted here
		//    as contextual retrieval requires Claude API calls — that layer is an optional add-on)
		const textsToEmbed = rawChunks.map((c) => c.content);

		// 5. Embed
		const embeddings = await this.embeddingProvider.embed(textsToEmbed);

		// 6. Assemble full DocumentChunk objects and build IndexableChunk lists
		const chunkIds: string[] = [];
		const vectorChunks: Array<{
			id: string;
			content: string;
			embedding: number[];
			metadata: Record<string, unknown>;
		}> = [];
		const keywordChunks: Array<{ id: string; content: string; metadata: Record<string, unknown> }> =
			[];

		for (let i = 0; i < rawChunks.length; i++) {
			const raw = rawChunks[i];
			if (!raw) continue;
			const embedding = embeddings[i];
			if (!embedding) continue;

			const chunkId = `${documentId}:${raw.chunk_index}`;

			const fullChunk: DocumentChunk = {
				id: chunkId,
				document_id: documentId,
				content: raw.content,
				contextualized_content: raw.contextualized_content,
				parent_chain: raw.parent_chain,
				section_id: raw.section_id,
				subsection_ids: raw.subsection_ids,
				chunk_type: raw.chunk_type,
				chunk_index: raw.chunk_index,
				source_path: filePath,
				heading_level: raw.heading_level,
				token_count: raw.token_count,
				embedding,
				file_modified_at: modifiedAt.getTime(),
			};

			this.chunkStore.set(chunkId, fullChunk);
			chunkIds.push(chunkId);

			const metadata: Record<string, unknown> = {
				source_path: filePath,
				document_id: documentId,
				section_id: raw.section_id,
				chunk_index: raw.chunk_index,
				chunk_type: raw.chunk_type,
			};

			vectorChunks.push({ id: chunkId, content: raw.content, embedding, metadata });
			keywordChunks.push({ id: chunkId, content: raw.content, metadata });
		}

		// 7. Upsert into backends
		await Promise.all([
			this.backendPair.vector.upsert(vectorChunks),
			this.backendPair.keyword.index(keywordChunks),
		]);

		logger.debug`Ingested ${chunkIds.length} chunks from: ${filePath}`;
		return chunkIds;
	}

	private deriveDocumentId(filePath: string): string {
		// Use the basename without extension as a human-friendly prefix, append full path hash
		const base = basename(filePath, extname(filePath));
		// Simple deterministic ID: replace non-alphanumeric with underscores
		return `${base}_${filePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
	}

	// -------------------------------------------------------------------------
	// Search logic
	// -------------------------------------------------------------------------

	private async runSearch(
		query: string,
		searchMode: "semantic" | "keyword" | "exact" | "hybrid",
		topK: number,
		minScore: number | undefined,
	): Promise<SearchResult[]> {
		switch (searchMode) {
			case "semantic":
				return this.semanticSearch(query, topK, minScore);
			case "keyword":
				return this.keywordSearch(query, topK, minScore);
			case "exact":
				return this.exactSearch(query, topK, minScore);
			case "hybrid":
				return this.hybridSearch(query, topK, minScore);
		}
	}

	private async semanticSearch(
		query: string,
		topK: number,
		minScore: number | undefined,
	): Promise<SearchResult[]> {
		const [queryEmbedding] = await this.embeddingProvider.embed([query]);
		if (!queryEmbedding) return [];

		const hits = await this.backendPair.vector.search(queryEmbedding, topK);
		const results: SearchResult[] = [];

		for (const hit of hits) {
			if (minScore !== undefined && hit.score < minScore) continue;
			const chunk = this.chunkStore.get(hit.id);
			if (!chunk) continue;
			results.push(this.buildSearchResult(chunk, hit.score, { semanticScore: hit.score }));
		}

		return results.slice(0, topK);
	}

	private async keywordSearch(
		query: string,
		topK: number,
		minScore: number | undefined,
	): Promise<SearchResult[]> {
		const hits = await this.backendPair.keyword.search(query, topK);
		const results: SearchResult[] = [];

		for (const hit of hits) {
			if (minScore !== undefined && hit.score < minScore) continue;
			const chunk = this.chunkStore.get(hit.id);
			if (!chunk) continue;
			results.push(this.buildSearchResult(chunk, hit.score, { keywordScore: hit.score }));
		}

		return results.slice(0, topK);
	}

	private exactSearch(query: string, topK: number, minScore: number | undefined): SearchResult[] {
		const lower = query.toLowerCase();
		const results: SearchResult[] = [];

		for (const chunk of this.chunkStore.values()) {
			if (!chunk.content.toLowerCase().includes(lower)) continue;
			const score = 1.0;
			if (minScore !== undefined && score < minScore) continue;
			results.push(this.buildSearchResult(chunk, score, { exactScore: score, isExactMatch: true }));
		}

		return results.slice(0, topK);
	}

	private async hybridSearch(
		query: string,
		topK: number,
		minScore: number | undefined,
	): Promise<SearchResult[]> {
		// Retrieve top-150 candidates per modality, then RRF-fuse
		const candidateK = Math.max(150, topK * 10);

		// Run all three modalities in parallel
		const [queryEmbedding] = await this.embeddingProvider.embed([query]);
		if (!queryEmbedding) return [];

		const [vectorHits, keywordHits] = await Promise.all([
			this.backendPair.vector.search(queryEmbedding, candidateK),
			this.backendPair.keyword.search(query, candidateK),
		]);

		// Exact hits from chunk store
		const lower = query.toLowerCase();
		const exactIds: string[] = [];
		for (const [id, chunk] of this.chunkStore) {
			if (chunk.content.toLowerCase().includes(lower)) {
				exactIds.push(id);
			}
		}

		// Build ranked lists: id → rank (1-based)
		const semanticRanks = new Map<string, number>(vectorHits.map((h, i) => [h.id, i + 1]));
		const keywordRanks = new Map<string, number>(keywordHits.map((h, i) => [h.id, i + 1]));
		const exactRanks = new Map<string, number>(exactIds.map((id, i) => [id, i + 1]));

		const sw = this.toolConfig.semantic_weight;
		const kw = this.toolConfig.keyword_weight;
		const ew = this.toolConfig.exact_weight;

		// Collect all candidate IDs
		const allIds = new Set<string>([
			...semanticRanks.keys(),
			...keywordRanks.keys(),
			...exactRanks.keys(),
		]);

		// Per-id raw scores for sub-score attribution
		const vectorScoreMap = new Map<string, number>(vectorHits.map((h) => [h.id, h.score]));
		const keywordScoreMap = new Map<string, number>(keywordHits.map((h) => [h.id, h.score]));

		// Compute RRF scores
		const rrfScores = new Map<string, number>();
		for (const id of allIds) {
			const semRank = semanticRanks.get(id);
			const kwRank = keywordRanks.get(id);
			const exRank = exactRanks.get(id);

			let score = 0;
			if (semRank !== undefined) score += sw / (RRF_K + semRank);
			if (kwRank !== undefined) score += kw / (RRF_K + kwRank);
			if (exRank !== undefined) score += ew / (RRF_K + exRank);
			rrfScores.set(id, score);
		}

		// Normalize to 0-1 by max
		const maxScore = Math.max(...rrfScores.values(), 0);
		const normalizer = maxScore > 0 ? maxScore : 1;

		// Sort and filter
		const sorted = [...rrfScores.entries()].sort((a, b) => b[1] - a[1]);

		const results: SearchResult[] = [];
		for (const [id, rawScore] of sorted) {
			const normalizedScore = rawScore / normalizer;
			if (minScore !== undefined && normalizedScore < minScore) continue;
			const chunk = this.chunkStore.get(id);
			if (!chunk) continue;

			const semScore = vectorScoreMap.get(id);
			const kwScore = keywordScoreMap.get(id);
			const isExact = exactRanks.has(id);

			results.push(
				this.buildSearchResult(chunk, normalizedScore, {
					semanticScore: semScore,
					keywordScore: kwScore,
					exactScore: isExact ? 1.0 : undefined,
					isExactMatch: isExact,
				}),
			);

			if (results.length >= topK) break;
		}

		return results;
	}

	private buildSearchResult(
		chunk: DocumentChunk,
		score: number,
		opts: {
			semanticScore?: number;
			keywordScore?: number;
			exactScore?: number;
			isExactMatch?: boolean;
		} = {},
	): SearchResult {
		return {
			content: chunk.contextualized_content ?? chunk.content,
			score,
			semantic_score: opts.semanticScore,
			keyword_score: opts.keywordScore,
			exact_score: opts.exactScore,
			source_path: chunk.source_path,
			parent_chain: chunk.parent_chain,
			section_id: chunk.section_id,
			subsection_ids: chunk.subsection_ids,
			chunk_index: chunk.chunk_index,
			is_exact_match: opts.isExactMatch ?? false,
		};
	}
}

// ---------------------------------------------------------------------------
// Factory function (public API)
// ---------------------------------------------------------------------------

export function createVectorstoreServer(
	toolConfig: HierarchicalDocumentTool,
	embeddingProvider: EmbeddingProvider,
): VectorstoreServer {
	return new VectorstoreServerImpl(toolConfig, embeddingProvider);
}
