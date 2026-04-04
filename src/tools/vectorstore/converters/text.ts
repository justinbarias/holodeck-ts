import type { ConvertOptions, DocumentConverter } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md"]);

export class TextConverter implements DocumentConverter {
	async convert(input: Buffer, _options?: ConvertOptions): Promise<string> {
		return input.toString("utf-8");
	}

	supports(extension: string): boolean {
		return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
	}
}
