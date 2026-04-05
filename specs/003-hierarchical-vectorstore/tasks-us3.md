# Tasks — US3: Contextual Embeddings for Improved Retrieval

> **User Story 3**: When `contextual_embeddings: true`, use Claude to generate short situational context (50-100 tokens) per chunk before embedding. Prepend context to chunk content before embedding. Reduces retrieval failure by 35-67% per Anthropic's contextual retrieval research.
>
> **Depends on**: tasks-foundation.md + US1 (ingestion pipeline)

**Task Notation:**
- `[P]` — Parallelizable with other `[P]` tasks in the same section
- `[Txxx]` or `[Txxx, Tyyy]` — Depends on completion of the listed task(s)
- `[USn]` — Belongs to user story n

---

## Context Generator Module

- [ ] [T300] [US3] Create `src/tools/vectorstore/context-generator.ts` with `ContextConfig` interface: `context_max_tokens` (50-200, default 100), `context_concurrency` (1-50, default 10), `batch_size` (number of chunks per Claude request), `context_model` (string, default `"claude-haiku-4-5"`)
- [ ] [T301] [US3] Define Zod response schema `ContextResultSchema` in `src/tools/vectorstore/context-generator.ts`: `z.array(z.object({ chunk_id: z.string(), context: z.string() }))`. Convert to JSON Schema via `z.toJSONSchema(ContextResultSchema)` for use with the SDK's `outputFormat` option
- [ ] [T302] [US3] Implement `buildContextPrompt(document: string, chunks: DocumentChunk[], config: ContextConfig): string` in `src/tools/vectorstore/context-generator.ts` — constructs prompt with whole document in `<document>` tags, chunks as JSON in `<chunks>` tags, and max `context_max_tokens` token instruction. Note: no "return JSON" instruction needed — output format is enforced by the SDK's `outputFormat` option
- [ ] [T303] [US3] Implement `contextualizeChunkBatch(document: string, batch: DocumentChunk[], config: ContextConfig): Promise<Map<string, string>>` in `src/tools/vectorstore/context-generator.ts` — calls Claude Agent SDK `query()` with native structured outputs: `outputFormat: { type: "json_schema", schema: z.toJSONSchema(ContextResultSchema) }`, `model: config.context_model`, `maxTurns: 1`, `permissionMode: "bypassPermissions"`, `allowDangerouslySkipPermissions: true`; reads `message.structured_output` on success; validates with `ContextResultSchema.parse()`; returns map of chunk_id to context string
- [ ] [T305] [US3] Implement sliding-window concurrency limiter utility in `src/tools/vectorstore/context-generator.ts` — accepts array of async tasks and max concurrency, processes with `Promise.all` over sliding window of size `context_concurrency`
- [ ] [T306] [US3] Implement `generateContexts(document: string, chunks: DocumentChunk[], config: ContextConfig): Promise<Map<string, string>>` in `src/tools/vectorstore/context-generator.ts` — splits chunks into batches of `batch_size`, dispatches batches through concurrency limiter, merges all batch results into single `Map<string, string>`
- [ ] [T307] [US3] Add graceful degradation in `generateContexts` — if a batch fails (check `message.subtype === "error_max_structured_output_retries"` or caught exception), log warning via structured logger (`src/lib/logger.ts`, per Constitution Principle VII) and return empty context for those chunks (embed without context rather than failing entire pipeline). Note: retry/backoff for network/rate-limit errors is handled by the Claude Agent SDK internally; structured output retries are handled by the SDK's `outputFormat` mechanism

## Integration with Ingestion Pipeline

- [ ] [T309] [US3] Wire context generation into `src/tools/vectorstore/index.ts` ingestion flow — after chunking and before embedding: if `contextual_embeddings: true`, call `generateContexts` with full document text and chunks. Note: `contextualized_content` field is already defined on DocumentChunk in foundation T008
- [ ] [T310] [US3] Set `chunk.contextualized_content = context + "\n\n" + chunk.content` for each chunk that receives context in `src/tools/vectorstore/index.ts`; for chunks without context (disabled or failed), set `contextualized_content = chunk.content`
- [ ] [T311] [US3] Update embedding step in `src/tools/vectorstore/index.ts` to embed `chunk.contextualized_content` instead of `chunk.content` when available
- [ ] [T312] [US3] Ensure search results return original `chunk.content` (not contextualized_content) to the user — context is for embedding quality only, not for display. **Fix required:** `buildSearchResult()` in `src/tools/vectorstore/index.ts` (line ~612) currently returns `contextualizedContent ?? doc.content`; change to always return `doc.content` (the original chunk text)

## Config Mapping

- [ ] [T313] [US3] Create `ContextConfig` interface in `src/tools/vectorstore/context-generator.ts` and map parsed `contextual_embeddings`, `context_max_tokens`, `context_concurrency`, and `context_model` values from the tool config to `ContextConfig` in `src/tools/vectorstore/index.ts`. Note: the YAML schema fields already exist in `src/config/schema.ts` (lines 88-91); this task is about the runtime mapping, not schema definition
- [ ] [T314] [US3] Add default `batch_size` derivation — default to 20 chunks per batch, capped so total prompt stays under model context window; expose as internal config (not in YAML schema)

## Tests

- [ ] [T315] [P] [US3] Unit test `buildContextPrompt` in `tests/unit/tools/vectorstore/context-generator.test.ts` — verify prompt contains document in `<document>` tags, chunks as JSON in `<chunks>` tags, and max token instruction
- [ ] [T316] [P] [US3] Unit test `ContextResultSchema` Zod parsing and `z.toJSONSchema()` conversion in `tests/unit/tools/vectorstore/context-generator.test.ts` — valid structured output passes, malformed/missing fields rejected, JSON Schema output matches expected shape
- [ ] [T317] [P] [US3] Unit test concurrency limiter in `tests/unit/tools/vectorstore/context-generator.test.ts` — verify max N tasks run concurrently using timing assertions
- [ ] [T318] [P] [US3] Unit test `generateContexts` with mocked `query()` in `tests/unit/tools/vectorstore/context-generator.test.ts` — mock `query()` to yield result messages with `structured_output`; verify chunks split into batches, contexts merged, map returned with correct chunk_id keys; verify `outputFormat` is passed to `query()` options
- [ ] [T320] [P] [US3] Unit test graceful degradation in `tests/unit/tools/vectorstore/context-generator.test.ts` — mock `query()` yielding `subtype: "error_max_structured_output_retries"` for one batch, verify empty contexts returned for failed batch and remaining batches succeed
- [ ] [T321] [P] [US3] Unit test ingestion pipeline with `contextual_embeddings: true` in `tests/unit/tools/vectorstore/index.test.ts` — verify `generateContexts` called, `contextualized_content` set, embedding uses contextualized content
- [ ] [T322] [P] [US3] Unit test ingestion pipeline with `contextual_embeddings: false` in `tests/unit/tools/vectorstore/index.test.ts` — verify `generateContexts` not called, chunks embedded with raw content
- [ ] [T323] [P] [US3] Unit test search result content in `tests/unit/tools/vectorstore/index.test.ts` — verify search returns original `chunk.content`, not `contextualized_content`

## Checkpoint

- [ ] [T324] [US3] Verify checkpoint: enable `contextual_embeddings: true` with `context_max_tokens: 100` and `context_concurrency: 10` in a sample agent.yaml; confirm chunks receive Claude-generated context prefixes before embedding; confirm `contextual_embeddings: false` skips enrichment entirely
