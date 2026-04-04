# Tasks — US2: Hybrid Search Across Vector and Keyword Indexes

**User Story**: Agent receives a query → tool performs hybrid search (semantic + keyword + exact match) → fuses results via RRF with configurable weights → returns top-k results with source attribution, parent heading chain, section IDs.

**Depends on**: tasks-foundation.md (types, schemas) + US1 (backends initialized, documents indexed)

**Task Notation:**
- `[P]` — Parallelizable with other `[P]` tasks in the same section
- `[Txxx]` or `[Txxx, Tyyy]` — Depends on completion of the listed task(s)
- `[USn]` — Belongs to user story n

---

## Type Imports & Search-Internal Types

> **Note**: VectorSearchHit, KeywordSearchHit, SearchResult, and SearchResponse are defined in foundation (T005 `backends/types.ts` and T009 `types.ts`). Import them in `search.ts` — do NOT redefine.

- [ ] [T200] [US2] Define SearchOptions interface in `src/tools/vectorstore/search.ts` — fields: search_mode, semantic_weight, keyword_weight, exact_weight, top_k, min_score
- [ ] [T201] [US2] Define ExactMatchHit interface (search-internal) in `src/tools/vectorstore/search.ts` — fields: chunk_id, score (always 1.0), is_exact_match (always true), matched_substring

## Exact Match Search

- [ ] [T206] [US2] Implement exactMatchSearch(query: string, chunks: DocumentChunk[]) function in `src/tools/vectorstore/search.ts` — case-insensitive substring match across all indexed chunks, returns ExactMatchHit[] with score 1.0 and is_exact_match: true. **Note:** Exact match operates on an in-memory copy of all chunks. Acceptable for target scale (≤1K chunks) but would need backend-native text search for larger corpora
- [ ] [T207] [US2] Write unit tests for exactMatchSearch in `tests/unit/tools/vectorstore/search.test.ts` — test case-insensitive matching, no-match returns empty, multiple matches ranked by chunk order

## Search Mode Routing

- [ ] [T208] [US2] Implement dispatchSearch(query, embedding, options, backends) in `src/tools/vectorstore/search.ts` — routes to correct modalities based on search_mode: "hybrid" dispatches all three in parallel, "semantic" dispatches vector only, "keyword" dispatches BM25/OpenSearch only, "exact" dispatches substring only
- [ ] [T209] [US2] Write unit tests for dispatchSearch mode routing in `tests/unit/tools/vectorstore/search.test.ts` — verify each search_mode dispatches to correct backend(s) and skips others

## Reciprocal Rank Fusion (RRF)

- [ ] [T210] [US2] Implement rrfFuse(vectorHits, keywordHits, exactHits, weights) function in `src/tools/vectorstore/search.ts` — applies RRF formula: score(d) = sum(weight_i / (60 + rank_i(d))) for each modality, deduplicates by chunk_id keeping highest fused score
- [ ] [T211] [US2] Write unit tests for rrfFuse in `tests/unit/tools/vectorstore/search.test.ts` — test: single modality passthrough, two-modality fusion, three-modality fusion, deduplication by chunk_id, correct weight application, empty input handling

## Weight Validation

- [ ] [T212] [US2] Implement validateWeights(semantic_weight, keyword_weight, exact_weight) runtime check in `src/tools/vectorstore/search.ts` — throws ToolError if sum !== 1.0 (with floating point tolerance 1e-6), complements Zod schema validation
- [ ] [T213] [US2] Write unit tests for validateWeights in `tests/unit/tools/vectorstore/search.test.ts` — test valid sum, invalid sum, floating point edge cases (e.g., 0.1 + 0.2 + 0.7)

## HybridSearchExecutor

