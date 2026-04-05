import { afterEach, describe, expect, it } from "bun:test";
import { LoggerProvider } from "@opentelemetry/sdk-logs";
import type { ObservabilityConfig } from "../../../src/config/schema.js";
import {
	getActiveLoggerProvider,
	initOtelLoggerProvider,
	shutdownOtel,
} from "../../../src/otel/setup.js";

const baseConfig: ObservabilityConfig = {
	enabled: true,
	service_name: "test-service",
	exporters: {
		otlp: {
			enabled: true,
			endpoint: "http://localhost:4318",
			protocol: "http",
		},
	},
};

afterEach(async () => {
	await shutdownOtel();
});

describe("otel/setup", () => {
	it("initOtelLoggerProvider returns a LoggerProvider", () => {
		const provider = initOtelLoggerProvider(baseConfig);
		expect(provider).toBeInstanceOf(LoggerProvider);
	});

	it("tracks active provider", () => {
		expect(getActiveLoggerProvider()).toBeUndefined();
		initOtelLoggerProvider(baseConfig);
		expect(getActiveLoggerProvider()).toBeInstanceOf(LoggerProvider);
	});

	it("shutdownOtel is idempotent", async () => {
		await shutdownOtel();
		await shutdownOtel();
		expect(getActiveLoggerProvider()).toBeUndefined();
	});

	it("shutdownOtel clears active provider", async () => {
		initOtelLoggerProvider(baseConfig);
		expect(getActiveLoggerProvider()).toBeDefined();
		await shutdownOtel();
		expect(getActiveLoggerProvider()).toBeUndefined();
	});

	it("double-init shuts down first provider", () => {
		const first = initOtelLoggerProvider(baseConfig);
		const second = initOtelLoggerProvider(baseConfig);
		expect(second).not.toBe(first);
		expect(getActiveLoggerProvider()).toBe(second);
	});

	it("uses default endpoint when not specified", () => {
		const config: ObservabilityConfig = { enabled: true };
		const provider = initOtelLoggerProvider(config);
		expect(provider).toBeInstanceOf(LoggerProvider);
	});

	it("uses default service name when not specified", () => {
		const config: ObservabilityConfig = { enabled: true };
		const provider = initOtelLoggerProvider(config);
		expect(provider).toBeInstanceOf(LoggerProvider);
	});
});
