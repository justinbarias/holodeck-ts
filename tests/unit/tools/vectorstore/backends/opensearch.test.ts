import { beforeEach, describe, expect, it, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Mock @opensearch-project/opensearch
// ---------------------------------------------------------------------------

const mockIndicesExists = mock();
const mockIndicesCreate = mock();
const mockSearch = mock();
const mockBulk = mock();
const mockClose = mock();

mock.module("@opensearch-project/opensearch", () => ({
	Client: class {
		indices = { exists: mockIndicesExists, create: mockIndicesCreate };
		search = mockSearch;
		bulk = mockBulk;
		close = mockClose;
	},
}));

// Import AFTER mock.module
import { OpenSearchBackend } from "../../../../../src/tools/vectorstore/backends/opensearch.js";
import type { IndexableDocument } from "../../../../../src/tools/vectorstore/backends/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBackend() {
	return new OpenSearchBackend({
		url: "http://localhost:9200",
		indexName: "test_index",
	});
}

function makeDoc(overrides?: Partial<IndexableDocument>): IndexableDocument {
	return {
		id: "doc-1",
		content: "hello world",
		embedding: [0.1, 0.2, 0.3],
		metadata: { source: "test" },
		...overrides,
	};
}

function searchResponse(
	hits: Array<{ _id: string; _score: number | null }>,
	maxScore: number | null = null,
) {
	return {
		body: {
			hits: {
				max_score: maxScore ?? Math.max(...hits.map((h) => h._score ?? 0), 0),
				hits: hits.map((h) => ({
					_id: h._id,
					_score: h._score,
					_source: { content: `content-${h._id}`, metadata: {} },
				})),
			},
		},
	};
}

