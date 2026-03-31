import { BoxRenderable, type RenderContext, TextRenderable } from "@opentui/core";
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
	dispose: () => void;
}

function formatElapsed(startedAt: Date): string {
	const elapsed = (Date.now() - startedAt.getTime()) / 1000;
	return `${elapsed.toFixed(1)}s`;
}

export function createStatusBar(renderer: RenderContext, store: ChatStore): StatusBarRefs {
	const container = new BoxRenderable(renderer, {
		id: "status-bar-box",
		width: "100%",
		height: 1,
		flexShrink: 0,
		backgroundColor: SURFACE,
		paddingLeft: 1,
	});

	const bar = new TextRenderable(renderer, {
		id: "status-bar",
		content: " ",
		fg: TEXT_DIM,
	});
	container.add(bar);

	let spinnerIndex = 0;
	let animationTimer: ReturnType<typeof setInterval> | null = null;

	function buildContent(
		tool: ToolStatus | null,
		statusMsg: string | null,
		contextPct: number,
	): void {
		const parts: string[] = [];

		if (tool) {
			const frame = SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length];
			const elapsed = formatElapsed(tool.startedAt);
			parts.push(`${frame} Running: ${tool.toolName}  ${elapsed}`);
			bar.fg = TOOL_COLOR;
		} else if (statusMsg) {
			parts.push(statusMsg);
			bar.fg = ERROR_RED;
		} else {
			bar.fg = TEXT_DIM;
		}

		if (contextPct > 0) {
			const contextStr = `Context: ${contextPct}%`;
			if (parts.length > 0) {
				// Pad to push context to right
				parts.push(contextStr);
				bar.content = ` ${parts.join("  ")}`;
			} else {
				bar.content = ` ${contextStr}`;
			}
			if (contextPct >= 80) bar.fg = WARNING_YELLOW;
		} else if (parts.length > 0) {
			bar.content = ` ${parts[0]}`;
		} else {
			bar.content = " ";
		}
	}

	function onStateChange(): void {
		const s = store.getState();
		buildContent(s.currentToolStatus, s.statusMessage, s.contextPercentage);

		if (s.currentToolStatus && !animationTimer) {
			animationTimer = setInterval(() => {
				spinnerIndex++;
				const s2 = store.getState();
				if (s2.currentToolStatus) {
					buildContent(s2.currentToolStatus, s2.statusMessage, s2.contextPercentage);
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
		container,
		dispose,
	};
}
