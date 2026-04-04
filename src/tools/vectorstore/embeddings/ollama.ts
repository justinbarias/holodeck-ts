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
	private validated = false;

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
			if (!this.validated && result.embeddings.length > 0) {
				// biome-ignore lint/style/noNonNullAssertion: length checked above
				const actual = result.embeddings[0]!.length;
				if (actual !== this.config.dimensions) {
					throw new ToolError(
						`Embedding dimension mismatch for model '${this.config.model}': ` +
							`configured ${this.config.dimensions}, but model returned ${actual}. ` +
							`Update 'dimensions' in your embedding_provider config to ${actual}.`,
						{ backend: "ollama", operation: "embed" },
					);
				}
				this.validated = true;
			}
			return result.embeddings;
		} catch (error) {
			if (error instanceof ToolError) throw error;
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
