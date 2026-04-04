import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { ConvertOptions, DocumentConverter } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([".html", ".htm"]);

export class HtmlConverter implements DocumentConverter {
	private readonly turndown: TurndownService;

	constructor() {
		this.turndown = new TurndownService({
			headingStyle: "atx",
			codeBlockStyle: "fenced",
		});
		this.turndown.use(gfm);
	}

	async convert(input: Buffer, _options?: ConvertOptions): Promise<string> {
		const html = input.toString("utf-8");
		if (html.trim() === "") {
			return "";
		}
		return this.turndown.turndown(html);
	}

	supports(extension: string): boolean {
		return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
	}
}
