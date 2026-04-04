import { ToolError } from "../../../lib/errors.js";
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
			if (!config.endpoint) {
				throw new ToolError("azure_openai embedding provider requires an endpoint", {
					backend: "azure_openai",
					operation: "create",
				});
			}
			if (!config.api_key) {
				throw new ToolError("azure_openai embedding provider requires an api_key", {
					backend: "azure_openai",
					operation: "create",
				});
			}
			return new AzureOpenAIEmbeddingProvider({
				model: config.name,
				endpoint: config.endpoint,
				apiVersion: config.api_version ?? "2024-02-01",
				apiKey: config.api_key,
				dimensions: config.dimensions,
			});
		}
	}
}
