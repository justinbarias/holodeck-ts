import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHolodeckEnv, resolveEnvVars } from "../../../src/lib/env.js";
import { ConfigError } from "../../../src/lib/errors.js";

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
	// ── resolveEnvVars ──────────────────────────────────────────────────

	it("replaces env placeholders with environment values", () => {
		process.env.TEST_NAME = "holodeck";
		const resolved = resolveEnvVars("name=$" + "{TEST_NAME}");
		expect(resolved).toBe("name=holodeck");
	});

	it("passes through strings with no env var references unchanged", () => {
		// T097
		const input = "no variables here, just plain text";
		expect(resolveEnvVars(input)).toBe(input);
	});

	it("throws ConfigError for missing environment variables", () => {
		// Updated from old "substitutes missing vars with empty strings" — now throws
		delete process.env.DOES_NOT_EXIST;
		expect(() => resolveEnvVars("x=$" + "{DOES_NOT_EXIST}")).toThrow(ConfigError);
	});

	it("throws ConfigError listing missing var name", () => {
		// T098
		delete process.env.MISSING_VAR_XYZ;
		expect(() => resolveEnvVars("key=$" + "{MISSING_VAR_XYZ}")).toThrow(ConfigError);
		try {
			resolveEnvVars("key=$" + "{MISSING_VAR_XYZ}");
		} catch (e) {
			expect((e as ConfigError).message).toContain("MISSING_VAR_XYZ");
		}
	});

	it("collects ALL missing vars in a single error", () => {
		// T099
		delete process.env.MISS_A;
		delete process.env.MISS_B;
		try {
			resolveEnvVars("$" + "{MISS_A} and $" + "{MISS_B}");
			throw new Error("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(ConfigError);
			const msg = (e as ConfigError).message;
			expect(msg).toContain("MISS_A");
			expect(msg).toContain("MISS_B");
		}
	});

	it("supports adjacent and nested substitutions", () => {
		process.env.A = "alpha";
		process.env.B = "beta";
		process.env.C = "gamma";
		const resolved = resolveEnvVars("$" + "{A}" + "$" + "{B}-$" + "{C}");
		expect(resolved).toBe("alphabeta-gamma");
	});

	// ── Edge cases (T116, T117, T118) ───────────────────────────────────

	it("substitutes empty string for var set to empty, does not throw", () => {
		// T116
		process.env.EMPTY_VAR = "";
		const result = resolveEnvVars("value=$" + "{EMPTY_VAR}");
		expect(result).toBe("value=");
	});

	it("does not attempt nested resolution for nested env var syntax", () => {
		// T117 — regex matches INNER inside, OUTER_ prefix stays literal
		process.env.INNER = "resolved";
		const input = "$" + "{OUTER_$" + "{INNER}}";
		// Regex \$\{(\w+)\} starting at pos 0: captures OUTER_ but next char is $, not },
		// so no match at pos 0. Then INNER matches and gets replaced.
		// Result: "${OUTER_resolved}" — no further match since already replaced.
		const result = resolveEnvVars(input);
		expect(result).toContain("OUTER_");
	});

	it("does not substitute literal dollar signs that are not env refs", () => {
		// T118
		process.env.VAR = "value";
		// $VAR (no braces) should not be substituted
		expect(resolveEnvVars("$VAR")).toBe("$VAR");
		// Escaped-looking patterns
		expect(resolveEnvVars("$$")).toBe("$$");
	});

	// ── loadHolodeckEnv ─────────────────────────────────────────────────

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

	it("does not override vars simulating project-level .env", async () => {
		// T103
		const home = mkdtempSync(join(tmpdir(), "holodeck-env-"));
		const holodeckDir = join(home, ".holodeck");
		mkdirSync(holodeckDir, { recursive: true });
		await Bun.write(join(holodeckDir, ".env"), "PROJECT_VAR=from-holodeck");

		process.env.HOME = home;
		process.env.PROJECT_VAR = "from-project-env";

		await loadHolodeckEnv();

		expect(process.env.PROJECT_VAR).toBe("from-project-env");
		rmSync(home, { recursive: true, force: true });
	});

	it("handles empty ~/.holodeck/.env file gracefully", async () => {
		// T105
		const home = mkdtempSync(join(tmpdir(), "holodeck-env-empty-file-"));
		const holodeckDir = join(home, ".holodeck");
		mkdirSync(holodeckDir, { recursive: true });
		await Bun.write(join(holodeckDir, ".env"), "");

		process.env.HOME = home;
		await expect(loadHolodeckEnv()).resolves.toBeUndefined();
		rmSync(home, { recursive: true, force: true });
	});
});
