import { createSdkMcpServer, type McpServerConfig, tool } from "@anthropic-ai/claude-agent-sdk";
import type { AgentConfig, HierarchicalDocumentTool } from "../../config/schema.js";
import { toErrorMessage } from "../../lib/errors.js";
import { getModuleLogger } from "../../lib/logger.js";
import { createEmbeddingProvider } from "./embeddings/factory.js";
import { createVectorstoreServer, type VectorstoreServer } from "./index.js";
import { vectorstoreInputShape } from "./tool.js";

const logger = getModuleLogger("vectorstore.registry");

export interface VectorstoreRegistryResult {
	mcpServers: Record<string, McpServerConfig>;
	servers: VectorstoreServer[];
}

/** Overridable factory functions — used for testing without mock.module. */
export interface VectorstoreDeps {
	createEmbeddingProvider: typeof createEmbeddingProvider;
	createVectorstoreServer: typeof createVectorstoreServer;
}

const defaultDeps: VectorstoreDeps = { createEmbeddingProvider, createVectorstoreServer };

export function buildVectorstoreServers(
	config: AgentConfig,
	deps: VectorstoreDeps = defaultDeps,
): VectorstoreRegistryResult {
	const hdTools = config.tools.filter(
		(t): t is HierarchicalDocumentTool => t.type === "hierarchical_document",
	);

	if (hdTools.length === 0) {
		return { mcpServers: {}, servers: [] };
	}

	// Schema validation guarantees embedding_provider exists when hierarchical_document tools are present
	const embeddingConfig = config.embedding_provider;
	if (!embeddingConfig) {
		throw new Error("embedding_provider is required when using hierarchical_document tools");
	}

	const embeddingProvider = deps.createEmbeddingProvider(embeddingConfig);
	logger.info`Creating ${hdTools.length} vectorstore server(s) with embedding provider '${embeddingConfig.provider}/${embeddingConfig.name}'`;

	const servers: VectorstoreServer[] = [];
	const sdkTools = [];

	for (const hdTool of hdTools) {
		const server = deps.createVectorstoreServer(hdTool, embeddingProvider);
		servers.push(server);

		sdkTools.push(
			tool(hdTool.name, hdTool.description, vectorstoreInputShape, async (args) => {
				try {
					const response = await server.search(args.query, {
						top_k: args.top_k,
						search_mode: args.search_mode,
						min_score: args.min_score,
					});
					return { content: [{ type: "text" as const, text: JSON.stringify(response) }] };
				} catch (err) {
					return {
						content: [{ type: "text" as const, text: `Search failed: ${toErrorMessage(err)}` }],
						isError: true,
					};
				}
			}),
		);

		logger.debug`Registered vectorstore tool '${hdTool.name}'`;
	}

	const sdkMcpServer = createSdkMcpServer({
		name: "holodeck_vectorstore",
		tools: sdkTools,
	});

	return {
		mcpServers: { holodeck_vectorstore: sdkMcpServer },
		servers,
	};
}
