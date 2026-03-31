// src/cli/tui/components/message-bubble.ts
import {
	BoxRenderable,
	MarkdownRenderable,
	type RenderContext,
	RGBA,
	SyntaxStyle,
	Text,
} from "@opentui/core";
import type { ChatMessage } from "../state.js";
import { AGENT_COLOR, USER_COLOR } from "../theme.js";

const syntaxStyle = SyntaxStyle.fromStyles({
	"markup.heading.1": { fg: RGBA.fromHex("#58A6FF"), bold: true },
	"markup.heading.2": { fg: RGBA.fromHex("#58A6FF"), bold: true },
	"markup.heading.3": { fg: RGBA.fromHex("#58A6FF"), bold: true },
	"markup.list": { fg: RGBA.fromHex("#FF7B72") },
	"markup.raw": { fg: RGBA.fromHex("#A5D6FF") },
	"markup.bold": { bold: true },
	"markup.italic": { italic: true },
	"markup.link": { fg: RGBA.fromHex("#58A6FF"), underline: true },
	default: { fg: RGBA.fromHex("#E6EDF3") },
});

export interface MessageBubbleRefs {
	container: BoxRenderable;
	contentMarkdown: MarkdownRenderable;
}

export function createMessageBubble(
	renderer: RenderContext,
	message: ChatMessage,
): MessageBubbleRefs {
	const isUser = message.role === "user";
	const roleLabel = isUser ? "You:" : "Agent:";
	const roleColor = isUser ? USER_COLOR : AGENT_COLOR;

	const container = new BoxRenderable(renderer, {
		id: `bubble-${message.id}`,
		width: "100%",
		flexDirection: "column",
		paddingBottom: 1,
	});

	container.add(
		Text({
			content: roleLabel,
			fg: roleColor,
		}),
	);

	// Always use MarkdownRenderable — streaming:true for incremental updates,
	// set streaming:false on finalize. Avoids VNode proxy remove/add issues.
	const md = new MarkdownRenderable(renderer, {
		id: `content-${message.id}`,
		content: message.content,
		syntaxStyle,
		width: "100%",
		streaming: message.isStreaming || message.content.length === 0,
	});
	container.add(md);

	return {
		container,
		contentMarkdown: md,
	};
}

export function updateBubbleContent(refs: MessageBubbleRefs, content: string): void {
	refs.contentMarkdown.content = content;
}

export function finalizeBubble(refs: MessageBubbleRefs): void {
	refs.contentMarkdown.streaming = false;
}
