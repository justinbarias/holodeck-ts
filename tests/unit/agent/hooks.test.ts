import { describe, expect, it, mock } from "bun:test";
import type { PostCompactHookInput, PreCompactHookInput } from "@anthropic-ai/claude-agent-sdk";
import { buildHooks, buildPostCompactHook, buildPreCompactHook } from "../../../src/agent/hooks.js";
import type { ChatSession } from "../../../src/agent/session.js";

const baseHookFields = {
	session_id: "sess-test",
	transcript_path: "/tmp/transcript.jsonl",
	cwd: "/tmp",
};

const abortOptions = { signal: AbortSignal.timeout(5000) };

function createMockSession(
	overrides?: Partial<
		Pick<ChatSession, "contextWarningShown" | "onCompactionStart" | "onCompactionEnd">
	>,
): ChatSession {
	return {
		contextWarningShown: false,
		onCompactionStart: undefined,
		onCompactionEnd: undefined,
		...overrides,
	} as unknown as ChatSession;
}

describe("agent/hooks", () => {
	describe("buildPreCompactHook", () => {
		it("calls onCompactionStart and returns continue", async () => {
			const onCompactionStart = mock(() => {});
			const session = createMockSession({ onCompactionStart });
			const matcher = buildPreCompactHook(session);
			expect(matcher.hooks).toHaveLength(1);

			const input: PreCompactHookInput = {
				...baseHookFields,
				hook_event_name: "PreCompact",
				trigger: "auto",
				custom_instructions: null,
			};

			const hook = matcher.hooks[0];
			expect(hook).toBeDefined();
			const result = await hook?.(input, undefined, abortOptions);
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
			const session = createMockSession({
				contextWarningShown: true,
				onCompactionEnd,
			});
			const matcher = buildPostCompactHook(session);
			expect(matcher.hooks).toHaveLength(1);

			const input: PostCompactHookInput = {
				...baseHookFields,
				hook_event_name: "PostCompact",
				trigger: "auto",
				compact_summary: "Conversation was summarized.",
			};

			const hook = matcher.hooks[0];
			expect(hook).toBeDefined();
			const result = await hook?.(input, undefined, abortOptions);
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
		it("returns a record with PreCompact and PostCompact entries", () => {
			const session = createMockSession();
			const hooks = buildHooks(session);

			expect(hooks.PreCompact).toHaveLength(1);
			expect(hooks.PostCompact).toHaveLength(1);
		});
	});
});
