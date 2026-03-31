// src/cli/tui/hooks.ts
import type { ChatEvent } from "../../agent/streaming.js";
import type { ChatStore } from "./state.js";

export interface StreamResult {
	shouldAbort: boolean;
	errorMessage?: string;
}

export async function processEventStream(
	events: AsyncGenerator<ChatEvent>,
	store: ChatStore,
): Promise<StreamResult> {
	let agentMessageStarted = false;

	for await (const event of events) {
		switch (event.type) {
			case "text": {
				if (!agentMessageStarted) {
					store.startAgentMessage();
					agentMessageStarted = true;
				}
				store.appendStreamDelta(event.content);
				break;
			}

			case "tool_start": {
				store.setActiveToolCall(event.toolName);
				break;
			}

			case "tool_progress": {
				// Update elapsed time without resetting the tool status
				store.updateToolProgress(event.toolName, event.elapsedSeconds);
				break;
			}

			case "tool_end": {
				store.clearActiveToolCall(event.toolName, event.status, event.error);
				break;
			}

			case "context_warning": {
				store.updateContextPercentage(Math.round(event.ratio * 100));
				break;
			}

			case "complete": {
				if (agentMessageStarted) {
					store.finalizeMessage();
				}
				// Clear any lingering tool status and status messages
				const activeTool = store.getState().currentToolStatus;
				if (activeTool) {
					store.clearActiveToolCall(activeTool.toolName, "done");
				}
				store.setStatusMessage(null);
				break;
			}

			case "error": {
				if (agentMessageStarted) {
					store.finalizeMessage();
				}
				store.setError(event.message);
				return { shouldAbort: true, errorMessage: event.message };
			}

			case "status": {
				store.setStatusMessage(event.message);
				break;
			}

			case "compaction": {
				store.setStatusMessage(event.summary);
				break;
			}

			case "thinking":
			case "noop":
				break;
		}
	}

	return { shouldAbort: false };
}
