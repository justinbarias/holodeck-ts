# Tasks — US1: Configure and Ingest Documents into a Vector Store

## User Story

As a user, I define a `hierarchical_document` tool in `agent.yaml` with a chosen database backend and source directory. The tool discovers files, chunks them, generates embeddings (optionally with contextual retrieval), and indexes both vectors and keywords into the configured backend.

**Depends on**: tasks-foundation.md (converters, chunker, embeddings, types, schemas)

---

## Tasks

### Backend Factory

- [ ] [T100] [US1] Create backend factory `src/tools/vectorstore/backends/factory.ts` — export `createBackends(config: DatabaseConfig, embeddingDims: number): { vector: VectorStoreBackend, keyword: KeywordSearchBackend }` that switches on `config.provider` to instantiate the correct backend pair; Redis/Postgres use shared single client connection, ChromaDB returns ChromaDB + OpenSearch pair, in-memory returns in-memory pair

### Backend Implementations

- [ ] [T101] [P] [US1] Implement `src/tools/vectorstore/backends/in-memory.ts` — `InMemoryVectorBackend` (Map-based storage, brute-force cosine similarity search, upsert/delete/search methods) + `InMemoryBM25Backend` (inverted index with BM25 scoring k1=1.2 b=0.75, whitespace tokenization, ~80 LOC)
- [ ] [T102] [P] [US1] Implement `src/tools/vectorstore/backends/redis.ts` — `RedisVectorBackend` + `RedisSearchBackend` using `redis` 5.11.0 with `@redis/search`; HNSW index with COSINE distance metric; `FT.CREATE` for index setup, `FT.SEARCH` for queries, `HSET` with `Buffer.from(Float32Array)` for vector storage; score = 1 - distance; include `connect()` and `disconnect()` lifecycle methods
- [ ] [T103] [P] [US1] Implement `src/tools/vectorstore/backends/postgres.ts` — `PostgresVectorBackend` + `PostgresFTSBackend` using `postgres` 3.4.8 + `pgvector` 0.2.1; tagged template SQL for query safety; `vector(N)` column with HNSW index for vectors, `tsvector GENERATED ALWAYS` column with GIN index for full-text search; score = 1 - distance for vectors, `ts_rank` for FTS; include table auto-creation in `initialize()`
- [ ] [T104] [P] [US1] Implement `src/tools/vectorstore/backends/chromadb.ts` — `ChromaDBVectorBackend` using `chromadb` 3.4.0; pre-computed embeddings passed directly (embeddingFunction: null); collection auto-creation; score = 1 - distance; include `connect()` and `disconnect()` lifecycle methods
- [ ] [T105] [P] [US1] Implement `src/tools/vectorstore/backends/opensearch.ts` — `OpenSearchBackend` implementing `KeywordSearchBackend` using `@opensearch-project/opensearch` 3.5.1; bulk indexing for upsert, `multi_match` BM25 query for search; score = `_score / max_score` normalization; index auto-creation with appropriate mappings in `initialize()`

### File Discovery

- [ ] [T106] [US1] Implement file discovery helper in `src/tools/vectorstore/discovery.ts` — export `discoverFiles(source: string): Promise<DiscoveredFile[]>` that globs the source path for supported extensions (.md, .txt, .html, .htm, .docx, .pdf), skips unsupported files with warning via structured logger (`src/lib/logger.ts`, per Constitution Principle VII), throws `ToolError` if no supported files found ("no documents found in {source}"), returns array with `{ path, extension, modifiedAt }` for each file

### Ingestion Pipeline Orchestrator

- [ ] [T107] [US1] Implement ingestion pipeline orchestrator in `src/tools/vectorstore/index.ts` — export `createVectorstoreServer(toolConfig: HierarchicalDocumentTool, embeddingProvider: EmbeddingProvider)` that creates backend instances via factory, orchestrates the full pipeline: discover files -> convert (via converters from foundation) -> chunk (via chunker from foundation) -> contextualize if `contextual_embeddings: true` -> embed -> upsert vectors -> index keywords; supports lazy initialization (first search triggers ingestion) using a `Promise`-based init guard
- [ ] [T108] [US1] Add incremental re-indexing support to `src/tools/vectorstore/index.ts` — track `file_modified_at` per indexed file (store in metadata); on re-ingestion, skip files whose `modifiedAt` has not changed; delete stale chunks for files that were removed from source directory; log skipped/updated/deleted file counts

### Tool Registration

- [ ] [T109] [US1] Implement Claude Agent SDK tool registration in `src/tools/vectorstore/tool.ts` — define tool with raw Zod shape input `{ query: z.string().min(1), top_k: z.number().optional(), search_mode: z.enum(["semantic","keyword","exact","hybrid"]).optional(), min_score: z.number().min(0).max(1).optional() }`; returns `CallToolResult` with JSON-stringified `SearchResponse`; set `isError: true` for failures, include `degraded` flag for partial failures; empty results are NOT errors (return `total_results: 0`); register via `createSdkMcpServer({ name: "holodeck_vectorstore", tools: [...] })`; allowed tools pattern: `mcp__holodeck_vectorstore__{tool.name}`

### Tests

- [ ] [T110] [P] [US1] Write unit tests in `tests/unit/tools/vectorstore/backends/in-memory.test.ts` — test InMemoryVectorBackend (upsert, search by cosine similarity, delete, empty store) and InMemoryBM25Backend (upsert, BM25 search ranking, delete, empty index)
- [ ] [T111] [P] [US1] Write unit tests in `tests/unit/tools/vectorstore/backends/factory.test.ts` — test factory returns correct backend pairs for each provider, test error on unknown provider
- [ ] [T112] [P] [US1] Write unit tests in `tests/unit/tools/vectorstore/discovery.test.ts` — test glob expansion, supported extension filtering, empty directory error, modifiedAt tracking
- [ ] [T113] [P] [US1] Write unit tests in `tests/unit/tools/vectorstore/index.test.ts` — test full ingestion pipeline with in-memory backends (mock embeddings), lazy init behavior, incremental re-indexing (unchanged files skipped, deleted files purged)
- [ ] [T114] [P] [US1] Write unit tests in `tests/unit/tools/vectorstore/tool.test.ts` — test tool input validation (empty query rejected, optional params), tool output format (SearchResponse JSON), error handling (isError flag), empty results handling
- [ ] [T115] [US1] Write integration tests in `tests/integration/tools/vectorstore/ingestion.test.ts` — end-to-end ingestion with in-memory backend using fixture markdown files from `tests/fixtures/docs/`, verify chunks are stored with correct heading hierarchy metadata, verify keyword index populated

---

## Dependency Graph

```
T100 (factory) ─────────────────────────┐
                                         │
T101 (in-memory) ──┐                     │
T102 (redis) ──────┤                     │
T103 (postgres) ───┼── all parallel ─────┤
T104 (chromadb) ───┤                     ├──▶ T107 (orchestrator) ──▶ T108 (incremental)
T105 (opensearch) ─┘                     │           │
                                         │           ▼
T106 (discovery) ────────────────────────┘    T109 (tool registration)
                                                     │
T110-T114 (unit tests) ── parallel ──────────────────┘
                                                     │
                                              T115 (integration test)
```

## Checkpoint

After US1 completion, a user can configure any backend (`in-memory`, `postgres`, `redis`, `chromadb`) in `agent.yaml`, point at a docs directory via `source`, and the tool ingests and indexes all supported documents. The tool is registered with the Claude Agent SDK and wired up for search invocation.
