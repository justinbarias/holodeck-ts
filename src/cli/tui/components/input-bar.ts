import {
	Box,
	type BoxRenderable,
	type RenderContext,
	Text,
	TextareaRenderable,
} from "@opentui/core";
import { BORDER, CYAN, SURFACE, TEXT_DIM, TEXT_PRIMARY } from "../theme.js";

export interface InputBarOptions {
	onSubmit: (text: string) => void;
}

export interface InputBarRefs {
	container: BoxRenderable;
	textarea: TextareaRenderable;
}

export function createInputBar(renderer: RenderContext, options: InputBarOptions): InputBarRefs {
	const container = Box({
		id: "input-bar",
		width: "100%",
		borderStyle: "single",
		borderColor: BORDER,
		flexDirection: "row",
		alignItems: "flex-end",
		padding: 0,
		paddingLeft: 1,
		paddingRight: 1,
	});

	const prompt = Text({
		id: "input-prompt",
		content: "> ",
		fg: CYAN,
	});

	const textarea = new TextareaRenderable(renderer, {
		id: "input-textarea",
		flexGrow: 1,
		height: 1,
		placeholder: "Type a message...",
		wrapMode: "word",
		backgroundColor: SURFACE,
		focusedBackgroundColor: SURFACE,
		textColor: TEXT_PRIMARY,
		cursorColor: CYAN,
		keyBindings: [{ name: "return", action: "submit" }],
		onSubmit: () => {
			const text = textarea.plainText.trim();
			if (text.length === 0) return;
			options.onSubmit(text);
			textarea.setText("");
			textarea.height = 1;
		},
		onContentChange: () => {
			const lines = textarea.plainText.split("\n").length;
			const newHeight = Math.max(1, Math.min(5, lines));
			textarea.height = newHeight;
		},
	});

	const hint = Text({
		id: "input-hint",
		content: "[Enter]",
		fg: TEXT_DIM,
	});

	container.add(prompt);
	container.add(textarea);
	container.add(hint);

	return {
		container: container as unknown as BoxRenderable,
		textarea,
	};
}

export function setInputValue(refs: InputBarRefs, value: string): void {
	refs.textarea.setText(value);
	const lines = value.split("\n").length;
	refs.textarea.height = Math.max(1, Math.min(5, lines));
}

export function getInputValue(refs: InputBarRefs): string {
	return refs.textarea.plainText;
}
