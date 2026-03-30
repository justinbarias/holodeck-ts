// src/cli/tui/components/message-bubble.ts
import {
	Box,
	type BoxRenderable,
	MarkdownRenderable,
	type RenderContext,
	RGBA,
	SyntaxStyle,
	Text,
} from "@opentui/core";
import type { ChatMessage } from "../state.js";
import { AGENT_COLOR, TEXT_PRIMARY, USER_COLOR } from "../theme.js";

const syntaxStyle = SyntaxStyle.fromStyles({
	"markup.heading.1": { fg: RGBA.fromHex("#58A6FF"), bold: true },
	"markup.heading.2": { fg: RGBA.fromHex("#58A6FF"), bold: true },
	"markup.list": { fg: RGBA.fromHex("#FF7B72") },
	"markup.raw": { fg: RGBA.fromHex("#A5D6FF") },
	"markup.bold": { bold: true },
	"markup.italic": { italic: true },
	"markup.link": { fg: RGBA.fromHex("#58A6FF"), underline: true },
	default: { fg: RGBA.fromHex("#E6EDF3") },
});

export interface MessageBubbleRefs {
	container: BoxRenderable;
	contentText: ReturnType<typeof Text> | null;
	contentMarkdown: MarkdownRenderable | null;
}

export function createMessageBubble(
	renderer: RenderContext,
	message: ChatMessage,
): MessageBubbleRefs {
	const isUser = message.role === "user";
	const roleLabel = isUser ? "You:" : "Agent:";
	const roleColor = isUser ? USER_COLOR : AGENT_COLOR;

	const container = Box({
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

	const refs: MessageBubbleRefs = {
		container: container as unknown as BoxRenderable,
		contentText: null,
		contentMarkdown: null,
	};

	if (message.isStreaming || message.content.length === 0) {
		const textNode = Text({
			id: `content-${message.id}`,
			content: message.content,
			fg: TEXT_PRIMARY,
		});
		container.add(textNode);
		refs.contentText = textNode;
	} else {
		const md = new MarkdownRenderable(renderer, {
			id: `content-${message.id}`,
			content: message.content,
			syntaxStyle,
			width: "100%",
			streaming: false,
		});
		container.add(md);
		refs.contentMarkdown = md;
	}

	return refs;
}

export function updateBubbleContent(refs: MessageBubbleRefs, content: string): void {
	if (refs.contentText) {
		(refs.contentText as unknown as { content: string }).content = content;
	}
}

export function finalizeBubble(
	renderer: RenderContext,
	refs: MessageBubbleRefs,
	message: ChatMessage,
): void {
	if (!refs.contentText) return;

	const container = refs.container;
	const textId = `content-${message.id}`;
	container.remove(textId);
	refs.contentText = null;

	const md = new MarkdownRenderable(renderer, {
		id: textId,
		content: message.content,
		syntaxStyle,
		width: "100%",
		streaming: false,
	});
	container.add(md);
	refs.contentMarkdown = md;
}
