import * as mammoth from "mammoth";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { ToolError } from "../../../lib/errors.js";
import type { ConvertOptions, DocumentConverter } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([".docx"]);

export class DocxConverter implements DocumentConverter {
	private readonly turndown: TurndownService;

	constructor() {
		this.turndown = new TurndownService({
			headingStyle: "atx",
			codeBlockStyle: "fenced",
		});
		this.turndown.use(gfm);
	}

	async convert(input: Buffer, options?: ConvertOptions): Promise<string> {
		try {
			const result = await mammoth.convertToHtml({ buffer: input });
			if (result.value.trim() === "") {
				return "";
			}
			return this.turndown.turndown(result.value);
		} catch (error) {
			throw new ToolError(
				`Failed to convert DOCX${options?.sourcePath ? ` (${options.sourcePath})` : ""}: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error instanceof Error ? error : undefined },
			);
		}
	}

	supports(extension: string): boolean {
		return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
	}
}
