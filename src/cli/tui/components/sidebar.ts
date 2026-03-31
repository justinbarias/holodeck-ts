// src/cli/tui/components/sidebar.ts
import { BoxRenderable, type RenderContext, Text, TextRenderable } from "@opentui/core";
import type { ChatStore } from "../state.js";
import {
	BORDER,
	CYAN,
	SURFACE,
	TEXT_DIM,
	TEXT_PRIMARY,
	TEXT_SECONDARY,
	WARNING_YELLOW,
} from "../theme.js";

export interface SidebarRefs {
	container: BoxRenderable;
	dispose: () => void;
}

export function createSidebar(renderer: RenderContext, store: ChatStore): SidebarRefs {
	const s = store.getState();

	const container = new BoxRenderable(renderer, {
		id: "sidebar",
		width: "25%",
		minWidth: 18,
		height: "100%",
		flexDirection: "column",
		borderStyle: "single",
		borderColor: BORDER,
		backgroundColor: SURFACE,
		padding: 1,
		gap: 1,
	});

	// Agent info section
	container.add(Text({ id: "sidebar-label-agent", content: "Agent", fg: TEXT_DIM }));
	container.add(Text({ id: "sidebar-agent-name", content: s.agentName, fg: CYAN }));

	container.add(Text({ id: "sidebar-label-model", content: "Model", fg: TEXT_DIM }));
	container.add(Text({ id: "sidebar-model-name", content: s.modelName, fg: TEXT_PRIMARY }));
	container.add(
		Text({
			id: "sidebar-temp",
			content: `temp ${s.temperature}`,
			fg: TEXT_SECONDARY,
		}),
	);

	// Tools section
	if (s.tools.length > 0) {
		container.add(Text({ id: "sidebar-label-tools", content: "── Tools", fg: TEXT_DIM }));
		for (const tool of s.tools) {
			container.add(
				Text({
					id: `sidebar-tool-${tool.name}`,
					content: `▸ ${tool.name}`,
					fg: TEXT_SECONDARY,
				}),
			);
		}
	}

	// Skills section
	if (s.skills.length > 0) {
		container.add(Text({ id: "sidebar-label-skills", content: "── Skills", fg: TEXT_DIM }));
		for (const skill of s.skills) {
			container.add(
				Text({
					id: `sidebar-skill-${skill}`,
					content: `▸ ${skill}`,
					fg: TEXT_SECONDARY,
				}),
			);
		}
	}

	// Stats section — use TextRenderable directly for dynamic updates
	container.add(Text({ id: "sidebar-label-stats", content: "── Stats", fg: TEXT_DIM }));
	const turnsText = new TextRenderable(renderer, {
		id: "sidebar-turns",
		content: "Turns: 0",
		fg: TEXT_SECONDARY,
	});
	const tokensText = new TextRenderable(renderer, {
		id: "sidebar-tokens",
		content: "Tokens: 0",
		fg: TEXT_SECONDARY,
	});
	const contextText = new TextRenderable(renderer, {
		id: "sidebar-context",
		content: "",
		fg: TEXT_SECONDARY,
	});
	container.add(turnsText);
	container.add(tokensText);
	container.add(contextText);

	// Keyboard shortcuts section
	container.add(Text({ id: "sidebar-label-keys", content: "── Keys", fg: TEXT_DIM }));
	container.add(Text({ id: "sidebar-key-sidebar", content: "^⇧B sidebar", fg: TEXT_SECONDARY }));
	container.add(Text({ id: "sidebar-key-esc", content: "Esc stop", fg: TEXT_SECONDARY }));
	container.add(Text({ id: "sidebar-key-exit", content: "^C×2 exit", fg: TEXT_SECONDARY }));
	container.add(Text({ id: "sidebar-key-hist", content: "^↑↓ history", fg: TEXT_SECONDARY }));

	function onStateChange(): void {
		const state = store.getState();
		const turns = state.messages.filter((m) => m.role === "user").length;
		turnsText.content = `Turns: ${turns}`;

		if (state.sessionTokens) {
			tokensText.content = `Tokens: ${state.sessionTokens.input}`;
		}

		if (state.contextPercentage > 0) {
			contextText.content = `Context: ${state.contextPercentage}%`;
			contextText.fg = state.contextPercentage >= 80 ? WARNING_YELLOW : TEXT_SECONDARY;
		}
	}

	const unsub = store.subscribe(onStateChange);

	return {
		container,
		dispose: unsub,
	};
}
