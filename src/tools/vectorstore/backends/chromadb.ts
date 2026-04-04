import type { Collection } from "chromadb";
import { ChromaClient } from "chromadb";
import { ToolError } from "../../../lib/errors.js";
import { getModuleLogger } from "../../../lib/logger.js";
import type {
	IndexableChunk,
	VectorSearchHit,
	VectorStoreBackend,
	VectorStoreConfig,
} from "./types.js";

const logger = getModuleLogger("vectorstore.chromadb");

// ---------------------------------------------------------------------------
// ChromaDBVectorBackend
// ---------------------------------------------------------------------------

export interface ChromaDBConfig {
	/** Connection string, e.g. "http://localhost:8000" */
	readonly connectionString: string;
}

export class ChromaDBVectorBackend implements VectorStoreBackend {
	private readonly storeConfig: VectorStoreConfig;
	private readonly chromaConfig: ChromaDBConfig;
	private client: ChromaClient | null;
	private collection: Collection | null;

	constructor(storeConfig: VectorStoreConfig, chromaConfig: ChromaDBConfig) {
		this.storeConfig = storeConfig;
		this.chromaConfig = chromaConfig;
		this.client = null;
		this.collection = null;
	}

	async initialize(): Promise<void> {
		try {
			const url = new URL(this.chromaConfig.connectionString);
			this.client = new ChromaClient({
				host: url.hostname,
				port: Number(url.port) || (url.protocol === "https:" ? 443 : 8000),
				ssl: url.protocol === "https:",
			});

			this.collection = await this.client.getOrCreateCollection({
				name: this.storeConfig.collectionName,
				embeddingFunction: null,
				configuration: {
					hnsw: { space: "cosine" },
				},
			});

			logger.debug`ChromaDB collection "${this.storeConfig.collectionName}" ready`;
		} catch (err) {
			throw new ToolError(
				`ChromaDB initialize failed for collection "${this.storeConfig.collectionName}": ${err instanceof Error ? err.message : String(err)}`,
				{
					backend: "chromadb",
					operation: "initialize",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async upsert(chunks: IndexableChunk[]): Promise<void> {
		const collection = this.assertReady("upsert");

		if (chunks.length === 0) return;

		try {
			const ids: string[] = [];
			const embeddings: number[][] = [];
			const documents: string[] = [];
			const metadatas: Record<string, unknown>[] = [];

			for (const chunk of chunks) {
				ids.push(chunk.id);
				embeddings.push(chunk.embedding);
				documents.push(chunk.content);
				metadatas.push(chunk.metadata);
			}

			// ChromaDB metadata values must be string | number | boolean
			const sanitizedMetadatas = metadatas.map(sanitizeMetadata);

			await collection.upsert({ ids, embeddings, documents, metadatas: sanitizedMetadatas });
			logger.debug`Upserted ${chunks.length} chunks into "${this.storeConfig.collectionName}"`;
		} catch (err) {
			if (err instanceof ToolError) throw err;
			throw new ToolError(
				`ChromaDB upsert failed: ${err instanceof Error ? err.message : String(err)}`,
				{ backend: "chromadb", operation: "upsert", cause: err instanceof Error ? err : undefined },
			);
		}
	}

	async search(embedding: number[], topK: number): Promise<VectorSearchHit[]> {
		const collection = this.assertReady("search");

		try {
			const result = await collection.query({
				queryEmbeddings: [embedding],
				nResults: topK,
				include: ["distances"],
			});

			const ids = result.ids?.[0] ?? [];
			const distances = result.distances?.[0] ?? [];

			const hits: VectorSearchHit[] = [];
			for (let i = 0; i < ids.length; i++) {
				const id = ids[i];
				const distance = distances[i];
				if (id !== undefined && distance !== null && distance !== undefined) {
					// With cosine space, Chroma returns distance in [0, 2]; convert to score [0, 1]
					hits.push({ id, score: 1 - distance });
				}
			}

			return hits;
		} catch (err) {
			throw new ToolError(
				`ChromaDB search failed: ${err instanceof Error ? err.message : String(err)}`,
				{ backend: "chromadb", operation: "search", cause: err instanceof Error ? err : undefined },
			);
		}
	}

	async delete(ids: string[]): Promise<void> {
		const collection = this.assertReady("delete");

		if (ids.length === 0) return;

		try {
			await collection.delete({ ids });
			logger.debug`Deleted ${ids.length} chunks from "${this.storeConfig.collectionName}"`;
		} catch (err) {
			throw new ToolError(
				`ChromaDB delete failed: ${err instanceof Error ? err.message : String(err)}`,
				{ backend: "chromadb", operation: "delete", cause: err instanceof Error ? err : undefined },
			);
		}
	}

	async close(): Promise<void> {
		this.collection = null;
		this.client = null;
		logger.debug`ChromaDB backend closed for "${this.storeConfig.collectionName}"`;
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	private assertReady(operation: string): Collection {
		if (!this.collection) {
			throw new ToolError(`ChromaDBVectorBackend: call initialize() before ${operation}()`, {
				backend: "chromadb",
				operation,
			});
		}
		return this.collection;
	}
}

// ---------------------------------------------------------------------------
// Metadata sanitization
// ---------------------------------------------------------------------------

type ChromaMetadataValue = string | number | boolean;
type ChromaMetadata = Record<string, ChromaMetadataValue>;

function sanitizeMetadata(metadata: Record<string, unknown>): ChromaMetadata {
	const result: ChromaMetadata = {};
	for (const [key, value] of Object.entries(metadata)) {
		if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
			result[key] = value;
		} else if (value !== null && value !== undefined) {
			result[key] = JSON.stringify(value);
		}
		// null / undefined values are dropped — ChromaDB doesn't accept them
	}
	return result;
}
