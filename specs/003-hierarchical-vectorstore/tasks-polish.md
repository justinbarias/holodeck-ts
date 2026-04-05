# Tasks: Polish & Cross-Cutting Concerns

> **Feature:** 003 -- Hierarchical Document Vector Store
> **Scope:** OTel observability spans, documentation, and cross-cutting improvements
> **Depends on:** All user stories complete

**Task Notation:**
- `[P]` — Parallelizable with other `[P]` tasks in the same section
- `[Txxx]` or `[Txxx, Tyyy]` — Depends on completion of the listed task(s)
- `[USn]` — Belongs to user story n

---

## OpenTelemetry Spans (Constitution Principle VIII)

- [ ] [T900] [P] Add `holodeck.vectorstore.search` span to `src/tools/vectorstore/search.ts` -- wrap HybridSearchExecutor.search() with span recording query, search_mode, top_k, result count, duration, and degraded flag as span attributes
- [ ] [T901] [P] Add `holodeck.vectorstore.contextualize` span to `src/tools/vectorstore/context-generator.ts` -- wrap generateContexts() with span recording chunk count, batch count, concurrency, model used, and per-batch timing as span events
- [ ] [T902] [P] Add `holodeck.vectorstore.ingest` span to `src/tools/vectorstore/index.ts` -- wrap ingestion pipeline with span recording file count, chunk count, embedding duration, backend upsert duration, and incremental skip count
- [ ] [T903] [P] Add `holodeck.tool.{name}` span to `src/tools/vectorstore/tool.ts` -- wrap tool handler with span recording tool name, query input, response size, isError flag, using GenAI semantic conventions (`gen_ai.system: "anthropic"`)
- [ ] [T904] [P] Add `holodeck.vectorstore.backend.{op}` spans to each backend in `src/tools/vectorstore/backends/` -- wrap initialize, upsert, search, delete, close with spans recording backend provider name and operation duration
- [ ] [T905] Ensure all OTel spans are no-op when `observability.enabled: false` -- verify span creation is conditional on OTel SDK initialization, adding zero overhead when disabled

## Documentation

- [ ] [T906] [P] Update `README.md` with vectorstore tool configuration examples
- [ ] [T907] [P] Run quickstart.md validation -- verify all 7 quickstart scenarios from `specs/003-hierarchical-vectorstore/quickstart.md` produce expected results

## Code Quality

- [ ] [T908] Run `bun run typecheck` -- zero errors across all new vectorstore code
- [ ] [T909] Run `bun run lint` -- zero Biome warnings/errors across all new files
- [ ] [T910] Run `bun test` -- all unit and integration tests pass with zero failures
