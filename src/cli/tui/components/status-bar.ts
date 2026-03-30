import { Box, type BoxRenderable, Text } from "@opentui/core";
import type { ChatStore, ToolStatus } from "../state.js";
import {
	ERROR_RED,
	SPINNER_FRAMES,
	SURFACE,
	TEXT_DIM,
	TOOL_COLOR,
	WARNING_YELLOW,
} from "../theme.js";

export interface StatusBarRefs {
	container: BoxRenderable;
	toolText: ReturnType<typeof Text>;
	contextText: ReturnType<typeof Text>;
	dispose: () => void;
}

function formatElapsed(startedAt: Date): string {
	const elapsed = (Date.now() - startedAt.getTime()) / 1000;
	return `${elapsed.toFixed(1)}s`;
}

export function createStatusBar(store: ChatStore): StatusBarRefs {
	const container = Box({
		id: "status-bar",
		width: "100%",
		height: 1,
		flexDirection: "row",
		justifyContent: "space-between",
		backgroundColor: SURFACE,
		paddingLeft: 1,
		paddingRight: 1,
	});

	const toolText = Text({
		id: "status-tool",
		content: "",
		fg: TEXT_DIM,
	});

	const contextText = Text({
		id: "status-context",
		content: "",
		fg: TEXT_DIM,
	});

	container.add(toolText);
	container.add(contextText);

	let spinnerIndex = 0;
	let animationTimer: ReturnType<typeof setInterval> | null = null;

	function updateToolDisplay(tool: ToolStatus | null, statusMsg: string | null): void {
		if (tool) {
			const frame = SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length];
			const elapsed = formatElapsed(tool.startedAt);
			(toolText as unknown as { content: string }).content =
				`${frame} Running: ${tool.toolName}  ${elapsed}`;
			(toolText as unknown as { fg: unknown }).fg = TOOL_COLOR;
		} else if (statusMsg) {
			(toolText as unknown as { content: string }).content = statusMsg;
			(toolText as unknown as { fg: unknown }).fg = ERROR_RED;
		} else {
			(toolText as unknown as { content: string }).content = "";
		}
	}

	function updateContextDisplay(percentage: number): void {
		if (percentage === 0) {
			(contextText as unknown as { content: string }).content = "";
			return;
		}
		const color = percentage >= 80 ? WARNING_YELLOW : TEXT_DIM;
		(contextText as unknown as { content: string }).content = `Context: ${percentage}%`;
		(contextText as unknown as { fg: unknown }).fg = color;
	}

	function onStateChange(): void {
		const s = store.getState();
		updateToolDisplay(s.currentToolStatus, s.statusMessage);
		updateContextDisplay(s.contextPercentage);

		if (s.currentToolStatus && !animationTimer) {
			animationTimer = setInterval(() => {
				spinnerIndex++;
				const tool = store.getState().currentToolStatus;
				if (tool) {
					updateToolDisplay(tool, null);
				}
			}, 80);
		} else if (!s.currentToolStatus && animationTimer) {
			clearInterval(animationTimer);
			animationTimer = null;
		}
	}

	const unsub = store.subscribe(onStateChange);

	function dispose(): void {
		unsub();
		if (animationTimer) {
			clearInterval(animationTimer);
			animationTimer = null;
		}
	}

	return {
		container: container as unknown as BoxRenderable,
		toolText,
		contextText,
		dispose,
	};
}
