# Tasks: Foundation Layer — Document Parsing, Cracking & Core Types

> **Feature:** 003 — Hierarchical Document Vector Store
> **Scope:** All foundational building blocks that user stories depend on: dependencies, directory structure, core types/schemas, document converters, markdown chunker, and embedding providers.
> **Checkpoint:** After completing all tasks, every user story has the primitives it needs — converters, chunker, embeddings, types, and schemas.

**Task Notation:**
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- `[Txxx]` or `[Txxx, Tyyy]` — Depends on completion of the listed task(s)
- `[USn]` — Belongs to user story n

---

## Phase 1: Setup (Dependencies & Directory Structure)

- [x] T000 Delete existing empty `src/tools/vectorstore.ts` file to make way for `src/tools/vectorstore/` directory (file and directory cannot coexist)
- [x] T001 Install production dependencies: `redis`, `chromadb`, `@opensearch-project/opensearch`, `@opendocsg/pdf2md`, `mammoth`, `turndown`, `turndown-plugin-gfm`
- [x] T002 Install dev dependencies: `@types/turndown`
- [x] T003 Create directory structure: `src/tools/vectorstore/converters/`, `src/tools/vectorstore/backends/`, `src/tools/vectorstore/embeddings/`

## Phase 2: Core Types & Schemas

- [x] T004 Define DocumentConverter interface and ConvertOptions type in `src/tools/vectorstore/converters/types.ts` — `convert(input: Buffer, options?: ConvertOptions): Promise<string>` (returns markdown), `supports(extension: string): boolean`
- [x] T005 [P] Define VectorStoreBackend and KeywordSearchBackend interfaces in `src/tools/vectorstore/backends/types.ts` — VectorStoreBackend (initialize, upsert, search, delete, close), KeywordSearchBackend (initialize, index, search, delete, close), plus VectorStoreConfig, IndexableChunk, VectorSearchHit, KeywordSearchConfig, IndexableTextChunk, KeywordSearchHit types
- [x] T006 [P] Define EmbeddingProvider interface in `src/tools/vectorstore/embeddings/types.ts` — `embed(texts: string[]): Promise<number[][]>`, `dimensions(): number`
- [x] T007 [P] Extend ToolError class in `src/lib/errors.ts` to include `backend` and `operation` fields for vectorstore error context
- [x] T008 Define DocumentChunk Zod schema and type in `src/tools/vectorstore/types.ts` — fields: id, document_id, content, contextualized_content, parent_chain, section_id, subsection_ids, chunk_type (`"CONTENT"` | `"HEADER"`), chunk_index, source_path, heading_level, token_count, embedding, file_modified_at
- [x] T009 Define SearchResult and SearchResponse Zod schemas in `src/tools/vectorstore/types.ts`
- [x] T010 Update `src/config/schema.ts` — add `KeywordSearchConfigSchema` as `z.strictObject({ provider: z.literal("opensearch"), url: z.string().url(), headers: z.record(z.string(), z.string()).default({}), request_timeout: z.number().positive().default(60) })`. Export `KeywordSearchConfig` type. Update `HierarchicalDocumentToolSchema` with optional `keyword_search: KeywordSearchConfigSchema.optional()` field and optional `context_model` field (`z.string().default("claude-haiku-4-5")`) for configurable context generation model. Add `.superRefine()` to require `keyword_search` when `database.provider` is `"chromadb"`
- [x] T010a [P] Define `EmbeddingProviderSchema` in `src/config/schema.ts` — fields: `provider` (`z.enum(["ollama", "azure_openai"])`), `name` (string), `endpoint` (string, optional, required for azure_openai), `api_version` (string, optional), `api_key` (string, optional). Export `EmbeddingProviderSchema` and `type EmbeddingProvider = z.infer<typeof EmbeddingProviderSchema>`. Use `.superRefine()` to require `endpoint` when `provider` is `"azure_openai"`
- [x] T010b [T010a] Add optional `embedding_provider` field to `AgentConfigSchema` in `src/config/schema.ts`. Add `.superRefine()` on AgentConfigSchema to require `embedding_provider` when any tool has `type: "hierarchical_document"`. Export updated `AgentConfig` type

## Phase 3: Document Converters

- [x] T011 [P] Implement TextConverter in `src/tools/vectorstore/converters/text.ts` — passthrough converter, `supports()` returns true for `.txt` and `.md` extensions, `convert()` returns input buffer decoded as UTF-8
- [x] T012 [P] Implement HtmlConverter in `src/tools/vectorstore/converters/html.ts` — uses `turndown` + `turndown-plugin-gfm` to convert HTML to markdown, `supports()` returns true for `.html` and `.htm`
- [x] T013 [P] Implement DocxConverter in `src/tools/vectorstore/converters/docx.ts` — uses `mammoth` (convertToHtml) piped through `turndown` + `turndown-plugin-gfm`, `supports()` returns true for `.docx`
- [x] T014 [P] Implement PdfConverter in `src/tools/vectorstore/converters/pdf.ts` — uses `@opendocsg/pdf2md`, `supports()` returns true for `.pdf`. Must include Bun runtime compatibility verification (WASM/Web Workers); if incompatible, implement as a stub that throws `ToolError('PDF conversion not supported in Bun runtime — convert to markdown manually or use a Node.js preprocessing step')` so PDF becomes a documented limitation, not a blocker
- [x] T015 Implement converter factory in `src/tools/vectorstore/converters/factory.ts` — `getConverter(extension: string): DocumentConverter` returning appropriate converter or throwing ToolError for unsupported formats. Re-export all converters from `src/tools/vectorstore/converters/index.ts`

