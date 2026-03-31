import type {
	SDKAssistantMessage,
	SDKMessage,
	SDKPartialAssistantMessage,
	SDKResultMessage,
	SDKToolProgressMessage,
	SDKToolUseSummaryMessage,
} from "@anthropic-ai/claude-agent-sdk";

type SDKSystemInitMessage = Extract<SDKMessage, { type: "system"; subtype: "init" }>;
type SDKStatusMessage = Extract<SDKMessage, { type: "system"; subtype: "status" }>;
type SDKAPIRetryMessage = Extract<SDKMessage, { type: "system"; subtype: "api_retry" }>;
type SDKLocalCommandOutputMessage = Extract<
	SDKMessage,
	{ type: "system"; subtype: "local_command_output" }
>;
type SDKCompactBoundaryMessage = Extract<
	SDKMessage,
	{ type: "system"; subtype: "compact_boundary" }
>;
type SDKRateLimitEvent = Extract<SDKMessage, { type: "rate_limit_event" }>;
type SDKAuthStatusMessage = Extract<SDKMessage, { type: "auth_status" }>;

type SystemSubtypeMessage =
	| SDKSystemInitMessage
	| SDKStatusMessage
	| SDKAPIRetryMessage
	| SDKLocalCommandOutputMessage
	| SDKCompactBoundaryMessage;

export type ChatEvent =
	| { type: "text"; content: string }
	| { type: "tool_start"; toolName: string }
	| { type: "tool_progress"; toolName: string; elapsedSeconds: number }
	| { type: "tool_end"; toolName: string; status: "done" | "failed"; error?: string }
	| { type: "thinking"; content: string }
	| { type: "context_warning"; ratio: number }
	| { type: "compaction"; summary: string }
	| { type: "error"; message: string }
	| { type: "complete"; sessionId: string }
	| { type: "status"; message: string }
	| { type: "noop" };

export type SessionState =
	| "initializing"
	| "prompting"
	| "streaming"
	| "interrupted"
	| "shutting_down"
	| "exited";

export interface StreamContext {
	onSessionId: (id: string) => void;
}

function* mapAssistantMessage(message: SDKAssistantMessage): Generator<ChatEvent> {
	if (message.error) {
		yield { type: "error", message: `Assistant error: ${message.error}` };
		return;
	}

	const blocks = message.message?.content ?? [];

	for (const block of blocks) {
		if (block.type === "text" && block.text.length > 0) {
			yield { type: "text", content: block.text };
		}

		if (block.type === "thinking" && block.thinking.length > 0) {
			yield { type: "thinking", content: block.thinking };
		}
	}
}

function mapStreamEvent(message: SDKPartialAssistantMessage): ChatEvent | null {
	const event: unknown = message.event;
	if (typeof event !== "object" || event === null) {
		return null;
	}

	const record = event as {
		type?: string;
		delta?: { type?: string; text?: string; thinking?: string };
		content_block?: { type?: string; name?: string };
	};

	// Detect tool_use start from content_block_start events
	if (
		record.type === "content_block_start" &&
		record.content_block?.type === "tool_use" &&
		typeof record.content_block.name === "string"
	) {
		return { type: "tool_start", toolName: record.content_block.name };
	}

	if (record.type === "content_block_delta" && record.delta) {
		const delta = record.delta;

		if (delta.type === "text_delta" && typeof delta.text === "string") {
			return { type: "text", content: delta.text };
		}

		if (delta.type === "thinking_delta") {
			const content = delta.thinking ?? delta.text;
			if (typeof content === "string") {
				return { type: "thinking", content };
			}
		}
	}

	return null;
}

function mapToolProgress(message: SDKToolProgressMessage): ChatEvent {
	return {
		type: "tool_progress",
		toolName: message.tool_name,
		elapsedSeconds: message.elapsed_time_seconds,
	};
}

