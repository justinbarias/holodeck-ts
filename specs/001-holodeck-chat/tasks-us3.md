# Tasks: User Story 3 - Agent with MCP Tools

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29
**User Story**: US3 - Agent with MCP Tools (Priority: P2)
**Prereqs**: Setup, Foundational, and US1/US2 tasks are complete. Assumes `AgentConfigSchema`, `MCPToolSchema`, `ChatSession`, `ChatEvent`, `mapSDKMessages`, `sendMessage`, `createChatSession`, and the interactive chat loop in `chat.ts` all exist and work.

**FRs covered**: FR-008, FR-012, FR-015, FR-016, FR-017

> **Note**: Task IDs are scoped to this file. Cross-file references use the format `tasks-usX.md#TXXX`.

---

## Phase 1: MCP Config Mapping

- [ ] T055 [P2] [US3] Write tests for `buildMCPServers()` — stdio transport mapping in `tests/unit/tools/mcp.test.ts`
- [ ] T056 [P2] [US3] Write tests for `buildMCPServers()` — HTTP/SSE transport mapping in `tests/unit/tools/mcp.test.ts`
- [ ] T057 [P2] [US3] Write tests for `buildMCPServers()` — filters out non-MCP tools, returns empty record for no MCP tools in `tests/unit/tools/mcp.test.ts`
- [ ] T058 [P2] [US3] Write tests for `buildMCPServers()` — env vars and args pass-through, request_timeout mapping in `tests/unit/tools/mcp.test.ts`
- [ ] T059 [P2] [US3] Implement `buildMCPServers(tools: Tool[]): Record<string, McpServerConfig>` in `src/tools/mcp.ts` — filter to `type === "mcp"`, map stdio to `{ type: "stdio", command, args, env }`, map sse/http to `{ type: transport, url, headers }`
- [ ] T060 [P2] [US3] Create test fixture `tests/fixtures/agents/valid-mcp-tools.yaml` with both stdio and HTTP/SSE MCP tool configs

## Phase 2: Tool Invocation Hooks

- [ ] T061 [P2] [US3] Write tests for `PreToolUse` hook — sets `session.lastToolInvocation` with status `"calling"` in `tests/unit/agent/hooks.test.ts`
- [ ] T062 [P2] [US3] Write tests for `PostToolUse` hook — updates `session.lastToolInvocation` with result and status `"done"` on success, `"failed"` on error; verify that `toolUseId` from the hook's `tool_use_id` parameter is stored on the `ToolInvocationRecord` in `tests/unit/agent/hooks.test.ts`
- [ ] T063 [P2] [US3] Implement `PreToolUse` hook in `buildHooks()` in `src/agent/hooks.ts` — create `ToolInvocationRecord` with status `"calling"`, set on `session.lastToolInvocation`
- [ ] T064 [P2] [US3] Implement `PostToolUse` hook in `buildHooks()` in `src/agent/hooks.ts` — update `session.lastToolInvocation` with `result`, `toolUseId`, set status to `"done"` or `"failed"` based on tool response

## Phase 3: Tool Event Streaming

- [ ] T065 [P2] [US3] Write tests for `mapSDKMessages` handling `SDKToolUseSummaryMessage` — yields `tool_start` and `tool_end` ChatEvents in `tests/unit/agent/streaming.test.ts`
- [ ] T066 [P2] [US3] Write tests for `mapSDKMessages` handling tool failure messages — yields `tool_end` with status `"failed"` and error string in `tests/unit/agent/streaming.test.ts`
- [ ] T067 [P2] [US3] Implement `SDKToolUseSummaryMessage` mapping in `mapSDKMessages()` in `src/agent/streaming.ts` — emit `{ type: "tool_start", toolName }` when tool begins, `{ type: "tool_end", toolName, status, error? }` when tool completes

## Phase 4: Tool Display Rendering

- [ ] T068a [P2] [US3] Write tests for tool display rendering — verify `tool_start` event outputs `⟳ Calling {toolName}...` to stderr and `tool_end` outputs `✓ {toolName} done` in `tests/unit/cli/chat.test.ts`
- [ ] T068b [P2] [US3] Write tests for tool display rendering — verify `tool_end` with `"failed"` status outputs `✗ {toolName} failed: {error}` to stderr in `tests/unit/cli/chat.test.ts`
- [ ] T068 [P2] [US3] Implement tool status rendering in the chat loop in `src/cli/commands/chat.ts` — on `tool_start` event write `⟳ Calling {toolName}...` to stderr, on `tool_end` write `✓ {toolName} done` or `✗ {toolName} failed: {error}`
- [ ] T069 [P2] [US3] Implement `tool_end` with `"failed"` status rendering — display `✗ {toolName} failed: {error}` and continue the conversation (FR-012)

## Phase 5: Tool Inspection (Ctrl+O)

- [ ] T070 [P2] [US3] Write tests for Ctrl+O inspection output formatting — given a `ToolInvocationRecord`, format tool name, JSON-pretty-printed args, and JSON-pretty-printed result in `tests/unit/cli/chat.test.ts`
- [ ] T071 [P2] [US3] Implement Ctrl+O keypress handler in the readline loop in `src/cli/commands/chat.ts` — when `session.lastToolInvocation` exists, display formatted tool name, args (JSON), result (JSON); when null, display "No recent tool invocation"
- [ ] T072 [P2] [US3] Wire Ctrl+O binding via `readline` keypress event or `process.stdin` raw mode handler in `src/cli/commands/chat.ts`
  > **Note**: Bun implements `node:readline` natively — this is the approved approach. Bun has no alternative readline API, so `import readline from "node:readline"` is correct for this runtime (see research.md).

