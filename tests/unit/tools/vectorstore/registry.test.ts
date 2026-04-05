import { describe, expect, it } from "bun:test";
import type { AgentConfig } from "../../../../src/config/schema.js";
import type { VectorstoreDeps } from "../../../../src/tools/vectorstore/registry.js";
import { buildVectorstoreServers } from "../../../../src/tools/vectorstore/registry.js";

// ---------------------------------------------------------------------------
// Fake deps — injected instead of using mock.module to avoid global pollution
// ---------------------------------------------------------------------------

const fakeDeps: VectorstoreDeps = {
	createEmbeddingProvider: () => ({
		embed: async (texts: string[]) => texts.map(() => new Array(32).fill(0)),
		dimensions: () => 32,
	}),
	createVectorstoreServer: () => ({
		search: async () => ({
			query: "",
			search_mode: "hybrid" as const,
			total_results: 0,
			results: [],
		}),
		initialize: async () => {},
		reingest: async () => {},
		close: async () => {},
	}),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalConfig(
	tools: AgentConfig["tools"] = [],
	embeddingProvider?: AgentConfig["embedding_provider"],
): AgentConfig {
	return {
		name: "test-agent",
		model: {
			provider: "anthropic",
			name: "claude-sonnet-4-20250514",
			temperature: 0.3,
			max_tokens: 1000,
		},
		instructions: { inline: "You are helpful." },
		tools,
		embedding_provider: embeddingProvider,
	} as AgentConfig;
}

function makeHDTool(name: string): AgentConfig["tools"][number] {
	return {
		type: "hierarchical_document",
		name,
		description: `Search ${name}`,
		source: "/tmp/docs",
		chunking_strategy: "structure",
		max_chunk_tokens: 800,
		chunk_overlap: 0,
		search_mode: "hybrid",
		top_k: 10,
		semantic_weight: 0.5,
		keyword_weight: 0.3,
		exact_weight: 0.2,
		contextual_embeddings: true,
		context_max_tokens: 100,
		context_concurrency: 10,
		database: { provider: "in-memory" },
	} as AgentConfig["tools"][number];
}

function makeMCPTool(name: string): AgentConfig["tools"][number] {
	return {
		type: "mcp",
		name,
		description: `MCP tool ${name}`,
		transport: "stdio",
		command: "npx",
		args: [],
		env: {},
		headers: {},
		request_timeout: 60,
	} as AgentConfig["tools"][number];
}

const defaultEmbedding = {
	provider: "ollama" as const,
	name: "nomic-embed-text",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildVectorstoreServers", () => {
	it("returns empty when no hierarchical_document tools", () => {
		const config = makeMinimalConfig([makeMCPTool("my_mcp")]);
		const result = buildVectorstoreServers(config, fakeDeps);

		expect(result.mcpServers).toEqual({});
		expect(result.servers).toHaveLength(0);
	});

	it("returns empty when tools array is empty", () => {
		const config = makeMinimalConfig([]);
		const result = buildVectorstoreServers(config, fakeDeps);

		expect(result.mcpServers).toEqual({});
		expect(result.servers).toHaveLength(0);
	});

	it("creates MCP server for hierarchical_document tool", () => {
		const config = makeMinimalConfig([makeHDTool("knowledge_base")], defaultEmbedding);
		const result = buildVectorstoreServers(config, fakeDeps);

		expect(Object.keys(result.mcpServers)).toEqual(["holodeck_vectorstore"]);
		expect(result.servers).toHaveLength(1);
	});

	it("creates single MCP server for multiple tools", () => {
		const config = makeMinimalConfig(
			[makeHDTool("docs_a"), makeHDTool("docs_b")],
			defaultEmbedding,
		);
		const result = buildVectorstoreServers(config, fakeDeps);

		expect(Object.keys(result.mcpServers)).toEqual(["holodeck_vectorstore"]);
		expect(result.servers).toHaveLength(2);
	});

	it("skips non-hierarchical_document tools", () => {
		const config = makeMinimalConfig(
			[makeMCPTool("my_mcp"), makeHDTool("knowledge_base"), makeMCPTool("another_mcp")],
			defaultEmbedding,
		);
		const result = buildVectorstoreServers(config, fakeDeps);

		expect(Object.keys(result.mcpServers)).toEqual(["holodeck_vectorstore"]);
		expect(result.servers).toHaveLength(1);
	});
});
