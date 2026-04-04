import { Ollama } from "ollama";
import { ToolError } from "../../../lib/errors.js";
import type { EmbeddingProvider } from "./types.js";

export interface OllamaConfig {
	readonly model: string;
	readonly endpoint: string;
	readonly dimensions: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
	private readonly config: OllamaConfig;
	private readonly client: Ollama;

	constructor(config: OllamaConfig) {
		this.config = config;
		this.client = new Ollama({ host: config.endpoint });
	}

	async embed(texts: string[]): Promise<number[][]> {
		try {
			const result = await this.client.embed({
				model: this.config.model,
				input: texts,
			});
			return result.embeddings;
		} catch (error) {
			throw new ToolError(
				`Ollama embedding request failed: ${error instanceof Error ? error.message : String(error)}`,
				{
					cause: error instanceof Error ? error : undefined,
					backend: "ollama",
					operation: "embed",
				},
			);
		}
	}

	dimensions(): number {
		return this.config.dimensions;
	}
}
