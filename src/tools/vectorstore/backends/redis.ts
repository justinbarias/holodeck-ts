import type { SearchReply } from "@redis/search";
import { createClient } from "redis";
import { ToolError } from "../../../lib/errors.js";
import { getModuleLogger } from "../../../lib/logger.js";
import type {
	IndexableChunk,
	IndexableTextChunk,
	KeywordSearchBackend,
	KeywordSearchHit,
	VectorSearchHit,
	VectorStoreBackend,
} from "./types.js";

type RedisClient = ReturnType<typeof createClient>;

const logger = getModuleLogger("vectorstore.redis");

// Minimum Redis version that supports native hybrid vector search
const NATIVE_HYBRID_MIN_MAJOR = 8;
const NATIVE_HYBRID_MIN_MINOR = 4;

function parseRedisVersion(info: string): { major: number; minor: number; patch: number } {
	const match = /redis_version:(\d+)\.(\d+)\.(\d+)/.exec(info);
	if (!match) {
		return { major: 0, minor: 0, patch: 0 };
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
	};
}

function embeddingToBuffer(embedding: number[]): Buffer {
	const float32 = new Float32Array(embedding);
	return Buffer.from(float32.buffer);
}

// --------------------------------------------------------------------------
// RedisVectorBackend
// --------------------------------------------------------------------------

export interface RedisVectorConfig {
	readonly connectionString: string;
	readonly indexName: string;
	readonly dimensions: number;
	/** Key prefix used for HASH documents. Defaults to `indexName:` */
	readonly keyPrefix?: string;
}

/**
 * Vector store backend backed by Redis with RediSearch HNSW index and COSINE
 * distance metric.
 *
 * Lifecycle: call `initialize()` before use, `close()` when done.
 */
export class RedisVectorBackend implements VectorStoreBackend {
	private readonly config: RedisVectorConfig;
	private readonly prefix: string;
	private client: RedisClient | null = null;
	private nativeHybrid = false;

	constructor(config: RedisVectorConfig) {
		this.config = config;
		this.prefix = config.keyPrefix ?? `${config.indexName}:`;
	}

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------

	async connect(): Promise<void> {
		if (this.client !== null) return;

		const client = createClient({ url: this.config.connectionString });

		client.on("error", (err: unknown) => {
			logger.error`Redis client error: ${err}`;
		});

		try {
			await client.connect();
		} catch (err) {
			throw new ToolError(
				`Failed to connect to Redis at '${this.config.connectionString}'. ` +
					"Ensure Redis is running and the connection string is correct.",
				{ backend: "redis", operation: "connect", cause: err instanceof Error ? err : undefined },
			);
		}

		this.client = client;
	}

	async disconnect(): Promise<void> {
		if (this.client === null) return;
		try {
			await this.client.quit();
		} catch (err) {
			logger.warn`Redis disconnect error (ignored): ${err}`;
		} finally {
			this.client = null;
		}
	}

	/** Expose the underlying client for use by RedisSearchBackend. */
	getClient(): RedisClient {
		if (this.client === null) {
			throw new ToolError("RedisVectorBackend has not been initialized. Call initialize() first.", {
				backend: "redis",
				operation: "getClient",
			});
		}
		return this.client;
	}

	/**
	 * Returns true when the connected Redis version supports native hybrid
	 * vector + keyword search (Redis ≥ 8.4).
	 */
	supportsNativeHybrid(): boolean {
		return this.nativeHybrid;
	}

	// -----------------------------------------------------------------------
	// VectorStoreBackend interface
	// -----------------------------------------------------------------------

	async initialize(): Promise<void> {
		await this.connect();
		await this.detectVersion();
		await this.ensureIndex();
	}

	async upsert(chunks: IndexableChunk[]): Promise<void> {
		const client = this.getClient();
		if (chunks.length === 0) return;

		try {
			const pipeline = client.multi();
			for (const chunk of chunks) {
				const key = `${this.prefix}${chunk.id}`;
				const embeddingBuffer = embeddingToBuffer(chunk.embedding);
				const metaJson = JSON.stringify(chunk.metadata);

				pipeline.hSet(key, {
					id: chunk.id,
					content: chunk.content,
					embedding: embeddingBuffer,
					metadata: metaJson,
				});
			}
			await pipeline.exec();
		} catch (err) {
			throw new ToolError(
				`Redis upsert failed for ${chunks.length} chunk(s). ` +
					"Check your Redis connection and available memory.",
				{ backend: "redis", operation: "upsert", cause: err instanceof Error ? err : undefined },
			);
		}

		logger.debug`Upserted ${chunks.length} chunks into index '${this.config.indexName}'`;
	}

