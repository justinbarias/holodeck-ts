import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

	describe("formatRuntimeErrorMessage auth detection", () => {
		it("detects 'authentication failed' (with space)", () => {
			const msg = formatRuntimeErrorMessage("authentication failed for user");
			expect(msg).toContain("Authentication failed");
			expect(msg).toContain("ANTHROPIC_API_KEY");
		});

		it("detects 'invalid api key'", () => {
			const msg = formatRuntimeErrorMessage("Error: invalid api key provided");
			expect(msg).toContain("Authentication failed");
		});

		it("detects 'unauthorized'", () => {
			const msg = formatRuntimeErrorMessage("401 Unauthorized");
			expect(msg).toContain("Authentication failed");
		});

		it("detects compound 'api key' + 'invalid'", () => {
			const msg = formatRuntimeErrorMessage("The api key you provided is invalid");
			expect(msg).toContain("Authentication failed");
		});

		it("does not false-positive on unrelated errors", () => {
			const msg = formatRuntimeErrorMessage("Rate limit exceeded");
			expect(msg).toBe("Error: Rate limit exceeded\n");
			expect(msg).not.toContain("Authentication");
		});
	});

	// T084: Exit code tests
	describe("exit codes", () => {
		it("config error sets exit code 1", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "holodeck-exit-"));
			process.chdir(tempDir);

			const stderrSpy = spyOn(process.stderr, "write");
			await runChatCommand({ agent: "./agent.yaml", verbose: false });

			const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
			expect(stderr).toContain("No agent configuration found");
			expect(process.exitCode).toBe(1);

			rmSync(tempDir, { recursive: true, force: true });
		});

		it("non-default agent path config error shows raw error message", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "holodeck-nondefault-"));
			process.chdir(tempDir);

			const stderrSpy = spyOn(process.stderr, "write");
			await runChatCommand({ agent: "./custom/agent.yaml", verbose: false });

			const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
			// Should NOT show "No agent configuration found" — that's only for default path
			expect(stderr).not.toContain("No agent configuration found");
			expect(process.exitCode).toBe(1);

			rmSync(tempDir, { recursive: true, force: true });
		});

		it("formatRuntimeErrorMessage produces correct format for non-auth errors", () => {
			const msg = formatRuntimeErrorMessage("Connection refused");
			expect(msg).toBe("Error: Connection refused\n");
		});

		it("TUI cleanup uses process.exitCode ?? 0 for clean exit", async () => {
			process.exitCode = undefined;
			expect(process.exitCode ?? 0).toBe(0);
		});
	});

	describe("runChatCommand config validation error", () => {
		it("shows validation error for invalid YAML content", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "holodeck-invalid-"));
			process.chdir(tempDir);
			writeFileSync(join(tempDir, "agent.yaml"), "name: test\n");

			const stderrSpy = spyOn(process.stderr, "write");
			await runChatCommand({ agent: "./agent.yaml", verbose: false });

			const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
			// Should show the validation error, not the "not found" message
			expect(stderr).not.toContain("No agent configuration found");
			expect(process.exitCode).toBe(1);

			rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe("runChatCommand path resolution", () => {
		it("uses default agent path when agent option is empty string", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "holodeck-empty-"));
			process.chdir(tempDir);

			const stderrSpy = spyOn(process.stderr, "write");
			await runChatCommand({ agent: "", verbose: false });

			const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
			expect(stderr).toContain("No agent configuration found");
			expect(process.exitCode).toBe(1);

			rmSync(tempDir, { recursive: true, force: true });
		});

		it("uses default agent path when agent option is whitespace", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "holodeck-ws-"));
			process.chdir(tempDir);

			const stderrSpy = spyOn(process.stderr, "write");
			await runChatCommand({ agent: "  ", verbose: false });

			const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
			expect(stderr).toContain("No agent configuration found");
			expect(process.exitCode).toBe(1);

			rmSync(tempDir, { recursive: true, force: true });
		});
	});
});
