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
	private validated = false;

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
			const embeddings = result.data
				.sort((a, b) => a.index - b.index)
				.map((d) => d.embedding as number[]);
			if (!this.validated && embeddings.length > 0) {
				// biome-ignore lint/style/noNonNullAssertion: length checked above
				const actual = embeddings[0]!.length;
				if (actual !== this.config.dimensions) {
					throw new ToolError(
						`Embedding dimension mismatch for model '${this.config.model}': ` +
							`configured ${this.config.dimensions}, but model returned ${actual}. ` +
							`Update 'dimensions' in your embedding_provider config to ${actual}.`,
						{ backend: "azure_openai", operation: "embed" },
					);
				}
				this.validated = true;
			}
			return embeddings;
		} catch (error) {
			if (error instanceof ToolError) throw error;
			const apiError = error as { status?: number };
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
