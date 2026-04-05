import {
	type McpServerConfig,
	type Options,
	type Query,
	query,
	type SDKControlGetContextUsageResponse,
	type ThinkingConfig,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentConfig, ExtendedThinking } from "../config/schema.js";
import { ConfigError, toErrorMessage } from "../lib/errors.js";
import { getModuleLogger } from "../lib/logger.js";
import { buildMCPServers } from "../tools/mcp.js";
import type { Skill } from "../tools/skills.js";
import {
	buildVectorstoreServers,
	type VectorstoreRegistryResult,
} from "../tools/vectorstore/registry.js";
import { buildHooks } from "./hooks.js";
import { createPermissionHandler, type PromptFn } from "./permissions.js";
import type { ChatEvent, SessionState } from "./streaming.js";
import { mapSDKMessages, type StreamContext } from "./streaming.js";

const sessionLogger = getModuleLogger("session");

export interface ToolInvocationRecord {
	toolName: string;
	args: unknown;
	result: unknown;
	status: "calling" | "done" | "failed";
	timestamp: Date;
	toolUseId: string;
}

export interface ChatSession {
	sessionId: string | null;
	readonly agentConfig: AgentConfig;
	readonly systemPrompt: string;
	readonly mcpServers: Record<string, McpServerConfig>;
	state: SessionState;
	query: Query | null;
	lastToolInvocation: ToolInvocationRecord | null;
	contextUsage: SDKControlGetContextUsageResponse | null;
	vectorstoreServers: VectorstoreRegistryResult["servers"];
	skills: Skill[];
	contextWarningShown: boolean;
	onCompactionStart?: () => void;
	onCompactionEnd?: () => void;
	promptFn?: PromptFn;
}

function buildQueryOptions(session: ChatSession): Options {
	const claude = session.agentConfig.claude;
	const { permissionMode, canUseTool } = createPermissionHandler(
		claude?.permission_mode,
		session.promptFn,
	);

	return {
		model: session.agentConfig.model.name,
		systemPrompt: session.systemPrompt,
		permissionMode,
		canUseTool,
		maxTurns: claude?.max_turns,
		allowedTools: claude?.allowed_tools ?? undefined,
		cwd: claude?.working_directory,
		mcpServers: session.mcpServers,
		includePartialMessages: true,
		thinking: mapThinkingConfig(claude?.extended_thinking),
		hooks: buildHooks(session),
		settingSources: claude?.setting_sources ?? ["project"],
	};
}

async function resolveSystemPrompt(config: AgentConfig): Promise<string> {
	if (config.instructions.inline) {
		return config.instructions.inline;
	}

	const instructionsPath = config.instructions.file;
	if (!instructionsPath) {
		throw new ConfigError("Agent instructions are not configured.");
	}

	try {
		return await Bun.file(instructionsPath).text();
	} catch {
		throw new ConfigError(`Instructions file not found: ${instructionsPath}`);
	}
}

export function mapThinkingConfig(extendedThinking?: ExtendedThinking): ThinkingConfig {
	if (!extendedThinking?.enabled) {
		return { type: "disabled" };
	}

	if (extendedThinking.budget_tokens !== undefined) {
		return {
			type: "enabled",
			budgetTokens: extendedThinking.budget_tokens,
		};
	}

	return { type: "enabled" };
}

export async function createChatSession(config: AgentConfig): Promise<ChatSession> {
	const systemPrompt = await resolveSystemPrompt(config);
	const { mcpServers: vectorstoreMcpServers, servers: vectorstoreServers } =
		buildVectorstoreServers(config);
	const mcpServers = { ...buildMCPServers(config.tools), ...vectorstoreMcpServers };

	sessionLogger.info("Chat session created for agent {name}.", {
		name: config.name,
	});

	return {
		sessionId: null,
		agentConfig: config,
		systemPrompt,
		mcpServers,
		state: "prompting",
		query: null,
		lastToolInvocation: null,
		contextUsage: null,
		vectorstoreServers,
		skills: [],
		contextWarningShown: false,
	};
}

