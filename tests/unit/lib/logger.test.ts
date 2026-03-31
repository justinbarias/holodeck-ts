import { describe, expect, it } from "bun:test";
import { getConfig } from "@logtape/logtape";
import { getModuleLogger, setupLogging } from "../../../src/lib/logger.js";

describe("logger", () => {
	it("configures logtape without throwing", async () => {
		await expect(setupLogging({ verbose: false })).resolves.toBeUndefined();
		const config = getConfig();
		expect(config).not.toBeNull();
	});

	it("returns a module logger in the holodeck namespace", () => {
		const logger = getModuleLogger("config");
		expect(logger.category).toEqual(["holodeck", "config"]);
	});

	it("sets debug level for verbose mode", async () => {
		await setupLogging({ verbose: true });
		const config = getConfig();
		expect(config).not.toBeNull();

		const appLoggerConfig = config?.loggers.find((entry) =>
			Array.isArray(entry.category)
				? entry.category.join(".") === "holodeck"
				: entry.category === "holodeck",
		);

		expect(appLoggerConfig?.lowestLevel).toBe("debug");
	});
});
