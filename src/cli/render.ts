import { type MarkedOptions, marked } from "marked";
import TerminalRenderer from "marked-terminal";
import remend from "remend";

marked.setOptions({
	renderer: new TerminalRenderer() as MarkedOptions["renderer"],
});

export function renderMarkdown(text: string): string {
	if (text.length === 0) {
		return "";
	}

	const rendered = marked.parse(text, { async: false });
	return typeof rendered === "string" ? rendered : "";
}

// Re-renders full buffer each call — remend needs it to close unterminated blocks.
export function renderStreamingMarkdown(buffer: string): string {
	if (buffer.length === 0) {
		return "";
	}

	return renderMarkdown(remend(buffer));
}
