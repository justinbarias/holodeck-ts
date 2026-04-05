import { ToolError } from "../../../lib/errors.js";
import type { ConvertOptions, DocumentConverter } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([".pdf"]);

export class PdfConverter implements DocumentConverter {
	async convert(input: Buffer, options?: ConvertOptions): Promise<string> {
		try {
			// @opendocsg/pdf2md uses WASM/Web Workers internally.
			// Dynamic import to catch runtime incompatibility at the call site.
			const { default: pdf2md } = await import("@opendocsg/pdf2md");
			return await pdf2md(input);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// Detect Bun runtime incompatibility (WASM/Worker issues)
			if (
				message.includes("Worker") ||
				message.includes("wasm") ||
				message.includes("WebAssembly") ||
				message.includes("Cannot find module")
			) {
				throw new ToolError(
					"PDF conversion not supported in Bun runtime — convert to markdown manually or use a Node.js preprocessing step",
					{ cause: error instanceof Error ? error : undefined },
				);
			}
			throw new ToolError(
				`Failed to convert PDF${options?.sourcePath ? ` (${options.sourcePath})` : ""}: ${message}`,
				{ cause: error instanceof Error ? error : undefined },
			);
		}
	}

	supports(extension: string): boolean {
		return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
	}
}
