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
- [ ] [T301] [US3] Define Zod response schema in `src/tools/vectorstore/context-generator.ts` for parsing Claude's JSON array output: `z.array(z.object({ chunk_id: z.string(), context: z.string() }))`
- [ ] [T302] [US3] Implement `buildContextPrompt(document: string, chunks: DocumentChunk[], config: ContextConfig): string` in `src/tools/vectorstore/context-generator.ts` — constructs prompt with whole document in `<document>` tags, chunks as JSON in `<chunks>` tags, and instruction to return JSON array with max `context_max_tokens` tokens per context
- [ ] [T303] [US3] Implement `contextualizeChunkBatch(document: string, batch: DocumentChunk[], config: ContextConfig): Promise<Map<string, string>>` in `src/tools/vectorstore/context-generator.ts` — calls Claude Agent SDK `query()` using named agent definitions: define a `"context-generator"` agent via `agents: { "context-generator": { description: "...", prompt: buildContextPrompt(...), model: config.context_model } }` with `permissionMode: "acceptAll"`, `maxTurns: 1`, `allowedTools: []`; parses streaming response; validates with Zod schema; returns map of chunk_id to context string
- [ ] [T305] [US3] Implement sliding-window concurrency limiter utility in `src/tools/vectorstore/context-generator.ts` — accepts array of async tasks and max concurrency, processes with `Promise.all` over sliding window of size `context_concurrency`
- [ ] [T306] [US3] Implement `generateContexts(document: string, chunks: DocumentChunk[], config: ContextConfig): Promise<Map<string, string>>` in `src/tools/vectorstore/context-generator.ts` — splits chunks into batches of `batch_size`, dispatches batches through concurrency limiter, merges all batch results into single `Map<string, string>`
- [ ] [T307] [US3] Add graceful degradation in `generateContexts` — if a batch fails after SDK exhausts its own retries, log warning via structured logger (`src/lib/logger.ts`, per Constitution Principle VII) and return empty context for those chunks (embed without context rather than failing entire pipeline). Note: retry/backoff is handled by the Claude Agent SDK internally (see research.md §6 "What This Eliminates")

## Integration with Ingestion Pipeline

- [ ] [T309] [US3] Wire context generation into `src/tools/vectorstore/index.ts` ingestion flow — after chunking and before embedding: if `contextual_embeddings: true`, call `generateContexts` with full document text and chunks. Note: `contextualized_content` field is already defined on DocumentChunk in foundation T008
- [ ] [T310] [US3] Set `chunk.contextualized_content = context + "\n\n" + chunk.content` for each chunk that receives context in `src/tools/vectorstore/index.ts`; for chunks without context (disabled or failed), set `contextualized_content = chunk.content`
- [ ] [T311] [US3] Update embedding step in `src/tools/vectorstore/index.ts` to embed `chunk.contextualized_content` instead of `chunk.content` when available
- [ ] [T312] [US3] Ensure search results return original `chunk.content` (not contextualized_content) to the user — context is for embedding quality only, not for display

## Config Mapping

- [ ] [T313] [US3] Map YAML `contextual_embeddings`, `context_max_tokens`, `context_concurrency`, and `context_model` fields from `HierarchicalDocumentToolSchema` to `ContextConfig` in `src/tools/vectorstore/index.ts`
- [ ] [T314] [US3] Add default `batch_size` derivation — default to 20 chunks per batch, capped so total prompt stays under model context window; expose as internal config (not in YAML schema)

## Tests

- [ ] [T315] [P] [US3] Unit test `buildContextPrompt` in `tests/unit/tools/vectorstore/context-generator.test.ts` — verify prompt contains document in `<document>` tags, chunks as JSON in `<chunks>` tags, and max token instruction
- [ ] [T316] [P] [US3] Unit test Zod response schema parsing in `tests/unit/tools/vectorstore/context-generator.test.ts` — valid JSON array passes, malformed/missing fields rejected
- [ ] [T317] [P] [US3] Unit test concurrency limiter in `tests/unit/tools/vectorstore/context-generator.test.ts` — verify max N tasks run concurrently using timing assertions
- [ ] [T318] [P] [US3] Unit test `generateContexts` with mocked `query()` in `tests/unit/tools/vectorstore/context-generator.test.ts` — verify chunks split into batches, contexts merged, map returned with correct chunk_id keys
- [ ] [T320] [P] [US3] Unit test graceful degradation in `tests/unit/tools/vectorstore/context-generator.test.ts` — mock batch failure after retries exhausted, verify empty contexts returned for failed batch and remaining batches succeed
- [ ] [T321] [P] [US3] Unit test ingestion pipeline with `contextual_embeddings: true` in `tests/unit/tools/vectorstore/index.test.ts` — verify `generateContexts` called, `contextualized_content` set, embedding uses contextualized content
- [ ] [T322] [P] [US3] Unit test ingestion pipeline with `contextual_embeddings: false` in `tests/unit/tools/vectorstore/index.test.ts` — verify `generateContexts` not called, chunks embedded with raw content
- [ ] [T323] [P] [US3] Unit test search result content in `tests/unit/tools/vectorstore/index.test.ts` — verify search returns original `chunk.content`, not `contextualized_content`

## Checkpoint

- [ ] [T324] [US3] Verify checkpoint: enable `contextual_embeddings: true` with `context_max_tokens: 100` and `context_concurrency: 10` in a sample agent.yaml; confirm chunks receive Claude-generated context prefixes before embedding; confirm `contextual_embeddings: false` skips enrichment entirely
