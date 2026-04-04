import { afterAll, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import type { HierarchicalDocumentTool } from "../../../../src/config/schema.js";
import type { EmbeddingProvider } from "../../../../src/tools/vectorstore/embeddings/types.js";
import type { VectorstoreServer } from "../../../../src/tools/vectorstore/index.js";
import { createVectorstoreServer } from "../../../../src/tools/vectorstore/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(import.meta.dir, "../../../fixtures/docs");
const DIMS = 32;

// ---------------------------------------------------------------------------
// Deterministic mock embedding provider
// ---------------------------------------------------------------------------

function hashEmbed(text: string, dims: number): number[] {
	const vec = new Array(dims).fill(0);
	for (let i = 0; i < text.length; i++) {
		vec[i % dims] += text.charCodeAt(i);
	}
	const norm = Math.sqrt(vec.reduce((sum: number, v: number) => sum + v * v, 0));
	return norm > 0 ? vec.map((v: number) => v / norm) : vec;
}

const mockEmbeddingProvider: EmbeddingProvider = {
	embed(texts: string[]): Promise<number[][]> {
		return Promise.resolve(texts.map((t) => hashEmbed(t, DIMS)));
	},
	dimensions(): number {
		return DIMS;
	},
};

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

function createConfig(overrides: Partial<HierarchicalDocumentTool> = {}): HierarchicalDocumentTool {
	return {
		type: "hierarchical_document" as const,
		name: "integration_test",
		description: "Integration test docs",
		source: FIXTURES_DIR,
		chunking_strategy: "structure",
		max_chunk_tokens: 800,
		chunk_overlap: 0,
		search_mode: "hybrid",
		top_k: 10,
		semantic_weight: 0.5,
		keyword_weight: 0.3,
		exact_weight: 0.2,
		contextual_embeddings: false,
		context_max_tokens: 100,
		context_concurrency: 10,
		context_model: "claude-haiku-4-5",
		database: { provider: "in-memory" as const },
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Vectorstore ingestion integration", () => {
	describe("Ingestion populates backends", () => {
		let server: VectorstoreServer;

		afterAll(async () => {
			await server?.close();
		});

		it("keyword search for 'PostgreSQL pgvector' returns results from keywords-doc.md", async () => {
			server = createVectorstoreServer(
				createConfig({ search_mode: "keyword" }),
				mockEmbeddingProvider,
			);
			await server.initialize();

			const response = await server.search("PostgreSQL pgvector", { search_mode: "keyword" });

			expect(response.total_results).toBeGreaterThan(0);
			expect(response.results.length).toBeGreaterThan(0);

			const fromKeywordsDoc = response.results.some((r) =>
				r.source_path.includes("keywords-doc.md"),
			);
			expect(fromKeywordsDoc).toBe(true);

			// Top result should mention PostgreSQL
			const topContent = response.results[0]?.content ?? "";
			expect(topContent.toLowerCase()).toContain("postgresql");
		});
	});

	describe("Heading hierarchy metadata", () => {
		let server: VectorstoreServer;

		afterAll(async () => {
			await server?.close();
		});

		it("returns results with populated parent_chain and section_id", async () => {
			server = createVectorstoreServer(
				createConfig({ search_mode: "keyword" }),
				mockEmbeddingProvider,
			);
			await server.initialize();

			const response = await server.search("PostgreSQL", { search_mode: "keyword" });

			expect(response.total_results).toBeGreaterThan(0);

			for (const result of response.results) {
				// section_id must be a non-empty string
				expect(typeof result.section_id).toBe("string");
				expect(result.section_id.length).toBeGreaterThan(0);

				// parent_chain must be an array (may be empty for top-level, but must exist)
				expect(Array.isArray(result.parent_chain)).toBe(true);
			}

			// At least one result should have a non-empty parent_chain (nested section)
			const hasNestedResult = response.results.some((r) => r.parent_chain.length > 0);
			expect(hasNestedResult).toBe(true);
		});
	});

	describe("Semantic search", () => {
		let server: VectorstoreServer;

		afterAll(async () => {
			await server?.close();
		});

		it("returns results for a semantic query", async () => {
			server = createVectorstoreServer(
				createConfig({ search_mode: "semantic" }),
				mockEmbeddingProvider,
			);
			await server.initialize();

			const response = await server.search("database indexing strategies", {
				search_mode: "semantic",
			});

			expect(response.search_mode).toBe("semantic");
			expect(response.total_results).toBeGreaterThan(0);
			expect(response.results.length).toBeGreaterThan(0);

			// Semantic results carry a semantic_score
			for (const result of response.results) {
				expect(typeof result.semantic_score).toBe("number");
				expect(result.semantic_score).toBeGreaterThanOrEqual(0);
				expect(result.semantic_score).toBeLessThanOrEqual(1);
			}
		});
	});

	describe("Hybrid search", () => {
		let server: VectorstoreServer;

		afterAll(async () => {
			await server?.close();
		});

		it("fuses results from multiple modalities and exposes individual modality scores", async () => {
			server = createVectorstoreServer(
				createConfig({ search_mode: "hybrid" }),
				mockEmbeddingProvider,
			);
			await server.initialize();

			const response = await server.search("PostgreSQL indexing", { search_mode: "hybrid" });

			expect(response.search_mode).toBe("hybrid");
			expect(response.total_results).toBeGreaterThan(0);

			// At least one result should have both semantic and keyword scores populated
			const hasBothScores = response.results.some(
				(r) => r.semantic_score !== undefined && r.keyword_score !== undefined,
			);
			expect(hasBothScores).toBe(true);

			// Overall score must be in valid range
			for (const result of response.results) {
				expect(result.score).toBeGreaterThanOrEqual(0);
				expect(result.score).toBeLessThanOrEqual(1);
			}
		});
	});

	describe("min_score filter", () => {
		let server: VectorstoreServer;

		afterAll(async () => {
			await server?.close();
		});

		it("filters out results below the minimum score threshold", async () => {
			// Use a very high min_score to ensure most results are filtered
			const highMinScore = 0.99;
			server = createVectorstoreServer(
				createConfig({ min_score: highMinScore }),
				mockEmbeddingProvider,
			);
			await server.initialize();

			const response = await server.search("installation", {
				search_mode: "hybrid",
				min_score: highMinScore,
			});

			// Either no results, or all returned results are at or above the threshold
			for (const result of response.results) {
				expect(result.score).toBeGreaterThanOrEqual(highMinScore);
			}
		});

		it("returns more results with a lower min_score than a higher one", async () => {
			server = createVectorstoreServer(createConfig(), mockEmbeddingProvider);
			await server.initialize();

			const relaxed = await server.search("database", {
				search_mode: "hybrid",
				min_score: 0.0,
			});
			const strict = await server.search("database", {
				search_mode: "hybrid",
				min_score: 0.99,
			});

			expect(relaxed.total_results).toBeGreaterThanOrEqual(strict.total_results);
		});
	});

	describe("Empty / no-match queries", () => {
		let server: VectorstoreServer;

		afterAll(async () => {
			await server?.close();
		});

		it("returns empty results without throwing for an unmatched query", async () => {
			server = createVectorstoreServer(
				createConfig({ search_mode: "keyword", min_score: 0.999 }),
				mockEmbeddingProvider,
			);
			await server.initialize();

			// Extremely unlikely keyword to match anything
			const response = await server.search("xyzzy_nonexistent_token_12345", {
				search_mode: "keyword",
				min_score: 0.999,
			});

			expect(response.total_results).toBe(0);
			expect(Array.isArray(response.results)).toBe(true);
			expect(response.results.length).toBe(0);
			expect(response.degraded).toBeUndefined();
		});
	});
});