## Phase 6: Permission Handler

- [ ] T073 [P2] [US3] Write tests for `createPermissionHandler("manual", promptFn)` — returns a `CanUseTool` callback that calls `promptFn` with tool name and args summary in `tests/unit/agent/permissions.test.ts`
- [ ] T074 [P2] [US3] Write tests for `createPermissionHandler("acceptEdits", ...)` and `createPermissionHandler("acceptAll", ...)` — both return `undefined` in `tests/unit/agent/permissions.test.ts`
- [ ] T075 [P2] [US3] Write tests for manual mode `CanUseTool` callback — returns allow on "y"/"Y"/empty, deny on "n"/"N" in `tests/unit/agent/permissions.test.ts`
- [ ] T076 [P2] [US3] Implement `createPermissionHandler(mode: string, promptFn: PromptFn): CanUseTool | undefined` in `src/agent/permissions.ts` — for `"manual"` return callback that formats `⟳ Agent wants to call: {tool}({args summary})\n  Allow? [Y/n]:` and invokes `promptFn`; for others return `undefined`
- [ ] T077 [P2] [US3] Define `PromptFn` type (`(message: string) => Promise<string>`) and export from `src/agent/permissions.ts`
- [ ] T077a [P2] [US3] Write tests for `mapPermissionMode()` SDK enum mapping — YAML `"manual"` returns `{ permissionMode: "default", canUseTool: <callback> }`, YAML `"acceptEdits"` returns `{ permissionMode: "acceptEdits", canUseTool: undefined }`, YAML `"acceptAll"` returns `{ permissionMode: "bypassPermissions", canUseTool: undefined }` in `tests/unit/agent/permissions.test.ts`
- [ ] T077b [P2] [US3] Implement `mapPermissionMode(mode: string, promptFn: PromptFn): { permissionMode: string; canUseTool: CanUseTool | undefined }` in `src/agent/permissions.ts` — map YAML `"manual"` to SDK `permissionMode: "default"` with a `canUseTool` callback via `createPermissionHandler`, map `"acceptEdits"` to SDK `permissionMode: "acceptEdits"`, map `"acceptAll"` to SDK `permissionMode: "bypassPermissions"`

## Phase 7: Session Integration

- [ ] T078 [P2] [US3] Wire `buildMCPServers(config.tools)` into `createChatSession()` in `src/agent/session.ts` — pass result as `mcpServers` option to SDK `query()`
- [ ] T079 [P2] [US3] Wire `createPermissionHandler(config.claude?.permission_mode, promptFn)` into `createChatSession()` in `src/agent/session.ts` — pass result as `canUseTool` option to SDK `query()`
- [ ] T080 [P2] [US3] Wire tool hooks (`PreToolUse`, `PostToolUse`) from `buildHooks()` into the SDK `query()` options in `src/agent/session.ts`

## Phase 8: Error Handling

- [ ] T081 [P2] [US3] Write tests for `ToolError` — tool timeout surfaces error message, tool crash surfaces error message in `tests/unit/lib/errors.test.ts`
- [ ] T082 [P2] [US3] Implement tool error handling in `PostToolUse` hook in `src/agent/hooks.ts` — catch tool failures, wrap in `ToolError` with cause, log via `getModuleLogger("tools")`, set `lastToolInvocation.status` to `"failed"`
- [ ] T083 [P2] [US3] Verify streaming error event from `mapSDKMessages` propagates to chat loop and displays error without crashing session (FR-012)

## Acceptance Verification

- [ ] T084 [P2] [US3] Manual verification: configure agent with MCP stdio tool, ask question requiring tool, verify tool invoked and result incorporated (Acceptance Scenario 1)
- [ ] T085 [P2] [US3] Manual verification: configure agent with MCP HTTP/SSE tool, invoke tool, verify communication with remote server (Acceptance Scenario 2)
- [ ] T086 [P2] [US3] Manual verification: configure agent with failing/timing-out MCP tool, verify error displayed and conversation continues (Acceptance Scenario 3)
- [ ] T087 [P2] [US3] Manual verification: invoke tool, press Ctrl+O, verify full args and results displayed (Acceptance Scenario 4)
- [ ] T088 [P2] [US3] Manual verification: set `permission_mode: manual`, trigger tool use, verify "Allow? [Y/n]" prompt appears and respects user choice (Acceptance Scenario 5)

---

## Task Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1. MCP Config Mapping | T055-T060 | `buildMCPServers()` — YAML to SDK config |
| 2. Tool Invocation Hooks | T061-T064 | PreToolUse/PostToolUse hook tracking |
| 3. Tool Event Streaming | T065-T067 | SDKMessage to ChatEvent for tools |
| 4. Tool Display Rendering | T068a-T069 | Terminal display of tool status (tests + impl) |
| 5. Tool Inspection | T070-T072 | Ctrl+O to inspect last tool invocation |
| 6. Permission Handler | T073-T077b | Manual mode Y/n prompt + SDK enum mapping |
| 7. Session Integration | T078-T080 | Wire MCP, permissions, hooks into session |
| 8. Error Handling | T081-T083 | Tool failures handled gracefully |
| Acceptance | T084-T088 | Manual verification of all 5 scenarios |

**Total**: 38 tasks (T055-T088, plus T068a, T068b, T077a, T077b)
**Dependencies**: Phase 1-3 can proceed in parallel. Phase 4 depends on Phase 3. Phase 5 depends on Phase 2. Phase 6 is independent. Phase 7 depends on Phases 1, 2, 6. Phase 8 depends on Phases 2, 3. Acceptance depends on all phases.
