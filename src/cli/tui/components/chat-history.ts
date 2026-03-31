// src/cli/tui/components/chat-history.ts
import { type RenderContext, ScrollBoxRenderable } from "@opentui/core";
import type { ChatStore } from "../state.js";
import { DARK_BG } from "../theme.js";
import {
	createMessageBubble,
	finalizeBubble,
	type MessageBubbleRefs,
	updateBubbleContent,
} from "./message-bubble.js";

export interface ChatHistoryRefs {
	scrollBox: ScrollBoxRenderable;
	dispose: () => void;
}

export function createChatHistory(renderer: RenderContext, store: ChatStore): ChatHistoryRefs {
	const scrollBox = new ScrollBoxRenderable(renderer, {
		id: "chat-history",
		flexGrow: 1,
		flexShrink: 1,
		height: 0,
		width: "100%",
		overflow: "scroll",
		stickyScroll: true,
		stickyStart: "bottom",
		backgroundColor: DARK_BG,
		padding: 1,
	});

	const bubbleMap = new Map<string, MessageBubbleRefs>();
	let previousMessageCount = 0;

	const finalizedIds = new Set<string>();

	function onStateChange(): void {
		const state = store.getState();
		const { messages } = state;

		// Add new messages
		for (let i = previousMessageCount; i < messages.length; i++) {
			const msg = messages[i];
			if (!msg) continue;
			const bubble = createMessageBubble(renderer, msg);
			bubbleMap.set(msg.id, bubble);
			scrollBox.add(bubble.container);
		}
		previousMessageCount = messages.length;

		// Update the last message if it's streaming
		const lastMsg = messages.at(-1);
		if (lastMsg?.isStreaming) {
			const bubble = bubbleMap.get(lastMsg.id);
			if (bubble) {
				updateBubbleContent(bubble, lastMsg.content);
			}
		}

		// Finalize completed messages (set streaming=false on MarkdownRenderable)
		for (const msg of messages) {
			if (!msg.isStreaming && !finalizedIds.has(msg.id)) {
				const bubble = bubbleMap.get(msg.id);
				if (bubble) {
					finalizeBubble(bubble);
					finalizedIds.add(msg.id);
				}
			}
		}
	}

	const unsub = store.subscribe(onStateChange);

	return {
		scrollBox,
		dispose: unsub,
	};
}
