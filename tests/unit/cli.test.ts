import { describe, expect, it } from "bun:test";
import { VERSION } from "../../src/index.js";

describe("holodeck-ts", () => {
	it("exports a version string", () => {
		expect(VERSION).toBe("0.1.0");
	});

	it("version matches package.json", async () => {
		const pkg = await Bun.file("package.json").json();
		expect(VERSION).toBe(pkg.version);
	});
});
