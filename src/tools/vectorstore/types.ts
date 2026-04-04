import { z } from "zod";

export const DocumentChunkSchema = z.strictObject({
	id: z.string().min(1),
	document_id: z.string().min(1),
	content: z.string(),
	contextualized_content: z.string().optional(),
	parent_chain: z.array(z.string()),
	section_id: z.string().min(1),
	subsection_ids: z.array(z.string()),
	chunk_type: z.enum(["CONTENT", "HEADER"]),
	chunk_index: z.number().int().min(0),
	source_path: z.string().min(1),
	heading_level: z.number().int().min(1).max(6).optional(),
	token_count: z.number().int().positive(),
	embedding: z.array(z.number()),
	file_modified_at: z.number().int().positive(),
});

export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;

export const SearchResultSchema = z.strictObject({
	content: z.string(),
	score: z.number().min(0).max(1),
	semantic_score: z.number().min(0).max(1).optional(),
	keyword_score: z.number().min(0).max(1).optional(),
	exact_score: z.number().min(0).max(1).optional(),
	source_path: z.string().min(1),
	parent_chain: z.array(z.string()),
	section_id: z.string().min(1),
	subsection_ids: z.array(z.string()),
	chunk_index: z.number().int().min(0),
	is_exact_match: z.boolean(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.strictObject({
	query: z.string().min(1),
	search_mode: z.enum(["semantic", "keyword", "exact", "hybrid"]),
	total_results: z.number().int().min(0),
	results: z.array(SearchResultSchema),
	degraded: z.boolean().optional(),
	degraded_details: z.string().optional(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
