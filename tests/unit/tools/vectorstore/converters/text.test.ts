import { describe, expect, it } from "bun:test";
import { TextConverter } from "../../../../../src/tools/vectorstore/converters/text.js";

describe("TextConverter", () => {
	const converter = new TextConverter();

	describe("supports", () => {
		it("supports .txt extension", () => {
			expect(converter.supports(".txt")).toBe(true);
		});

		it("supports .md extension", () => {
			expect(converter.supports(".md")).toBe(true);
		});

		it("does not support .html", () => {
			expect(converter.supports(".html")).toBe(false);
		});

		it("does not support .pdf", () => {
			expect(converter.supports(".pdf")).toBe(false);
		});

		it("handles case-insensitive extensions", () => {
			expect(converter.supports(".TXT")).toBe(true);
			expect(converter.supports(".MD")).toBe(true);
		});
	});

	describe("convert", () => {
		it("returns UTF-8 decoded content unchanged", async () => {
			const input = Buffer.from("# Hello World\n\nSome text.");
			const result = await converter.convert(input);
			expect(result).toBe("# Hello World\n\nSome text.");
		});

		it("handles empty buffer", async () => {
			const input = Buffer.from("");
			const result = await converter.convert(input);
			expect(result).toBe("");
		});

		it("handles unicode content", async () => {
			const input = Buffer.from("Schöne Grüße 🚀");
			const result = await converter.convert(input);
			expect(result).toBe("Schöne Grüße 🚀");
		});
	});
});
