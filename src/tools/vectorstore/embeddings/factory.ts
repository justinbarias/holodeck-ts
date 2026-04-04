import { ToolError } from "../../../lib/errors.js";
import { AzureOpenAIEmbeddingProvider } from "./azure-openai.js";
import { OllamaEmbeddingProvider } from "./ollama.js";
import type { EmbeddingProvider } from "./types.js";

export const KNOWN_DIMENSIONS: ReadonlyMap<string, number> = new Map([
	["text-embedding-ada-002", 1536],
	["text-embedding-3-small", 1536],
	["text-embedding-3-large", 3072],
	["nomic-embed-text", 768],
	["qwen3-embedding", 4096],
]);

export interface EmbeddingProviderConfig {
	readonly provider: "ollama" | "azure_openai";
	readonly name: string;
	readonly endpoint?: string;
	readonly api_version?: string;
	readonly api_key?: string;
	readonly dimensions?: number;
}

function resolveDimensions(config: EmbeddingProviderConfig): number {
	if (config.dimensions) return config.dimensions;
	const known = KNOWN_DIMENSIONS.get(config.name);
	if (known) return known;
	throw new ToolError(
		`Cannot infer embedding dimensions for model '${config.name}'. ` +
			`Specify 'dimensions' explicitly in embedding_provider config. ` +
			`Known models: ${[...KNOWN_DIMENSIONS.keys()].join(", ")}`,
		{ backend: config.provider, operation: "create" },
	);
}

export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
	const dimensions = resolveDimensions(config);

	switch (config.provider) {
		case "ollama":
			return new OllamaEmbeddingProvider({
				model: config.name,
				endpoint: config.endpoint ?? "http://localhost:11434",
				dimensions,
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
				dimensions,
			});
		}
	}
}
