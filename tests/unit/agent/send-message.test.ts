import { afterEach, describe, expect, it, mock } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChatEvent } from "../../../src/agent/streaming.js";

// --- Mock setup: must be before importing session module ---

interface FakeQueryOptions {
	messages: SDKMessage[];
	contextUsage?: { percentage: number };
}

function createFakeQuery(opts: FakeQueryOptions) {
	async function* generate(): AsyncGenerator<SDKMessage> {
		for (const m of opts.messages) {
			yield m;
		}
	}
	const gen = generate();
	return Object.assign(gen, {
		getContextUsage: mock(() =>
			Promise.resolve({
				categories: [],
				totalTokens: 8000,
				maxTokens: 10000,
				rawMaxTokens: 10000,
				percentage: opts.contextUsage?.percentage ?? 50,
			}),
		),
		interrupt: mock(() => Promise.resolve()),
		close: mock(() => {}),
	});
}

let currentFakeQueryOpts: FakeQueryOptions = { messages: [] };

const mockQueryFn = mock(() => createFakeQuery(currentFakeQueryOpts));

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
	query: mockQueryFn,
}));

// --- Now import session module (uses mocked SDK) ---

const { createChatSession, sendMessage } = await import("../../../src/agent/session.js");
const { AgentConfigSchema } = await import("../../../src/config/schema.js");

// --- Helpers ---

function getQueryCallOptions(callIndex: number): { resume?: string } {
	const call = (mockQueryFn.mock.calls as unknown[][])[callIndex];
	const arg = call?.[0] as { options: { resume?: string } };
	return arg.options;
}

function createMinimalConfig() {
	return AgentConfigSchema.parse({
		name: "session-test",
		model: { provider: "anthropic", name: "claude-sonnet-4-20250514" },
		instructions: { inline: "You are helpful." },
	});
}

function makeInitMessage(sessionId: string): SDKMessage {
	return {
		type: "system",
		subtype: "init",
		session_id: sessionId,
		apiKeySource: "ANTHROPIC_API_KEY",
		claude_code_version: "1.0.0",
		cwd: "/tmp",
		tools: [],
		mcp_servers: [],
		model: "claude-sonnet-4-20250514",
		permissionMode: "default",
		slash_commands: [],
		output_style: "text",
		skills: [],
		plugins: [],
		uuid: "uuid-init",
	} as never;
}

function makeResultMessage(sessionId: string): SDKMessage {
	return {
		type: "result",
		subtype: "success",
		session_id: sessionId,
		errors: [],
	} as never;
}

async function collectEvents(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
	const events: ChatEvent[] = [];
	for await (const e of gen) {
		events.push(e);
	}
	return events;
}

// --- Tests ---

