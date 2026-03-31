import { ConfigError } from "./errors.js";
import { getModuleLogger } from "./logger.js";

const ENV_VAR_PATTERN = /\$\{(\w+)\}/g;
const envLogger = getModuleLogger("env");

function parseEnvLine(line: string): [key: string, value: string] | null {
	const trimmed = line.trim();

	if (trimmed.length === 0 || trimmed.startsWith("#")) {
		return null;
	}

	const separatorIndex = trimmed.indexOf("=");
	if (separatorIndex <= 0) {
		return null;
	}

	const key = trimmed.slice(0, separatorIndex).trim();
	if (key.length === 0) {
		return null;
	}

	let value = trimmed.slice(separatorIndex + 1).trim();
	const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
	const isSingleQuoted = value.startsWith("'") && value.endsWith("'");

	if ((isDoubleQuoted || isSingleQuoted) && value.length >= 2) {
		value = value.slice(1, -1);
	}

	return [key, value];
}

export function resolveEnvVars(input: string): string {
	const missing: string[] = [];

	for (const match of input.matchAll(ENV_VAR_PATTERN)) {
		const name = match[1] as string;
		if (process.env[name] === undefined) {
			missing.push(name);
		}
	}

	if (missing.length > 0) {
		throw new ConfigError(`Missing environment variables: ${missing.join(", ")}`);
	}

	return input.replace(ENV_VAR_PATTERN, (_match, name: string) => {
		const value = process.env[name];
		if (value === undefined) {
			return "";
		}
		return value;
	});
}

export async function loadHolodeckEnv(): Promise<void> {
	const homeDirectory = process.env.HOME;
	if (!homeDirectory) {
		envLogger.debug("HOME is not set; skipping ~/.holodeck/.env loading.");
		return;
	}

	const envPath = `${homeDirectory}/.holodeck/.env`;
	const file = Bun.file(envPath);

	if (!(await file.exists())) {
		envLogger.debug("No ~/.holodeck/.env found at {envPath}.", { envPath });
		return;
	}

	const raw = await file.text();
	const lines = raw.split(/\r?\n/);

	for (const line of lines) {
		const parsed = parseEnvLine(line);
		if (!parsed) {
			continue;
		}

		const [key, value] = parsed;
		if (process.env[key] !== undefined) {
			continue;
		}

		process.env[key] = value;
	}

	envLogger.debug("Loaded user-level environment defaults from {envPath}.", { envPath });
}
