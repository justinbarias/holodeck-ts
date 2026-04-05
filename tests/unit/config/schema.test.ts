import { describe, expect, it } from "bun:test";
import { parse } from "yaml";
import {
	AgentConfigSchema,
	BashConfigSchema,
	ClaudeConfigSchema,
	EmbeddingProviderSchema,
	ExtendedThinkingSchema,
	FileSystemConfigSchema,
	HierarchicalDocumentToolSchema,
	InstructionsSchema,
	KeywordSearchConfigSchema,
	LLMProviderSchema,
	MCPHttpToolSchema,
	MCPStdioToolSchema,
	ObservabilitySchema,
	SubagentsConfigSchema,
} from "../../../src/config/schema.js";

async function readYamlFixture(path: string): Promise<unknown> {
	const raw = await Bun.file(path).text();
	return parse(raw) as unknown;
}

describe("config/schema", () => {
	it("applies LLM defaults and validates bounds", () => {
		const parsed = LLMProviderSchema.parse({
			provider: "anthropic",
			name: "claude-sonnet-4-20250514",
		});

		expect(parsed.temperature).toBe(0.3);
		expect(parsed.max_tokens).toBe(1000);

		expect(() =>
			LLMProviderSchema.parse({
				provider: "openai",
				name: "gpt-4",
			}),
		).toThrow();

		expect(() =>
			LLMProviderSchema.parse({
				provider: "anthropic",
				name: "claude",
				max_tokens: -1,
			}),
		).toThrow();

		expect(() =>
			LLMProviderSchema.parse({
				provider: "anthropic",
				name: "claude",
				temperature: 2.1,
			}),
		).toThrow();
	});

	it("enforces instructions inline/file xor", () => {
		expect(
			InstructionsSchema.safeParse({
				inline: "hi",
			}).success,
		).toBe(true);

		expect(
			InstructionsSchema.safeParse({
				file: "./instructions.md",
			}).success,
		).toBe(true);

		expect(
			InstructionsSchema.safeParse({
				inline: "x",
				file: "./instructions.md",
			}).success,
		).toBe(false);

		expect(InstructionsSchema.safeParse({}).success).toBe(false);
	});

	it("sets claude defaults", () => {
		const parsed = ClaudeConfigSchema.parse({});
		expect(parsed.permission_mode).toBe("manual");
		expect(parsed.web_search).toBe(false);
		expect(parsed.allowed_tools).toBeNull();
	});

	it("validates mcp stdio/http variants", () => {
		const stdio = MCPStdioToolSchema.safeParse({
			type: "mcp",
			name: "docs_search",
			description: "Search docs",
			command: "npx",
		});
		expect(stdio.success).toBe(true);

		const http = MCPHttpToolSchema.safeParse({
			type: "mcp",
			name: "remote_api",
			description: "Remote API",
			transport: "http",
			url: "https://example.com/mcp",
		});
		expect(http.success).toBe(true);
	});

	it("parses minimal and full fixtures", async () => {
		const minimal = await readYamlFixture("tests/fixtures/agents/valid-minimal.yaml");
		const full = await readYamlFixture("tests/fixtures/agents/valid-full.yaml");

		expect(AgentConfigSchema.safeParse(minimal).success).toBe(true);
		expect(AgentConfigSchema.safeParse(full).success).toBe(true);
	});

	it("rejects unknown fields in strict mode", async () => {
		const unknown = await readYamlFixture("tests/fixtures/agents/invalid-unknown.yaml");
		expect(AgentConfigSchema.safeParse(unknown).success).toBe(false);
	});

	it("enforces tool name pattern", () => {
		const invalid = MCPStdioToolSchema.safeParse({
			type: "mcp",
			name: "invalid-name",
			description: "invalid",
			command: "npx",
		});
		expect(invalid.success).toBe(false);
	});

	it("exports and validates all sub-schemas", () => {
		expect(
			BashConfigSchema.safeParse({
				enabled: true,
				excluded_commands: ["rm"],
				allow_unsafe: false,
			}).success,
		).toBe(true);
		expect(BashConfigSchema.safeParse({ allow_unsafe: "nope" }).success).toBe(false);

		expect(
			FileSystemConfigSchema.safeParse({
				read: true,
				write: false,
				edit: false,
			}).success,
		).toBe(true);
		expect(FileSystemConfigSchema.safeParse({ read: "true" }).success).toBe(false);

		expect(
			ExtendedThinkingSchema.safeParse({
				enabled: true,
				budget_tokens: 5000,
			}).success,
		).toBe(true);
		expect(
			ExtendedThinkingSchema.safeParse({
				enabled: true,
				budget_tokens: 500,
			}).success,
		).toBe(false);

		expect(
			SubagentsConfigSchema.safeParse({
				enabled: true,
				max_parallel: 4,
			}).success,
		).toBe(true);
		expect(
			SubagentsConfigSchema.safeParse({
				enabled: true,
				max_parallel: 20,
			}).success,
		).toBe(false);
	});
});

