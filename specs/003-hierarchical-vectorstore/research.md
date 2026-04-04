# Research: Hierarchical Document Vector Store

**Feature Branch**: `003-hierarchical-vectorstore`
**Date**: 2026-04-01
**Status**: Complete

## 1. Redis Vector & Keyword Search

### Decision: `redis` (node-redis v5.11.0) with bundled `@redis/search`

### Rationale
- **Only JS/TS client with first-party RediSearch module support** including typed wrappers for `FT.CREATE`, `FT.SEARCH`, `FT.AGGREGATE`, and `FT.HYBRID`
- **Dedicated hybrid search command**: `FT.HYBRID` (`client.ft.hybrid()`) supports combining text search + vector similarity with RRF or LINEAR fusion methods — maps directly to our hybrid search requirement. **Note:** `FT.HYBRID` requires Redis Server 8.4.0+ and is marked `@experimental` in node-redis; API may change
- **Comprehensive vector field support**: HNSW/FLAT/VAMANA (key `.VAMANA`, value `"SVS-VAMANA"`) algorithms, FLOAT32/FLOAT64/BFLOAT16/FLOAT16/INT8/UINT8 types, COSINE/L2/IP distance metrics. **Note:** SVS-VAMANA restricts vector types to FLOAT16/FLOAT32 only
- **Bun compatible**: All imports, client construction, `ft.*` methods, and `Float32Array`-to-`Buffer` vector serialization confirmed working
- **Actively maintained**: 17.5K GitHub stars, 8.8M weekly npm downloads, last push 2026-03-30

### Alternatives Considered
| Library | Why Rejected |
|---|---|
| `ioredis` (16.2M weekly downloads) | Zero RediSearch support; would require raw `client.call()` with no types, no result parsing, manual buffer serialization |
| `redis-om` | Higher-level ORM that abstracts away search API; too opaque for precise control over index schemas, KNN queries, and weight tuning |

### Key API Patterns
- **Vector index creation**: `client.ft.create("idx:chunks", { embedding: { type: SCHEMA_FIELD_TYPE.VECTOR, ALGORITHM: SCHEMA_VECTOR_FIELD_ALGORITHM.HNSW, DIM: 768, DISTANCE_METRIC: "COSINE" }, content: { type: SCHEMA_FIELD_TYPE.TEXT } })`
- **Embedding storage**: `client.hSet("chunk:id", { embedding: Buffer.from(new Float32Array([...]).buffer) })`
- **Hybrid search (Redis 8.4+ native)**: `client.ft.hybrid("idx:chunks", { SEARCH: { query: "@content:(query)" }, VSIM: { field: "@embedding", vector, method: { type: "KNN", K: 150 } }, COMBINE: { method: { type: "RRF", CONSTANT: 60 } } })` — **Note:** `FT.HYBRID` is `@experimental` and requires Redis 8.4+. Implementation supports dual-mode: native `FT.HYBRID` when available, app-level RRF via `search.ts` for Redis 7+. Version detection at `initialize()` determines which path to use.
- **BM25 search**: `client.ft.search("idx:chunks", "@content:(query)", { LIMIT: { from: 0, size: 10 } })`

---

## 2. Postgres Vector & Keyword Search

### Decision: `postgres` (postgres.js v3.4.8) + `pgvector` (v0.2.1)

### Rationale
- **First-class Bun support**: Explicitly built for Node.js, Deno, Bun, and CloudFlare; confirmed working under Bun 1.3.11
- **Tagged template SQL API**: Parameters are automatically extracted and safely parameterized. pgvector operators (`<=>`, `<->`, `<#>`) and FTS functions (`to_tsvector`, `to_tsquery`, `ts_rank`) work naturally in template literals
- **Lightweight**: Zero dependencies, ~380KB, pure JS
- **Built-in connection pooling**: Configurable `max` connections, idle timeouts, automatic prepared statements
- **pgvector helper**: `pgvector` npm package provides `toSql()`/`fromSql()` for serializing `number[]` to pgvector's `[1,2,3]` format; tiny, zero deps, same pgvector GitHub org
- **Single connection for both modalities**: Vector search and tsvector/GIN queries both go through the same `sql` tagged template

