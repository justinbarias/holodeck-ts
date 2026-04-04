import { describe, expect, it } from "bun:test";
import { ToolError } from "../../../../../src/lib/errors.js";
import { AzureOpenAIEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/azure-openai.js";
import { createEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/factory.js";
import { OllamaEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/ollama.js";

describe("createEmbeddingProvider", () => {
	it("creates OllamaEmbeddingProvider for ollama config", () => {
		const provider = createEmbeddingProvider({
			provider: "ollama",
			name: "nomic-embed-text",
			dimensions: 768,
		});
		expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
		expect(provider.dimensions()).toBe(768);
	});

	it("creates AzureOpenAIEmbeddingProvider for azure_openai config", () => {
		const provider = createEmbeddingProvider({
			provider: "azure_openai",
			name: "text-embedding-ada-002",
			endpoint: "https://myinstance.openai.azure.com",
			api_version: "2024-02-01",
			api_key: "sk-test",
			dimensions: 1536,
		});
		expect(provider).toBeInstanceOf(AzureOpenAIEmbeddingProvider);
		expect(provider.dimensions()).toBe(1536);
	});

	it("uses default Ollama endpoint when not specified", () => {
		const provider = createEmbeddingProvider({
			provider: "ollama",
			name: "nomic-embed-text",
			dimensions: 768,
		});
		expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
	});

	it("throws ToolError when azure_openai is missing endpoint", () => {
		expect(() =>
			createEmbeddingProvider({
				provider: "azure_openai",
				name: "text-embedding-ada-002",
				api_key: "sk-test",
				dimensions: 1536,
			}),
		).toThrow(ToolError);
	});

	it("throws ToolError when azure_openai is missing api_key", () => {
		expect(() =>
			createEmbeddingProvider({
				provider: "azure_openai",
				name: "text-embedding-ada-002",
				endpoint: "https://myinstance.openai.azure.com",
				dimensions: 1536,
			}),
		).toThrow(ToolError);
	});
});
