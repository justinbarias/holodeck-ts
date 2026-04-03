# Tasks: US6 — In-Memory Backend for Development and Testing

**User Story 6**: User configures `database.provider: in-memory` (or omits `database` entirely — it's the default). All vectors and keyword data stored in memory. No external dependencies. Easy to get started and run automated tests.

**Depends on**: tasks-foundation.md (types) + US1 (InMemoryVectorBackend + InMemoryBM25Backend already implemented) + US2 (search works)

---

## Default Config Behavior

- [ ] [T600] [US6] Implement default backend creation in `src/tools/vectorstore/backends/factory.ts` — when `database` config is `undefined` or omitted, return `{ vector: new InMemoryVectorBackend(), bm25: new InMemoryBM25Backend() }`
- [ ] [T601] [US6] Handle explicit `database.provider: "in-memory"` in `src/tools/vectorstore/backends/factory.ts` — same codepath as omitted config, no `connection_string` required or validated
- [ ] [T602] [US6] Add unit tests in `tests/unit/tools/vectorstore/backend-factory.test.ts` — verify factory returns in-memory backends for both undefined config and explicit `{ provider: "in-memory" }`, and that no connection_string is expected

## Zero-Dependency Verification

- [ ] [T603] [US6] Create test fixture markdown files in `tests/fixtures/docs/` — at least 3 markdown files with distinct headings, content, and overlapping keywords for search validation
- [ ] [T604] [T603] [US6] Implement full pipeline integration test in `tests/integration/vectorstore-inmemory.test.ts` — configure tool with NO database section, ingest fixtures from `tests/fixtures/docs/`, perform hybrid search (semantic + keyword + exact), verify results contain correct `score`, `parent_chain`, and `section_id` fields
- [ ] [T605] [T604] [US6] Add network isolation assertion in `tests/integration/vectorstore-inmemory.test.ts` — verify no external service connections are attempted during the full ingest-and-search pipeline (mock or spy on network APIs to confirm zero outbound calls beyond embedding provider)

## Session Lifecycle

- [ ] [T606] [US6] Implement `close()` method on `InMemoryVectorBackend` in `src/tools/vectorstore/backends/in-memory.ts` — clear internal `Map` and reset state to empty
- [ ] [T607] [US6] Implement `close()` method on `InMemoryBM25Backend` in `src/tools/vectorstore/backends/in-memory.ts` — clear inverted index, document lengths, and all internal state
- [ ] [T608] [T606, T607] [US6] Add session lifecycle test in `tests/integration/vectorstore-inmemory.test.ts` — create vectorstore, ingest docs, search and verify results found, call `close()` on both backends, create new vectorstore instance, search again and verify zero results returned

## BM25 Accuracy Validation

- [ ] [T609] [P] [US6] Add BM25 scoring accuracy tests in `tests/unit/tools/vectorstore/bm25.test.ts` — index known documents with known term frequencies, search for terms, verify ranking matches expected BM25 scoring with parameters k1=1.2 and b=0.75
- [ ] [T610] [P] [US6] Add BM25 tokenization tests in `tests/unit/tools/vectorstore/bm25.test.ts` — verify whitespace and alphanumeric splitting, case normalization, and token deduplication behavior
- [ ] [T611] [P] [US6] Add BM25 score normalization tests in `tests/unit/tools/vectorstore/bm25.test.ts` — verify scores are divided by max score in result set so top result has score 1.0
- [ ] [T612] [P] [US6] Add BM25 edge case tests in `tests/unit/tools/vectorstore/bm25.test.ts` — single document corpus, empty query returns no results, query term not in any document returns no results, very short documents (1 token), very long documents (10000+ tokens)

## Cosine Similarity Validation

- [ ] [T613] [P] [US6] Add cosine similarity ranking tests in `tests/unit/tools/vectorstore/in-memory-vector.test.ts` — insert known vectors, search with query vector, verify results are ranked by descending cosine similarity
- [ ] [T614] [P] [US6] Add cosine similarity edge case tests in `tests/unit/tools/vectorstore/in-memory-vector.test.ts` — identical vectors return score 1.0, orthogonal vectors return score 0.0, single vector in store returns that vector, zero vector handling
- [ ] [T615] [P] [US6] Add top_k and min_score filtering tests in `tests/unit/tools/vectorstore/in-memory-vector.test.ts` — verify top_k limits result count, min_score filters low-similarity results

## Developer Experience

- [ ] [T616] [T604] [US6] Add zero-config quickstart end-to-end test in `tests/integration/vectorstore-inmemory.test.ts` — use minimal agent.yaml config (only embedding_provider + tool with name, description, source pointing to `tests/fixtures/docs/`), no database section, verify ingest and search complete successfully
- [ ] [T617] [T616] [US6] Verify error messages for common misconfigurations in `tests/unit/tools/vectorstore/backend-factory.test.ts` — missing embedding_provider with vectorstore tool gives actionable error, invalid database provider gives clear error listing valid options

---

## Checkpoint

After completing all US6 tasks, developers can use the vectorstore tool with zero external dependencies — point at a docs directory, provide an embedding provider, and go. The in-memory backend is validated for correctness (BM25 scoring, cosine similarity), lifecycle (clean close/restart), and zero-config defaults.
