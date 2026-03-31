import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	closeSession,
	createChatSession,
	interruptResponse,
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

	// T075: closeSession() hardening tests
	describe("closeSession", () => {
		it("transitions prompting → exited", async () => {
			const session = await createChatSession(createMinimalConfig());
			expect(session.state).toBe("prompting");
			await closeSession(session);
			expect(session.state).toBe("exited");
		});

		it("is a no-op when already exited", async () => {
			const session = await createChatSession(createMinimalConfig());
			await closeSession(session);
			expect(session.state).toBe("exited");
			// Second call should not throw
			await closeSession(session);
			expect(session.state).toBe("exited");
		});

		it("is a no-op when state is shutting_down", async () => {
			const session = await createChatSession(createMinimalConfig());
			session.state = "shutting_down";
			await closeSession(session);
			// Should return early without changing state
			expect(session.state).toBe("shutting_down");
		});

		// T086: MCP cleanup — query.close() called
		it("calls query.close() when query is present", async () => {
			const session = await createChatSession(createMinimalConfig());
			let closeCalled = false;
			session.query = {
				close: () => {
					closeCalled = true;
				},
			} as unknown as typeof session.query;

			await closeSession(session);
			expect(closeCalled).toBe(true);
			expect(session.query).toBeNull();
			expect(session.state).toBe("exited");
		});

		// T086: MCP cleanup — no error when query is null
		it("does not error when query is null", async () => {
			const session = await createChatSession(createMinimalConfig());
			session.query = null;
			await closeSession(session);
			expect(session.state).toBe("exited");
		});

		// T088: double-close does not throw
		it("double-close does not throw", async () => {
			const session = await createChatSession(createMinimalConfig());
			await closeSession(session);
			await closeSession(session);
			expect(session.state).toBe("exited");
		});

		// T088: error during close still reaches exited state
		it("reaches exited state even if query.close() throws", async () => {
			const session = await createChatSession(createMinimalConfig());
			session.query = {
				close: () => {
					throw new Error("close failed");
				},
			} as unknown as typeof session.query;

			await closeSession(session);
			expect(session.state).toBe("exited");
			expect(session.query).toBeNull();
		});
	});

	// T077: interruptResponse() tests
	describe("interruptResponse", () => {
		it("transitions streaming → prompting", async () => {
			const session = await createChatSession(createMinimalConfig());
			session.state = "streaming";
			session.query = {
				interrupt: async () => {},
			} as unknown as typeof session.query;

			await interruptResponse(session);
			expect(session.state as string).toBe("prompting");
		});

		it("is a no-op when state is prompting", async () => {
			const session = await createChatSession(createMinimalConfig());
			expect(session.state).toBe("prompting");
			await interruptResponse(session);
			expect(session.state).toBe("prompting");
		});

		it("leaves session in usable prompting state after interrupt", async () => {
			const session = await createChatSession(createMinimalConfig());
			session.state = "streaming";
			session.query = {
				interrupt: async () => {},
			} as unknown as typeof session.query;

			await interruptResponse(session);
			expect(session.state as string).toBe("prompting");
			// Session should be usable (state is prompting)
			expect(session.sessionId).toBeDefined();
		});
	});
});
