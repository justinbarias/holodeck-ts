import { describe, expect, it } from "bun:test";
import { DocxConverter } from "../../../../../src/tools/vectorstore/converters/docx.js";

describe("DocxConverter", () => {
	const converter = new DocxConverter();

	describe("supports", () => {
		it("supports .docx", () => {
			expect(converter.supports(".docx")).toBe(true);
		});

		it("does not support .doc", () => {
			expect(converter.supports(".doc")).toBe(false);
		});

		it("does not support .pdf", () => {
			expect(converter.supports(".pdf")).toBe(false);
		});

		it("handles case-insensitive extensions", () => {
			expect(converter.supports(".DOCX")).toBe(true);
		});
	});

	describe("convert", () => {
		it("throws on invalid DOCX buffer", async () => {
			const invalidBuffer = Buffer.from("not a docx file");
			await expect(converter.convert(invalidBuffer)).rejects.toThrow();
		});
	});
});
