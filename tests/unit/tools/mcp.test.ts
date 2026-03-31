import { describe, expect, it } from "bun:test";
import type { Tool } from "../../../src/config/schema.js";
import { MCPHttpToolSchema, MCPStdioToolSchema } from "../../../src/config/schema.js";
import { buildMCPServers } from "../../../src/tools/mcp.js";

// Reference fixture: tests/fixtures/agents/valid-full.yaml contains both stdio and http MCP tools.

function parseStdioTool(overrides?: Record<string, unknown>) {
	return MCPStdioToolSchema.parse({
		type: "mcp",
		name: "test_stdio",
		description: "A stdio MCP tool",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@mcp/server"],
		env: { FOO: "bar" },
		...overrides,
	});
}

function parseHttpTool(overrides?: Record<string, unknown>) {
	return MCPHttpToolSchema.parse({
		type: "mcp",
		name: "test_http",
		description: "An HTTP MCP tool",
		transport: "http",
		url: "https://example.com/mcp",
		headers: { Authorization: "Bearer token" },
		...overrides,
	});
}

describe("tools/mcp buildMCPServers", () => {
	it("T055: maps stdio transport with command, args, and env", () => {
		const tool = parseStdioTool();
		const result = buildMCPServers([tool]);

		expect(result).toHaveProperty("test_stdio");
		const config = result.test_stdio;
		expect(config).toEqual({
			type: "stdio",
			command: "npx",
			args: ["-y", "@mcp/server"],
			env: { FOO: "bar" },
		});
	});

	it("T056: maps HTTP transport with url and headers", () => {
		const tool = parseHttpTool();
		const result = buildMCPServers([tool]);

		expect(result).toHaveProperty("test_http");
		const config = result.test_http;
		expect(config).toEqual({
			type: "http",
			url: "https://example.com/mcp",
			headers: { Authorization: "Bearer token" },
		});
	});

	it("T056: maps SSE transport with url and headers", () => {
		const tool = parseHttpTool({ name: "test_sse", transport: "sse" });
		const result = buildMCPServers([tool]);

		expect(result).toHaveProperty("test_sse");
		const config = result.test_sse;
		expect(config).toEqual({
			type: "sse",
			url: "https://example.com/mcp",
			headers: { Authorization: "Bearer token" },
		});
	});

	it("T057: filters non-MCP tools and returns empty record", () => {
		const nonMcpTool = {
			type: "hierarchical_document",
			name: "docs",
			description: "A doc tool",
			source: "./docs",
		} as unknown as Tool;

		const result = buildMCPServers([nonMcpTool]);
		expect(result).toEqual({});
	});

	it("T057: returns empty record for empty tools array", () => {
		const result = buildMCPServers([]);
		expect(result).toEqual({});
	});

	it("T058: env and args pass through; request_timeout is not forwarded", () => {
		const tool = parseStdioTool({
			env: { SEARCH_SCOPE: "project", API_KEY: "secret" },
			args: ["-y", "@mcp/server", "--port", "3000"],
			request_timeout: 45,
		});
		const result = buildMCPServers([tool]);

		const config = result.test_stdio;
		expect(config).toHaveProperty("env");
		expect(config).toHaveProperty("args");
		// SDK McpServerConfig has no request_timeout field — it is not forwarded
		expect(config).not.toHaveProperty("request_timeout");
	});

	it("T058: maps multiple tools into keyed record", () => {
		const stdio = parseStdioTool();
		const http = parseHttpTool();
		const result = buildMCPServers([stdio, http]);

		expect(Object.keys(result)).toHaveLength(2);
		expect(result).toHaveProperty("test_stdio");
		expect(result).toHaveProperty("test_http");
	});
});