export async function populateSkills(session: ChatSession): Promise<void> {
	if (session.skills.length > 0 || !session.query) {
		return;
	}

	try {
		const commands = await session.query.supportedCommands();
		session.skills = commands.map((cmd) => ({
			name: cmd.name,
			description: cmd.description,
		}));
		sessionLogger.info("Discovered {count} skills via SDK.", {
			count: session.skills.length,
		});
	} catch (error) {
		sessionLogger.debug("Failed to fetch supported commands: {error}", {
			error: toErrorMessage(error),
		});
	}
}

function updateLastToolInvocation(session: ChatSession, event: ChatEvent): void {
	if (event.type === "tool_start") {
		session.lastToolInvocation = {
			toolName: event.toolName,
			args: null,
			result: null,
			status: "calling",
			timestamp: new Date(),
			toolUseId: "",
		};
		return;
	}

	if (event.type === "tool_end") {
		if (session.lastToolInvocation?.toolName === event.toolName) {
			session.lastToolInvocation.result = event.error ?? null;
			session.lastToolInvocation.status = event.status;
			session.lastToolInvocation.timestamp = new Date();
		} else {
			session.lastToolInvocation = {
				toolName: event.toolName,
				args: null,
				result: event.error ?? null,
				status: event.status,
				timestamp: new Date(),
				toolUseId: "",
			};
		}
	}
}

export async function interruptResponse(session: ChatSession): Promise<void> {
	if (session.state !== "streaming" || !session.query) {
		return;
	}

	await session.query.interrupt();
	session.state = "prompting";
}

export async function* sendMessage(session: ChatSession, input: string): AsyncGenerator<ChatEvent> {
	if (session.state !== "prompting") {
		yield {
			type: "error",
			message: `Cannot send message while session state is '${session.state}'.`,
		};
		return;
	}

	const options = buildQueryOptions(session);
	if (session.sessionId) {
		options.resume = session.sessionId;
	}

	session.state = "streaming";
	sessionLogger.info("Sending message (sessionId: {sessionId}).", {
		sessionId: session.sessionId ?? "new",
	});
	const activeQuery = query({
		prompt: input,
		options,
	});
	session.query = activeQuery;

	// Populate skills from SDK on first query
	await populateSkills(session);

	const ctx: StreamContext = {
		onSessionId: (id) => {
			session.sessionId = id;
		},
	};

	try {
		for await (const event of mapSDKMessages(activeQuery, ctx)) {
			if (event.type === "noop") {
				continue;
			}

			updateLastToolInvocation(session, event);

			if (event.type === "complete") {
				try {
					const usage = await activeQuery.getContextUsage();
					session.contextUsage = usage;

					if (usage.percentage >= 80 && !session.contextWarningShown) {
						session.contextWarningShown = true;
						yield { type: "context_warning", ratio: usage.percentage / 100 };
					}
				} catch (error) {
					sessionLogger.debug("Failed to fetch context usage after completion: {error}", {
						error: toErrorMessage(error),
					});
				}
			}

			yield event;
		}
	} catch (error) {
		yield { type: "error", message: toErrorMessage(error) };
	} finally {
		if (session.state === "streaming") {
			session.state = "prompting";
		}

		session.query = null;
	}
}

export async function closeSession(session: ChatSession): Promise<void> {
	if (session.state === "exited" || session.state === "shutting_down") {
		return;
	}

	session.state = "shutting_down";
	sessionLogger.info("Closing chat session.");

	for (const server of session.vectorstoreServers) {
		try {
			await server.close();
		} catch (error) {
			sessionLogger.error("Error closing vectorstore server: {error}", {
				error: toErrorMessage(error),
			});
		}
	}

	try {
		if (session.query) {
			session.query.close();
			session.query = null;
		}
	} catch (error) {
		sessionLogger.error("Error closing query during session shutdown: {error}", {
			error: toErrorMessage(error),
		});
		session.query = null;
	}

	session.state = "exited";
	sessionLogger.info("Session closed.", { sessionId: session.sessionId, state: "exited" });
}
