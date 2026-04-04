import { describe, expect, it } from "bun:test";
import { DocxConverter } from "../../../../../src/tools/vectorstore/converters/docx.js";
import { getConverter } from "../../../../../src/tools/vectorstore/converters/factory.js";
import { HtmlConverter } from "../../../../../src/tools/vectorstore/converters/html.js";
import { PdfConverter } from "../../../../../src/tools/vectorstore/converters/pdf.js";
import { TextConverter } from "../../../../../src/tools/vectorstore/converters/text.js";

describe("getConverter", () => {
	it("returns TextConverter for .txt", () => {
		expect(getConverter(".txt")).toBeInstanceOf(TextConverter);
	});

	it("returns TextConverter for .md", () => {
		expect(getConverter(".md")).toBeInstanceOf(TextConverter);
	});

	it("returns HtmlConverter for .html", () => {
		expect(getConverter(".html")).toBeInstanceOf(HtmlConverter);
	});

	it("returns HtmlConverter for .htm", () => {
		expect(getConverter(".htm")).toBeInstanceOf(HtmlConverter);
	});

	it("returns DocxConverter for .docx", () => {
		expect(getConverter(".docx")).toBeInstanceOf(DocxConverter);
	});

	it("returns PdfConverter for .pdf", () => {
		expect(getConverter(".pdf")).toBeInstanceOf(PdfConverter);
	});

	it("throws ToolError for unsupported extension", () => {
		expect(() => getConverter(".xlsx")).toThrow("Unsupported file format");
	});

	it("handles case-insensitive extensions", () => {
		expect(getConverter(".TXT")).toBeInstanceOf(TextConverter);
		expect(getConverter(".HTML")).toBeInstanceOf(HtmlConverter);
	});
});
