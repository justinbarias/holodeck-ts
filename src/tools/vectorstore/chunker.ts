import { getEncoding } from "js-tiktoken";
import { Lexer, type Token, type Tokens } from "marked";
import type { DocumentChunk } from "./types.js";

// cl100k_base is a reasonable BPE proxy for chunk sizing — no public Claude tokenizer exists
const encoder = getEncoding("cl100k_base");

/** Estimate token count using cl100k_base BPE encoding */
export function estimateTokens(text: string): number {
	if (text.trim().length === 0) return 0;
	return encoder.encode(text).length;
}

export interface ChunkConfig {
	strategy: "structure" | "token";
	max_chunk_tokens: number;
	chunk_overlap: number;
}

type ChunkOutput = Omit<
	DocumentChunk,
	"embedding" | "id" | "document_id" | "source_path" | "sha256"
>;

interface Section {
	heading_text: string | undefined;
	heading_level: number | undefined;
	section_id: string;
	parent_chain: string[];
	subsection_ids: string[];
	content_tokens: Token[];
}

export class MarkdownChunker {
	chunk(markdown: string, config: ChunkConfig): ChunkOutput[] {
		if (config.strategy === "structure" && config.chunk_overlap > 0) {
			throw new Error("chunk_overlap is not supported with structure chunking strategy");
		}
		if (config.strategy === "token") {
			return this.chunkByTokens(markdown, config);
		}
		return this.chunkByStructure(markdown, config);
	}

	private chunkByStructure(markdown: string, config: ChunkConfig): ChunkOutput[] {
		const tokens = Lexer.lex(markdown);
		const sections = this.buildSections(tokens);
		this.linkSubsections(sections);
		return this.sectionsToChunks(sections, config);
	}

	private buildSections(tokens: Token[]): Section[] {
		const sections: Section[] = [];
		const headingStack: Array<{ depth: number; text: string }> = [];
		const counters = [0, 0, 0, 0, 0, 0]; // h1-h6
		let currentSection: Section | undefined;

		// Helper to start a new section from non-heading content (preamble or no-heading docs)
		const ensurePreamble = (): Section => {
			if (!currentSection) {
				currentSection = {
					heading_text: undefined,
					heading_level: undefined,
					section_id: "0",
					parent_chain: [],
					subsection_ids: [],
					content_tokens: [],
				};
				sections.push(currentSection);
			}
			return currentSection;
		};

		for (const token of tokens) {
			if (token.type === "heading") {
				const heading = token as Tokens.Heading;
				const depth = heading.depth;

				// Flush current section
				if (currentSection) {
					currentSection = undefined;
				}

				// Reset counters for deeper levels
				for (let i = depth; i < 6; i++) {
					counters[i] = 0;
				}
				// depth is always 1-6 from marked, so depth-1 is a valid index
				// biome-ignore lint/style/noNonNullAssertion: depth is 1-6, counters has 6 elements
				counters[depth - 1]!++;

				// Pop headings of >= depth (sibling or uncle)
				while (
					headingStack.length > 0 &&
					// biome-ignore lint/style/noNonNullAssertion: length > 0 checked above
					headingStack[headingStack.length - 1]!.depth >= depth
				) {
					headingStack.pop();
				}

				// parent_chain = current stack texts (before pushing current heading)
				const parentChain = headingStack.map((h) => h.text);

				headingStack.push({ depth, text: heading.text });

				// section_id = counters up to current depth, filtering out zeros
				const sectionId = counters
					.slice(0, depth)
					.filter((c) => c > 0)
					.join(".");

				currentSection = {
					heading_text: heading.text,
					heading_level: depth,
					section_id: sectionId,
					parent_chain: parentChain,
					subsection_ids: [],
					content_tokens: [],
				};
				sections.push(currentSection);
			} else if (token.type !== "space") {
				const section = ensurePreamble();
				section.content_tokens.push(token);
			}
		}

		return sections;
	}

	private linkSubsections(sections: Section[]): void {
		for (let i = 0; i < sections.length; i++) {
			const section = sections[i];
			if (!section || section.heading_text === undefined) continue;

			// Find immediate children: sections whose parent_chain ends with this heading's text
			// and whose section_id starts with this section's id
			for (let j = i + 1; j < sections.length; j++) {
				const candidate = sections[j];
				if (!candidate || candidate.heading_text === undefined) continue;

				// Check if candidate is a direct child
				const candidateParent = candidate.parent_chain;
				if (
					candidateParent.length > 0 &&
					// biome-ignore lint/style/noNonNullAssertion: length > 0 checked above
					candidateParent[candidateParent.length - 1]! === section.heading_text &&
					candidate.section_id.startsWith(`${section.section_id}.`)
				) {
					// Ensure it's an immediate child (one level deeper)
					const remainingId = candidate.section_id.slice(section.section_id.length + 1);
					if (!remainingId.includes(".")) {
						section.subsection_ids.push(candidate.section_id);
					}
				}
			}
		}
	}