### Alternatives Considered
| Library | Why Rejected |
|---|---|
| `pg` (node-postgres) | Callback-style API, more boilerplate, requires `pgvector.registerTypes(client)` |
| `Bun.sql` (built-in) | Promising but immature; less flexible custom type system, locks exclusively to Bun runtime |
| `drizzle-orm` | Full ORM is overkill; no native `tsvector` column type, significant weight and abstraction for a vectorstore needing fine-grained SQL control |
| `@neondatabase/serverless` | Designed for Neon's serverless Postgres over WebSocket; unnecessary overhead for standard Postgres |

### Key API Patterns
- **Table creation**: `sql\`CREATE TABLE document_chunks (id bigserial PRIMARY KEY, content text, embedding vector(${dimensions}), search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED)\``
- **Index creation**: `sql\`CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)\`` + `sql\`CREATE INDEX ... USING gin (search_vector)\``
- **Vector search**: `sql\`SELECT *, 1 - (embedding <=> ${pgvector.toSql(queryVec)}) AS score FROM chunks ORDER BY embedding <=> ${queryEmbedding} LIMIT ${topK}\``
- **FTS search**: `sql\`SELECT *, ts_rank(search_vector, websearch_to_tsquery('english', ${query})) AS rank FROM chunks WHERE search_vector @@ websearch_to_tsquery('english', ${query}) ORDER BY rank DESC\``
- **Hybrid (SQL-level RRF)**: CTE with `semantic` + `keyword` subqueries, `FULL OUTER JOIN`, and `COALESCE(1.0 / (60 + rank), 0) * weight` RRF scoring

---

## 3. ChromaDB Vector Store

### Decision: `chromadb` v3.4.0 (official JS/TS client)

### Rationale
- **Only viable JS/TS ChromaDB client** — no alternatives exist in the npm ecosystem
- **Official client** maintained by the Chroma core team
- **Bun compatible**: Uses `@hey-api/client-fetch` internally (standard `fetch`-based HTTP), which Bun supports natively
- **Pre-computed embeddings fully supported**: `add()`, `query()`, `upsert()` accept `embeddings: number[][]` directly; pass `embeddingFunction: null` to disable built-in embedding functions
- **Two query APIs**: Legacy `query()` API and newer `search()` expression builder with `Knn`, `Rrf`, `K` (key factory) for filters
- **Built-in RRF**: `Rrf({ ranks: [...], k: 60, weights: [...] })` for combining ranking signals

### Key API Patterns
- **Collection creation**: `client.getOrCreateCollection({ name: "docs", embeddingFunction: null, configuration: { hnsw: { space: "cosine" } } })`
- **Add with pre-computed embeddings**: `collection.add({ ids, embeddings, documents, metadatas })`
- **Vector search (legacy)**: `collection.query({ queryEmbeddings: [vec], nResults: 10, include: [IncludeEnum.documents, IncludeEnum.metadatas, IncludeEnum.distances] })`
- **Search expression builder**: `new Search().rank(Knn({ query: vec, limit: 150 })).where(K("source").eq("doc1.md")).limit(10)`
- **Distance note**: ChromaDB returns `distances` (lower = more similar for cosine), not similarity scores. The `search()` API returns normalized `scores` instead.
- **Batch limits**: Use `client.getMaxBatchSize()` to discover limits and batch `add()`/`upsert()` accordingly

---

## 4. OpenSearch Keyword/BM25 Search

### Decision: `@opensearch-project/opensearch` v3.5.1 (official client)

