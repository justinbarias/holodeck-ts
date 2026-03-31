# Research: HoloDeck Chat

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29

## Table of Contents

1. [Claude Agent SDK](#1-claude-agent-sdk)
2. [Commander.js CLI Framework](#2-commanderjs-cli-framework)
3. [Zod v4 Validation](#3-zod-v4-validation)
4. [YAML Parsing & Env Var Substitution](#4-yaml-parsing--env-var-substitution)
5. [Terminal Markdown Rendering](#5-terminal-markdown-rendering)
6. [Terminal Input Handling](#6-terminal-input-handling)
7. [Bun Runtime APIs](#7-bun-runtime-apis)
8. [Structured Logging](#8-structured-logging)
9. [Dependency Matrix](#9-dependency-matrix)

---

## 1. Claude Agent SDK

### Installed Version

- **Package**: `@anthropic-ai/claude-agent-sdk` v0.2.87
- **Peer dependencies**: `zod ^4.0.0`
- **Transitive deps**: `@anthropic-ai/sdk ^0.74.0`, `@modelcontextprotocol/sdk ^1.27.1`

### Core API: `query()`

The primary function for executing agent queries. Returns an `AsyncGenerator<SDKMessage, void>` for streaming.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const q = query({
  prompt: "Hello",
  options: {
    model: "claude-sonnet-4-20250514",
    systemPrompt: "You are helpful.",
    permissionMode: "default",
    maxTurns: 25,
    allowedTools: ["Read", "Write"],
    mcpServers: { /* ... */ },
    hooks: { /* ... */ },
    thinking: { type: "disabled" },
  },
});

for await (const message of q) {
  // Handle SDKMessage union type
}
```

**Key `Options` fields for chat feature:**

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | `string \| AsyncIterable<SDKUserMessage>` | User input |
| `model` | `string` | Model identifier |
| `systemPrompt` | `string \| { type: "preset"; preset: "claude_code"; append?: string }` | System instructions |
| `permissionMode` | `PermissionMode` | `"default"` \| `"acceptEdits"` \| `"bypassPermissions"` \| `"plan"` \| `"dontAsk"` |
| `maxTurns` | `number` | Max agent loop iterations |
| `allowedTools` | `string[]` | Auto-allowed tools |
| `disallowedTools` | `string[]` | Blocked tools |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP server definitions |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | Lifecycle hooks |
| `thinking` | `ThinkingConfig` | `{ type: "adaptive" }` \| `{ type: "enabled"; budgetTokens?: number }` \| `{ type: "disabled" }` |
| `persistSession` | `boolean` | Default `true` — persist session for resume |
| `resume` | `string` | Session ID to resume |
| `sessionId` | `string` | Custom session ID |
| `canUseTool` | `CanUseTool` | Permission callback for manual mode |
| `maxBudgetUsd` | `number` | Cost cap |

### Query Control Methods

The returned `Query` object provides control beyond streaming:

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;               // Cancel current response
  setPermissionMode(mode): Promise<void>;
  setModel(model?: string): Promise<void>;
  getContextUsage(): Promise<SDKControlGetContextUsageResponse>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  reconnectMcpServer(name): Promise<void>;
  toggleMcpServer(name, enabled): Promise<void>;
  close(): void;                            // Terminate session
}
```

**Decision**: Use `query.interrupt()` for Ctrl+C during streaming. Use `query.getContextUsage()` for context window monitoring (FR-018).

### SDKMessage Union Type (24+ variants)

Key message types for chat rendering:

| Type | Subtype | Purpose |
|------|---------|---------|
| `SDKAssistantMessage` | — | Full assistant turn (content blocks: text, tool_use, thinking) |
| `SDKPartialAssistantMessage` | — | **Streaming partial** — incremental content as tokens arrive |
| `SDKResultMessage` | `success` \| `error_*` | Terminal message with usage, cost, duration |
| `SDKToolUseSummaryMessage` | — | Tool invocation summary (FR-016) |
| `SDKToolProgressMessage` | — | Tool progress updates |
| `SDKCompactBoundaryMessage` | — | Context compaction occurred (FR-019) |
| `SDKStatusMessage` | — | Status updates |
| `SDKSystemMessage` | — | System-level messages |
| `SDKAPIRetryMessage` | — | API retry notifications |
| `SDKRateLimitEvent` | — | Rate limit events |

**Decision**: Handle `SDKPartialAssistantMessage` for token-by-token streaming (FR-007). Listen for `SDKCompactBoundaryMessage` for compaction notifications (FR-019). Use `SDKToolUseSummaryMessage` for tool status display (FR-016).

### Hook System (24 events)

Hooks intercept agent lifecycle events via callback matchers:

```typescript
type HookCallbackMatcher = {
  matcher?: string;        // Pattern matching (e.g., "*", "Read", "Bash")
  hooks: HookCallback[];   // Callback functions
  timeout?: number;        // Seconds
};

type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

**Relevant hook events for chat:**

| Event | Input Type | Use Case |
|-------|-----------|----------|
| `PreToolUse` | `{ tool_name, tool_input, tool_use_id }` | Permission check in manual mode (FR-015), tool logging |
| `PostToolUse` | `{ tool_name, tool_input, tool_response, tool_use_id }` | Tool result capture for Ctrl+O inspection (FR-017) |
| `PreCompact` | `{ trigger: "manual" \| "auto" }` | Context compaction warning (FR-019) |
| `PostCompact` | `{ compact_summary }` | Notify user of compaction |
| `Stop` | `{ stop_hook_active, last_assistant_message }` | Session end detection |
| `SessionStart` | `{ source, model }` | Initialization tracking |
| `SessionEnd` | `{ reason: ExitReason }` | Cleanup trigger |

### Permission System

For `manual` mode (FR-015), the SDK uses `canUseTool` callback:

```typescript
type CanUseTool = (
  toolName: string,
  input: unknown,
  options: {
    signal: AbortSignal;
    title?: string;
    description?: string;
    toolUseID: string;
  }
) => Promise<PermissionResult>;

type PermissionResult = {
  behavior: "allow" | "deny";
  message?: string;
  updatedInput?: Record<string, unknown>;
};
```

**Decision**: Implement `canUseTool` callback that displays tool name + args summary and prompts `"Allow? [Y/n]"` inline. Map YAML `permission_mode` values: `"manual"` → `"default"` with canUseTool, `"acceptEdits"` → `"acceptEdits"`, `"acceptAll"` → `"bypassPermissions"`.

### MCP Server Configuration

```typescript
type McpServerConfig =
  | { type?: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { type: "sse"; url: string; headers?: Record<string, string> }
  | { type: "http"; url: string; headers?: Record<string, string> };
```

**Decision**: Direct mapping from YAML MCP tool config to SDK `mcpServers` option. The SDK handles all MCP protocol communication — no custom implementation needed.

### Context Window Monitoring

```typescript
const usage = await query.getContextUsage();
// Returns SDKControlGetContextUsageResponse with token counts
```

**Decision**: Poll `getContextUsage()` after each turn. When usage exceeds 80% of model context, display warning (FR-018). The SDK handles automatic compaction — listen for `SDKCompactBoundaryMessage` to notify user (FR-019).

### V2 Session API (Alpha)

```typescript
const session = unstable_v2_createSession({
  model: "claude-sonnet-4-20250514",
  permissionMode: "default",
  hooks: { /* ... */ },
});

await session.send("Hello");
for await (const msg of session.stream()) { /* ... */ }
session.close();
```

**Decision**: Do NOT use V2 API — it's marked `unstable_`. Use the stable `query()` function. For multi-turn, re-invoke `query()` with `resume: sessionId` from the previous result's `session_id`.

### Custom Tool Registration

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const myTool = tool(
  "search_docs",
  "Search documentation",
  { query: z.string(), top_k: z.number().optional() },
  async (args) => ({ content: [{ type: "text", text: "results..." }] })
);

const server = createSdkMcpServer({
  name: "custom-tools",
  version: "1.0.0",
  tools: [myTool],
});
```

**Decision**: Use `tool()` + `createSdkMcpServer()` for any custom tools (future vectorstore integration). For chat MVP, only MCP tools from YAML config are needed.

---

## 2. Commander.js CLI Framework

### Installed Version

- **Package**: `commander` v14.0.3
- **Node.js requirement**: >= 20 (Bun satisfies this)
- **ESM support**: Yes, via `commander/esm.mjs` or named imports

### Subcommand Pattern for `holodeck chat`

```typescript
import { Command } from "commander";

const program = new Command();

program
  .name("holodeck")
  .description("No-code AI agent experimentation platform")
  .version("0.1.0");

program
  .command("chat")
  .description("Interactive streaming chat session")
  .option("--agent <path>", "Path to agent YAML config", "./agent.yaml")
  .action(async (options) => {
    // options.agent contains the path
  });

await program.parseAsync(process.argv);
```

### Key API Patterns

| Pattern | Usage |
|---------|-------|
| `.command("name")` | Create subcommand |
| `.option("--flag <val>", "desc", default)` | Define option with default |
| `.argument("<name>", "desc")` | Positional argument |
| `.action(async (opts, cmd) => {})` | Async action handler |
| `.parseAsync(process.argv)` | Parse with async support |
| `.exitOverride()` | Prevent `process.exit()` — throw `CommanderError` instead |
| `.configureOutput({ writeOut, writeErr })` | Custom output streams |
| `.hook("preAction", fn)` | Lifecycle hooks |
| `.showHelpAfterError(true)` | Show help on error |

### Error Handling

```typescript
program.exitOverride((err) => {
  if (err.code === "commander.help") process.exit(0);
  throw err; // Re-throw for custom handling
});
```

**Decision**: Use Commander for CLI structure. `holodeck chat` as action-handler subcommand with `--agent` option defaulting to `"./agent.yaml"`. Use `.parseAsync()` since chat is async. Override exit behavior for clean error handling.

---

## 3. Zod v4 Validation

### Installed Version

- **Package**: `zod` v4.3.6 (Zod v4, NOT v3)
- **Import**: `import { z } from "zod"` (points to `v4/classic`)

### Critical v3 → v4 Breaking Changes

| Change | v3 | v4 | Impact |
|--------|----|----|--------|
| `z.number()` infinity | Accepts by default | **Rejects by default** | Remove any `.finite()` calls (now no-op) |
| `.default(value)` | Accepts input type | **Accepts output type** | Defaults must match post-parse type |
| `.passthrough()` | Primary method | **Deprecated** → use `.loose()` | Use `z.looseObject()` or `.loose()` |
| `z.discriminatedUnion()` | Exists | **Still exists** | No change needed |
| `.strict()` | Exists | **Still exists** | No change needed |
| `z.infer<>` | Exists | **Still exists** | No change needed |

### New v4 Features

| Feature | Description |
|---------|-------------|
| `.prefault(value)` | Default applied before parsing (input type) |
| `.encode()` / `.decode()` | Bidirectional transformation |
| `z.strictObject()` | Shorthand for `z.object().strict()` |
| `z.looseObject()` | Shorthand for `z.object().loose()` |
| `z.literal([a, b, c])` | Multi-value literals |

### Schema Pattern for HoloDeck (v4-safe)

```typescript
import { z } from "zod";

// Use z.strictObject() for config schemas (rejects unknown fields)
export const LLMProviderSchema = z.strictObject({
  provider: z.literal("anthropic"),
  name: z.string(),
  temperature: z.number().min(0).max(2).default(0.3),
  max_tokens: z.number().int().positive().default(1000),
  auth_provider: z.enum(["api_key", "bedrock", "vertex", "foundry"]).optional(),
});
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

// Discriminated unions still work identically
export const ToolSchema = z.discriminatedUnion("type", [
  HierarchicalDocumentToolSchema,
  MCPToolSchema,
]);
```

**Decision**: Use Zod v4 with `z.strictObject()` for all config schemas (replaces `z.object().strict()`). Remove any `.finite()` calls. Ensure `.default()` values match output types. `z.discriminatedUnion()` works unchanged.

---

## 4. YAML Parsing & Env Var Substitution

### Installed Version

- **Package**: `yaml` v2.8.3
- **TypeScript types**: Built-in (`./dist/index.d.ts`)

### Core API

```typescript
import { parse, stringify, parseDocument } from "yaml";

// Parse YAML string to JavaScript value
const config = parse(yamlString);                    // any
const config = parse(yamlString, reviverFn);         // with reviver

// Parse to Document (for AST manipulation)
const doc = parseDocument(yamlString);
doc.errors;   // YAMLParseError[]
doc.warnings; // YAMLWarning[]
```

### Environment Variable Substitution

The `yaml` package does **NOT** have built-in env var substitution. Must be implemented as a pre-parse string transformation.

**Decision**: Pre-process the raw YAML string before parsing:

```typescript
function resolveEnvVars(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = process.env[varName];  // Bun.env also works
    if (value === undefined) {
      throw new ConfigError(`Unresolved environment variable: \${${varName}}`);
    }
    return value;
  });
}
```

**Authentication credentials** (checked in order):
1. `ANTHROPIC_API_KEY` — Anthropic API key (recommended for production)
2. `CLAUDE_CODE_OAUTH_TOKEN` — OAuth token (for personal development)

The Claude Agent SDK checks these automatically. FR-014 requires surfacing auth errors clearly, distinguishing between missing credentials and invalid/expired ones.

**Env var loading priority** (FR-002):
1. Shell environment (highest — `Bun.env` / `process.env`)
2. Project `.env` (Bun loads automatically)
3. User `~/.holodeck/.env` (must load manually)

**Decision**: Bun auto-loads `.env` from CWD. For `~/.holodeck/.env`, manually read and merge before config loading. Shell env always wins (Bun's default behavior).

### Error Handling

```typescript
import { YAMLParseError } from "yaml";

try {
  const config = parse(raw);
} catch (err) {
  if (err instanceof YAMLParseError) {
    // err.code: ErrorCode (e.g., "BAD_INDENT", "DUPLICATE_KEY")
    // err.pos: [start, end] character positions
    // err.linePos: [{ line, col }] or [start, end] line positions
    // err.message: human-readable error
  }
}
```

**Decision**: Catch `YAMLParseError` and wrap in `ConfigError` with file path context for FR-003.

---

## 5. Terminal Markdown Rendering

### Decision: `marked` v15 + `marked-terminal` v7 + `remend` v1

**Rationale**: Most mature, widely-used combination. `marked-terminal@7.3.0` requires `marked <16`, so pin `marked@15.0.12`.

| Package | Version | Purpose |
|---------|---------|---------|
| `marked` | 15.0.12 | Markdown parser |
| `marked-terminal` | 7.3.0 | ANSI terminal renderer for marked |
| `remend` | 1.3.0 | Auto-complete unterminated markdown during streaming |

**Alternatives considered:**

| Alternative | Rejected Because |
|-------------|-----------------|
| `marked@17` + `marked-terminal-renderer@2.2.0` | Lower adoption, heavier deps (got, terminal-image) |
| `ink` + `ink-markdown` | Stale (Oct 2023), adds React runtime, overkill for chat loop |
| DIY `chalk` + manual ANSI | Enormous implementation effort |

### Streaming Markdown Strategy

Tokens arrive mid-syntax (e.g., `**bol` before `d**`). The `remend` package auto-completes unterminated blocks:

1. Accumulate tokens into a buffer string
2. Run `remend(buffer)` to close unterminated syntax
3. Parse with `marked.parse(remendedBuffer)` using `marked-terminal` renderer
4. Clear the output region and rewrite

This "re-render everything" approach is the same pattern used by Vercel's Streamdown and Python's Rich/Textual.

### Terminal Styling

`marked-terminal` uses `chalk` internally (transitive dependency). Code blocks get syntax highlighting via `cli-highlight` + `highlight.js`.

---

## 6. Terminal Input Handling

### Decision: `node:readline` (built into Bun)

**Rationale**: Fully implemented in Bun, supports line-by-line input, history, Ctrl+C/Ctrl+D handling. No external package needed.

```typescript
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});
```

**Alternatives considered:**

| Alternative | Rejected Because |
|-------------|-----------------|
| `@inquirer/prompts` | Designed for one-shot prompts, not persistent chat loops |
| `@clack/prompts` | Known Bun issues with sequential prompts |
| `console` AsyncIterable | Too low-level, no prompt/history support |
| `Bun.stdin.stream()` | Raw byte-level, no line buffering |

### Signal Handling Strategy

| Signal | Context | Behavior |
|--------|---------|----------|
| **Ctrl+C** | During streaming | Call `query.interrupt()` to cancel current response; keep session alive (FR-011) |
| **Ctrl+C** | At prompt (no streaming) | Display "Type 'exit' or press Ctrl+D to quit" |
| **Ctrl+D** | Any | Close readline, trigger graceful shutdown (FR-010) |
| **`exit`/`quit`** | At prompt | Display farewell message, clean exit (FR-010) |
| **Ctrl+O** | After tool use | Toggle display of last tool's full arguments and results (FR-017) |

**Ctrl+O implementation**: Requires raw mode (`process.stdin.setRawMode(true)`) to detect `\x0f` (ASCII 15). Alternative: handle as a normal typed command `/inspect` or bind in readline's keypress handler.

**Decision**: Use readline `'SIGINT'` event for Ctrl+C, `'close'` event for Ctrl+D. For Ctrl+O, bind a keypress handler in readline. Store last tool invocation data from `PostToolUse` hook for inspection.

---

## 7. Bun Runtime APIs

### File I/O

```typescript
// Read
const text = await Bun.file("agent.yaml").text();
const exists = await Bun.file("agent.yaml").exists();

// Write
await Bun.write("output.json", JSON.stringify(data));
```

### Environment Variables

```typescript
// All equivalent
process.env.ANTHROPIC_API_KEY;
Bun.env.ANTHROPIC_API_KEY;
import.meta.env.ANTHROPIC_API_KEY;
```

### Built-in `.env` Loading

Bun loads `.env` files automatically (no `dotenv` needed):
1. `.env`
2. `.env.production` / `.env.development` (based on `NODE_ENV`)
3. `.env.local`

For `~/.holodeck/.env` — must manually read and merge via `Bun.file()`.

### Process Spawning (MCP stdio)

```typescript
const proc = Bun.spawn(["npx", "-y", "@some/mcp-server"], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "inherit",
  env: { ...process.env, ...mcpEnv },
});
// proc.stdin: FileSink (write JSON-RPC)
// proc.stdout: ReadableStream (read responses)
// proc.kill(): terminate
// proc.unref(): detach from parent
```

**Note**: The SDK handles MCP stdio spawning internally via its `mcpServers` config. Direct `Bun.spawn()` is not needed for MCP.

### Stdout for Streaming

```typescript
// For streaming tokens (no trailing newline)
process.stdout.write(token);
// Or Bun-native:
console.write(token);
```

### Gotchas

| Area | Detail |
|------|--------|
| ESM | Bun supports mixed ESM/CJS; `.ts` imports work directly |
| TypeScript | No compilation step — Bun transpiles at runtime |
| `node:readline` | Fully implemented in Bun |
| `node:repl` | NOT implemented — don't use |
| `node:test` | Partially implemented — use `bun:test` |
| Signal handling | `process.on("SIGINT", ...)` works normally |
| Subprocess | Parent won't exit until children exit — use `.unref()` |

---

## 8. Structured Logging

### Decision: LogTape v2

**Rationale**: Zero dependencies, 5.3 KB, first-class Bun/Deno/Node support, official OTel sink (`@logtape/otel`), hierarchical category-based loggers.

| Package | Version | Purpose |
|---------|---------|---------|
| `logtape` | ^2.0.5 | Structured logger (runtime dep) |
| `@logtape/otel` | ^2.0.5 | OTel Logs sink (future, when OTel feature lands) |

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| `pino` v10 | 11 dependencies, ~115 KB, needs `bun-plugin-pino` for Bun worker thread compatibility |
| `winston` v3 | Buggy on Bun 1.2.x (`node:fs` transport issue oven-sh/bun#19090), heavy |
| `@opentelemetry/api-logs` directly | Explicitly NOT for application use — it's a bridge API for library authors. Still alpha/unstable. |
| `tslog` v4 | Zero deps and Bun-native, but no OTel integration — would need a custom bridge |
| `console.*` | No structured output, no levels, no OTel path |

### LogTape API Overview

```typescript
import { configure, getConsoleSink, getLogger } from "logtape";

// One-time setup at app startup
await configure({
  sinks: {
    console: getConsoleSink({ stderr: true }),  // debug+ to stderr
  },
  loggers: [
    {
      category: ["holodeck"],          // root category
      sinks: ["console"],
      lowestLevel: "info",             // default: info
    },
    {
      category: ["holodeck", "debug"], // --verbose overrides to debug
      sinks: ["console"],
      lowestLevel: "debug",
    },
  ],
});

// Per-module loggers via hierarchical categories
const logger = getLogger(["holodeck", "config"]);
logger.info("Loaded agent config from {path}", { path: "agent.yaml" });
logger.debug("Resolved env vars: {count} substitutions", { count: 3 });
logger.error("Config validation failed", { cause: zodError });
```

### Key Design Choices

**Hierarchical categories**: Each module gets its own category under `["holodeck", "<module>"]`:
- `["holodeck", "config"]` — config loading, validation
- `["holodeck", "agent"]` — session lifecycle, SDK interaction
- `["holodeck", "tools"]` — MCP tool mapping, skill discovery
- `["holodeck", "cli"]` — CLI startup, rendering

**`--verbose` flag**: Lowers the root logger level from `"info"` to `"debug"`. All structured debug output goes to stderr — never stdout (which is reserved for chat I/O).

**OTel future path**: When the observability feature lands, add `@logtape/otel` sink alongside the console sink:

```typescript
import { getOpenTelemetrySink } from "@logtape/otel";

await configure({
  sinks: {
    console: getConsoleSink({ stderr: true }),
    otel: getOpenTelemetrySink(),  // sends to OTel LoggerProvider
  },
  loggers: [
    { category: ["holodeck"], sinks: ["console", "otel"], lowestLevel: "info" },
  ],
});
```

No code changes needed in any module — just add the sink to the configuration. This is the key advantage over Pino's auto-instrumentation approach (which monkey-patches at runtime).

**Library-friendly design**: LogTape lets libraries log without configuring a sink. If no sink is configured, logs are silently dropped. This means `src/config/`, `src/agent/`, etc. can call `getLogger()` freely without coupling to CLI setup.

---

## 9. Dependency Matrix

### Current Dependencies (package.json)

| Package | Pinned | Installed | Latest | Status |
|---------|--------|-----------|--------|--------|
| `@anthropic-ai/claude-agent-sdk` | ^0.2.86 | 0.2.87 | 0.2.87 | **Current** |
| `commander` | ^14.0.3 | 14.0.3 | 14.0.3 | **Current** |
| `yaml` | ^2.8.3 | 2.8.3 | 2.8.3 | **Current** |
| `zod` | ^4.3.6 | 4.3.6 | 4.3.6 | **Current** |

### New Dependencies Required

| Package | Version | Purpose | Justification |
|---------|---------|---------|---------------|
| `marked` | ^15.0.12 | Markdown parser | FR-007: terminal markdown rendering |
| `marked-terminal` | ^7.3.0 | ANSI terminal renderer | FR-007: render markdown with ANSI formatting |
| `remend` | ^1.3.0 | Streaming markdown repair | FR-007: handle unterminated markdown during streaming |
| `logtape` | ^2.0.5 | Structured logging | Structured logging to stderr, OTel-ready via `@logtape/otel` sink |

### Dev Dependencies (no changes needed)

| Package | Pinned | Installed | Status |
|---------|--------|-----------|--------|
| `@biomejs/biome` | ^2.4.8 | 2.4.8 | **Current** |
| `@commitlint/cli` | ^19.8.1 | 19.8.1 | **Current** |
| `@commitlint/config-conventional` | ^19.8.1 | 19.8.1 | **Current** |
| `@tsconfig/bun` | ^1.0.7 | 1.0.7 | **Current** |
| `@types/bun` | ^1.3.11 | 1.3.11 | **Current** |
| `changelogen` | ^0.6.2 | 0.6.2 | **Current** |
| `lefthook` | ^1.11.13 | 1.11.13 | **Current** |
| `typescript` | ^5.8.3 | 5.8.3 | **Current** |

### Transitive Dependencies (provided by SDK)

| Package | Via | Notes |
|---------|-----|-------|
| `@anthropic-ai/sdk` | claude-agent-sdk | Anthropic API client |
| `@modelcontextprotocol/sdk` | claude-agent-sdk | MCP protocol implementation |
| `chalk` | marked-terminal | ANSI styling |
| `cli-highlight` | marked-terminal | Code block syntax highlighting |
| `highlight.js` | cli-highlight | Language grammars |

### Not Needed (Bun built-in)

| Capability | Bun Built-in | Package NOT needed |
|-----------|-------------|-------------------|
| .env loading | Automatic | `dotenv` |
| stdin readline | `node:readline` | `@inquirer/prompts`, `prompts` |
| File I/O | `Bun.file()` | `fs-extra` |
| Process spawn | `Bun.spawn()` | `execa` |
| Test runner | `bun:test` | `jest`, `vitest` |
