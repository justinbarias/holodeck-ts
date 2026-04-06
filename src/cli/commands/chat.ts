import { Command } from "commander";
import type { ChatSession } from "../../agent/session.js";
import { closeSession, createChatSession, sendMessage } from "../../agent/session.js";
import { loadAgentConfig } from "../../config/loader.js";
import type { AgentConfig } from "../../config/schema.js";
import { loadHolodeckEnv } from "../../lib/env.js";
import { ConfigError, toErrorMessage } from "../../lib/errors.js";
import { getModuleLogger, setupLogging } from "../../lib/logger.js";
import { shutdownOtel } from "../../otel/setup.js";
import { launchTUI } from "../tui/app.js";

const logger = getModuleLogger("cli.chat");

interface ChatCommandOptions {
	agent?: string;
	verbose?: boolean;
	prompt?: string;
}

export const USER_PROMPT_PREFIX = "You: ";
export const AGENT_RESPONSE_PREFIX = "Agent: ";
export const FAREWELL_MESSAGE = "Goodbye!";

function writeStdout(message: string): void {
	process.stdout.write(message);
}

function writeStderr(message: string): void {
	process.stderr.write(message);
}

export function formatRuntimeErrorMessage(message: string): string {
	const normalized = message.toLowerCase();
	const isAuthError =
		normalized.includes("authentication_failed") ||
		normalized.includes("authentication failed") ||
		normalized.includes("invalid api key") ||
		normalized.includes("unauthorized") ||
		(normalized.includes("api key") && normalized.includes("invalid"));

	if (isAuthError) {
		return (
			"Error: Authentication failed — invalid or expired credentials.\n" +
			"  Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.\n" +
			"  For Ollama/custom endpoints, set ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN.\n"
		);
	}

	return `Error: ${message}\n`;
}

function isDefaultAgentPath(path: string): boolean {
	return path === "./agent.yaml" || path === "agent.yaml";
}

function isMissingFileError(error: ConfigError): boolean {
	return error.message.toLowerCase().includes("not found");
}

async function runSingleMessage(session: ChatSession, message: string): Promise<void> {
	let responseStarted = false;

	try {
		for await (const event of sendMessage(session, message)) {
			if (event.type === "text") {
				if (!responseStarted) {
					responseStarted = true;
				}
				writeStdout(event.content);
			} else if (event.type === "tool_start") {
				writeStderr(`\u27F3 Calling ${event.toolName}...\n`);
			} else if (event.type === "tool_end") {
				if (event.status === "done") {
					writeStderr(`\u2713 ${event.toolName} done\n`);
				} else {
					writeStderr(`\u2717 ${event.toolName} failed${event.error ? `: ${event.error}` : ""}\n`);
				}
			} else if (event.type === "context_warning") {
				writeStderr(
					`Warning: Context usage at ${Math.round(event.ratio * 100)}% -- older messages may be summarized soon.\n`,
				);
			} else if (event.type === "compaction") {
				writeStderr(
					"Info: Conversation compacted -- older messages have been summarized to free context space.\n",
				);
			} else if (event.type === "error") {
				writeStderr(formatRuntimeErrorMessage(event.message));
				process.exitCode = 2;
				return;
			}
		}
	} catch (error) {
		writeStderr(formatRuntimeErrorMessage(toErrorMessage(error)));
		process.exitCode = 2;
		return;
	} finally {
		if (responseStarted) {
			writeStdout("\n");
		}
		await closeSession(session);
	}
}

export async function runChatCommand(options: ChatCommandOptions): Promise<void> {
	const agentPath =
		options.agent && options.agent.trim().length > 0 ? options.agent : "./agent.yaml";
	const verbose = Boolean(options.verbose);

	const isTUI = options.prompt === undefined || options.prompt.trim().length === 0;
	// Initial setup with local sinks only (OTLP wired after config load)
	await setupLogging({ verbose, tui: isTUI });
	await loadHolodeckEnv();

	let config: AgentConfig;
	try {
		config = await loadAgentConfig(agentPath);
	} catch (error) {
		if (
			error instanceof ConfigError &&
			isDefaultAgentPath(agentPath) &&
			isMissingFileError(error)
		) {
			writeStderr(
				"Error: No agent configuration found. Provide --agent <path> or create agent.yaml in the current directory.\n",
			);
		} else if (error instanceof ConfigError) {
			writeStderr(`${error.message}\n`);
		} else {
			writeStderr(`Error: ${toErrorMessage(error)}\n`);
		}

		process.exitCode = 1;
		return;
	}

	// Re-configure logging with observability (wires OTLP sink + log level)
	await setupLogging({ verbose, tui: isTUI, observability: config.observability });

	logger.info`Agent config loaded: '${config.name}' from '${agentPath}'`;

	let session: ChatSession;
	try {
		session = await createChatSession(config);
		logger.info`Chat session created (mode=${isTUI ? "tui" : "single-message"})`;
	} catch (error) {
		logger.error`Failed to create chat session: ${toErrorMessage(error)}`;
		writeStderr(`${toErrorMessage(error)}\n`);
		process.exitCode = 1;
		await shutdownOtel();
		return;
	}

	if (options.prompt !== undefined && options.prompt.trim().length > 0) {
		await runSingleMessage(session, options.prompt);
		await shutdownOtel();
		return;
	}

	try {
		await launchTUI(session, config);
	} catch (error) {
		writeStderr(formatRuntimeErrorMessage(toErrorMessage(error)));
		process.exitCode = 2;
	} finally {
		await shutdownOtel();
	}
}

export function chatCommand(): Command {
	return new Command("chat")
		.description("Interactive streaming chat session")
		.argument("[message]", "Send a single message and exit (non-interactive)")
		.option("--agent <path>", "Path to agent YAML config", "./agent.yaml")
		.option("-p, --prompt <message>", "Send a single message and exit (non-interactive)")
		.option("--verbose", "Enable verbose logging", false)
		.action(async (message: string | undefined, options: ChatCommandOptions) => {
			if (message !== undefined && message.trim().length > 0) {
				options.prompt = message;
			}
			await runChatCommand(options);
		});
}
