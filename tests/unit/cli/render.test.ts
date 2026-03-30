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
});
