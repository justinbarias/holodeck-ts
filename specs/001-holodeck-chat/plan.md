# Implementation Plan: HoloDeck Chat

**Branch**: `001-holodeck-chat` | **Date**: 2026-03-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-holodeck-chat/spec.md`

## Summary

Implement an interactive CLI chat command (`holodeck chat`) that loads YAML agent configurations, validates them with Zod, and provides a streaming multi-turn conversation experience powered by the Claude Agent SDK. The chat supports MCP tool integration, SKILL.md auto-discovery, terminal markdown rendering, and configurable permission modes.

## Technical Context

**Language/Version**: TypeScript 5.8.3 (strict, `@tsconfig/bun`)
**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.2.87, `commander` 14.0.3, `zod` 4.3.6, `yaml` 2.8.3, `marked` 15.0.12, `marked-terminal` 7.3.0, `remend` 1.3.0, `logtape` 2.0.5
**Storage**: In-memory only (session state, no persistence)
**Testing**: `bun:test` (Bun built-in test runner)
**Target Platform**: Linux/macOS CLI (Bun runtime >= 1.0.0)
**Project Type**: CLI application + library
**Performance Goals**: Config load + session init < 5s (SC-001), first token < 2s (SC-002), 20+ turn conversations (SC-003)
**Constraints**: Single-backend (Anthropic only), no `any` types, no `console.log` in library/CLI code, Biome linting enforced
**Scale/Scope**: Single-user CLI sessions, ephemeral state

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Claude Agent SDK Exclusivity | **PASS** | All agent execution via `query()` from SDK. No other frameworks. |
| II. Configuration-Driven Design | **PASS** | All behavior defined via YAML + Zod schemas. No code-only features. |
| III. Modern TypeScript Strictness | **PASS** | Strict mode via `@tsconfig/bun`. No `any`. Explicit return types on exports. ESM only. |
| IV. Zod-First Validation | **PASS** | All YAML config validated through Zod. `z.strictObject()` for unknown field rejection. Discriminated unions for tool types. |
| V. Test Discipline | **PASS** | `bun:test` for all tests. Schemas get positive + negative cases. Arrange/Act/Assert. |
| VI. Anthropic Evaluation Methodology | **N/A** | Evaluation is out of scope for chat feature. |
| VII. Streaming & Async-Only I/O | **PASS** | `query()` returns `AsyncGenerator<SDKMessage>`. File I/O via `Bun.file()`. No `console.log`. |
| VIII. Observability by Design | **PASS** | LogTape structured logging to stderr with `--verbose` flag. OTel-ready via `@logtape/otel` sink (added when OTel feature lands). Hooks are in place for future trace integration. |

### Post-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. SDK Exclusivity | **PASS** | `query()`, `tool()`, hooks, MCP config — all SDK-native. |
| II. Configuration-Driven | **PASS** | `AgentConfigSchema` fully expressible in YAML. Env var substitution supported. |
| III. TypeScript Strictness | **PASS** | All schemas export types via `z.infer<>`. `type` imports used. Zod v4 patterns applied. |
| IV. Zod-First | **PASS** | 10+ schemas defined with strict mode, defaults, custom error messages. |
| V. Test Discipline | **PASS** | Schema tests, loader tests, session tests planned. |
| VII. Streaming | **PASS** | `ChatEvent` AsyncGenerator maps SDK messages to render events. `remend` handles partial markdown. |
| VIII. Observability | **PASS** | LogTape structured logging to stderr with `--verbose` flag. OTel-ready via `@logtape/otel` sink (added when OTel feature lands). |
| Technology Constraints | **PASS** | Bun, TypeScript, Commander, Zod, Biome, `bun:test`, `yaml` — all per constitution. |
| Dependency Policy | **PASS** | 4 new deps: `marked`, `marked-terminal`, `remend` for FR-007 (terminal markdown); `logtape` for structured logging with OTel path. All zero or minimal transitive deps. Bun built-ins used where possible (`node:readline`, `.env` loading, `Bun.file()`). |

**GATE RESULT: PASS** — No violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-holodeck-chat/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: dependency research, API findings
├── data-model.md        # Phase 1: entities, schemas, state machines
├── quickstart.md        # Phase 1: usage guide
├── contracts/
│   ├── cli.md           # CLI interface contract
│   └── modules.md       # Internal module interface contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── index.ts                     # Package entry point + exports
│
├── cli/
│   ├── index.ts                 # Commander entry point (holodeck command)
│   ├── commands/
│   │   └── chat.ts              # holodeck chat command + interactive loop
│   └── render.ts                # Terminal markdown rendering (marked + marked-terminal + remend)
│
├── config/
│   ├── loader.ts                # YAML parsing, env var resolution, file loading
│   └── schema.ts                # All Zod schemas + inferred types
│
├── agent/
│   ├── session.ts               # ChatSession lifecycle (create, send, interrupt, close)
│   ├── hooks.ts                 # SDK hook builders (PreToolUse, PostToolUse, PreCompact, etc.)
│   ├── permissions.ts           # canUseTool callback for manual permission mode
│   └── streaming.ts             # SDKMessage → ChatEvent mapper (AsyncGenerator)
│
├── tools/
│   ├── mcp.ts                   # YAML MCP tool config → SDK McpServerConfig mapping
│   └── skills.ts                # SKILL.md auto-discovery from .claude/skills/
│
└── lib/
    ├── errors.ts                # HoloDeckError, ConfigError, ToolError + formatZodError
    ├── logger.ts                # LogTape setup + getModuleLogger() (stderr only, OTel-ready)
    └── env.ts                   # ~/.holodeck/.env loading, env var resolution

tests/
├── unit/
│   ├── config/
│   │   ├── schema.test.ts       # Zod schema positive + negative cases
│   │   └── loader.test.ts       # Config loading, env var resolution
│   ├── agent/
│   │   ├── session.test.ts      # Session lifecycle
│   │   ├── hooks.test.ts        # Hook builder tests
│   │   ├── permissions.test.ts  # Permission callback tests
│   │   └── streaming.test.ts    # SDKMessage → ChatEvent mapping
│   ├── tools/
│   │   ├── mcp.test.ts          # MCP config mapping
│   │   └── skills.test.ts       # Skill discovery
│   └── lib/
│       ├── errors.test.ts       # Error formatting
│       └── env.test.ts          # Env var resolution
├── integration/
│   └── chat.test.ts             # End-to-end chat flow (requires API key)
└── fixtures/
    ├── agents/
    │   ├── valid-minimal.yaml   # Minimal valid config
    │   ├── valid-full.yaml      # Full config with all optional fields
    │   ├── valid-mcp-tools.yaml # Config with MCP tools
    │   ├── invalid-missing.yaml # Missing required fields
    │   ├── invalid-types.yaml   # Wrong field types
    │   └── invalid-unknown.yaml # Unknown fields (strict rejection)
    ├── skills/
    │   └── .claude/skills/
    │       ├── greet/SKILL.md
    │       └── invalid/SKILL.md
    └── instructions/
        └── system.md            # Sample instructions file
```

**Structure Decision**: Single-project CLI structure per CLAUDE.md project structure. No frontend/backend split — this is a pure CLI application. Source code follows the existing `src/` layout with `cli/`, `config/`, `agent/`, `tools/`, `lib/` modules already scaffolded.

## Complexity Tracking

> No constitution violations. No complexity justifications needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *None* | — | — |
