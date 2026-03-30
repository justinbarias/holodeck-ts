// tests/unit/cli/tui/hooks.test.ts
import { describe, expect, it } from "bun:test";
import type { ChatEvent } from "../../../../src/agent/streaming.js";
import { processEventStream } from "../../../../src/cli/tui/hooks.js";
import { ChatStore } from "../../../../src/cli/tui/state.js";

function createStore(): ChatStore {
	return new ChatStore({
		agentName: "test",
		modelName: "claude-sonnet-4-20250514",
		temperature: 0.3,
		tools: [],
		skills: [],
	});
}

async function* eventsFrom(...events: ChatEvent[]): AsyncGenerator<ChatEvent> {
	for (const e of events) {
		yield e;
	}
}

describe("tui/hooks processEventStream", () => {
	it("processes text events into a streaming agent message", async () => {
		const store = createStore();
		const events = eventsFrom(
			{ type: "text", content: "Hello " },
			{ type: "text", content: "world" },
			{ type: "complete", sessionId: "sess-1" },
		);

		await processEventStream(events, store);

		const s = store.getState();
		expect(s.messages).toHaveLength(1);
		expect(s.messages.at(0)?.role).toBe("agent");
		expect(s.messages.at(0)?.content).toBe("Hello world");
		expect(s.messages.at(0)?.isStreaming).toBe(false);
		expect(s.isStreaming).toBe(false);
	});

	it("handles tool_start and tool_end events", async () => {
		const store = createStore();
		const toolStatuses: Array<string | null> = [];

		store.subscribe(() => {
			const tool = store.getState().currentToolStatus;
			toolStatuses.push(tool?.toolName ?? null);
		});

		const events = eventsFrom(
			{ type: "tool_start", toolName: "web_search" },
			{ type: "tool_end", toolName: "web_search", status: "done" },
			{ type: "text", content: "Found results." },
			{ type: "complete", sessionId: "sess-1" },
		);

		await processEventStream(events, store);

		expect(toolStatuses).toContain("web_search");
		expect(toolStatuses.at(-1)).toBeNull();
	});

	it("handles context_warning events", async () => {
		const store = createStore();
		const events = eventsFrom(
			{ type: "text", content: "Response" },
			{ type: "context_warning", ratio: 0.85 },
			{ type: "complete", sessionId: "sess-1" },
		);

		await processEventStream(events, store);
		expect(store.getState().contextPercentage).toBe(85);
	});

	it("handles error events", async () => {
		const store = createStore();
		const events = eventsFrom(
			{ type: "text", content: "Partial" },
			{ type: "error", message: "Connection lost" },
		);

		await processEventStream(events, store);
		expect(store.getState().statusMessage).toBe("Connection lost");
		expect(store.getState().isStreaming).toBe(false);
	});

	it("skips noop and thinking events without side effects", async () => {
		const store = createStore();
		const events = eventsFrom(
			{ type: "thinking", content: "Let me think..." },
			{ type: "noop" },
			{ type: "text", content: "Answer" },
			{ type: "complete", sessionId: "sess-1" },
		);

		await processEventStream(events, store);
		const s = store.getState();
		expect(s.messages).toHaveLength(1);
		expect(s.messages.at(0)?.content).toBe("Answer");
	});

	it("handles status and compaction events as status messages", async () => {
		const store = createStore();
		const events = eventsFrom(
			{ type: "status", message: "Retrying..." },
			{ type: "compaction", summary: "Conversation compacted" },
			{ type: "text", content: "OK" },
			{ type: "complete", sessionId: "sess-1" },
		);

		await processEventStream(events, store);
		expect(store.getState().messages.at(0)?.content).toBe("OK");
	});

	it("returns shouldAbort=true on error event", async () => {
		const store = createStore();
		const events = eventsFrom({ type: "error", message: "Fatal error" });

		const result = await processEventStream(events, store);
		expect(result.shouldAbort).toBe(true);
		expect(result.errorMessage).toBe("Fatal error");
	});

	it("returns shouldAbort=false on successful completion", async () => {
		const store = createStore();
		const events = eventsFrom(
			{ type: "text", content: "Done" },
			{ type: "complete", sessionId: "sess-1" },
		);

		const result = await processEventStream(events, store);
		expect(result.shouldAbort).toBe(false);
	});
});
