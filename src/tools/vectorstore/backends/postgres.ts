import { toSql } from "pgvector";
import postgres from "postgres";
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

const logger = getModuleLogger("vectorstore.postgres");

// ---------------------------------------------------------------------------
// Shared row shapes returned by postgres tagged-template queries
// ---------------------------------------------------------------------------

interface VectorRow {
	id: string;
	distance: string; // postgres returns numeric as string
}

interface FtsRow {
	id: string;
	rank: string; // ts_rank returns float4, comes as string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PostgresVectorConfig {
	readonly connectionString: string;
	readonly tableName: string;
	readonly dimensions: number;
}

export interface PostgresFTSConfig {
	readonly tableName: string;
}

// ---------------------------------------------------------------------------
// PostgresVectorBackend
// ---------------------------------------------------------------------------

/**
 * Vector search backend backed by Postgres + pgvector.
 *
 * - Stores embeddings in a `vector(N)` column.
 * - HNSW index for approximate nearest-neighbor search.
 * - Score = 1 - cosine_distance (higher is better).
 * - Call `getClient()` to share the underlying `postgres` connection with
 *   {@link PostgresFTSBackend} so only one connection pool is opened.
 */
export class PostgresVectorBackend implements VectorStoreBackend {
	private readonly config: PostgresVectorConfig;
	private readonly sql: postgres.Sql;

	constructor(config: PostgresVectorConfig) {
		this.config = config;
		this.sql = postgres(config.connectionString, {
			max: 5,
			idle_timeout: 30,
			connect_timeout: 10,
		});
	}

	/**
	 * Expose the underlying postgres client so a {@link PostgresFTSBackend}
	 * can share it without opening a second connection pool.
	 */
	getClient(): postgres.Sql {
		return this.sql;
	}

