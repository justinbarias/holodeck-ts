import { describe, expect, it, mock } from "bun:test";
import { createPermissionHandler } from "../../../src/agent/permissions.js";

const abortOptions = {
	signal: AbortSignal.timeout(5000),
	toolUseID: "tu-test-001",
};

describe("agent/permissions createPermissionHandler", () => {
	it("T073/T074: acceptAll returns bypassPermissions with no canUseTool", () => {
		const result = createPermissionHandler("acceptAll");
		expect(result.permissionMode).toBe("bypassPermissions");
		expect(result.canUseTool).toBeUndefined();
	});

	it("T073/T074: acceptEdits returns acceptEdits with no canUseTool", () => {
		const result = createPermissionHandler("acceptEdits");
		expect(result.permissionMode).toBe("acceptEdits");
		expect(result.canUseTool).toBeUndefined();
	});

	it("T075: manual with promptFn returns default with canUseTool function", () => {
		const promptFn = mock(() => Promise.resolve(true));
		const result = createPermissionHandler("manual", promptFn);
		expect(result.permissionMode).toBe("default");
		expect(typeof result.canUseTool).toBe("function");
	});

	it("T076: canUseTool calls promptFn and returns allow when approved", async () => {
		const promptFn = mock(() => Promise.resolve(true));
		const { canUseTool } = createPermissionHandler("manual", promptFn);

		const result = await canUseTool?.("Read", { path: "file.ts" }, abortOptions);
		expect(promptFn).toHaveBeenCalledTimes(1);
		expect(result?.behavior).toBe("allow");
	});

	it("T077a: canUseTool returns deny when promptFn returns false", async () => {
		const promptFn = mock(() => Promise.resolve(false));
		const { canUseTool } = createPermissionHandler("manual", promptFn);

		const result = await canUseTool?.("Bash", { command: "rm -rf /" }, abortOptions);
		expect(result?.behavior).toBe("deny");
	});

	it("T077a: canUseTool uses options.title when available", async () => {
		const promptFn = mock(() => Promise.resolve(true));
		const { canUseTool } = createPermissionHandler("manual", promptFn);

		await canUseTool?.("Read", {}, { ...abortOptions, title: "Claude wants to read foo.ts" });
		expect(promptFn).toHaveBeenCalledWith("Claude wants to read foo.ts");
	});

	it("T077b: manual without promptFn auto-denies", async () => {
		const { canUseTool } = createPermissionHandler("manual");

		const result = await canUseTool?.("Read", { path: "file.ts" }, abortOptions);
		expect(result?.behavior).toBe("deny");
	});

	it("T077b: undefined mode without promptFn auto-denies", async () => {
		const { canUseTool } = createPermissionHandler(undefined);

		const result = await canUseTool?.("Read", {}, abortOptions);
		expect(result?.behavior).toBe("deny");
	});
});
