import { z } from "zod";

const toolNamePattern = /^[0-9A-Za-z_]+$/;

export const LLMProviderSchema = z.strictObject({
	provider: z.literal("anthropic"),
	name: z.string().min(1),
	temperature: z.number().min(0).max(2).default(0.3),
	max_tokens: z.number().int().positive().default(1000),
	auth_provider: z.enum(["api_key", "bedrock", "vertex", "foundry"]).optional(),
});

export const InstructionsSchema = z
	.strictObject({
		inline: z.string().min(1).optional(),
		file: z.string().min(1).optional(),
	})
	.refine((value) => Boolean(value.inline) !== Boolean(value.file), {
		message: "Exactly one of 'inline' or 'file' must be provided",
		path: ["inline"],
	});

export const InMemoryDatabaseSchema = z.strictObject({
	provider: z.literal("in-memory"),
});

export const ConnectionDatabaseSchema = z.strictObject({
	provider: z.enum(["postgres", "redis", "chromadb"]),
	connection_string: z.string().min(1),
});

export const DatabaseSchema = z.union([InMemoryDatabaseSchema, ConnectionDatabaseSchema]);

export const HierarchicalDocumentToolSchema = z
	.strictObject({
		type: z.literal("hierarchical_document"),
		name: z.string().regex(toolNamePattern),
		description: z.string().min(1),
		source: z.string().min(1),
		chunking_strategy: z.enum(["structure", "token"]).default("structure"),
		max_chunk_tokens: z.number().int().min(100).max(2000).default(800),
		chunk_overlap: z.number().int().min(0).max(200).default(50),
		search_mode: z.enum(["semantic", "keyword", "exact", "hybrid"]).default("hybrid"),
		top_k: z.number().int().min(1).max(100).default(10),
		min_score: z.number().min(0).max(1).optional(),
		semantic_weight: z.number().min(0).max(1).default(0.5),
		keyword_weight: z.number().min(0).max(1).default(0.3),
		exact_weight: z.number().min(0).max(1).default(0.2),
		contextual_embeddings: z.boolean().default(true),
		context_max_tokens: z.number().int().min(50).max(200).default(100),
		context_concurrency: z.number().int().min(1).max(50).default(10),
		database: DatabaseSchema.default({ provider: "in-memory" }),
	})
	.superRefine((value, context) => {
		if (value.search_mode !== "hybrid") {
			return;
		}

		const totalWeight = value.semantic_weight + value.keyword_weight + value.exact_weight;
		if (Math.abs(totalWeight - 1) > 1e-6) {
			context.addIssue({
				code: "custom",
				path: ["semantic_weight"],
				message: "In hybrid mode, semantic_weight + keyword_weight + exact_weight must equal 1.0",
			});
		}
	});

export const MCPStdioToolSchema = z.strictObject({
	type: z.literal("mcp"),
	name: z.string().regex(toolNamePattern),
	description: z.string().min(1),
	transport: z.literal("stdio").default("stdio"),
	command: z.enum(["npx", "node", "docker"]),
	args: z.array(z.string()).default([]),
	env: z.record(z.string(), z.string()).default({}),
	request_timeout: z.number().positive().default(60),
});

export const MCPHttpToolSchema = z.strictObject({
	type: z.literal("mcp"),
	name: z.string().regex(toolNamePattern),
	description: z.string().min(1),
	transport: z.enum(["sse", "http"]),
	url: z.string().url(),
	headers: z.record(z.string(), z.string()).default({}),
	request_timeout: z.number().positive().default(60),
});

export const MCPToolSchema = z.union([MCPStdioToolSchema, MCPHttpToolSchema]);

export const ToolSchema = z.union([MCPToolSchema, HierarchicalDocumentToolSchema]);

export const BashConfigSchema = z.strictObject({
	enabled: z.boolean().default(true),
	excluded_commands: z.array(z.string()).default([]),
	allow_unsafe: z.boolean().default(false),
});

export const FileSystemConfigSchema = z.strictObject({
	read: z.boolean().default(true),
	write: z.boolean().default(true),
	edit: z.boolean().default(true),
});

export const ExtendedThinkingSchema = z.strictObject({
	enabled: z.boolean().default(false),
	budget_tokens: z.number().int().min(1000).max(100000).optional(),
});

export const SubagentsConfigSchema = z.strictObject({
	enabled: z.boolean().default(false),
	max_parallel: z.number().int().min(1).max(16).default(4),
});

export const ClaudeConfigSchema = z.strictObject({
	working_directory: z.string().optional(),
	permission_mode: z.enum(["manual", "acceptEdits", "acceptAll"]).default("manual"),
	max_turns: z.number().int().positive().optional(),
	extended_thinking: ExtendedThinkingSchema.optional(),
	web_search: z.boolean().default(false),
	bash: BashConfigSchema.optional(),
	file_system: FileSystemConfigSchema.optional(),
	subagents: SubagentsConfigSchema.optional(),
	allowed_tools: z.array(z.string()).nullable().default(null),
	setting_sources: z.array(z.enum(["user", "project", "local"])).default(["project"]),
});

export const AgentConfigSchema = z
	.strictObject({
		name: z.string().min(1).max(100),
		description: z.string().max(500).optional(),
		model: LLMProviderSchema,
		instructions: InstructionsSchema,
		tools: z.array(ToolSchema).max(50).default([]),
		claude: ClaudeConfigSchema.optional(),
	})
	.superRefine((value, context) => {
		const seen = new Set<string>();
		for (const [index, tool] of value.tools.entries()) {
			if (seen.has(tool.name)) {
				context.addIssue({
					code: "custom",
					path: ["tools", index, "name"],
					message: `Duplicate tool name '${tool.name}'`,
				});
				continue;
			}

			seen.add(tool.name);
		}
	});

export type LLMProvider = z.infer<typeof LLMProviderSchema>;
export type Instructions = z.infer<typeof InstructionsSchema>;
export type Database = z.infer<typeof DatabaseSchema>;
export type HierarchicalDocumentTool = z.infer<typeof HierarchicalDocumentToolSchema>;
export type MCPStdioTool = z.infer<typeof MCPStdioToolSchema>;
export type MCPHttpTool = z.infer<typeof MCPHttpToolSchema>;
export type MCPTool = z.infer<typeof MCPToolSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type BashConfig = z.infer<typeof BashConfigSchema>;
export type FileSystemConfig = z.infer<typeof FileSystemConfigSchema>;
export type ExtendedThinking = z.infer<typeof ExtendedThinkingSchema>;
export type SubagentsConfig = z.infer<typeof SubagentsConfigSchema>;
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
