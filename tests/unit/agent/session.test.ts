import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	closeSession,
	createChatSession,
	mapThinkingConfig,
	sendMessage,
} from "../../../src/agent/session.js";
import { AgentConfigSchema } from "../../../src/config/schema.js";

function createMinimalConfig(overrides?: Partial<unknown>) {
	const base = {
		name: "session-test",
		model: {
			provider: "anthropic",
			name: "claude-sonnet-4-20250514",
		},
		instructions: {
			inline: "You are helpful.",
		},
	};

	return AgentConfigSchema.parse({
		...base,
		...(overrides ?? {}),
	});
}

describe("agent/session", () => {
	it("creates a chat session in prompting state with inline instructions", async () => {
		const config = createMinimalConfig();
		const session = await createChatSession(config);

		expect(session.state).toBe("prompting");
		expect(session.systemPrompt).toBe("You are helpful.");
		expect(session.sessionId).toBeNull();
	});

	it("resolves instructions.file into system prompt", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "holodeck-session-"));
		const instructionPath = join(tempDir, "instructions.md");
		await Bun.write(instructionPath, "# Prompt\nFile-based prompt.");

		const config = createMinimalConfig({
			instructions: { file: instructionPath },
		});

		const session = await createChatSession(config);
		expect(session.systemPrompt).toContain("File-based prompt.");

		rmSync(tempDir, { recursive: true, force: true });
	});

	it("closeSession transitions state to exited", async () => {
		const config = createMinimalConfig();
		const session = await createChatSession(config);
		await closeSession(session);
		expect(session.state).toBe("exited");
	});

	it("sendMessage returns an async generator", async () => {
		const config = createMinimalConfig();
		const session = await createChatSession(config);
		const stream = sendMessage(session, "hello");

		expect(typeof stream[Symbol.asyncIterator]).toBe("function");
	});

	it("maps extended thinking config to sdk thinking config", () => {
		expect(mapThinkingConfig(undefined)).toEqual({ type: "disabled" });
		expect(mapThinkingConfig({ enabled: false })).toEqual({ type: "disabled" });
		expect(mapThinkingConfig({ enabled: true })).toEqual({ type: "enabled" });
		expect(mapThinkingConfig({ enabled: true, budget_tokens: 5000 })).toEqual({
			type: "enabled",
			budgetTokens: 5000,
		});
	});
});
