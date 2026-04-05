import { describe, expect, it } from "bun:test";
import {
	type DocumentChunk,
	DocumentChunkSchema,
	SearchResponseSchema,
	type SearchResult,
	SearchResultSchema,
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
		sha256: "abc123def456",
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
		expect(SearchResultSchema.safeParse({ ...validResult, score: 1.5 }).success).toBe(false);
		expect(SearchResultSchema.safeParse({ ...validResult, score: -0.1 }).success).toBe(false);
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
