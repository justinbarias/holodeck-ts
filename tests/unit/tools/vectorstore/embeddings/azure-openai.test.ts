import { afterEach, describe, expect, it, mock } from "bun:test";
import { AzureOpenAIEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/azure-openai.js";

describe("AzureOpenAIEmbeddingProvider", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	const baseConfig = {
		model: "text-embedding-ada-002",
		endpoint: "https://myinstance.openai.azure.com",
		apiVersion: "2024-02-01",
		apiKey: "sk-test",
		dimensions: 1536,
	};

	it("returns configured dimensions", () => {
		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		expect(provider.dimensions()).toBe(1536);
	});

	it("embeds a batch of texts", async () => {
		const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());

		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						data: [{ embedding: mockEmbedding, index: 0 }],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		) as unknown as typeof fetch;

		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		const results = await provider.embed(["hello"]);
		expect(results).toHaveLength(1);
		expect(results[0]).toHaveLength(1536);
	});

	it("calls correct Azure OpenAI endpoint", async () => {
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};

		globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
			capturedUrl = typeof input === "string" ? input : input.toString();
			capturedHeaders = Object.fromEntries(Object.entries(init?.headers || {}));
			return new Response(JSON.stringify({ data: [{ embedding: [0.1], index: 0 }] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		await provider.embed(["test"]);

		expect(capturedUrl).toBe(
			"https://myinstance.openai.azure.com/openai/deployments/text-embedding-ada-002/embeddings?api-version=2024-02-01",
		);
		expect(capturedHeaders["api-key"]).toBe("sk-test");
	});

	it("throws ToolError on API failure", async () => {
		globalThis.fetch = mock(
			async () => new Response("Unauthorized", { status: 401 }),
		) as unknown as typeof fetch;

		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		await expect(provider.embed(["test"])).rejects.toThrow();
	});

	it("handles multiple texts and orders by index", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						data: [
							{ embedding: [0.2], index: 1 },
							{ embedding: [0.1], index: 0 },
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		) as unknown as typeof fetch;

		const provider = new AzureOpenAIEmbeddingProvider({ ...baseConfig, dimensions: 1 });
		const results = await provider.embed(["first", "second"]);
		expect(results[0]).toEqual([0.1]);
		expect(results[1]).toEqual([0.2]);
	});
});
