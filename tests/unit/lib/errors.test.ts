import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { ConfigError, formatZodError, HoloDeckError, ToolError } from "../../../src/lib/errors.js";

describe("errors", () => {
	it("keeps inheritance hierarchy and cause chaining", () => {
		const rootCause = new Error("root");
		const configError = new ConfigError("bad config", { cause: rootCause });
		const toolError = new ToolError("tool failed");

		expect(configError).toBeInstanceOf(ConfigError);
		expect(configError).toBeInstanceOf(HoloDeckError);
		expect(configError.cause).toBe(rootCause);
		expect(toolError).toBeInstanceOf(ToolError);
		expect(toolError).toBeInstanceOf(HoloDeckError);
	});

	it("formats zod validation issues with file path and field path", () => {
		const schema = z.object({
			model: z.object({
				temperature: z.number().max(2),
			}),
		});

		const result = schema.safeParse({
			model: {
				temperature: 5,
			},
		});

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error("Expected zod parse failure");
		}

		const output = formatZodError(result.error, "/tmp/agent.yaml");
		expect(output).toContain("Error: Invalid configuration in /tmp/agent.yaml");
		expect(output).toContain("-> model.temperature:");
		expect(output.toLowerCase()).toContain("expected number");
	});
});
