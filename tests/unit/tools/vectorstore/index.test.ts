import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import type { HierarchicalDocumentTool } from "../../../../src/config/schema.js";
import type { EmbeddingProvider } from "../../../../src/tools/vectorstore/embeddings/types.js";
import { createVectorstoreServer } from "../../../../src/tools/vectorstore/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(import.meta.dir, "../../../fixtures/docs");

/** Deterministic mock embedding provider — returns unit vectors */
function makeMockEmbeddingProvider(dims = 4): EmbeddingProvider {
	const callCount = 0;
	return {
		embed(texts: string[]): Promise<number[][]> {
			// Each text gets a deterministic vector based on its first character code
			return Promise.resolve(
				texts.map((text) => {
					const base = (text.charCodeAt(0) % 256) / 255;
					// Spread across dimensions so vectors aren't identical
					return Array.from({ length: dims }, (_, i) =>
						i === 0 ? base : (callCount + i) / (dims * 10 + 1),
					);
				}),
			);
		},
		dimensions() {
			return dims;
		},
	};
}

function makeToolConfig(
	overrides: Partial<HierarchicalDocumentTool> = {},
): HierarchicalDocumentTool {
	return {
		type: "hierarchical_document",
		name: "test_docs",
		description: "Test document tool",
		source: FIXTURES_DIR,
		chunking_strategy: "structure",
		max_chunk_tokens: 800,
		chunk_overlap: 0,
		search_mode: "keyword",
		top_k: 10,
		min_score: undefined,
		semantic_weight: 0.5,
		keyword_weight: 0.3,
		exact_weight: 0.2,
		contextual_embeddings: false,
		context_max_tokens: 100,
		context_concurrency: 10,
		context_model: "claude-haiku-4-5",
		database: { provider: "in-memory" },
		keyword_search: undefined,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createVectorstoreServer", () => {
	it("returns an object with the expected methods", () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());

		expect(typeof server.search).toBe("function");
		expect(typeof server.initialize).toBe("function");
		expect(typeof server.reingest).toBe("function");
		expect(typeof server.close).toBe("function");
	});
});

describe("VectorstoreServer — lazy initialization", () => {
	it("initializes automatically on first search", async () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());

		// search triggers lazy init; fixture dir has docs so this should succeed
		const response = await server.search("TypeScript", {});

		expect(response.query).toBe("TypeScript");
		expect(typeof response.total_results).toBe("number");
		expect(Array.isArray(response.results)).toBe(true);

		await server.close();
	});
});

describe("VectorstoreServer — explicit initialize", () => {
	it("calling initialize() directly works and is idempotent", async () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());

		// First call triggers ingestion
		await server.initialize();
		// Second call should be a no-op (same promise)
		await server.initialize();

		// Server should be usable
		const response = await server.search("TypeScript", {});
		expect(response.search_mode).toBe("keyword");

		await server.close();
	});
});

describe("VectorstoreServer — keyword search", () => {
	it("returns results for a keyword present in fixture docs", async () => {
		const server = createVectorstoreServer(
			makeToolConfig({ search_mode: "keyword" }),
			makeMockEmbeddingProvider(),
		);

		await server.initialize();

		// "PostgreSQL" appears in keywords-doc.md
		const response = await server.search("PostgreSQL", {});
		expect(response.total_results).toBeGreaterThan(0);
		const firstResult = response.results[0];
		expect(firstResult).toBeDefined();
		if (firstResult) expect(firstResult.source_path).toContain("keywords-doc");

		await server.close();
	});

	it("respects top_k option", async () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());
		await server.initialize();

		const response = await server.search("the", { top_k: 2 });
		expect(response.results.length).toBeLessThanOrEqual(2);

		await server.close();
	});
});

describe("VectorstoreServer — exact search", () => {
	it("returns results for exact substring matches", async () => {
		const server = createVectorstoreServer(
			makeToolConfig({ search_mode: "exact" }),
			makeMockEmbeddingProvider(),
		);
		await server.initialize();

		// "TypeScript" is a distinctive phrase in simple-doc.md
		const response = await server.search("TypeScript", { search_mode: "exact" });
		expect(response.search_mode).toBe("exact");
		expect(response.total_results).toBeGreaterThan(0);
		expect(response.results.every((r) => r.is_exact_match)).toBe(true);

		await server.close();
	});

	it("returns empty results for a query that matches nothing", async () => {
		const server = createVectorstoreServer(
			makeToolConfig({ search_mode: "exact" }),
			makeMockEmbeddingProvider(),
		);
		await server.initialize();

		const response = await server.search("xyzzy_unlikely_string_9999", { search_mode: "exact" });
		expect(response.total_results).toBe(0);
		expect(response.results).toHaveLength(0);

		await server.close();
	});
});

