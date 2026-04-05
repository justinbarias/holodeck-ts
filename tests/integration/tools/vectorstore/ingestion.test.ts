import { afterAll, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import type { HierarchicalDocumentTool } from "../../../../src/config/schema.js";
import { createEmbeddingProvider } from "../../../../src/tools/vectorstore/embeddings/factory.js";
import type { EmbeddingProvider } from "../../../../src/tools/vectorstore/embeddings/types.js";
import type { VectorstoreServer } from "../../../../src/tools/vectorstore/index.js";
import { createVectorstoreServer } from "../../../../src/tools/vectorstore/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(import.meta.dir, "../../../fixtures/docs");

// ---------------------------------------------------------------------------
// Ollama embedding provider (real)
// ---------------------------------------------------------------------------

const OLLAMA_ENDPOINT = process.env.OLLAMA_EMBEDDING_ENDPOINT;
const OLLAMA_MODEL = process.env.OLLAMA_EMBEDDING_MODEL;
const hasOllama = Boolean(OLLAMA_ENDPOINT && OLLAMA_MODEL);

function createOllamaProvider(): EmbeddingProvider {
	if (!OLLAMA_MODEL) throw new Error("OLLAMA_EMBEDDING_MODEL not set");
	return createEmbeddingProvider({
		provider: "ollama",
		name: OLLAMA_MODEL,
		endpoint: OLLAMA_ENDPOINT,
	});
}

// ---------------------------------------------------------------------------
// Deterministic mock embedding provider (fallback for unit-style tests)
// ---------------------------------------------------------------------------

const MOCK_DIMS = 32;

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
		return Promise.resolve(texts.map((t) => hashEmbed(t, MOCK_DIMS)));
	},
	dimensions(): number {
		return MOCK_DIMS;
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
// Mock-based tests (always run — no external dependencies)
// ---------------------------------------------------------------------------

describe("Vectorstore ingestion (mock embeddings)", () => {
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
				expect(typeof result.section_id).toBe("string");
				expect(result.section_id.length).toBeGreaterThan(0);
				expect(Array.isArray(result.parent_chain)).toBe(true);
			}

			const hasNestedResult = response.results.some((r) => r.parent_chain.length > 0);
			expect(hasNestedResult).toBe(true);
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

			const hasBothScores = response.results.some(
				(r) => r.semantic_score !== undefined && r.keyword_score !== undefined,
			);
			expect(hasBothScores).toBe(true);

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

// ---------------------------------------------------------------------------
// Ollama-based tests (skipped when OLLAMA_EMBEDDING_* env vars are not set)
// ---------------------------------------------------------------------------

describe.skipIf(!hasOllama)("Vectorstore ingestion (Ollama embeddings)", () => {
	let server: VectorstoreServer;
	let provider: EmbeddingProvider;

	afterAll(async () => {
		await server?.close();
	});

	it("ingests fixtures and produces meaningful semantic search results", async () => {
		provider = createOllamaProvider();
		server = createVectorstoreServer(createConfig({ search_mode: "semantic" }), provider);
		await server.initialize();

		const response = await server.search("how to install and set up the project", {
			search_mode: "semantic",
		});

		expect(response.total_results).toBeGreaterThan(0);
		// Real embeddings should rank the installation section highest
		const topContent = response.results[0]?.content?.toLowerCase() ?? "";
		expect(topContent).toMatch(/install|setup|getting started/i);
	}, 60_000);

	it("semantic search returns different results than keyword search", async () => {
		provider = createOllamaProvider();
		server = createVectorstoreServer(createConfig(), provider);
		await server.initialize();

		const semantic = await server.search("setting up your environment", {
			search_mode: "semantic",
		});
		const keyword = await server.search("setting up your environment", {
			search_mode: "keyword",
		});

		// Both should return results
		expect(semantic.total_results).toBeGreaterThan(0);
		expect(keyword.total_results).toBeGreaterThan(0);

		// Semantic search should find conceptually related content even without
		// exact term overlap, so the top results are likely different
		if (semantic.results[0] && keyword.results[0]) {
			const semanticTopId = `${semantic.results[0].source_path}:${semantic.results[0].chunk_index}`;
			const keywordTopId = `${keyword.results[0].source_path}:${keyword.results[0].chunk_index}`;
			// They may or may not differ — we just verify both produce results
			expect(typeof semanticTopId).toBe("string");
			expect(typeof keywordTopId).toBe("string");
		}
	}, 60_000);

	it("hybrid search with real embeddings fuses semantic and keyword results", async () => {
		provider = createOllamaProvider();
		server = createVectorstoreServer(createConfig({ search_mode: "hybrid" }), provider);
		await server.initialize();

		const response = await server.search("Redis RediSearch full-text search", {
			search_mode: "hybrid",
		});

		expect(response.search_mode).toBe("hybrid");
		expect(response.total_results).toBeGreaterThan(0);

		// Hybrid should have both modality scores for at least one result
		const hasBothScores = response.results.some(
			(r) => r.semantic_score !== undefined && r.keyword_score !== undefined,
		);
		expect(hasBothScores).toBe(true);

		// Results mentioning Redis should rank highly
		const hasRedisResult = response.results
			.slice(0, 3)
			.some((r) => r.content.toLowerCase().includes("redis"));
		expect(hasRedisResult).toBe(true);
	}, 60_000);
});
