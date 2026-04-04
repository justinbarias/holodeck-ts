# Implementation Plan: Hierarchical Document Vector Store

**Branch**: `003-hierarchical-vectorstore` | **Date**: 2026-04-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-hierarchical-vectorstore/spec.md`

## Summary

Build a hierarchical document vector store tool that parses markdown documents with heading-aware chunking, generates embeddings (with optional contextual retrieval), and performs hybrid search (semantic + keyword + exact match) with Reciprocal Rank Fusion. Supports four backends: in-memory (default), Redis (RediSearch), Postgres (pgvector + tsvector/GIN), and ChromaDB + OpenSearch. Exposed to agents as a custom tool via Claude Agent SDK's `tool()` + `createSdkMcpServer()`.

## Technical Context

**Language/Version**: TypeScript 5.8.3 (strict, `@tsconfig/bun`)
**Primary Dependencies**:
- `@anthropic-ai/claude-agent-sdk` 0.2.87 — agent integration via `tool()` + `createSdkMcpServer()`
- `zod` 4.3.6 — input validation (raw shape for tool, `.strict()` for config)
- `yaml` 2.8.3 — config parsing
- `redis` 5.11.0 — Redis client with `@redis/search` for vector + full-text. **Note:** `FT.HYBRID` requires Redis Server 8.4.0+ and is marked `@experimental` in node-redis; API may change
- `postgres` 3.4.8 — Postgres client (tagged template SQL, ~380KB, zero deps)
- `pgvector` 0.2.1 — vector serialization helper for pgvector
- `chromadb` 3.4.0 — ChromaDB vector client
- `@opensearch-project/opensearch` 3.5.1 — OpenSearch BM25 client
**Storage**: Redis (RediSearch), Postgres (pgvector + tsvector/GIN), ChromaDB + OpenSearch, in-memory
**Testing**: Bun test
**Target Platform**: Bun runtime (cross-platform)
**Project Type**: Library (tool plugin for Claude Agent SDK)
**Performance Goals**: 100 files/5min ingestion, <2s search latency on 1K chunks
**Constraints**: Claude SDK only, no `any`, streaming/async only, Biome linting
**Scale/Scope**: Up to 1K indexed chunks across 4 backend providers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Claude Agent SDK Exclusivity | PASS | Tool uses `tool()` + `createSdkMcpServer()`, no other frameworks |
| II. Configuration-Driven Design | PASS | All behavior via YAML `agent.yaml`, Zod-validated |
| III. Modern TypeScript Strictness | PASS | Strict mode, no `any`, explicit return types |
| IV. Zod-First Validation | PASS | All schemas export type + schema, discriminated unions for tools |
| V. Test Discipline | PASS | Unit tests for all schemas, backends, chunker, graders |
| VI. Anthropic Evaluation Methodology | N/A | Not an eval feature |
| VII. Streaming & Async-Only I/O | PASS | All backend ops async, `Bun.file()` for file I/O |
| VIII. Observability by Design | PASS | Custom spans: `holodeck.vectorstore.*`, `holodeck.tool.*` |

**Post-Phase-1 Re-check**: All principles still pass. No new dependencies outside the Technology Constraints table. The 5 new packages (redis, postgres, pgvector, chromadb, opensearch) are domain-specific storage clients, justified by the feature requirements.

## Project Structure

### Documentation (this feature)

```text
specs/003-hierarchical-vectorstore/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: library research findings
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: usage guide
├── contracts/
│   ├── tool-interface.md    # Claude Agent SDK tool contract
│   └── backend-interface.md # VectorStore + KeywordSearch backend contracts
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── vectorstore/
│   │   ├── index.ts              # Public API: createVectorstoreServer()
│   │   ├── tool.ts               # Claude Agent SDK tool() registration
│   │   ├── converters/
│   │   │   ├── types.ts          # DocumentConverter interface
│   │   │   ├── pdf.ts            # PdfConverter (@opendocsg/pdf2md)
│   │   │   ├── docx.ts           # DocxConverter (mammoth + turndown)
│   │   │   ├── html.ts           # HtmlConverter (turndown)
│   │   │   ├── text.ts           # TextConverter (passthrough)
│   │   │   └── factory.ts        # getConverter(format) factory
│   │   ├── chunker.ts            # Section-aware markdown chunking (marked.lexer())
│   │   ├── context-generator.ts  # Contextual retrieval (Agent SDK query + subagents)
│   │   ├── search.ts             # HybridSearchExecutor + RRF fusion
│   │   ├── backends/
│   │   │   ├── types.ts          # VectorStoreBackend + KeywordSearchBackend interfaces
│   │   │   ├── in-memory.ts      # InMemoryVectorBackend + InMemoryBM25Backend
│   │   │   ├── redis.ts          # RedisVectorBackend + RedisSearchBackend
│   │   │   ├── postgres.ts       # PostgresVectorBackend + PostgresFTSBackend
│   │   │   ├── chromadb.ts       # ChromaDBVectorBackend
│   │   │   ├── opensearch.ts     # OpenSearchBackend
│   │   │   └── factory.ts        # createBackends() factory
│   │   └── embeddings/
│   │       ├── types.ts          # EmbeddingProvider interface
│   │       ├── ollama.ts         # OllamaEmbeddingProvider
│   │       └── azure-openai.ts   # AzureOpenAIEmbeddingProvider
│   └── registry.ts              # Tool registration (existing)
│
├── config/
│   └── schema.ts                # Add KeywordSearchConfigSchema, update HierarchicalDocumentToolSchema
│
└── lib/
    └── errors.ts                # Add ToolError with backend + operation fields

