# Contract: Hierarchical Document Vector Store — Backend Interfaces

**Feature Branch**: `003-hierarchical-vectorstore`
**Date**: 2026-04-01

## Overview

All storage backends implement two interfaces: `VectorStoreBackend` for embedding storage/retrieval and `KeywordSearchBackend` for full-text/BM25 search. Some backends (Redis, Postgres) implement both through a single connection; ChromaDB requires a separate OpenSearch connection for keyword search.

## VectorStoreBackend Interface

```typescript
interface VectorStoreBackend {
  /** Create indexes/collections, verify connectivity */
  initialize(config: VectorStoreConfig): Promise<void>;

  /** Insert or update chunks with embeddings. Idempotent on chunk ID. */
  upsert(chunks: IndexableChunk[]): Promise<void>;

  /** Vector similarity search. Returns top-K hits sorted by descending similarity. */
  search(embedding: number[], topK: number): Promise<VectorSearchHit[]>;

  /** Remove chunks by ID */
  delete(ids: string[]): Promise<void>;

  /** Gracefully close connections */
  close(): Promise<void>;
}

interface VectorStoreConfig {
  dimensions: number;
  distanceMetric: "cosine" | "l2" | "ip";
  indexName: string;
}

interface IndexableChunk {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, string | number | boolean>;
}

interface VectorSearchHit {
  id: string;
  /** Similarity score normalized to 0.0-1.0 (higher = more similar) */
  score: number;
}
```

### Implementation Notes by Backend

| Backend | Vector Storage | Distance Operator | Index Type |
|---|---|---|---|
| In-memory | `Map<string, { embedding: number[], metadata }>` | Cosine similarity (manual) | Brute-force scan |
| Redis | `HSET` with `VECTOR` field | `FT.SEARCH` KNN with COSINE | HNSW via RediSearch |
| Postgres | `vector(N)` column via pgvector | `<=>` (cosine) / `<->` (L2) | HNSW via `CREATE INDEX ... USING hnsw` |
| ChromaDB | `collection.add({ embeddings })` | Cosine distance (1 - similarity) | HNSW (ChromaDB native) |

**Score normalization:**
- Redis KNN returns distance (0 = identical for cosine); convert: `score = 1 - distance`
- Postgres `<=>` returns distance; convert: `score = 1 - distance`
- ChromaDB returns distance; convert: `score = 1 - distance`
- In-memory computes cosine similarity directly (already 0-1)

## KeywordSearchBackend Interface

```typescript
interface KeywordSearchBackend {
  /** Create text indexes/mappings, verify connectivity */
  initialize(config: KeywordSearchConfig): Promise<void>;

  /** Index chunks for full-text search */
  index(chunks: IndexableTextChunk[]): Promise<void>;

  /** BM25/full-text search. Returns hits sorted by descending relevance. */
  search(query: string, topK: number): Promise<KeywordSearchHit[]>;

  /** Remove entries by ID */
  delete(ids: string[]): Promise<void>;

  /** Gracefully close connections */
  close(): Promise<void>;
}

interface KeywordSearchConfig {
  indexName: string;
  analyzer?: string;
}

interface IndexableTextChunk {
  id: string;
  content: string;
  title?: string;
  metadata: Record<string, string | number | boolean>;
}

interface KeywordSearchHit {
  id: string;
  /** BM25/relevance score normalized to 0.0-1.0 */
  score: number;
}
```

### Implementation Notes by Backend

| Backend | Text Storage | Search Method | Score Normalization |
|---|---|---|---|
| In-memory | Inverted index (`Map<string, Set<string>>`) | BM25 (k1=1.2, b=0.75) | Divide by max score in result set |
| Redis | `TEXT` field in RediSearch schema | `FT.SEARCH @content:(query)` | Divide by max score in result set |
| Postgres | `tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED` + GIN index | `WHERE search_vector @@ websearch_to_tsquery(...)` with `ts_rank()` | Divide by max score in result set |
| OpenSearch | `text` field with standard analyzer | `multi_match` query, BM25 scoring | `_score / max_score` (OpenSearch provides `max_score`) |

## Backend Pairing

Backends are created via a factory function based on the `database.provider` config:

```typescript
function createBackends(config: DatabaseConfig, keywordConfig?: KeywordSearchConfig): {
  vector: VectorStoreBackend;
  keyword: KeywordSearchBackend;
}
```

| `database.provider` | Vector | Keyword | Connection Sharing |
|---|---|---|---|
| `in-memory` | `InMemoryVectorBackend` | `InMemoryBM25Backend` | N/A (no external connections) |
| `redis` | `RedisVectorBackend` | `RedisSearchBackend` | Single `redis` client instance |
| `postgres` | `PostgresVectorBackend` | `PostgresFTSBackend` | Single `postgres` sql instance |
| `chromadb` | `ChromaDBVectorBackend` | `OpenSearchBackend` | Two separate connections |

For Redis and Postgres, the vector and keyword backends share the same client connection to minimize resource usage. The factory creates the client once and passes it to both backend constructors.

## Error Contract

All backend methods throw `ToolError` (extends `HoloDeckError`) on failure:

```typescript
class ToolError extends HoloDeckError {
  constructor(
    message: string,
    public readonly backend: string,   // "redis" | "postgres" | "chromadb" | "opensearch" | "in-memory"
    public readonly operation: string,  // "initialize" | "upsert" | "search" | "delete" | "close"
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ToolError";
  }
}
```

Error messages must include:
1. The failing backend name
2. The operation that failed
3. Actionable guidance (e.g., "Check that RediSearch module is loaded", "Verify pgvector extension is installed")
