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
});
