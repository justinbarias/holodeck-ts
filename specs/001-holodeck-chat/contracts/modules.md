# Contract: Internal Module Interfaces

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29

This document defines the public interfaces between internal modules for the chat feature. These are TypeScript contracts — not REST APIs.

---

## Module: `src/config/loader.ts`

### `loadAgentConfig(path: string): Promise<AgentConfig>`

Load and validate an agent configuration from a YAML file.

**Parameters:**
- `path` — Absolute or relative path to agent YAML file

**Returns:** Validated `AgentConfig` object

**Throws:**
- `ConfigError` — File not found, YAML parse error, Zod validation error, unresolved env var

**Behavior:**
1. Check file exists via `Bun.file(path).exists()`
2. Read raw YAML via `Bun.file(path).text()`
3. Resolve `${VAR}` env var references via `resolveEnvVars()` from `src/lib/env.ts`
4. Parse YAML via `parse()` from `yaml` package
5. Validate via `AgentConfigSchema.parse(parsed)` — throws `ZodError` on failure
6. If `instructions.file` is set, verify the referenced file exists
7. Wrap all errors in `ConfigError` with `{ cause: originalError }`

---

## Module: `src/config/schema.ts`

Exports all Zod schemas and inferred types for the chat feature.

### Exports

```typescript
// Schemas
export const LLMProviderSchema: z.ZodObject<...>;
export const InstructionsSchema: z.ZodObject<...>;
export const MCPToolSchema: z.ZodUnion<...>;
export const ToolSchema: z.ZodDiscriminatedUnion<...>;
export const ClaudeConfigSchema: z.ZodObject<...>;
export const AgentConfigSchema: z.ZodObject<...>;

// Sub-schemas
export const BashConfigSchema: z.ZodObject<...>;
export const FileSystemConfigSchema: z.ZodObject<...>;
export const ExtendedThinkingSchema: z.ZodObject<...>;
export const SubagentsConfigSchema: z.ZodObject<...>;

// Types
export type LLMProvider = z.infer<typeof LLMProviderSchema>;
export type Instructions = z.infer<typeof InstructionsSchema>;
export type MCPTool = z.infer<typeof MCPToolSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
```

---

## Module: `src/agent/session.ts`

### `createChatSession(config: AgentConfig): Promise<ChatSession>`

Initialize a chat session from a validated agent configuration.

**Parameters:**
- `config` — Validated `AgentConfig`

**Returns:** Initialized `ChatSession` in `prompting` state

**Behavior:**
1. Resolve instructions (inline or read file)
2. Discover skills from `.claude/skills/*/SKILL.md`
3. Build SDK options (MCP servers, hooks, permission mode, thinking config)
4. Set session state to `prompting`

### `sendMessage(session: ChatSession, input: string): AsyncGenerator<ChatEvent>`

Send a user message and stream the agent's response.

**Parameters:**
- `session` — Active `ChatSession`
- `input` — User message text

**Yields:** `ChatEvent` objects as the response streams

**Behavior:**
1. Set state to `streaming`
2. Invoke SDK `query()` with prompt and options
3. Yield `ChatEvent` objects for each `SDKMessage`
4. On completion, update context usage
5. Set state back to `prompting`

### `interruptResponse(session: ChatSession): Promise<void>`

Interrupt the current streaming response (Ctrl+C).

**Behavior:**
1. If `session.query` is not null, call `query.interrupt()`
2. Set state to `interrupted`, then `prompting`

### `closeSession(session: ChatSession): Promise<void>`

Gracefully close the session and clean up resources.

**Behavior:**
1. Set state to `shutting_down`
2. Close SDK query handle
3. Set state to `exited`

---

## Module: `src/agent/hooks.ts`

### `buildHooks(session: ChatSession): Partial<Record<HookEvent, HookCallbackMatcher[]>>`

Build SDK hook configuration from session state.

**Returns:** Hook map with:
- `PreToolUse` — Update `lastToolInvocation` status to `"calling"`
- `PostToolUse` — Capture tool result in `lastToolInvocation`
- `PreCompact` — Signal context compaction is about to occur
- `PostCompact` — Notify user that compaction occurred

---

## Module: `src/agent/permissions.ts`

### `createPermissionHandler(mode: string, promptFn: PromptFn): CanUseTool | undefined`

Create a permission callback for the SDK based on the configured mode.

**Parameters:**
- `mode` — YAML `permission_mode` value (`"manual"` | `"acceptEdits"` | `"acceptAll"`)
- `promptFn` — Function to display the Y/n prompt and get user response

**Returns:**
- For `"manual"` → `CanUseTool` callback that prompts user
- For `"acceptEdits"` / `"acceptAll"` → `undefined` (SDK handles internally)

---

## Module: `src/agent/streaming.ts`

### `ChatEvent` (union type)

```typescript
type ChatEvent =
  | { type: "text"; content: string }           // Incremental text token
  | { type: "tool_start"; toolName: string }     // Tool invocation began
  | { type: "tool_end"; toolName: string; status: "done" | "failed"; error?: string }
  | { type: "thinking"; content: string }        // Extended thinking content
  | { type: "context_warning"; ratio: number }   // Context at 80%+
  | { type: "compaction"; summary: string }       // Context compacted
  | { type: "error"; message: string }            // Error during streaming
  | { type: "complete"; sessionId: string }       // Response finished
  | { type: "status"; message: string };          // Status update
```

### `mapSDKMessages(messages: AsyncGenerator<SDKMessage>, session: ChatSession): AsyncGenerator<ChatEvent>`

Transform SDK message stream into simplified `ChatEvent` stream for the rendering layer.

