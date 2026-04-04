import { ToolError } from "../../../lib/errors.js";
import type { EmbeddingProvider } from "./types.js";

export interface AzureOpenAIConfig {
	readonly model: string;
	readonly endpoint: string;
	readonly apiVersion: string;
	readonly apiKey: string;
	readonly dimensions: number;
}

interface AzureEmbeddingResponse {
	data: Array<{ embedding: number[]; index: number }>;
}

export class AzureOpenAIEmbeddingProvider implements EmbeddingProvider {
	private readonly config: AzureOpenAIConfig;

	constructor(config: AzureOpenAIConfig) {
		this.config = config;
	}

	async embed(texts: string[]): Promise<number[][]> {
		const url = `${this.config.endpoint}/openai/deployments/${this.config.model}/embeddings?api-version=${this.config.apiVersion}`;
		let response: Response;

		try {
			response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"api-key": this.config.apiKey,
				},
				body: JSON.stringify({ input: texts }),
			});
		} catch (error) {
			throw new ToolError(
				`Azure OpenAI embedding request failed: ${error instanceof Error ? error.message : String(error)}`,
				{
					cause: error instanceof Error ? error : undefined,
					backend: "azure_openai",
					operation: "embed",
				},
			);
		}

		if (!response.ok) {
			throw new ToolError(
				`Azure OpenAI embedding API returned ${response.status}: ${await response.text()}`,
				{ backend: "azure_openai", operation: "embed" },
			);
		}

		const data = (await response.json()) as AzureEmbeddingResponse;
		return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
	}

	dimensions(): number {
		return this.config.dimensions;
	}
}
