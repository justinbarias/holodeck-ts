# Tasks: User Story 1 — Load Agent Configuration and Start Chat

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29
**User Story**: US1 — Load Agent Configuration and Start Chat (P1)
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](./data-model.md)
**Contracts**: [modules.md](./contracts/modules.md) | [cli.md](./contracts/cli.md)

> **Note**: Task IDs are scoped to this file. Cross-file references use the format `tasks-usX.md#TXXX`.
>
> **Coding Standard**: All exported functions MUST have explicit return type annotations per CLAUDE.md.

## Dependency Legend

- **Blocks**: downstream tasks that cannot start until this task is complete
- **Depends on**: upstream tasks that must be complete before this task starts
- **[P]**: parallelizable — can be worked on simultaneously with other [P] tasks in the same group

## Existing State

The repository already has:
- Scaffolded `src/` directories (`cli/`, `config/`, `agent/`, `tools/`, `lib/`)
- Stub files (1-line placeholders) for most modules
- `src/lib/errors.ts` — `HoloDeckError`, `ConfigError`, `ToolError`, `HoloDeckEvalError` (27 lines, functional)
- `src/lib/env.ts` — basic `resolveEnvVars()` (5 lines, partial)
- `src/lib/logger.ts` — placeholder console logger (16 lines, needs replacement with LogTape)
- `src/cli/index.ts` — Commander scaffolding with placeholder chat/test commands (28 lines)
- `biome.json` — configured (tabs, 100 width, no `any`)
- `package.json` — core deps listed (missing `marked`, `marked-terminal`, `remend`, `logtape`)
- `tests/unit/cli.test.ts` — exists (needs review)
- `tests/fixtures/agents/` and `tests/fixtures/data/` — directories exist, empty

---

## Phase 1: Setup

> Project structure, dependencies, and base configuration. No story label — these are prerequisites for ALL user stories.

- [x] T001 [P] Install chat feature dependencies (`marked`, `marked-terminal`, `remend`, `logtape`) via `bun add`; verify `package.json` updated
  - File: `package.json`
  - Blocks: T005, T006, T010

- [x] T002 [P] Create test fixture `tests/fixtures/agents/valid-minimal.yaml` — minimal valid config (name, model, inline instructions only)
  - File: `tests/fixtures/agents/valid-minimal.yaml`
  - Blocks: T011, T012

- [x] T003 [P] Create test fixture `tests/fixtures/agents/valid-full.yaml` — full config with all optional fields (description, claude config, tools array)
  - File: `tests/fixtures/agents/valid-full.yaml`
  - Blocks: T011, T012

- [x] T004 [P] Create test fixture `tests/fixtures/agents/invalid-missing.yaml` (missing required `model` field), `tests/fixtures/agents/invalid-types.yaml` (wrong types, e.g., temperature as string), `tests/fixtures/agents/invalid-unknown.yaml` (unknown fields that strict mode rejects)
  - Files: `tests/fixtures/agents/invalid-missing.yaml`, `tests/fixtures/agents/invalid-types.yaml`, `tests/fixtures/agents/invalid-unknown.yaml`
  - Blocks: T011, T012

- [x] T005 [P] Create test fixture `tests/fixtures/instructions/system.md` — sample markdown instructions file for `instructions.file` testing
  - File: `tests/fixtures/instructions/system.md`
  - Blocks: T012

- [x] T006 Verify project builds and lints cleanly after dependency install: run `bun run typecheck`, `bun run lint`, `bun test`
  - Depends on: T001
  - Blocks: Phase 2

### Checkpoint: Phase 1

All fixture files exist. Dependencies installed. Project builds, lints, and typechecks cleanly. No test failures from existing tests.

---

## Phase 2: Foundational

> Core infrastructure that ALL user stories depend on. No story label. TDD: write tests first, verify they fail, then implement.

### Error Hierarchy + Formatting

- [x] T007 Write test file `tests/unit/lib/errors.test.ts` — test `HoloDeckError`, `ConfigError`, `ToolError` inheritance and `cause` chaining; test `formatZodError()` produces human-readable multi-line output with field paths and constraint messages; verify formatting includes the file path in the header
  - File: `tests/unit/lib/errors.test.ts`
  - Depends on: T006
  - Blocks: T008

