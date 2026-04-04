# Vectorstore Foundation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all foundational primitives for the hierarchical document vectorstore: core types, document converters, markdown chunker, embedding providers, and config schema updates.

**Architecture:** Strategy-pattern converters (PDF, DOCX, HTML, TXT) produce markdown. A `marked.lexer()`-based chunker splits markdown into structure-aware `DocumentChunk[]` with heading hierarchy. Embedding providers (Ollama, Azure OpenAI) vectorize chunks. All exposed via factory functions. Config schema extended with `EmbeddingProviderSchema` and `KeywordSearchConfigSchema`.

**Tech Stack:** TypeScript 5.8.3 (strict), Bun runtime, Zod 4.3.6, marked 15.0.12, mammoth, turndown, @opendocsg/pdf2md

---

## File Structure

```
src/tools/vectorstore/               # NEW directory (replaces vectorstore.ts)
  converters/
    types.ts                         # DocumentConverter interface, ConvertOptions type
    text.ts                          # TextConverter (passthrough)
    html.ts                          # HtmlConverter (turndown + GFM)
    docx.ts                          # DocxConverter (mammoth + turndown)
    pdf.ts                           # PdfConverter (@opendocsg/pdf2md or stub)
    factory.ts                       # getConverter() factory
    index.ts                         # Re-exports
  backends/
    types.ts                         # VectorStoreBackend, KeywordSearchBackend interfaces
  embeddings/
    types.ts                         # EmbeddingProvider interface
    ollama.ts                        # OllamaEmbeddingProvider
    azure-openai.ts                  # AzureOpenAIEmbeddingProvider
    factory.ts                       # createEmbeddingProvider() factory
    index.ts                         # Re-exports
  types.ts                           # DocumentChunk, SearchResult, SearchResponse Zod schemas
  chunker.ts                         # MarkdownChunker (~535 LOC)

src/config/schema.ts                 # MODIFY: add KeywordSearchConfig, EmbeddingProvider, context_model
src/lib/errors.ts                    # MODIFY: extend ToolError with backend/operation fields

tests/unit/tools/vectorstore/
  converters/
    text.test.ts
    html.test.ts
    docx.test.ts
    pdf.test.ts
    factory.test.ts
  embeddings/
    ollama.test.ts
    azure-openai.test.ts
    factory.test.ts
  types.test.ts
  chunker.test.ts
tests/unit/config/schema.test.ts     # MODIFY: add new schema tests
tests/fixtures/docs/                 # NEW: test fixture documents
```

---

## Task 1: Delete vectorstore.ts and Create Directory Structure

**Files:**
- Delete: `src/tools/vectorstore.ts`
- Create: `src/tools/vectorstore/` directory tree
- Create: `tests/unit/tools/vectorstore/` directory tree
- Create: `tests/fixtures/docs/` directory

- [ ] **Step 1: Delete the existing empty vectorstore.ts file**

```bash
rm src/tools/vectorstore.ts
```

This file currently contains only `export {};` and must be removed because a file and directory cannot share the same name.

- [ ] **Step 2: Create the vectorstore directory structure**

```bash
mkdir -p src/tools/vectorstore/converters
mkdir -p src/tools/vectorstore/backends
mkdir -p src/tools/vectorstore/embeddings
```

- [ ] **Step 3: Create test directory structure**

```bash
mkdir -p tests/unit/tools/vectorstore/converters
mkdir -p tests/unit/tools/vectorstore/embeddings
mkdir -p tests/fixtures/docs
```

- [ ] **Step 4: Install dev dependency**

```bash
bun add --dev @types/turndown
```

All production dependencies (`redis`, `chromadb`, `@opensearch-project/opensearch`, `@opendocsg/pdf2md`, `mammoth`, `turndown`, `turndown-plugin-gfm`) are already installed in `package.json`.

- [ ] **Step 5: Verify structure**

Run: `ls -R src/tools/vectorstore/ && ls -R tests/unit/tools/vectorstore/`
Expected: Empty directories for converters, backends, embeddings under both src and tests.

- [ ] **Step 6: Commit**

```bash
git add -A src/tools/vectorstore/ tests/unit/tools/vectorstore/ tests/fixtures/docs/ package.json bun.lockb
git commit -m "chore(vectorstore): scaffold directory structure and install @types/turndown

Remove empty vectorstore.ts to make way for vectorstore/ directory.
Create converter, backend, and embedding subdirectories."
```

---

## Task 2: Extend ToolError with Backend Context Fields

**Files:**
- Modify: `src/lib/errors.ts:17-22`
- Test: `tests/unit/lib/errors.test.ts` (create if not exists, otherwise add tests)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lib/errors.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { ToolError } from "../../../src/lib/errors.js";

