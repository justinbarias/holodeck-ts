import type { APIError } from "openai";
import { AzureOpenAI } from "openai";
import { ToolError } from "../../../lib/errors.js";
import type { EmbeddingProvider } from "./types.js";

export interface AzureOpenAIConfig {
	readonly model: string;
	readonly endpoint: string;
	readonly apiVersion: string;
	readonly apiKey: string;
	readonly dimensions: number;
}

export class AzureOpenAIEmbeddingProvider implements EmbeddingProvider {
	private readonly config: AzureOpenAIConfig;
	private readonly client: AzureOpenAI;

	constructor(config: AzureOpenAIConfig) {
		this.config = config;
		this.client = new AzureOpenAI({
			endpoint: config.endpoint,
			apiKey: config.apiKey,
			apiVersion: config.apiVersion,
		});
	}

	async embed(texts: string[]): Promise<number[][]> {
		try {
			const result = await this.client.embeddings.create({
				model: this.config.model,
				input: texts,
				encoding_format: "float",
			});
			return result.data.sort((a, b) => a.index - b.index).map((d) => d.embedding as number[]);
		} catch (error) {
			const apiError = error as APIError;
			const statusInfo = apiError.status ? ` (${apiError.status})` : "";
			throw new ToolError(
				`Azure OpenAI embedding request failed${statusInfo}: ${error instanceof Error ? error.message : String(error)}`,
				{
					cause: error instanceof Error ? error : undefined,
					backend: "azure_openai",
					operation: "embed",
				},
			);
		}
	}

	dimensions(): number {
		return this.config.dimensions;
	}
}
