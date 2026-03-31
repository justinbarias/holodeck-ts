import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { resolve } from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// --- Mock setup: must be before importing chat module ---

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

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
	query: mock(() => createFakeQuery(currentFakeQueryOpts)),
}));

// --- Now import chat module (uses mocked SDK) ---

const { runChatCommand } = await import("../../../src/cli/commands/chat.js");

// --- Helpers ---

const FIXTURE_PATH = resolve(
	import.meta.dirname ?? ".",
	"../../fixtures/agents/valid-minimal.yaml",
);

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

function makeToolSummaryMessage(summary: string): SDKMessage {
	return {
		type: "tool_use_summary",
		summary,
		session_id: "sess-tool",
	} as never;
}

function makeCompactBoundaryMessage(): SDKMessage {
	return {
		type: "system",
		subtype: "compact_boundary",
		session_id: "sess-compact",
		summary: "Conversation was compacted.",
	} as never;
}

// --- Tests ---

const originalExitCode = process.exitCode;

afterEach(() => {
	mock.restore();
	process.exitCode = originalExitCode;
});

describe("cli/chat — context event rendering (T062-T063)", () => {
	it("T062: renders context warning to stderr when usage >= 80%", async () => {
		currentFakeQueryOpts = {
			messages: [makeInitMessage("sess-warn"), makeResultMessage("sess-warn")],
			contextUsage: { percentage: 85 },
		};

		const stderrSpy = spyOn(process.stderr, "write");
		spyOn(process.stdout, "write"); // suppress stdout

		await runChatCommand({ agent: FIXTURE_PATH, prompt: "test" });

		const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
		expect(stderr).toContain("Warning: Context usage at 85%");
		expect(stderr).toContain("older messages may be summarized soon");
	});

	it("T063: renders compaction notice to stderr", async () => {
		currentFakeQueryOpts = {
			messages: [
				makeInitMessage("sess-compact"),
				makeCompactBoundaryMessage(),
				makeResultMessage("sess-compact"),
			],
			contextUsage: { percentage: 50 },
		};

		const stderrSpy = spyOn(process.stderr, "write");
		spyOn(process.stdout, "write"); // suppress stdout

		await runChatCommand({ agent: FIXTURE_PATH, prompt: "test" });

		const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
		expect(stderr).toContain("Info: Conversation compacted");
		expect(stderr).toContain("older messages have been summarized");
	});
});

describe("cli/chat — tool event rendering (T068a-T069)", () => {
	it("T068a: renders tool_start to stderr", async () => {
		currentFakeQueryOpts = {
			messages: [
				makeInitMessage("sess-tool"),
				makeToolSummaryMessage("Calling Read..."),
				makeResultMessage("sess-tool"),
			],
		};

		const stderrSpy = spyOn(process.stderr, "write");
		spyOn(process.stdout, "write");

		await runChatCommand({ agent: FIXTURE_PATH, prompt: "test" });

		const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
		expect(stderr).toContain("\u27F3 Calling Read...");
	});

	it("T068b: renders tool_end done to stderr", async () => {
		currentFakeQueryOpts = {
			messages: [
				makeInitMessage("sess-tool"),
				makeToolSummaryMessage("Read done"),
				makeResultMessage("sess-tool"),
			],
		};

		const stderrSpy = spyOn(process.stderr, "write");
		spyOn(process.stdout, "write");

		await runChatCommand({ agent: FIXTURE_PATH, prompt: "test" });

		const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
		expect(stderr).toContain("\u2713 Read done");
	});

	it("T069: renders tool_end failed with error to stderr", async () => {
		currentFakeQueryOpts = {
			messages: [
				makeInitMessage("sess-tool"),
				makeToolSummaryMessage("Write failed: permission denied"),
				makeResultMessage("sess-tool"),
			],
		};

		const stderrSpy = spyOn(process.stderr, "write");
		spyOn(process.stdout, "write");

		await runChatCommand({ agent: FIXTURE_PATH, prompt: "test" });

		const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
		expect(stderr).toContain("\u2717 Write failed: permission denied");
	});
});
