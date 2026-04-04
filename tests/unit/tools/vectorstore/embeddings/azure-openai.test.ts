import { describe, expect, it, mock } from "bun:test";

const mockCreate = mock();

mock.module("openai", () => ({
	AzureOpenAI: class {
		endpoint: string;
		apiKey: string;
		apiVersion: string;
		embeddings = { create: mockCreate };
		constructor(opts: { endpoint: string; apiKey: string; apiVersion: string }) {
			this.endpoint = opts.endpoint;
			this.apiKey = opts.apiKey;
			this.apiVersion = opts.apiVersion;
		}
	},
}));

import { AzureOpenAIEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/azure-openai.js";

describe("AzureOpenAIEmbeddingProvider", () => {
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

		mockCreate.mockResolvedValueOnce({
			data: [{ embedding: mockEmbedding, index: 0 }],
		});

		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		const results = await provider.embed(["hello"]);
		expect(results).toHaveLength(1);
		expect(results[0]).toHaveLength(1536);
	});

	it("calls AzureOpenAI SDK with correct parameters", async () => {
		const mockEmbedding1536 = Array.from({ length: 1536 }, () => 0.1);
		mockCreate.mockResolvedValueOnce({
			data: [{ embedding: mockEmbedding1536, index: 0 }],
		});

		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		await provider.embed(["test"]);

		expect(mockCreate).toHaveBeenCalledWith({
			model: "text-embedding-ada-002",
			input: ["test"],
			encoding_format: "float",
		});
	});

	it("throws ToolError on API failure", async () => {
		const apiError = new Error("Unauthorized");
		(apiError as unknown as { status: number }).status = 401;
		mockCreate.mockRejectedValueOnce(apiError);

		const provider = new AzureOpenAIEmbeddingProvider(baseConfig);
		await expect(provider.embed(["test"])).rejects.toThrow();
	});

	it("handles multiple texts and orders by index", async () => {
		mockCreate.mockResolvedValueOnce({
			data: [
				{ embedding: [0.2], index: 1 },
				{ embedding: [0.1], index: 0 },
			],
		});

		const provider = new AzureOpenAIEmbeddingProvider({ ...baseConfig, dimensions: 1 });
		const results = await provider.embed(["first", "second"]);
		expect(results[0]).toEqual([0.1]);
		expect(results[1]).toEqual([0.2]);
	});
});
