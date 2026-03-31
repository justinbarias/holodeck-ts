import { afterEach, describe, expect, it } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import {
	createMessageBubble,
	finalizeBubble,
	updateBubbleContent,
} from "../../../../src/cli/tui/components/message-bubble.js";
import type { ChatMessage } from "../../../../src/cli/tui/state.js";

function makeMessage(overrides?: Partial<ChatMessage>): ChatMessage {
	return {
		id: "msg-1",
		role: "user",
		content: "Hello",
		isStreaming: false,
		timestamp: new Date(),
		...overrides,
	};
}

describe("tui/message-bubble", () => {
	let cleanup: (() => void) | null = null;

	afterEach(() => {
		cleanup?.();
		cleanup = null;
	});

	it("renders user message with 'You:' label", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 60,
			height: 10,
		});
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		const refs = createMessageBubble(renderer, makeMessage({ role: "user", content: "Hi" }));
		renderer.root.add(refs.container);
		await renderOnce();

		const frame = captureCharFrame();
		expect(frame).toContain("You:");
	});

	it("renders agent message with 'Agent:' label", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 60,
			height: 10,
		});
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		const refs = createMessageBubble(
			renderer,
			makeMessage({ role: "agent", content: "Hello there" }),
		);
		renderer.root.add(refs.container);
		await renderOnce();

		const frame = captureCharFrame();
		expect(frame).toContain("Agent:");
	});

	it("enables streaming mode for streaming messages", () => {
		// Use a synchronous check — streaming is set at construction time
		// Need a renderer just for construction
		const setup = async () => {
			const { renderer } = await createTestRenderer({ width: 60, height: 10 });
			const refs = createMessageBubble(
				renderer,
				makeMessage({ role: "agent", content: "partial", isStreaming: true }),
			);
			expect(refs.contentMarkdown.streaming).toBe(true);
			renderer.stop();
			renderer.destroy();
		};
		return setup();
	});

	it("enables streaming mode for empty content regardless of isStreaming flag", () => {
		const setup = async () => {
			const { renderer } = await createTestRenderer({ width: 60, height: 10 });
			const refs = createMessageBubble(
				renderer,
				makeMessage({ role: "agent", content: "", isStreaming: false }),
			);
			expect(refs.contentMarkdown.streaming).toBe(true);
			renderer.stop();
			renderer.destroy();
		};
		return setup();
	});

	it("disables streaming for finalized non-empty user messages", () => {
		const setup = async () => {
			const { renderer } = await createTestRenderer({ width: 60, height: 10 });
			const refs = createMessageBubble(
				renderer,
				makeMessage({ role: "user", content: "Hello world", isStreaming: false }),
			);
			expect(refs.contentMarkdown.streaming).toBe(false);
			renderer.stop();
			renderer.destroy();
		};
		return setup();
	});

	it("updateBubbleContent changes markdown content", async () => {
		const { renderer } = await createTestRenderer({ width: 60, height: 10 });
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		const refs = createMessageBubble(
			renderer,
			makeMessage({ role: "agent", content: "", isStreaming: true }),
		);
		updateBubbleContent(refs, "Updated content");
		expect(refs.contentMarkdown.content).toBe("Updated content");
	});

	it("finalizeBubble sets streaming to false", async () => {
		const { renderer } = await createTestRenderer({ width: 60, height: 10 });
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		const refs = createMessageBubble(
			renderer,
			makeMessage({ role: "agent", content: "Done", isStreaming: true }),
		);
		expect(refs.contentMarkdown.streaming).toBe(true);
		finalizeBubble(refs);
		expect(refs.contentMarkdown.streaming).toBe(false);
	});
});