	private sectionsToChunks(sections: Section[], config: ChunkConfig): ChunkOutput[] {
		const chunks: ChunkOutput[] = [];
		let chunkIndex = 0;

		for (const section of sections) {
			// Emit HEADER chunk if this section has a heading
			if (section.heading_text !== undefined) {
				// biome-ignore lint/style/noNonNullAssertion: heading_level is always set when heading_text is defined
				const headerContent = `${"#".repeat(section.heading_level!)} ${section.heading_text}`;
				chunks.push({
					content: headerContent,
					parent_chain: [...section.parent_chain],
					section_id: section.section_id,
					subsection_ids: section.subsection_ids,
					chunk_type: "HEADER",
					chunk_index: chunkIndex++,
					heading_level: section.heading_level,
					token_count: estimateTokens(headerContent),
				});
			}

			// Emit CONTENT chunks
			if (section.content_tokens.length > 0) {
				const parentChain =
					section.heading_text !== undefined
						? [...section.parent_chain, section.heading_text]
						: [...section.parent_chain];

				const contentBlocks = this.groupContentBlocks(
					section.content_tokens,
					config.max_chunk_tokens,
				);

				for (const block of contentBlocks) {
					chunks.push({
						content: block,
						parent_chain: parentChain,
						section_id: section.section_id,
						subsection_ids: [],
						chunk_type: "CONTENT",
						chunk_index: chunkIndex++,
						token_count: estimateTokens(block),
					});
				}
			}
		}

		return chunks;
	}

	private groupContentBlocks(tokens: Token[], maxChunkTokens: number): string[] {
		const blocks: string[] = [];
		let currentBlock = "";

		const flushBlock = (): void => {
			const trimmed = currentBlock.trim();
			if (trimmed.length > 0) {
				// Check if the block is oversized and needs sentence splitting
				if (estimateTokens(trimmed) > maxChunkTokens) {
					blocks.push(...this.splitAtSentences(trimmed, maxChunkTokens));
				} else {
					blocks.push(trimmed);
				}
				currentBlock = "";
			}
		};

		for (const token of tokens) {
			const raw = token.raw.trim();
			if (raw.length === 0) continue;

			const isAtomic = token.type === "code" || token.type === "table";
			const isList = token.type === "list";

			if (isAtomic) {
				// Flush current block before atomic content
				flushBlock();
				// Atomic content goes as its own block (even if oversized, we don't split it)
				blocks.push(raw);
			} else if (isList) {
				// Flush current block before list content
				flushBlock();
				// If list fits, emit as single block; otherwise split at item boundaries
				if (estimateTokens(raw) > maxChunkTokens) {
					blocks.push(...this.splitList(raw, maxChunkTokens));
				} else {
					blocks.push(raw);
				}
			} else {
				const combined = currentBlock.length > 0 ? `${currentBlock}\n\n${raw}` : raw;
				if (estimateTokens(combined) > maxChunkTokens && currentBlock.length > 0) {
					flushBlock();
					currentBlock = raw;
				} else {
					currentBlock = combined;
				}
			}
		}

		flushBlock();
		return blocks;
	}

	private splitList(raw: string, maxChunkTokens: number): string[] {
		// Split on list item boundaries: lines starting with "- ", "* ", "+ ", or "N. "
		const lines = raw.split("\n");
		const items: string[] = [];
		let currentItem = "";

		for (const line of lines) {
			const isItemStart = /^(\s*[-*+]\s|\s*\d+\.\s)/.test(line);
			if (isItemStart && currentItem.length > 0) {
				items.push(currentItem.trimEnd());
				currentItem = line;
			} else {
				currentItem = currentItem.length > 0 ? `${currentItem}\n${line}` : line;
			}
		}
		if (currentItem.trim().length > 0) {
			items.push(currentItem.trimEnd());
		}

		// Group items into chunks that fit within the token budget
		const result: string[] = [];
		let current = "";

		for (const item of items) {
			const candidate = current.length > 0 ? `${current}\n${item}` : item;
			if (estimateTokens(candidate) > maxChunkTokens && current.length > 0) {
				result.push(current);
				current = item;
			} else {
				current = candidate;
			}
		}

		if (current.trim().length > 0) {
			result.push(current);
		}

		return result;
	}

	private splitAtSentences(text: string, maxChunkTokens: number): string[] {
		// Split at sentence boundaries (period, exclamation, question mark followed by space or end)
		const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
		if (!sentences) return [text];

		const result: string[] = [];
		let current = "";

		for (const sentence of sentences) {
			const trimmedSentence = sentence.trim();
			if (trimmedSentence.length === 0) continue;

			const candidate = current.length > 0 ? `${current} ${trimmedSentence}` : trimmedSentence;

			if (estimateTokens(candidate) > maxChunkTokens && current.length > 0) {
				result.push(current.trim());
				current = trimmedSentence;
			} else {
				current = candidate;
			}
		}

		if (current.trim().length > 0) {
			result.push(current.trim());
		}

		return result;
	}

	private chunkByTokens(markdown: string, config: ChunkConfig): ChunkOutput[] {
		const trimmed = markdown.trim();
		if (trimmed.length === 0) return [];

		const tokens = encoder.encode(trimmed);
		if (tokens.length === 0) return [];

		const chunks: ChunkOutput[] = [];
		let chunkIndex = 0;

		const chunkSize = config.max_chunk_tokens;
		const overlap = config.chunk_overlap;
		const step = Math.max(1, chunkSize - overlap);
		let pos = 0;

		while (pos < tokens.length) {
			const end = Math.min(pos + chunkSize, tokens.length);
			const content = encoder.decode(tokens.slice(pos, end)).trim();

			chunks.push({
				content,
				parent_chain: [],
				section_id: "0",
				subsection_ids: [],
				chunk_type: "CONTENT",
				chunk_index: chunkIndex++,
				token_count: end - pos,
			});

			if (end >= tokens.length) break;
			pos += step;
		}

		return chunks;
	}
}
