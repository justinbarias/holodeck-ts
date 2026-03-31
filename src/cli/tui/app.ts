// src/cli/tui/app.ts
import { BoxRenderable, createCliRenderer, type KeyEvent } from "@opentui/core";
import type { ChatSession } from "../../agent/session.js";
import { closeSession, interruptResponse, sendMessage } from "../../agent/session.js";
import type { AgentConfig } from "../../config/schema.js";
import { toErrorMessage } from "../../lib/errors.js";
import { formatRuntimeErrorMessage } from "../commands/chat.js";
import { createChatHistory } from "./components/chat-history.js";
import { createInputBar, setInputValue } from "./components/input-bar.js";
import { createSidebar } from "./components/sidebar.js";
import { createStatusBar } from "./components/status-bar.js";
import { processEventStream } from "./hooks.js";
import { ChatStore, type ToolInfo } from "./state.js";

export async function launchTUI(session: ChatSession, config: AgentConfig): Promise<void> {
	const renderer = await createCliRenderer({
		exitOnCtrlC: false,
	});

	const tools: ToolInfo[] = config.tools.map((t) => ({
		name: t.name,
		type: t.type,
	}));

	const store = new ChatStore({
		agentName: config.name,
		modelName: config.model.name,
		temperature: config.model.temperature ?? 0.3,
		tools,
		skills: session.skills.map((s) => s.name),
	});

	// Wire compaction callbacks from hooks to store
	session.onCompactionStart = () => store.startCompaction();
	session.onCompactionEnd = () => store.endCompaction();

	// Create components
	const sidebar = createSidebar(renderer, store);
	const chatHistory = createChatHistory(renderer, store);
	const statusBar = createStatusBar(renderer, store);
	const inputBar = createInputBar(renderer, {
		onSubmit: (text) => handleSubmit(text),
	});

	// Layout assembly:
	// +----------+-----------------------------+
	// | sidebar  | chat-history (flexGrow)      |
	// |          +-----------------------------+
	// |          | status-bar                   |
	// |          +-----------------------------+
	// |          | input-bar                    |
	// +----------+-----------------------------+

	const mainColumn = new BoxRenderable(renderer, {
		id: "main-column",
		flexGrow: 1,
		flexDirection: "column",
		height: "100%",
		overflow: "hidden",
	});
	mainColumn.add(chatHistory.scrollBox);
	mainColumn.add(statusBar.container);
	mainColumn.add(inputBar.container);

	const rootLayout = new BoxRenderable(renderer, {
		id: "root-layout",
		width: "100%",
		height: "100%",
		flexDirection: "row",
	});
	rootLayout.add(sidebar.container);
	rootLayout.add(mainColumn);

	renderer.root.add(rootLayout);

	// Focus the input
	inputBar.textarea.focus();

	// Disable input during compaction
	store.subscribe(() => {
		const s = store.getState();
		if (s.isCompacting) {
			inputBar.textarea.focusable = false;
			inputBar.textarea.blur();
		} else if (!s.isStreaming) {
			inputBar.textarea.focusable = true;
			inputBar.textarea.focus();
		}
	});

	// Global keybindings
	let lastSigintTime = 0;

	renderer.keyInput.on("keypress", (key: KeyEvent) => {
		// Ctrl+Shift+B: toggle sidebar (Ctrl+B is consumed by textarea as cursor-left)
		if (key.ctrl && key.shift && key.name === "b") {
			store.toggleSidebar();
			sidebar.container.visible = store.getState().sidebarVisible;
			return;
		}

		// Escape: interrupt streaming
		if (key.name === "escape" && store.getState().isStreaming) {
			void interruptResponse(session);
			store.finalizeMessage();
			return;
		}

		// Ctrl+C: interrupt if streaming, double-tap to exit
		if (key.ctrl && key.name === "c") {
			const now = Date.now();
			if (store.getState().isStreaming) {
				void interruptResponse(session);
				store.finalizeMessage();
				lastSigintTime = now;
				return;
			}

			if (now - lastSigintTime < 1000) {
				void cleanup();
				return;
			}

			lastSigintTime = now;
			store.setStatusMessage("Press Ctrl+C again to exit");
			return;
		}
	});

	// History navigation via textarea's onKeyDown (arrow keys are consumed by textarea
	// before reaching the global keypress handler)
	inputBar.textarea.onKeyDown = (key: KeyEvent) => {
		if (store.getState().isStreaming) return;

		if (key.name === "up") {
			const prev = store.navigateHistory("up");
			if (prev.length > 0) setInputValue(inputBar, prev);
			return;
		}
		if (key.name === "down") {
			const next = store.navigateHistory("down");
			setInputValue(inputBar, next);
		}
	};

	// Submit handler
	async function handleSubmit(text: string): Promise<void> {
		if (store.getState().isStreaming) return;

		store.addUserMessage(text);

		try {
			const eventStream = sendMessage(session, text);
			const result = await processEventStream(eventStream, store);

			// Update token/context counts from session
			if (session.contextUsage) {
				store.updateContextPercentage(Math.round(session.contextUsage.percentage));
				store.updateSessionTokens(session.contextUsage.totalTokens, 0);
			}

			if (result.shouldAbort) {
				store.setError(formatRuntimeErrorMessage(result.errorMessage ?? "Runtime error"));
			}
		} catch (error) {
			store.setError(formatRuntimeErrorMessage(toErrorMessage(error)));
		}

		// Re-focus input after response
		inputBar.textarea.focus();
	}

	// Cleanup
	async function cleanup(): Promise<void> {
		chatHistory.dispose();
		statusBar.dispose();
		sidebar.dispose();
		await closeSession(session);
		renderer.stop();
		renderer.destroy();
		process.exit(process.exitCode ?? 0);
	}

	// Handle process signals
	process.on("SIGTERM", () => {
		void cleanup();
	});

	// Start the renderer
	renderer.start();

	// Keep the process alive until cleanup
	await new Promise<void>(() => {});
}
