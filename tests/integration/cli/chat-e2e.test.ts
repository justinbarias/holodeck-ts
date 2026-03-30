// tests/integration/cli/chat-e2e.test.ts
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

const CLI_PATH = resolve(import.meta.dir, "../../../src/cli/index.ts");
const FIXTURE_PATH = resolve(import.meta.dir, "../../fixtures/agents/e2e-minimal.yaml");

const hasCredentials = Boolean(
	process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
);

async function runCli(
	args: string[],
	envOverrides: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(["bun", CLI_PATH, ...args], {
		env: {
			...process.env,
			CLAUDECODE: "",
			...envOverrides,
		},
		stdout: "pipe",
		stderr: "pipe",
	});

	const exitCode = await proc.exited;
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();

	return { exitCode, stdout, stderr };
}

describe.skipIf(!hasCredentials)("holodeck chat e2e", () => {
	it("returns output for single message via --prompt", async () => {
		const { exitCode, stdout, stderr } = await runCli([
			"chat",
			"--agent",
			FIXTURE_PATH,
			"-p",
			"Respond",
		]);

		expect(exitCode).toBe(0);
		expect(stdout.trim().length).toBeGreaterThan(0);
		expect(stderr).not.toContain("Error:");
	}, 30_000);

	it("returns deterministic response from temp-0 agent", async () => {
		const { exitCode, stdout } = await runCli(["chat", "--agent", FIXTURE_PATH, "-p", "Respond"]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("HOLODECK_E2E_OK");
	}, 30_000);

	it("exits 1 for invalid config path", async () => {
		const { exitCode, stderr } = await runCli([
			"chat",
			"--agent",
			"nonexistent-agent.yaml",
			"-p",
			"hello",
		]);

		expect(exitCode).toBe(1);
		expect(stderr.length).toBeGreaterThan(0);
	}, 10_000);

	it("exits with error for missing credentials", async () => {
		const { exitCode } = await runCli(["chat", "--agent", FIXTURE_PATH, "-p", "hello"], {
			ANTHROPIC_API_KEY: "",
			CLAUDE_CODE_OAUTH_TOKEN: "",
		});

		expect(exitCode).toBeGreaterThan(0);
	}, 15_000);

	it("streaming completes with non-empty output", async () => {
		const { exitCode, stdout } = await runCli([
			"chat",
			"--agent",
			FIXTURE_PATH,
			"-p",
			"Count to 3",
		]);

		expect(exitCode).toBe(0);
		expect(stdout.trim().length).toBeGreaterThan(0);
	}, 30_000);
});
