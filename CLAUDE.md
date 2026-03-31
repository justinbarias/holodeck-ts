# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**HoloDeck TypeScript** is the TypeScript port of [HoloDeck](https://github.com/yourorg/agentlab) — a no-code AI agent experimentation platform. Users define agents, tools, evaluations, and test cases entirely through YAML configuration.

**Key difference from Python version:** Built exclusively on the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript). No Semantic Kernel, no multi-backend abstraction.

**Current Status:** MVP in progress

- CLI infrastructure (Commander): **Planned**
- Agent execution (Claude Agent SDK): **Planned**
- Structured output (schema-enforced responses): **Planned**
- Evaluation framework (Anthropic methodology): **Planned**
- Chat interface: **Planned**
- OpenTelemetry integration: **Planned**
- Serve (REST/AG-UI): **Roadmap**
- Deploy (container): **Roadmap**

**Technology Stack:**

| Category | Choice |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript 5.x (strict, `@tsconfig/bun`) |
| Package Manager | Bun |
| CLI Framework | [Commander](https://github.com/tj/commander.js) |
| Validation | [Zod](https://zod.dev) |
| Agent SDK | [@anthropic-ai/claude-agent-sdk](https://platform.claude.com/docs/en/agent-sdk/typescript) |
| Linting/Formatting | [Biome](https://biomejs.dev) |
| Testing | [Bun test](https://bun.sh/docs/cli/test) |
| Config Parsing | [yaml](https://www.npmjs.com/package/yaml) |
| Observability | [OpenTelemetry JS SDK](https://opentelemetry.io/docs/languages/js/) |
| Embeddings | Ollama, Azure OpenAI |
| Vector DB | In-memory, Postgres, Redis, ChromaDB |

**Relationship to Python version:** The Python HoloDeck lives at `~/Git/python/agentlab`. This TypeScript port shares the same YAML configuration schema (with `provider` restricted to `anthropic`) and the same agent configuration structure. The evaluation framework diverges — Python uses NLP metrics (BLEU/ROUGE) + DeepEval, while TypeScript adopts [Anthropic's evaluation methodology](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Layer (Commander)                     │
│  ├─ chat: Interactive streaming chat session                │
│  └─ test: Test runner with evaluation grading               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Configuration (YAML + Zod)                     │
│  ├─ ConfigLoader: YAML parsing with env var substitution    │
│  ├─ Zod Schemas: Strict validation mirroring Python Pydantic│
│  └─ Defaults: Sensible defaults for all optional fields     │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Agent Executor (Claude Agent SDK)               │
│  ├─ query(): Streaming agent invocation (AsyncGenerator)    │
│  ├─ Hooks: PreToolUse, PostToolUse, Stop, Subagent*        │
│  ├─ Subagents: Parallel sub-agent execution                 │
│  ├─ Skills: SKILL.md auto-discovery and invocation          │
│  └─ Permissions: manual / acceptEdits / acceptAll           │
├─────────────────────────────────────────────────────────────┤
│                      Tool Layer                             │
│  ├─ Hierarchical Vectorstore (contextual retrieval)         │
│  ├─ MCP Servers (stdio, HTTP/SSE)                           │
│  ├─ Custom Tools (tool() + Zod)                             │
│  ├─ Skills (SKILL.md)                                       │
│  └─ Native: Read, Write, Edit, Bash, Glob, Grep, Web*      │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│   Evaluation Engine  │  │   OpenTelemetry                  │
│  ├─ Code Graders     │  │  ├─ Traces (GenAI conventions)   │
│  ├─ Model Graders    │  │  ├─ Metrics                      │
│  ├─ Transcript Grade │  │  ├─ Logs                         │
│  ├─ pass@k / pass^k  │  │  └─ Exporters (OTLP, Console,   │
│  └─ Reporter         │  │     Prometheus)                  │
└──────────────────────┘  └──────────────────────────────────┘
```

### Key Architectural Patterns

1. **Configuration-Driven Design**: All agent behavior defined via YAML with Zod validation
2. **Single-Backend Architecture**: Claude Agent SDK only — no backend abstraction layer, no selector, no provider routing
3. **Tool System**: Hierarchical vectorstore, MCP servers, custom tools (`tool()` + Zod), skills (`SKILL.md`), native Claude Code tools
4. **Anthropic Evaluation Methodology**: Code graders (deterministic) + model graders (Claude-as-judge) + transcript grading. Based on [Anthropic's eval approach](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
5. **Streaming Architecture**: `query()` returns `AsyncGenerator<SDKMessage>` — all responses stream
6. **Hook System**: Lifecycle interception via PreToolUse, PostToolUse, Stop, SubagentStart/Stop

## Project Structure

```
holodeck-ts/
├── README.md                        # User-facing documentation
├── CLAUDE.md                        # AI assistant developer docs (this file)
├── LICENSE
├── package.json                     # Bun package config, bin entry
├── tsconfig.json                    # extends @tsconfig/bun
├── biome.json                       # Biome linting/formatting config
├── bunfig.toml                      # Bun configuration
├── .env.example                     # Environment variable template
│
├── src/
│   ├── index.ts                     # Package entry point + exports
│   │
│   ├── cli/                         # Command-line interface
│   │   ├── index.ts                 # Commander entry point (holodeck command)
│   │   └── commands/
│   │       ├── chat.ts              # holodeck chat
│   │       └── test.ts              # holodeck test
│   │
│   ├── config/                      # Configuration management
│   │   ├── loader.ts                # YAML parsing with env var substitution
│   │   └── schema.ts                # All Zod schemas (Agent, Tools, Evals, etc.) with inline defaults
│   │
│   ├── agent/                       # Claude Agent SDK integration
│   │   ├── executor.ts              # query() wrapper with hook registration
│   │   ├── hooks.ts                 # Hook factories (PreToolUse, PostToolUse, etc.)
│   │   ├── session.ts               # Stateful multi-turn chat session
│   │   └── streaming.ts             # AsyncGenerator streaming handler
│   │
│   ├── tools/                       # Tool implementations
│   │   ├── registry.ts              # Tool registration and lookup
│   │   ├── vectorstore.ts           # Hierarchical vectorstore (contextual retrieval)
│   │   ├── mcp.ts                   # MCP server integration (stdio, HTTP/SSE)
│   │   ├── custom.ts                # Custom tools via tool() + Zod
│   │   └── skills.ts                # SKILL.md discovery and registration
│   │
│   ├── eval/                        # Evaluation framework
│   │   ├── runner.ts                # Test orchestrator (trials, pass@k)
│   │   ├── graders/
│   │   │   ├── code.ts              # Built-in deterministic graders
│   │   │   └── model.ts             # LLM-as-judge graders (output + transcript)
│   │   ├── metrics.ts               # pass@k, pass^k, accuracy calculations
│   │   └── reporter.ts              # Console, JSON, Markdown report output
│   │
│   ├── otel/                        # OpenTelemetry integration
│   │   ├── setup.ts                 # OTel SDK initialization
│   │   ├── spans.ts                 # Custom span helpers (GenAI conventions)
│   │   └── exporters.ts             # OTLP, console, Prometheus config
│   │
│   └── lib/                         # Core utilities
│       ├── errors.ts                # Custom error hierarchy
│       ├── logger.ts                # Structured logging
│       └── env.ts                   # Environment variable resolution
│
├── tests/
│   ├── unit/                        # Unit tests (fast, isolated)
│   │   ├── config/                  # Schema validation tests
│   │   ├── agent/                   # Executor tests
│   │   ├── tools/                   # Tool tests
│   │   └── eval/                    # Grader tests
│   ├── integration/                 # Cross-component tests
│   └── fixtures/                    # Test fixtures
│       ├── agents/                  # Sample agent.yaml files
│       └── data/                    # Test data files
│
├── templates/                       # Project templates for holodeck init
│   ├── research/
│   │   ├── agent.yaml
│   │   └── instructions/
│   └── conversational/
│       ├── agent.yaml
│       └── instructions/
│
└── sample/                          # Example agent projects
    └── research-agent/
        ├── agent.yaml
        ├── instructions/
        └── data/
```

## Development Setup

```bash
# Install dependencies
bun install

# Run CLI in development mode
bun run dev

# Verify installation
bun run dev -- --version
```

### Commands

```bash
bun run dev              # Run CLI in dev mode (bun src/cli/index.ts)
bun test                 # Run all tests
bun test --watch         # Watch mode
bun run lint             # Biome check (formatting + linting)
bun run lint:fix         # Biome auto-fix
bun run format           # Biome format
bun run build            # Build for npm distribution
bun run typecheck        # tsc --noEmit
```

### Environment Configuration

HoloDeck loads environment variables from (priority order):
1. Shell environment variables (highest priority)
2. `.env` in current directory (project-level)
3. `~/.holodeck/.env` (user-level defaults)

Required:
- `ANTHROPIC_API_KEY` — Anthropic API key

For embeddings (depending on provider):
- `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` — Azure OpenAI embeddings
- Ollama runs locally, no API key needed

## Code Quality Standards

### Biome Configuration

Biome handles both linting and formatting (replaces ESLint + Prettier):

```json
{
  "formatter": {
    "indentStyle": "tab",
    "lineWidth": 100
  },
  "linter": {
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" }
    }
  }
}
```

### TypeScript Standards

- Extend `@tsconfig/bun` — strict mode enabled by default
- **No `any`** — use `unknown` + type guards or Zod parsing
- Explicit return types on all exported functions
- Use `type` imports for type-only references: `import type { Agent } from "./schema"`
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use `satisfies` operator for type checking without widening

### Testing Standards

Use Bun's built-in test runner:

```typescript
import { describe, it, expect } from "bun:test";
import { AgentSchema } from "../src/config/schema";

describe("AgentSchema", () => {
  it("parses a valid agent config", () => {
    const raw = {
      name: "test-agent",
      model: { provider: "anthropic", name: "claude-sonnet-4-20250514" },
      instructions: { inline: "You are helpful." },
    };
    const result = AgentSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = AgentSchema.safeParse({ name: "test" });
    expect(result.success).toBe(false);
  });
});
```

**Test structure:** Arrange / Act / Assert pattern. Tests live in `tests/unit/` and `tests/integration/`.

## Key Patterns

### Zod Schemas (Pydantic → Zod)

Every Python Pydantic model maps to a Zod schema. Export both the schema and inferred type:

```typescript
import { z } from "zod";

// Schema
export const LLMProviderSchema = z.object({
  provider: z.literal("anthropic"),
  name: z.string(),
  temperature: z.number().min(0).max(2).default(0.3),
  max_tokens: z.number().int().positive().default(1000),
  auth_provider: z
    .enum(["api_key", "bedrock", "vertex", "foundry"])
    .optional(),
}).strict();

// Inferred type
export type LLMProvider = z.infer<typeof LLMProviderSchema>;
```

**Discriminated unions** for tools and graders:

```typescript
export const ToolSchema = z.discriminatedUnion("type", [
  HierarchicalDocumentToolSchema,
  MCPToolSchema,
]);
export type Tool = z.infer<typeof ToolSchema>;

export const GraderSchema = z.discriminatedUnion("type", [
  CodeGraderSchema,
  ModelGraderSchema,
]);
export type Grader = z.infer<typeof GraderSchema>;
```

### Configuration Loading

```typescript
import { parse } from "yaml";
import { AgentSchema } from "./schema";

export async function loadAgent(path: string) {
  const raw = await Bun.file(path).text();
  const withEnvResolved = resolveEnvVars(raw);
  const parsed = parse(withEnvResolved);
  return AgentSchema.parse(parsed); // throws ZodError if invalid
}
```

### Claude Agent SDK Integration

> **Reference implementations:** Before writing new SDK integration code, consult:
> 1. `/tmp/claude-agent-sdk-demos` — Official demo projects (cloned from [github.com/anthropics/claude-agent-sdk-demos](https://github.com/anthropics/claude-agent-sdk-demos)). Key demos: `email-agent/ccsdk/session.ts` (multi-turn with `resume`), `simple-chatapp/server/session.ts` (message handling), `hello-world/hello-world.ts` (hooks, options).
> 2. The `claude-agent-sdk-skill` slash command — use `/claude-agent-sdk-skill` for up-to-date SDK patterns including `query()`, hooks, MCP servers, custom tools, and permissions.
>
> Always prefer patterns from these references over inventing new SDK integration approaches.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Single invocation with streaming
for await (const message of query({
  prompt: userInput,
  options: {
    allowedTools: agent.claude?.allowed_tools ?? undefined,
    permissionMode: mapPermissionMode(agent.claude?.permission_mode),
    cwd: agent.claude?.working_directory,
    mcpServers: buildMCPConfig(agent.tools),
    hooks: buildHooks(agent),
  },
})) {
  handleMessage(message);
}
```

**Hook registration:**

```typescript
import type { Hook } from "@anthropic-ai/claude-agent-sdk";

function buildHooks(agent: Agent): Record<string, Hook[]> {
  return {
    PreToolUse: [{
      matcher: "*",
      hooks: [async (event) => {
        // Log, block, or modify tool inputs
        span.addEvent("tool.pre", { tool: event.toolName });
        return { allow: true };
      }],
    }],
    PostToolUse: [{
      matcher: "*",
      hooks: [async (event) => {
        // Audit, transform, or append context to results
        span.addEvent("tool.post", { tool: event.toolName });
      }],
    }],
  };
}
```

### Error Handling

Custom error hierarchy — always use `cause` for chaining:

```typescript
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

export class ToolError extends HoloDeckError { /* ... */ }
export class EvalError extends HoloDeckError { /* ... */ }

// Usage
try {
  const config = parse(raw);
} catch (err) {
  throw new ConfigError(`Invalid YAML in ${path}`, { cause: err });
}
```

### Async/Await + Streaming

All I/O uses async/await. Agent responses stream via `AsyncGenerator`:

```typescript
async function* streamChat(
  session: AgentSession,
  input: string,
): AsyncGenerator<ChatEvent> {
  for await (const message of session.send(input)) {
    yield { type: message.type, content: message };
  }
}
```

## YAML Schema Reference

### Agent (Root)

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | Yes | — | Agent identifier |
| `description` | string | No | — | Human-readable description |
| `model` | LLMProvider | Yes | — | LLM configuration |
| `instructions` | Instructions | Yes | — | System instructions (`file` or `inline`, exactly one) |
| `embedding_provider` | EmbeddingProvider | No* | — | *Required with vectorstore tools |
| `tools` | Tool[] | No | [] | Max 50 tools |
| `evaluations` | EvaluationConfig | No | — | Evaluation graders and settings |
| `test_cases` | TestCase[] | No | [] | Max 100 test cases |
| `claude` | ClaudeConfig | No | — | Claude Agent SDK settings |
| `observability` | ObservabilityConfig | No | — | OpenTelemetry settings |

### LLMProvider

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `provider` | `"anthropic"` | Yes | — | Only `anthropic` supported |
| `name` | string | Yes | — | Model name (e.g., `claude-sonnet-4-20250514`) |
| `temperature` | number | No | 0.3 | Range: 0.0-2.0 |
| `max_tokens` | number | No | 1000 | Positive integer |
| `auth_provider` | enum | No | — | `api_key` \| `bedrock` \| `vertex` \| `foundry` |

### EmbeddingProvider

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `provider` | enum | Yes | — | `ollama` \| `azure_openai` |
| `name` | string | Yes | — | Model name (e.g., `text-embedding-ada-002`, `nomic-embed-text`) |
| `endpoint` | string | No* | — | *Required for Azure OpenAI |
| `api_version` | string | No | — | Azure API version |
| `api_key` | string | No | — | API key (prefer env vars) |

### Tools (Discriminated Union on `type`)

#### HierarchicalDocumentTool (`type: "hierarchical_document"`)

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | Yes | — | Pattern: `^[0-9A-Za-z_]+$` |
| `description` | string | Yes | — | Tool description |
| `source` | string | Yes | — | Path to markdown/directory or glob |
| `chunking_strategy` | enum | No | `"structure"` | `structure` \| `token` |
| `max_chunk_tokens` | number | No | 800 | Range: 100-2000 |
| `chunk_overlap` | number | No | 50 | Range: 0-200 |
| `search_mode` | enum | No | `"hybrid"` | `semantic` \| `keyword` \| `exact` \| `hybrid` |
| `top_k` | number | No | 10 | Range: 1-100 |
| `min_score` | number | No | — | Range: 0.0-1.0 |
| `semantic_weight` | number | No | 0.5 | Range: 0.0-1.0 |
| `keyword_weight` | number | No | 0.3 | Range: 0.0-1.0 |
| `exact_weight` | number | No | 0.2 | Range: 0.0-1.0 |
| `contextual_embeddings` | boolean | No | true | Enable [contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval) |
| `context_max_tokens` | number | No | 100 | Range: 50-200 |
| `context_concurrency` | number | No | 10 | Range: 1-50 |
| `database` | Database | No | `{ provider: "in-memory" }` | Vector DB config |

**Constraint:** In hybrid mode, `semantic_weight + keyword_weight + exact_weight` must equal 1.0.

#### MCPTool (`type: "mcp"`)

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | Yes | — | Pattern: `^[0-9A-Za-z_]+$` |
| `description` | string | Yes | — | Tool description |
| `transport` | enum | No | `"stdio"` | `stdio` \| `sse` \| `http` |
| `command` | enum | No* | — | *Required for stdio: `npx` \| `node` \| `docker` |
| `args` | string[] | No | [] | Command arguments |
| `env` | Record | No | {} | Environment variables |
| `url` | string | No* | — | *Required for sse/http |
| `headers` | Record | No | {} | HTTP headers |
| `request_timeout` | number | No | 60 | Seconds |

### Database

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `provider` | enum | Yes | — | `in-memory` \| `postgres` \| `redis` \| `chromadb` |
| `connection_string` | string | No* | — | *Required for postgres, redis, chromadb |

### EvaluationConfig

Based on [Anthropic's evaluation methodology](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) and the [Tool Evaluation Cookbook](https://platform.claude.com/cookbook/tool-evaluation-tool-evaluation).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `trials` | number | No | 1 | Number of trials per test case (k for pass@k) |
| `judge` | LLMProvider | No | — | Model for model graders (defaults to agent model) |
| `graders` | Grader[] | No | [] | Global graders (inherited by all test cases) |

### Graders (Discriminated Union on `type`)

#### Code Grader (`type: "code"`)

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `check` | enum | Yes | — | Built-in check name (see below) |
| `value` | any | No | — | Check-specific parameter |
| `pattern` | string | No | — | Regex pattern (for `regex_match`) |
| `schema` | object | No | — | JSON schema (for `json_schema`) |

**Built-in checks:**

| Check | Description | Extra Fields |
|---|---|---|
| `exact_match` | `ground_truth` appears in response (case-insensitive) | — |
| `regex_match` | Response matches regex | `pattern` (required) |
| `tool_usage` | Agent called exactly `expected_tools` | — |
| `tool_usage_contains` | Agent called at least the listed tools | — |
| `max_duration` | Responded within time budget | `value` (ms, required) |
| `max_turns` | Completed within turn budget | `value` (turns, required) |
| `json_valid` | Response is valid JSON | — |
| `json_schema` | Response matches JSON schema | `schema` (required) |

#### Model Grader (`type: "model"`)

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | Yes | — | Grader identifier |
| `rubric` | string | Yes | — | Natural language evaluation criteria |
| `threshold` | number | No | 0.7 | Pass threshold (0.0-1.0) |
| `context` | enum | No | `"output"` | `output` (final response) \| `transcript` (full execution trace) |

Transcript-based grading follows Anthropic's recommendation to evaluate agent behavior holistically — tool usage efficiency, reasoning quality, and solution approach — not just the final output. See [Demystifying Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

### TestCase

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | No | — | Test case identifier |
| `input` | string | Yes | — | User query or prompt |
| `ground_truth` | string | No | — | Expected output for comparison |
| `expected_tools` | string[] | No | — | Tools expected to be called |
| `graders` | Grader[] | No | — | Per-test overrides (merged with global graders) |

**Grader merge behavior:** Per-test graders are *additive* — they extend the global graders. If a per-test grader has the same `name` as a global model grader, the per-test version overrides it.

### ClaudeConfig

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `working_directory` | string | No | — | Scope file access; subprocess cwd |
| `permission_mode` | enum | No | `"manual"` | `manual` \| `acceptEdits` \| `acceptAll` |
| `max_turns` | number | No | — | Max agent loop iterations |
| `extended_thinking` | object | No | — | `{ enabled: bool, budget_tokens: 1000-100000 }` |
| `web_search` | boolean | No | false | Enable built-in web search |
| `bash` | object | No | — | `{ enabled, excluded_commands[], allow_unsafe }` |
| `file_system` | object | No | — | `{ read, write, edit }` (all boolean) |
| `subagents` | object | No | — | `{ enabled, max_parallel: 1-16 }` |
| `allowed_tools` | string[] | No | null | Explicit tool allowlist (null = all) |
| `setting_sources` | string[] | No | `["project"]` | SDK setting sources: `user`, `project`, `local`. Controls SKILL.md and CLAUDE.md loading |

### ObservabilityConfig

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | boolean | No | false | Enable OpenTelemetry |
| `service_name` | string | No | `"holodeck-{name}"` | OTel service name |
| `traces` | TracingConfig | No | — | `{ enabled, sample_rate, capture_content }` |
| `metrics` | MetricsConfig | No | — | `{ enabled, export_interval_ms }` |
| `logs` | LogsConfig | No | — | `{ enabled, level }` |
| `exporters` | ExportersConfig | No | — | `{ otlp, console, prometheus }` |

## Tool System Design

### Hierarchical Vectorstore

Implements [Anthropic's Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval):

1. **Parse** — structure-aware markdown parsing, preserving heading hierarchy
2. **Chunk** — split into chunks respecting document structure boundaries
3. **Contextualize** — Claude generates concise context (50-100 tokens) per chunk before embedding. Uses prompt caching for cost efficiency (~$1.02/M document tokens)
4. **Embed** — embed contextualized chunks via Ollama or Azure OpenAI
5. **Index** — store in vector DB (in-memory, Postgres, Redis, or ChromaDB)
6. **Search** — hybrid retrieval combining semantic + keyword + exact match with reciprocal rank fusion (RRF). Retrieve top-150, rerank, return top-k

The tool is exposed to the Claude Agent SDK as a custom MCP tool via the `tool()` function.

### MCP Integration

Translates HoloDeck MCP tool configs to Claude Agent SDK `mcpServers` format:

```typescript
function buildMCPConfig(tools: Tool[]): Record<string, MCPServerConfig> {
  const mcpTools = tools.filter((t): t is MCPTool => t.type === "mcp");
  return Object.fromEntries(
    mcpTools.map((t) => [
      t.name,
      t.transport === "stdio"
        ? { command: t.command!, args: t.args, env: t.env }
        : { type: "http", url: t.url!, headers: t.headers },
    ]),
  );
}
```

### Custom Tools

Defined via Claude Agent SDK's `tool()` + Zod:

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const searchTool = tool(
  "search_knowledge_base",
  "Search the product knowledge base",
  { query: z.string(), top_k: z.number().optional() },
  async (args) => {
    const results = await vectorstore.search(args.query, args.top_k);
    return { results };
  },
);
```

Tool design follows [Anthropic's principles](https://www.anthropic.com/engineering/writing-tools-for-agents): consolidate low-level operations, provide actionable error messages, control token efficiency, use namespacing for organization.

### Skills

SKILL.md files in `.claude/skills/*/SKILL.md` are auto-discovered by the Claude Agent SDK when `setting_sources` includes `"project"` (the default). The SDK handles frontmatter parsing, system prompt injection, and provides a built-in `Skill` tool for invocation. Configure via `claude.setting_sources` in `agent.yaml`.

Skill metadata (name, description) is available at runtime via `query.supportedCommands()` and displayed in the TUI sidebar.

## Evaluation Framework

Based on [Anthropic's agent evaluation methodology](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) and the [Tool Evaluation Cookbook](https://platform.claude.com/cookbook/tool-evaluation-tool-evaluation).

### Runner Architecture

```
Load Config → Instantiate Agent → For each test case:
  → Run k trials (configurable)
    → Execute agent with input
    → Collect transcript (tool calls, intermediate steps, final output)
    → Apply all graders (global + per-test overrides)
    → Record pass/fail per grader per trial
  → Calculate metrics (pass@k, pass^k, accuracy)
→ Generate report (console, JSON, Markdown)
```

### Code Graders

Built-in deterministic checks — fast, cheap, reproducible:

```typescript
const CODE_GRADERS: Record<string, CodeGraderFn> = {
  exact_match: (result, testCase) =>
    result.response.toLowerCase().includes(testCase.ground_truth!.toLowerCase()),
  tool_usage: (result, testCase) =>
    arraysEqual(result.toolCalls.map(t => t.name), testCase.expected_tools!),
  tool_usage_contains: (result, testCase) =>
    testCase.expected_tools!.every(t => result.toolCalls.some(c => c.name === t)),
  max_duration: (result, _testCase, grader) =>
    result.durationMs <= grader.value,
  max_turns: (result, _testCase, grader) =>
    result.numTurns <= grader.value,
  json_valid: (result) => isValidJSON(result.response),
  // ...
};
```

### Model Graders

Claude-as-judge with configurable context:

- **`context: "output"`** — judge sees: input + final response + ground_truth (if provided)
- **`context: "transcript"`** — judge sees: input + full execution trace (all tool calls, intermediate reasoning) + final response

The judge model scores against the rubric on a 1-5 scale, normalized to 0.0-1.0.

### Metrics

- **pass@k** — `1 - C(n-c, k) / C(n, k)` where n=trials, c=successes, k=attempts
- **pass^k** — `(c/n)^k` — all k trials must succeed
- **accuracy** — simple success rate across all graders
- **tool_usage_accuracy** — percentage of test cases where expected tools were called correctly
- **avg_duration** — mean execution time across trials

## OTel Integration

### Setup

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

export function initOtel(config: ObservabilityConfig, agentName: string) {
  const sdk = new NodeSDK({
    serviceName: config.service_name ?? `holodeck-${agentName}`,
    traceExporter: new OTLPTraceExporter({
      url: config.exporters?.otlp?.endpoint,
    }),
    // ...
  });
  sdk.start();
}
```

### GenAI Semantic Conventions

Follow OpenTelemetry [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/):

- `gen_ai.system` = `"anthropic"`
- `gen_ai.request.model` = model name
- `gen_ai.request.temperature` = temperature
- `gen_ai.request.max_tokens` = max_tokens
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`

### Custom Spans

- `holodeck.agent.invoke` — full agent invocation
- `holodeck.tool.{name}` — individual tool calls
- `holodeck.eval.trial` — evaluation trial execution
- `holodeck.eval.grader.{name}` — individual grader execution
- `holodeck.vectorstore.search` — vector search operations
- `holodeck.vectorstore.contextualize` — contextual embedding generation

## Do's and Don'ts

### DO's

1. **DO use Zod** for all external data validation (YAML configs, API inputs)
2. **DO export types** alongside schemas: `export type X = z.infer<typeof XSchema>`
3. **DO use `Bun.file()`** and `Bun.write()` for file I/O
4. **DO use async/await** everywhere — never block the event loop
5. **DO use `structuredClone()`** for deep copies (not spread)
6. **DO use discriminated unions** for tool types and grader types
7. **DO chain errors** with `{ cause: err }` option
8. **DO use type-only imports**: `import type { X } from "./schema"`
9. **DO write tests** for every Zod schema and grader
10. **DO use the Claude Agent SDK hooks system** for lifecycle events

### DON'Ts

1. **DON'T use `any`** — use `unknown` and narrow with Zod or type guards
2. **DON'T use `require()`** — always ESM imports
3. **DON'T use `console.log`** in library code — use structured logger
4. **DON'T use `node:` built-ins** when Bun native APIs exist (e.g., use `Bun.file()` not `fs.readFile()`)
5. **DON'T skip Zod validation** on external input (YAML, env vars, API responses)
6. **DON'T add Semantic Kernel**, DeepEval, or any non-Claude agent framework
7. **DON'T add NLP metrics** (BLEU, ROUGE, METEOR) — use Anthropic eval methodology only
8. **DON'T diverge from the YAML schema** documented in this file without updating this doc
9. **DON'T use mutable default arguments** — use `| undefined` and default in function body
10. **DON'T use `print()`/`console.log()`** in CLI — use Commander's output or structured logger

## Git Commit Guidelines

- **Conventional commits:** `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`
- **Scoped:** `feat(cli):`, `fix(eval):`, `test(config):`, `refactor(tools):`
- **Do NOT attribute Claude Code** in commit messages
- Keep commits atomic and focused
- Write clean commit messages focused on the "why"

## Additional Resources

- [Claude Agent SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos) — Official reference implementations (local clone: `/tmp/claude-agent-sdk-demos`)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Anthropic Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)
- [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Tool Evaluation Cookbook](https://platform.claude.com/cookbook/tool-evaluation-tool-evaluation)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Zod Documentation](https://zod.dev)
- [Bun Documentation](https://bun.sh/docs)
- [Biome Documentation](https://biomejs.dev)
- [Commander Documentation](https://github.com/tj/commander.js)

## OpenTUI (@opentui/core) Patterns

**CRITICAL: VNode Proxy vs Renderable** — OpenTUI has two APIs:

1. **Construct API** (`Text()`, `Box()`) — returns a `ProxiedVNode`. After tree insertion, setting properties on the VNode proxy does **NOT** propagate to the real renderable. Use only for static content.
2. **Renderable API** (`new TextRenderable(renderer, ...)`, `new BoxRenderable(renderer, ...)`) — returns the real renderable instance. Property changes propagate immediately. **Use for any content that needs post-insertion updates.**

```typescript
// WRONG — VNode proxy, updates won't render:
const label = Text({ id: "label", content: "initial" });
container.add(label);
label.content = "updated"; // ❌ Silently ignored after tree insertion

// CORRECT — real renderable, updates render:
const label = new TextRenderable(renderer, { id: "label", content: "initial" });
container.add(label);
label.content = "updated"; // ✅ Renders immediately
```

**Other OpenTUI Rules:**
- `container.add()` is **not variadic** — call once per child: `container.add(a); container.add(b);`
- `TextareaRenderable.plainText` is **read-only** — use `textarea.setText("")` to clear
- `ScrollBoxRenderable`: use `stickyScroll: true` + `stickyStart: "bottom"` for auto-scroll to latest content
- `MarkdownRenderable`: has `streaming: true` mode, but for buffer-then-render use `TextRenderable` while streaming, swap to `MarkdownRenderable` on completion
- `findDescendantById()` returns real renderables from a container, but only works reliably when called on a real `BoxRenderable` instance, not on a VNode proxy cast

## Active Technologies
- TypeScript 5.8.3 (strict, `@tsconfig/bun`) + `@anthropic-ai/claude-agent-sdk` 0.2.87, `commander` 14.0.3, `zod` 4.3.6, `yaml` 2.8.3, `marked` 15.0.12, `marked-terminal` 7.3.0, `remend` 1.3.0, `logtape` 2.0.5, `@opentui/core` 0.1.93 (001-holodeck-chat)
- In-memory only (session state, no persistence) (001-holodeck-chat)

## Recent Changes
- 001-holodeck-chat: Added chat feature dependencies (`marked`, `marked-terminal`, `remend`, `logtape`)
- 001-holodeck-chat: Added OpenTUI-based TUI replacing readline chat REPL