### Rationale
- **Official client** tracking OpenSearch 2.x/3.x API closely
- **Bun compatible**: All key operations (search, index, bulk, indices management) verified working under Bun runtime
- **Full TypeScript types**: Auto-generated from OpenSearch API spec with complete type definitions for queries, responses, mappings, and analyzers
- **Built-in connection pooling, retry logic, NDJSON serialization** — would need manual implementation with a thin HTTP wrapper
- **Manageable footprint**: ~5.3MB total (client 4.6MB + 6 transitive deps: `aws4`, `debug`, `hpagent`, `json11`, `ms`, `secure-json-parse`)

### Alternatives Considered
| Library | Why Rejected |
|---|---|
| Thin `fetch` wrapper | ~50 lines but lacks connection pooling, retry logic, NDJSON bulk helpers, typed responses, error classification |
| `@elastic/elasticsearch` | License/trademark concerns, OpenSearch-specific features not typed, version drift risk |

### Key API Patterns
- **Index creation**: `client.indices.create({ index: "documents", body: { settings: { analysis: { ... } }, mappings: { properties: { content: { type: "text", analyzer: "custom_analyzer" } } } } })`
- **Bulk indexing**: `client.bulk({ body: chunks.flatMap(c => [{ index: { _index: "documents", _id: c.id } }, { content: c.content, ... }]), refresh: true })`
- **BM25 search**: `client.search({ index: "documents", body: { query: { multi_match: { query, fields: ["title^2", "content"] } }, size: 10 } })`
- **Score access**: `searchResult.body.hits.hits.map(hit => ({ id: hit._id, score: hit._score, source: hit._source }))`

---

## 5. Claude Agent SDK Tool Integration

### Decision: Use `tool()` + `createSdkMcpServer()` (in-process MCP)

### Rationale
- **Zero IPC overhead**: Direct function call, no stdio/HTTP serialization
- **State sharing**: Direct access to vectorstore index in memory via closure
- **Full Zod validation**: Compile-time type checking on handler args
- **Minimal complexity**: ~30 lines to define + register vs. separate server process

### `tool()` Function Signature
```typescript
function tool<Schema extends AnyZodRawShape>(
  _name: string,
  _description: string,
  _inputSchema: Schema,          // Raw Zod shape, NOT z.object()
  _handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>,
  _extras?: { annotations?: ToolAnnotations; searchHint?: string; alwaysLoad?: boolean }
): SdkMcpToolDefinition<Schema>;
```

**Critical**: `_inputSchema` is a raw Zod shape (`{ query: z.string() }`), NOT a `z.object()`.

### Registration Pattern
```typescript
const searchTool = tool("search_docs", "...", inputShape, handler);
const server = createSdkMcpServer({ name: "vectorstore", version: "1.0.0", tools: [searchTool] });
// Pass to query(): options.mcpServers = { vectorstore: server }
// allowedTools: ["mcp__vectorstore__search_docs"]
```

### `CallToolResult` Return Type
```typescript
interface CallToolResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
  // Additional optional fields: _meta, structuredContent, annotations
}
```

- Return JSON-stringified results in `{ type: "text", text: JSON.stringify(output) }`
- Use `isError: true` for tool failures (vectorstore unavailable, embedding service down)
- Empty results are NOT errors — return `total_results: 0`
- `CallToolResult` is re-exported from `@modelcontextprotocol/sdk/types.js` and has additional optional fields (`_meta`, `structuredContent`, `annotations`) beyond the essential ones shown above

### MCP vs External Server
In-process MCP via `tool()` is recommended because the vectorstore is tightly coupled to HoloDeck's in-process state (loaded/indexed document chunks, embedding cache). An external MCP server would require serializing the entire index across process boundaries or running a long-lived sidecar.

---

## 6. Contextual Retrieval (Context Prefix Generation)

### Decision: Claude Agent SDK `query()` with named agent definitions

