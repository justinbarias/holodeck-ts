// src/cli/tui/state.ts

export interface ChatMessage {
	id: string;
	role: "user" | "agent";
	content: string;
	isStreaming: boolean;
	timestamp: Date;
}

export interface ToolStatus {
	toolName: string;
	state: "calling" | "done" | "failed";
	startedAt: Date;
	error?: string;
}

export interface ToolInfo {
	name: string;
	type: string;
}

export interface TUIState {
	messages: ChatMessage[];
	currentToolStatus: ToolStatus | null;
	inputHistory: string[];
	inputHistoryIndex: number;
	sidebarVisible: boolean;
	contextPercentage: number;
	sessionTokens: { input: number; output: number } | null;
	statusMessage: string | null;
	isStreaming: boolean;
	agentName: string;
	modelName: string;
	temperature: number;
	skills: string[];
	tools: ToolInfo[];
}

export interface ChatStoreInit {
	agentName: string;
	modelName: string;
	temperature: number;
	tools: ToolInfo[];
	skills: string[];
}

type Listener = () => void;

let nextId = 0;
function genId(): string {
	return `msg-${++nextId}`;
}

export class ChatStore {
	private state: TUIState;
	private listeners = new Set<Listener>();

	constructor(init: ChatStoreInit) {
		this.state = {
			messages: [],
			currentToolStatus: null,
			inputHistory: [],
			inputHistoryIndex: -1,
			sidebarVisible: true,
			contextPercentage: 0,
			sessionTokens: null,
			statusMessage: null,
			isStreaming: false,
			agentName: init.agentName,
			modelName: init.modelName,
			temperature: init.temperature,
			tools: init.tools,
			skills: init.skills,
		};
	}

	getState(): Readonly<TUIState> {
		return this.state;
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	addUserMessage(content: string): void {
		this.state.messages.push({
			id: genId(),
			role: "user",
			content,
			isStreaming: false,
			timestamp: new Date(),
		});
		this.state.inputHistory.push(content);
		this.state.inputHistoryIndex = -1;
		this.notify();
	}

	startAgentMessage(): void {
		this.state.messages.push({
			id: genId(),
			role: "agent",
			content: "",
			isStreaming: true,
			timestamp: new Date(),
		});
		this.state.isStreaming = true;
		this.notify();
	}

	appendStreamDelta(delta: string): void {
		const last = this.state.messages.at(-1);
		if (last?.role === "agent" && last.isStreaming) {
			last.content += delta;
			this.notify();
		}
	}

	finalizeMessage(): void {
		const last = this.state.messages.at(-1);
		if (last?.role === "agent" && last.isStreaming) {
			last.isStreaming = false;
		}
		this.state.isStreaming = false;
		this.notify();
	}

	setActiveToolCall(toolName: string): void {
		this.state.currentToolStatus = {
			toolName,
			state: "calling",
			startedAt: new Date(),
		};
		this.notify();
	}

	updateToolProgress(toolName: string, _elapsedSeconds: number): void {
		// If no active tool, start it (tool_progress can arrive before content_block_start)
		if (!this.state.currentToolStatus) {
			this.setActiveToolCall(toolName);
			return;
		}
		// Don't reset startedAt — just notify to refresh the spinner display
		this.notify();
	}

	clearActiveToolCall(toolName: string, status: "done" | "failed", error?: string): void {
		if (status === "failed") {
			this.state.statusMessage = `${toolName} failed${error ? `: ${error}` : ""}`;
		}
		this.state.currentToolStatus = null;
		this.notify();
	}

	updateContextPercentage(percentage: number): void {
		this.state.contextPercentage = percentage;
		this.notify();
	}

	updateSessionTokens(input: number, output: number): void {
		this.state.sessionTokens = { input, output };
		this.notify();
	}

	setError(message: string): void {
		this.state.statusMessage = message;
		this.notify();
	}

	setStatusMessage(message: string | null): void {
		this.state.statusMessage = message;
		this.notify();
	}

	toggleSidebar(): void {
		this.state.sidebarVisible = !this.state.sidebarVisible;
		this.notify();
	}

	navigateHistory(direction: "up" | "down"): string {
		const history = this.state.inputHistory;
		if (history.length === 0) return "";

		if (direction === "up") {
			if (this.state.inputHistoryIndex === -1) {
				this.state.inputHistoryIndex = history.length - 1;
			} else if (this.state.inputHistoryIndex > 0) {
				this.state.inputHistoryIndex--;
			}
			return history[this.state.inputHistoryIndex] ?? "";
		}

		// direction === "down"
		if (this.state.inputHistoryIndex === -1) return "";
		if (this.state.inputHistoryIndex < history.length - 1) {
			this.state.inputHistoryIndex++;
			return history[this.state.inputHistoryIndex] ?? "";
		}

		this.state.inputHistoryIndex = -1;
		return "";
	}
}
