# Data Model: Hierarchical Document Vector Store

**Feature Branch**: `003-hierarchical-vectorstore`
**Date**: 2026-04-01

## Core Entities

### DocumentChunk

A segment of a parsed markdown document with hierarchical context.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Unique chunk identifier (`{docId}:{chunkIndex}`) |
| `document_id` | `string` | Yes | Source document identifier (derived from file path) |
| `content` | `string` | Yes | Raw chunk text content |
| `contextualized_content` | `string \| undefined` | No | Content with prepended contextual summary (when `contextual_embeddings: true`) |
| `parent_chain` | `string[]` | Yes | Ancestor headings from root to immediate parent (e.g., `["Getting Started", "Installation"]`) |
| `section_id` | `string` | Yes | Dot-notation section identifier (e.g., `"1.2.3"`) |
| `subsection_ids` | `string[]` | Yes | IDs of child sections contained in this chunk |
| `chunk_type` | `"CONTENT" \| "HEADER"` | Yes | Whether this chunk is a heading or content block |
| `chunk_index` | `number` | Yes | Zero-based position within the source document |
| `source_path` | `string` | Yes | Relative file path of the source document |
| `heading_level` | `number \| undefined` | No | Heading level (1-6) if `chunk_type` is `HEADER` |
| `token_count` | `number` | Yes | Approximate token count of content |
| `embedding` | `number[]` | Yes | Vector embedding of (contextualized) content |
| `file_modified_at` | `number` | Yes | Source file modification timestamp (ms since epoch, for incremental re-indexing) |

**Validation Rules:**
- `id` must be unique across all chunks in a tool instance
- `parent_chain` can be empty (top-level content before any heading)
- `section_id` follows dot-notation: `"1"`, `"1.2"`, `"1.2.3"`
- `token_count` must be > 0 and <= `max_chunk_tokens` (with overlap allowance)
- `embedding` length must match the configured embedding dimension

**State Transitions:** None — chunks are immutable once created. Updates happen via delete + re-insert during incremental re-indexing.

---

### SearchResult

A ranked result from hybrid search execution.

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | `string` | Yes | Chunk text content |
| `score` | `number` | Yes | Fused relevance score (0.0-1.0) |
| `semantic_score` | `number \| undefined` | No | Individual semantic similarity score |
| `keyword_score` | `number \| undefined` | No | Individual keyword/BM25 score |
| `exact_score` | `number \| undefined` | No | Individual exact match score |
| `source_path` | `string` | Yes | Source file path |
| `parent_chain` | `string[]` | Yes | Heading hierarchy breadcrumb |
| `section_id` | `string` | Yes | Section identifier |
| `subsection_ids` | `string[]` | Yes | Child section identifiers |
| `chunk_index` | `number` | Yes | Position in source document |
| `is_exact_match` | `boolean` | Yes | Whether an exact substring match was found |

**Validation Rules:**
- `score` is normalized to 0.0-1.0 range
- Individual modality scores are present only when that modality was executed

---

### SearchResponse

The complete response returned by the tool to the Claude Agent SDK.

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | `string` | Yes | The original search query |
| `search_mode` | `"semantic" \| "keyword" \| "exact" \| "hybrid"` | Yes | The search mode used |
| `total_results` | `number` | Yes | Number of results returned |
| `results` | `SearchResult[]` | Yes | Ranked results |
| `degraded` | `boolean` | No | `true` if a search modality was unavailable |
| `degraded_details` | `string \| undefined` | No | Description of what degraded and why |

---

### VectorStoreBackend (Interface)

Abstraction over storage providers for vector operations.

| Method | Signature | Description |
|---|---|---|
| `initialize` | `() => Promise<void>` | Create indexes/collections, verify connectivity |
| `upsert` | `(chunks: DocumentChunk[]) => Promise<void>` | Insert or update chunks with embeddings |
| `search` | `(embedding: number[], topK: number) => Promise<VectorSearchHit[]>` | Vector similarity search |
| `delete` | `(ids: string[]) => Promise<void>` | Remove chunks by ID |
| `close` | `() => Promise<void>` | Clean up connections |

**Implementations:** `InMemoryVectorBackend`, `RedisVectorBackend`, `PostgresVectorBackend`, `ChromaDBVectorBackend`

---

### KeywordSearchBackend (Interface)

Abstraction over keyword/BM25 search providers.

| Method | Signature | Description |
|---|---|---|
| `initialize` | `() => Promise<void>` | Create indexes, verify connectivity |
| `index` | `(chunks: DocumentChunk[]) => Promise<void>` | Index chunks for keyword search |
| `search` | `(query: string, topK: number) => Promise<KeywordSearchHit[]>` | BM25/full-text search |
| `delete` | `(ids: string[]) => Promise<void>` | Remove entries by ID |
| `close` | `() => Promise<void>` | Clean up connections |

**Implementations:** `InMemoryBM25Backend`, `RedisSearchBackend` (via RediSearch FT), `PostgresFTSBackend` (via tsvector/GIN), `OpenSearchBackend`

---

### VectorSearchHit

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Chunk ID |
| `score` | `number` | Similarity score (0.0-1.0, higher = more similar) |

---

### KeywordSearchHit

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Chunk ID |
| `score` | `number` | BM25/relevance score (normalized to 0.0-1.0) |