	async search(embedding: number[], topK: number): Promise<VectorSearchHit[]> {
		const client = this.getClient();
		const queryVec = embeddingToBuffer(embedding);

		const query = `*=>[KNN ${topK} @embedding $BLOB AS __score]`;

		let raw: SearchReply;
		try {
			raw = (await client.ft.search(this.config.indexName, query, {
				PARAMS: { BLOB: queryVec },
				SORTBY: { BY: "__score", DIRECTION: "ASC" },
				LIMIT: { from: 0, size: topK },
				DIALECT: 2,
			})) as SearchReply;
		} catch (err) {
			throw new ToolError(
				`Redis vector search failed on index '${this.config.indexName}'. ` +
					"Ensure RediSearch is loaded and the index has been initialized.",
				{ backend: "redis", operation: "search", cause: err instanceof Error ? err : undefined },
			);
		}

		return raw.documents.map((doc) => {
			const rawScore = Number(doc.value.__score ?? 1);
			// COSINE distance in RediSearch returns distance (0=identical, 2=opposite).
			// Convert to similarity score in [0, 1].
			const score = Math.max(0, Math.min(1, 1 - rawScore / 2));
			return { id: doc.id.slice(this.prefix.length), score };
		});
	}

	async delete(ids: string[]): Promise<void> {
		const client = this.getClient();
		if (ids.length === 0) return;

		try {
			const pipeline = client.multi();
			for (const id of ids) {
				pipeline.del(`${this.prefix}${id}`);
			}
			await pipeline.exec();
		} catch (err) {
			throw new ToolError(
				`Redis delete failed for ${ids.length} id(s). Check your Redis connection.`,
				{ backend: "redis", operation: "delete", cause: err instanceof Error ? err : undefined },
			);
		}
	}

	async close(): Promise<void> {
		await this.disconnect();
	}

	// -----------------------------------------------------------------------
	// Private helpers
	// -----------------------------------------------------------------------

	private async detectVersion(): Promise<void> {
		const client = this.getClient();
		try {
			const info = await client.info("server");
			const version = parseRedisVersion(info);
			this.nativeHybrid =
				version.major > NATIVE_HYBRID_MIN_MAJOR ||
				(version.major === NATIVE_HYBRID_MIN_MAJOR && version.minor >= NATIVE_HYBRID_MIN_MINOR);

			logger.debug`Redis version ${version.major}.${version.minor}.${version.patch} detected; ` +
				`nativeHybrid=${this.nativeHybrid}`;
		} catch (err) {
			// Non-fatal — fall back to no native hybrid support
			logger.warn`Could not detect Redis version (defaulting to nativeHybrid=false): ${err}`;
			this.nativeHybrid = false;
		}
	}

