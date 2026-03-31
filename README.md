# HoloDeck TypeScript

**No-code AI agent experimentation platform — TypeScript edition.**

Build, test, and evaluate AI agents through pure YAML configuration. Built exclusively on the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview).

[![npm version](https://img.shields.io/npm/v/holodeck-ts)](https://www.npmjs.com/package/holodeck-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

---

## Features

- **No-code agent definition** — define agents, tools, evaluations, and test cases entirely in YAML
- **Claude Agent SDK native** — built exclusively on Anthropic's [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript) for TypeScript
- **Structured output** — schema-enforced agent responses for deterministic, machine-readable output
- **Interactive chat** (`holodeck chat`) — streaming conversations with your agents
- **Test runner** (`holodeck test`) — run test cases with [Anthropic-style evaluation](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- **Hierarchical vectorstore** — contextual retrieval using [Anthropic's methodology](https://www.anthropic.com/engineering/contextual-retrieval)
- **MCP support** — connect to any [Model Context Protocol](https://modelcontextprotocol.io/) server (stdio, HTTP/SSE)
- **Custom tools** — define tools via `tool()` + Zod schemas
- **Skills** — reusable capabilities via `SKILL.md` files
- **Hooks** — intercept agent behavior (PreToolUse, PostToolUse, Stop, SubagentStart/Stop)
- **Subagents** — parallel sub-agent execution with tool restrictions
- **OpenTelemetry** — built-in observability with GenAI semantic conventions

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) 1.x+
- Authentication (one of):
  - `ANTHROPIC_API_KEY` — Anthropic API key (recommended for production)
  - `CLAUDE_CODE_OAUTH_TOKEN` — OAuth token for personal development use only

### Install

```bash
bun add -g holodeck-ts
```

### Create an Agent

```yaml
# agent.yaml
name: research-assistant
description: A research assistant that searches knowledge bases

model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  temperature: 0.3
  max_tokens: 4096

instructions:
  inline: |
    You are a helpful research assistant. Use the knowledge base
    to answer questions accurately. Always cite your sources.

tools:
  - name: knowledge_base
    type: hierarchical_document
    description: Search the research knowledge base
    source: ./docs/
    search_mode: hybrid
    contextual_embeddings: true

claude:
  permission_mode: acceptEdits
  web_search: true
  subagents:
    enabled: true
    max_parallel: 4
```

### Chat

```bash
holodeck chat
# or specify a config
holodeck chat --agent path/to/agent.yaml
```

### Test

```bash
holodeck test
# verbose output
holodeck test -v
# save report
holodeck test --output report.md --format markdown
```

## YAML Configuration

HoloDeck agents are defined entirely in YAML. Here is a comprehensive example:

```yaml
name: customer-support-agent
description: Handles customer inquiries with knowledge base access

model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  temperature: 0.3
  max_tokens: 4096
  auth_provider: api_key  # api_key | bedrock | vertex | foundry

instructions:
  file: ./instructions/support.md  # or use inline:

embedding_provider:
  provider: azure_openai  # azure_openai | ollama
  name: text-embedding-ada-002
  endpoint: https://my-instance.openai.azure.com
  api_version: "2024-10-21"

tools:
  # Hierarchical vectorstore with contextual retrieval
  - name: knowledge_base
    type: hierarchical_document
    description: Search product documentation
    source: ./docs/products/
    chunking_strategy: structure      # structure | token
    max_chunk_tokens: 800
    search_mode: hybrid               # semantic | keyword | exact | hybrid
    top_k: 10
    contextual_embeddings: true       # Anthropic contextual retrieval
    context_max_tokens: 100
    database:
      provider: postgres              # in-memory | postgres | redis | chromadb
      connection_string: postgresql://user:pass@localhost:5432/holodeck

  # MCP server (stdio transport)
  - name: github
    type: mcp
    description: GitHub integration
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: ${GITHUB_TOKEN}

  # MCP server (HTTP transport)
  - name: internal_api
    type: mcp
    description: Internal API access
    transport: http
    url: https://api.internal.com/mcp
    headers:
      Authorization: Bearer ${API_TOKEN}

# Claude Agent SDK configuration
claude:
  working_directory: ./workspace
  permission_mode: acceptEdits        # manual | acceptEdits | acceptAll
  max_turns: 25
  extended_thinking:
    enabled: true
    budget_tokens: 10000
  web_search: true
  bash:
    enabled: true
    excluded_commands: [rm, sudo]
    allow_unsafe: false
  file_system:
    read: true
    write: true
    edit: true
  subagents:
    enabled: true
    max_parallel: 4
  allowed_tools:                      # null = all tools available
    - knowledge_base                  # HoloDeck tool (by name from tools[])
    - github                          # HoloDeck MCP tool (by name from tools[])
    - Read                            # Claude Code built-in tool
    - Write
    - Bash

# Evaluation configuration (Anthropic methodology)
evaluations:
  trials: 3                           # k for pass@k / pass^k
  judge:
    provider: anthropic
    name: claude-sonnet-4-20250514
    temperature: 0.0
  graders:
    # Code graders (deterministic, no LLM)
    - type: code
      check: tool_usage               # did agent call expected_tools?
    - type: code
      check: max_duration
      value: 10000                    # milliseconds

    # Model graders (Claude-as-judge)
    - type: model
      name: helpfulness
      context: output                 # judge sees final response only
      rubric: |
        Score 1-5: Does the response provide accurate,
        actionable information that addresses the customer's concern?
      threshold: 0.8
    - type: model
      name: reasoning_quality
      context: transcript             # judge sees full execution trace
      rubric: |
        Score 1-5: Did the agent use tools efficiently
        without unnecessary loops or redundant searches?
      threshold: 0.7

# Test cases
test_cases:
  - name: "Refund policy inquiry"
    input: "What is your refund policy for premium plans?"
    ground_truth: "30-day money-back guarantee on all premium plans"
    expected_tools: [knowledge_base]
    # Per-test grader overrides (merged with global graders)
    graders:
      - type: model
        name: factual_accuracy
        rubric: "Response must mention 30-day guarantee and premium plans"
        threshold: 0.9

  - name: "GitHub issue lookup"
    input: "Show me the latest open issues in our main repo"
    expected_tools: [github]

  - name: "General greeting"
    input: "Hello, I need help with my account"

# OpenTelemetry observability
observability:
  enabled: true
  service_name: customer-support-agent
  traces:
    enabled: true
    sample_rate: 1.0
    capture_content: false
  metrics:
    enabled: true
    export_interval_ms: 5000
  logs:
    enabled: true
    level: INFO
  exporters:
    otlp:
      enabled: true
      endpoint: http://localhost:4318
      protocol: http
    console:
      enabled: false
```

## CLI Commands

### MVP

| Command | Description |
|---|---|
| `holodeck chat [--agent <path>]` | Interactive chat session with streaming |
| `holodeck test [config]` | Run test cases with evaluation grading |

**`holodeck test` options:**

| Option | Description |
|---|---|
| `--output <path>` | Save report to file (JSON or Markdown) |
| `--format <fmt>` | Report format: `json` or `markdown` |
| `--verbose, -v` | Verbose output with debug information |
| `--quiet, -q` | Summary only |
| `--timeout <seconds>` | LLM execution timeout |

**Exit codes:** 0 = all passed, 1 = failures, 2 = config error, 3 = execution error

### Roadmap

| Command | Description |
|---|---|
| `holodeck init` | Scaffold a new agent project from templates |
| `holodeck serve` | Serve agent as REST API or AG-UI endpoint |
| `holodeck deploy` | Deploy agent container to Azure, AWS, or GCP |

## Tool Types

### Hierarchical Vectorstore

Implements [Anthropic's Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval) methodology:
- Structure-aware chunking that preserves document hierarchy
- Contextual embeddings — Claude generates concise context for each chunk before embedding
- Hybrid search combining semantic, keyword, and exact match with reciprocal rank fusion
- Supports in-memory, Postgres, Redis, and ChromaDB backends
- Embedding providers: Ollama, Azure OpenAI

### MCP Servers

Connect to any [Model Context Protocol](https://modelcontextprotocol.io/) server:
- **stdio** — local processes (npx, node, docker)
- **HTTP/SSE** — remote servers with auth headers

### Custom MCP Tools

Define tools programmatically using the Claude Agent SDK's `tool()` function with Zod schemas. Designed following [Anthropic's tool design principles](https://www.anthropic.com/engineering/writing-tools-for-agents).

### Skills

Reusable agent capabilities defined as `SKILL.md` files. Skills are automatically discovered from `.claude/skills/*/SKILL.md` in the project directory and injected into the agent's system prompt by the Claude Agent SDK.

**Creating a skill:**

```
your-project/
  .claude/
    skills/
      deploy/
        SKILL.md
      research/
        SKILL.md
```

Each `SKILL.md` supports optional YAML frontmatter:

~~~markdown
---
name: deploy
description: Automated deployment pipeline with zero-downtime rolling updates
---

# Deploy Skill

Run the deploy pipeline for any environment.

## Usage

The agent will invoke this skill when deployment tasks are requested.
~~~

- `name` — skill identifier (defaults to directory name if omitted)
- `description` — shown in skill listings; helps the agent decide when to invoke the skill
- The markdown body becomes the skill's instructions, injected into the system prompt

**Configuration:**

Skills are loaded when `setting_sources` includes `"project"` (the default):

```yaml
claude:
  setting_sources: ["project"]  # default — enables skill auto-discovery
```

Set `setting_sources: []` to disable skill loading. The built-in `Skill` tool must be available (included in `allowed_tools` or `allowed_tools: null`).

### Native Claude Code Tools

Full access to built-in Claude Code tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch.

### `allowed_tools` Reference

The `claude.allowed_tools` field controls which tools are auto-approved without permission prompts. Set to `null` (default) for all tools. Values are **case-sensitive strings** from three categories:

**HoloDeck-defined tools** — the `name` field from your `tools[]` entries:

```yaml
allowed_tools:
  - knowledge_base    # matches tools[].name
  - github            # matches tools[].name
```

**Claude Code built-in tools:**

| Tool | Description | | Tool | Description |
|------|-------------|-|------|-------------|
| `Read` | Read files | | `WebFetch` | Fetch URL content |
| `Write` | Create/overwrite files | | `WebSearch` | Web search |
| `Edit` | Targeted file edits | | `Agent` | Spawn subagents |
| `Bash` | Shell commands | | `Skill` | Execute skills |
| `Glob` | Find files by pattern | | `NotebookEdit` | Edit Jupyter notebooks |
| `Grep` | Search file contents | | `AskUserQuestion` | Ask user questions |

<details>
<summary>Full list of built-in tools</summary>

`Agent`, `AskUserQuestion`, `Bash`, `CronCreate`, `CronDelete`, `CronList`, `Edit`, `EnterPlanMode`, `EnterWorktree`, `ExitPlanMode`, `ExitWorktree`, `Glob`, `Grep`, `ListMcpResourcesTool`, `LSP`, `NotebookEdit`, `PowerShell`, `Read`, `ReadMcpResourceTool`, `Skill`, `TaskCreate`, `TaskGet`, `TaskList`, `TaskOutput`, `TaskStop`, `TaskUpdate`, `TodoWrite`, `ToolSearch`, `WebFetch`, `WebSearch`, `Write`

</details>

**MCP server tools** — referenced as `mcp__<serverName>__<toolName>`:

```yaml
allowed_tools:
  - mcp__playwright__navigate
  - mcp__github__search_issues
```

> **Note:** `allowed_tools` auto-approves listed tools but does not restrict the agent to only those tools. Unlisted tools fall through to the `permission_mode` setting. For a locked-down agent, combine `allowed_tools` with `permission_mode: manual`.

## Evaluation

HoloDeck adopts [Anthropic's approach to agent evaluation](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), built around the [Tool Evaluation Cookbook](https://platform.claude.com/cookbook/tool-evaluation-tool-evaluation).

### Methodology

- **Task-based evaluation** — define input, run agent, grade results
- **Multiple trials** — configurable `trials` count for statistical robustness
- **pass@k** — probability of at least one success in k trials
- **pass^k** — probability all k trials succeed (production reliability metric)

### Grader Types

**Code graders** — deterministic, no LLM required:

| Check | Description |
|---|---|
| `exact_match` | Ground truth appears in response |
| `regex_match` | Response matches a regex pattern |
| `tool_usage` | Agent called exactly the expected tools |
| `tool_usage_contains` | Agent called at least the listed tools |
| `max_duration` | Response within time budget (ms) |
| `max_turns` | Completed within turn budget |
| `json_valid` | Response is valid JSON |
| `json_schema` | Response matches a JSON schema |

**Model graders** — Claude-as-judge with natural language rubrics:

| Field | Description |
|---|---|
| `name` | Grader identifier |
| `rubric` | Natural language evaluation criteria |
| `threshold` | Minimum score to pass (0.0-1.0) |
| `context` | `output` (final response) or `transcript` (full execution trace) |

Transcript-based grading lets the judge evaluate the agent's full behavior — tool usage patterns, reasoning quality, efficiency — not just the final output.

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
│  ├─ Zod Schemas: Agent, Tools, Evals, Claude, OTel         │
│  └─ Defaults: Sensible defaults for all optional fields     │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Agent Executor (Claude Agent SDK)               │
│  ├─ query(): Streaming agent invocation                     │
│  ├─ Hooks: PreToolUse, PostToolUse, Stop, Subagent*        │
│  ├─ Subagents: Parallel sub-agent execution                 │
│  ├─ Skills: SKILL.md auto-discovery                         │
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
│  ├─ pass@k / pass^k  │  │  └─ Exporters (OTLP, Console)   │
│  └─ Reporter         │  │                                  │
└──────────────────────┘  └──────────────────────────────────┘
```

## Development

### Setup

```bash
git clone https://github.com/yourorg/holodeck-ts.git
cd holodeck-ts
bun install
```

### Commands

```bash
bun run dev          # Run CLI in development mode
bun test             # Run all tests
bun test --watch     # Watch mode
bun run lint         # Biome check
bun run lint:fix     # Biome auto-fix
bun run format       # Biome format
bun run build        # Build for distribution
bun run typecheck    # tsc --noEmit
```

### Tech Stack

| Category | Choice |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript 5.x (strict) |
| CLI | [Commander](https://github.com/tj/commander.js) |
| Validation | [Zod](https://zod.dev) |
| Agent SDK | [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) |
| Linting/Formatting | [Biome](https://biomejs.dev) |
| Testing | [Bun test](https://bun.sh/docs/cli/test) |
| Logging | [LogTape](https://logtape.org/) (OTel-ready via [@logtape/otel](https://logtape.org/sinks/otel)) |
| Observability | [OpenTelemetry](https://opentelemetry.io/) |
| Markdown Rendering | [marked](https://marked.js.org/) + [marked-terminal](https://github.com/mikaelbr/marked-terminal) |
| Config | [yaml](https://www.npmjs.com/package/yaml) + Zod |

## Roadmap

- [ ] `holodeck chat` — interactive streaming chat
- [ ] `holodeck test` — test runner with evaluation
- [ ] Structured output — schema-enforced agent responses
- [ ] OpenTelemetry integration
- [ ] Hierarchical vectorstore with contextual retrieval
- [ ] MCP server support (stdio, HTTP/SSE)
- [ ] Custom tools via `tool()` + Zod
- [ ] Skills and hooks support
- [ ] `holodeck init` — project scaffolding
- [ ] `holodeck serve` — REST API and AG-UI endpoint
- [ ] `holodeck deploy` — container deployment (Azure, AWS, GCP)
- [ ] Custom code graders (`.ts` files)
- [ ] Grader profiles (named, reusable grader sets)

## References

- [Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval) — Anthropic's approach to enhancing RAG with contextual embeddings
- [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — Evaluation methodology: code graders, model graders, pass@k
- [Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — Tool design principles for AI agents
- [Tool Evaluation Cookbook](https://platform.claude.com/cookbook/tool-evaluation-tool-evaluation) — Systematic tool testing and evaluation
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) — SDK documentation
- [Claude Agent SDK TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript) — TypeScript API reference

## License

MIT
