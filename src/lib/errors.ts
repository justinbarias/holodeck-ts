import type { ZodError, ZodIssue } from "zod";

export class HoloDeckError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "HoloDeckError";
	}
}

export class ConfigError extends HoloDeckError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ConfigError";
	}
}

export class ToolError extends HoloDeckError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ToolError";
	}
}

export class HoloDeckEvalError extends HoloDeckError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "HoloDeckEvalError";
	}
}

function formatIssuePath(issue: ZodIssue): string {
	if (issue.path.length === 0) {
		return "(root)";
	}

	return issue.path
		.map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
		.join(".")
		.replaceAll(".[", "[");
}

export function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function formatZodError(error: ZodError, filePath: string): string {
	const lines = [`Error: Invalid configuration in ${filePath}`];

	for (const issue of error.issues) {
		lines.push(`  -> ${formatIssuePath(issue)}: ${issue.message}`);
	}

	return lines.join("\n");
}
