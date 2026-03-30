// src/cli/tui/components/sidebar.ts
import { Box, type BoxRenderable, Text } from "@opentui/core";
import type { ChatStore } from "../state.js";
import { BORDER, CYAN, SURFACE, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY } from "../theme.js";

export interface SidebarRefs {
	container: BoxRenderable;
	dispose: () => void;
}

export function createSidebar(store: ChatStore): SidebarRefs {
	const s = store.getState();

	const container = Box({
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

	// Stats section (updated dynamically)
	container.add(Text({ id: "sidebar-label-stats", content: "── Stats", fg: TEXT_DIM }));
	const turnsText = Text({ id: "sidebar-turns", content: "Turns: 0", fg: TEXT_SECONDARY });
	const tokensInText = Text({ id: "sidebar-tokens-in", content: "In: 0", fg: TEXT_SECONDARY });
	const tokensOutText = Text({ id: "sidebar-tokens-out", content: "Out: 0", fg: TEXT_SECONDARY });
	container.add(turnsText);
	container.add(tokensInText);
	container.add(tokensOutText);

	function onStateChange(): void {
		const state = store.getState();
		const turns = state.messages.filter((m) => m.role === "user").length;
		(turnsText as unknown as { content: string }).content = `Turns: ${turns}`;

		if (state.sessionTokens) {
			(tokensInText as unknown as { content: string }).content = `In: ${state.sessionTokens.input}`;
			(tokensOutText as unknown as { content: string }).content =
				`Out: ${state.sessionTokens.output}`;
		}
	}

	const unsub = store.subscribe(onStateChange);

	return {
		container: container as unknown as BoxRenderable,
		dispose: unsub,
	};
}
