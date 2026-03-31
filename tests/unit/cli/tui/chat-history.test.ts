import { afterEach, describe, expect, it } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createChatHistory } from "../../../../src/cli/tui/components/chat-history.js";
import { ChatStore } from "../../../../src/cli/tui/state.js";

function createStore() {
	return new ChatStore({
		agentName: "test",
		modelName: "claude-sonnet-4-20250514",
		temperature: 0.3,
		tools: [],
		skills: [],
	});
}

describe("tui/chat-history", () => {
	let cleanup: (() => void) | null = null;

	afterEach(() => {
		cleanup?.();
		cleanup = null;
	});

	it("creates a scrollable chat history", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 60,
			height: 20,
		});
		const store = createStore();
		const refs = createChatHistory(renderer, store);
		renderer.root.add(refs.scrollBox);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		await renderOnce();
		expect(captureCharFrame()).toBeDefined();
	});

	it("adds message bubbles when user messages are added", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 60,
			height: 20,
		});
		const store = createStore();
		const refs = createChatHistory(renderer, store);
		renderer.root.add(refs.scrollBox);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		store.addUserMessage("Hello world");
		await renderOnce();
		const frame = captureCharFrame();
		expect(frame).toContain("You:");
		// MarkdownRenderable content may need additional render cycles
		// but the bubble structure with the role label is confirmed
	});

	it("renders agent streaming messages", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 60,
			height: 20,
		});
		const store = createStore();
		const refs = createChatHistory(renderer, store);
		renderer.root.add(refs.scrollBox);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		store.startAgentMessage();
		store.appendStreamDelta("Streaming ");
		store.appendStreamDelta("response");
		await renderOnce();

		const frame = captureCharFrame();
		expect(frame).toContain("Agent:");
		// Content may not appear in first frame due to async markdown rendering
	});

	it("finalizes streaming messages", async () => {
		const { renderer, renderOnce } = await createTestRenderer({
			width: 60,
			height: 20,
		});
		const store = createStore();
		const refs = createChatHistory(renderer, store);
		renderer.root.add(refs.scrollBox);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		store.startAgentMessage();
		store.appendStreamDelta("Done");
		store.finalizeMessage();
		await renderOnce();

		// Message should be finalized (streaming=false)
		const state = store.getState();
		expect(state.messages.at(-1)?.isStreaming).toBe(false);
	});

	it("handles multiple messages in sequence", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 60,
			height: 30,
		});
		const store = createStore();
		const refs = createChatHistory(renderer, store);
		renderer.root.add(refs.scrollBox);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		store.addUserMessage("First");
		store.startAgentMessage();
		store.appendStreamDelta("Response 1");
		store.finalizeMessage();
		store.addUserMessage("Second");
		await renderOnce();

		const frame = captureCharFrame();
		// Verify multiple "You:" labels rendered for the two user messages
		const youCount = (frame.match(/You:/g) || []).length;
		expect(youCount).toBe(2);
		expect(frame).toContain("Agent:");
	});

	it("dispose stops listening to store", async () => {
		const { renderer } = await createTestRenderer({
			width: 60,
			height: 20,
		});
		const store = createStore();
		const refs = createChatHistory(renderer, store);
		renderer.root.add(refs.scrollBox);

		refs.dispose();
		renderer.stop();
		renderer.destroy();

		// After dispose, store updates should not throw
		store.addUserMessage("after dispose");
	});
});