## Phase 4: Markdown Chunker

- [x] T016 Implement MarkdownChunker in `src/tools/vectorstore/chunker.ts` (~535 LOC) using `marked.lexer()`:
  - ChunkConfig type: `{ strategy: "structure" | "token", max_chunk_tokens: number (100-2000, default 800), chunk_overlap: number (0-200, default 50) }`
  - Token counting via word-count approximation: `text.split(/\s+/).filter(Boolean).length` with 0.75 factor
  - `structure` strategy (default): stack-based heading hierarchy algorithm — walk `marked.lexer()` tokens, maintain headingStack + section counters per depth (h1-h6), on heading pop siblings/uncles and push current, build parentChain and sectionId (dot-notation: `"1.2.3"`), group content tokens under nearest heading
  - `token` strategy: fixed-size chunking with configurable overlap
  - Oversized sections split at sentence boundaries
  - Returns `DocumentChunk[]` with parent_chain, section_id, subsection_ids, chunk_type, chunk_index, heading_level, token_count populated
  - **Edge cases (from US4) — must be handled in initial implementation to avoid rework:**
    - Documents with no headings: all content assigned to root section with empty parent_chain
    - Content before first heading: captured as root-level chunk (preamble)
    - Deeply nested headings (h1→h6): parent_chain includes all ancestors
    - Skipped heading levels (h1→h3, no h2): parent_chain reflects actual headings, section_id still correct
    - Empty sections (heading with no body): produce HEADER-only chunk
    - Very long paragraphs exceeding max_chunk_tokens: split at sentence boundaries, never mid-word
    - Fenced code blocks: atomic units, never split across chunks
    - GFM tables: atomic units, never split across chunks
    - Long lists: split between list items, never mid-item

## Phase 5: Embedding Providers

- [x] T017 [P] Implement OllamaEmbeddingProvider in `src/tools/vectorstore/embeddings/ollama.ts` — HTTP calls to local Ollama API (`POST /api/embeddings`), configurable model name and endpoint (default `http://localhost:11434`), batch support, error handling with ToolError
- [x] T018 [P] Implement AzureOpenAIEmbeddingProvider in `src/tools/vectorstore/embeddings/azure-openai.ts` — HTTP calls to Azure OpenAI endpoint (`/openai/deployments/{model}/embeddings`), requires endpoint + api_key + api_version, batch support, error handling with ToolError
- [x] T018a [T017, T018] Implement embedding provider factory in `src/tools/vectorstore/embeddings/factory.ts` — export `createEmbeddingProvider(config: EmbeddingProvider): EmbeddingProviderInterface` that switches on `config.provider` to instantiate `OllamaEmbeddingProvider` or `AzureOpenAIEmbeddingProvider` with the appropriate config fields. Re-export all providers from `src/tools/vectorstore/embeddings/index.ts`

## Phase 6: Unit Tests

- [x] T019 [P] Write unit tests for TextConverter in `tests/unit/tools/vectorstore/converters/text.test.ts` — passthrough behavior, encoding, `supports()` coverage
- [x] T020 [P] Write unit tests for HtmlConverter in `tests/unit/tools/vectorstore/converters/html.test.ts` — HTML-to-markdown fidelity (tables, lists, GFM), `supports()` coverage
- [x] T021 [P] Write unit tests for DocxConverter in `tests/unit/tools/vectorstore/converters/docx.test.ts` — DOCX-to-markdown conversion with fixture files, `supports()` coverage
- [x] T022 [P] Write unit tests for PdfConverter in `tests/unit/tools/vectorstore/converters/pdf.test.ts` — PDF-to-markdown conversion with fixture files, Bun compatibility assertion, `supports()` coverage
- [x] T023 [P] Write unit tests for converter factory in `tests/unit/tools/vectorstore/converters/factory.test.ts` — correct converter selection per extension, ToolError on unsupported format
- [x] T024 Write unit tests for MarkdownChunker in `tests/unit/tools/vectorstore/chunker.test.ts` — structure strategy (heading hierarchy, parentChain, sectionId, subsection linking), token strategy, overlap, oversized section splitting, token counting accuracy
- [x] T025 [P] Write unit tests for DocumentChunk and SearchResult/SearchResponse schemas in `tests/unit/tools/vectorstore/types.test.ts` — valid/invalid parsing, defaults
- [x] T026 [P] Write unit tests for updated HierarchicalDocumentToolSchema in `tests/unit/config/schema.test.ts` — keyword_search field validation, backward compatibility with existing configs
- [x] T026a [P] Write unit tests for `EmbeddingProviderSchema` in `tests/unit/config/schema.test.ts` — valid Ollama config, valid Azure config, azure_openai requires endpoint, type inference
- [x] T026b [P] Write unit tests for `AgentConfigSchema` embedding_provider requirement in `tests/unit/config/schema.test.ts` — required when hierarchical_document tool present, optional when no vectorstore tools
- [x] T027 [P] Write unit tests for OllamaEmbeddingProvider in `tests/unit/tools/vectorstore/embeddings/ollama.test.ts` — mock HTTP calls, batch embedding, error handling, dimensions
- [x] T028 [P] Write unit tests for AzureOpenAIEmbeddingProvider in `tests/unit/tools/vectorstore/embeddings/azure-openai.test.ts` — mock HTTP calls, batch embedding, error handling, dimensions
- [x] T028a [P] Write unit tests for embedding provider factory in `tests/unit/tools/vectorstore/embeddings/factory.test.ts` — correct provider instantiation per config.provider, error on unknown provider
