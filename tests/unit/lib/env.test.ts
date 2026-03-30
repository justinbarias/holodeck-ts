import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHolodeckEnv, resolveEnvVars } from "../../../src/lib/env.js";

const originalHome = process.env.HOME;
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

	if (originalHome === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = originalHome;
	}
});

describe("env", () => {
	it("replaces env placeholders with environment values", () => {
		process.env.TEST_NAME = "holodeck";
		const resolved = resolveEnvVars("name=$" + "{TEST_NAME}");
		expect(resolved).toBe("name=holodeck");
	});

	it("substitutes missing vars with empty strings", () => {
		delete process.env.DOES_NOT_EXIST;
		const resolved = resolveEnvVars("x=$" + "{DOES_NOT_EXIST}");
		expect(resolved).toBe("x=");
	});

	it("supports adjacent and nested substitutions", () => {
		process.env.A = "alpha";
		process.env.B = "beta";
		process.env.C = "gamma";
		const resolved = resolveEnvVars("$" + "{A}" + "$" + "{B}-$" + "{C}");
		expect(resolved).toBe("alphabeta-gamma");
	});

	it("loads ~/.holodeck/.env without overriding existing variables", async () => {
		const home = mkdtempSync(join(tmpdir(), "holodeck-env-"));
		const holodeckDir = join(home, ".holodeck");
		mkdirSync(holodeckDir, { recursive: true });

		await Bun.write(
			join(holodeckDir, ".env"),
			[
				"NEW_KEY=from-home",
				"EXISTING_KEY=from-home",
				'QUOTED_DOUBLE="double value"',
				"QUOTED_SINGLE='single value'",
				"# comment",
				"INVALID_LINE",
			].join("\n"),
		);

		process.env.HOME = home;
		process.env.EXISTING_KEY = "from-shell";

		await loadHolodeckEnv();

		expect(process.env.NEW_KEY).toBe("from-home");
		expect(process.env.EXISTING_KEY).toBe("from-shell");
		expect(process.env.QUOTED_DOUBLE).toBe("double value");
		expect(process.env.QUOTED_SINGLE).toBe("single value");

		rmSync(home, { recursive: true, force: true });
	});

	it("handles missing ~/.holodeck/.env gracefully", async () => {
		const home = mkdtempSync(join(tmpdir(), "holodeck-env-empty-"));
		process.env.HOME = home;

		await expect(loadHolodeckEnv()).resolves.toBeUndefined();

		rmSync(home, { recursive: true, force: true });
	});
});
