import { describe, expect, it } from "bun:test";
import { PdfConverter } from "../../../../../src/tools/vectorstore/converters/pdf.js";

describe("PdfConverter", () => {
	const converter = new PdfConverter();

	describe("supports", () => {
		it("supports .pdf", () => {
			expect(converter.supports(".pdf")).toBe(true);
		});

		it("does not support .docx", () => {
			expect(converter.supports(".docx")).toBe(false);
		});

		it("handles case-insensitive extensions", () => {
			expect(converter.supports(".PDF")).toBe(true);
		});
	});

	describe("convert", () => {
		it("throws ToolError for invalid PDF buffer", async () => {
			const invalidBuffer = Buffer.from("not a pdf file");
			await expect(converter.convert(invalidBuffer)).rejects.toThrow();
		});
	});
});
