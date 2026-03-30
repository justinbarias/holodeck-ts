import { describe, expect, it } from "bun:test";
import { parse } from "yaml";
import {
	AgentConfigSchema,
	BashConfigSchema,
	ClaudeConfigSchema,
	ExtendedThinkingSchema,
	FileSystemConfigSchema,
	InstructionsSchema,
	LLMProviderSchema,
	MCPHttpToolSchema,
	MCPStdioToolSchema,
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