describe("ToolError", () => {
	it("stores backend and operation fields", () => {
		const err = new ToolError("connection failed", {
			backend: "redis",
			operation: "initialize",
		});
		expect(err.message).toBe("connection failed");
		expect(err.backend).toBe("redis");
		expect(err.operation).toBe("initialize");
		expect(err.name).toBe("ToolError");
	});

	it("works without backend/operation (backward compatible)", () => {
		const err = new ToolError("generic error");
		expect(err.message).toBe("generic error");
		expect(err.backend).toBeUndefined();
		expect(err.operation).toBeUndefined();
	});

	it("preserves cause when provided with backend context", () => {
		const cause = new Error("socket closed");
		const err = new ToolError("connection failed", {
			cause,
			backend: "postgres",
			operation: "search",
		});
		expect(err.cause).toBe(cause);
		expect(err.backend).toBe("postgres");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/lib/errors.test.ts`
Expected: FAIL — `backend` and `operation` properties don't exist on ToolError.

- [ ] **Step 3: Implement the ToolError extension**

Modify `src/lib/errors.ts`. Replace the existing ToolError class (lines 17-22) with:

```typescript
export interface ToolErrorOptions extends ErrorOptions {
	backend?: string;
	operation?: string;
}

export class ToolError extends HoloDeckError {
	readonly backend?: string;
	readonly operation?: string;

	constructor(message: string, options?: ToolErrorOptions) {
		super(message, options);
		this.name = "ToolError";
		this.backend = options?.backend;
		this.operation = options?.operation;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/lib/errors.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Run existing tests to check no regressions**

Run: `bun test`
Expected: All existing tests pass — ToolError constructor signature is backward compatible (ToolErrorOptions extends ErrorOptions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/errors.ts tests/unit/lib/errors.test.ts
git commit -m "feat(vectorstore): extend ToolError with backend and operation fields

Add optional backend/operation context to ToolError for vectorstore
error diagnostics. Backward compatible — existing callers unaffected."
```

---

## Task 3: Define Converter Interface and Types

**Files:**
- Create: `src/tools/vectorstore/converters/types.ts`

- [ ] **Step 1: Create the converter types file**

Create `src/tools/vectorstore/converters/types.ts`:

```typescript
export interface ConvertOptions {
	/** Source file path (for logging/error context) */
	readonly sourcePath?: string;
}

export interface DocumentConverter {
	/** Convert a document buffer to markdown string */
	convert(input: Buffer, options?: ConvertOptions): Promise<string>;
	/** Check if this converter supports the given file extension (with leading dot) */
	supports(extension: string): boolean;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/vectorstore/converters/types.ts
git commit -m "feat(vectorstore): define DocumentConverter interface and ConvertOptions type"
```

---

## Task 4: Define Backend Interfaces

**Files:**
- Create: `src/tools/vectorstore/backends/types.ts`

- [ ] **Step 1: Create the backend types file**

Create `src/tools/vectorstore/backends/types.ts`:

```typescript
export interface VectorSearchHit {
	/** Chunk ID */
	readonly id: string;
	/** Similarity score (0.0-1.0, higher = more similar) */
	readonly score: number;
}

export interface KeywordSearchHit {
	/** Chunk ID */
	readonly id: string;
	/** BM25/relevance score (normalized to 0.0-1.0) */
	readonly score: number;
}

export interface VectorStoreBackend {
	/** Create indexes/collections, verify connectivity */
	initialize(): Promise<void>;
	/** Insert or update chunks with embeddings */
	upsert(chunks: IndexableChunk[]): Promise<void>;
	/** Vector similarity search */
	search(embedding: number[], topK: number): Promise<VectorSearchHit[]>;
	/** Remove chunks by ID */
	delete(ids: string[]): Promise<void>;
	/** Clean up connections */
	close(): Promise<void>;
}

export interface IndexableChunk {
	readonly id: string;
	readonly content: string;
	readonly embedding: number[];
	readonly metadata: Record<string, unknown>;
}

export interface KeywordSearchBackend {
	/** Create indexes, verify connectivity */
	initialize(): Promise<void>;
	/** Index chunks for keyword search */
	index(chunks: IndexableTextChunk[]): Promise<void>;
	/** BM25/full-text search */
	search(query: string, topK: number): Promise<KeywordSearchHit[]>;
	/** Remove entries by ID */
	delete(ids: string[]): Promise<void>;
	/** Clean up connections */
	close(): Promise<void>;
}

export interface IndexableTextChunk {
	readonly id: string;
	readonly content: string;
	readonly metadata: Record<string, unknown>;
}

export interface VectorStoreConfig {
	readonly dimensions: number;
	readonly collectionName: string;
}

export interface KeywordSearchConfig {
	readonly indexName: string;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/vectorstore/backends/types.ts
git commit -m "feat(vectorstore): define VectorStoreBackend and KeywordSearchBackend interfaces"
```

---

## Task 5: Define EmbeddingProvider Interface

**Files:**
- Create: `src/tools/vectorstore/embeddings/types.ts`

- [ ] **Step 1: Create the embedding types file**

Create `src/tools/vectorstore/embeddings/types.ts`:

```typescript
export interface EmbeddingProvider {
	/** Batch embed text strings, returns one vector per input */
	embed(texts: string[]): Promise<number[][]>;
	/** Return the dimensionality of the embeddings this provider produces */
	dimensions(): number;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/vectorstore/embeddings/types.ts
git commit -m "feat(vectorstore): define EmbeddingProvider interface"
```

---

## Task 6: Define DocumentChunk and Search Zod Schemas

**Files:**
- Create: `src/tools/vectorstore/types.ts`
- Test: `tests/unit/tools/vectorstore/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/vectorstore/types.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
	DocumentChunkSchema,
	SearchResponseSchema,
	SearchResultSchema,
	type DocumentChunk,
	type SearchResult,
} from "../../../../src/tools/vectorstore/types.js";

describe("DocumentChunkSchema", () => {
	const validChunk: DocumentChunk = {
		id: "doc1:0",
		document_id: "doc1",
		content: "Some content here",
		parent_chain: ["Getting Started", "Installation"],
		section_id: "1.2",
		subsection_ids: ["1.2.1"],
		chunk_type: "CONTENT",
		chunk_index: 0,
		source_path: "docs/guide.md",
		token_count: 15,
		embedding: [0.1, 0.2, 0.3],
		file_modified_at: 1712000000000,
	};

	it("parses a valid content chunk", () => {
		const result = DocumentChunkSchema.safeParse(validChunk);
		expect(result.success).toBe(true);
	});

	it("parses a header chunk with heading_level", () => {
		const result = DocumentChunkSchema.safeParse({
			...validChunk,
			chunk_type: "HEADER",
			heading_level: 2,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.heading_level).toBe(2);
		}
	});

	it("accepts optional contextualized_content", () => {
		const result = DocumentChunkSchema.safeParse({
			...validChunk,
			contextualized_content: "This chunk is about installing the CLI tool. Some content here",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.contextualized_content).toBeDefined();
		}
	});

	it("allows empty parent_chain (root-level content)", () => {
		const result = DocumentChunkSchema.safeParse({
			...validChunk,
			parent_chain: [],
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid chunk_type", () => {
		const result = DocumentChunkSchema.safeParse({
			...validChunk,
			chunk_type: "INVALID",
		});
		expect(result.success).toBe(false);
	});

	it("rejects negative token_count", () => {
		const result = DocumentChunkSchema.safeParse({
			...validChunk,
			token_count: -1,
		});
		expect(result.success).toBe(false);
	});
});

describe("SearchResultSchema", () => {
	const validResult: SearchResult = {
		content: "Some result content",
		score: 0.85,
		source_path: "docs/guide.md",
		parent_chain: ["Getting Started"],
		section_id: "1",
		subsection_ids: [],
		chunk_index: 0,
		is_exact_match: false,
	};

	it("parses a valid search result", () => {
		const result = SearchResultSchema.safeParse(validResult);
		expect(result.success).toBe(true);
	});

	it("accepts optional modality scores", () => {
		const result = SearchResultSchema.safeParse({
			...validResult,
			semantic_score: 0.9,
			keyword_score: 0.7,
			exact_score: 0.0,
		});
		expect(result.success).toBe(true);
	});

	it("rejects score outside 0-1 range", () => {
		expect(
			SearchResultSchema.safeParse({ ...validResult, score: 1.5 }).success,
		).toBe(false);
		expect(
			SearchResultSchema.safeParse({ ...validResult, score: -0.1 }).success,
		).toBe(false);
	});
});

describe("SearchResponseSchema", () => {
	it("parses a valid search response", () => {
		const result = SearchResponseSchema.safeParse({
			query: "how to install",
			search_mode: "hybrid",
			total_results: 1,
			results: [
				{
					content: "Install via npm",
					score: 0.9,
					source_path: "README.md",
					parent_chain: [],
					section_id: "1",
					subsection_ids: [],
					chunk_index: 0,
					is_exact_match: false,
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("accepts degraded flag with details", () => {
		const result = SearchResponseSchema.safeParse({
			query: "test",
			search_mode: "hybrid",
			total_results: 0,
			results: [],
			degraded: true,
			degraded_details: "Keyword search backend unavailable",
		});
		expect(result.success).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schemas**

Create `src/tools/vectorstore/types.ts`:

```typescript
import { z } from "zod";

export const DocumentChunkSchema = z.strictObject({
	id: z.string().min(1),
	document_id: z.string().min(1),
	content: z.string(),
	contextualized_content: z.string().optional(),
	parent_chain: z.array(z.string()),
	section_id: z.string().min(1),
	subsection_ids: z.array(z.string()),
	chunk_type: z.enum(["CONTENT", "HEADER"]),
	chunk_index: z.number().int().min(0),
	source_path: z.string().min(1),
	heading_level: z.number().int().min(1).max(6).optional(),
	token_count: z.number().int().positive(),
	embedding: z.array(z.number()),
	file_modified_at: z.number().int().positive(),
});

export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;

export const SearchResultSchema = z.strictObject({
	content: z.string(),
	score: z.number().min(0).max(1),
	semantic_score: z.number().min(0).max(1).optional(),
	keyword_score: z.number().min(0).max(1).optional(),
	exact_score: z.number().min(0).max(1).optional(),
	source_path: z.string().min(1),
	parent_chain: z.array(z.string()),
	section_id: z.string().min(1),
	subsection_ids: z.array(z.string()),
	chunk_index: z.number().int().min(0),
	is_exact_match: z.boolean(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.strictObject({
	query: z.string().min(1),
	search_mode: z.enum(["semantic", "keyword", "exact", "hybrid"]),
	total_results: z.number().int().min(0),
	results: z.array(SearchResultSchema),
	degraded: z.boolean().optional(),
	degraded_details: z.string().optional(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/vectorstore/types.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/vectorstore/types.ts tests/unit/tools/vectorstore/types.test.ts
git commit -m "feat(vectorstore): define DocumentChunk, SearchResult, SearchResponse Zod schemas"
```

---

## Task 7: Update Config Schema — KeywordSearchConfig, EmbeddingProvider, context_model

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `tests/unit/config/schema.test.ts`

This task adds three schema updates:
1. `KeywordSearchConfigSchema` for ChromaDB's OpenSearch sidecar
2. `EmbeddingProviderSchema` for embedding provider configuration
3. `context_model` field on `HierarchicalDocumentToolSchema`
4. `keyword_search` field on `HierarchicalDocumentToolSchema`
5. `embedding_provider` field on `AgentConfigSchema` (required when hierarchical_document tools present)

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/config/schema.test.ts` — append these new describe blocks after the existing ones:

```typescript
// Add these imports at the top (alongside existing imports):
import {
	EmbeddingProviderSchema,
	HierarchicalDocumentToolSchema,
	KeywordSearchConfigSchema,
} from "../../../src/config/schema.js";

// Add these describe blocks at the end of the file:

describe("KeywordSearchConfigSchema", () => {
	it("parses a valid OpenSearch keyword search config", () => {
		const result = KeywordSearchConfigSchema.safeParse({
			provider: "opensearch",
			url: "http://localhost:9200",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.headers).toEqual({});
			expect(result.data.request_timeout).toBe(60);
		}
	});

	it("rejects invalid URL", () => {
		const result = KeywordSearchConfigSchema.safeParse({
			provider: "opensearch",
			url: "not-a-url",
		});
		expect(result.success).toBe(false);
	});

	it("rejects unknown provider", () => {
		const result = KeywordSearchConfigSchema.safeParse({
			provider: "elasticsearch",
			url: "http://localhost:9200",
		});
		expect(result.success).toBe(false);
	});
});

describe("EmbeddingProviderSchema", () => {
	it("parses a valid Ollama config", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "ollama",
			name: "nomic-embed-text",
		});
		expect(result.success).toBe(true);
	});

	it("parses a valid Azure OpenAI config", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "azure_openai",
			name: "text-embedding-ada-002",
			endpoint: "https://myinstance.openai.azure.com",
			api_version: "2024-02-01",
			api_key: "sk-test",
		});
		expect(result.success).toBe(true);
	});

	it("rejects azure_openai without endpoint", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "azure_openai",
			name: "text-embedding-ada-002",
		});
		expect(result.success).toBe(false);
	});

	it("allows ollama without endpoint (uses default)", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "ollama",
			name: "nomic-embed-text",
		});
		expect(result.success).toBe(true);
	});
});

describe("HierarchicalDocumentToolSchema keyword_search", () => {
	const baseHierarchicalTool = {
		type: "hierarchical_document",
		name: "docs",
		description: "Search docs",
		source: "./docs",
	};

	it("accepts tool without keyword_search", () => {
		const result = HierarchicalDocumentToolSchema.safeParse(baseHierarchicalTool);
		expect(result.success).toBe(true);
	});

	it("accepts tool with keyword_search", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			...baseHierarchicalTool,
			keyword_search: {
				provider: "opensearch",
				url: "http://localhost:9200",
			},
		});
		expect(result.success).toBe(true);
	});

	it("requires keyword_search when database is chromadb", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			...baseHierarchicalTool,
			database: {
				provider: "chromadb",
				connection_string: "http://localhost:8000",
			},
		});
		expect(result.success).toBe(false);
	});

	it("accepts chromadb with keyword_search", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			...baseHierarchicalTool,
			database: {
				provider: "chromadb",
				connection_string: "http://localhost:8000",
			},
			keyword_search: {
				provider: "opensearch",
				url: "http://localhost:9200",
			},
		});
		expect(result.success).toBe(true);
	});

	it("accepts context_model override", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			...baseHierarchicalTool,
			context_model: "claude-sonnet-4-20250514",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.context_model).toBe("claude-sonnet-4-20250514");
		}
	});

	it("defaults context_model to claude-haiku-4-5", () => {
		const result = HierarchicalDocumentToolSchema.safeParse(baseHierarchicalTool);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.context_model).toBe("claude-haiku-4-5");
		}
	});
});

