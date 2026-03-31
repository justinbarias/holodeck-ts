import { describe, expect, it, mock } from "bun:test";
import type {
	PostCompactHookInput,
	PostToolUseFailureHookInput,
	PostToolUseHookInput,
	PreCompactHookInput,
	PreToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import {
	buildHooks,
	buildPostCompactHook,
	buildPostToolUseFailureHook,
	buildPostToolUseHook,
	buildPreCompactHook,
	buildPreToolUseHook,
} from "../../../src/agent/hooks.js";
import type { ChatSession } from "../../../src/agent/session.js";

const baseHookFields = {
	session_id: "sess-test",
	transcript_path: "/tmp/transcript.jsonl",
	cwd: "/tmp",
};

const abortOptions = { signal: AbortSignal.timeout(5000) };

function createMockSession(
	overrides?: Partial<
		Pick<
			ChatSession,
			"contextWarningShown" | "onCompactionStart" | "onCompactionEnd" | "lastToolInvocation"
		>
	>,
): ChatSession {
	return {
		contextWarningShown: false,
		onCompactionStart: undefined,
		onCompactionEnd: undefined,
		lastToolInvocation: null,
		...overrides,
	} as unknown as ChatSession;
}

describe("agent/hooks", () => {
	describe("buildPreToolUseHook", () => {
		it("T061: sets lastToolInvocation with status calling, args, and toolUseId", async () => {
			const session = createMockSession();
			const matcher = buildPreToolUseHook(session);

			const input: PreToolUseHookInput = {
				...baseHookFields,
				hook_event_name: "PreToolUse",
				tool_name: "Read",
				tool_input: { path: "file.ts" },
				tool_use_id: "tu-123",
			};

			const result = await matcher.hooks[0]?.(input, "tu-123", abortOptions);
			expect(result).toEqual({ continue: true });
			expect(session.lastToolInvocation).not.toBeNull();
			expect(session.lastToolInvocation?.toolName).toBe("Read");
			expect(session.lastToolInvocation?.args).toEqual({ path: "file.ts" });
			expect(session.lastToolInvocation?.status).toBe("calling");
			expect(session.lastToolInvocation?.toolUseId).toBe("tu-123");
			expect(session.lastToolInvocation?.result).toBeNull();
		});
	});

	describe("buildPostToolUseHook", () => {
		it("T062: updates lastToolInvocation with result and status done", async () => {
			const session = createMockSession({
				lastToolInvocation: {
					toolName: "Read",
					args: { path: "file.ts" },
					result: null,
					status: "calling",
					timestamp: new Date(),
					toolUseId: "tu-456",
				},
			});
			const matcher = buildPostToolUseHook(session);

			const input: PostToolUseHookInput = {
				...baseHookFields,
				hook_event_name: "PostToolUse",
				tool_name: "Read",
				tool_input: { path: "file.ts" },
				tool_response: { content: "file contents here" },
				tool_use_id: "tu-456",
			};

			const result = await matcher.hooks[0]?.(input, "tu-456", abortOptions);
			expect(result).toEqual({ continue: true });
			expect(session.lastToolInvocation?.status).toBe("done");
			expect(session.lastToolInvocation?.result).toEqual({ content: "file contents here" });
			expect(session.lastToolInvocation?.toolUseId).toBe("tu-456");
		});

		it("T062: creates new record when toolUseId does not match", async () => {
			const session = createMockSession({
				lastToolInvocation: {
					toolName: "Bash",
					args: { command: "ls" },
					result: null,
					status: "calling",
					timestamp: new Date(),
					toolUseId: "tu-old",
				},
			});
			const matcher = buildPostToolUseHook(session);

			const input: PostToolUseHookInput = {
				...baseHookFields,
				hook_event_name: "PostToolUse",
				tool_name: "Read",
				tool_input: { path: "file.ts" },
				tool_response: "done",
				tool_use_id: "tu-new",
			};

			await matcher.hooks[0]?.(input, "tu-new", abortOptions);
			expect(session.lastToolInvocation?.toolName).toBe("Read");
			expect(session.lastToolInvocation?.toolUseId).toBe("tu-new");
			expect(session.lastToolInvocation?.status).toBe("done");
		});
	});

	describe("buildPostToolUseFailureHook", () => {
		it("T082: sets lastToolInvocation with status failed and error", async () => {
			const session = createMockSession();
			const matcher = buildPostToolUseFailureHook(session);

			const input: PostToolUseFailureHookInput = {
				...baseHookFields,
				hook_event_name: "PostToolUseFailure",
				tool_name: "Bash",
				tool_input: { command: "rm -rf /" },
				tool_use_id: "tu-fail",
				error: "Permission denied",
			};

			const result = await matcher.hooks[0]?.(input, "tu-fail", abortOptions);
			expect(result).toEqual({ continue: true });
			expect(session.lastToolInvocation?.toolName).toBe("Bash");
			expect(session.lastToolInvocation?.status).toBe("failed");
			expect(session.lastToolInvocation?.result).toBe("Permission denied");
			expect(session.lastToolInvocation?.args).toEqual({ command: "rm -rf /" });
		});
	});

	describe("buildPreCompactHook", () => {
		it("calls onCompactionStart and returns continue", async () => {
			const onCompactionStart = mock(() => {});
			const session = createMockSession({ onCompactionStart });
			const matcher = buildPreCompactHook(session);

			const input: PreCompactHookInput = {
				...baseHookFields,
				hook_event_name: "PreCompact",
				trigger: "auto",
				custom_instructions: null,
			};

			const result = await matcher.hooks[0]?.(input, undefined, abortOptions);
			expect(result).toEqual({ continue: true });
			expect(onCompactionStart).toHaveBeenCalledTimes(1);
		});

		it("does not throw when onCompactionStart is undefined", async () => {
			const session = createMockSession();
			const matcher = buildPreCompactHook(session);

			const input: PreCompactHookInput = {
				...baseHookFields,
				hook_event_name: "PreCompact",
				trigger: "auto",
				custom_instructions: null,
			};

			const result = await matcher.hooks[0]?.(input, undefined, abortOptions);
			expect(result).toEqual({ continue: true });
		});
	});

	describe("buildPostCompactHook", () => {
		it("calls onCompactionEnd, resets contextWarningShown, and returns continue", async () => {
			const onCompactionEnd = mock(() => {});
			const session = createMockSession({ contextWarningShown: true, onCompactionEnd });
			const matcher = buildPostCompactHook(session);

			const input: PostCompactHookInput = {
				...baseHookFields,
				hook_event_name: "PostCompact",
				trigger: "auto",
				compact_summary: "Conversation was summarized.",
			};

			const result = await matcher.hooks[0]?.(input, undefined, abortOptions);
			expect(result).toEqual({ continue: true });
			expect(session.contextWarningShown).toBe(false);
			expect(onCompactionEnd).toHaveBeenCalledTimes(1);
		});

		it("does not throw when onCompactionEnd is undefined", async () => {
			const session = createMockSession({ contextWarningShown: true });
			const matcher = buildPostCompactHook(session);

			const input: PostCompactHookInput = {
				...baseHookFields,
				hook_event_name: "PostCompact",
				trigger: "auto",
				compact_summary: "Summary.",
			};

			const result = await matcher.hooks[0]?.(input, undefined, abortOptions);
			expect(result).toEqual({ continue: true });
			expect(session.contextWarningShown).toBe(false);
		});
	});

	describe("buildHooks", () => {
		it("returns all five hook types", () => {
			const session = createMockSession();
			const hooks = buildHooks(session);

			expect(hooks.PreToolUse).toHaveLength(1);
			expect(hooks.PostToolUse).toHaveLength(1);
			expect(hooks.PostToolUseFailure).toHaveLength(1);
			expect(hooks.PreCompact).toHaveLength(1);
			expect(hooks.PostCompact).toHaveLength(1);
		});
	});
});
