import { afterEach, describe, expect, it, mock } from "bun:test";
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

		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ embeddings: [mockEmbedding] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		) as unknown as typeof fetch;

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
			return new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

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
		globalThis.fetch = mock(
			async () => new Response("Internal Server Error", { status: 500 }),
		) as unknown as typeof fetch;

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
		}) as unknown as typeof fetch;

		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 768,
		});

		await expect(provider.embed(["test"])).rejects.toThrow();
	});
});