describe("ClaudeConfigSchema setting_sources", () => {
	it("accepts valid setting_sources array", () => {
		const result = ClaudeConfigSchema.safeParse({
			setting_sources: ["project"],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.setting_sources).toEqual(["project"]);
		}
	});

	it("accepts all valid source values", () => {
		const result = ClaudeConfigSchema.safeParse({
			setting_sources: ["user", "project", "local"],
		});
		expect(result.success).toBe(true);
	});

	it("defaults to ['project'] when not specified", () => {
		const result = ClaudeConfigSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.setting_sources).toEqual(["project"]);
		}
	});

	it("rejects invalid source values", () => {
		const result = ClaudeConfigSchema.safeParse({
			setting_sources: ["invalid"],
		});
		expect(result.success).toBe(false);
	});

	it("accepts empty array to disable all sources", () => {
		const result = ClaudeConfigSchema.safeParse({
			setting_sources: [],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.setting_sources).toEqual([]);
		}
	});
});

describe("KeywordSearchConfigSchema", () => {
	it("parses a valid OpenSearch keyword search config", () => {
		const result = KeywordSearchConfigSchema.safeParse({
			provider: "opensearch",
			url: "http://localhost:9200",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.headers).toEqual({});
			expect(result.data.request_timeout).toBe(60);
		}
	});

	it("rejects invalid URL", () => {
		const result = KeywordSearchConfigSchema.safeParse({
			provider: "opensearch",
			url: "not-a-url",
		});
		expect(result.success).toBe(false);
	});

	it("rejects unknown provider", () => {
		const result = KeywordSearchConfigSchema.safeParse({
			provider: "elasticsearch",
			url: "http://localhost:9200",
		});
		expect(result.success).toBe(false);
	});
});

describe("EmbeddingProviderSchema", () => {
	it("parses a valid Ollama config", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "ollama",
			name: "nomic-embed-text",
			dimensions: 768,
		});
		expect(result.success).toBe(true);
	});

	it("parses a valid Azure OpenAI config", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "azure_openai",
			name: "text-embedding-ada-002",
			endpoint: "https://myinstance.openai.azure.com",
			api_version: "2024-02-01",
			api_key: "sk-test",
			dimensions: 1536,
		});
		expect(result.success).toBe(true);
	});

	it("rejects azure_openai without endpoint", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "azure_openai",
			name: "text-embedding-ada-002",
			dimensions: 1536,
		});
		expect(result.success).toBe(false);
	});

	it("allows ollama without endpoint (uses default)", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "ollama",
			name: "nomic-embed-text",
			dimensions: 768,
		});
		expect(result.success).toBe(true);
	});

	it("accepts config without dimensions for known models", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "ollama",
			name: "nomic-embed-text",
		});
		expect(result.success).toBe(true);
	});

	it("rejects azure_openai without api_key", () => {
		const result = EmbeddingProviderSchema.safeParse({
			provider: "azure_openai",
			name: "text-embedding-ada-002",
			endpoint: "https://myinstance.openai.azure.com",
			dimensions: 1536,
		});
		expect(result.success).toBe(false);
	});
});

