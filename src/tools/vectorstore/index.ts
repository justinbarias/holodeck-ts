import { basename, extname } from "node:path";
import type { HierarchicalDocumentTool } from "../../config/schema.js";
import { ToolError } from "../../lib/errors.js";
import { getModuleLogger } from "../../lib/logger.js";
import { createBackends } from "./backends/factory.js";
import type { HybridSearchCapable, StoredDocument, VectorStoreBackend } from "./backends/types.js";
import { isHybridSearchCapable } from "./backends/types.js";
import { MarkdownChunker } from "./chunker.js";
import { getConverter } from "./converters/factory.js";
import { discoverFiles } from "./discovery.js";
import type { EmbeddingProvider } from "./embeddings/types.js";
import type { SearchResponse, SearchResult } from "./types.js";

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
// Manifest types for SHA-256 change detection
// ---------------------------------------------------------------------------

interface FileManifestEntry {
	sha256: string;
	chunkIds: string[];
}

type FileManifest = Record<string, FileManifestEntry>;

const MANIFEST_KEY = "__file_manifest__";

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

	/** Set during init when the vector backend supports native hybrid search. */
	private nativeHybridBackend: (VectorStoreBackend & HybridSearchCapable) | null = null;

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
		this.initPromise = null;
	}

	// -------------------------------------------------------------------------
	// Initialization
	// -------------------------------------------------------------------------

	private async doInitialize(): Promise<void> {
		logger.debug`Initializing vectorstore backends for tool '${this.toolConfig.name}'`;
		await this.backendPair.vector.initialize();
		await this.backendPair.keyword.initialize();

		// Detect native hybrid capability (e.g. Redis >= 8.4 with FT.HYBRID)
		if (isHybridSearchCapable(this.backendPair.vector)) {
			this.nativeHybridBackend = this.backendPair.vector;
			logger.info`Native hybrid search enabled (server-side RRF) for tool '${this.toolConfig.name}'`;
		}

		await this.ingestAll();
	}

	// -------------------------------------------------------------------------
	// Ingestion pipeline
	// -------------------------------------------------------------------------

	private async ingestAll(): Promise<void> {
		// 1. Load manifest from backend
		const raw = await this.backendPair.vector.getManifest(MANIFEST_KEY);
		const manifest: FileManifest = raw ? JSON.parse(raw) : {};

		// 2. Discover files
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

		// 3. Delete chunks for removed files (in manifest but not discovered)
		let deletedCount = 0;
		for (const [filePath, entry] of Object.entries(manifest)) {
			if (!discoveredPaths.has(filePath)) {
				await this.deleteFileChunks(filePath, entry.chunkIds);
				delete manifest[filePath];
				deletedCount++;
				logger.debug`Removed stale file from index: ${filePath}`;
			}
		}

		// 4. Process each discovered file
		let skippedCount = 0;
		let updatedCount = 0;

		for (const file of discoveredFiles) {
			const existing = manifest[file.path];

			// Skip unchanged files (SHA-256 match)
			if (existing && existing.sha256 === file.sha256) {
				skippedCount++;
				continue;
			}

			// Delete old chunks for changed files
			if (existing) {
				await this.deleteFileChunks(file.path, existing.chunkIds);
			}

			try {
				const chunkIds = await this.ingestFile(file.path, file.extension, file.sha256);
				manifest[file.path] = { sha256: file.sha256, chunkIds };
				updatedCount++;
			} catch (err) {
				logger.warn`Failed to ingest file '${file.path}': ${err instanceof Error ? err.message : String(err)}`;
			}
		}

		// 5. Save manifest
		await this.backendPair.vector.setManifest(MANIFEST_KEY, JSON.stringify(manifest));

		logger.info`Ingestion complete — skipped: ${skippedCount}, updated: ${updatedCount}, deleted: ${deletedCount}`;
	}

	private async deleteFileChunks(filePath: string, chunkIds: string[]): Promise<void> {
		if (chunkIds.length === 0) return;
		await Promise.all([
			this.backendPair.vector.delete(chunkIds),
			this.backendPair.keyword.delete(chunkIds),
		]);
		logger.debug`Deleted ${chunkIds.length} chunks for file: ${filePath}`;
	}

	private async ingestFile(filePath: string, extension: string, sha256: string): Promise<string[]> {
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

		// 6. Build IndexableDocument array for both backends
		const chunkIds: string[] = [];
		const docs: Array<{
			id: string;
			content: string;
			embedding: number[];
			metadata: Record<string, unknown>;
		}> = [];

		for (let i = 0; i < rawChunks.length; i++) {
			const raw = rawChunks[i];
			if (!raw) continue;
			const embedding = embeddings[i];
			if (!embedding) continue;

			const chunkId = `${documentId}:${raw.chunk_index}`;
			chunkIds.push(chunkId);

			const metadata: Record<string, unknown> = {
				source_path: filePath,
				document_id: documentId,
				section_id: raw.section_id,
				subsection_ids: raw.subsection_ids,
				parent_chain: raw.parent_chain,
				chunk_index: raw.chunk_index,
				chunk_type: raw.chunk_type,
				heading_level: raw.heading_level,
				contextualized_content: raw.contextualized_content,
				sha256,
			};

			docs.push({ id: chunkId, content: raw.content, embedding, metadata });
		}

		// 7. Upsert into both backends
		await Promise.all([this.backendPair.vector.upsert(docs), this.backendPair.keyword.index(docs)]);

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
		if (hits.length === 0) return [];

		const docs = await this.backendPair.vector.retrieve(hits.map((h) => h.id));
		const results: SearchResult[] = [];

		for (const hit of hits) {
			if (minScore !== undefined && hit.score < minScore) continue;
			const doc = docs.get(hit.id);
			if (!doc) continue;
			results.push(this.buildSearchResult(doc, hit.score, { semanticScore: hit.score }));
		}

		return results.slice(0, topK);
	}

	private async keywordSearch(
		query: string,
		topK: number,
		minScore: number | undefined,
	): Promise<SearchResult[]> {
		const hits = await this.backendPair.keyword.search(query, topK);
		if (hits.length === 0) return [];

		const docs = await this.backendPair.vector.retrieve(hits.map((h) => h.id));
		const results: SearchResult[] = [];

		for (const hit of hits) {
			if (minScore !== undefined && hit.score < minScore) continue;
			const doc = docs.get(hit.id);
			if (!doc) continue;
			results.push(this.buildSearchResult(doc, hit.score, { keywordScore: hit.score }));
		}

		return results.slice(0, topK);
	}

	private async exactSearch(
		query: string,
		topK: number,
		minScore: number | undefined,
	): Promise<SearchResult[]> {
		const exactHits = await this.backendPair.keyword.exactMatch(query, topK);
		if (exactHits.length === 0) return [];

		const docs = await this.backendPair.vector.retrieve(exactHits.map((h) => h.id));
		const results: SearchResult[] = [];

		for (const hit of exactHits) {
			const score = 1.0;
			if (minScore !== undefined && score < minScore) continue;
			const doc = docs.get(hit.id);
			if (!doc) continue;
			results.push(this.buildSearchResult(doc, score, { exactScore: score, isExactMatch: true }));
		}

		return results.slice(0, topK);
	}

	private async hybridSearch(
		query: string,
		topK: number,
		minScore: number | undefined,
	): Promise<SearchResult[]> {
		if (this.nativeHybridBackend) {
			try {
				return await this.nativeHybridSearch(query, topK, minScore);
			} catch (err) {
				logger.warn`Native hybrid search failed, falling back to client-side RRF: ${
					err instanceof Error ? err.message : String(err)
				}`;
			}
		}
		return this.clientSideHybridSearch(query, topK, minScore);
	}

	/**
	 * Native hybrid search path: uses FT.HYBRID for server-side text+vector
	 * fusion, plus a lightweight client-side exact-match boost.
	 */
	private async nativeHybridSearch(
		query: string,
		topK: number,
		minScore: number | undefined,
	): Promise<SearchResult[]> {
		const backend = this.nativeHybridBackend;
		if (!backend) return this.clientSideHybridSearch(query, topK, minScore);
		const candidateK = Math.max(150, topK * 10);

		const [queryEmbedding] = await this.embeddingProvider.embed([query]);
		if (!queryEmbedding) return [];

		const sw = this.toolConfig.semantic_weight;
		const kw = this.toolConfig.keyword_weight;
		const ew = this.toolConfig.exact_weight;

		// Run native hybrid (text+vector) and exact match in parallel.
		// This reduces 3 round-trips to 2 — FT.HYBRID handles semantic + keyword
		// server-side, and exactMatch is a cheap phrase query.
		const [hybridHits, exactHits] = await Promise.all([
			backend.hybridSearch(query, queryEmbedding, candidateK, {
				semanticWeight: sw,
				keywordWeight: kw,
				rrfK: RRF_K,
			}),
			this.backendPair.keyword.exactMatch(query, candidateK),
		]);

		const exactIds = new Set(exactHits.map((h) => h.id));

		// Merge: scale hybrid score by text+vector weight portion, add exact boost
		const textVectorWeight = sw + kw;

		type ScoredHit = {
			id: string;
			finalScore: number;
			semanticScore?: number;
			keywordScore?: number;
			isExact: boolean;
		};

		const scored: ScoredHit[] = hybridHits.map((hit) => {
			const isExact = exactIds.has(hit.id);
			return {
				id: hit.id,
				finalScore: hit.score * textVectorWeight + (isExact ? ew : 0),
				semanticScore: hit.semanticScore,
				keywordScore: hit.keywordScore,
				isExact,
			};
		});

		// Add exact-only hits not present in hybrid results
		const hybridIds = new Set(hybridHits.map((h) => h.id));
		for (const exactHit of exactHits) {
			if (!hybridIds.has(exactHit.id)) {
				scored.push({
					id: exactHit.id,
					finalScore: ew,
					isExact: true,
				});
			}
		}

		// Normalize to 0-1
		const maxFinal = Math.max(...scored.map((s) => s.finalScore), Number.EPSILON);
		scored.sort((a, b) => b.finalScore - a.finalScore);

		// Retrieve documents for top-K
		const topIds = scored.slice(0, topK).map((s) => s.id);
		const docs = await this.backendPair.vector.retrieve(topIds);

		const results: SearchResult[] = [];
		for (const hit of scored) {
			const normalizedScore = hit.finalScore / maxFinal;
			if (minScore !== undefined && normalizedScore < minScore) continue;
			const doc = docs.get(hit.id);
			if (!doc) continue;

			results.push(
				this.buildSearchResult(doc, normalizedScore, {
					semanticScore: hit.semanticScore,
					keywordScore: hit.keywordScore,
					exactScore: hit.isExact ? 1.0 : undefined,
					isExactMatch: hit.isExact,
				}),
			);

			if (results.length >= topK) break;
		}

		return results;
	}

	/** Client-side RRF hybrid search: 3 parallel queries + application-level fusion. */
	private async clientSideHybridSearch(
		query: string,
		topK: number,
		minScore: number | undefined,
	): Promise<SearchResult[]> {
		// Retrieve top-150 candidates per modality, then RRF-fuse
		const candidateK = Math.max(150, topK * 10);

		// Run all modalities in parallel
		const [queryEmbedding] = await this.embeddingProvider.embed([query]);
		if (!queryEmbedding) return [];

		const [vectorHits, keywordHits, exactHits] = await Promise.all([
			this.backendPair.vector.search(queryEmbedding, candidateK),
			this.backendPair.keyword.search(query, candidateK),
			this.backendPair.keyword.exactMatch(query, candidateK),
		]);

		// Build ranked lists: id → rank (1-based)
		const semanticRanks = new Map<string, number>(vectorHits.map((h, i) => [h.id, i + 1]));
		const keywordRanks = new Map<string, number>(keywordHits.map((h, i) => [h.id, i + 1]));
		const exactRanks = new Map<string, number>(exactHits.map((h, i) => [h.id, i + 1]));

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

		// Sort and take top-K winners
		const sorted = [...rrfScores.entries()].sort((a, b) => b[1] - a[1]);
		const topIds = sorted.slice(0, topK).map(([id]) => id);

		// Retrieve only the final top-K documents
		const docs = await this.backendPair.vector.retrieve(topIds);

		const results: SearchResult[] = [];
		for (const [id, rawScore] of sorted) {
			const normalizedScore = rawScore / normalizer;
			if (minScore !== undefined && normalizedScore < minScore) continue;
			const doc = docs.get(id);
			if (!doc) continue;

			const semScore = vectorScoreMap.get(id);
			const kwScore = keywordScoreMap.get(id);
			const isExact = exactRanks.has(id);

			results.push(
				this.buildSearchResult(doc, normalizedScore, {
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
		doc: StoredDocument,
		score: number,
		opts: {
			semanticScore?: number;
			keywordScore?: number;
			exactScore?: number;
			isExactMatch?: boolean;
		} = {},
	): SearchResult {
		const meta = doc.metadata;
		const contextualizedContent = meta.contextualized_content as string | undefined;
		return {
			content: contextualizedContent ?? doc.content,
			score,
			semantic_score: opts.semanticScore,
			keyword_score: opts.keywordScore,
			exact_score: opts.exactScore,
			source_path: (meta.source_path as string) ?? "",
			parent_chain: (meta.parent_chain as string[]) ?? [],
			section_id: (meta.section_id as string) ?? "",
			subsection_ids: (meta.subsection_ids as string[]) ?? [],
			chunk_index: (meta.chunk_index as number) ?? 0,
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