function parseToolSummary(message: SDKToolUseSummaryMessage): ChatEvent {
	const summary = message.summary.trim();

	// Match "Calling toolName..." with optional arguments like "Calling Read("file.ts")..."
	const startMatch = summary.match(/^Calling\s+([0-9A-Za-z_]+)/);
	const startTool = startMatch?.[1];
	if (startTool && summary.includes("...")) {
		return { type: "tool_start", toolName: startTool };
	}

	// Match "toolName done" or "toolName done (with details)"
	const doneMatch = summary.match(/^([0-9A-Za-z_]+)\s+done/);
	const doneTool = doneMatch?.[1];
	if (doneTool) {
		return { type: "tool_end", toolName: doneTool, status: "done" };
	}

	// Match "toolName failed" with optional error details
	const failedMatch = summary.match(/^([0-9A-Za-z_]+)\s+failed(?::\s+(.+))?/);
	const failedTool = failedMatch?.[1];
	if (failedTool) {
		return {
			type: "tool_end",
			toolName: failedTool,
			status: "failed",
			error: failedMatch[2] ?? undefined,
		};
	}

	return { type: "status", message: summary };
}

function mapResultMessage(message: SDKResultMessage): ChatEvent {
	if (message.subtype === "success") {
		return { type: "complete", sessionId: message.session_id };
	}

	const firstError = message.errors[0];
	return {
		type: "error",
		message: firstError ?? "Agent execution failed.",
	};
}

function mapSystemSubtypeMessage(message: SystemSubtypeMessage, ctx: StreamContext): ChatEvent {
	switch (message.subtype) {
		case "init":
			ctx.onSessionId(message.session_id);
			return { type: "noop" };

		case "status":
			if (message.status === null) {
				return { type: "noop" };
			}
			return { type: "status", message: `Status: ${String(message.status)}` };

		case "compact_boundary":
			return {
				type: "compaction",
				summary: "Conversation compacted by the SDK.",
			};

		case "local_command_output":
			if (message.content.length === 0) {
				return { type: "noop" };
			}
			return { type: "text", content: message.content };

		case "api_retry":
			return {
				type: "status",
				message: `Retrying API request (${message.attempt}/${message.max_retries}) in ${message.retry_delay_ms}ms due to ${message.error}.`,
			};

		default:
			return { type: "noop" };
	}
}

function formatResetTime(timestamp?: number): string | null {
	if (typeof timestamp !== "number") {
		return null;
	}

	return new Date(timestamp).toISOString();
}

function mapRateLimitEvent(message: SDKRateLimitEvent): ChatEvent {
	const info = message.rate_limit_info;
	if (info.status === "allowed") {
		return { type: "noop" };
	}

	const headline = info.status === "rejected" ? "Rate limit reached" : "Rate limit warning";
	const details: string[] = [];
	if (info.rateLimitType) {
		details.push(info.rateLimitType.replaceAll("_", " "));
	}

	const resetTime = formatResetTime(info.resetsAt);
	if (resetTime) {
		details.push(`resets at ${resetTime}`);
	}

	if (info.isUsingOverage) {
		details.push("using overage");
	}

	return {
		type: "status",
		message: details.length > 0 ? `${headline}: ${details.join(", ")}` : headline,
	};
}

function mapAuthStatusMessage(message: SDKAuthStatusMessage): ChatEvent {
	if (message.error) {
		return { type: "status", message: `Authentication status: ${message.error}` };
	}

	return { type: "noop" };
}

export async function* mapSDKMessages(
	messages: AsyncGenerator<SDKMessage>,
	ctx: StreamContext,
): AsyncGenerator<ChatEvent> {
	let hasStreamedCurrentTurn = false;

	for await (const message of messages) {
		switch (message.type) {
			case "stream_event": {
				const event = mapStreamEvent(message);
				if (event) {
					if (event.type === "text" || event.type === "thinking") {
						hasStreamedCurrentTurn = true;
					}
					yield event;
				}
				break;
			}

			case "assistant": {
				if (hasStreamedCurrentTurn) {
					hasStreamedCurrentTurn = false;
					break;
				}
				hasStreamedCurrentTurn = false;
				yield* mapAssistantMessage(message);
				break;
			}

			case "tool_progress":
				yield mapToolProgress(message as SDKToolProgressMessage);
				break;

			case "tool_use_summary":
				yield parseToolSummary(message);
				break;

			case "result":
				yield mapResultMessage(message);
				break;

			case "system":
				yield mapSystemSubtypeMessage(message as SystemSubtypeMessage, ctx);
				break;

			case "rate_limit_event":
				yield mapRateLimitEvent(message);
				break;

			case "auth_status":
				yield mapAuthStatusMessage(message);
				break;

			default:
				break;
		}
	}
}
