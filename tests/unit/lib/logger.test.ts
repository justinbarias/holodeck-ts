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

	it("does not add otel sink when observability is undefined", async () => {
		await setupLogging({ verbose: false, observability: undefined });
		const config = getConfig();
		expect(config?.sinks).not.toHaveProperty("otel");
	});

	it("does not add otel sink when observability.enabled is false", async () => {
		await setupLogging({
			verbose: false,
			observability: { enabled: false },
		});
		const config = getConfig();
		expect(config?.sinks).not.toHaveProperty("otel");
	});

	it("adds otel sink when observability is fully enabled", async () => {
		await setupLogging({
			verbose: false,
			observability: {
				enabled: true,
				exporters: { otlp: { enabled: true, endpoint: "http://localhost:4318", protocol: "http" } },
			},
		});
		const config = getConfig();
		expect(config?.sinks).toHaveProperty("otel");

		const holodeckLogger = config?.loggers.find((entry) =>
			Array.isArray(entry.category)
				? entry.category.join(".") === "holodeck"
				: entry.category === "holodeck",
		);
		expect(holodeckLogger?.sinks).toContain("otel");
	});

	it("does not add otel sink to logtape category (prevents recursion)", async () => {
		await setupLogging({
			verbose: false,
			observability: {
				enabled: true,
				exporters: { otlp: { enabled: true, endpoint: "http://localhost:4318", protocol: "http" } },
			},
		});
		const config = getConfig();
		const logtapeLogger = config?.loggers.find((entry) =>
			Array.isArray(entry.category)
				? entry.category.join(".") === "logtape"
				: entry.category === "logtape",
		);
		expect(logtapeLogger?.sinks).not.toContain("otel");
	});
});
