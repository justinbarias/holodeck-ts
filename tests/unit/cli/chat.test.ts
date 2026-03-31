import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	AGENT_RESPONSE_PREFIX,
	chatCommand,
	FAREWELL_MESSAGE,
	formatRuntimeErrorMessage,
	runChatCommand,
	USER_PROMPT_PREFIX,
} from "../../../src/cli/commands/chat.js";

const originalCwd = process.cwd();

afterEach(() => {
	mock.restore();
	process.chdir(originalCwd);
	process.exitCode = 0;
});

describe("cli/chat command", () => {
	it("builds a command named chat with expected options", () => {
		const command = chatCommand();
		expect(command.name()).toBe("chat");

		const agentOption = command.options.find((option) => option.long === "--agent");
		const verboseOption = command.options.find((option) => option.long === "--verbose");

		expect(agentOption?.defaultValue).toBe("./agent.yaml");
		expect(verboseOption?.defaultValue).toBe(false);
	});

	it("prints missing default config error and sets exit code 1", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "holodeck-chat-cmd-"));
		process.chdir(tempDir);

		const stderrSpy = spyOn(process.stderr, "write");
		await runChatCommand({ agent: "./agent.yaml", verbose: false });

		const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
		expect(stderr).toContain("No agent configuration found");
		expect(process.exitCode).toBe(1);

		rmSync(tempDir, { recursive: true, force: true });
	});

	it("formats authentication failures distinctly from other runtime errors", () => {
		const auth = formatRuntimeErrorMessage("authentication_failed");
		expect(auth).toBe(
			"Error: Authentication failed — invalid or expired credentials.\n" +
				"  Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.\n" +
				"  For Ollama/custom endpoints, set ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN.\n",
		);

		const network = formatRuntimeErrorMessage("Network timeout");
		expect(network).toBe("Error: Network timeout\n");
	});

	it("registers -p/--prompt option and positional message argument", () => {
		const command = chatCommand();
		const promptOption = command.options.find((option) => option.long === "--prompt");
		expect(promptOption).toBeDefined();
		expect(promptOption?.short).toBe("-p");

		const args = command.registeredArguments;
		expect(args).toHaveLength(1);
		expect(args[0]?.name()).toBe("message");
		expect(args[0]?.required).toBe(false);
	});

	it("exposes prompt and farewell strings required by the CLI contract", () => {
		expect(USER_PROMPT_PREFIX).toBe("You: ");
		expect(AGENT_RESPONSE_PREFIX).toBe("Agent: ");
		expect(FAREWELL_MESSAGE).toBe("Goodbye!");
	});
});