**Behavior:**
- `SDKPartialAssistantMessage` → `{ type: "text", content }` for each text delta
- `SDKToolUseSummaryMessage` → `{ type: "tool_start" }` / `{ type: "tool_end" }`
- `SDKCompactBoundaryMessage` → `{ type: "compaction" }`
- `SDKResultMessage` → `{ type: "complete" }` or `{ type: "error" }`

---

## Module: `src/tools/skills.ts`

### `discoverSkills(basePath: string): Promise<Skill[]>`

Discover SKILL.md files from the `.claude/skills/` directory.

**Parameters:**
- `basePath` — Working directory to search from

**Returns:** Array of discovered `Skill` objects

**Behavior:**
1. Glob for `{basePath}/.claude/skills/*/SKILL.md`
2. For each match, read and parse
3. Log warning for invalid/unreadable files, continue
4. Return valid skills

---

## Module: `src/tools/mcp.ts`

### `buildMCPServers(tools: Tool[]): Record<string, McpServerConfig>`

Convert YAML tool definitions to SDK MCP server configuration.

**Parameters:**
- `tools` — Array of tool definitions from agent config

**Returns:** SDK-compatible MCP server config map

**Behavior:**
1. Filter tools to `type === "mcp"` only
2. Map each to SDK `McpServerConfig` format
3. Return as `Record<string, McpServerConfig>` keyed by tool name

---

## Module: `src/cli/commands/chat.ts`

### `chatCommand(): Command`

Create the Commander subcommand for `holodeck chat`.

**Returns:** Configured Commander `Command` instance

**Behavior:**
1. Define `--agent <path>` option with default `"./agent.yaml"`
2. Define `--verbose` boolean option (default `false`)
3. Register async action handler:
   a. Call `setupLogging({ verbose: options.verbose })`
   b. Load user env (`~/.holodeck/.env`)
   c. Load and validate agent config
   d. Create chat session
   e. Start interactive loop (readline)
   f. Handle signals (SIGINT, Ctrl+D)
   g. On exit, close session

---

## Module: `src/cli/render.ts`

### `renderMarkdown(text: string): string`

Render markdown text to ANSI-formatted terminal string.

**Parameters:**
- `text` — Markdown content

**Returns:** ANSI-formatted string for terminal display

### `renderStreamingMarkdown(buffer: string): string`

Render partial streaming markdown to ANSI-formatted terminal string.

**Parameters:**
- `buffer` — Accumulated markdown content (may have unterminated syntax)

**Returns:** ANSI-formatted string (after `remend` auto-completion)

**Behavior:**
1. Apply `remend(buffer)` to close unterminated markdown blocks
2. Parse and render via `marked` + `marked-terminal`

---

## Module: `src/lib/errors.ts`

### Error Hierarchy

```typescript
export class HoloDeckError extends Error {
  constructor(message: string, options?: ErrorOptions);
}

export class ConfigError extends HoloDeckError {
  constructor(message: string, options?: ErrorOptions);
}

export class ToolError extends HoloDeckError {
  constructor(message: string, options?: ErrorOptions);
}
```

### `formatZodError(error: ZodError, filePath: string): string`

Format a Zod validation error into a human-readable message with field paths.

**Parameters:**
- `error` — `ZodError` from `.parse()` failure
- `filePath` — Path to the config file (for context)

**Returns:** Multi-line error string, e.g.:
```
Invalid configuration in agent.yaml:
  → model.temperature: Number must be less than or equal to 2 (received 5.0)
  → instructions: Exactly one of 'inline' or 'file' must be provided
```

---

## Module: `src/lib/env.ts`

### `loadHolodeckEnv(): void`

Load environment variables from `~/.holodeck/.env` without overriding existing values.

### `resolveEnvVars(raw: string): string`

Replace `${VAR_NAME}` references in a string with env var values.

---

## Module: `src/lib/logger.ts`

Uses [LogTape](https://logtape.org/) for structured, OTel-ready logging.

### `setupLogging(options: { verbose: boolean }): Promise<void>`

Configure LogTape sinks and log levels. Called once at CLI startup.

**Parameters:**
- `options.verbose` — If `true`, set root logger level to `"debug"`. Otherwise `"info"`.

**Behavior:**
1. Configure a console sink targeting stderr (`getConsoleSink({ stderr: true })`)
2. Register root logger category `["holodeck"]` at the appropriate level
3. When OTel is enabled (future), add `@logtape/otel` sink alongside console

### `getModuleLogger(module: string): Logger`

Get a LogTape logger for a specific module.

**Parameters:**
- `module` — Module name (e.g., `"config"`, `"agent"`, `"tools"`, `"cli"`)

**Returns:** LogTape `Logger` instance with category `["holodeck", module]`

**Usage in modules:**
```typescript
import { getModuleLogger } from "../lib/logger";
const logger = getModuleLogger("config");

logger.info("Loaded agent config from {path}", { path });
logger.debug("Resolved {count} env var substitutions", { count });
logger.error("Config validation failed: {message}", { message: err.message });
```

### Logger Categories

| Category | Module |
|----------|--------|
| `["holodeck", "config"]` | Config loading, YAML parsing, Zod validation |
| `["holodeck", "agent"]` | Session lifecycle, SDK query, hooks |
| `["holodeck", "tools"]` | MCP server mapping, skill discovery |
| `["holodeck", "cli"]` | CLI startup, rendering, signal handling |
| `["holodeck", "env"]` | Env var resolution, .env loading |

**Output**: All log output goes to stderr. stdout is reserved for chat I/O.

**OTel future**: Add `@logtape/otel` sink in `setupLogging()` when observability config is enabled — no changes needed in any module code.
