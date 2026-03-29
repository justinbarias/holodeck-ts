# Data Model: HoloDeck Chat

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29

## Table of Contents

1. [Entity Relationship Diagram](#entity-relationship-diagram)
2. [Agent Configuration (Root Entity)](#1-agent-configuration-root-entity)
3. [LLM Provider](#2-llm-provider)
4. [Instructions](#3-instructions)
5. [MCP Tool](#4-mcp-tool)
6. [Claude Config](#5-claude-config)
7. [Chat Session (Runtime)](#6-chat-session-runtime)
8. [Message (Runtime)](#7-message-runtime)
9. [Skill (Runtime)](#8-skill-runtime)
10. [Tool Invocation Record (Runtime)](#9-tool-invocation-record-runtime)
11. [Context Usage (Runtime)](#10-context-usage-runtime)
12. [Validation Rules Summary](#validation-rules-summary)
13. [State Transitions](#state-transitions)

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────┐
│         AgentConfig (YAML)          │
│  Root configuration entity          │
│  Parsed from agent.yaml             │
├─────────────────────────────────────┤
│  name: string (PK)                  │
│  description?: string               │
├──────────┬──────────────────────────┤
│          │                          │
│  ┌───────▼───────┐  ┌──────────────▼──────────────┐
│  │  LLMProvider   │  │       Instructions          │
│  │  (1:1, req)    │  │  (1:1, req)                 │
│  │                │  │  XOR: inline | file          │
│  │  provider      │  │                             │
│  │  name          │  │  inline?: string             │
│  │  temperature   │  │  file?: string               │
│  │  max_tokens    │  └─────────────────────────────┘
│  │  auth_provider │
│  └────────────────┘
│          │
│  ┌───────▼────────────────┐  ┌─────────────────────┐
│  │  MCPTool[] (0..50)     │  │  ClaudeConfig (0..1) │
│  │  Discriminated on type │  │                      │
│  │                        │  │  permission_mode     │
│  │  name (unique in list) │  │  max_turns           │
│  │  description           │  │  extended_thinking   │
│  │  transport             │  │  allowed_tools       │
│  │  command / url         │  │  working_directory   │
│  │  args / headers        │  │  bash / file_system  │
│  └────────────────────────┘  └─────────────────────┘
│
└─────────────────────────────────────────────────────┘

                    ▼ instantiates at runtime

┌─────────────────────────────────────┐
│          ChatSession                │
│  Runtime entity (in-memory)         │
├─────────────────────────────────────┤
│  sessionId: string|null (from SDK)  │
│  agentConfig: AgentConfig           │
│  state: SessionState                │
│  query: Query (SDK handle)          │
│  lastToolInvocation?: ToolInvoc     │
│  contextUsage?: SDK ContextUsage    │
├──────────┬──────────────────────────┤
│          │                          │
│  ┌───────▼────────────┐  ┌─────────▼──────────────┐
│  │  Message[] (0..∞)   │  │  Skill[] (0..∞)        │
│  │  Ordered by index   │  │  Auto-discovered       │
│  │                     │  │                        │
│  │  role: user|asst    │  │  name: string          │
│  │  content: string    │  │  description: string   │
│  │  timestamp: Date    │  │  instructions: string  │
│  │  toolUses?: []      │  │  path: string          │
│  └─────────────────────┘  └────────────────────────┘
│          │
│  ┌───────▼────────────────────┐
│  │  ToolInvocationRecord      │
│  │  (last invocation only)    │
│  │                            │
│  │  toolName: string          │
│  │  args: unknown             │
│  │  result: unknown           │
│  │  status: calling|done|fail │
│  │  timestamp: Date           │
│  └────────────────────────────┘
└─────────────────────────────────┘
```

---

## 1. Agent Configuration (Root Entity)

**Source**: `agent.yaml` (YAML file validated by Zod)
**Identity**: `name` field (unique per config file)
**Lifecycle**: Loaded once at `holodeck chat` startup, immutable during session

### Zod Schema

```typescript
export const AgentConfigSchema = z.strictObject({
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	model: LLMProviderSchema,
	instructions: InstructionsSchema,
	tools: z.array(ToolSchema).max(50).default([]),
	claude: ClaudeConfigSchema.optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
```

### Fields

| Field | Type | Required | Default | Validation | FR |
|-------|------|----------|---------|------------|-----|
| `name` | `string` | Yes | — | `min(1), max(100)` | FR-001 |
| `description` | `string` | No | — | `max(500)` | FR-001 |
| `model` | `LLMProvider` | Yes | — | Nested schema | FR-001 |
| `instructions` | `Instructions` | Yes | — | XOR constraint | FR-004 |
| `tools` | `Tool[]` | No | `[]` | `max(50)`, unique names | FR-008 |
| `claude` | `ClaudeConfig` | No | — | Nested schema | FR-015 |

**Note**: Fields from the full YAML schema that are out of scope for chat (`embedding_provider`, `evaluations`, `test_cases`, `observability`) are excluded from this data model. They will be added in their respective feature specs.

---

## 2. LLM Provider

**Source**: `model` field of AgentConfig
**Relationship**: 1:1 with AgentConfig (required)

### Zod Schema

```typescript
export const LLMProviderSchema = z.strictObject({
	provider: z.literal("anthropic"),
	name: z.string().min(1),
	temperature: z.number().min(0).max(2).default(0.3),
	max_tokens: z.number().int().positive().default(1000),
	auth_provider: z
		.enum(["api_key", "bedrock", "vertex", "foundry"])
		.optional(),
});

export type LLMProvider = z.infer<typeof LLMProviderSchema>;
```

### Fields

| Field | Type | Required | Default | Validation | Notes |
|-------|------|----------|---------|------------|-------|
| `provider` | `"anthropic"` | Yes | — | Literal, single-backend | Constitution I |
| `name` | `string` | Yes | — | Non-empty | e.g., `claude-sonnet-4-20250514` |
| `temperature` | `number` | No | `0.3` | `[0.0, 2.0]` | — |
| `max_tokens` | `number` | No | `1000` | Positive integer | Zod v4: `.int()` rejects Infinity by default |
| `auth_provider` | `enum` | No | — | One of 4 values | Determines SDK auth strategy |

### SDK Mapping

| YAML Field | SDK `Options` Field |
|------------|-------------------|
| `name` | `model` |
| `temperature` | Passed via system prompt or SDK config |
| `max_tokens` | Passed via SDK config |
| `auth_provider` | Determines environment/credential setup |

---

## 3. Instructions

**Source**: `instructions` field of AgentConfig
**Relationship**: 1:1 with AgentConfig (required)
**Constraint**: Exactly one of `inline` or `file` must be provided (XOR)

### Zod Schema

```typescript
export const InstructionsSchema = z
	.strictObject({
		inline: z.string().min(1).optional(),
		file: z.string().min(1).optional(),
	})
	.refine((data) => Boolean(data.inline) !== Boolean(data.file), {
		message: "Exactly one of 'inline' or 'file' must be provided",
	});

export type Instructions = z.infer<typeof InstructionsSchema>;
```

### Fields

| Field | Type | Required | Validation | FR |
|-------|------|----------|------------|-----|
| `inline` | `string` | XOR | `min(1)` — non-empty if present | FR-004 |
| `file` | `string` | XOR | `min(1)` — path to markdown file | FR-004 |

### Resolution Logic

```
If instructions.inline → use as systemPrompt directly
If instructions.file → read file via Bun.file(path).text(), use content as systemPrompt
If file not found → throw ConfigError with path context
```

---

## 4. MCP Tool

**Source**: `tools[]` array in AgentConfig (discriminated union, only `type: "mcp"` for chat)
**Relationship**: 0..50 with AgentConfig
**Identity**: `name` field (unique within the tools array)

### Zod Schema

```typescript
const toolNamePattern = /^[0-9A-Za-z_]+$/;

const MCPStdioToolSchema = z.strictObject({
	type: z.literal("mcp"),
	name: z.string().regex(toolNamePattern),
	description: z.string().min(1),
	transport: z.literal("stdio").default("stdio"),
	command: z.enum(["npx", "node", "docker"]),
	args: z.array(z.string()).default([]),
	env: z.record(z.string(), z.string()).default({}),
	request_timeout: z.number().positive().default(60),
});

const MCPHttpToolSchema = z.strictObject({
	type: z.literal("mcp"),
	name: z.string().regex(toolNamePattern),
	description: z.string().min(1),
	transport: z.enum(["sse", "http"]),
	url: z.string().url(),
	headers: z.record(z.string(), z.string()).default({}),
	request_timeout: z.number().positive().default(60),
});

export const MCPToolSchema = z.union([MCPStdioToolSchema, MCPHttpToolSchema]);

export type MCPTool = z.infer<typeof MCPToolSchema>;
```

**Note**: The full YAML schema also supports `type: "hierarchical_document"` tools, but those are out of scope for the chat feature. The `ToolSchema` discriminated union will be defined to accept both types for forward compatibility, but only MCP tools are processed at runtime.

### Fields (stdio transport)

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `type` | `"mcp"` | Yes | — | Discriminator |
| `name` | `string` | Yes | — | `^[0-9A-Za-z_]+$` |
| `description` | `string` | Yes | — | Non-empty |
| `transport` | `"stdio"` | No | `"stdio"` | — |
| `command` | `enum` | Yes (stdio) | — | `npx \| node \| docker` |
| `args` | `string[]` | No | `[]` | — |
| `env` | `Record<string, string>` | No | `{}` | — |
| `request_timeout` | `number` | No | `60` | Positive (seconds) |

### Fields (sse/http transport)

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `type` | `"mcp"` | Yes | — | Discriminator |
| `name` | `string` | Yes | — | `^[0-9A-Za-z_]+$` |
| `description` | `string` | Yes | — | Non-empty |
| `transport` | `"sse" \| "http"` | Yes | — | — |
| `url` | `string` | Yes | — | Valid URL |
| `headers` | `Record<string, string>` | No | `{}` | — |
| `request_timeout` | `number` | No | `60` | Positive (seconds) |

### SDK Mapping

```typescript
function buildMCPServers(tools: MCPTool[]): Record<string, McpServerConfig> {
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      t.transport === "stdio"
        ? { type: "stdio", command: t.command, args: t.args, env: t.env }
        : { type: t.transport, url: t.url, headers: t.headers },
    ])
  );
}
```

---

## 5. Claude Config

**Source**: `claude` field of AgentConfig
**Relationship**: 0..1 with AgentConfig (optional)

### Zod Schema

```typescript
const BashConfigSchema = z.strictObject({
	enabled: z.boolean().default(true),
	excluded_commands: z.array(z.string()).default([]),
	allow_unsafe: z.boolean().default(false),
});

const FileSystemConfigSchema = z.strictObject({
	read: z.boolean().default(true),
	write: z.boolean().default(true),
	edit: z.boolean().default(true),
});

const ExtendedThinkingSchema = z.strictObject({
	enabled: z.boolean().default(false),
	budget_tokens: z.number().int().min(1000).max(100000).optional(),
});

const SubagentsConfigSchema = z.strictObject({
	enabled: z.boolean().default(false),
	max_parallel: z.number().int().min(1).max(16).default(4),
});

export const ClaudeConfigSchema = z.strictObject({
	working_directory: z.string().optional(),
	permission_mode: z
		.enum(["manual", "acceptEdits", "acceptAll"])
		.default("manual"),
	max_turns: z.number().int().positive().optional(),
	extended_thinking: ExtendedThinkingSchema.optional(),
	web_search: z.boolean().default(false),
	bash: BashConfigSchema.optional(),
	file_system: FileSystemConfigSchema.optional(),
	subagents: SubagentsConfigSchema.optional(),
	allowed_tools: z.array(z.string()).nullable().default(null),
});

export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
```

### Fields

| Field | Type | Required | Default | Validation | FR |
|-------|------|----------|---------|------------|-----|
| `working_directory` | `string` | No | — | Valid path | — |
| `permission_mode` | `enum` | No | `"manual"` | 3 values | FR-015 |
| `max_turns` | `number` | No | — | Positive integer | — |
| `extended_thinking` | `object` | No | — | budget: 1k-100k | — |
| `web_search` | `boolean` | No | `false` | — | — |
| `bash` | `object` | No | — | Nested | — |
| `file_system` | `object` | No | — | Nested | — |
| `subagents` | `object` | No | — | max_parallel: 1-16 | — |
| `allowed_tools` | `string[] \| null` | No | `null` | null = all | — |

### Permission Mode Mapping

| YAML Value | SDK `permissionMode` | SDK `canUseTool` |
|------------|---------------------|-----------------|
| `"manual"` | `"default"` | Inline Y/n prompt callback |
| `"acceptEdits"` | `"acceptEdits"` | Not needed |
| `"acceptAll"` | `"bypassPermissions"` | Not needed |

### Thinking Config Mapping

| YAML | SDK `ThinkingConfig` |
|------|---------------------|
| `extended_thinking` not set | `{ type: "disabled" }` |
| `{ enabled: false }` | `{ type: "disabled" }` |
| `{ enabled: true }` | `{ type: "enabled" }` |
| `{ enabled: true, budget_tokens: N }` | `{ type: "enabled", budgetTokens: N }` |

---

## 6. Chat Session (Runtime)

**Lifecycle**: Created when `holodeck chat` starts, destroyed on exit
**Storage**: In-memory only (no persistence across CLI invocations per Assumptions)
**Identity**: `sessionId` from SDK result

### TypeScript Interface

```typescript
interface ChatSession {
	/** SDK-assigned session identifier (null until first response) */
	sessionId: string | null;

	/** Parsed and validated agent configuration */
	readonly agentConfig: AgentConfig;

	/** Resolved system prompt (from inline or file) */
	readonly systemPrompt: string;

	/** Current session state */
	state: SessionState;

	/** Active SDK query handle (null when not streaming) */
	query: Query | null;

	/** Last tool invocation for Ctrl+O inspection */
	lastToolInvocation: ToolInvocationRecord | null;

	/** Latest context usage from SDK (null until first turn completes) */
	contextUsage: SDKControlGetContextUsageResponse | null;

	/** Discovered skills */
	skills: Skill[];

	/** Whether context warning has been shown for current threshold */
	contextWarningShown: boolean;
}
```

**Note**: `sessionId` is `null` at creation because it comes from the SDK's `SDKResultMessage.session_id` after the first response completes. Subsequent turns use `resume: sessionId` to continue the conversation.

**Note**: `contextUsage` uses the SDK's `SDKControlGetContextUsageResponse` type directly — it already provides `totalTokens`, `maxTokens`, and `percentage`. No custom wrapper needed.

### Fields

| Field | Type | Mutable | Description |
|-------|------|---------|-------------|
| `sessionId` | `string \| null` | Yes | From SDK's `SDKResultMessage.session_id`, null until first response |
| `agentConfig` | `AgentConfig` | No | Parsed YAML config |
| `systemPrompt` | `string` | No | Resolved instructions content |
| `state` | `SessionState` | Yes | Current state machine state |
| `query` | `Query \| null` | Yes | Active SDK query handle |
| `lastToolInvocation` | `ToolInvocationRecord \| null` | Yes | For FR-017 (Ctrl+O) |
| `contextUsage` | `SDKControlGetContextUsageResponse \| null` | Yes | For FR-018 (80% warning), from SDK directly |
| `skills` | `Skill[]` | No | Discovered at startup |
| `contextWarningShown` | `boolean` | Yes | Prevent repeated warnings |

---

## 7. Message (Runtime)

**Note**: The SDK manages conversation history internally. This entity represents the minimal display-layer model for rendering in the terminal.

### TypeScript Interface

```typescript
interface ChatMessage {
	/** Message role */
	role: "user" | "assistant";

	/** Display content (rendered text) */
	content: string;

	/** Timestamp of message */
	timestamp: Date;

	/** Tool uses in this turn (assistant only) */
	toolUses?: ToolUseSummary[];
}

interface ToolUseSummary {
	/** Tool name */
	name: string;

	/** Execution status */
	status: "calling" | "done" | "failed";
}
```

**Decision**: We do NOT maintain a separate message history array. The SDK manages the full conversation state via `sessionId` + `resume`. The terminal rendering layer only needs the current message being displayed.

---

## 8. Skill (Runtime)

**Source**: `.claude/skills/*/SKILL.md` files
**Lifecycle**: Discovered at session startup, immutable during session
**Relationship**: 0..∞ with ChatSession

### TypeScript Interface

```typescript
interface Skill {
	/** Skill identifier (directory name) */
	name: string;

	/** Description extracted from SKILL.md frontmatter or first paragraph */
	description: string;

	/** Full instructions content from SKILL.md */
	instructions: string;

	/** Absolute path to the SKILL.md file */
	path: string;
}
```

### Discovery Logic

```
1. Glob for .claude/skills/*/SKILL.md relative to working_directory or CWD
2. For each file found:
   a. Read file content
   b. Parse frontmatter for name/description (if present)
   c. Fallback: use directory name as name, first paragraph as description
   d. If file is empty or unreadable → log warning, skip (FR-009 acceptance #4)
3. Return Skill[]
```

### Fields

| Field | Type | Required | Validation | FR |
|-------|------|----------|------------|-----|
| `name` | `string` | Yes | From directory name | FR-009 |
| `description` | `string` | Yes | Non-empty | FR-009 |
| `instructions` | `string` | Yes | Full SKILL.md content | FR-009 |
| `path` | `string` | Yes | Absolute path, exists | FR-009 |

---

## 9. Tool Invocation Record (Runtime)

**Purpose**: Stores the most recent tool invocation for Ctrl+O inspection (FR-017)
**Lifecycle**: Updated on every `PostToolUse` hook; only last invocation retained

### TypeScript Interface

```typescript
interface ToolInvocationRecord {
	/** Tool name */
	toolName: string;

	/** Tool input arguments (JSON-serializable) */
	args: unknown;

	/** Tool output/result (JSON-serializable) */
	result: unknown;

	/** Execution status */
	status: "calling" | "done" | "failed";

	/** When the invocation occurred */
	timestamp: Date;

	/** SDK tool_use_id for correlation */
	toolUseId: string;
}
```

### Fields

| Field | Type | Mutable | Source |
|-------|------|---------|-------|
| `toolName` | `string` | No | `PostToolUse` hook `tool_name` |
| `args` | `unknown` | No | `PostToolUse` hook `tool_input` |
| `result` | `unknown` | No | `PostToolUse` hook `tool_response` |
| `status` | `enum` | Yes | Set to `"calling"` on `PreToolUse`, updated on `PostToolUse` |
| `timestamp` | `Date` | No | Capture time |
| `toolUseId` | `string` | No | `PostToolUse` hook `tool_use_id` |

---

## 10. Context Usage (Runtime)

**Purpose**: Track context window usage for 80% warning (FR-018)
**Source**: `query.getContextUsage()` after each turn

Uses the SDK's `SDKControlGetContextUsageResponse` type directly — no custom wrapper.

### SDK Type (from `@anthropic-ai/claude-agent-sdk`)

```typescript
type SDKControlGetContextUsageResponse = {
	categories: { name: string; tokens: number; color: string; isDeferred?: boolean }[];
	totalTokens: number;
	maxTokens: number;
	rawMaxTokens: number;
	percentage: number;   // 0-100 — use this for the 80% warning threshold
	model: string;
	// ... additional display fields (gridRows)
};
```

**Usage**: After each turn, call `query.getContextUsage()`. If `response.percentage >= 80`, display the context warning (FR-018).

---

## Validation Rules Summary

### Cross-Field Constraints

| Rule | Entities | Validation |
|------|----------|------------|
| Instructions XOR | `Instructions` | Exactly one of `inline` \| `file` |
| Tool name uniqueness | `MCPTool[]` | `name` unique within `tools` array |
| MCP transport fields | `MCPTool` | `command` required for stdio; `url` required for sse/http |
| Strict mode | All config schemas | Unknown fields rejected via `z.strictObject()` |
| Env var resolution | All string fields | `${VAR}` resolved before Zod validation |

### Zod v4 Considerations

| Consideration | Action |
|---------------|--------|
| `z.number()` rejects Infinity | No action needed — desired behavior for all numeric fields |
| `.default()` uses output types | Ensure defaults match post-parse types (they do for primitives) |
| `.passthrough()` deprecated | Use `z.strictObject()` (we want strict, not passthrough) |
| `z.discriminatedUnion()` unchanged | Use as-is for `ToolSchema` |

---

## State Transitions

### ChatSession State Machine

```
                    ┌──────────────┐
                    │  initializing │
                    └──────┬───────┘
                           │ config loaded + validated
                           │ skills discovered
                           │ SDK query created
                           ▼
                    ┌──────────────┐
            ┌──────│   prompting   │◄─────────────┐
            │      └──────┬───────┘               │
            │             │ user enters message    │
            │             ▼                        │
            │      ┌──────────────┐               │
            │      │  streaming   │───────────────┤
            │      └──────┬───────┘  response     │
            │             │          complete      │
            │             │                        │
            │             │ Ctrl+C (interrupt)     │
            │             ▼                        │
            │      ┌──────────────┐               │
            │      │ interrupted  │───────────────┘
            │      └──────────────┘  ready for
            │                        next prompt
            │
            │ exit/quit/Ctrl+D
            ▼
     ┌──────────────┐
     │  shutting_down│
     └──────┬───────┘
            │ MCP connections closed
            │ SDK query closed
            ▼
     ┌──────────────┐
     │   exited      │
     └──────────────┘
```

### State Enum

```typescript
type SessionState =
	| "initializing"   // Loading config, discovering skills, connecting
	| "prompting"      // Waiting for user input
	| "streaming"      // Agent is generating a response
	| "interrupted"    // Response was cancelled via Ctrl+C
	| "shutting_down"  // Cleanup in progress
	| "exited";        // Terminal state
```

### Transitions

| From | Event | To | Side Effects |
|------|-------|----|-------------|
| `initializing` | Config valid, SDK ready | `prompting` | Display welcome, show prompt |
| `initializing` | Config invalid | `exited` | Display validation error, exit(1) |
| `prompting` | User submits message | `streaming` | Send to SDK via `query()` |
| `prompting` | User types `exit`/`quit` | `shutting_down` | Begin cleanup |
| `prompting` | Ctrl+D | `shutting_down` | Begin cleanup |
| `streaming` | Response complete | `prompting` | Display response, update context usage, show prompt |
| `streaming` | Ctrl+C | `interrupted` | Call `query.interrupt()` |
| `streaming` | SDK error | `prompting` | Display error, show prompt (FR-012) |
| `interrupted` | Interrupt acknowledged | `prompting` | Show prompt |
| `shutting_down` | Cleanup complete | `exited` | Close MCP, close query, exit(0) |

### Tool Invocation Sub-States (within `streaming`)

```
streaming
  └─ tool_calling    → display "⟳ Calling {toolName}..."
       └─ tool_done  → display "✓ {toolName} done"
       └─ tool_failed → display "✗ {toolName} failed: {error}"
```

These are display-only states managed by the rendering layer, not the session state machine.