describe("HierarchicalDocumentToolSchema keyword_search", () => {
	const baseHierarchicalTool = {
		type: "hierarchical_document",
		name: "docs",
		description: "Search docs",
		source: "./docs",
	};

	it("accepts tool without keyword_search", () => {
		const result = HierarchicalDocumentToolSchema.safeParse(baseHierarchicalTool);
		expect(result.success).toBe(true);
	});

	it("accepts tool with keyword_search", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			...baseHierarchicalTool,
			keyword_search: {
				provider: "opensearch",
				url: "http://localhost:9200",
			},
		});
		expect(result.success).toBe(true);
	});

	it("requires keyword_search when database is chromadb", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			...baseHierarchicalTool,
			database: {
				provider: "chromadb",
				connection_string: "http://localhost:8000",
			},
		});
		expect(result.success).toBe(false);
	});

	it("accepts chromadb with keyword_search", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			...baseHierarchicalTool,
			database: {
				provider: "chromadb",
				connection_string: "http://localhost:8000",
			},
			keyword_search: {
				provider: "opensearch",
				url: "http://localhost:9200",
			},
		});
		expect(result.success).toBe(true);
	});

	it("accepts context_model override", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			...baseHierarchicalTool,
			context_model: "claude-sonnet-4-20250514",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.context_model).toBe("claude-sonnet-4-20250514");
		}
	});

	it("defaults context_model to claude-haiku-4-5", () => {
		const result = HierarchicalDocumentToolSchema.safeParse(baseHierarchicalTool);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.context_model).toBe("claude-haiku-4-5");
		}
	});

	it("defaults chunk_overlap to 0", () => {
		const result = HierarchicalDocumentToolSchema.parse({
			type: "hierarchical_document",
			name: "test_tool",
			description: "Test tool",
			source: "./docs/",
		});
		expect(result.chunk_overlap).toBe(0);
		expect(result.chunking_strategy).toBe("structure");
	});

	it("rejects chunk_overlap > 0 with structure strategy", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			type: "hierarchical_document",
			name: "test_tool",
			description: "Test tool",
			source: "./docs/",
			chunking_strategy: "structure",
			chunk_overlap: 50,
		});
		expect(result.success).toBe(false);
	});

	it("allows chunk_overlap > 0 with token strategy", () => {
		const result = HierarchicalDocumentToolSchema.safeParse({
			type: "hierarchical_document",
			name: "test_tool",
			description: "Test tool",
			source: "./docs/",
			chunking_strategy: "token",
			chunk_overlap: 50,
		});
		expect(result.success).toBe(true);
	});
});

describe("ObservabilitySchema", () => {
	it("is optional on AgentConfigSchema", () => {
		const result = AgentConfigSchema.safeParse({
			name: "test-agent",
			model: { provider: "anthropic", name: "claude-sonnet-4-20250514" },
			instructions: { inline: "You are helpful." },
		});
		expect(result.success).toBe(true);
	});

	it("parses a valid full observability config with defaults", () => {
		const result = ObservabilitySchema.safeParse({
			enabled: true,
			service_name: "my-agent",
		});
		expect(result.success).toBe(true);
	});

	it("applies defaults for nested schemas", () => {
		const result = ObservabilitySchema.parse({
			enabled: true,
			logs: {},
			exporters: { otlp: {} },
		});
		expect(result.logs?.enabled).toBe(true);
		expect(result.logs?.level).toBe("info");
		expect(result.exporters?.otlp?.enabled).toBe(true);
		expect(result.exporters?.otlp?.endpoint).toBe("http://localhost:4318");
		expect(result.exporters?.otlp?.protocol).toBe("http");
	});

	it("rejects invalid OTLP endpoint URL", () => {
		const result = ObservabilitySchema.safeParse({
			enabled: true,
			exporters: { otlp: { endpoint: "not-a-url" } },
		});
		expect(result.success).toBe(false);
	});

	it("rejects unknown fields in strict mode", () => {
		const result = ObservabilitySchema.safeParse({
			enabled: true,
			unknown_field: "oops",
		});
		expect(result.success).toBe(false);
	});

	it("defaults enabled to false", () => {
		const result = ObservabilitySchema.parse({});
		expect(result.enabled).toBe(false);
	});

	it("accepts all log levels", () => {
		for (const level of ["debug", "info", "warning", "error"]) {
			const result = ObservabilitySchema.safeParse({
				enabled: true,
				logs: { level },
			});
			expect(result.success).toBe(true);
		}
	});

	it("rejects invalid log level", () => {
		const result = ObservabilitySchema.safeParse({
			enabled: true,
			logs: { level: "trace" },
		});
		expect(result.success).toBe(false);
	});
});

describe("AgentConfigSchema embedding_provider", () => {
	const minimalAgent = {
		name: "test-agent",
		model: { provider: "anthropic", name: "claude-sonnet-4-20250514" },
		instructions: { inline: "You are helpful." },
	};

	it("does not require embedding_provider when no vectorstore tools", () => {
		const result = AgentConfigSchema.safeParse(minimalAgent);
		expect(result.success).toBe(true);
	});

	it("requires embedding_provider when hierarchical_document tool present", () => {
		const result = AgentConfigSchema.safeParse({
			...minimalAgent,
			tools: [
				{
					type: "hierarchical_document",
					name: "docs",
					description: "Search docs",
					source: "./docs",
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("accepts agent with embedding_provider and vectorstore tool", () => {
		const result = AgentConfigSchema.safeParse({
			...minimalAgent,
			embedding_provider: {
				provider: "ollama",
				name: "nomic-embed-text",
				dimensions: 768,
			},
			tools: [
				{
					type: "hierarchical_document",
					name: "docs",
					description: "Search docs",
					source: "./docs",
				},
			],
		});
		expect(result.success).toBe(true);
	});
});