	private async ensureIndex(): Promise<void> {
		const client = this.getClient();

		// Check whether the index already exists
		try {
			await client.ft.info(this.config.indexName);
			logger.debug`RediSearch index '${this.config.indexName}' already exists; skipping creation`;
			return;
		} catch {
			// Index does not exist — create it
		}

		try {
			await client.ft.create(
				this.config.indexName,
				{
					id: { type: "TEXT", AS: "id" },
					content: { type: "TEXT", AS: "content" },
					embedding: {
						type: "VECTOR",
						ALGORITHM: "HNSW",
						TYPE: "FLOAT32",
						DIM: this.config.dimensions,
						DISTANCE_METRIC: "COSINE",
						AS: "embedding",
					},
				},
				{
					ON: "HASH",
					PREFIX: this.prefix,
				},
			);
			logger.debug`Created RediSearch HNSW index '${this.config.indexName}' ` +
				`(dim=${this.config.dimensions}, metric=COSINE, prefix='${this.prefix}')`;
		} catch (err) {
			throw new ToolError(
				`Failed to create RediSearch index '${this.config.indexName}'. ` +
					"Ensure the RediSearch module is loaded on your Redis server.",
				{
					backend: "redis",
					operation: "initialize",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}
}

// --------------------------------------------------------------------------
// RedisSearchBackend
// --------------------------------------------------------------------------

export interface RedisSearchConfig {
	readonly indexName: string;
	/** Key prefix used for HASH documents. Defaults to `indexName:` */
	readonly keyPrefix?: string;
}

/**
 * Full-text keyword search backend backed by RediSearch FT.SEARCH.
 *
 * Shares a Redis client with {@link RedisVectorBackend} — pass the vector
 * backend's client via {@link RedisVectorBackend.getClient}.
 */
export class RedisSearchBackend implements KeywordSearchBackend {
	private readonly config: RedisSearchConfig;
	private readonly prefix: string;
	private readonly client: RedisClient;

	constructor(client: RedisClient, config: RedisSearchConfig) {
		this.client = client;
		this.config = config;
		this.prefix = config.keyPrefix ?? `${config.indexName}:`;
	}

	// -----------------------------------------------------------------------
	// KeywordSearchBackend interface
	// -----------------------------------------------------------------------

	async initialize(): Promise<void> {
		await this.ensureIndex();
	}

	async index(chunks: IndexableTextChunk[]): Promise<void> {
		if (chunks.length === 0) return;

		try {
			const pipeline = this.client.multi();
			for (const chunk of chunks) {
				const key = `${this.prefix}${chunk.id}`;
				const metaJson = JSON.stringify(chunk.metadata);
				pipeline.hSet(key, {
					id: chunk.id,
					content: chunk.content,
					metadata: metaJson,
				});
			}
			await pipeline.exec();
		} catch (err) {
			throw new ToolError(
				`Redis keyword index failed for ${chunks.length} chunk(s). ` +
					"Check your Redis connection and available memory.",
				{
					backend: "redis-search",
					operation: "index",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}

		logger.debug`Indexed ${chunks.length} chunks in RediSearch index '${this.config.indexName}'`;
	}

	async search(query: string, topK: number): Promise<KeywordSearchHit[]> {
		let raw: SearchReply;

		try {
			raw = (await this.client.ft.search(this.config.indexName, query, {
				LIMIT: { from: 0, size: topK },
				RETURN: ["id", "__score"],
				SCORER: "BM25",
			})) as SearchReply;
		} catch (err) {
			throw new ToolError(
				`Redis keyword search failed on index '${this.config.indexName}'. ` +
					"Ensure RediSearch is loaded and the index has been initialized.",
				{
					backend: "redis-search",
					operation: "search",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}

		if (raw.documents.length === 0) return [];

		// Normalize scores: divide each score by the maximum score so the best
		// match is 1.0 and all others are proportionally lower.
		const rawScores = raw.documents.map((doc) => Number(doc.value.__score ?? 0));
		const maxScore = Math.max(...rawScores, Number.EPSILON);

		return raw.documents.map((doc, i) => ({
			id: doc.id.slice(this.prefix.length),
			score: (rawScores[i] ?? 0) / maxScore,
		}));
	}

	async delete(ids: string[]): Promise<void> {
		if (ids.length === 0) return;

		try {
			const pipeline = this.client.multi();
			for (const id of ids) {
				pipeline.del(`${this.prefix}${id}`);
			}
			await pipeline.exec();
		} catch (err) {
			throw new ToolError(
				`Redis keyword delete failed for ${ids.length} id(s). Check your Redis connection.`,
				{
					backend: "redis-search",
					operation: "delete",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async close(): Promise<void> {
		// Client lifecycle is owned by RedisVectorBackend; nothing to close here.
	}

	// -----------------------------------------------------------------------
	// Private helpers
	// -----------------------------------------------------------------------

	private async ensureIndex(): Promise<void> {
		try {
			await this.client.ft.info(this.config.indexName);
			logger.debug`RediSearch text index '${this.config.indexName}' already exists; skipping creation`;
			return;
		} catch {
			// Index does not exist — create it
		}

		try {
			await this.client.ft.create(
				this.config.indexName,
				{
					id: { type: "TEXT", AS: "id" },
					content: { type: "TEXT", AS: "content" },
				},
				{
					ON: "HASH",
					PREFIX: this.prefix,
				},
			);
			logger.debug`Created RediSearch text index '${this.config.indexName}' (prefix='${this.prefix}')`;
		} catch (err) {
			throw new ToolError(
				`Failed to create RediSearch text index '${this.config.indexName}'. ` +
					"Ensure the RediSearch module is loaded on your Redis server.",
				{
					backend: "redis-search",
					operation: "initialize",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}
}
