import { describe, expect, it } from "bun:test";
import {
	InMemoryBM25Backend,
	InMemoryVectorBackend,
} from "../../../../../src/tools/vectorstore/backends/in-memory.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a unit vector of `dim` dimensions with a 1 at position `pos`. */
function basisVector(dim: number, pos: number): number[] {
	const v = new Array<number>(dim).fill(0);
	v[pos] = 1;
	return v;
}

/** Normalise a vector so it has unit length. */
function normalise(v: number[]): number[] {
	const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
	return norm === 0 ? v : v.map((x) => x / norm);
}

// ---------------------------------------------------------------------------
// InMemoryVectorBackend
// ---------------------------------------------------------------------------

describe("InMemoryVectorBackend", () => {
	const cfg = { dimensions: 4, collectionName: "test" };

	// --- lifecycle ---

	it("initializes successfully", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await expect(backend.initialize()).resolves.toBeUndefined();
	});

	it("returns empty results on an empty store", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		const hits = await backend.search(basisVector(4, 0), 10);
		expect(hits).toEqual([]);
	});

	it("throws when upsert is called before initialize", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await expect(
			backend.upsert([{ id: "a", content: "x", embedding: basisVector(4, 0), metadata: {} }]),
		).rejects.toThrow("initialize");
	});

	it("throws when search is called before initialize", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await expect(backend.search(basisVector(4, 0), 5)).rejects.toThrow("initialize");
	});

	it("throws when delete is called before initialize", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await expect(backend.delete(["a"])).rejects.toThrow("initialize");
	});

	// --- upsert & search ---

	it("upserts a single chunk and retrieves it", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		await backend.upsert([
			{ id: "doc1", content: "hello", embedding: basisVector(4, 0), metadata: {} },
		]);
		const hits = await backend.search(basisVector(4, 0), 5);
		expect(hits).toHaveLength(1);
		expect(hits[0]?.id).toBe("doc1");
		expect(hits[0]?.score).toBeCloseTo(1, 5);
	});

	it("returns results sorted by descending score", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();

		// e0 and e1 are orthogonal basis vectors; query is pure e0
		// doc-a aligned with e0, doc-b aligned with e1, doc-c between
		await backend.upsert([
			{ id: "doc-a", content: "a", embedding: basisVector(4, 0), metadata: {} },
			{ id: "doc-b", content: "b", embedding: basisVector(4, 1), metadata: {} },
			{ id: "doc-c", content: "c", embedding: normalise([1, 1, 0, 0]), metadata: {} },
		]);

		const hits = await backend.search(basisVector(4, 0), 3);
		expect(hits[0]?.id).toBe("doc-a");
		expect(hits[0]?.score).toBeCloseTo(1, 5);
		expect(hits[1]?.id).toBe("doc-c");
		expect(hits[2]?.id).toBe("doc-b");
		expect(hits[2]?.score).toBeCloseTo(0, 5);
	});

	it("respects topK limit", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		for (let i = 0; i < 5; i++) {
			await backend.upsert([
				{ id: `doc-${i}`, content: `doc ${i}`, embedding: basisVector(4, i % 4), metadata: {} },
			]);
		}
		const hits = await backend.search(basisVector(4, 0), 2);
		expect(hits).toHaveLength(2);
	});

	it("upsert overwrites an existing chunk by id", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		await backend.upsert([
			{ id: "doc1", content: "old", embedding: basisVector(4, 0), metadata: {} },
		]);
		// Overwrite with a different embedding
		await backend.upsert([
			{ id: "doc1", content: "new", embedding: basisVector(4, 1), metadata: {} },
		]);
		// Searching for e1 should now match doc1 perfectly
		const hits = await backend.search(basisVector(4, 1), 5);
		expect(hits).toHaveLength(1);
		expect(hits[0]?.id).toBe("doc1");
		expect(hits[0]?.score).toBeCloseTo(1, 5);
	});

	it("throws when embedding dimension does not match config", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		await expect(
			backend.upsert([{ id: "bad", content: "x", embedding: [1, 2], metadata: {} }]),
		).rejects.toThrow("dimension");
	});

	// --- delete ---

	it("deletes a chunk so it no longer appears in search results", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		await backend.upsert([
			{ id: "doc1", content: "a", embedding: basisVector(4, 0), metadata: {} },
			{ id: "doc2", content: "b", embedding: basisVector(4, 1), metadata: {} },
		]);
		await backend.delete(["doc1"]);
		const hits = await backend.search(basisVector(4, 0), 10);
		expect(hits.map((h) => h.id)).not.toContain("doc1");
	});

	it("delete of a non-existent id is a no-op", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		await expect(backend.delete(["ghost"])).resolves.toBeUndefined();
	});

	it("deletes multiple ids at once", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		for (let i = 0; i < 4; i++) {
			await backend.upsert([
				{ id: `d${i}`, content: `doc ${i}`, embedding: basisVector(4, i), metadata: {} },
			]);
		}
		await backend.delete(["d0", "d1"]);
		const hits = await backend.search(basisVector(4, 0), 10);
		const ids = hits.map((h) => h.id);
		expect(ids).not.toContain("d0");
		expect(ids).not.toContain("d1");
	});

	// --- close ---

	it("close clears all state", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		await backend.upsert([
			{ id: "doc1", content: "a", embedding: basisVector(4, 0), metadata: {} },
		]);
		await backend.close();
		// After close, search should throw (not initialized)
		await expect(backend.search(basisVector(4, 0), 5)).rejects.toThrow("initialize");
	});

	it("close is idempotent", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		await backend.close();
		await expect(backend.close()).resolves.toBeUndefined();
	});

	it("can reinitialize after close", async () => {
		const backend = new InMemoryVectorBackend(cfg);
		await backend.initialize();
		await backend.upsert([
			{ id: "doc1", content: "a", embedding: basisVector(4, 0), metadata: {} },
		]);
		await backend.close();
		await backend.initialize();
		// Store should be empty after re-init
		const hits = await backend.search(basisVector(4, 0), 10);
		expect(hits).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// InMemoryBM25Backend
// ---------------------------------------------------------------------------

describe("InMemoryBM25Backend", () => {
	const cfg = { indexName: "test-index" };

	// --- lifecycle ---

	it("initializes successfully", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await expect(backend.initialize()).resolves.toBeUndefined();
	});

	it("returns empty results on an empty index", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		const hits = await backend.search("hello", 10);
		expect(hits).toEqual([]);
	});

	it("returns empty results for a query with no matching terms", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([{ id: "d1", content: "hello world", metadata: {} }]);
		const hits = await backend.search("xyz", 10);
		expect(hits).toEqual([]);
	});

	it("returns empty results for an empty query", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([{ id: "d1", content: "hello world", metadata: {} }]);
		const hits = await backend.search("   ", 10);
		expect(hits).toEqual([]);
	});

	it("throws when index is called before initialize", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await expect(backend.index([{ id: "a", content: "x", metadata: {} }])).rejects.toThrow(
			"initialize",
		);
	});

	it("throws when search is called before initialize", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await expect(backend.search("q", 5)).rejects.toThrow("initialize");
	});

	it("throws when delete is called before initialize", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await expect(backend.delete(["a"])).rejects.toThrow("initialize");
	});

	// --- index & search ---

	it("indexes a document and retrieves it for an exact term match", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([{ id: "doc1", content: "hello world", metadata: {} }]);
		const hits = await backend.search("hello", 10);
		expect(hits).toHaveLength(1);
		expect(hits[0]?.id).toBe("doc1");
	});

	it("score is normalized so the top result has score 1.0", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([
			{ id: "d1", content: "typescript type safety", metadata: {} },
			{ id: "d2", content: "typescript programming language", metadata: {} },
		]);
		const hits = await backend.search("typescript", 10);
		expect(hits[0]?.score).toBeCloseTo(1, 5);
	});

	it("ranks more-relevant documents higher", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		// d1 mentions the term once, d2 mentions it three times
		await backend.index([
			{ id: "d1", content: "apple banana cherry", metadata: {} },
			{ id: "d2", content: "apple apple apple banana", metadata: {} },
		]);
		const hits = await backend.search("apple", 10);
		expect(hits[0]?.id).toBe("d2");
	});

	it("handles multi-term query and combines scores", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([
			{ id: "d1", content: "machine learning models", metadata: {} },
			{ id: "d2", content: "deep learning neural networks machine", metadata: {} },
			{ id: "d3", content: "relational database sql", metadata: {} },
		]);
		const hits = await backend.search("machine learning", 10);
		const ids = hits.map((h) => h.id);
		// d3 should not appear (no matching terms)
		expect(ids).not.toContain("d3");
		// d1 and d2 should both appear
		expect(ids).toContain("d1");
		expect(ids).toContain("d2");
	});

	it("is case-insensitive", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([{ id: "d1", content: "Hello World", metadata: {} }]);
		const hitsLower = await backend.search("hello", 10);
		const hitsUpper = await backend.search("HELLO", 10);
		expect(hitsLower).toHaveLength(1);
		expect(hitsUpper).toHaveLength(1);
		expect(hitsLower[0]?.id).toBe("d1");
		expect(hitsUpper[0]?.id).toBe("d1");
	});

	it("respects topK limit", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		for (let i = 0; i < 5; i++) {
			await backend.index([{ id: `d${i}`, content: `common term doc${i}`, metadata: {} }]);
		}
		const hits = await backend.search("common", 2);
		expect(hits).toHaveLength(2);
	});

	it("upserts (re-indexes) an existing document by id", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([{ id: "d1", content: "old content alpha", metadata: {} }]);
		await backend.index([{ id: "d1", content: "new content beta", metadata: {} }]);

		// "alpha" should no longer match
		const alphaHits = await backend.search("alpha", 10);
		expect(alphaHits.map((h) => h.id)).not.toContain("d1");

		// "beta" should match
		const betaHits = await backend.search("beta", 10);
		expect(betaHits.map((h) => h.id)).toContain("d1");
	});

	// --- delete ---

	it("deletes a document so it no longer matches", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([
			{ id: "d1", content: "remove me please", metadata: {} },
			{ id: "d2", content: "keep me here", metadata: {} },
		]);
		await backend.delete(["d1"]);
		const hits = await backend.search("remove", 10);
		expect(hits.map((h) => h.id)).not.toContain("d1");
	});

	it("delete of non-existent id is a no-op", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await expect(backend.delete(["ghost"])).resolves.toBeUndefined();
	});

	it("deletes multiple ids", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([
			{ id: "d1", content: "shared term alpha", metadata: {} },
			{ id: "d2", content: "shared term beta", metadata: {} },
			{ id: "d3", content: "shared term gamma", metadata: {} },
		]);
		await backend.delete(["d1", "d2"]);
		const hits = await backend.search("shared", 10);
		const ids = hits.map((h) => h.id);
		expect(ids).not.toContain("d1");
		expect(ids).not.toContain("d2");
		expect(ids).toContain("d3");
	});

	it("correctly updates IDF after deletion", async () => {
		// With only one document left, IDF should give max score to that doc
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([
			{ id: "d1", content: "unique word here", metadata: {} },
			{ id: "d2", content: "unique word there", metadata: {} },
		]);
		await backend.delete(["d2"]);
		const hits = await backend.search("unique", 10);
		expect(hits).toHaveLength(1);
		expect(hits[0]?.id).toBe("d1");
		expect(hits[0]?.score).toBeCloseTo(1, 5);
	});

	// --- close ---

	it("close clears all state", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([{ id: "d1", content: "hello world", metadata: {} }]);
		await backend.close();
		await expect(backend.search("hello", 10)).rejects.toThrow("initialize");
	});

	it("close is idempotent", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.close();
		await expect(backend.close()).resolves.toBeUndefined();
	});

	it("can reinitialize after close and starts fresh", async () => {
		const backend = new InMemoryBM25Backend(cfg);
		await backend.initialize();
		await backend.index([{ id: "d1", content: "old content", metadata: {} }]);
		await backend.close();
		await backend.initialize();
		const hits = await backend.search("old", 10);
		expect(hits).toEqual([]);
	});
});