- [x] T008 Implement `formatZodError(error: ZodError, filePath: string): string` in `src/lib/errors.ts` — format Zod validation errors into human-readable output per the contract (arrow-prefixed field paths, constraint messages). Existing error classes are already implemented; only add `formatZodError`.
  - File: `src/lib/errors.ts`
  - Depends on: T007
  - Blocks: T012, T018

### Logger (LogTape)

- [x] T009 Write test file `tests/unit/lib/logger.test.ts` — test `setupLogging()` configures LogTape without throwing; test `getModuleLogger("config")` returns a logger with category `["holodeck", "config"]`; test verbose mode sets debug level
  - File: `tests/unit/lib/logger.test.ts`
  - Depends on: T001, T006
  - Blocks: T010

- [x] T010 Replace placeholder logger in `src/lib/logger.ts` with LogTape implementation — `setupLogging({ verbose: boolean }): Promise<void>` configures a stderr console sink; `getModuleLogger(module: string): Logger` returns logger with category `["holodeck", module]`. Remove old console-based logger.
  - File: `src/lib/logger.ts`
  - Depends on: T009
  - Blocks: T012, T016, T018

### Environment Variable Resolution

- [x] T011 Write test file `tests/unit/lib/env.test.ts` — test `resolveEnvVars()` replaces `${VAR}` with env values; test unset vars resolve to empty string (current behavior) or throw (if contract requires it — check contract); test `loadHolodeckEnv()` loads vars from `~/.holodeck/.env` without overriding existing env; test nested/adjacent substitutions
  - File: `tests/unit/lib/env.test.ts`
  - Depends on: T006
  - Blocks: T012