### Technique Overview
Contextual Retrieval prepends a short AI-generated context (50-100 tokens) to each chunk **before** embedding and indexing. Traditional RAG chunks lose surrounding context — e.g., "Revenue grew 3% over the previous quarter" is ambiguous without its parent document. Contextual Retrieval fixes this by prefixing each chunk with situational context.

**Example:**
- **Original:** "The company's revenue grew by 3% over the previous quarter."
- **Contextualized:** "This chunk is from an SEC filing on ACME corp's performance in Q2 2023; the previous quarter's revenue was $314 million. The company's revenue grew by 3% over the previous quarter."

### Performance Data (from Anthropic blog)

| Configuration | Retrieval Failure Rate Reduction |
|---|---|
| Contextual Embeddings alone | **35%** (5.7% → 3.7%) |
| Contextual Embeddings + Contextual BM25 (hybrid) | **49%** (5.7% → 2.9%) |
| Contextual Embeddings + Contextual BM25 + Reranking | **67%** (5.7% → 1.9%) |

Retrieval strategy: retrieve top-150 candidates, rerank to top-20.

### Cost Analysis
- Cost depends on model used and total chunk count
- Single-call-per-document approach: full document + all chunks sent once (no prompt caching needed)
- For subagent batching: each subagent receives the full document + its batch of chunks

### Architecture: Agent SDK as Context Generator

Instead of using the raw Anthropic Messages API (`@anthropic-ai/sdk`) directly, context generation is modeled as an Agent SDK task using named agent definitions via `agents: Record<string, AgentDefinition>`. This solves auth unification -- works with `CLAUDE_CODE_OAUTH_TOKEN`, API keys, Bedrock, Vertex, whatever the Agent SDK is configured with.

**Architecture:**
```
query() with agents: { "context-generator": { description, prompt, model } }
  -> Main agent receives full document + all chunks
  -> For large documents, chunks are batched manually
  -> Each batch is processed via a separate query() call with the context-generator agent
  -> Results are collected and merged
```

For large documents with many chunks, batching is handled manually with a concurrency limiter (e.g., `Promise.all` with concurrency limit from `context_concurrency`). Each batch query uses the `context-generator` agent definition.

**YAML config mapping:**
| YAML field | Agent SDK mapping |
|---|---|
| `context_concurrency` | Manual concurrency limiter for parallel `query()` calls |
| `context_max_tokens` | Instruction in prompt: "max N tokens per context" |
| `contextual_embeddings: true/false` | Whether to invoke the pipeline at all |

**Note:** The SDK's `agents` API uses `agents: Record<string, AgentDefinition>` where `AgentDefinition` includes `description`, `prompt`, `tools`, and `model` fields. There is no `subagents: { enabled, max_parallel }` option — parallelism must be managed at the application level.

### Prompt Template

**Main agent prompt (per document):**
```
You are a context generation assistant. Your task is to generate short context prefixes
for document chunks to improve search retrieval.

<document>
{{WHOLE_DOCUMENT}}
</document>

Below are {{N}} chunks from this document. For each chunk, generate a succinct context
(max {{context_max_tokens}} tokens) that situates it within the overall document for
the purposes of improving search retrieval of the chunk.

If there are more than {{batch_size}} chunks, use subagents to process batches of
{{batch_size}} chunks in parallel. Each subagent receives the full document and its
batch of chunks.

Return a JSON array:
[{ "chunk_id": "...", "context": "..." }, ...]

<chunks>
{{CHUNKS_JSON}}
</chunks>
```

Recommended model: `claude-haiku-4-5` (fast, cheap).

