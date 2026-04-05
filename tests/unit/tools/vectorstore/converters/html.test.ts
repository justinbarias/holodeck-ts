import { describe, expect, it } from "bun:test";
import { HtmlConverter } from "../../../../../src/tools/vectorstore/converters/html.js";

describe("HtmlConverter", () => {
	const converter = new HtmlConverter();

	describe("supports", () => {
		it("supports .html", () => {
			expect(converter.supports(".html")).toBe(true);
		});

		it("supports .htm", () => {
			expect(converter.supports(".htm")).toBe(true);
		});

		it("does not support .txt", () => {
			expect(converter.supports(".txt")).toBe(false);
		});

		it("handles case-insensitive extensions", () => {
			expect(converter.supports(".HTML")).toBe(true);
		});
	});

	describe("convert", () => {
		it("converts headings to ATX-style markdown", async () => {
			const html = Buffer.from("<h1>Title</h1><h2>Section</h2><p>Content</p>");
			const result = await converter.convert(html);
			expect(result).toContain("# Title");
			expect(result).toContain("## Section");
			expect(result).toContain("Content");
		});

		it("converts lists to markdown", async () => {
			const html = Buffer.from("<ul><li>Item 1</li><li>Item 2</li></ul>");
			const result = await converter.convert(html);
			expect(result).toContain("Item 1");
			expect(result).toContain("Item 2");
		});

		it("converts tables to GFM tables", async () => {
			const html = Buffer.from(
				"<table><thead><tr><th>Name</th><th>Value</th></tr></thead>" +
					"<tbody><tr><td>A</td><td>1</td></tr></tbody></table>",
			);
			const result = await converter.convert(html);
			expect(result).toContain("Name");
			expect(result).toContain("Value");
			expect(result).toContain("|");
		});

		it("converts bold and italic", async () => {
			const html = Buffer.from("<p><strong>bold</strong> and <em>italic</em></p>");
			const result = await converter.convert(html);
			expect(result).toContain("**bold**");
		});

		it("handles empty HTML", async () => {
			const result = await converter.convert(Buffer.from(""));
			expect(result).toBe("");
		});
	});
});
