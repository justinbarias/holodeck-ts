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

export interface LoggingOptions {
	verbose: boolean;
	tui?: boolean;
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

export async function setupLogging(options: LoggingOptions): Promise<void> {
	const key = `${options.verbose}-${options.tui}`;
	if (initialized && initializedKey === key) {
		return;
	}

	const appLevel: LogLevel = options.verbose ? "debug" : "info";

	const sinks: Record<string, Sink> = options.tui
		? { file: getFileSink() }
		: { stderr: getStderrSink() };

	const sinkName = options.tui ? "file" : "stderr";

	await configure({
		reset: true,
		sinks,
		loggers: [
			{
				category: ["holodeck"],
				sinks: [sinkName],
				lowestLevel: appLevel,
			},
			{
				category: ["logtape"],
				sinks: [sinkName],
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
