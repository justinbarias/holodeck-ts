import type { Database, KeywordSearchConfig } from "../../../config/schema.js";
import { ToolError } from "../../../lib/errors.js";
import { ChromaDBVectorBackend } from "./chromadb.js";
import { InMemoryBM25Backend, InMemoryVectorBackend } from "./in-memory.js";
import { OpenSearchBackend } from "./opensearch.js";
import { PostgresFTSBackend, PostgresVectorBackend } from "./postgres.js";
import { RedisSearchBackend, RedisVectorBackend } from "./redis.js";
import type {
	ExactMatchHit,
	IndexableDocument,
	KeywordSearchBackend,
	KeywordSearchHit,
	VectorStoreBackend,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BackendPair {
	readonly vector: VectorStoreBackend;
	readonly keyword: KeywordSearchBackend;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * A `KeywordSearchBackend` wrapper for Redis that defers construction of the
 * real `RedisSearchBackend` until `initialize()` is called.  This is
 * necessary because `RedisVectorBackend.getClient()` throws before the vector
 * backend has been connected (i.e., before its own `initialize()` completes).
 *
 * Callers must invoke `vector.initialize()` before `keyword.initialize()`.
 */
class DeferredRedisSearchBackend implements KeywordSearchBackend {
	private readonly vectorBackend: RedisVectorBackend;
	private readonly indexName: string;
	private inner: RedisSearchBackend | null = null;

	constructor(vectorBackend: RedisVectorBackend, indexName: string) {
		this.vectorBackend = vectorBackend;
		this.indexName = indexName;
	}

	async initialize(): Promise<void> {
		this.inner = new RedisSearchBackend(this.vectorBackend.getClient(), {
			indexName: this.indexName,
		});
		await this.inner.initialize();
	}

	private assertReady(): RedisSearchBackend {
		if (!this.inner) {
			throw new ToolError(
				"DeferredRedisSearchBackend: call initialize() before use. " +
					"Ensure vector.initialize() is called first.",
				{ backend: "redis-search", operation: "assertReady" },
			);
		}
		return this.inner;
	}

	async index(docs: IndexableDocument[]): Promise<void> {
		return this.assertReady().index(docs);
	}

	async search(query: string, topK: number): Promise<KeywordSearchHit[]> {
		return this.assertReady().search(query, topK);
	}

	async exactMatch(query: string, topK: number): Promise<ExactMatchHit[]> {
		return this.assertReady().exactMatch(query, topK);
	}

	async delete(ids: string[]): Promise<void> {
		return this.assertReady().delete(ids);
	}

	async close(): Promise<void> {
		if (this.inner) {
			await this.inner.close();
			this.inner = null;
		}
	}
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Instantiate the correct vector + keyword backend pair for a given database
 * provider.
 *
 * @param database      - Parsed `Database` config from the agent YAML.
 * @param embeddingDims - Embedding dimension reported by the embedding provider.
 * @param toolName      - Tool name used to derive collection / index / table names.
 * @param keywordSearch - Optional external keyword search config (required for ChromaDB).
 */
export function createBackends(
	database: Database,
	embeddingDims: number,
	toolName: string,
	keywordSearch?: KeywordSearchConfig,
): BackendPair {
	const collectionName = `holodeck_${toolName}`;

	switch (database.provider) {
		case "in-memory": {
			const vector = new InMemoryVectorBackend({
				dimensions: embeddingDims,
				collectionName,
			});
			const keyword = new InMemoryBM25Backend({ indexName: collectionName });
			return { vector, keyword };
		}

		case "redis": {
			const vector = new RedisVectorBackend({
				connectionString: database.connection_string,
				indexName: collectionName,
				dimensions: embeddingDims,
			});
			// RedisSearchBackend shares the client owned by RedisVectorBackend.
			// The client isn't available until vector.initialize() completes, so we
			// defer construction via DeferredRedisSearchBackend.
			const keyword = new DeferredRedisSearchBackend(vector, collectionName);
			return { vector, keyword };
		}

		case "postgres": {
			const vector = new PostgresVectorBackend({
				connectionString: database.connection_string,
				tableName: collectionName,
				dimensions: embeddingDims,
			});
			// PostgresVectorBackend opens its pool eagerly in the constructor, so
			// getClient() is always safe to call here.
			const keyword = new PostgresFTSBackend(collectionName, vector.getClient());
			return { vector, keyword };
		}

		case "chromadb": {
			if (!keywordSearch) {
				throw new ToolError(
					"ChromaDB vector backend requires an external keyword search provider. " +
						"Add a `keyword_search` config with provider 'opensearch' to your agent YAML.",
					{ backend: "chromadb", operation: "createBackends" },
				);
			}
			const vector = new ChromaDBVectorBackend(
				{ dimensions: embeddingDims, collectionName },
				{ connectionString: database.connection_string },
			);
			const keyword = new OpenSearchBackend({
				url: keywordSearch.url,
				indexName: collectionName,
				headers: keywordSearch.headers,
				requestTimeoutMs: keywordSearch.request_timeout * 1000,
			});
			return { vector, keyword };
		}
	}
}