tests/
├── unit/
│   ├── tools/
│   │   └── vectorstore/
│   │       ├── converters/
│   │       │   ├── text.test.ts         # TextConverter tests
│   │       │   ├── html.test.ts         # HtmlConverter tests
│   │       │   ├── docx.test.ts         # DocxConverter tests
│   │       │   ├── pdf.test.ts          # PdfConverter tests
│   │       │   └── factory.test.ts      # Converter factory tests
│   │       ├── backends/
│   │       │   ├── in-memory.test.ts    # InMemoryVector + BM25 tests
│   │       │   ├── factory.test.ts      # Backend factory tests
│   │       │   ├── redis.test.ts        # Redis backend tests
│   │       │   ├── postgres.test.ts     # Postgres backend tests
│   │       │   ├── chromadb.test.ts     # ChromaDB backend tests
│   │       │   ├── opensearch.test.ts   # OpenSearch backend tests
│   │       │   ├── score-normalization.test.ts # Cross-backend score tests
│   │       │   ├── lifecycle.test.ts    # Connection lifecycle tests
│   │       │   └── backend-switching.test.ts  # Backend switching tests
│   │       ├── embeddings/
│   │       │   ├── ollama.test.ts       # Ollama provider tests
│   │       │   ├── azure-openai.test.ts # Azure OpenAI provider tests
│   │       │   └── factory.test.ts      # Embedding factory tests
│   │       ├── chunker.test.ts          # Structure-aware chunking tests
│   │       ├── search.test.ts           # RRF fusion + hybrid search tests
│   │       ├── types.test.ts            # DocumentChunk/SearchResult schema tests
│   │       ├── discovery.test.ts        # File discovery tests
│   │       ├── index.test.ts            # Ingestion pipeline tests
│   │       ├── tool.test.ts             # Tool registration tests
│   │       ├── bm25.test.ts             # In-memory BM25 scoring tests
│   │       ├── in-memory-vector.test.ts # Cosine similarity tests
│   │       └── context-generator.test.ts # Contextual retrieval tests
│   └── config/
│       └── schema.test.ts              # Updated schema validation tests
├── integration/
│   ├── tools/vectorstore/
│   │   ├── ingestion.test.ts            # Ingest pipeline integration
│   │   └── search.test.ts              # Search integration
│   ├── vectorstore-inmemory.test.ts     # Full pipeline: ingest → search (in-memory)
│   └── vectorstore-cross-backend.test.ts # Cross-backend comparison tests
└── fixtures/
    └── docs/                            # Sample markdown files for testing