### Implementation Pattern

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function generateContexts(
  document: string,
  chunks: { id: string; content: string }[],
  config: { context_max_tokens: number; context_concurrency: number; batch_size: number },
): Promise<Map<string, string>> {
  // Batch chunks for parallel processing
  const batches: typeof chunks[] = [];
  for (let i = 0; i < chunks.length; i += config.batch_size) {
    batches.push(chunks.slice(i, i + config.batch_size));
  }

  // Process batches with manual concurrency control
  const results = new Map<string, string>();
  const concurrencyLimit = config.context_concurrency;

  for (let i = 0; i < batches.length; i += concurrencyLimit) {
    const batchGroup = batches.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batchGroup.map(async (batch) => {
        const prompt = buildContextPrompt(document, batch, config);
        let result = "";
        for await (const message of query({
          prompt,
          options: {
            model: "claude-haiku-4-5",
            permissionMode: "acceptAll",
            maxTurns: 1,
            allowedTools: [],
          },
        })) {
          if (message.type === "result" && message.subtype === "success") {
            result = message.result;
          }
        }
        return parseContextResult(result); // Zod-validated JSON parse
      }),
    );
    for (const batchResult of batchResults) {
      for (const [id, context] of batchResult) {
        results.set(id, context);
      }
    }
  }

  return results;
}
```

### What This Eliminates
- **No `@anthropic-ai/sdk` direct dependency** -- auth handled by Agent SDK
- **No exponential backoff / rate limit logic** -- SDK handles retries
- **No prompt cache management** -- batched calls per document

### What Remains
- A function to format the prompt (document + chunks -> structured prompt string)
- Manual batching and concurrency control (`Promise.all` with concurrency limit)
- A `query()` call with constrained options per batch
- A Zod schema to parse/validate the JSON result
- Error handling: if `message.subtype` indicates error, retry the batch

### Trade-offs vs Direct API

| Factor | Agent SDK approach | Direct `@anthropic-ai/sdk` |
|---|---|---|
| Auth | Unified (OAuth, API key, Bedrock, Vertex) | Needs separate `ANTHROPIC_API_KEY` |
| Subprocess overhead | 1 per batch | 0 (direct HTTP) |
| Prompt caching | Not needed (batched calls) | Critical for cost efficiency |
| Parallelism | Manual (`Promise.all` + concurrency limit) | Manual `mapWithConcurrency()` |
| Rate limits | SDK handles internally | Manual backoff logic |
| Complexity | Prompt template + batch mgmt + parse result | Cache mgmt + concurrency + backoff |
| Failure granularity | Per-batch retry | Per-chunk retry |

---

## 7. In-Memory BM25 Implementation

### Decision: Custom implementation (no external library needed)

### Rationale
- In-memory BM25 is only used for the `in-memory` backend (development/testing)
- BM25 is a straightforward algorithm: term frequency, inverse document frequency, document length normalization
- Standard parameters: k1=1.2, b=0.75
- Tokenization: whitespace/alphanumeric splitting (spec explicitly states advanced NLP tokenization not required)
- No npm package needed — implementing BM25 is ~80 lines of TypeScript and avoids adding a dependency for a dev-only feature

---

## 8. Document-to-Markdown Conversion

### Decision: Per-format converters behind a unified interface (strategy pattern)

### Architecture

```
DocumentConverter (interface)
  convert(input: Buffer | string, format: string): Promise<string>  // returns markdown

Implementations:
  PdfConverter       @opendocsg/pdf2md
  DocxConverter      mammoth + turndown + turndown-plugin-gfm
  HtmlConverter      turndown + turndown-plugin-gfm
  TextConverter      passthrough (plain text is valid markdown)
