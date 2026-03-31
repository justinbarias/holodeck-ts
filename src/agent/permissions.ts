import type { CanUseTool, PermissionMode, PermissionResult } from "@anthropic-ai/claude-agent-sdk";

export type PromptFn = (message: string) => Promise<boolean>;

export interface PermissionConfig {
	permissionMode: PermissionMode;
	canUseTool: CanUseTool | undefined;
}

export function createPermissionHandler(
	mode: "manual" | "acceptEdits" | "acceptAll" | undefined,
	promptFn?: PromptFn,
): PermissionConfig {
	switch (mode) {
		case "acceptEdits":
			return { permissionMode: "acceptEdits", canUseTool: undefined };
		case "acceptAll":
			return { permissionMode: "bypassPermissions", canUseTool: undefined };
		default: {
			if (!promptFn) {
				return {
					permissionMode: "default",
					canUseTool: async (): Promise<PermissionResult> => ({
						behavior: "deny",
						message: "No interactive prompt available to approve tool usage.",
					}),
				};
			}

			return {
				permissionMode: "default",
				canUseTool: async (toolName, _input, options): Promise<PermissionResult> => {
					const title = options.title ?? `Allow ${toolName}?`;
					const approved = await promptFn(title);
					if (approved) {
						return { behavior: "allow" };
					}
					return { behavior: "deny", message: "User denied permission." };
				},
			};
		}
	}
}
