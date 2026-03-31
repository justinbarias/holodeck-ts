import { describe, expect, it } from "bun:test";
import type { ToolInvocationRecord } from "../../../../src/agent/session.js";
import { formatToolInspection } from "../../../../src/cli/tui/app.js";

describe("tui/app formatToolInspection", () => {
	it("T070: returns 'No recent tool invocation' when null", () => {
		expect(formatToolInspection(null)).toBe("No recent tool invocation");
	});

	it("T071: formats calling invocation with args", () => {
		const record: ToolInvocationRecord = {
			toolName: "Read",
			args: { path: "file.ts" },
			result: null,
			status: "calling",
			timestamp: new Date(),
			toolUseId: "tu-123",
		};
		const output = formatToolInspection(record);
		expect(output).toContain("[calling] Read");
		expect(output).toContain('"path": "file.ts"');
		expect(output).toContain("Result: (none)");
	});

	it("T072: formats completed invocation with result", () => {
		const record: ToolInvocationRecord = {
			toolName: "Bash",
			args: { command: "ls" },
			result: { output: "file1.ts\nfile2.ts" },
			status: "done",
			timestamp: new Date(),
			toolUseId: "tu-456",
		};
		const output = formatToolInspection(record);
		expect(output).toContain("[done] Bash");
		expect(output).toContain('"command": "ls"');
		expect(output).toContain('"output": "file1.ts\\nfile2.ts"');
	});

	it("formats failed invocation with error string", () => {
		const record: ToolInvocationRecord = {
			toolName: "Write",
			args: { path: "/etc/passwd" },
			result: "Permission denied",
			status: "failed",
			timestamp: new Date(),
			toolUseId: "tu-789",
		};
		const output = formatToolInspection(record);
		expect(output).toContain("[failed] Write");
		expect(output).toContain("Permission denied");
	});
});