- [ ] [T214] [P] [US2] Implement HybridSearchExecutor class constructor in `src/tools/vectorstore/search.ts` — accepts vector backend, keyword backend, chunk store (in-memory DocumentChunk[], used for exact match and result hydration; acceptable for ≤1K chunks per plan scope); stores as private fields
- [ ] [T215] [US2] Implement HybridSearchExecutor.search(query, embedding, options) method in `src/tools/vectorstore/search.ts` — orchestrates full search flow: validate weights → dispatch parallel searches via dispatchSearch → fuse via rrfFuse → apply min_score filter → apply top_k limit → hydrate full SearchResult objects from chunk store → return SearchResponse
- [ ] [T216] [US2] Implement graceful degradation in HybridSearchExecutor.search in `src/tools/vectorstore/search.ts` — if one modality throws, catch error, continue with remaining modalities, set degraded: true and degraded_details with failure reason on SearchResponse
- [ ] [T217] [US2] Write unit tests for HybridSearchExecutor.search in `tests/unit/tools/vectorstore/search.test.ts` — test full hybrid flow with mocked backends, min_score filtering, top_k limiting
- [ ] [T218] [US2] Write unit tests for graceful degradation in `tests/unit/tools/vectorstore/search.test.ts` — test: vector backend fails → keyword + exact results returned with degraded: true, all backends fail → empty results with degraded: true

## Result Formatting and Hydration

- [ ] [T219] [US2] Implement hydrateSearchResults(fusedHits, chunkStore) in `src/tools/vectorstore/search.ts` — looks up full chunk data by chunk_id, builds SearchResult with: content truncated to 500 tokens with "..." suffix, source as parent_chain joined with " > ", section_id, chunk_index, is_exact_match flag
- [ ] [T220] [US2] Implement truncateContent(content, maxTokens) helper in `src/tools/vectorstore/search.ts` — truncates content to approximately maxTokens (word-boundary aware), appends "..." if truncated
- [ ] [T221] [US2] Write unit tests for hydrateSearchResults in `tests/unit/tools/vectorstore/search.test.ts` — test content truncation, source breadcrumb formatting, is_exact_match propagation
- [ ] [T222] [US2] Implement formatSearchResponse(query, searchMode, results, degraded?) in `src/tools/vectorstore/search.ts` — builds SearchResponse object, sets total_results count

## Tool Output Integration

- [ ] [T223] [US2] Implement toToolResult(response: SearchResponse) in `src/tools/vectorstore/search.ts` — returns CallToolResult { type: "text", text: JSON.stringify(response) } for MCP tool output. **Field mapping from internal SearchResult to tool output:** `parent_chain: string[]` → `breadcrumb: string` (joined with `" > "`), `source_path` → `source`, `subsection_ids` omitted from tool output for token efficiency
- [ ] [T224] [US2] Write unit test for toToolResult in `tests/unit/tools/vectorstore/search.test.ts` — verify JSON output structure matches SearchResponse schema

## Integration Tests

> **Note:** All US2 integration tests use in-memory backends (no external services required). Cross-backend search integration is covered in US5's T520-T525.

- [ ] [T225] [US2] Write integration test: in-memory backend with indexed docs → hybrid search "What is the refund policy?" → verify results contain relevant chunks with source_path, parent_chain, section_id in `tests/integration/tools/vectorstore/search.test.ts`
- [ ] [T226] [US2] Write integration test: in-memory backend, hybrid mode with semantic_weight: 0.5, keyword_weight: 0.3, exact_weight: 0.2 → verify RRF fusion produces correctly weighted rankings in `tests/integration/tools/vectorstore/search.test.ts`
- [ ] [T227] [US2] Write integration test: in-memory backend, search_mode: "semantic" → verify only vector search dispatched, no keyword/exact calls in `tests/integration/tools/vectorstore/search.test.ts`
- [ ] [T228] [US2] Write integration test: in-memory backend, search_mode: "keyword" → verify only BM25 dispatched in `tests/integration/tools/vectorstore/search.test.ts`
- [ ] [T229] [US2] Write integration test: in-memory backend, exact phrase match → verify result has is_exact_match: true and boosted ranking in `tests/integration/tools/vectorstore/search.test.ts`

---

## Checkpoint

After US2 completion, agents can search the indexed corpus with hybrid, semantic, keyword, or exact modes and receive properly ranked, attributed results with source breadcrumbs, section IDs, and graceful degradation when backends are unavailable.
