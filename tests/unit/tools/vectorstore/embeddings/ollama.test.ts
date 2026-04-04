import { describe, expect, it, mock } from "bun:test";

const mockEmbed = mock();

mock.module("ollama", () => ({
	Ollama: class {
		host: string;
		constructor(opts: { host: string }) {
			this.host = opts.host;
		}
		embed = mockEmbed;
	},
}));

import { OllamaEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/ollama.js";

describe("OllamaEmbeddingProvider", () => {
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

		mockEmbed.mockResolvedValueOnce({ embeddings: [mockEmbedding] });

		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 768,
		});

		const results = await provider.embed(["hello world"]);
		expect(results).toHaveLength(1);
		expect(results[0]).toHaveLength(768);
	});

	it("calls Ollama SDK with correct parameters", async () => {
		mockEmbed.mockResolvedValueOnce({ embeddings: [[0.1, 0.2, 0.3]] });

		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 3,
		});

		await provider.embed(["test"]);
		expect(mockEmbed).toHaveBeenCalledWith({
			model: "nomic-embed-text",
			input: ["test"],
		});
	});

	it("throws ToolError on API failure", async () => {
		mockEmbed.mockRejectedValueOnce(new Error("Internal Server Error"));

		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 768,
		});

		await expect(provider.embed(["test"])).rejects.toThrow();
	});

	it("throws ToolError on network error", async () => {
		mockEmbed.mockRejectedValueOnce(new Error("ECONNREFUSED"));

		const provider = new OllamaEmbeddingProvider({
			model: "nomic-embed-text",
			endpoint: "http://localhost:11434",
			dimensions: 768,
		});

		await expect(provider.embed(["test"])).rejects.toThrow();
	});
});
