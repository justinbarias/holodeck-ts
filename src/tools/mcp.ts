import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { MCPTool, Tool } from "../config/schema.js";

function isMCPTool(tool: Tool): tool is MCPTool {
	return tool.type === "mcp";
}

export function buildMCPServers(tools: Tool[]): Record<string, McpServerConfig> {
	const mcpTools = tools.filter(isMCPTool);

	return Object.fromEntries(
		mcpTools.map((tool) => {
			if (tool.transport === "stdio") {
				return [
					tool.name,
					{
						type: "stdio" as const,
						command: tool.command,
						args: tool.args,
						env: tool.env,
					},
				];
			}

			return [
				tool.name,
				{
					type: tool.transport,
					url: tool.url,
					headers: tool.headers,
				},
			];
		}),
	);
}
