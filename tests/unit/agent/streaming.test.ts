import { describe, expect, it } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChatEvent, StreamContext } from "../../../src/agent/streaming.js";
import { mapSDKMessages } from "../../../src/agent/streaming.js";

async function* messagesFrom(...msgs: SDKMessage[]): AsyncGenerator<SDKMessage> {
	for (const m of msgs) {
		yield m;
	}
}

async function collectEvents(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
	const events: ChatEvent[] = [];
	for await (const e of gen) {
		events.push(e);
	}
	return events;
}

function stubContext(): StreamContext & { capturedSessionId: string | null } {
	const ctx = {
		capturedSessionId: null as string | null,
		onSessionId: (id: string) => {
			ctx.capturedSessionId = id;
		},
	};
	return ctx;
}

describe("agent/streaming", () => {
	it("captures session_id from system init message", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "system",
			subtype: "init",
			session_id: "sess-abc-123",
			apiKeySource: "ANTHROPIC_API_KEY",
			claude_code_version: "1.0.0",
			cwd: "/tmp",
			tools: [],
			mcp_servers: [],
			model: "claude-sonnet-4-20250514",
			permissionMode: "default",
			slash_commands: [],
			output_style: "text",
			skills: [],
			plugins: [],
			uuid: "uuid-init",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(ctx.capturedSessionId).toBe("sess-abc-123");
		expect(events).toEqual([{ type: "noop" }]);
	});

	it("maps assistant text content blocks to text events", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "assistant",
			message: {
				content: [{ type: "text", text: "Hello world" }],
			},
			parent_tool_use_id: null,
			uuid: "uuid-1",
			session_id: "session-1",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([{ type: "text", content: "Hello world" }]);
	});

	it("maps assistant thinking blocks to thinking events", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "assistant",
			message: {
				content: [{ type: "thinking", thinking: "Let me consider..." }],
			},
			parent_tool_use_id: null,
			uuid: "uuid-think",
			session_id: "session-think",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([{ type: "thinking", content: "Let me consider..." }]);
	});

	it("maps stream_event text_delta to text events", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "stream_event",
			event: {
				type: "content_block_delta",
				delta: { type: "text_delta", text: "partial" },
			},
			parent_tool_use_id: null,
			uuid: "uuid-2",
			session_id: "session-2",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([{ type: "text", content: "partial" }]);
	});

	it("maps stream_event thinking_delta to thinking events", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "stream_event",
			event: {
				type: "content_block_delta",
				delta: { type: "thinking_delta", thinking: "reasoning..." },
			},
			parent_tool_use_id: null,
			uuid: "uuid-think-delta",
			session_id: "session-think-delta",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([{ type: "thinking", content: "reasoning..." }]);
	});

	it("suppresses duplicate assistant text after streaming deltas", async () => {
		const ctx = stubContext();
		const messages = messagesFrom(
			{
				type: "stream_event",
				event: {
					type: "content_block_delta",
					delta: { type: "text_delta", text: "Hello" },
				},
				parent_tool_use_id: null,
				uuid: "uuid-delta",
				session_id: "session-dup",
			} as never,
			{
				type: "assistant",
				message: {
					content: [{ type: "text", text: "Hello" }],
				},
				parent_tool_use_id: null,
				uuid: "uuid-full",
				session_id: "session-dup",
			} as never,
		);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		// Only the streaming delta should appear, not the duplicate assistant message
		expect(events).toEqual([{ type: "text", content: "Hello" }]);
	});

	it("maps result success messages to complete events", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "result",
			subtype: "success",
			session_id: "session-3",
			result: "done",
			duration_ms: 1000,
			duration_api_ms: 900,
			is_error: false,
			num_turns: 1,
			stop_reason: "end_turn",
			total_cost_usd: 0.01,
			usage: {},
			modelUsage: {},
			permission_denials: [],
			uuid: "uuid-result",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([{ type: "complete", sessionId: "session-3" }]);
	});

	it("maps result error messages to error events", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "result",
			subtype: "error_during_execution",
			session_id: "session-err",
			errors: ["Something went wrong"],
			duration_ms: 500,
			duration_api_ms: 400,
			is_error: true,
			num_turns: 1,
			stop_reason: null,
			total_cost_usd: 0.005,
			usage: {},
			modelUsage: {},
			permission_denials: [],
			uuid: "uuid-err",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([{ type: "error", message: "Something went wrong" }]);
	});

	it("maps tool_use_summary to tool_start and tool_end events", async () => {
		const ctx = stubContext();
		const messages = messagesFrom(
			{
				type: "tool_use_summary",
				summary: "Calling Read...",
				preceding_tool_use_ids: [],
				uuid: "uuid-ts1",
				session_id: "session-tool",
			} as never,
			{
				type: "tool_use_summary",
				summary: "Read done",
				preceding_tool_use_ids: [],
				uuid: "uuid-ts2",
				session_id: "session-tool",
			} as never,
			{
				type: "tool_use_summary",
				summary: "Write failed: permission denied",
				preceding_tool_use_ids: [],
				uuid: "uuid-ts3",
				session_id: "session-tool",
			} as never,
		);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([
			{ type: "tool_start", toolName: "Read" },
			{ type: "tool_end", toolName: "Read", status: "done" },
			{ type: "tool_end", toolName: "Write", status: "failed", error: "permission denied" },
		]);
	});

	it("maps compact_boundary to compaction event", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "system",
			subtype: "compact_boundary",
			compact_metadata: { trigger: "auto", pre_tokens: 50000 },
			uuid: "uuid-compact",
			session_id: "session-compact",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([{ type: "compaction", summary: "Conversation compacted by the SDK." }]);
	});

	it("ignores rate limit events when the session is still allowed", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "rate_limit_event",
			rate_limit_info: { status: "allowed" },
			uuid: "uuid-4",
			session_id: "session-4",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([{ type: "noop" }]);
	});

	it("maps rate limit warnings to status events", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "rate_limit_event",
			rate_limit_info: {
				status: "allowed_warning",
				rateLimitType: "five_hour",
				resetsAt: Date.UTC(2026, 2, 30, 12, 0, 0),
			},
			uuid: "uuid-5",
			session_id: "session-5",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events.length).toBe(1);
		const [event] = events;
		expect(event).toBeDefined();
		expect(event?.type).toBe("status");
		if (event?.type === "status") {
			expect(event.message).toContain("Rate limit warning");
			expect(event.message).toContain("five hour");
		}
	});

	it("silently skips prompt_suggestion messages", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "prompt_suggestion",
			suggestion: "Try asking about...",
			uuid: "uuid-ps",
			session_id: "session-ps",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([]);
	});

	it("maps tool_progress to tool_progress events", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "tool_progress",
			tool_use_id: "tu-1",
			tool_name: "Read",
			parent_tool_use_id: null,
			elapsed_time_seconds: 5,
			uuid: "uuid-tp",
			session_id: "session-tp",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([{ type: "tool_progress", toolName: "Read", elapsedSeconds: 5 }]);
	});

	it("maps assistant messages with multiple content blocks", async () => {
		const ctx = stubContext();
		const messages = messagesFrom({
			type: "assistant",
			message: {
				content: [
					{ type: "thinking", thinking: "Let me think..." },
					{ type: "text", text: "Here is the answer." },
				],
			},
			parent_tool_use_id: null,
			uuid: "uuid-multi",
			session_id: "session-multi",
		} as never);

		const events = await collectEvents(mapSDKMessages(messages, ctx));

		expect(events).toEqual([
			{ type: "thinking", content: "Let me think..." },
			{ type: "text", content: "Here is the answer." },
		]);
	});
});
