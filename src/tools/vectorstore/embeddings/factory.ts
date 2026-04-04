import { AzureOpenAIEmbeddingProvider } from "./azure-openai.js";
import { OllamaEmbeddingProvider } from "./ollama.js";
import type { EmbeddingProvider } from "./types.js";

export interface EmbeddingProviderConfig {
	readonly provider: "ollama" | "azure_openai";
	readonly name: string;
	readonly endpoint?: string;
	readonly api_version?: string;
	readonly api_key?: string;
	readonly dimensions: number;
}

export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
	switch (config.provider) {
		case "ollama":
			return new OllamaEmbeddingProvider({
				model: config.name,
				endpoint: config.endpoint ?? "http://localhost:11434",
				dimensions: config.dimensions,
			});
		case "azure_openai": {
			const endpoint = config.endpoint;
			const apiKey = config.api_key;
			if (!endpoint) {
				throw new Error("azure_openai embedding provider requires an endpoint");
			}
			if (!apiKey) {
				throw new Error("azure_openai embedding provider requires an api_key");
			}
			return new AzureOpenAIEmbeddingProvider({
				model: config.name,
				endpoint,
				apiVersion: config.api_version ?? "2024-02-01",
				apiKey,
				dimensions: config.dimensions,
			});
		}
	}
}
