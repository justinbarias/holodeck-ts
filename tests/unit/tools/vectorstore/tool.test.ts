import { describe, expect, it } from "bun:test";
import type { SearchOptions, VectorstoreServer } from "../../../../src/tools/vectorstore/index.js";
import { createVectorstoreTool } from "../../../../src/tools/vectorstore/tool.js";
import type { SearchResponse } from "../../../../src/tools/vectorstore/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSearchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
	return {
		query: "test query",
		search_mode: "hybrid",
		total_results: 1,
		results: [
			{
				content: "Test chunk content",
				score: 0.9,
				semantic_score: 0.9,
				keyword_score: undefined,
				exact_score: undefined,
				source_path: "/docs/test.md",
				parent_chain: ["# Heading"],
				section_id: "heading-1",
				subsection_ids: [],
				chunk_index: 0,
				is_exact_match: false,
			},
		],
		...overrides,
	};
}

function makeMockServer(
	searchImpl: (query: string, options: SearchOptions) => Promise<SearchResponse>,
): VectorstoreServer {
	return {
		search: searchImpl,
		initialize: () => Promise.resolve(),
		reingest: () => Promise.resolve(),
		close: () => Promise.resolve(),
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createVectorstoreTool", () => {
	it("tool has the correct name and description", () => {
		const server = makeMockServer(() => Promise.resolve(makeSearchResponse()));
		const tool = createVectorstoreTool("my_docs", "Search my documentation", server);

		expect(tool.name).toBe("my_docs");
		expect(tool.description).toBe("Search my documentation");
	});

	it("tool exposes a raw inputSchema shape with the expected keys", () => {
		const server = makeMockServer(() => Promise.resolve(makeSearchResponse()));
		const tool = createVectorstoreTool("my_docs", "Search my docs", server);

		expect(tool.inputSchema).toHaveProperty("query");
		expect(tool.inputSchema).toHaveProperty("top_k");
		expect(tool.inputSchema).toHaveProperty("search_mode");
		expect(tool.inputSchema).toHaveProperty("min_score");
	});

	it("returns SearchResponse JSON on a successful search", async () => {
		const response = makeSearchResponse({ query: "hello", total_results: 1 });
		const server = makeMockServer(() => Promise.resolve(response));
		const tool = createVectorstoreTool("my_docs", "Search my docs", server);

		const result = await tool.handler({ query: "hello" });

		expect(result.isError).toBeUndefined();
		expect(result.content).toHaveLength(1);
		expect(result.content[0]?.type).toBe("text");
		const parsed = JSON.parse(result.content[0]?.text ?? "{}");
		expect(parsed.query).toBe("hello");
		expect(parsed.total_results).toBe(1);
	});

	it("maps parent_chain to breadcrumb and source_path to source, omits subsection_ids", async () => {
		const response = makeSearchResponse({
			query: "breadcrumb test",
			results: [
				{
					content: "Some content",
					score: 0.85,
					semantic_score: 0.85,
					keyword_score: undefined,
					exact_score: undefined,
					source_path: "/docs/guide.md",
					parent_chain: ["# Guide", "## Setup", "### Install"],
					section_id: "install-1",
					subsection_ids: ["install-1-a", "install-1-b"],
					chunk_index: 2,
					is_exact_match: false,
				},
			],
			total_results: 1,
		});
		const server = makeMockServer(() => Promise.resolve(response));
		const tool = createVectorstoreTool("my_docs", "Search my docs", server);

		const result = await tool.handler({ query: "breadcrumb test" });
		const parsed = JSON.parse(result.content[0]?.text ?? "{}");
		const r = parsed.results[0];

		expect(r.breadcrumb).toBe("# Guide > ## Setup > ### Install");
		expect(r.source).toBe("/docs/guide.md");
		expect(r.parent_chain).toBeUndefined();
		expect(r.source_path).toBeUndefined();
		expect(r.subsection_ids).toBeUndefined();
	});

	it("returns total_results: 0 as a non-error when there are no results", async () => {
		const response = makeSearchResponse({ total_results: 0, results: [] });
		const server = makeMockServer(() => Promise.resolve(response));
		const tool = createVectorstoreTool("my_docs", "Search my docs", server);

		const result = await tool.handler({ query: "nothing here" });

		expect(result.isError).toBeUndefined();
		const parsed = JSON.parse(result.content[0]?.text ?? "{}");
		expect(parsed.total_results).toBe(0);
		expect(parsed.results).toHaveLength(0);
	});

	it("sets isError: true when server.search throws", async () => {
		const server = makeMockServer(() => Promise.reject(new Error("backend unavailable")));
		const tool = createVectorstoreTool("my_docs", "Search my docs", server);

		const result = await tool.handler({ query: "fail" });

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("Search failed: backend unavailable");
	});

	it("passes optional parameters through to server.search", async () => {
		let capturedQuery = "";
		let capturedOptions: SearchOptions = {};

		const server = makeMockServer((query, options) => {
			capturedQuery = query;
			capturedOptions = options;
			return Promise.resolve(
				makeSearchResponse({ query, search_mode: options.search_mode ?? "hybrid" }),
			);
		});

		const tool = createVectorstoreTool("my_docs", "Search my docs", server);

		await tool.handler({
			query: "custom query",
			top_k: 5,
			search_mode: "semantic",
			min_score: 0.8,
		});

		expect(capturedQuery).toBe("custom query");
		expect(capturedOptions.top_k).toBe(5);
		expect(capturedOptions.search_mode).toBe("semantic");
		expect(capturedOptions.min_score).toBe(0.8);
	});

	it("includes degraded flag when present in the response", async () => {
		const response = makeSearchResponse({
			total_results: 0,
			results: [],
			degraded: true,
			degraded_details: "keyword backend unavailable",
		});
		const server = makeMockServer(() => Promise.resolve(response));
		const tool = createVectorstoreTool("my_docs", "Search my docs", server);

		const result = await tool.handler({ query: "degraded" });

		expect(result.isError).toBeUndefined();
		const parsed = JSON.parse(result.content[0]?.text ?? "{}");
		expect(parsed.degraded).toBe(true);
		expect(parsed.degraded_details).toBe("keyword backend unavailable");
	});
});