describe("AgentConfigSchema embedding_provider", () => {
	const minimalAgent = {
		name: "test-agent",
		model: { provider: "anthropic", name: "claude-sonnet-4-20250514" },
		instructions: { inline: "You are helpful." },
	};

	it("does not require embedding_provider when no vectorstore tools", () => {
		const result = AgentConfigSchema.safeParse(minimalAgent);
		expect(result.success).toBe(true);
	});

	it("requires embedding_provider when hierarchical_document tool present", () => {
		const result = AgentConfigSchema.safeParse({
			...minimalAgent,
			tools: [
				{
					type: "hierarchical_document",
					name: "docs",
					description: "Search docs",
					source: "./docs",
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("accepts agent with embedding_provider and vectorstore tool", () => {
		const result = AgentConfigSchema.safeParse({
			...minimalAgent,
			embedding_provider: {
				provider: "ollama",
				name: "nomic-embed-text",
			},
			tools: [
				{
					type: "hierarchical_document",
					name: "docs",
					description: "Search docs",
					source: "./docs",
				},
			],
		});
		expect(result.success).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/config/schema.test.ts`
Expected: FAIL — `KeywordSearchConfigSchema` and `EmbeddingProviderSchema` not exported.

- [ ] **Step 3: Implement schema changes**

Modify `src/config/schema.ts`. Add the following schemas and update existing ones.

After `DatabaseSchema` (line 32), add:

```typescript
export const KeywordSearchConfigSchema = z.strictObject({
	provider: z.literal("opensearch"),
	url: z.string().url(),
	headers: z.record(z.string(), z.string()).default({}),
	request_timeout: z.number().positive().default(60),
});

export type KeywordSearchConfig = z.infer<typeof KeywordSearchConfigSchema>;

export const EmbeddingProviderSchema = z
	.strictObject({
		provider: z.enum(["ollama", "azure_openai"]),
		name: z.string().min(1),
		endpoint: z.string().optional(),
		api_version: z.string().optional(),
		api_key: z.string().optional(),
	})
	.superRefine((value, context) => {
		if (value.provider === "azure_openai" && !value.endpoint) {
			context.addIssue({
				code: "custom",
				path: ["endpoint"],
				message: "endpoint is required when provider is 'azure_openai'",
			});
		}
	});

export type EmbeddingProvider = z.infer<typeof EmbeddingProviderSchema>;
```

Update `HierarchicalDocumentToolSchema` (lines 34-67) — add `keyword_search` and `context_model` fields inside the `strictObject`, and add a second `superRefine` for chromadb validation:

Replace the full `HierarchicalDocumentToolSchema` definition with:

```typescript
export const HierarchicalDocumentToolSchema = z
	.strictObject({
		type: z.literal("hierarchical_document"),
		name: z.string().regex(toolNamePattern),
		description: z.string().min(1),
		source: z.string().min(1),
		chunking_strategy: z.enum(["structure", "token"]).default("structure"),
		max_chunk_tokens: z.number().int().min(100).max(2000).default(800),
		chunk_overlap: z.number().int().min(0).max(200).default(50),
		search_mode: z.enum(["semantic", "keyword", "exact", "hybrid"]).default("hybrid"),
		top_k: z.number().int().min(1).max(100).default(10),
		min_score: z.number().min(0).max(1).optional(),
		semantic_weight: z.number().min(0).max(1).default(0.5),
		keyword_weight: z.number().min(0).max(1).default(0.3),
		exact_weight: z.number().min(0).max(1).default(0.2),
		contextual_embeddings: z.boolean().default(true),
		context_max_tokens: z.number().int().min(50).max(200).default(100),
		context_concurrency: z.number().int().min(1).max(50).default(10),
		context_model: z.string().default("claude-haiku-4-5"),
		database: DatabaseSchema.default({ provider: "in-memory" }),
		keyword_search: KeywordSearchConfigSchema.optional(),
	})
	.superRefine((value, context) => {
		if (value.search_mode === "hybrid") {
			const totalWeight = value.semantic_weight + value.keyword_weight + value.exact_weight;
			if (Math.abs(totalWeight - 1) > 1e-6) {
				context.addIssue({
					code: "custom",
					path: ["semantic_weight"],
					message:
						"In hybrid mode, semantic_weight + keyword_weight + exact_weight must equal 1.0",
				});
			}
		}

		if (value.database.provider === "chromadb" && !value.keyword_search) {
			context.addIssue({
				code: "custom",
				path: ["keyword_search"],
				message: "keyword_search is required when database.provider is 'chromadb'",
			});
		}
	});
```

Update `AgentConfigSchema` (lines 129-152) — add `embedding_provider` field and validation:

```typescript
export const AgentConfigSchema = z
	.strictObject({
		name: z.string().min(1).max(100),
		description: z.string().max(500).optional(),
		model: LLMProviderSchema,
		instructions: InstructionsSchema,
		embedding_provider: EmbeddingProviderSchema.optional(),
		tools: z.array(ToolSchema).max(50).default([]),
		claude: ClaudeConfigSchema.optional(),
	})
	.superRefine((value, context) => {
		const seen = new Set<string>();
		for (const [index, tool] of value.tools.entries()) {
			if (seen.has(tool.name)) {
				context.addIssue({
					code: "custom",
					path: ["tools", index, "name"],
					message: `Duplicate tool name '${tool.name}'`,
				});
				continue;
			}
			seen.add(tool.name);
		}

		const hasVectorstore = value.tools.some(
			(t) => t.type === "hierarchical_document",
		);
		if (hasVectorstore && !value.embedding_provider) {
			context.addIssue({
				code: "custom",
				path: ["embedding_provider"],
				message: "embedding_provider is required when using hierarchical_document tools",
			});
		}
	});
```

Add the new type exports at the bottom of the file alongside existing ones:

```typescript
export type KeywordSearchConfig = z.infer<typeof KeywordSearchConfigSchema>;
export type EmbeddingProvider = z.infer<typeof EmbeddingProviderSchema>;
```

(Note: `KeywordSearchConfig` type is already exported inline above the schema — just ensure no duplicate.)

- [ ] **Step 4: Update test fixtures**

The `valid-full.yaml` fixture doesn't include vectorstore tools, so no fixture update needed. But we need to ensure the existing fixture tests still pass since `AgentConfigSchema` now has a new optional field.

- [ ] **Step 5: Run all tests to verify**

Run: `bun test tests/unit/config/schema.test.ts`
Expected: PASS — all existing tests pass (new fields are optional), all new tests pass.

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts tests/unit/config/schema.test.ts
git commit -m "feat(vectorstore): add KeywordSearchConfig, EmbeddingProvider schemas and context_model

Add KeywordSearchConfigSchema for ChromaDB's OpenSearch sidecar config.
Add EmbeddingProviderSchema with azure_openai endpoint validation.
Add context_model field (default claude-haiku-4-5) to hierarchical tool.
Require embedding_provider on AgentConfig when vectorstore tools present.
Require keyword_search when database.provider is chromadb."
```

---

## Task 8: Implement TextConverter

**Files:**
- Create: `src/tools/vectorstore/converters/text.ts`
- Test: `tests/unit/tools/vectorstore/converters/text.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/vectorstore/converters/text.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { TextConverter } from "../../../../../src/tools/vectorstore/converters/text.js";

describe("TextConverter", () => {
	const converter = new TextConverter();

	describe("supports", () => {
		it("supports .txt extension", () => {
			expect(converter.supports(".txt")).toBe(true);
		});

		it("supports .md extension", () => {
			expect(converter.supports(".md")).toBe(true);
		});

		it("does not support .html", () => {
			expect(converter.supports(".html")).toBe(false);
		});

		it("does not support .pdf", () => {
			expect(converter.supports(".pdf")).toBe(false);
		});

		it("handles case-insensitive extensions", () => {
			expect(converter.supports(".TXT")).toBe(true);
			expect(converter.supports(".MD")).toBe(true);
		});
	});

	describe("convert", () => {
		it("returns UTF-8 decoded content unchanged", async () => {
			const input = Buffer.from("# Hello World\n\nSome text.");
			const result = await converter.convert(input);
			expect(result).toBe("# Hello World\n\nSome text.");
		});

		it("handles empty buffer", async () => {
			const input = Buffer.from("");
			const result = await converter.convert(input);
			expect(result).toBe("");
		});

		it("handles unicode content", async () => {
			const input = Buffer.from("Sch\u00f6ne Gr\u00fc\u00dfe \ud83d\ude80");
			const result = await converter.convert(input);
			expect(result).toBe("Sch\u00f6ne Gr\u00fc\u00dfe \ud83d\ude80");
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/converters/text.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TextConverter**

Create `src/tools/vectorstore/converters/text.ts`:

```typescript
import type { ConvertOptions, DocumentConverter } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md"]);

export class TextConverter implements DocumentConverter {
	async convert(input: Buffer, _options?: ConvertOptions): Promise<string> {
		return input.toString("utf-8");
	}

	supports(extension: string): boolean {
		return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/vectorstore/converters/text.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/vectorstore/converters/text.ts tests/unit/tools/vectorstore/converters/text.test.ts
git commit -m "feat(vectorstore): implement TextConverter (passthrough for .txt/.md)"
```

---

## Task 9: Implement HtmlConverter

**Files:**
- Create: `src/tools/vectorstore/converters/html.ts`
- Test: `tests/unit/tools/vectorstore/converters/html.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/vectorstore/converters/html.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { HtmlConverter } from "../../../../../src/tools/vectorstore/converters/html.js";

describe("HtmlConverter", () => {
	const converter = new HtmlConverter();

	describe("supports", () => {
		it("supports .html", () => {
			expect(converter.supports(".html")).toBe(true);
		});

		it("supports .htm", () => {
			expect(converter.supports(".htm")).toBe(true);
		});

		it("does not support .txt", () => {
			expect(converter.supports(".txt")).toBe(false);
		});

		it("handles case-insensitive extensions", () => {
			expect(converter.supports(".HTML")).toBe(true);
		});
	});

	describe("convert", () => {
		it("converts headings to ATX-style markdown", async () => {
			const html = Buffer.from("<h1>Title</h1><h2>Section</h2><p>Content</p>");
			const result = await converter.convert(html);
			expect(result).toContain("# Title");
			expect(result).toContain("## Section");
			expect(result).toContain("Content");
		});

		it("converts lists to markdown", async () => {
			const html = Buffer.from("<ul><li>Item 1</li><li>Item 2</li></ul>");
			const result = await converter.convert(html);
			expect(result).toContain("- Item 1");
			expect(result).toContain("- Item 2");
		});

		it("converts tables to GFM tables", async () => {
			const html = Buffer.from(
				"<table><thead><tr><th>Name</th><th>Value</th></tr></thead>" +
					"<tbody><tr><td>A</td><td>1</td></tr></tbody></table>",
			);
			const result = await converter.convert(html);
			expect(result).toContain("Name");
			expect(result).toContain("Value");
			expect(result).toContain("|");
		});

		it("converts bold and italic", async () => {
			const html = Buffer.from("<p><strong>bold</strong> and <em>italic</em></p>");
			const result = await converter.convert(html);
			expect(result).toContain("**bold**");
			expect(result).toContain("_italic_");
		});

		it("handles empty HTML", async () => {
			const result = await converter.convert(Buffer.from(""));
			expect(result).toBe("");
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/converters/html.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement HtmlConverter**

Create `src/tools/vectorstore/converters/html.ts`:

```typescript
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { ConvertOptions, DocumentConverter } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([".html", ".htm"]);

export class HtmlConverter implements DocumentConverter {
	private readonly turndown: TurndownService;

	constructor() {
		this.turndown = new TurndownService({
			headingStyle: "atx",
			codeBlockStyle: "fenced",
		});
		this.turndown.use(gfm);
	}

	async convert(input: Buffer, _options?: ConvertOptions): Promise<string> {
		const html = input.toString("utf-8");
		if (html.trim() === "") {
			return "";
		}
		return this.turndown.turndown(html);
	}

	supports(extension: string): boolean {
		return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/vectorstore/converters/html.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/vectorstore/converters/html.ts tests/unit/tools/vectorstore/converters/html.test.ts
git commit -m "feat(vectorstore): implement HtmlConverter (turndown + GFM plugin)"
```

---

## Task 10: Implement DocxConverter

**Files:**
- Create: `src/tools/vectorstore/converters/docx.ts`
- Create: `tests/fixtures/docs/sample.docx` (minimal test fixture)
- Test: `tests/unit/tools/vectorstore/converters/docx.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/vectorstore/converters/docx.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { DocxConverter } from "../../../../../src/tools/vectorstore/converters/docx.js";

describe("DocxConverter", () => {
	const converter = new DocxConverter();

	describe("supports", () => {
		it("supports .docx", () => {
			expect(converter.supports(".docx")).toBe(true);
		});

		it("does not support .doc", () => {
			expect(converter.supports(".doc")).toBe(false);
		});

		it("does not support .pdf", () => {
			expect(converter.supports(".pdf")).toBe(false);
		});

		it("handles case-insensitive extensions", () => {
			expect(converter.supports(".DOCX")).toBe(true);
		});
	});

	describe("convert", () => {
		it("converts a DOCX buffer to markdown via mammoth + turndown", async () => {
			// mammoth.convertToHtml expects a valid DOCX buffer.
			// For unit testing, we verify the pipeline works by checking that
			// an invalid buffer throws rather than silently returning garbage.
			const invalidBuffer = Buffer.from("not a docx file");
			await expect(converter.convert(invalidBuffer)).rejects.toThrow();
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/converters/docx.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DocxConverter**

Create `src/tools/vectorstore/converters/docx.ts`:

```typescript
import mammoth from "mammoth";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { ToolError } from "../../../lib/errors.js";
import type { ConvertOptions, DocumentConverter } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([".docx"]);

export class DocxConverter implements DocumentConverter {
	private readonly turndown: TurndownService;

	constructor() {
		this.turndown = new TurndownService({
			headingStyle: "atx",
			codeBlockStyle: "fenced",
		});
		this.turndown.use(gfm);
	}

	async convert(input: Buffer, options?: ConvertOptions): Promise<string> {
		try {
			const result = await mammoth.convertToHtml({ buffer: input });
			if (result.value.trim() === "") {
				return "";
			}
			return this.turndown.turndown(result.value);
		} catch (error) {
			throw new ToolError(
				`Failed to convert DOCX${options?.sourcePath ? ` (${options.sourcePath})` : ""}: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error instanceof Error ? error : undefined },
			);
		}
	}

	supports(extension: string): boolean {
		return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/vectorstore/converters/docx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/vectorstore/converters/docx.ts tests/unit/tools/vectorstore/converters/docx.test.ts
git commit -m "feat(vectorstore): implement DocxConverter (mammoth + turndown pipeline)"
```

---

## Task 11: Implement PdfConverter

**Files:**
- Create: `src/tools/vectorstore/converters/pdf.ts`
- Test: `tests/unit/tools/vectorstore/converters/pdf.test.ts`

The spec notes that `@opendocsg/pdf2md` uses WASM/Web Workers and Bun compatibility is unverified. The implementation must handle this gracefully — if the library works, use it; if not, throw a descriptive ToolError.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/vectorstore/converters/pdf.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { PdfConverter } from "../../../../../src/tools/vectorstore/converters/pdf.js";

describe("PdfConverter", () => {
	const converter = new PdfConverter();

	describe("supports", () => {
		it("supports .pdf", () => {
			expect(converter.supports(".pdf")).toBe(true);
		});

		it("does not support .docx", () => {
			expect(converter.supports(".docx")).toBe(false);
		});

		it("handles case-insensitive extensions", () => {
			expect(converter.supports(".PDF")).toBe(true);
		});
	});

	describe("convert", () => {
		it("throws ToolError for invalid PDF buffer", async () => {
			const invalidBuffer = Buffer.from("not a pdf file");
			await expect(converter.convert(invalidBuffer)).rejects.toThrow();
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/converters/pdf.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PdfConverter**

Create `src/tools/vectorstore/converters/pdf.ts`:

```typescript
import { ToolError } from "../../../lib/errors.js";
import type { ConvertOptions, DocumentConverter } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([".pdf"]);

export class PdfConverter implements DocumentConverter {
	async convert(input: Buffer, options?: ConvertOptions): Promise<string> {
		try {
			// @opendocsg/pdf2md uses WASM/Web Workers internally.
			// Dynamic import to catch runtime incompatibility at the call site.
			const { default: pdf2md } = await import("@opendocsg/pdf2md");
			return await pdf2md(input);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// Detect Bun runtime incompatibility (WASM/Worker issues)
			if (
				message.includes("Worker") ||
				message.includes("wasm") ||
				message.includes("WebAssembly") ||
				message.includes("Cannot find module")
			) {
				throw new ToolError(
					"PDF conversion not supported in Bun runtime \u2014 convert to markdown manually or use a Node.js preprocessing step",
					{ cause: error instanceof Error ? error : undefined },
				);
			}
			throw new ToolError(
				`Failed to convert PDF${options?.sourcePath ? ` (${options.sourcePath})` : ""}: ${message}`,
				{ cause: error instanceof Error ? error : undefined },
			);
		}
	}

	supports(extension: string): boolean {
		return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/vectorstore/converters/pdf.test.ts`
Expected: PASS — invalid PDF throws an error (either from pdf2md or from our Bun compat guard).

- [ ] **Step 5: Commit**

```bash
git add src/tools/vectorstore/converters/pdf.ts tests/unit/tools/vectorstore/converters/pdf.test.ts
git commit -m "feat(vectorstore): implement PdfConverter with Bun runtime compat guard

Uses @opendocsg/pdf2md with dynamic import. If WASM/Worker
incompatibility is detected, throws a descriptive ToolError
guiding users to convert PDFs manually."
```

---

## Task 12: Implement Converter Factory and Index

**Files:**
- Create: `src/tools/vectorstore/converters/factory.ts`
- Create: `src/tools/vectorstore/converters/index.ts`
- Test: `tests/unit/tools/vectorstore/converters/factory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/vectorstore/converters/factory.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { getConverter } from "../../../../../src/tools/vectorstore/converters/factory.js";
import { DocxConverter } from "../../../../../src/tools/vectorstore/converters/docx.js";
import { HtmlConverter } from "../../../../../src/tools/vectorstore/converters/html.js";
import { PdfConverter } from "../../../../../src/tools/vectorstore/converters/pdf.js";
import { TextConverter } from "../../../../../src/tools/vectorstore/converters/text.js";

describe("getConverter", () => {
	it("returns TextConverter for .txt", () => {
		expect(getConverter(".txt")).toBeInstanceOf(TextConverter);
	});

	it("returns TextConverter for .md", () => {
		expect(getConverter(".md")).toBeInstanceOf(TextConverter);
	});

	it("returns HtmlConverter for .html", () => {
		expect(getConverter(".html")).toBeInstanceOf(HtmlConverter);
	});

	it("returns HtmlConverter for .htm", () => {
		expect(getConverter(".htm")).toBeInstanceOf(HtmlConverter);
	});

	it("returns DocxConverter for .docx", () => {
		expect(getConverter(".docx")).toBeInstanceOf(DocxConverter);
	});

	it("returns PdfConverter for .pdf", () => {
		expect(getConverter(".pdf")).toBeInstanceOf(PdfConverter);
	});

	it("throws ToolError for unsupported extension", () => {
		expect(() => getConverter(".xlsx")).toThrow("Unsupported file format");
	});

	it("handles case-insensitive extensions", () => {
		expect(getConverter(".TXT")).toBeInstanceOf(TextConverter);
		expect(getConverter(".HTML")).toBeInstanceOf(HtmlConverter);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/converters/factory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the factory**

Create `src/tools/vectorstore/converters/factory.ts`:

```typescript
import { ToolError } from "../../../lib/errors.js";
import { DocxConverter } from "./docx.js";
import { HtmlConverter } from "./html.js";
import { PdfConverter } from "./pdf.js";
import { TextConverter } from "./text.js";
import type { DocumentConverter } from "./types.js";

const converters: DocumentConverter[] = [
	new TextConverter(),
	new HtmlConverter(),
	new DocxConverter(),
	new PdfConverter(),
];

export function getConverter(extension: string): DocumentConverter {
	const normalized = extension.toLowerCase();
	const converter = converters.find((c) => c.supports(normalized));
	if (!converter) {
		throw new ToolError(`Unsupported file format: '${extension}'`);
	}
	return converter;
}
```

- [ ] **Step 4: Create the barrel re-export**

Create `src/tools/vectorstore/converters/index.ts`:

```typescript
export { TextConverter } from "./text.js";
export { HtmlConverter } from "./html.js";
export { DocxConverter } from "./docx.js";
export { PdfConverter } from "./pdf.js";
export { getConverter } from "./factory.js";
export type { ConvertOptions, DocumentConverter } from "./types.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/unit/tools/vectorstore/converters/factory.test.ts`
Expected: PASS.

- [ ] **Step 6: Run all converter tests**

Run: `bun test tests/unit/tools/vectorstore/converters/`
Expected: All converter tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/tools/vectorstore/converters/factory.ts src/tools/vectorstore/converters/index.ts tests/unit/tools/vectorstore/converters/factory.test.ts
git commit -m "feat(vectorstore): implement converter factory and barrel exports

getConverter() returns the appropriate DocumentConverter for a file
extension, or throws ToolError for unsupported formats."
```

---

## Task 13: Implement MarkdownChunker — Types and Token Counting

**Files:**
- Create: `src/tools/vectorstore/chunker.ts` (partial — types + token counting + structure)
- Test: `tests/unit/tools/vectorstore/chunker.test.ts`

This is the largest task. We build the chunker incrementally: types first, then structure strategy, then token strategy, then edge cases. The test file grows across steps.

- [ ] **Step 1: Write the initial failing tests for types and token counting**

Create `tests/unit/tools/vectorstore/chunker.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { type ChunkConfig, MarkdownChunker, estimateTokens } from "../../../../src/tools/vectorstore/chunker.js";

describe("estimateTokens", () => {
	it("counts words with 0.75 factor", () => {
		// "hello world" = 2 words, 2 * 0.75 = 1.5, ceil = 2
		expect(estimateTokens("hello world")).toBe(2);
	});

	it("returns 0 for empty string", () => {
		expect(estimateTokens("")).toBe(0);
	});

	it("returns 0 for whitespace-only string", () => {
		expect(estimateTokens("   \n\t  ")).toBe(0);
	});

	it("handles multi-word content", () => {
		// 10 words * 0.75 = 7.5, ceil = 8
		const text = "one two three four five six seven eight nine ten";
		expect(estimateTokens(text)).toBe(8);
	});
});

describe("MarkdownChunker", () => {
	describe("structure strategy — basic heading hierarchy", () => {
		it("chunks a simple document with h1 and h2", () => {
			const md = `# Introduction

Welcome to the guide.

## Getting Started

Install the package.

## Usage

Run the command.
`;
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			expect(chunks.length).toBeGreaterThanOrEqual(3);

			// First heading chunk
			const intro = chunks.find((c) => c.content.includes("Introduction"));
			expect(intro).toBeDefined();
			expect(intro!.chunk_type).toBe("HEADER");
			expect(intro!.section_id).toBe("1");
			expect(intro!.parent_chain).toEqual([]);

			// Content under Introduction
			const welcomeChunk = chunks.find((c) => c.content.includes("Welcome"));
			expect(welcomeChunk).toBeDefined();
			expect(welcomeChunk!.chunk_type).toBe("CONTENT");
			expect(welcomeChunk!.parent_chain).toEqual(["Introduction"]);

			// Getting Started section
			const gettingStarted = chunks.find((c) =>
				c.content.includes("Getting Started") && c.chunk_type === "HEADER",
			);
			expect(gettingStarted).toBeDefined();
			expect(gettingStarted!.section_id).toBe("1.1");
			expect(gettingStarted!.parent_chain).toEqual(["Introduction"]);
		});

		it("builds correct parent_chain for nested headings", () => {
			const md = `# A

## B

### C

Content under C.
`;
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const cContent = chunks.find((c) => c.content.includes("Content under C"));
			expect(cContent).toBeDefined();
			expect(cContent!.parent_chain).toEqual(["A", "B", "C"]);
		});

		it("assigns sequential chunk_index values", () => {
			const md = "# A\n\nContent A.\n\n# B\n\nContent B.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			for (let i = 0; i < chunks.length; i++) {
				expect(chunks[i].chunk_index).toBe(i);
			}
		});

		it("populates token_count on every chunk", () => {
			const md = "# Title\n\nSome content here.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			for (const chunk of chunks) {
				expect(chunk.token_count).toBeGreaterThan(0);
			}
		});
	});

	describe("structure strategy — edge cases", () => {
		it("handles document with no headings", () => {
			const md = "Just some plain text.\n\nAnother paragraph.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			expect(chunks.length).toBeGreaterThanOrEqual(1);
			expect(chunks[0].parent_chain).toEqual([]);
			expect(chunks[0].section_id).toBe("0");
			expect(chunks[0].chunk_type).toBe("CONTENT");
		});

		it("captures content before first heading (preamble)", () => {
			const md = "Preamble text.\n\n# First Heading\n\nContent.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const preamble = chunks.find((c) => c.content.includes("Preamble"));
			expect(preamble).toBeDefined();
			expect(preamble!.parent_chain).toEqual([]);
			expect(preamble!.section_id).toBe("0");
		});

		it("handles skipped heading levels (h1 -> h3)", () => {
			const md = "# A\n\n### C\n\nContent.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const cHeader = chunks.find(
				(c) => c.content.includes("C") && c.chunk_type === "HEADER",
			);
			expect(cHeader).toBeDefined();
			// Parent chain reflects actual headings, even with skipped levels
			expect(cHeader!.parent_chain).toEqual(["A"]);
		});

		it("produces HEADER-only chunk for empty section", () => {
			const md = "# Section A\n\n# Section B\n\nContent B.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const sectionA = chunks.find(
				(c) => c.content.includes("Section A") && c.chunk_type === "HEADER",
			);
			expect(sectionA).toBeDefined();
		});

		it("keeps fenced code blocks as atomic units", () => {
			const md = "# Code\n\n```typescript\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const codeChunk = chunks.find((c) => c.content.includes("const x = 1"));
			expect(codeChunk).toBeDefined();
			// Code block should not be split across chunks
			expect(codeChunk!.content).toContain("const z = 3");
		});

		it("keeps GFM tables as atomic units", () => {
			const md =
				"# Data\n\n| Col A | Col B |\n|-------|-------|\n| 1 | 2 |\n| 3 | 4 |\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const tableChunk = chunks.find((c) => c.content.includes("Col A"));
			expect(tableChunk).toBeDefined();
			expect(tableChunk!.content).toContain("| 3 | 4 |");
		});

		it("splits oversized sections at sentence boundaries", () => {
			// Create a section with many sentences that exceeds max_chunk_tokens
			const sentences = Array.from(
				{ length: 50 },
				(_, i) => `This is sentence number ${i + 1} with enough words to add up.`,
			);
			const md = `# Big Section\n\n${sentences.join(" ")}\n`;

			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 50,
				chunk_overlap: 0,
			});

			// Should produce multiple content chunks
			const contentChunks = chunks.filter((c) => c.chunk_type === "CONTENT");
			expect(contentChunks.length).toBeGreaterThan(1);

			// All content chunks should inherit the parent chain
			for (const chunk of contentChunks) {
				expect(chunk.parent_chain).toEqual(["Big Section"]);
			}
		});
	});

	describe("token strategy", () => {
		it("splits into fixed-size chunks ignoring headings", () => {
			const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
			const md = words.join(" ");

			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "token",
				max_chunk_tokens: 20,
				chunk_overlap: 0,
			});

			expect(chunks.length).toBeGreaterThan(1);
			// Token strategy doesn't track heading hierarchy
			for (const chunk of chunks) {
				expect(chunk.parent_chain).toEqual([]);
				expect(chunk.section_id).toBe("0");
			}
		});

		it("applies overlap between consecutive chunks", () => {
			const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
			const md = words.join(" ");

			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "token",
				max_chunk_tokens: 30,
				chunk_overlap: 10,
			});

			// With overlap, consecutive chunks should share some words
			if (chunks.length >= 2) {
				const firstWords = chunks[0].content.split(/\s+/);
				const secondWords = chunks[1].content.split(/\s+/);
				// The end of first chunk should overlap with the start of second
				const lastWordsOfFirst = firstWords.slice(-5);
				const firstWordsOfSecond = secondWords.slice(0, 5);
				// At least some words should be shared
				const overlap = lastWordsOfFirst.filter((w) =>
					firstWordsOfSecond.includes(w),
				);
				expect(overlap.length).toBeGreaterThan(0);
			}
		});
	});

	describe("subsection_ids tracking", () => {
		it("populates subsection_ids for parent sections", () => {
			const md = `# Parent

## Child 1

Content 1.

## Child 2

Content 2.
`;
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const parentHeader = chunks.find(
				(c) => c.content.includes("Parent") && c.chunk_type === "HEADER",
			);
			expect(parentHeader).toBeDefined();
			expect(parentHeader!.subsection_ids.length).toBe(2);
			expect(parentHeader!.subsection_ids).toContain("1.1");
			expect(parentHeader!.subsection_ids).toContain("1.2");
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/chunker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the MarkdownChunker**

Create `src/tools/vectorstore/chunker.ts`:

```typescript
import { Lexer, type Token, type Tokens } from "marked";
import type { DocumentChunk } from "./types.js";

export interface ChunkConfig {
	readonly strategy: "structure" | "token";
	readonly max_chunk_tokens: number;
	readonly chunk_overlap: number;
}

/** Estimate token count using word-count approximation with 0.75 factor */
export function estimateTokens(text: string): number {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return 0;
	return Math.ceil(words.length * 0.75);
}

interface Section {
	heading: string | undefined;
	headingRaw: string | undefined;
	depth: number;
	parentChain: string[];
	sectionId: string;
	tokens: Token[];
	subsectionIds: string[];
}

export class MarkdownChunker {
	chunk(
		markdown: string,
		config: ChunkConfig,
		documentId = "doc",
		sourcePath = "unknown",
		fileModifiedAt = Date.now(),
	): Omit<DocumentChunk, "embedding">[] {
		if (config.strategy === "token") {
			return this.chunkByTokens(markdown, config, documentId, sourcePath, fileModifiedAt);
		}
		return this.chunkByStructure(markdown, config, documentId, sourcePath, fileModifiedAt);
	}

	private chunkByStructure(
		markdown: string,
		config: ChunkConfig,
		documentId: string,
		sourcePath: string,
		fileModifiedAt: number,
	): Omit<DocumentChunk, "embedding">[] {
		const tokens = Lexer.lex(markdown);
		const sections = this.buildSections(tokens);
		this.linkSubsections(sections);
		return this.sectionsToChunks(sections, config, documentId, sourcePath, fileModifiedAt);
	}

	private buildSections(tokens: Token[]): Section[] {
		const sections: Section[] = [];
		const headingStack: Array<{ depth: number; text: string }> = [];
		const counters = [0, 0, 0, 0, 0, 0]; // h1-h6
		let currentSection: Section | undefined;
		let hasPreamble = false;

		for (const token of tokens) {
			if (token.type === "heading") {
				const heading = token as Tokens.Heading;

				// Flush current section
				if (currentSection) {
					sections.push(currentSection);
				}

				// Reset counters for deeper levels
				for (let i = heading.depth; i < 6; i++) {
					counters[i] = 0;
				}
				counters[heading.depth - 1]++;

				// Pop headings of >= depth (siblings/uncles)
				while (headingStack.length > 0 && headingStack.at(-1)!.depth >= heading.depth) {
					headingStack.pop();
				}

				const parentChain = headingStack.map((h) => h.text);
				headingStack.push({ depth: heading.depth, text: heading.text });

				const sectionId = counters
					.slice(0, heading.depth)
					.filter((c) => c > 0)
					.join(".");

				currentSection = {
					heading: heading.text,
					headingRaw: heading.raw,
					depth: heading.depth,
					parentChain,
					sectionId,
					tokens: [],
					subsectionIds: [],
				};
			} else {
				// Content token
				if (!currentSection) {
					// Preamble — content before first heading
					if (!hasPreamble) {
						hasPreamble = true;
						currentSection = {
							heading: undefined,
							headingRaw: undefined,
							depth: 0,
							parentChain: [],
							sectionId: "0",
							tokens: [],
							subsectionIds: [],
						};
					}
				}
				if (currentSection) {
					currentSection.tokens.push(token);
				}
			}
		}

		// Flush last section
		if (currentSection) {
			sections.push(currentSection);
		}

		return sections;
	}

	private linkSubsections(sections: Section[]): void {
		// For each section, find its immediate children
		for (let i = 0; i < sections.length; i++) {
			const section = sections[i];
			if (section.heading === undefined) continue;

			for (let j = i + 1; j < sections.length; j++) {
				const candidate = sections[j];
				if (candidate.heading === undefined) continue;

				// If same or shallower depth, no longer a child
				if (candidate.depth <= section.depth) break;

				// Immediate child = depth exactly one more
				if (candidate.depth === section.depth + 1) {
					section.subsectionIds.push(candidate.sectionId);
				}
			}
		}
	}

	private sectionsToChunks(
		sections: Section[],
		config: ChunkConfig,
		documentId: string,
		sourcePath: string,
		fileModifiedAt: number,
	): Omit<DocumentChunk, "embedding">[] {
		const chunks: Omit<DocumentChunk, "embedding">[] = [];
		let chunkIndex = 0;

		for (const section of sections) {
			// Emit HEADER chunk if this section has a heading
			if (section.heading !== undefined && section.headingRaw !== undefined) {
				chunks.push({
					id: `${documentId}:${chunkIndex}`,
					document_id: documentId,
					content: section.headingRaw.trim(),
					parent_chain: section.parentChain,
					section_id: section.sectionId,
					subsection_ids: section.subsectionIds,
					chunk_type: "HEADER",
					chunk_index: chunkIndex,
					source_path: sourcePath,
					heading_level: section.depth,
					token_count: estimateTokens(section.headingRaw),
					file_modified_at: fileModifiedAt,
				});
				chunkIndex++;
			}

			// Emit CONTENT chunks from tokens
			if (section.tokens.length === 0) continue;

			const contentBlocks = this.groupContentBlocks(section.tokens, config.max_chunk_tokens);

			const fullParentChain =
				section.heading !== undefined
					? [...section.parentChain, section.heading]
					: section.parentChain;

			for (const block of contentBlocks) {
				chunks.push({
					id: `${documentId}:${chunkIndex}`,
					document_id: documentId,
					content: block.trim(),
					parent_chain: fullParentChain,
					section_id: section.sectionId,
					subsection_ids: [],
					chunk_type: "CONTENT",
					chunk_index: chunkIndex,
					source_path: sourcePath,
					token_count: estimateTokens(block),
					file_modified_at: fileModifiedAt,
				});
				chunkIndex++;
			}
		}

		return chunks;
	}

	private groupContentBlocks(tokens: Token[], maxTokens: number): string[] {
		const blocks: string[] = [];
		let currentBlock = "";
		let currentTokens = 0;

		for (const token of tokens) {
			const raw = token.raw;
			const tokenCount = estimateTokens(raw);
			const isAtomic = token.type === "code" || token.type === "table";

			if (isAtomic) {
				// Flush current block if adding this would exceed limit
				if (currentBlock.trim() && currentTokens + tokenCount > maxTokens) {
					blocks.push(currentBlock);
					currentBlock = "";
					currentTokens = 0;
				}

				if (tokenCount > maxTokens && !isAtomic) {
					// Split oversized non-atomic content at sentence boundaries
					if (currentBlock.trim()) {
						blocks.push(currentBlock);
						currentBlock = "";
						currentTokens = 0;
					}
					blocks.push(...this.splitAtSentences(raw, maxTokens));
				} else {
					currentBlock += raw;
					currentTokens += tokenCount;
				}
			} else if (currentTokens + tokenCount > maxTokens) {
				// Flush and potentially split
				if (currentBlock.trim()) {
					blocks.push(currentBlock);
				}

				if (tokenCount > maxTokens) {
					// Oversized single token — split at sentences
					blocks.push(...this.splitAtSentences(raw, maxTokens));
					currentBlock = "";
					currentTokens = 0;
				} else {
					currentBlock = raw;
					currentTokens = tokenCount;
				}
			} else {
				currentBlock += raw;
				currentTokens += tokenCount;
			}
		}

		if (currentBlock.trim()) {
			blocks.push(currentBlock);
		}

		return blocks;
	}

	private splitAtSentences(text: string, maxTokens: number): string[] {
		// Split at sentence boundaries (. ! ? followed by space or newline)
		const sentences = text.match(/[^.!?\n]+[.!?]?\s*/g) || [text];
		const blocks: string[] = [];
		let current = "";
		let currentTokens = 0;

		for (const sentence of sentences) {
			const sentenceTokens = estimateTokens(sentence);
			if (currentTokens + sentenceTokens > maxTokens && current.trim()) {
				blocks.push(current);
				current = "";
				currentTokens = 0;
			}
			current += sentence;
			currentTokens += sentenceTokens;
		}

		if (current.trim()) {
			blocks.push(current);
		}

		return blocks;
	}

	private chunkByTokens(
		markdown: string,
		config: ChunkConfig,
		documentId: string,
		sourcePath: string,
		fileModifiedAt: number,
	): Omit<DocumentChunk, "embedding">[] {
		const words = markdown.split(/\s+/).filter(Boolean);
		if (words.length === 0) return [];

		const chunks: Omit<DocumentChunk, "embedding">[] = [];
		// Convert token limits to word counts (inverse of 0.75 factor)
		const maxWords = Math.floor(config.max_chunk_tokens / 0.75);
		const overlapWords = Math.floor(config.chunk_overlap / 0.75);
		let start = 0;
		let chunkIndex = 0;

		while (start < words.length) {
			const end = Math.min(start + maxWords, words.length);
			const content = words.slice(start, end).join(" ");

			chunks.push({
				id: `${documentId}:${chunkIndex}`,
				document_id: documentId,
				content,
				parent_chain: [],
				section_id: "0",
				subsection_ids: [],
				chunk_type: "CONTENT",
				chunk_index: chunkIndex,
				source_path: sourcePath,
				token_count: estimateTokens(content),
				file_modified_at: fileModifiedAt,
			});

			chunkIndex++;
			start = end - overlapWords;
			if (start >= end) break; // Prevent infinite loop when overlap >= chunk size
		}

		return chunks;
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/tools/vectorstore/chunker.test.ts`
Expected: PASS — all chunker tests green.

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/vectorstore/chunker.ts tests/unit/tools/vectorstore/chunker.test.ts
git commit -m "feat(vectorstore): implement MarkdownChunker with structure and token strategies

Stack-based heading hierarchy algorithm using marked.lexer().
Structure strategy: heading-aware chunking with parent_chain, section_id,
subsection_ids tracking. Handles edge cases: no headings, preamble,
skipped levels, empty sections, atomic code/table blocks, oversized
section splitting at sentence boundaries.
Token strategy: fixed-size chunking with configurable overlap."
```

---

## Task 14: Implement OllamaEmbeddingProvider

**Files:**
- Create: `src/tools/vectorstore/embeddings/ollama.ts`
- Test: `tests/unit/tools/vectorstore/embeddings/ollama.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/vectorstore/embeddings/ollama.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { OllamaEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/ollama.js";

describe("OllamaEmbeddingProvider", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns configured dimensions", () => {
		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 768,
		});
		expect(provider.dimensions()).toBe(768);
	});

	it("embeds a batch of texts", async () => {
		const mockEmbedding = Array.from({ length: 768 }, () => Math.random());

		globalThis.fetch = mock(async () =>
			new Response(JSON.stringify({ embeddings: [mockEmbedding] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		) as typeof fetch;

		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 768,
		});

		const results = await provider.embed(["hello world"]);
		expect(results).toHaveLength(1);
		expect(results[0]).toHaveLength(768);
	});

	it("calls correct Ollama API endpoint", async () => {
		let capturedUrl = "";
		let capturedBody = "";

		globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
			capturedUrl = typeof input === "string" ? input : input.toString();
			capturedBody = init?.body as string;
			return new Response(
				JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as typeof fetch;

		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 3,
		});

		await provider.embed(["test"]);
		expect(capturedUrl).toBe("http://localhost:11434/api/embed");
		const body = JSON.parse(capturedBody);
		expect(body.model).toBe("nomic-embed-text");
		expect(body.input).toEqual(["test"]);
	});

	it("throws ToolError on API failure", async () => {
		globalThis.fetch = mock(async () =>
			new Response("Internal Server Error", { status: 500 }),
		) as typeof fetch;

		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 768,
		});

		await expect(provider.embed(["test"])).rejects.toThrow();
	});

	it("throws ToolError on network error", async () => {
		globalThis.fetch = mock(async () => {
			throw new Error("ECONNREFUSED");
		}) as typeof fetch;

		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 768,
		});

		await expect(provider.embed(["test"])).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/embeddings/ollama.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement OllamaEmbeddingProvider**

Create `src/tools/vectorstore/embeddings/ollama.ts`:

```typescript
import { ToolError } from "../../../lib/errors.js";
import type { EmbeddingProvider } from "./types.js";

export interface OllamaConfig {
	readonly model: string;
	readonly endpoint: string;
	readonly dimensions: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
	private readonly config: OllamaConfig;

	constructor(config: OllamaConfig) {
		this.config = config;
	}

	async embed(texts: string[]): Promise<number[][]> {
		const url = `${this.config.endpoint}/api/embed`;
		let response: Response;

		try {
			response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: this.config.model,
					input: texts,
				}),
			});
		} catch (error) {
			throw new ToolError(
				`Ollama embedding request failed: ${error instanceof Error ? error.message : String(error)}`,
				{
					cause: error instanceof Error ? error : undefined,
					backend: "ollama",
					operation: "embed",
				},
			);
		}

		if (!response.ok) {
			throw new ToolError(
				`Ollama embedding API returned ${response.status}: ${await response.text()}`,
				{ backend: "ollama", operation: "embed" },
			);
		}

		const data = (await response.json()) as { embeddings: number[][] };
		return data.embeddings;
	}

	dimensions(): number {
		return this.config.dimensions;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/vectorstore/embeddings/ollama.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/vectorstore/embeddings/ollama.ts tests/unit/tools/vectorstore/embeddings/ollama.test.ts
git commit -m "feat(vectorstore): implement OllamaEmbeddingProvider

HTTP client for local Ollama API (POST /api/embed) with batch support
and ToolError wrapping for connection/API failures."
```

---

## Task 15: Implement AzureOpenAIEmbeddingProvider

**Files:**
- Create: `src/tools/vectorstore/embeddings/azure-openai.ts`
- Test: `tests/unit/tools/vectorstore/embeddings/azure-openai.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/vectorstore/embeddings/azure-openai.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { AzureOpenAIEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/azure-openai.js";

describe("AzureOpenAIEmbeddingProvider", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	const baseConfig = {
		model: "text-embedding-ada-002",
		endpoint: "https://myinstance.openai.azure.com",
		apiVersion: "2024-02-01",
		apiKey: "sk-test",
		dimensions: 1536,
	};

	it("returns configured dimensions", () => {
		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		expect(provider.dimensions()).toBe(1536);
	});

	it("embeds a batch of texts", async () => {
		const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify({
					data: [{ embedding: mockEmbedding, index: 0 }],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		) as typeof fetch;

		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		const results = await provider.embed(["hello"]);
		expect(results).toHaveLength(1);
		expect(results[0]).toHaveLength(1536);
	});

	it("calls correct Azure OpenAI endpoint", async () => {
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};

		globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
			capturedUrl = typeof input === "string" ? input : input.toString();
			capturedHeaders = Object.fromEntries(
				Object.entries(init?.headers || {}),
			);
			return new Response(
				JSON.stringify({ data: [{ embedding: [0.1], index: 0 }] }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as typeof fetch;

		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		await provider.embed(["test"]);

		expect(capturedUrl).toBe(
			"https://myinstance.openai.azure.com/openai/deployments/text-embedding-ada-002/embeddings?api-version=2024-02-01",
		);
		expect(capturedHeaders["api-key"]).toBe("sk-test");
	});

	it("throws ToolError on API failure", async () => {
		globalThis.fetch = mock(async () =>
			new Response("Unauthorized", { status: 401 }),
		) as typeof fetch;

		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		await expect(provider.embed(["test"])).rejects.toThrow();
	});

	it("handles multiple texts and orders by index", async () => {
		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify({
					data: [
						{ embedding: [0.2], index: 1 },
						{ embedding: [0.1], index: 0 },
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		) as typeof fetch;

		const provider = new AzureOpenAIEmbeddingProvider({ ...baseConfig, dimensions: 1 });
		const results = await provider.embed(["first", "second"]);
		// Should be sorted by index
		expect(results[0]).toEqual([0.1]);
		expect(results[1]).toEqual([0.2]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/embeddings/azure-openai.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AzureOpenAIEmbeddingProvider**

Create `src/tools/vectorstore/embeddings/azure-openai.ts`:

```typescript
import { ToolError } from "../../../lib/errors.js";
import type { EmbeddingProvider } from "./types.js";

export interface AzureOpenAIConfig {
	readonly model: string;
	readonly endpoint: string;
	readonly apiVersion: string;
	readonly apiKey: string;
	readonly dimensions: number;
}

interface AzureEmbeddingResponse {
	data: Array<{ embedding: number[]; index: number }>;
}

export class AzureOpenAIEmbeddingProvider implements EmbeddingProvider {
	private readonly config: AzureOpenAIConfig;

	constructor(config: AzureOpenAIConfig) {
		this.config = config;
	}

	async embed(texts: string[]): Promise<number[][]> {
		const url = `${this.config.endpoint}/openai/deployments/${this.config.model}/embeddings?api-version=${this.config.apiVersion}`;
		let response: Response;

		try {
			response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"api-key": this.config.apiKey,
				},
				body: JSON.stringify({ input: texts }),
			});
		} catch (error) {
			throw new ToolError(
				`Azure OpenAI embedding request failed: ${error instanceof Error ? error.message : String(error)}`,
				{
					cause: error instanceof Error ? error : undefined,
					backend: "azure_openai",
					operation: "embed",
				},
			);
		}

		if (!response.ok) {
			throw new ToolError(
				`Azure OpenAI embedding API returned ${response.status}: ${await response.text()}`,
				{ backend: "azure_openai", operation: "embed" },
			);
		}

		const data = (await response.json()) as AzureEmbeddingResponse;
		// Sort by index to ensure correct ordering
		return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
	}

	dimensions(): number {
		return this.config.dimensions;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/vectorstore/embeddings/azure-openai.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/vectorstore/embeddings/azure-openai.ts tests/unit/tools/vectorstore/embeddings/azure-openai.test.ts
git commit -m "feat(vectorstore): implement AzureOpenAIEmbeddingProvider

HTTP client for Azure OpenAI embeddings API with api-key auth,
response ordering by index, and ToolError wrapping."
```

---

## Task 16: Implement Embedding Provider Factory and Index

**Files:**
- Create: `src/tools/vectorstore/embeddings/factory.ts`
- Create: `src/tools/vectorstore/embeddings/index.ts`
- Test: `tests/unit/tools/vectorstore/embeddings/factory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/vectorstore/embeddings/factory.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { createEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/factory.js";
import { AzureOpenAIEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/azure-openai.js";
import { OllamaEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/ollama.js";

describe("createEmbeddingProvider", () => {
	it("creates OllamaEmbeddingProvider for ollama config", () => {
		const provider = createEmbeddingProvider({
			provider: "ollama",
			name: "nomic-embed-text",
			dimensions: 768,
		});
		expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
		expect(provider.dimensions()).toBe(768);
	});

	it("creates AzureOpenAIEmbeddingProvider for azure_openai config", () => {
		const provider = createEmbeddingProvider({
			provider: "azure_openai",
			name: "text-embedding-ada-002",
			endpoint: "https://myinstance.openai.azure.com",
			api_version: "2024-02-01",
			api_key: "sk-test",
			dimensions: 1536,
		});
		expect(provider).toBeInstanceOf(AzureOpenAIEmbeddingProvider);
		expect(provider.dimensions()).toBe(1536);
	});

	it("uses default Ollama endpoint when not specified", () => {
		const provider = createEmbeddingProvider({
			provider: "ollama",
			name: "nomic-embed-text",
			dimensions: 768,
		});
		expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/vectorstore/embeddings/factory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the factory**

Create `src/tools/vectorstore/embeddings/factory.ts`:

```typescript
import { AzureOpenAIEmbeddingProvider } from "./azure-openai.js";
import { OllamaEmbeddingProvider } from "./ollama.js";
import type { EmbeddingProvider } from "./types.js";

export interface EmbeddingProviderConfig {
	readonly provider: "ollama" | "azure_openai";
	readonly name: string;
	readonly endpoint?: string;
	readonly api_version?: string;
	readonly api_key?: string;
	readonly dimensions: number;
}

export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
	switch (config.provider) {
		case "ollama":
			return new OllamaEmbeddingProvider({
				model: config.name,
				endpoint: config.endpoint ?? "http://localhost:11434",
				dimensions: config.dimensions,
			});
		case "azure_openai":
			return new AzureOpenAIEmbeddingProvider({
				model: config.name,
				endpoint: config.endpoint!,
				apiVersion: config.api_version ?? "2024-02-01",
				apiKey: config.api_key!,
				dimensions: config.dimensions,
			});
	}
}
```

- [ ] **Step 4: Create the barrel re-export**

Create `src/tools/vectorstore/embeddings/index.ts`:

```typescript
export { OllamaEmbeddingProvider } from "./ollama.js";
export type { OllamaConfig } from "./ollama.js";
export { AzureOpenAIEmbeddingProvider } from "./azure-openai.js";
export type { AzureOpenAIConfig } from "./azure-openai.js";
export { createEmbeddingProvider } from "./factory.js";
export type { EmbeddingProviderConfig } from "./factory.js";
export type { EmbeddingProvider } from "./types.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/unit/tools/vectorstore/embeddings/factory.test.ts`
Expected: PASS.

- [ ] **Step 6: Run all embedding tests**

Run: `bun test tests/unit/tools/vectorstore/embeddings/`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/tools/vectorstore/embeddings/factory.ts src/tools/vectorstore/embeddings/index.ts tests/unit/tools/vectorstore/embeddings/factory.test.ts
git commit -m "feat(vectorstore): implement embedding provider factory and barrel exports

createEmbeddingProvider() switches on config.provider to instantiate
OllamaEmbeddingProvider or AzureOpenAIEmbeddingProvider."
```

---

## Task 17: Final Verification and Lint

**Files:**
- All files created in Tasks 1-16

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 2: Run type checker**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Run linter**

Run: `bun run lint`
Expected: No errors. If there are formatting issues, run `bun run lint:fix`.

- [ ] **Step 4: Fix any lint issues**

Run: `bun run lint:fix` (if needed)

- [ ] **Step 5: Run tests one more time after lint fixes**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 6: Commit any lint fixes**

```bash
git add -A
git commit -m "style(vectorstore): apply biome formatting to foundation layer"
```

---

## Summary

| Task | Component | Files Created/Modified |
|------|-----------|----------------------|
| 1 | Directory structure + deps | dirs, package.json |
| 2 | ToolError extension | errors.ts |
| 3 | Converter interface | converters/types.ts |
| 4 | Backend interfaces | backends/types.ts |
| 5 | Embedding interface | embeddings/types.ts |
| 6 | DocumentChunk/Search schemas | vectorstore/types.ts |
| 7 | Config schema updates | config/schema.ts |
| 8 | TextConverter | converters/text.ts |
| 9 | HtmlConverter | converters/html.ts |
| 10 | DocxConverter | converters/docx.ts |
| 11 | PdfConverter | converters/pdf.ts |
| 12 | Converter factory | converters/factory.ts, index.ts |
| 13 | MarkdownChunker | chunker.ts |
| 14 | Ollama embeddings | embeddings/ollama.ts |
| 15 | Azure OpenAI embeddings | embeddings/azure-openai.ts |
| 16 | Embedding factory | embeddings/factory.ts, index.ts |
| 17 | Final verification | lint fixes |

**Total new files:** ~22 source + ~14 test = ~36 files
**Parallelizable tasks:** 3-5 (interfaces), 8-11 (converters), 14-15 (embeddings)
