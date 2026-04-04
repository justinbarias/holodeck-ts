import { z } from "zod";
import { toErrorMessage } from "../../lib/errors.js";
import { getModuleLogger } from "../../lib/logger.js";
import type { SearchOptions, VectorstoreServer } from "./index.js";
import type { SearchResponse } from "./types.js";

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

			return {
				content: [{ type: "text", text: JSON.stringify(response) }],
			};
		},
	};
}