- [x] T012 Implement full `src/lib/env.ts` — add `loadHolodeckEnv(): void` (load `~/.holodeck/.env` via Bun's built-in `.env` support or manual parsing, without overriding existing vars). The existing `resolveEnvVars()` handles basic substitution; enhance it to log a warning (via LogTape) for unresolved variables if needed per contract.
  - File: `src/lib/env.ts`
  - Depends on: T010, T011
  - Blocks: T016

### Checkpoint: Phase 2

All foundational modules have passing tests. `formatZodError()` produces readable output. LogTape logging works to stderr. Env var resolution handles `${VAR}` patterns and `~/.holodeck/.env`. Run `bun test` — all tests pass. Run `bun run lint` — no violations.

---

## Phase 3: User Story 1

> Config loading, schema validation, CLI command, basic chat loop, streaming display. TDD throughout. All tasks labeled [US1].

### Zod Schemas (config/schema.ts)

- [x] T013 [US1] Write test file `tests/unit/config/schema.test.ts` — test `LLMProviderSchema` accepts valid input and applies defaults (temperature 0.3, max_tokens 1000); test it rejects non-"anthropic" provider, negative max_tokens, temperature > 2; test `InstructionsSchema` XOR constraint (accepts inline-only, accepts file-only, rejects both, rejects neither); test `ClaudeConfigSchema` defaults (permission_mode "manual", web_search false); test `MCPStdioToolSchema` and `MCPHttpToolSchema` discriminated union; test `AgentConfigSchema` with minimal and full fixtures; test strict mode rejects unknown fields; test tool name regex pattern `^[0-9A-Za-z_]+$`. Also test that sub-schemas (`BashConfigSchema`, `FileSystemConfigSchema`, `ExtendedThinkingSchema`, `SubagentsConfigSchema`) are exported and validate correctly with positive and negative cases.
  - File: `tests/unit/config/schema.test.ts`
  - Depends on: T002, T003, T004
  - Blocks: T014

- [x] T014 [US1] Implement all Zod schemas in `src/config/schema.ts` per data-model.md — `LLMProviderSchema`, `InstructionsSchema`, `MCPStdioToolSchema`, `MCPHttpToolSchema`, `MCPToolSchema` (union), `ToolSchema` (discriminated union), `BashConfigSchema`, `FileSystemConfigSchema`, `ExtendedThinkingSchema`, `SubagentsConfigSchema`, `ClaudeConfigSchema`, `AgentConfigSchema`. Export all schemas and inferred types. Use `z.strictObject()` for unknown field rejection.
  - File: `src/config/schema.ts`
  - Depends on: T013
  - Blocks: T016, T018

### Config Loader (config/loader.ts)

- [x] T015 [US1] Write test file `tests/unit/config/loader.test.ts` — test `loadAgentConfig()` loads and validates `valid-minimal.yaml`; test it loads `valid-full.yaml`; test it throws `ConfigError` for missing file; test it throws `ConfigError` with formatted Zod error for `invalid-missing.yaml`, `invalid-types.yaml`, `invalid-unknown.yaml`; test `instructions.file` resolution reads the referenced markdown file; test `instructions.file` throws `ConfigError` when referenced file does not exist; test env var substitution in YAML values (set `process.env` in test, use `${VAR}` in fixture)
  - File: `tests/unit/config/loader.test.ts`
  - Depends on: T002, T003, T004, T005, T008
  - Blocks: T016

- [x] T016 [US1] Implement `loadAgentConfig(path: string): Promise<AgentConfig>` in `src/config/loader.ts` per modules.md contract — check file exists (`Bun.file().exists()`), read raw text (`Bun.file().text()`), resolve env vars (`resolveEnvVars()`), parse YAML (`parse()` from `yaml`), validate (`AgentConfigSchema.parse()`), verify `instructions.file` exists if set, wrap all errors in `ConfigError` with `{ cause }`. Use LogTape logger for debug logging.
  - File: `src/config/loader.ts`
  - Depends on: T010, T012, T014, T015
  - Blocks: T018, T020

### Streaming Types (agent/streaming.ts)

- [x] T017 [US1] [P] Define the `ChatEvent` union type and `SessionState` type in `src/agent/streaming.ts` per contracts/modules.md — `text`, `tool_start`, `tool_end`, `thinking`, `context_warning`, `compaction`, `error`, `complete`, `status` variants. Export the types. Also export `SessionState` type: `"initializing" | "prompting" | "streaming" | "interrupted" | "shutting_down" | "exited"`. (No test file needed for pure type definitions — they are validated by the compiler.)
  - File: `src/agent/streaming.ts`
  - Depends on: T006
  - Blocks: T018, T020

### CLI Chat Command (cli/commands/chat.ts)

- [x] T018 [US1] Write test file `tests/unit/cli/chat.test.ts` — test `chatCommand()` returns a Commander `Command` with name "chat"; test it has `--agent` option with default `./agent.yaml`; test it has `--verbose` option defaulting to false; test the action handler calls `loadAgentConfig` with the agent path; test that when config loading fails with `ConfigError`, the command outputs the error message to stderr and exits with code 1; test that when no `--agent` and no `./agent.yaml`, it errors with "No agent configuration found" message
  - File: `tests/unit/cli/chat.test.ts`
  - Depends on: T008, T010, T014, T016, T017
  - Blocks: T019

- [x] T019 [US1] Implement `chatCommand(): Command` in `src/cli/commands/chat.ts` per contracts/cli.md — define `--agent <path>` (default `./agent.yaml`), `--verbose` flag; async action handler: call `setupLogging()`, call `loadHolodeckEnv()`, call `loadAgentConfig()`, create chat session (stub for now — print welcome and start readline loop), handle `exit`/`quit` input, handle Ctrl+D (readline close), handle Ctrl+C at prompt (show exit hint). Output errors to stderr. Exit code 1 for config errors.
  - File: `src/cli/commands/chat.ts`
  - Depends on: T018
  - Blocks: T021
  - Note: Bun implements `node:readline` as a compatibility layer. Using `import * as readline from "node:readline"` is the approved approach per research.md — no Bun-specific alternative is needed.

- [x] T031 [US1] Write test in `tests/unit/cli/chat.test.ts` — verify prompt format strings match the CLI contract: user input prompt uses `You: ` prefix, agent response display uses `Agent: ` prefix, and the farewell message on exit is exactly `Goodbye!`
  - File: `tests/unit/cli/chat.test.ts`
  - Depends on: T018, T019

- [x] T020 [US1] Update `src/cli/index.ts` — replace the placeholder chat command registration with `program.addCommand(chatCommand())` imported from `src/cli/commands/chat.ts`. Remove the inline chat command definition.
  - File: `src/cli/index.ts`
  - Depends on: T019
  - Blocks: T021

### Terminal Markdown Rendering (cli/render.ts)

- [x] T021 [US1] [P] Write test file `tests/unit/cli/render.test.ts` — test `renderMarkdown()` converts bold/italic to ANSI; test code blocks get syntax highlighting; test `renderStreamingMarkdown()` handles unterminated markdown (e.g., unclosed code fence) via `remend`; test empty string input returns empty string
  - File: `tests/unit/cli/render.test.ts`
  - Depends on: T001
  - Blocks: T022

- [x] T022 [US1] [P] Implement `renderMarkdown(text: string): string` and `renderStreamingMarkdown(buffer: string): string` in `src/cli/render.ts` — configure `marked` with `marked-terminal` renderer; `renderStreamingMarkdown` applies `remend()` before rendering to auto-close unterminated blocks
  - File: `src/cli/render.ts`
  - Depends on: T021
  - Blocks: T024

### Basic Chat Session (agent/session.ts)

- [x] T023 [US1] Write test file `tests/unit/agent/session.test.ts` — test `createChatSession()` with a valid `AgentConfig` returns a `ChatSession` in `prompting` state; test session resolves inline instructions into `systemPrompt`; test session resolves `instructions.file` by reading the file; test `closeSession()` transitions state to `exited`; test `sendMessage()` returns an AsyncGenerator (mock the SDK `query()` call — do not hit a real API)
  - File: `tests/unit/agent/session.test.ts`
  - Depends on: T014, T017
  - Blocks: T024

- [x] T024 [US1] Implement `createChatSession(config: AgentConfig): Promise<ChatSession>` and `sendMessage(session: ChatSession, input: string): AsyncGenerator<ChatEvent>` and `closeSession(session: ChatSession): Promise<void>` in `src/agent/session.ts` per contracts/modules.md — resolve instructions (inline or file read), set initial state to `prompting`, build SDK options, invoke `query()` in `sendMessage`, yield `ChatEvent` objects, transition states per state machine in data-model.md
  - File: `src/agent/session.ts`
  - Depends on: T017, T022, T023, T030
  - Blocks: T025, T027

### ThinkingConfig Mapping (agent/session.ts)

- [x] T027 [US1] Write tests in `tests/unit/agent/session.test.ts` — test `mapThinkingConfig()` mapping from YAML `extended_thinking` to SDK `ThinkingConfig`: (1) `extended_thinking` not set → `{ type: "disabled" }`; (2) `{ enabled: false }` → `{ type: "disabled" }`; (3) `{ enabled: true }` → `{ type: "enabled" }`; (4) `{ enabled: true, budget_tokens: 5000 }` → `{ type: "enabled", budgetTokens: 5000 }`
  - File: `tests/unit/agent/session.test.ts`
  - Depends on: T014
  - Blocks: T028

- [x] T028 [US1] Implement `mapThinkingConfig(extendedThinking?: ExtendedThinking): ThinkingConfig` in `src/agent/session.ts` — map YAML `extended_thinking` config to SDK `ThinkingConfig` per the four cases above. Wire into `createChatSession()` SDK options.
  - File: `src/agent/session.ts`
  - Depends on: T024, T027
  - Blocks: T025

### SDK Message Mapping Scaffold (agent/streaming.ts)

- [x] T029 [US1] Write tests in `tests/unit/agent/streaming.test.ts` — test `mapSDKMessages()` dispatches on message type: returns `text` ChatEvent for assistant text messages, returns `error` ChatEvent for unknown/unhandled message types. Later stories (US2, US3, US5) add branches for tool_start, tool_end, thinking, etc.
  - File: `tests/unit/agent/streaming.test.ts`
  - Depends on: T017
  - Blocks: T030

- [x] T030 [US1] Implement `mapSDKMessages(message: SDKMessage): ChatEvent` scaffold in `src/agent/streaming.ts` — core dispatch logic (switch on message type) handling `assistant` text → `text` ChatEvent, with a default branch yielding `error` ChatEvent for unrecognized types. Later stories (US2, US3, US5) add branches for tool use, thinking, and context warnings.
  - File: `src/agent/streaming.ts`
  - Depends on: T017, T029
  - Blocks: T024

### Integration: Wire Chat Loop

- [x] T025 [US1] Wire `chatCommand()` action to use `createChatSession()` and `sendMessage()` — replace the readline stub from T019 with the real session: on user input call `sendMessage()`, iterate the `AsyncGenerator<ChatEvent>`, render `text` events via `renderStreamingMarkdown()`, display `tool_start`/`tool_end` indicators, handle `error` events, display welcome banner with agent name on session start, display "Goodbye!" on exit
  - File: `src/cli/commands/chat.ts`
  - Depends on: T019, T024, T028

- [x] T032 [US1] Write test in `tests/unit/cli/chat.test.ts` or `tests/unit/agent/session.test.ts` — verify FR-014 API auth error handling: when the SDK returns an authentication error, the displayed message matches `Error: Authentication failed — invalid or expired credentials.\n  Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.`; verify auth errors are distinguished from other connection failures (e.g., network timeout); verify exit code is 2 for runtime/API errors
  - File: `tests/unit/cli/chat.test.ts`
  - Depends on: T024, T025

### Package Entry Point

- [x] T026 [US1] [P] Update `src/index.ts` to export public API types: `AgentConfig`, `ChatSession`, `ChatEvent`, `SessionState`, `loadAgentConfig`. Ensure clean barrel exports.
  - File: `src/index.ts`
  - Depends on: T014, T017, T024

### Checkpoint: Phase 3

Run full validation:
1. `bun test` — all unit tests pass (schema, loader, errors, env, logger, render, session, chat command)
2. `bun run lint` — no Biome violations
3. `bun run typecheck` — no TypeScript errors
4. Manual smoke test: create a minimal `agent.yaml`, run `bun run dev -- chat --agent agent.yaml`, type "Hello", verify streamed response appears, type "exit", verify clean shutdown

### Acceptance Scenario Mapping

| Scenario | Validated By |
|----------|-------------|
| 1. Valid config loads and presents prompt | T013, T015, T016, T018, T025 |
| 2. User types "Hello", response streams | T023, T024, T025, T029, T030 |
| 3. `instructions.file` reads from markdown | T015, T016, T023 |
| 4. Invalid YAML shows human-readable error | T007, T008, T013, T015, T016, T018 |
| 5. Default `./agent.yaml` auto-discovery | T018, T019 |
| 6. Missing config shows clear error | T018, T019 |

### FR Coverage

| FR | Tasks |
|----|-------|
| FR-001 (YAML parsing + validation) | T013, T014, T015, T016 |
| FR-003 (human-readable errors) | T007, T008, T018 |
| FR-004 (instructions inline/file XOR) | T013, T014, T015, T016, T023 |
| FR-005 (interactive prompt) | T018, T019, T025 |
| FR-007 (streaming markdown) | T021, T022, T025 |
| FR-013 (CLI --agent flag + default) | T018, T019, T020 |
| FR-014 (API auth error clarity) | T024, T025 |

---

## Parallelism Guide

Tasks marked [P] within the same dependency tier can be worked simultaneously. Here are the parallel groups:

**Phase 1 (all parallel):**
T001, T002, T003, T004, T005 can all be done simultaneously. T006 waits for T001.

**Phase 2 (two parallel tracks after T006):**
- Track A: T007 -> T008 (errors)
- Track B: T009 -> T010 (logger)
- Track C: T011 (env tests, can start with T007/T009)
- T012 merges tracks B and C (needs T010 + T011)

**Phase 3 (multiple parallel tracks):**
- Track A: T013 -> T014 (schemas)
- Track B: T017 -> T029 -> T030 (streaming types, then SDK message mapping scaffold)
- Track C: T021 -> T022 (render, independent after T001)
- T015 waits for fixtures + T008; T016 merges schemas + loader tests + env + logger
- T018 merges most foundational work; T019 -> T020 -> T025 are sequential
- T023 -> T024 can proceed in parallel with T018 -> T019 (T024 also depends on T030)
- T027 -> T028 (ThinkingConfig mapping, T027 needs T014, T028 needs T024)
- T025 is the final integration point (depends on T019, T024, T028)
- T026 can be done anytime after T014/T017/T024

## Task Count Summary

| Phase | Tasks | IDs |
|-------|-------|-----|
| Phase 1: Setup | 6 | T001-T006 |
| Phase 2: Foundational | 6 | T007-T012 |
| Phase 3: User Story 1 | 20 | T013-T032 |
| **Total** | **32** | T001-T032 |