describe("sendMessage — multi-turn session (T040-T043)", () => {
	afterEach(() => {
		mockQueryFn.mockClear();
	});

	it("T040: first turn sets sessionId from SDK response", async () => {
		currentFakeQueryOpts = {
			messages: [makeInitMessage("sess-1"), makeResultMessage("sess-1")],
		};

		const config = createMinimalConfig();
		const session = await createChatSession(config);
		expect(session.sessionId).toBeNull();

		await collectEvents(sendMessage(session, "hello"));

		expect(session.sessionId).toBe("sess-1");
	});

	it("T041: second turn passes resume: sessionId to query()", async () => {
		currentFakeQueryOpts = {
			messages: [makeInitMessage("sess-2"), makeResultMessage("sess-2")],
		};

		const config = createMinimalConfig();
		const session = await createChatSession(config);

		// First turn — sets sessionId
		await collectEvents(sendMessage(session, "hello"));
		expect(session.sessionId).toBe("sess-2");

		// Second turn — should pass resume
		mockQueryFn.mockClear();
		currentFakeQueryOpts = {
			messages: [makeResultMessage("sess-2")],
		};

		await collectEvents(sendMessage(session, "what is my name?"));

		expect(mockQueryFn).toHaveBeenCalledTimes(1);
		expect(getQueryCallOptions(0).resume).toBe("sess-2");
	});

	it("T042: sessionId remains null if SDK response has no session_id", async () => {
		// Only yield a result message, no system/init
		currentFakeQueryOpts = {
			messages: [makeResultMessage("sess-ignored")],
		};

		const config = createMinimalConfig();
		const session = await createChatSession(config);

		await collectEvents(sendMessage(session, "hello"));

		// sessionId is set via onSessionId callback from system/init, not from result
		expect(session.sessionId).toBeNull();
	});

	it("T043: 3+ turns preserve same sessionId", async () => {
		currentFakeQueryOpts = {
			messages: [makeInitMessage("sess-persist"), makeResultMessage("sess-persist")],
		};

		const config = createMinimalConfig();
		const session = await createChatSession(config);

		// Turn 1
		await collectEvents(sendMessage(session, "turn 1"));
		expect(session.sessionId).toBe("sess-persist");

		// Turn 2
		mockQueryFn.mockClear();
		currentFakeQueryOpts = { messages: [makeResultMessage("sess-persist")] };
		await collectEvents(sendMessage(session, "turn 2"));
		expect(session.sessionId).toBe("sess-persist");

		expect(getQueryCallOptions(0).resume).toBe("sess-persist");

		// Turn 3
		mockQueryFn.mockClear();
		currentFakeQueryOpts = { messages: [makeResultMessage("sess-persist")] };
		await collectEvents(sendMessage(session, "turn 3"));
		expect(session.sessionId).toBe("sess-persist");

		expect(getQueryCallOptions(0).resume).toBe("sess-persist");
	});
});

describe("sendMessage — context warning (T048-T051)", () => {
	afterEach(() => {
		mockQueryFn.mockClear();
	});

	it("T048: emits context_warning when usage >= 80%", async () => {
		currentFakeQueryOpts = {
			messages: [makeInitMessage("sess-ctx"), makeResultMessage("sess-ctx")],
			contextUsage: { percentage: 85 },
		};

		const config = createMinimalConfig();
		const session = await createChatSession(config);

		const events = await collectEvents(sendMessage(session, "hello"));

		const warnings = events.filter((e) => e.type === "context_warning");
		expect(warnings).toHaveLength(1);
		expect((warnings[0] as { type: "context_warning"; ratio: number }).ratio).toBeCloseTo(0.85);
	});

	it("T049: context_warning emitted only once per session", async () => {
		currentFakeQueryOpts = {
			messages: [makeInitMessage("sess-once"), makeResultMessage("sess-once")],
			contextUsage: { percentage: 90 },
		};

		const config = createMinimalConfig();
		const session = await createChatSession(config);

		// Turn 1 — should emit warning
		const events1 = await collectEvents(sendMessage(session, "turn 1"));
		expect(events1.filter((e) => e.type === "context_warning")).toHaveLength(1);

		// Turn 2 — should NOT emit warning again
		mockQueryFn.mockClear();
		currentFakeQueryOpts = {
			messages: [makeResultMessage("sess-once")],
			contextUsage: { percentage: 92 },
		};

		const events2 = await collectEvents(sendMessage(session, "turn 2"));
		expect(events2.filter((e) => e.type === "context_warning")).toHaveLength(0);
	});

	it("T050: no context_warning when usage < 80%", async () => {
		currentFakeQueryOpts = {
			messages: [makeInitMessage("sess-low"), makeResultMessage("sess-low")],
			contextUsage: { percentage: 50 },
		};

		const config = createMinimalConfig();
		const session = await createChatSession(config);

		const events = await collectEvents(sendMessage(session, "hello"));

		expect(events.filter((e) => e.type === "context_warning")).toHaveLength(0);
	});

	it("T051: contextUsage is updated after each turn", async () => {
		currentFakeQueryOpts = {
			messages: [makeInitMessage("sess-usage"), makeResultMessage("sess-usage")],
			contextUsage: { percentage: 65 },
		};

		const config = createMinimalConfig();
		const session = await createChatSession(config);
		expect(session.contextUsage).toBeNull();

		await collectEvents(sendMessage(session, "hello"));

		expect(session.contextUsage).not.toBeNull();
		expect(session.contextUsage?.percentage).toBe(65);
	});
});
