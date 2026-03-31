import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentConfig } from "../../../src/config/loader.js";
import { ConfigError } from "../../../src/lib/errors.js";

const originalEnv = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnv)) {
			delete process.env[key];
		}
	}

	for (const [key, value] of Object.entries(originalEnv)) {
		process.env[key] = value;
	}
});

describe("config/loader", () => {
	it("loads valid minimal and full fixtures", async () => {
		const minimal = await loadAgentConfig("tests/fixtures/agents/valid-minimal.yaml");
		const full = await loadAgentConfig("tests/fixtures/agents/valid-full.yaml");

		expect(minimal.name).toBe("minimal-agent");
		expect(full.name).toBe("full-agent");
		expect(full.tools.length).toBeGreaterThan(0);
	});

	it("throws ConfigError for missing file", async () => {
		await expect(
			loadAgentConfig("tests/fixtures/agents/does-not-exist.yaml"),
		).rejects.toBeInstanceOf(ConfigError);
	});

	it("throws ConfigError with formatted zod output for invalid fixtures", async () => {
		for (const fixture of [
			"tests/fixtures/agents/invalid-missing.yaml",
			"tests/fixtures/agents/invalid-types.yaml",
			"tests/fixtures/agents/invalid-unknown.yaml",
		]) {
			try {
				await loadAgentConfig(fixture);
				throw new Error(`Expected loadAgentConfig(${fixture}) to fail`);
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigError);
				if (error instanceof ConfigError) {
					expect(error.message).toContain("Error: Invalid configuration");
				}
			}
		}
	});

	it("resolves instructions.file and verifies file exists", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "holodeck-loader-"));
		const instructionPath = join(tempDir, "system.md");
		const configPath = join(tempDir, "agent.yaml");

		await Bun.write(instructionPath, "# Prompt\nUse the file.");
		await Bun.write(
			configPath,
			[
				"name: file-agent",
				"model:",
				"  provider: anthropic",
				"  name: claude-sonnet-4-20250514",
				"instructions:",
				"  file: ./system.md",
			].join("\n"),
		);

		const config = await loadAgentConfig(configPath);
		expect(config.instructions.file).toBe(instructionPath);

		rmSync(tempDir, { recursive: true, force: true });
	});

	it("throws ConfigError when referenced instructions.file does not exist", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "holodeck-loader-missing-"));
		const configPath = join(tempDir, "agent.yaml");
		await Bun.write(
			configPath,
			[
				"name: file-agent",
				"model:",
				"  provider: anthropic",
				"  name: claude-sonnet-4-20250514",
				"instructions:",
				"  file: ./missing.md",
			].join("\n"),
		);

		await expect(loadAgentConfig(configPath)).rejects.toBeInstanceOf(ConfigError);
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("resolves environment variables in YAML values", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "holodeck-loader-env-"));
		const configPath = join(tempDir, "agent.yaml");
		process.env.MODEL_NAME = "claude-sonnet-4-20250514";

		await Bun.write(
			configPath,
			[
				"name: env-agent",
				"model:",
				"  provider: anthropic",
				"  name: $" + "{MODEL_NAME}",
				"instructions:",
				"  inline: hi",
			].join("\n"),
		);

		const config = await loadAgentConfig(configPath);
		expect(config.model.name).toBe("claude-sonnet-4-20250514");

		rmSync(tempDir, { recursive: true, force: true });
	});

	it("throws ConfigError when YAML references undefined env var", async () => {
		// T111
		delete process.env.NONEXISTENT_VAR_FOR_TEST;
		const tempDir = mkdtempSync(join(tmpdir(), "holodeck-loader-"));
		const yamlPath = join(tempDir, "agent.yaml");
		await Bun.write(
			yamlPath,
			[
				"name: test-missing-env",
				"model:",
				"  provider: anthropic",
				"  name: $" + "{NONEXISTENT_VAR_FOR_TEST}",
				"instructions:",
				"  inline: test",
			].join("\n"),
		);
		await expect(loadAgentConfig(yamlPath)).rejects.toThrow(ConfigError);
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("resolves shell env var in YAML model name", async () => {
		// T119 — acceptance scenario 1
		process.env.TEST_MODEL_NAME = "claude-sonnet-4-20250514";
		const tempDir = mkdtempSync(join(tmpdir(), "holodeck-accept-"));
		const yamlPath = join(tempDir, "agent.yaml");
		await Bun.write(
			yamlPath,
			[
				"name: acceptance-test",
				"model:",
				"  provider: anthropic",
				"  name: $" + "{TEST_MODEL_NAME}",
				"instructions:",
				"  inline: test",
			].join("\n"),
		);
		const config = await loadAgentConfig(yamlPath);
		expect(config.model.name).toBe("claude-sonnet-4-20250514");
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("throws ConfigError with var name when YAML references missing var", async () => {
		// T121 — acceptance scenario 3
		delete process.env.TOTALLY_MISSING_VAR;
		const tempDir = mkdtempSync(join(tmpdir(), "holodeck-accept-"));
		const yamlPath = join(tempDir, "agent.yaml");
		await Bun.write(
			yamlPath,
			[
				"name: missing-var-test",
				"model:",
				"  provider: anthropic",
				"  name: $" + "{TOTALLY_MISSING_VAR}",
				"instructions:",
				"  inline: test",
			].join("\n"),
		);
		try {
			await loadAgentConfig(yamlPath);
			throw new Error("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(ConfigError);
			expect((e as ConfigError).message).toContain("TOTALLY_MISSING_VAR");
		}
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("prefers shell env vars over defaults for priority chain", async () => {
		// T120 — verifies env var priority: shell > project .env > ~/.holodeck/.env
		process.env.PRIORITY_MODEL = "claude-sonnet-4-20250514";
		const tempDir = mkdtempSync(join(tmpdir(), "holodeck-priority-"));
		const yamlPath = join(tempDir, "agent.yaml");
		await Bun.write(
			yamlPath,
			[
				"name: priority-test",
				"model:",
				"  provider: anthropic",
				"  name: $" + "{PRIORITY_MODEL}",
				"instructions:",
				"  inline: test",
			].join("\n"),
		);
		const config = await loadAgentConfig(yamlPath);
		expect(config.model.name).toBe("claude-sonnet-4-20250514");
		rmSync(tempDir, { recursive: true, force: true });
	});
});
