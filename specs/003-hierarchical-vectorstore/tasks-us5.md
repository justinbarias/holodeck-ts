# Tasks — US5: Multiple Backend Support with Unified Interface

## Connection Error Handling

- [ ] [T500] [US5] Enhance `initialize()` in `src/tools/vectorstore/backends/redis.ts` to catch connection failures and throw ToolError with backend name "redis", operation "initialize", attempted endpoint from connection string, and guidance "Check that Redis is running and RediSearch module is loaded"
- [ ] [T501] [US5] Enhance `initialize()` in `src/tools/vectorstore/backends/postgres.ts` to catch connection failures and throw ToolError with backend name "postgres", operation "initialize", redacted connection string (mask password), and guidance "Check that PostgreSQL is running with pgvector and pg_trgm extensions enabled"
- [ ] [T502] [US5] Enhance `initialize()` in `src/tools/vectorstore/backends/chromadb.ts` to catch connection failures and throw ToolError with backend name "chromadb", operation "initialize", attempted endpoint, and guidance "Check that ChromaDB server is running and accessible"
- [ ] [T503] [US5] Enhance `initialize()` in `src/tools/vectorstore/backends/opensearch.ts` to catch connection failures and throw ToolError with backend name "opensearch", operation "initialize", attempted endpoint, and guidance "Check that OpenSearch is running and accessible"
- [ ] [T504] [P] [US5] Add unit tests in `tests/unit/tools/vectorstore/backends/redis.test.ts` verifying ToolError includes backend name, operation, endpoint, and actionable guidance on connection failure
- [ ] [T505] [P] [US5] Add unit tests in `tests/unit/tools/vectorstore/backends/postgres.test.ts` verifying ToolError includes backend name, operation, redacted connection string, and actionable guidance on connection failure
- [ ] [T506] [P] [US5] Add unit tests in `tests/unit/tools/vectorstore/backends/chromadb.test.ts` verifying ToolError includes backend name, operation, endpoint, and actionable guidance on connection failure
- [ ] [T507] [P] [US5] Add unit tests in `tests/unit/tools/vectorstore/backends/opensearch.test.ts` verifying ToolError includes backend name, operation, endpoint, and actionable guidance on connection failure

## Result Structure Normalization

- [ ] [T508] [US5] Add score normalization in `src/tools/vectorstore/backends/redis.ts` — convert Redis distance to similarity via `1 - distance`, clamp to 0.0-1.0 range, ensure all SearchResult fields populated (content, score, source, breadcrumb, section_id, chunk_index, is_exact_match)
- [ ] [T509] [US5] Add score normalization in `src/tools/vectorstore/backends/postgres.ts` — convert pgvector distance to similarity via `1 - distance`, clamp to 0.0-1.0 range, ensure all SearchResult fields populated
- [ ] [T510] [US5] Add score normalization in `src/tools/vectorstore/backends/chromadb.ts` — convert ChromaDB distance to similarity via `1 - distance`, clamp to 0.0-1.0 range, ensure all SearchResult fields populated
- [ ] [T511] [US5] Verify in-memory backends in `src/tools/vectorstore/backends/in-memory.ts` already return direct cosine similarity in 0.0-1.0 range with all SearchResult fields populated; fix if not
- [ ] [T512] [US5] Add score normalization for keyword results in `src/tools/vectorstore/backends/redis.ts` (RedisSearchBackend) — normalize RediSearch TF-IDF scores to 0.0-1.0 via min-max normalization within result set
- [ ] [T513] [US5] Add score normalization for keyword results in `src/tools/vectorstore/backends/postgres.ts` (PostgresFTSBackend) — normalize ts_rank scores to 0.0-1.0 via min-max normalization within result set
- [ ] [T514] [US5] Add score normalization for keyword results in `src/tools/vectorstore/backends/opensearch.ts` (OpenSearchBackend) — normalize BM25 scores to 0.0-1.0 via min-max normalization within result set
- [ ] [T515] [P] [US5] Add unit tests in `tests/unit/tools/vectorstore/backends/score-normalization.test.ts` verifying each backend produces scores in 0.0-1.0 range and all SearchResult fields are present with correct types

## Backend Switching Validation

- [ ] [T516] [US5] Verify backend factory in `src/tools/vectorstore/backends/factory.ts` creates correct vector+keyword backend pair based solely on `database.provider` config value, requiring no code changes to switch backends
- [ ] [T517] [US5] Verify tool registration in `src/tools/vectorstore/tool.ts` is backend-agnostic — same tool name, description, and input schema regardless of which backend is configured
- [ ] [T518] [US5] Verify search interface in `src/tools/vectorstore/search.ts` calls only VectorBackend and KeywordBackend interface methods, never backend-specific APIs, ensuring identical search behavior across backends
- [ ] [T519] [P] [US5] Add unit tests in `tests/unit/tools/vectorstore/backend-switching.test.ts` verifying that changing only `database.provider` and `database.connection_string` in config produces a working vectorstore with unchanged tool interface and result format

## Cross-Backend Integration Tests

- [ ] [T520] [US5] Create `tests/integration/vectorstore-cross-backend.test.ts` with shared test fixtures: sample markdown documents and test queries to use across all backends
- [ ] [T521] [US5] Add integration test in `tests/integration/vectorstore-cross-backend.test.ts` — ingest identical documents into in-memory backend, run standard queries, capture result structure as baseline
- [ ] [T522] [US5] Add integration test in `tests/integration/vectorstore-cross-backend.test.ts` — ingest identical documents into Redis backend, run same queries, verify result structure matches baseline (same fields, same types)
- [ ] [T523] [US5] Add integration test in `tests/integration/vectorstore-cross-backend.test.ts` — ingest identical documents into Postgres backend, run same queries, verify result structure matches baseline
- [ ] [T524] [US5] Add integration test in `tests/integration/vectorstore-cross-backend.test.ts` — ingest identical documents into ChromaDB+OpenSearch backend, run same queries, verify result structure matches baseline
- [ ] [T525] [US5] Add integration test in `tests/integration/vectorstore-cross-backend.test.ts` — compare top-3 results across all backends for simple queries, verify comparable relevance (same documents in top-3, order may vary)

## Connection Lifecycle

- [ ] [T526] [US5] Verify `close()` in `src/tools/vectorstore/backends/redis.ts` disconnects the Redis client and handles already-disconnected state gracefully
- [ ] [T527] [US5] Verify `close()` in `src/tools/vectorstore/backends/postgres.ts` ends the connection pool and handles already-closed state gracefully
- [ ] [T528] [US5] Verify `close()` in `src/tools/vectorstore/backends/chromadb.ts` is a no-op (HTTP client, no persistent connection) and documents why
- [ ] [T529] [US5] Verify `close()` in `src/tools/vectorstore/backends/opensearch.ts` closes the OpenSearch client and handles already-closed state gracefully
- [ ] [T530] [US5] Verify `close()` in `src/tools/vectorstore/backends/in-memory.ts` clears all internal maps and arrays to free memory
- [ ] [T531] [P] [US5] Add unit tests in `tests/unit/tools/vectorstore/backends/lifecycle.test.ts` verifying `close()` for each backend is idempotent (can be called multiple times without error) and releases resources

## Checkpoint

- [ ] [T532] [US5] Validate US5 acceptance: switch between all 4 backends (in-memory, redis, postgres, chromadb) by changing only `database` config — identical search interface, identical result structure, clear connection errors, proper lifecycle cleanup
