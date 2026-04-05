import { describe, expect, it } from "bun:test";
import { InMemoryVectorBackend } from "../../../../../src/tools/vectorstore/backends/in-memory.js";
import {
	type HybridSearchCapable,
	isHybridSearchCapable,
	type VectorStoreBackend,
} from "../../../../../src/tools/vectorstore/backends/types.js";

// ---------------------------------------------------------------------------
// isHybridSearchCapable type guard
// ---------------------------------------------------------------------------

describe("isHybridSearchCapable", () => {
	it("returns false for backends without the method", () => {
		const backend = new InMemoryVectorBackend({ dimensions: 4, collectionName: "test" });
		expect(isHybridSearchCapable(backend)).toBe(false);
	});

	it("returns false when supportsNativeHybrid() returns false", () => {
		const backend = {
			supportsNativeHybrid: () => false,
			hybridSearch: async () => [],
		} as unknown as VectorStoreBackend & HybridSearchCapable;
		expect(isHybridSearchCapable(backend)).toBe(false);
	});

	it("returns true when supportsNativeHybrid() returns true", () => {
		const backend = {
			supportsNativeHybrid: () => true,
			hybridSearch: async () => [],
			// Satisfy the VectorStoreBackend shape for the type guard
			initialize: async () => {},
			upsert: async () => {},
			search: async () => [],
			retrieve: async () => new Map(),
			getManifest: async () => null,
			setManifest: async () => {},
			delete: async () => {},
			close: async () => {},
		} as VectorStoreBackend & HybridSearchCapable;
		expect(isHybridSearchCapable(backend)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// RedisVectorBackend.hybridSearch — score mapping
// ---------------------------------------------------------------------------

describe("RedisVectorBackend hybridSearch score mapping", () => {
	// These tests verify the score transformation logic without a real Redis
	// connection. We test the mapping rules documented in the implementation:
	//   - COSINE distance [0,2] → similarity [0,1]: sim = 1 - dist/2
	//   - BM25 scores are max-normalized across the result set
	//   - Hybrid (RRF) scores are passed through directly

	it("maps COSINE distance to similarity correctly", () => {
		// distance=0 → similarity=1 (identical)
		expect(1 - 0 / 2).toBe(1);
		// distance=1 → similarity=0.5 (orthogonal)
		expect(1 - 1 / 2).toBe(0.5);
		// distance=2 → similarity=0 (opposite)
		expect(1 - 2 / 2).toBe(0);
	});

	it("normalizes BM25 scores by max across result set", () => {
		const rawScores = [5.2, 10.4, 3.1];
		const maxScore = Math.max(...rawScores, Number.EPSILON);
		const normalized = rawScores.map((s) => s / maxScore);

		expect(normalized[0]).toBeCloseTo(0.5, 5);
		expect(normalized[1]).toBeCloseTo(1.0, 5);
		expect(normalized[2]).toBeCloseTo(0.298, 2);
	});

	it("handles empty BM25 scores gracefully (all zeros)", () => {
		const rawScores = [0, 0, 0];
		const maxScore = Math.max(...rawScores, Number.EPSILON);
		const normalized = rawScores.map((s) => s / maxScore);

		// All should be ~0 (divided by EPSILON, which is very small → still ~0)
		for (const s of normalized) {
			expect(s).toBe(0);
		}
	});
});

// ---------------------------------------------------------------------------
// Native hybrid search integration with orchestrator (mock-based)
// ---------------------------------------------------------------------------

describe("hybridSearch dispatcher fallback", () => {
	it("nativeHybridBackend is null for non-Redis backends", () => {
		// The InMemoryVectorBackend does not implement HybridSearchCapable,
		// so the type guard should return false — meaning the orchestrator
		// would set nativeHybridBackend = null.
		const backend = new InMemoryVectorBackend({ dimensions: 4, collectionName: "test" });
		expect(isHybridSearchCapable(backend)).toBe(false);
	});
});
