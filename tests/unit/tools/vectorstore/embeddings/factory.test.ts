import { describe, expect, it } from "bun:test";
import { ToolError } from "../../../../../src/lib/errors.js";
import { AzureOpenAIEmbeddingProvider } from "../../../../../src/tools/vectorstore/embeddings/azure-openai.js";
import {
	createEmbeddingProvider,
	KNOWN_DIMENSIONS,
} from "../../../../../src/tools/vectorstore/embeddings/factory.js";
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

	it("auto-resolves dimensions for known model (nomic-embed-text)", () => {
		const provider = createEmbeddingProvider({
			provider: "ollama",
			name: "nomic-embed-text",
		});
		expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
		expect(provider.dimensions()).toBe(768);
	});

	it("auto-resolves dimensions for known Azure model (text-embedding-ada-002)", () => {
		const provider = createEmbeddingProvider({
			provider: "azure_openai",
			name: "text-embedding-ada-002",
			endpoint: "https://myinstance.openai.azure.com",
			api_key: "sk-test",
		});
		expect(provider).toBeInstanceOf(AzureOpenAIEmbeddingProvider);
		expect(provider.dimensions()).toBe(1536);
	});

	it("uses explicit dimensions over auto-detected", () => {
		const provider = createEmbeddingProvider({
			provider: "ollama",
			name: "nomic-embed-text",
			dimensions: 512,
		});
		expect(provider.dimensions()).toBe(512);
	});

	it("throws ToolError for unknown model without dimensions", () => {
		expect(() =>
			createEmbeddingProvider({
				provider: "ollama",
				name: "some-custom-model",
			}),
		).toThrow(ToolError);
	});

	it("throws ToolError with helpful message listing known models", () => {
		try {
			createEmbeddingProvider({
				provider: "ollama",
				name: "some-custom-model",
			});
			expect.unreachable("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(ToolError);
			expect((error as ToolError).message).toContain("some-custom-model");
			expect((error as ToolError).message).toContain("nomic-embed-text");
		}
	});

	it("exports KNOWN_DIMENSIONS map", () => {
		expect(KNOWN_DIMENSIONS.get("nomic-embed-text")).toBe(768);
		expect(KNOWN_DIMENSIONS.get("text-embedding-ada-002")).toBe(1536);
		expect(KNOWN_DIMENSIONS.get("text-embedding-3-large")).toBe(3072);
	});
});
