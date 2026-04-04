import { ToolError } from "../../../lib/errors.js";
import type { EmbeddingProvider } from "./types.js";

export interface OllamaConfig {
	readonly model: string;
	readonly endpoint: string;
	readonly dimensions: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
	private readonly config: OllamaConfig;

	constructor(config: OllamaConfig) {
		this.config = config;
	}

	async embed(texts: string[]): Promise<number[][]> {
		const url = `${this.config.endpoint}/api/embed`;
		let response: Response;

		try {
			response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: this.config.model,
					input: texts,
				}),
			});
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

		if (!response.ok) {
			throw new ToolError(
				`Ollama embedding API returned ${response.status}: ${await response.text()}`,
				{ backend: "ollama", operation: "embed" },
			);
		}

		const data = (await response.json()) as { embeddings: number[][] };
		return data.embeddings;
	}

	dimensions(): number {
		return this.config.dimensions;
	}
}
