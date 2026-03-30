import { configure, getConsoleSink, getLogger, type Logger, type LogLevel } from "@logtape/logtape";

export interface LoggingOptions {
	verbose: boolean;
}

let initialized = false;
let initializedVerbose = false;

function writeToStderr(...args: unknown[]): void {
	process.stderr.write(`${args.join(" ")}\n`);
}

const stderrConsole = {
	debug: writeToStderr,
	error: writeToStderr,
	info: writeToStderr,
	log: writeToStderr,
	warn: writeToStderr,
	write: (message: string) => {
		process.stderr.write(message);
	},
} as unknown as Console;

export async function setupLogging(options: LoggingOptions): Promise<void> {
	if (initialized && initializedVerbose === options.verbose) {
		return;
	}

	const appLevel: LogLevel = options.verbose ? "debug" : "info";

	await configure({
		reset: true,
		sinks: {
			stderr: getConsoleSink({ console: stderrConsole }),
		},
		loggers: [
			{
				category: ["holodeck"],
				sinks: ["stderr"],
				lowestLevel: appLevel,
			},
			{
				category: ["logtape"],
				sinks: ["stderr"],
				lowestLevel: "warning",
			},
		],
	});

	initialized = true;
	initializedVerbose = options.verbose;
}

export function getModuleLogger(moduleName: string): Logger {
	return getLogger(["holodeck", moduleName]);
}
