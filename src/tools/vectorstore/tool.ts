import { z } from "zod";
import { toErrorMessage } from "../../lib/errors.js";
import { getModuleLogger } from "../../lib/logger.js";
import type { SearchOptions, VectorstoreServer } from "./index.js";
import type { SearchResponse, SearchResult } from "./types.js";

const logger = getModuleLogger("vectorstore.tool");

// ---------------------------------------------------------------------------
// CallToolResult — matches the MCP / Claude Agent SDK tool result shape
// ---------------------------------------------------------------------------

export interface CallToolResult {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
}

// ---------------------------------------------------------------------------
// Input schema shape (raw Zod shape, NOT z.object())
// ---------------------------------------------------------------------------

export const vectorstoreInputShape = {
	query: z.string().min(1),
	top_k: z.number().int().min(1).max(100).optional(),
	search_mode: z.enum(["semantic", "keyword", "exact", "hybrid"]).optional(),
	min_score: z.number().min(0).max(1).optional(),
};

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export interface VectorstoreTool {
	name: string;
	description: string;
	inputSchema: typeof vectorstoreInputShape;
	handler(args: {
		query: string;
		top_k?: number;
		search_mode?: "semantic" | "keyword" | "exact" | "hybrid";
		min_score?: number;
	}): Promise<CallToolResult>;
}

// ---------------------------------------------------------------------------
// Tool-output result shape (token-efficient field mapping)
// ---------------------------------------------------------------------------

interface ToolSearchResult {
	content: string;
	score: number;
	semantic_score?: number;
	keyword_score?: number;
	exact_score?: number;
	source: string;
	breadcrumb: string;
	section_id: string;
	chunk_index: number;
	is_exact_match: boolean;
}

interface ToolSearchResponse {
	query: string;
	search_mode: "semantic" | "keyword" | "exact" | "hybrid";
	total_results: number;
	results: ToolSearchResult[];
	degraded?: boolean;
	degraded_details?: string;
}

function mapResult(r: SearchResult): ToolSearchResult {
	return {
		content: r.content,
		score: r.score,
		semantic_score: r.semantic_score,
		keyword_score: r.keyword_score,
		exact_score: r.exact_score,
		source: r.source_path,
		breadcrumb: r.parent_chain.join(" > "),
		section_id: r.section_id,
		chunk_index: r.chunk_index,
		is_exact_match: r.is_exact_match,
	};
}

export function toToolResult(response: SearchResponse): CallToolResult {
	const mapped: ToolSearchResponse = {
		query: response.query,
		search_mode: response.search_mode,
		total_results: response.total_results,
		results: response.results.map(mapResult),
		...(response.degraded !== undefined && { degraded: response.degraded }),
		...(response.degraded_details !== undefined && {
			degraded_details: response.degraded_details,
		}),
	};
	return {
		content: [{ type: "text", text: JSON.stringify(mapped) }],
	};
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createVectorstoreTool(
	name: string,
	description: string,
	server: VectorstoreServer,
): VectorstoreTool {
	return {
		name,
		description,
		inputSchema: vectorstoreInputShape,

		async handler(args): Promise<CallToolResult> {
			const options: SearchOptions = {
				top_k: args.top_k,
				search_mode: args.search_mode,
				min_score: args.min_score,
			};

			let response: SearchResponse;
			try {
				response = await server.search(args.query, options);
			} catch (err) {
				const message = toErrorMessage(err);
				logger.warn`Vectorstore search failed for query '${args.query}': ${message}`;
				return {
					content: [{ type: "text", text: `Search failed: ${message}` }],
					isError: true,
				};
			}

			return toToolResult(response);
		},
	};
}
