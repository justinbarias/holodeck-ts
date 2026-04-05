import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	configure,
	defaultTextFormatter,
	getLogger,
	type Logger,
	type LogLevel,
	type Sink,
} from "@logtape/logtape";
import type { ObservabilityConfig } from "../config/schema.js";

export interface LoggingOptions {
	verbose: boolean;
	tui?: boolean;
	observability?: ObservabilityConfig;
}

let initialized = false;
let initializedKey = "";

const logPath = join(tmpdir(), "holodeck-debug.log");

export function getLogPath(): string {
	return logPath;
}

function getFileSink(): Sink {
	return (record) => {
		const text = defaultTextFormatter(record);
		appendFileSync(logPath, text);
	};
}

function getStderrSink(): Sink {
	return (record) => {
		const text = defaultTextFormatter(record);
		process.stderr.write(text);
	};
}

function isOtlpEnabled(obs: ObservabilityConfig | undefined): boolean {
	if (!obs?.enabled) return false;
	if (obs.logs?.enabled === false) return false;
	if (obs.exporters?.otlp?.enabled === false) return false;
	return true;
}

export async function setupLogging(options: LoggingOptions): Promise<void> {
	const otelFlag = isOtlpEnabled(options.observability) ? "otel" : "none";
	const key = `${options.verbose}-${options.tui}-${otelFlag}-${options.observability?.logs?.level ?? "default"}`;
	if (initialized && initializedKey === key) {
		return;
	}

	// Priority: --verbose flag → agent.yaml logs.level → default "info"
	const configLevel = options.observability?.logs?.level;
	const appLevel: LogLevel = options.verbose ? "debug" : (configLevel ?? "info");

	const sinks: Record<string, Sink> = options.tui
		? { file: getFileSink() }
		: { stderr: getStderrSink() };

	const localSinkName = options.tui ? "file" : "stderr";
	const holodeckSinks: string[] = [localSinkName];

	if (options.observability && isOtlpEnabled(options.observability)) {
		const { getOpenTelemetrySink } = await import("@logtape/otel");
		const { initOtelLoggerProvider } = await import("../otel/setup.js");

		const loggerProvider = initOtelLoggerProvider(options.observability);
		sinks.otel = getOpenTelemetrySink({ loggerProvider });
		holodeckSinks.push("otel");
	}

	await configure({
		reset: true,
		sinks,
		loggers: [
			{
				category: ["holodeck"],
				sinks: holodeckSinks,
				lowestLevel: appLevel,
			},
			{
				category: ["logtape"],
				sinks: [localSinkName],
				lowestLevel: "warning",
			},
		],
	});

	initialized = true;
	initializedKey = key;
}

export function getModuleLogger(moduleName: string): Logger {
	return getLogger(["holodeck", moduleName]);
}
