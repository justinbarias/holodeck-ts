import { dirname, resolve } from "node:path";
import { parse } from "yaml";
import { ZodError } from "zod";
import { resolveEnvVars } from "../lib/env.js";
import { ConfigError, formatZodError, toErrorMessage } from "../lib/errors.js";
import { getModuleLogger } from "../lib/logger.js";
import { type AgentConfig, AgentConfigSchema } from "./schema.js";

const configLogger = getModuleLogger("config");

function toConfigError(error: unknown, message: string, filePath: string): ConfigError {
	if (error instanceof ConfigError) {
		return error;
	}

	if (error instanceof ZodError) {
		return new ConfigError(formatZodError(error, filePath), { cause: error });
	}

	return new ConfigError(message, {
		cause: error instanceof Error ? error : new Error(toErrorMessage(error)),
	});
}

export async function loadAgentConfig(path: string): Promise<AgentConfig> {
	const absoluteConfigPath = resolve(path);
	const configFile = Bun.file(absoluteConfigPath);

	if (!(await configFile.exists())) {
		throw new ConfigError(`Agent configuration file not found: ${absoluteConfigPath}`);
	}

	try {
		const rawYaml = await configFile.text();
		const resolvedYaml = resolveEnvVars(rawYaml);
		const parsedYaml = parse(resolvedYaml) as unknown;
		const config = AgentConfigSchema.parse(parsedYaml);

		if (config.instructions.file) {
			const instructionsPath = resolve(dirname(absoluteConfigPath), config.instructions.file);
			const instructionsFile = Bun.file(instructionsPath);

			if (!(await instructionsFile.exists())) {
				throw new ConfigError(`Instructions file not found: ${instructionsPath}`);
			}

			config.instructions = {
				file: instructionsPath,
			};
		}

		configLogger.info("Loaded agent config: {name} (model: {model}).", {
			name: config.name,
			model: config.model.name,
			path: absoluteConfigPath,
		});
		return config;
	} catch (error) {
		throw toConfigError(
			error,
			`Failed to load agent configuration from ${absoluteConfigPath}`,
			absoluteConfigPath,
		);
	}
}