	async initialize(): Promise<void> {
		const { tableName, dimensions } = this.config;
		logger.info`Initializing Postgres vector backend (table=${tableName}, dimensions=${dimensions})`;
		try {
			// Enable pgvector extension
			await this.sql`CREATE EXTENSION IF NOT EXISTS vector`;

			// Create the table. The tsvector GENERATED ALWAYS column is
			// added by PostgresFTSBackend.initialize() when sharing this table;
			// here we only ensure the base schema exists.
			await this.sql`
				CREATE TABLE IF NOT EXISTS ${this.sql(tableName)} (
					id TEXT PRIMARY KEY,
					content TEXT NOT NULL,
					metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
					embedding vector(${this.sql.unsafe(String(dimensions))})
				)
			`;

			// HNSW index for fast approximate nearest-neighbor search
			const indexName = `${tableName}_embedding_hnsw_idx`;
			await this.sql`
				CREATE INDEX IF NOT EXISTS ${this.sql(indexName)}
				ON ${this.sql(tableName)}
				USING hnsw (embedding vector_cosine_ops)
			`;

			logger.info`Postgres vector backend initialized`;
		} catch (err) {
			throw new ToolError(
				`Failed to initialize Postgres vector backend for table '${tableName}': ${err instanceof Error ? err.message : String(err)}`,
				{
					backend: "postgres-vector",
					operation: "initialize",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async upsert(chunks: IndexableChunk[]): Promise<void> {
		if (chunks.length === 0) return;
		const { tableName } = this.config;
		logger.debug`Upserting ${chunks.length} chunks into ${tableName}`;
		try {
			// Build rows as plain objects; postgres will serialize them
			const rows = chunks.map((c) => ({
				id: c.id,
				content: c.content,
				metadata: JSON.stringify(c.metadata),
				embedding: toSql(c.embedding) as string,
			}));

			// Upsert via INSERT … ON CONFLICT DO UPDATE
			for (const row of rows) {
				await this.sql`
					INSERT INTO ${this.sql(tableName)} (id, content, metadata, embedding)
					VALUES (
						${row.id},
						${row.content},
						${row.metadata}::jsonb,
						${row.embedding}::vector
					)
					ON CONFLICT (id) DO UPDATE SET
						content  = EXCLUDED.content,
						metadata = EXCLUDED.metadata,
						embedding = EXCLUDED.embedding
				`;
			}
		} catch (err) {
			throw new ToolError(
				`Failed to upsert chunks into '${tableName}': ${err instanceof Error ? err.message : String(err)}`,
				{
					backend: "postgres-vector",
					operation: "upsert",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async search(embedding: number[], topK: number): Promise<VectorSearchHit[]> {
		const { tableName } = this.config;
		logger.debug`Vector search in ${tableName} (topK=${topK})`;
		try {
			const vectorStr = toSql(embedding) as string;

			const rows = await this.sql<VectorRow[]>`
				SELECT id, (embedding <=> ${vectorStr}::vector) AS distance
				FROM ${this.sql(tableName)}
				ORDER BY distance ASC
				LIMIT ${topK}
			`;

			return rows.map((r) => ({
				id: r.id,
				score: 1 - Number(r.distance),
			}));
		} catch (err) {
			throw new ToolError(
				`Vector search failed on table '${tableName}': ${err instanceof Error ? err.message : String(err)}`,
				{
					backend: "postgres-vector",
					operation: "search",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async delete(ids: string[]): Promise<void> {
		if (ids.length === 0) return;
		const { tableName } = this.config;
		logger.debug`Deleting ${ids.length} chunks from ${tableName}`;
		try {
			await this.sql`
				DELETE FROM ${this.sql(tableName)}
				WHERE id = ANY(${ids}::text[])
			`;
		} catch (err) {
			throw new ToolError(
				`Failed to delete chunks from '${tableName}': ${err instanceof Error ? err.message : String(err)}`,
				{
					backend: "postgres-vector",
					operation: "delete",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async close(): Promise<void> {
		logger.debug`Closing Postgres vector backend connection`;
		await this.sql.end();
	}
}

// ---------------------------------------------------------------------------
// PostgresFTSBackend
// ---------------------------------------------------------------------------

/**
 * Full-text search backend backed by Postgres tsvector / GIN index.
 *
 * Shares the same table as {@link PostgresVectorBackend} — the
 * `ts_content` column is a `GENERATED ALWAYS` tsvector derived from the
 * `content` column.  If the vector backend's table already exists (with the
 * base schema), this backend simply adds the generated column and GIN index
 * when they are absent.
 *
 * Scoring: `ts_rank` normalized to [0, 1] by dividing by the maximum rank
 * across the result set.
 */
export class PostgresFTSBackend implements KeywordSearchBackend {
	private readonly sql: postgres.Sql;
	private readonly tableName: string;
	private readonly ownsSql: boolean;

	/**
	 * @param tableName  — Same table name used by {@link PostgresVectorBackend}.
	 * @param client     — Supply the result of `vectorBackend.getClient()` to
	 *                     share the connection, OR pass a connection string to
	 *                     open a new pool.
	 */
	constructor(tableName: string, client: postgres.Sql | string) {
		this.tableName = tableName;
		if (typeof client === "string") {
			this.sql = postgres(client, {
				max: 5,
				idle_timeout: 30,
				connect_timeout: 10,
			});
			this.ownsSql = true;
		} else {
			this.sql = client;
			this.ownsSql = false;
		}
	}

	async initialize(): Promise<void> {
		const { tableName } = this;
		logger.info`Initializing Postgres FTS backend (table=${tableName})`;
		try {
			// Add the generated tsvector column if it doesn't already exist.
			// `IF NOT EXISTS` for ADD COLUMN is available in Postgres 9.6+.
			await this.sql`
				ALTER TABLE ${this.sql(tableName)}
				ADD COLUMN IF NOT EXISTS ts_content tsvector
					GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
			`;

			// GIN index for fast full-text search
			const indexName = `${tableName}_ts_content_gin_idx`;
			await this.sql`
				CREATE INDEX IF NOT EXISTS ${this.sql(indexName)}
				ON ${this.sql(tableName)}
				USING gin(ts_content)
			`;

			logger.info`Postgres FTS backend initialized`;
		} catch (err) {
			throw new ToolError(
				`Failed to initialize Postgres FTS backend for table '${tableName}': ${err instanceof Error ? err.message : String(err)}`,
				{
					backend: "postgres-fts",
					operation: "initialize",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async index(chunks: IndexableTextChunk[]): Promise<void> {
		if (chunks.length === 0) return;
		const { tableName } = this;
		logger.debug`Indexing ${chunks.length} text chunks into ${tableName}`;
		try {
			// The tsvector column is GENERATED ALWAYS so we only need the
			// base columns; the FTS column is computed automatically.
			for (const chunk of chunks) {
				await this.sql`
					INSERT INTO ${this.sql(tableName)} (id, content, metadata, embedding)
					VALUES (
						${chunk.id},
						${chunk.content},
						${JSON.stringify(chunk.metadata)}::jsonb,
						NULL::vector
					)
					ON CONFLICT (id) DO UPDATE SET
						content  = EXCLUDED.content,
						metadata = EXCLUDED.metadata
				`;
			}
		} catch (err) {
			throw new ToolError(
				`Failed to index text chunks into '${tableName}': ${err instanceof Error ? err.message : String(err)}`,
				{
					backend: "postgres-fts",
					operation: "index",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async search(query: string, topK: number): Promise<KeywordSearchHit[]> {
		const { tableName } = this;
		logger.debug`FTS search in ${tableName} (topK=${topK})`;
		try {
			const rows = await this.sql<FtsRow[]>`
				SELECT id, ts_rank(ts_content, plainto_tsquery('english', ${query})) AS rank
				FROM ${this.sql(tableName)}
				WHERE ts_content @@ plainto_tsquery('english', ${query})
				ORDER BY rank DESC
				LIMIT ${topK}
			`;

			if (rows.length === 0) return [];

			// Normalize scores to [0, 1] by dividing by the max rank
			const maxRank = Math.max(...rows.map((r) => Number(r.rank)));
			const normalizer = maxRank > 0 ? maxRank : 1;

			return rows.map((r) => ({
				id: r.id,
				score: Number(r.rank) / normalizer,
			}));
		} catch (err) {
			throw new ToolError(
				`FTS search failed on table '${tableName}': ${err instanceof Error ? err.message : String(err)}`,
				{
					backend: "postgres-fts",
					operation: "search",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async delete(ids: string[]): Promise<void> {
		if (ids.length === 0) return;
		const { tableName } = this;
		logger.debug`Deleting ${ids.length} chunks from ${tableName} (FTS)`;
		try {
			await this.sql`
				DELETE FROM ${this.sql(tableName)}
				WHERE id = ANY(${ids}::text[])
			`;
		} catch (err) {
			throw new ToolError(
				`Failed to delete chunks from '${tableName}' (FTS): ${err instanceof Error ? err.message : String(err)}`,
				{
					backend: "postgres-fts",
					operation: "delete",
					cause: err instanceof Error ? err : undefined,
				},
			);
		}
	}

	async close(): Promise<void> {
		if (this.ownsSql) {
			logger.debug`Closing Postgres FTS backend connection`;
			await this.sql.end();
		}
		// If the sql client is shared with the vector backend, let that
		// backend's close() call end the connection.
	}
}
