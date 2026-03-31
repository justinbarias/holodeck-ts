import type {
	HookCallbackMatcher,
	HookEvent,
	HookInput,
	PostCompactHookInput,
	PostToolUseFailureHookInput,
	PostToolUseHookInput,
	PreCompactHookInput,
	PreToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import { getModuleLogger } from "../lib/logger.js";
import type { ChatSession } from "./session.js";

const hooksLogger = getModuleLogger("hooks");

export function buildPreToolUseHook(session: ChatSession): HookCallbackMatcher {
	return {
		hooks: [
			async (input: HookInput) => {
				const { tool_name, tool_input, tool_use_id } = input as PreToolUseHookInput;
				session.lastToolInvocation = {
					toolName: tool_name,
					args: tool_input,
					result: null,
					status: "calling",
					timestamp: new Date(),
					toolUseId: tool_use_id,
				};
				hooksLogger.info("Tool {tool} invoked (toolUseId: {id}).", {
					tool: tool_name,
					id: tool_use_id,
				});
				return { continue: true };
			},
		],
	};
}

export function buildPostToolUseHook(session: ChatSession): HookCallbackMatcher {
	return {
		hooks: [
			async (input: HookInput) => {
				const { tool_name, tool_response, tool_use_id } = input as PostToolUseHookInput;
				if (session.lastToolInvocation?.toolUseId === tool_use_id) {
					session.lastToolInvocation.result = tool_response;
					session.lastToolInvocation.status = "done";
					session.lastToolInvocation.timestamp = new Date();
				} else {
					session.lastToolInvocation = {
						toolName: tool_name,
						args: null,
						result: tool_response,
						status: "done",
						timestamp: new Date(),
						toolUseId: tool_use_id,
					};
				}
				hooksLogger.info("Tool {tool} completed (toolUseId: {id}).", {
					tool: tool_name,
					id: tool_use_id,
				});
				return { continue: true };
			},
		],
	};
}

export function buildPostToolUseFailureHook(session: ChatSession): HookCallbackMatcher {
	return {
		hooks: [
			async (input: HookInput) => {
				const { tool_name, tool_use_id, error, tool_input } = input as PostToolUseFailureHookInput;
				session.lastToolInvocation = {
					toolName: tool_name,
					args: tool_input,
					result: error,
					status: "failed",
					timestamp: new Date(),
					toolUseId: tool_use_id,
				};
				hooksLogger.warn("Tool {tool} failed: {error}", { tool: tool_name, error });
				return { continue: true };
			},
		],
	};
}

export function buildPreCompactHook(session: ChatSession): HookCallbackMatcher {
	return {
		hooks: [
			async (input: HookInput) => {
				session.onCompactionStart?.();
				const { trigger } = input as PreCompactHookInput;
				hooksLogger.info("Context compaction initiated (trigger: {trigger}).", { trigger });
				return { continue: true };
			},
		],
	};
}

export function buildPostCompactHook(session: ChatSession): HookCallbackMatcher {
	return {
		hooks: [
			async (input: HookInput) => {
				session.onCompactionEnd?.();
				const { trigger, compact_summary } = input as PostCompactHookInput;
				hooksLogger.info(
					"Context compaction completed (trigger: {trigger}, summary length: {len}).",
					{ trigger, len: compact_summary.length },
				);
				session.contextWarningShown = false;
				return { continue: true };
			},
		],
	};
}

export function buildHooks(
	session: ChatSession,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
	return {
		PreToolUse: [buildPreToolUseHook(session)],
		PostToolUse: [buildPostToolUseHook(session)],
		PostToolUseFailure: [buildPostToolUseFailureHook(session)],
		PreCompact: [buildPreCompactHook(session)],
		PostCompact: [buildPostCompactHook(session)],
	};
}
