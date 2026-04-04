import { describe, expect, it } from "bun:test";
import { estimateTokens, MarkdownChunker } from "../../../../src/tools/vectorstore/chunker.js";

describe("estimateTokens", () => {
	it("counts words with 0.75 factor", () => {
		// "hello world" = 2 words, 2 * 0.75 = 1.5, ceil = 2
		expect(estimateTokens("hello world")).toBe(2);
	});

	it("returns 0 for empty string", () => {
		expect(estimateTokens("")).toBe(0);
	});

	it("returns 0 for whitespace-only string", () => {
		expect(estimateTokens("   \n\t  ")).toBe(0);
	});

	it("handles multi-word content", () => {
		// 10 words * 0.75 = 7.5, ceil = 8
		const text = "one two three four five six seven eight nine ten";
		expect(estimateTokens(text)).toBe(8);
	});
});

describe("MarkdownChunker", () => {
	describe("structure strategy — basic heading hierarchy", () => {
		it("chunks a simple document with h1 and h2", () => {
			const md = `# Introduction

Welcome to the guide.

## Getting Started

Install the package.

## Usage

Run the command.
`;
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			expect(chunks.length).toBeGreaterThanOrEqual(3);

			// First heading chunk
			const intro = chunks.find((c) => c.content.includes("Introduction"));
			expect(intro).toBeDefined();
			expect(intro?.chunk_type).toBe("HEADER");
			expect(intro?.section_id).toBe("1");
			expect(intro?.parent_chain).toEqual([]);

			// Content under Introduction
			const welcomeChunk = chunks.find((c) => c.content.includes("Welcome"));
			expect(welcomeChunk).toBeDefined();
			expect(welcomeChunk?.chunk_type).toBe("CONTENT");
			expect(welcomeChunk?.parent_chain).toEqual(["Introduction"]);

			// Getting Started section
			const gettingStarted = chunks.find(
				(c) => c.content.includes("Getting Started") && c.chunk_type === "HEADER",
			);
			expect(gettingStarted).toBeDefined();
			expect(gettingStarted?.section_id).toBe("1.1");
			expect(gettingStarted?.parent_chain).toEqual(["Introduction"]);
		});

		it("builds correct parent_chain for nested headings", () => {
			const md = `# A

## B

### C

Content under C.
`;
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const cContent = chunks.find((c) => c.content.includes("Content under C"));
			expect(cContent).toBeDefined();
			expect(cContent?.parent_chain).toEqual(["A", "B", "C"]);
		});

		it("assigns sequential chunk_index values", () => {
			const md = "# A\n\nContent A.\n\n# B\n\nContent B.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			for (let i = 0; i < chunks.length; i++) {
				// biome-ignore lint/style/noNonNullAssertion: index i is always within bounds
				expect(chunks[i]!.chunk_index).toBe(i);
			}
		});

		it("populates token_count on every chunk", () => {
			const md = "# Title\n\nSome content here.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			for (const chunk of chunks) {
				expect(chunk.token_count).toBeGreaterThan(0);
			}
		});
	});

	describe("structure strategy — edge cases", () => {
		it("handles document with no headings", () => {
			const md = "Just some plain text.\n\nAnother paragraph.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			expect(chunks.length).toBeGreaterThanOrEqual(1);
			// biome-ignore lint/style/noNonNullAssertion: length >= 1 asserted above
			expect(chunks[0]!.parent_chain).toEqual([]);
			// biome-ignore lint/style/noNonNullAssertion: length >= 1 asserted above
			expect(chunks[0]!.section_id).toBe("0");
			// biome-ignore lint/style/noNonNullAssertion: length >= 1 asserted above
			expect(chunks[0]!.chunk_type).toBe("CONTENT");
		});

		it("captures content before first heading (preamble)", () => {
			const md = "Preamble text.\n\n# First Heading\n\nContent.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const preamble = chunks.find((c) => c.content.includes("Preamble"));
			expect(preamble).toBeDefined();
			expect(preamble?.parent_chain).toEqual([]);
			expect(preamble?.section_id).toBe("0");
		});

		it("handles skipped heading levels (h1 -> h3)", () => {
			const md = "# A\n\n### C\n\nContent.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const cHeader = chunks.find((c) => c.content.includes("C") && c.chunk_type === "HEADER");
			expect(cHeader).toBeDefined();
			expect(cHeader?.parent_chain).toEqual(["A"]);
		});

		it("produces HEADER-only chunk for empty section", () => {
			const md = "# Section A\n\n# Section B\n\nContent B.\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const sectionA = chunks.find(
				(c) => c.content.includes("Section A") && c.chunk_type === "HEADER",
			);
			expect(sectionA).toBeDefined();
		});

		it("keeps fenced code blocks as atomic units", () => {
			const md = "# Code\n\n```typescript\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const codeChunk = chunks.find((c) => c.content.includes("const x = 1"));
			expect(codeChunk).toBeDefined();
			expect(codeChunk?.content).toContain("const z = 3");
		});

		it("keeps GFM tables as atomic units", () => {
			const md = "# Data\n\n| Col A | Col B |\n|-------|-------|\n| 1 | 2 |\n| 3 | 4 |\n";
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const tableChunk = chunks.find((c) => c.content.includes("Col A"));
			expect(tableChunk).toBeDefined();
			expect(tableChunk?.content).toContain("| 3 | 4 |");
		});

		it("splits oversized sections at sentence boundaries", () => {
			const sentences = Array.from(
				{ length: 50 },
				(_, i) => `This is sentence number ${i + 1} with enough words to add up.`,
			);
			const md = `# Big Section\n\n${sentences.join(" ")}\n`;

			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 50,
				chunk_overlap: 0,
			});

			const contentChunks = chunks.filter((c) => c.chunk_type === "CONTENT");
			expect(contentChunks.length).toBeGreaterThan(1);

			for (const chunk of contentChunks) {
				expect(chunk.parent_chain).toEqual(["Big Section"]);
			}
		});
	});

	describe("token strategy", () => {
		it("splits into fixed-size chunks ignoring headings", () => {
			const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
			const md = words.join(" ");

			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "token",
				max_chunk_tokens: 20,
				chunk_overlap: 0,
			});

			expect(chunks.length).toBeGreaterThan(1);
			for (const chunk of chunks) {
				expect(chunk.parent_chain).toEqual([]);
				expect(chunk.section_id).toBe("0");
			}
		});

		it("applies overlap between consecutive chunks", () => {
			const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
			const md = words.join(" ");

			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "token",
				max_chunk_tokens: 30,
				chunk_overlap: 10,
			});

			if (chunks.length >= 2) {
				// biome-ignore lint/style/noNonNullAssertion: length >= 2 checked above
				const firstWords = chunks[0]!.content.split(/\s+/);
				// biome-ignore lint/style/noNonNullAssertion: length >= 2 checked above
				const secondWords = chunks[1]!.content.split(/\s+/);
				const lastWordsOfFirst = firstWords.slice(-5);
				const firstWordsOfSecond = secondWords.slice(0, 5);
				const overlap = lastWordsOfFirst.filter((w) => firstWordsOfSecond.includes(w));
				expect(overlap.length).toBeGreaterThan(0);
			}
		});
	});

	describe("subsection_ids tracking", () => {
		it("populates subsection_ids for parent sections", () => {
			const md = `# Parent

## Child 1

Content 1.

## Child 2

Content 2.
`;
			const chunks = new MarkdownChunker().chunk(md, {
				strategy: "structure",
				max_chunk_tokens: 800,
				chunk_overlap: 0,
			});

			const parentHeader = chunks.find(
				(c) => c.content.includes("Parent") && c.chunk_type === "HEADER",
			);
			expect(parentHeader).toBeDefined();
			expect(parentHeader?.subsection_ids.length).toBe(2);
			expect(parentHeader?.subsection_ids).toContain("1.1");
			expect(parentHeader?.subsection_ids).toContain("1.2");
		});
	});
});