```

**Structure Decision**: Extends existing `src/tools/` directory with a `vectorstore/` subdirectory. Backend implementations are isolated in `backends/` with a factory pattern. Embedding providers are in `embeddings/`. This keeps the tool self-contained while following the project's established layout.

## Key Design Decisions

### 1. In-Process MCP via `tool()` (not external MCP server)

The vectorstore tool is registered using `tool()` + `createSdkMcpServer()` as an in-process MCP tool. This gives zero IPC overhead, direct closure access to the vectorstore index, and full Zod validation on inputs.

An external MCP server was rejected because the vectorstore is tightly coupled to in-process state (loaded document chunks, embedding cache). Serializing across process boundaries would add complexity without benefit.

### 2. Backend Factory with Shared Connections

Redis and Postgres backends share a single client connection between their vector and keyword implementations. The `createBackends()` factory creates the client once and passes it to both constructors. ChromaDB + OpenSearch requires two separate connections.

### 3. Lazy Initialization

The vectorstore initializes (connects to backends, ingests documents, builds indexes) on the first search query, not at agent startup. This avoids blocking agent initialization when the corpus is large.

### 4. Score Normalization

All backend scores are normalized to 0.0-1.0 (higher = better) before RRF fusion:
- Vector backends: `1 - distance` (cosine distance → similarity)
- Keyword backends: `score / max_score` in result set
- RRF formula: `score(d) = Σ weight_i / (60 + rank_i(d))`

### 5. Contextual Retrieval via Agent SDK

Context generation uses the Claude Agent SDK `query()` function with named agent definitions via `agents: Record<string, AgentDefinition>`. A `context-generator` agent is defined with its own prompt, model (`claude-haiku-4-5`), and constrained tools. For large documents with many chunks, the main agent dispatches work to the `context-generator` agent. This approach:
- **Unifies auth** -- works with OAuth tokens, API keys, Bedrock, Vertex
- **Eliminates complexity** -- no prompt caching, no concurrency control, no rate limit handling
- **Uses the actual SDK API** -- `agents` (named agent definitions), not `subagents: { enabled, max_parallel }`
- **Note**: Manual batching of chunks is needed since the SDK doesn't have a built-in `max_parallel` toggle; use `Promise.all` with a concurrency limiter mapped from `context_concurrency` YAML config

### 6. Document Ingestion Pipeline

Documents go through a three-stage pipeline: Convert -> Chunk -> Embed.

```
Source files (PDF, DOCX, HTML, TXT, MD)
  -> DocumentConverter (per-format strategy)
  -> Markdown string
  -> MarkdownChunker (section-aware via marked.lexer())
  -> DocumentChunk[] (with parent chains, section IDs)
  -> EmbeddingProvider (Ollama or Azure OpenAI)
  -> DocumentChunk[] with embeddings
  -> VectorStoreBackend.upsert() + KeywordSearchBackend.index()
```

**Document conversion:** Per-format converters behind a `DocumentConverter` interface. PDF via `@opendocsg/pdf2md` (heuristic heading detection), DOCX via `mammoth` + `turndown` (excellent heading preservation), HTML via `turndown`, TXT as passthrough, MD as-is.

**Markdown chunking:** Custom ~535 LOC chunker using `marked.lexer()` (already installed). `lexer()` returns a `TokensList` of block-level tokens; each may contain nested `tokens[]` for inline content, but the chunker only iterates top-level blocks and uses their `.raw` property. Stack-based heading hierarchy algorithm builds parent chains and section IDs. Two strategies: `structure` (heading-aware, default) splits at heading boundaries; `token` (simple) splits at configurable token count. Oversized sections split at sentence boundaries. Configurable overlap.

### 7. Schema Updates

The existing `HierarchicalDocumentToolSchema` in `src/config/schema.ts` needs:
- A new optional `keyword_search` field for ChromaDB's OpenSearch configuration
- A new optional `context_model` field (default `"claude-haiku-4-5"`) for configurable context generation model — important for non-API-key auth providers (Bedrock, Vertex) where model naming may differ

Additionally, `src/config/schema.ts` needs:
- A new `EmbeddingProviderSchema` (provider, name, endpoint, api_version, api_key) — currently missing from the schema
- An `embedding_provider` field on `AgentConfigSchema` (required when vectorstore tools are present)

The `DatabaseSchema` already covers `provider` and `connection_string`.

## Complexity Tracking

No constitution violations to justify. All design decisions align with existing patterns.

## Dependencies to Install

**Already installed** (no action needed): `postgres` 3.4.8, `pgvector` 0.2.1, `marked` 15.0.12, `zod` 4.3.6, `@anthropic-ai/claude-agent-sdk` 0.2.87, `yaml` 2.8.3

**Production dependencies to add:**
```bash
bun add redis chromadb @opensearch-project/opensearch @opendocsg/pdf2md mammoth turndown turndown-plugin-gfm
```

**Dev dependencies to add:**
```bash
bun add --dev @types/turndown
```

**Notes:**
- No direct `@anthropic-ai/sdk` dependency needed — contextual retrieval uses the Agent SDK's `query()` with named `agents` definitions for auth-unified context generation.
- `@opendocsg/pdf2md` uses `unpdf` (pdf.js) internally which relies on WASM/Web Workers — **Bun compatibility is unverified**. Runtime testing required before committing to this library. If incompatible, consider an alternative or dropping PDF support from the initial implementation.
- `@opensearch-project/opensearch` has 6 transitive dependencies (`aws4`, `debug`, `hpagent`, `json11`, `ms`, `secure-json-parse`), ~5.3MB total.
- `turndown-plugin-gfm` is ~24KB.
- `mammoth` has a built-in `convertToMarkdown()` method — evaluate whether this produces acceptable output vs. `convertToHtml()` + turndown during implementation.