async function initBackend(backend: OpenSearchBackend) {
	mockIndicesExists.mockResolvedValueOnce({ body: false });
	mockIndicesCreate.mockResolvedValueOnce({});
	await backend.initialize();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenSearchBackend", () => {
	beforeEach(() => {
		mockIndicesExists.mockClear();
		mockIndicesCreate.mockClear();
		mockSearch.mockClear();
		mockBulk.mockClear();
		mockClose.mockClear();
	});

	// -----------------------------------------------------------------------
	// assertInitialized — operations before initialize()
	// -----------------------------------------------------------------------

	describe("before initialize()", () => {
		it("throws ToolError on search", () => {
			const backend = makeBackend();
			expect(backend.search("query", 5)).rejects.toThrow(/initialize/);
		});

		it("throws ToolError on exactMatch", () => {
			const backend = makeBackend();
			expect(backend.exactMatch("query", 5)).rejects.toThrow(/initialize/);
		});

		it("throws ToolError on index", () => {
			const backend = makeBackend();
			expect(backend.index([makeDoc()])).rejects.toThrow(/initialize/);
		});

		it("throws ToolError on delete", () => {
			const backend = makeBackend();
			expect(backend.delete(["id"])).rejects.toThrow(/initialize/);
		});
	});

	// -----------------------------------------------------------------------
	// initialize
	// -----------------------------------------------------------------------

	describe("initialize()", () => {
		it("creates index when it does not exist", async () => {
			mockIndicesExists.mockResolvedValueOnce({ body: false });
			mockIndicesCreate.mockResolvedValueOnce({});

			const backend = makeBackend();
			await backend.initialize();

			expect(mockIndicesCreate).toHaveBeenCalledTimes(1);
			const args = mockIndicesCreate.mock.calls[0]?.[0];
			expect(args.index).toBe("test_index");
			// Verify analyzer settings
			expect(args.body.settings.analysis.analyzer.holodeck_text.type).toBe("standard");
			expect(args.body.settings.analysis.analyzer.holodeck_text.stopwords).toBe("_english_");
			// Verify mappings
			expect(args.body.mappings.properties.content.type).toBe("text");
			expect(args.body.mappings.properties.metadata.enabled).toBe(false);
		});

		it("skips creation when index exists", async () => {
			mockIndicesExists.mockResolvedValueOnce({ body: true });

			const backend = makeBackend();
			await backend.initialize();

			expect(mockIndicesCreate).not.toHaveBeenCalled();
		});

		it("wraps errors in ToolError", async () => {
			mockIndicesExists.mockRejectedValueOnce(new Error("connection refused"));

			const backend = makeBackend();
			await expect(backend.initialize()).rejects.toThrow(/Failed to initialize OpenSearch/);
		});
	});

	// -----------------------------------------------------------------------
	// search — BM25 score normalization
	// -----------------------------------------------------------------------

	describe("search()", () => {
		it("max-normalizes BM25 scores", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockSearch.mockResolvedValueOnce(
				searchResponse(
					[
						{ _id: "a", _score: 10 },
						{ _id: "b", _score: 5 },
						{ _id: "c", _score: 2 },
					],
					10,
				),
			);

			const hits = await backend.search("test query", 10);
			expect(hits[0]).toEqual({ id: "a", score: 1.0 });
			expect(hits[1]).toEqual({ id: "b", score: 0.5 });
			expect(hits[2]).toEqual({ id: "c", score: 0.2 });
		});

		it("handles max_score=0 (all scores become 0)", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockSearch.mockResolvedValueOnce(searchResponse([{ _id: "a", _score: 0 }], 0));

			const hits = await backend.search("query", 5);
			expect(hits[0]?.score).toBe(0);
		});

		it("handles null _score (defaults to 0)", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockSearch.mockResolvedValueOnce(
				searchResponse(
					[
						{ _id: "a", _score: 10 },
						{ _id: "b", _score: null },
					],
					10,
				),
			);

			const hits = await backend.search("query", 5);
			expect(hits.find((h) => h.id === "b")?.score).toBe(0);
		});

		it("returns empty array for no hits", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockSearch.mockResolvedValueOnce({
				body: { hits: { max_score: null, hits: [] } },
			});

			const hits = await backend.search("query", 5);
			expect(hits).toEqual([]);
		});

		it("constructs multi_match query with best_fields", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockSearch.mockResolvedValueOnce({
				body: { hits: { max_score: null, hits: [] } },
			});

			await backend.search("my query", 7);

			const args = mockSearch.mock.calls[0]?.[0];
			expect(args.index).toBe("test_index");
			expect(args.body.size).toBe(7);
			expect(args.body.query.multi_match).toEqual({
				query: "my query",
				fields: ["content"],
				type: "best_fields",
			});
		});

		it("wraps errors in ToolError", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockSearch.mockRejectedValueOnce(new Error("timeout"));

			await expect(backend.search("q", 5)).rejects.toThrow(/Failed to search OpenSearch/);
		});
	});

	// -----------------------------------------------------------------------
	// exactMatch
	// -----------------------------------------------------------------------

	describe("exactMatch()", () => {
		it("uses match_phrase query", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockSearch.mockResolvedValueOnce({
				body: {
					hits: {
						hits: [{ _id: "a", _source: { content: "hello world" } }],
					},
				},
			});

			const hits = await backend.exactMatch("hello world", 5);
			expect(hits).toEqual([{ id: "a", content: "hello world" }]);

			const args = mockSearch.mock.calls[0]?.[0];
			expect(args.body.query.match_phrase).toEqual({ content: "hello world" });
		});

		it("defaults missing content to empty string", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockSearch.mockResolvedValueOnce({
				body: {
					hits: {
						hits: [{ _id: "a", _source: {} }],
					},
				},
			});

			const hits = await backend.exactMatch("query", 5);
			expect(hits[0]?.content).toBe("");
		});
	});

	// -----------------------------------------------------------------------
	// index
	// -----------------------------------------------------------------------

	describe("index()", () => {
		it("builds alternating action/document bulk body", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockBulk.mockResolvedValueOnce({ body: { errors: false, items: [] } });

			await backend.index([
				makeDoc({ id: "a", content: "alpha", metadata: { k: "v" } }),
				makeDoc({ id: "b", content: "beta", metadata: { n: 1 } }),
			]);

			expect(mockBulk).toHaveBeenCalledTimes(1);
			const body = mockBulk.mock.calls[0]?.[0].body;
			// Alternating action/document pairs
			expect(body[0]).toEqual({ index: { _index: "test_index", _id: "a" } });
			expect(body[1]).toEqual({ content: "alpha", metadata: { k: "v" } });
			expect(body[2]).toEqual({ index: { _index: "test_index", _id: "b" } });
			expect(body[3]).toEqual({ content: "beta", metadata: { n: 1 } });
		});

		it("is a no-op for empty docs", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			await backend.index([]);
			expect(mockBulk).not.toHaveBeenCalled();
		});

		it("wraps errors in ToolError", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockBulk.mockRejectedValueOnce(new Error("bulk failure"));

			await expect(backend.index([makeDoc()])).rejects.toThrow(/Failed to bulk index/);
		});
	});

	// -----------------------------------------------------------------------
	// delete
	// -----------------------------------------------------------------------

	describe("delete()", () => {
		it("builds bulk delete operations", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockBulk.mockResolvedValueOnce({ body: { errors: false, items: [] } });

			await backend.delete(["a", "b"]);

			const body = mockBulk.mock.calls[0]?.[0].body;
			expect(body).toEqual([
				{ delete: { _index: "test_index", _id: "a" } },
				{ delete: { _index: "test_index", _id: "b" } },
			]);
		});

		it("is a no-op for empty ids", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			await backend.delete([]);
			expect(mockBulk).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// close
	// -----------------------------------------------------------------------

	describe("close()", () => {
		it("calls client.close() and resets initialized flag", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockClose.mockResolvedValueOnce(undefined);

			await backend.close();

			expect(mockClose).toHaveBeenCalledTimes(1);
			// After close, operations should throw
			await expect(backend.search("q", 5)).rejects.toThrow(/initialize/);
		});
	});
});