describe("VectorstoreServer — semantic search", () => {
	it("returns results without error for semantic mode", async () => {
		const server = createVectorstoreServer(
			makeToolConfig({ search_mode: "semantic" }),
			makeMockEmbeddingProvider(),
		);
		await server.initialize();

		const response = await server.search("database systems", { search_mode: "semantic" });
		expect(response.search_mode).toBe("semantic");
		expect(Array.isArray(response.results)).toBe(true);

		await server.close();
	});
});

describe("VectorstoreServer — hybrid search", () => {
	it("returns results in hybrid mode and respects top_k", async () => {
		const server = createVectorstoreServer(
			makeToolConfig({
				search_mode: "hybrid",
				semantic_weight: 0.5,
				keyword_weight: 0.3,
				exact_weight: 0.2,
			}),
			makeMockEmbeddingProvider(),
		);
		await server.initialize();

		const response = await server.search("Redis", { search_mode: "hybrid", top_k: 3 });
		expect(response.search_mode).toBe("hybrid");
		expect(response.results.length).toBeLessThanOrEqual(3);
		// Scores should be between 0 and 1
		for (const r of response.results) {
			expect(r.score).toBeGreaterThanOrEqual(0);
			expect(r.score).toBeLessThanOrEqual(1);
		}

		await server.close();
	});
});

describe("VectorstoreServer — close", () => {
	it("close() resolves without error", async () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());
		await server.initialize();
		await expect(server.close()).resolves.toBeUndefined();
	});

	it("initialize() can be called again after close() (creates a fresh server)", async () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());
		await server.initialize();
		await server.close();

		// After close, initialize should work again (creates a fresh init)
		await server.initialize();
		const response = await server.search("TypeScript", {});
		expect(Array.isArray(response.results)).toBe(true);

		await server.close();
	});
});

describe("VectorstoreServer — reingest (incremental re-indexing)", () => {
	it("reingest() skips unchanged files and completes without error", async () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());
		await server.initialize();

		const first = await server.search("TypeScript", { search_mode: "keyword" });
		const firstCount = first.total_results;

		// Reingest — files haven't changed, so all should be skipped
		await server.reingest();

		const second = await server.search("TypeScript", { search_mode: "keyword" });
		// Results should be equivalent (same docs indexed)
		expect(second.total_results).toBe(firstCount);

		await server.close();
	});

	it("reingest() after close() re-ingests correctly", async () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());
		await server.initialize();
		await server.close();

		// Re-init from scratch
		await server.initialize();
		await server.reingest();

		const response = await server.search("ChromaDB", { search_mode: "keyword" });
		// keywords-doc.md mentions ChromaDB
		expect(response.total_results).toBeGreaterThan(0);

		await server.close();
	});
});

describe("VectorstoreServer — min_score filtering", () => {
	it("applies min_score filter to results", async () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());
		await server.initialize();

		// min_score of 1.0 should only return perfect exact matches or none
		const response = await server.search("TypeScript", {
			search_mode: "exact",
			min_score: 1.0,
		});

		// All returned results should have score >= 1.0
		for (const r of response.results) {
			expect(r.score).toBeGreaterThanOrEqual(1.0);
		}

		await server.close();
	});
});

describe("VectorstoreServer — SearchResponse structure", () => {
	it("returns a well-formed SearchResponse", async () => {
		const server = createVectorstoreServer(makeToolConfig(), makeMockEmbeddingProvider());
		await server.initialize();

		const response = await server.search("API", { search_mode: "keyword" });

		expect(response).toHaveProperty("query", "API");
		expect(response).toHaveProperty("search_mode", "keyword");
		expect(response).toHaveProperty("total_results");
		expect(response).toHaveProperty("results");
		expect(response.total_results).toBe(response.results.length);

		const firstResult2 = response.results[0];
		if (firstResult2) {
			expect(typeof firstResult2.content).toBe("string");
			expect(typeof firstResult2.score).toBe("number");
			expect(typeof firstResult2.source_path).toBe("string");
			expect(Array.isArray(firstResult2.parent_chain)).toBe(true);
			expect(typeof firstResult2.section_id).toBe("string");
			expect(Array.isArray(firstResult2.subsection_ids)).toBe(true);
			expect(typeof firstResult2.chunk_index).toBe("number");
			expect(typeof firstResult2.is_exact_match).toBe("boolean");
		}

		await server.close();
	});
});