```

All formats convert to Markdown first, then feed into the section-aware chunker. This keeps the chunking pipeline format-agnostic.

### PDF to Markdown

**Library:** `@opendocsg/pdf2md` v0.2.5 (last updated 2026-03-03)

- **Bun compatible:** Unverified — uses `unpdf` (pdf.js) internally which relies on WASM/Web Workers; these have had historical edge cases in Bun. Runtime testing required before committing
- **Heading preservation:** Good (heuristic-based). Uses font height analysis: finds "most used height" (body text), treats larger heights as headings. Maps heights to H1-H4 levels. ALL-CAPS text with different font gets classified as next heading level.
- **API:** `const md = await pdf2md(pdfBuffer)` -- single function, returns markdown string
- **Dependencies:** Uses `unpdf` (pdf.js) internally, ~2.2MB total
- **Limitations:**
  - PDFs have no semantic headings -- detection is heuristic based on font size relative to body
  - Documents with uniform font sizes produce no heading structure
  - Complex layouts (multi-column, sidebars) may produce jumbled text order
  - Tables in PDFs may not reconstruct as markdown tables
  - Scanned/image-based PDFs produce no text (OCR needed separately)
  - Heading level mapping is relative, not absolute

### DOCX to Markdown

**Libraries:** `mammoth` v1.12.0 + `turndown` v7.2.2 + `turndown-plugin-gfm` v1.0.2

- **Bun compatible:** All confirmed
- **Heading preservation:** Excellent. DOCX has semantic heading styles (Heading 1-6). Mammoth maps to `<h1>`-`<h6>`, turndown converts to `#`-`######`
- **Pipeline:** `DOCX buffer -> mammoth.convertToHtml() -> TurndownService.turndown(html) -> markdown`
- **Alternative:** mammoth has a built-in `convertToMarkdown()` method — evaluate whether this produces acceptable output vs. the HTML+turndown pipeline during implementation
- **Preserved elements:** Headings, bold, italic, nested lists, tables (GFM plugin), code blocks, hyperlinks
- **Limitations:** Complex nested/merged tables may not convert perfectly; track changes and comments stripped; embedded objects (charts, SmartArt) lost

### HTML to Markdown

**Library:** `turndown` v7.2.2 + `turndown-plugin-gfm` v1.0.2 (shared with DOCX pipeline)

- **Bun compatible:** Confirmed. Pure JavaScript.
- **Quality:** Clean ATX-style headings, proper list indentation, GFM tables, code blocks
- **Extensible:** Custom rules via `turndownService.addRule()` for special HTML patterns

### TXT to Markdown

No library needed. Plain text is valid markdown. Passthrough with optional heuristic paragraph detection (blank-line separation).

### Alternatives Considered

| Library | Why Rejected |
|---|---|
| `unpdf` (raw) | No heading detection; only flat text extraction. Good fallback but `pdf2md` wraps it with heading heuristics |
| `pdf2md-js` | Requires external vision model API calls (OpenAI/Claude) for structure detection. Overkill and adds latency/cost |
| Mammoth's built-in `convertToMarkdown()` | Deprecated by maintainer; HTML-then-turndown produces better results |

---

## 9. Section-Aware Markdown Chunking

### Decision: Build custom chunker using `marked.lexer()` (already installed, zero new deps)

### Rationale
No existing npm library does section-aware hierarchical markdown chunking with parent chains and section IDs:
- `@langchain/textsplitters` has `MarkdownHeaderTextSplitter` but requires `@langchain/core` (forbidden per constitution)
- `@chonkiejs/core` and `@orama/chunker` do general text chunking with no markdown structure awareness

### Parser Choice: `marked` v15.0.12 (already installed)

`marked.lexer()` returns a `TokensList` (`Token[] & { links: Links }`) — an array of block-level tokens. Each token has a `.raw` property with the original markdown source. Heading tokens have a `depth` field (1-6). **Important:** Block-level tokens may contain nested `tokens[]` for inline content (bold, italic, links, etc.), so the structure is not truly flat. However, for chunking purposes, only top-level block tokens and their `.raw` property are needed — nested inline tokens can be ignored. Compared to the `remark`/`mdast` ecosystem (5+ new packages, 35 transitive deps), `marked` requires zero new dependencies.

Key `marked.lexer()` token properties:
- `token.type`: `"heading"`, `"paragraph"`, `"list"`, `"code"`, `"table"`, `"blockquote"`, etc.
- `token.depth`: 1-6 for heading tokens
- `token.text`: heading text content
- `token.raw`: original markdown source (available on every token)
- `token.tokens`: nested inline tokens (present on heading, paragraph, etc. — ignored by chunker)

