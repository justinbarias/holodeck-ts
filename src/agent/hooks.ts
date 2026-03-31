import type {
	HookCallbackMatcher,
	HookEvent,
	HookInput,
	PostCompactHookInput,
	PreCompactHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import { getModuleLogger } from "../lib/logger.js";
import type { ChatSession } from "./session.js";

const hooksLogger = getModuleLogger("hooks");

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
		PreCompact: [buildPreCompactHook(session)],
		PostCompact: [buildPostCompactHook(session)],
	};
}
