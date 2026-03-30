// tests/unit/cli/tui/state.test.ts
import { describe, expect, it, mock } from "bun:test";
import { ChatStore } from "../../../../src/cli/tui/state.js";

function createStore(): ChatStore {
	return new ChatStore({
		agentName: "test-agent",
		modelName: "claude-sonnet-4-20250514",
		temperature: 0.3,
		tools: [{ name: "web_search", type: "mcp" }],
		skills: ["research"],
	});
}

describe("tui/state ChatStore", () => {
	it("initializes with correct defaults", () => {
		const store = createStore();
		const s = store.getState();

		expect(s.messages).toEqual([]);
		expect(s.currentToolStatus).toBeNull();
		expect(s.inputHistory).toEqual([]);
		expect(s.inputHistoryIndex).toBe(-1);
		expect(s.sidebarVisible).toBe(true);
		expect(s.contextPercentage).toBe(0);
		expect(s.sessionTokens).toBeNull();
		expect(s.statusMessage).toBeNull();
		expect(s.isStreaming).toBe(false);
		expect(s.agentName).toBe("test-agent");
		expect(s.modelName).toBe("claude-sonnet-4-20250514");
		expect(s.temperature).toBe(0.3);
		expect(s.tools).toEqual([{ name: "web_search", type: "mcp" }]);
		expect(s.skills).toEqual(["research"]);
	});

	it("addUserMessage appends a user message and records in history", () => {
		const store = createStore();
		store.addUserMessage("Hello");
		const s = store.getState();

		expect(s.messages).toHaveLength(1);
		const msg = s.messages.at(0);
		expect(msg?.role).toBe("user");
		expect(msg?.content).toBe("Hello");
		expect(msg?.isStreaming).toBe(false);
		expect(s.inputHistory).toEqual(["Hello"]);
	});

	it("startAgentMessage creates a streaming agent message", () => {
		const store = createStore();
		store.startAgentMessage();
		const s = store.getState();

		expect(s.messages).toHaveLength(1);
		const msg = s.messages.at(0);
		expect(msg?.role).toBe("agent");
		expect(msg?.content).toBe("");
		expect(msg?.isStreaming).toBe(true);
		expect(s.isStreaming).toBe(true);
	});

	it("appendStreamDelta appends to the last agent message", () => {
		const store = createStore();
		store.startAgentMessage();
		store.appendStreamDelta("Hello ");
		store.appendStreamDelta("world");
		const s = store.getState();

		expect(s.messages.at(0)?.content).toBe("Hello world");
		expect(s.messages.at(0)?.isStreaming).toBe(true);
	});

	it("finalizeMessage marks streaming as done", () => {
		const store = createStore();
		store.startAgentMessage();
		store.appendStreamDelta("Done.");
		store.finalizeMessage();
		const s = store.getState();

		expect(s.messages.at(0)?.isStreaming).toBe(false);
		expect(s.isStreaming).toBe(false);
	});

	it("setActiveToolCall and clearActiveToolCall manage tool status", () => {
		const store = createStore();
		store.setActiveToolCall("web_search");

		expect(store.getState().currentToolStatus).not.toBeNull();
		expect(store.getState().currentToolStatus?.toolName).toBe("web_search");
		expect(store.getState().currentToolStatus?.state).toBe("calling");

		store.clearActiveToolCall("web_search", "done");
		expect(store.getState().currentToolStatus).toBeNull();
	});

	it("clearActiveToolCall with failed status sets error", () => {
		const store = createStore();
		store.setActiveToolCall("web_search");
		store.clearActiveToolCall("web_search", "failed", "timeout");

		expect(store.getState().currentToolStatus).toBeNull();
		expect(store.getState().statusMessage).toContain("web_search failed");
	});

	it("updateContextPercentage stores the value", () => {
		const store = createStore();
		store.updateContextPercentage(85);
		expect(store.getState().contextPercentage).toBe(85);
	});

	it("updateSessionTokens stores token counts", () => {
		const store = createStore();
		store.updateSessionTokens(100, 500);
		expect(store.getState().sessionTokens).toEqual({ input: 100, output: 500 });
	});

	it("setError stores error in statusMessage", () => {
		const store = createStore();
		store.setError("Something broke");
		expect(store.getState().statusMessage).toBe("Something broke");
	});

	it("toggleSidebar flips sidebarVisible", () => {
		const store = createStore();
		expect(store.getState().sidebarVisible).toBe(true);
		store.toggleSidebar();
		expect(store.getState().sidebarVisible).toBe(false);
		store.toggleSidebar();
		expect(store.getState().sidebarVisible).toBe(true);
	});

	it("navigateHistory cycles through input history", () => {
		const store = createStore();
		store.addUserMessage("first");
		store.addUserMessage("second");
		store.addUserMessage("third");

		expect(store.navigateHistory("up")).toBe("third");
		expect(store.navigateHistory("up")).toBe("second");
		expect(store.navigateHistory("up")).toBe("first");
		expect(store.navigateHistory("up")).toBe("first");

		expect(store.navigateHistory("down")).toBe("second");
		expect(store.navigateHistory("down")).toBe("third");
		expect(store.navigateHistory("down")).toBe("");
	});

	it("subscribe notifies listeners on state change", () => {
		const store = createStore();
		const listener = mock(() => {});
		store.subscribe(listener);

		store.addUserMessage("hello");
		expect(listener).toHaveBeenCalledTimes(1);

		store.startAgentMessage();
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("unsubscribe stops notifications", () => {
		const store = createStore();
		const listener = mock(() => {});
		const unsub = store.subscribe(listener);

		store.addUserMessage("hello");
		expect(listener).toHaveBeenCalledTimes(1);

		unsub();
		store.addUserMessage("world");
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