---

### HybridSearchExecutor

Orchestrates multi-modal search and fusion.

| Method | Signature | Description |
|---|---|---|
| `search` | `(query: string, embedding: number[], options: SearchOptions) => Promise<SearchResult[]>` | Execute hybrid search with RRF fusion |

**Search flow:**
1. Dispatch vector search + keyword search + exact match search in parallel
2. Collect `VectorSearchHit[]` and `KeywordSearchHit[]` and exact matches
3. Apply Reciprocal Rank Fusion: `score(d) = Σ weight_i / (k + rank_i(d))` where k=60
4. Merge, deduplicate by chunk ID, sort by fused score descending
5. Apply `min_score` filter and `top_k` limit
6. Hydrate full `SearchResult` objects from chunk store

---

### EmbeddingProvider (Interface)

| Method | Signature | Description |
|---|---|---|
| `embed` | `(texts: string[]) => Promise<number[][]>` | Batch embed text strings |
| `dimensions` | `() => number` | Return embedding dimensions |

**Implementations:** `OllamaEmbeddingProvider`, `AzureOpenAIEmbeddingProvider`

---

### ContextGenerator

| Method | Signature | Description |
|---|---|---|
| `generateContexts` | `(document: string, chunks: DocumentChunk[], config: ContextConfig) => Promise<Map<string, string>>` | Generate context prefixes for all chunks in a document |

Uses the Claude Agent SDK `query()` function, modeling context generation as a single task per document. For large documents (chunks > batch_size), the main agent subdivides work into subagents via `subagents.max_parallel` (mapped from `context_concurrency` YAML config). Each subagent processes a batch of chunks and returns JSON. The main agent collects and merges results. Auth is unified through the Agent SDK (OAuth, API key, Bedrock, Vertex).

---

### DocumentConverter (Interface)

Converts source documents to Markdown for the chunking pipeline.

| Method | Signature | Description |
|---|---|---|
| `convert` | `(input: Buffer, options?: ConvertOptions) => Promise<string>` | Convert document to Markdown string |
| `supports` | `(extension: string) => boolean` | Check if this converter handles the given file extension |

**Implementations:**

| Converter | Extensions | Library | Heading Preservation |
|---|---|---|---|
| `PdfConverter` | `.pdf` | `@opendocsg/pdf2md` | Heuristic (font-size based) |
| `DocxConverter` | `.docx` | `mammoth` + `turndown` | Excellent (semantic styles) |
| `HtmlConverter` | `.html`, `.htm` | `turndown` | Excellent (DOM structure) |
| `TextConverter` | `.txt` | Passthrough | None (plain text) |
| `MarkdownConverter` | `.md` | Identity (no-op) | Perfect (native format) |

Factory: `getConverter(extension: string): DocumentConverter` returns the appropriate converter or throws `ToolError` for unsupported formats.

---

### MarkdownChunker

Parses Markdown into structure-aware chunks using `marked.lexer()`.

| Method | Signature | Description |
|---|---|---|
| `chunk` | `(markdown: string, config: ChunkConfig) => DocumentChunk[]` | Parse and chunk a markdown document |

**ChunkConfig:**

| Field | Type | Default | Description |
|---|---|---|---|
| `strategy` | `"structure" \| "token"` | `"structure"` | Chunking strategy |
| `max_chunk_tokens` | `number` | 800 | Maximum tokens per chunk (100-2000) |
| `chunk_overlap` | `number` | 50 | Token overlap between consecutive chunks (0-200) |

**Chunking strategies:**
- `structure`: Splits at heading boundaries, preserves parent chain hierarchy. Sections exceeding `max_chunk_tokens` are split at sentence boundaries.
- `token`: Simple fixed-size splits at approximately `max_chunk_tokens` with overlap, ignoring heading structure.

---

## Entity Relationships

```
Source files (PDF, DOCX, HTML, TXT, MD)
         │
         ▼
DocumentConverter ─── converts ──→ Markdown string
                                        │
                                        ▼
                              MarkdownChunker ─── chunks ──→ DocumentChunk[]
                                                                  │
                              ContextGenerator ─── contextualizes ─┘
                                                                  │
                              EmbeddingProvider ─── embeds ────────┘
                                                                  │
                                     ├──→ VectorStoreBackend.upsert()
                                     └──→ KeywordSearchBackend.index()
                                              │
                                              ▼
                              HybridSearchExecutor.search()
                                     │
                                     ├── VectorStoreBackend.search()
                                     ├── KeywordSearchBackend.search()
                                     └── ExactMatchSearch (in-process)
                                              │
                                              ▼
                                       SearchResponse
                                              │
                                              ▼
                                    Claude Agent SDK tool()
```

## Backend Pairing Matrix

| `database.provider` | Vector Backend | Keyword Backend | Notes |
|---|---|---|---|
| `in-memory` | `InMemoryVectorBackend` | `InMemoryBM25Backend` | No external deps |
| `redis` | `RedisVectorBackend` | `RedisSearchBackend` | Single Redis connection, RediSearch module |
| `postgres` | `PostgresVectorBackend` | `PostgresFTSBackend` | Single Postgres connection, pgvector + tsvector/GIN |
| `chromadb` | `ChromaDBVectorBackend` | `OpenSearchBackend` | Two connections: ChromaDB + OpenSearch |
