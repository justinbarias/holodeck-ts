import * as readline from "node:readline";
import { Command } from "commander";
import type { ChatSession } from "../../agent/session.js";
import {
	closeSession,
	createChatSession,
	interruptResponse,
	sendMessage,
} from "../../agent/session.js";
import type { ChatEvent } from "../../agent/streaming.js";
import { loadAgentConfig } from "../../config/loader.js";
import type { AgentConfig } from "../../config/schema.js";
import { loadHolodeckEnv } from "../../lib/env.js";
import { ConfigError, toErrorMessage } from "../../lib/errors.js";
import { setupLogging } from "../../lib/logger.js";
import { renderStreamingMarkdown } from "../render.js";

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
			"  Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.\n"
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

interface RenderState {
	responseStarted: boolean;
	streamingBuffer: string;
	renderedBuffer: string;
	suppressPrefix: boolean;
}

function flushResponseLine(state: RenderState): void {
	if (state.responseStarted) {
		writeStdout("\n");
		state.responseStarted = false;
	}
}

function renderChatEvent(
	event: ChatEvent,
	state: RenderState,
): { shouldAbort: boolean; runtimeErrorMessage?: string } {
	if (event.type === "text") {
		if (!state.responseStarted) {
			if (!state.suppressPrefix) {
				writeStdout(AGENT_RESPONSE_PREFIX);
			}
			state.responseStarted = true;
		}

		state.streamingBuffer += event.content;
		const rendered = renderStreamingMarkdown(state.streamingBuffer);
		const delta = rendered.slice(state.renderedBuffer.length);
		if (delta.length > 0) {
			writeStdout(delta);
		}

		state.renderedBuffer = rendered;
		return { shouldAbort: false };
	}

	if (event.type === "tool_start") {
		flushResponseLine(state);
		writeStdout(`Calling ${event.toolName}...\n`);
		return { shouldAbort: false };
	}

	if (event.type === "tool_end") {
		flushResponseLine(state);
		if (event.status === "done") {
			writeStdout(`${event.toolName} done\n`);
			return { shouldAbort: false };
		}

		writeStdout(`${event.toolName} failed${event.error ? `: ${event.error}` : ""}\n`);
		return { shouldAbort: false };
	}

	if (event.type === "thinking") {
		return { shouldAbort: false };
	}

	if (event.type === "context_warning") {
		writeStderr(`Warning: Context window is ${Math.round(event.ratio * 100)}% full.\n`);
		return { shouldAbort: false };
	}

	if (event.type === "compaction") {
		writeStderr(`Note: ${event.summary}\n`);
		return { shouldAbort: false };
	}

	if (event.type === "status") {
		writeStderr(`${event.message}\n`);
		return { shouldAbort: false };
	}

	if (event.type === "complete") {
		flushResponseLine(state);
		return { shouldAbort: false };
	}

	if (event.type === "error") {
		flushResponseLine(state);
		return { shouldAbort: true, runtimeErrorMessage: event.message };
	}

	return { shouldAbort: false };
}

async function runSingleMessage(session: ChatSession, message: string): Promise<void> {
	const renderState: RenderState = {
		responseStarted: false,
		streamingBuffer: "",
		renderedBuffer: "",
		suppressPrefix: true,
	};

	try {
		for await (const event of sendMessage(session, message)) {
			const rendered = renderChatEvent(event, renderState);
			if (rendered.shouldAbort) {
				writeStderr(formatRuntimeErrorMessage(rendered.runtimeErrorMessage ?? "Runtime error"));
				process.exitCode = 2;
				return;
			}
		}
	} catch (error) {
		writeStderr(formatRuntimeErrorMessage(toErrorMessage(error)));
		process.exitCode = 2;
		return;
	} finally {
		if (renderState.responseStarted) {
			writeStdout("\n");
		}
		await closeSession(session);
	}
}

export async function runChatCommand(options: ChatCommandOptions): Promise<void> {
	const agentPath =
		options.agent && options.agent.trim().length > 0 ? options.agent : "./agent.yaml";
	const verbose = Boolean(options.verbose);

	await setupLogging({ verbose });
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

	let session: ChatSession;
	try {
		session = await createChatSession(config);
	} catch (error) {
		writeStderr(`${toErrorMessage(error)}\n`);
		process.exitCode = 1;
		return;
	}

	if (options.prompt !== undefined && options.prompt.trim().length > 0) {
		await runSingleMessage(session, options.prompt);
		return;
	}

	writeStdout(`Starting chat with ${config.name}\n`);

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: USER_PROMPT_PREFIX,
	});

	let closing = false;
	let streaming = false;

	const shutdown = async (): Promise<void> => {
		if (closing) {
			return;
		}

		closing = true;
		try {
			rl.close();
		} catch {
			// no-op: readline may already be closing/closed
		}
		await closeSession(session);
		writeStdout(`${FAREWELL_MESSAGE}\n`);
		process.exit(process.exitCode ?? 0);
	};

	const runtimeFailure = async (message: string): Promise<void> => {
		writeStderr(formatRuntimeErrorMessage(message));
		process.exitCode = 2;
		await shutdown();
	};

	rl.on("SIGINT", async () => {
		if (streaming) {
			await interruptResponse(session);
			writeStdout("\n");
			rl.prompt();
			return;
		}

		writeStderr("Type 'exit' or 'quit' to leave.\n");
		rl.prompt();
	});

	rl.on("close", async () => {
		await shutdown();
	});

	rl.on("line", async (rawLine) => {
		if (closing) {
			return;
		}

		const trimmed = rawLine.trim();
		if (trimmed.length === 0) {
			rl.prompt();
			return;
		}

		if (trimmed === "exit" || trimmed === "quit") {
			await shutdown();
			return;
		}

		streaming = true;
		rl.pause();

		const renderState: RenderState = {
			responseStarted: false,
			streamingBuffer: "",
			renderedBuffer: "",
			suppressPrefix: false,
		};

		try {
			for await (const event of sendMessage(session, rawLine)) {
				const rendered = renderChatEvent(event, renderState);
				if (rendered.shouldAbort) {
					await runtimeFailure(rendered.runtimeErrorMessage ?? "Runtime error");
					return;
				}
			}
		} catch (error) {
			await runtimeFailure(toErrorMessage(error));
			return;
		} finally {
			streaming = false;
			rl.resume();
		}

		if (!closing) {
			rl.prompt();
		}
	});

	rl.prompt();
	await new Promise<void>((resolve) => {
		rl.once("close", () => resolve());
	});
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
