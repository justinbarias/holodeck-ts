import { ToolError } from "../../../lib/errors.js";
import { DocxConverter } from "./docx.js";
import { HtmlConverter } from "./html.js";
import { PdfConverter } from "./pdf.js";
import { TextConverter } from "./text.js";
import type { DocumentConverter } from "./types.js";

const converters: DocumentConverter[] = [
	new TextConverter(),
	new HtmlConverter(),
	new DocxConverter(),
	new PdfConverter(),
];

export function getConverter(extension: string): DocumentConverter {
	const normalized = extension.toLowerCase();
	const converter = converters.find((c) => c.supports(normalized));
	if (!converter) {
		throw new ToolError(`Unsupported file format: '${extension}'`);
	}
	return converter;
}
