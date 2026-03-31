import { describe, expect, it } from "bun:test";
import ansiRegex from "ansi-regex";
import { renderMarkdown, renderStreamingMarkdown } from "../../../src/cli/render.js";

function stripAnsi(input: string): string {
	return input.replace(ansiRegex(), "");
}

describe("cli/render", () => {
	it("renders markdown into terminal text (not HTML)", () => {
		const output = renderMarkdown("**bold** and *italic*");
		const normalized = stripAnsi(output);
		expect(normalized).toContain("bold");
		expect(normalized).toContain("italic");
		expect(normalized).not.toContain("<strong>");
	});

	it("renders fenced code blocks", () => {
		const output = renderMarkdown("```ts\nconst x = 1;\n```");
		const normalized = stripAnsi(output);
		expect(normalized).toContain("const x = 1;");
		expect(normalized).not.toContain("<code");
	});

	it("handles unterminated streaming markdown", () => {
		const output = renderStreamingMarkdown("```ts\nconst x = 1;");
		const normalized = stripAnsi(output);
		expect(normalized).toContain("const x = 1;");
	});

	it("returns empty string for empty input", () => {
		expect(renderMarkdown("")).toBe("");
		expect(renderStreamingMarkdown("")).toBe("");
	});

	// B1: renderMarkdown() edge case tests
	it("handles very long single-line input", () => {
		const longLine = "word ".repeat(500);
		const output = renderMarkdown(longLine);
		const normalized = stripAnsi(output);
		expect(normalized).toContain("word");
		expect(normalized.length).toBeGreaterThan(0);
	});

	it("renders deeply nested lists", () => {
		const md = "- level 1\n  - level 2\n    - level 3\n      - level 4";
		const output = renderMarkdown(md);
		const normalized = stripAnsi(output);
		expect(normalized).toContain("level 1");
		expect(normalized).toContain("level 4");
	});

	it("renders mixed heading levels", () => {
		const md = "# H1\n### H3\n## H2";
		const output = renderMarkdown(md);
		const normalized = stripAnsi(output);
		expect(normalized).toContain("H1");
		expect(normalized).toContain("H2");
		expect(normalized).toContain("H3");
	});

	it("renders consecutive code blocks", () => {
		const md = "```js\nconst a = 1;\n```\n\n```py\nx = 2\n```";
		const output = renderMarkdown(md);
		const normalized = stripAnsi(output);
		expect(normalized).toContain("const a = 1;");
		expect(normalized).toContain("x = 2");
	});

	it("handles unicode and emoji content", () => {
		const md = "Hello 🌍 café résumé 日本語";
		const output = renderMarkdown(md);
		const normalized = stripAnsi(output);
		expect(normalized).toContain("🌍");
		expect(normalized).toContain("café");
		expect(normalized).toContain("日本語");
	});

	it("does not double-escape ANSI sequences in output", () => {
		const md = "**bold** text";
		const output = renderMarkdown(md);
		// Should contain ANSI codes (for bold) but not escaped versions like \\x1b
		expect(output).not.toContain("\\x1b");
		expect(output).not.toContain("\\033");
	});

	// B4: renderStreamingMarkdown() edge case tests
	it("handles unterminated bold in streaming", () => {
		const output = renderStreamingMarkdown("**bol");
		const normalized = stripAnsi(output);
		expect(normalized).toContain("bol");
	});

	it("handles unterminated code fence in streaming", () => {
		const output = renderStreamingMarkdown("```js\nconst x = 1;");
		const normalized = stripAnsi(output);
		expect(normalized).toContain("const x = 1;");
	});

	it("handles unterminated inline code in streaming", () => {
		const output = renderStreamingMarkdown("some `inline code");
		const normalized = stripAnsi(output);
		expect(normalized).toContain("inline code");
	});

	it("handles partial list items in streaming", () => {
		const output = renderStreamingMarkdown("- item 1\n- item");
		const normalized = stripAnsi(output);
		expect(normalized).toContain("item 1");
		expect(normalized).toContain("item");
	});

	it("produces stable output on repeated calls with growing buffer", () => {
		const buf1 = "Hello";
		const buf2 = "Hello world";
		const buf3 = "Hello world **bold**";

		const out1 = renderStreamingMarkdown(buf1);
		const out2 = renderStreamingMarkdown(buf2);
		const out3 = renderStreamingMarkdown(buf3);

		// Each successive output should contain the previous content semantically
		const _n1 = stripAnsi(out1);
		const n2 = stripAnsi(out2);
		const n3 = stripAnsi(out3);

		expect(n2).toContain("Hello");
		expect(n2).toContain("world");
		expect(n3).toContain("bold");
	});

	it("handles buffer with trailing newlines", () => {
		const output = renderStreamingMarkdown("Hello\n\n\n");
		const normalized = stripAnsi(output);
		expect(normalized).toContain("Hello");
	});
});
