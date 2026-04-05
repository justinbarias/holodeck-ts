import { beforeEach, describe, expect, it, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Mock chromadb
// ---------------------------------------------------------------------------

const mockUpsert = mock();
const mockQuery = mock();
const mockGet = mock();
const mockDelete = mock();
const mockGetOrCreateCollection = mock();

mock.module("chromadb", () => ({
	ChromaClient: class {
		getOrCreateCollection = mockGetOrCreateCollection;
	},
}));

// Import AFTER mock.module
import { ChromaDBVectorBackend } from "../../../../../src/tools/vectorstore/backends/chromadb.js";
import type { IndexableDocument } from "../../../../../src/tools/vectorstore/backends/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBackend() {
	return new ChromaDBVectorBackend(
		{ dimensions: 3, collectionName: "test_collection" },
		{ connectionString: "http://localhost:8000" },
	);
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

function mockCollection() {
	return { upsert: mockUpsert, query: mockQuery, get: mockGet, delete: mockDelete };
}

async function initBackend(backend: ChromaDBVectorBackend) {
	const col = mockCollection();
	const metaCol = mockCollection();
	let callCount = 0;
	mockGetOrCreateCollection.mockImplementation(() => {
		callCount++;
		return Promise.resolve(callCount === 1 ? col : metaCol);
	});
	await backend.initialize();
	return { col, metaCol };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChromaDBVectorBackend", () => {
	beforeEach(() => {
		mockGetOrCreateCollection.mockClear();
		mockUpsert.mockClear();
		mockQuery.mockClear();
		mockGet.mockClear();
		mockDelete.mockClear();
	});

	// -----------------------------------------------------------------------
	// assertReady — operations before initialize()
	// -----------------------------------------------------------------------

	describe("before initialize()", () => {
		it("throws ToolError on upsert", () => {
			const backend = makeBackend();
			expect(backend.upsert([makeDoc()])).rejects.toThrow(/initialize/);
		});

		it("throws ToolError on search", () => {
			const backend = makeBackend();
			expect(backend.search([0.1, 0.2, 0.3], 5)).rejects.toThrow(/initialize/);
		});

		it("throws ToolError on retrieve", () => {
			const backend = makeBackend();
			expect(backend.retrieve(["id"])).rejects.toThrow(/initialize/);
		});

		it("throws ToolError on delete", () => {
			const backend = makeBackend();
			expect(backend.delete(["id"])).rejects.toThrow(/initialize/);
		});

		it("throws ToolError on getManifest", () => {
			const backend = makeBackend();
			expect(backend.getManifest("key")).rejects.toThrow(/initialize/);
		});

		it("throws ToolError on setManifest", () => {
			const backend = makeBackend();
			expect(backend.setManifest("key", "val")).rejects.toThrow(/initialize/);
		});
	});

	// -----------------------------------------------------------------------
	// initialize
	// -----------------------------------------------------------------------

	describe("initialize()", () => {
		it("creates two collections (main + __meta)", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			expect(mockGetOrCreateCollection).toHaveBeenCalledTimes(2);

			const firstCall = mockGetOrCreateCollection.mock.calls[0]?.[0];
			expect(firstCall.name).toBe("test_collection");
			expect(firstCall.configuration).toEqual({ hnsw: { space: "cosine" } });
			expect(firstCall.embeddingFunction).toBeNull();

			const secondCall = mockGetOrCreateCollection.mock.calls[1]?.[0];
			expect(secondCall.name).toBe("test_collection__meta");
		});

		it("wraps client errors in ToolError", async () => {
			mockGetOrCreateCollection.mockRejectedValueOnce(new Error("connection refused"));

			const backend = makeBackend();
			await expect(backend.initialize()).rejects.toThrow(/ChromaDB initialize failed/);
		});
	});

	// -----------------------------------------------------------------------
	// upsert + sanitizeMetadata
	// -----------------------------------------------------------------------

	describe("upsert()", () => {
		it("maps docs to parallel arrays", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockUpsert.mockResolvedValueOnce(undefined);

			await backend.upsert([
				makeDoc({ id: "a", content: "alpha", embedding: [1, 0, 0], metadata: { k: "v" } }),
				makeDoc({ id: "b", content: "beta", embedding: [0, 1, 0], metadata: { n: 42 } }),
			]);

			expect(mockUpsert).toHaveBeenCalledTimes(1);
			const args = mockUpsert.mock.calls[0]?.[0];
			expect(args.ids).toEqual(["a", "b"]);
			expect(args.documents).toEqual(["alpha", "beta"]);
			expect(args.embeddings).toEqual([
				[1, 0, 0],
				[0, 1, 0],
			]);
		});

		it("sanitizes metadata — preserves string/number/boolean", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockUpsert.mockResolvedValueOnce(undefined);

			await backend.upsert([makeDoc({ metadata: { s: "hello", n: 42, b: true } })]);

			const meta = mockUpsert.mock.calls[0]?.[0].metadatas[0];
			expect(meta).toEqual({ s: "hello", n: 42, b: true });
		});

		it("sanitizes metadata — converts arrays/objects to JSON strings", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockUpsert.mockResolvedValueOnce(undefined);

			await backend.upsert([makeDoc({ metadata: { tags: ["a", "b"], nested: { x: 1 } } })]);

			const meta = mockUpsert.mock.calls[0]?.[0].metadatas[0];
			expect(meta.tags).toBe('["a","b"]');
			expect(meta.nested).toBe('{"x":1}');
		});

		it("sanitizes metadata — drops null/undefined values", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockUpsert.mockResolvedValueOnce(undefined);

			await backend.upsert([
				makeDoc({
					metadata: { keep: "yes", drop_null: null, drop_undef: undefined } as Record<
						string,
						unknown
					>,
				}),
			]);

			const meta = mockUpsert.mock.calls[0]?.[0].metadatas[0];
			expect(meta).toEqual({ keep: "yes" });
		});

		it("is a no-op for empty docs", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			await backend.upsert([]);
			expect(mockUpsert).not.toHaveBeenCalled();
		});

		it("wraps client errors in ToolError", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockUpsert.mockRejectedValueOnce(new Error("disk full"));

			await expect(backend.upsert([makeDoc()])).rejects.toThrow(/ChromaDB upsert failed/);
		});
	});

	// -----------------------------------------------------------------------
	// search — score normalization
	// -----------------------------------------------------------------------

	describe("search()", () => {
		it("converts cosine distance to similarity (1 - distance)", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockQuery.mockResolvedValueOnce({
				ids: [["a", "b", "c"]],
				distances: [[0, 0.5, 1.0]],
			});

			const hits = await backend.search([0.1, 0.2, 0.3], 5);
			expect(hits).toEqual([
				{ id: "a", score: 1.0 },
				{ id: "b", score: 0.5 },
				{ id: "c", score: 0.0 },
			]);
		});

		it("skips entries with null/undefined distance", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockQuery.mockResolvedValueOnce({
				ids: [["a", "b"]],
				distances: [[0.2, null]],
			});

			const hits = await backend.search([0.1, 0.2, 0.3], 5);
			expect(hits).toHaveLength(1);
			expect(hits[0]?.id).toBe("a");
		});

		it("skips entries with undefined id", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockQuery.mockResolvedValueOnce({
				ids: [[undefined, "b"]],
				distances: [[0.1, 0.2]],
			});

			const hits = await backend.search([0.1, 0.2, 0.3], 5);
			expect(hits).toHaveLength(1);
			expect(hits[0]?.id).toBe("b");
		});

		it("passes embedding wrapped in queryEmbeddings array", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockQuery.mockResolvedValueOnce({ ids: [[]], distances: [[]] });

			const emb = [0.1, 0.2, 0.3];
			await backend.search(emb, 10);

			const args = mockQuery.mock.calls[0]?.[0];
			expect(args.queryEmbeddings).toEqual([emb]);
			expect(args.nResults).toBe(10);
		});

		it("returns empty for empty results", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockQuery.mockResolvedValueOnce({ ids: [[]], distances: [[]] });

			const hits = await backend.search([0.1, 0.2, 0.3], 5);
			expect(hits).toEqual([]);
		});

		it("wraps client errors in ToolError", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockQuery.mockRejectedValueOnce(new Error("timeout"));

			await expect(backend.search([0.1, 0.2, 0.3], 5)).rejects.toThrow(/ChromaDB search failed/);
		});
	});

	// -----------------------------------------------------------------------
	// retrieve
	// -----------------------------------------------------------------------

	describe("retrieve()", () => {
		it("zips parallel arrays into Map", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockGet.mockResolvedValueOnce({
				ids: ["a", "b"],
				documents: ["alpha", "beta"],
				metadatas: [{ k: "v" }, { n: 1 }],
			});

			const result = await backend.retrieve(["a", "b"]);
			expect(result.size).toBe(2);
			expect(result.get("a")).toEqual({ id: "a", content: "alpha", metadata: { k: "v" } });
			expect(result.get("b")).toEqual({ id: "b", content: "beta", metadata: { n: 1 } });
		});

		it("skips entries with null content", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockGet.mockResolvedValueOnce({
				ids: ["a", "b"],
				documents: [null, "beta"],
				metadatas: [null, { n: 1 }],
			});

			const result = await backend.retrieve(["a", "b"]);
			expect(result.size).toBe(1);
			expect(result.has("a")).toBe(false);
		});

		it("defaults null metadata to empty object", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			mockGet.mockResolvedValueOnce({
				ids: ["a"],
				documents: ["alpha"],
				metadatas: [null],
			});

			const result = await backend.retrieve(["a"]);
			expect(result.get("a")?.metadata).toEqual({});
		});

		it("returns empty Map for empty ids", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			const result = await backend.retrieve([]);
			expect(result.size).toBe(0);
			expect(mockGet).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// getManifest / setManifest
	// -----------------------------------------------------------------------

	describe("getManifest()", () => {
		it("returns value from meta collection", async () => {
			const backend = makeBackend();
			const { metaCol } = await initBackend(backend);

			metaCol.get.mockResolvedValueOnce({ documents: ["stored-value"] });

			const val = await backend.getManifest("my-key");
			expect(val).toBe("stored-value");
		});

		it("returns null when not found", async () => {
			const backend = makeBackend();
			const { metaCol } = await initBackend(backend);

			metaCol.get.mockResolvedValueOnce({ documents: [] });

			const val = await backend.getManifest("missing");
			expect(val).toBeNull();
		});
	});

	describe("setManifest()", () => {
		it("upserts to meta collection", async () => {
			const backend = makeBackend();
			const { metaCol } = await initBackend(backend);

			metaCol.upsert.mockResolvedValueOnce(undefined);

			await backend.setManifest("key", "value");
			expect(metaCol.upsert).toHaveBeenCalledWith({
				ids: ["key"],
				documents: ["value"],
			});
		});
	});

	// -----------------------------------------------------------------------
	// delete
	// -----------------------------------------------------------------------

	describe("delete()", () => {
		it("calls collection.delete with ids", async () => {
			const backend = makeBackend();
			await initBackend(backend);
			mockDelete.mockResolvedValueOnce(undefined);

			await backend.delete(["a", "b"]);
			expect(mockDelete).toHaveBeenCalledWith({ ids: ["a", "b"] });
		});

		it("is a no-op for empty ids", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			await backend.delete([]);
			expect(mockDelete).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// close
	// -----------------------------------------------------------------------

	describe("close()", () => {
		it("nulls out client and collections; subsequent ops throw", async () => {
			const backend = makeBackend();
			await initBackend(backend);

			await backend.close();

			await expect(backend.search([0.1], 5)).rejects.toThrow(/initialize/);
			await expect(backend.upsert([makeDoc()])).rejects.toThrow(/initialize/);
		});
	});
});