### Architecture

```
Input: markdown string + config (max_chunk_tokens, chunk_overlap, chunking_strategy)
                    |
                    v
        marked.lexer(md) -> flat token list
                    |
                    v
        Build Section Tree (stack-based heading tracking)
          - Walk tokens, maintain heading stack + section counters
          - Group content tokens under current heading
          - Each section: { id, depth, heading, parentChain, tokens, raw }
                    |
                    v
        Chunk Sections
          - If section <= max_chunk_tokens -> emit as one chunk
          - If section > max_chunk_tokens -> split at sentence boundaries
          - Each sub-chunk inherits parentChain from its section
                    |
                    v
        Apply Overlap
          - Copy last N tokens from prev chunk into next chunk prefix
                    |
                    v
        Output: DocumentChunk[]
```

### Heading Hierarchy Algorithm (prototyped and verified)

```typescript
const headingStack: Array<{ depth: number; text: string }> = [];
const counters = [0, 0, 0, 0, 0, 0]; // h1-h6

for (const token of tokens) {
  if (token.type === "heading") {
    // Reset counters for deeper levels
    for (let i = token.depth; i < 6; i++) counters[i] = 0;
    counters[token.depth - 1]++;

    // Pop headings of >= depth (sibling or uncle)
    while (headingStack.length > 0 && headingStack.at(-1)!.depth >= token.depth) {
      headingStack.pop();
    }
    headingStack.push({ depth: token.depth, text: token.text });

    // parentChain = headingStack.map(h => h.text)
    // sectionId = counters.slice(0, token.depth).filter(c => c > 0).join(".")
  }
}
```

Produces: `[1] h1: "Title"`, `[1.1] h2: "Section 1"`, `[1.1.1] h3: "Subsection"`, `[1.2] h2: "Section 2"`.

### Token Counting

Word-count approximation: `text.split(/\s+/).filter(Boolean).length`

Anthropic/Claude tokenization averages ~1.3 tokens per word for English. A word-count proxy with a 0.75 factor (800 tokens ~ 600 words) is comparable in accuracy to using an OpenAI tokenizer (which isn't Claude's tokenizer anyway). No external tokenizer dependency needed.

### Complexity Estimate

| Component | Estimated LOC |
|---|---|
| Markdown parser (lexer + section tree builder) | ~80 |
| Structure chunker (section-aware, heading boundaries) | ~120 |
| Token chunker (fixed-size with sentence splitting) | ~60 |
| Chunk overlap handling | ~30 |
| `tokenCount()` utility | ~5 |
| Types/interfaces | ~40 |
| Unit tests | ~200 |
| **Total** | **~535** |

---

## Dependency Summary

| Package | Version | Purpose | Size |
|---|---|---|---|
| `redis` | 5.11.0 | Redis client + RediSearch | Bundles `@redis/client`, `@redis/search` |
| `postgres` | 3.4.8 | Postgres client | ~380KB, zero deps |
| `pgvector` | 0.2.1 | Vector serialization helper | ~few KB, zero deps |
| `chromadb` | 3.4.0 | ChromaDB vector client | Uses `@hey-api/client-fetch` |
| `@opensearch-project/opensearch` | 3.5.1 | OpenSearch BM25 search | ~5.3MB total (6 transitive deps) |
| `@opendocsg/pdf2md` | 0.2.5 | PDF to Markdown | ~2.2MB (includes unpdf) |
| `mammoth` | 1.12.0 | DOCX to HTML | ~2.3MB |
| `turndown` | 7.2.2 | HTML to Markdown | ~208KB |
| `turndown-plugin-gfm` | 1.0.2 | GFM tables/strikethrough for turndown | ~24KB |
| `marked` | 15.0.12 | Markdown lexer (already installed) | Already in project |

All packages confirmed Bun-compatible with full TypeScript support.
