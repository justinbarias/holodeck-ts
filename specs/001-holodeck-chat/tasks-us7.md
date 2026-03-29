# Tasks: User Story 7 - Skills Auto-Discovery and Invocation

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29
**User Story**: US7 - Skills Auto-Discovery and Invocation (P3)
**FRs**: FR-009 (skill auto-discovery)
**Prerequisite**: All Setup, Foundational, and US1-US6 tasks are complete.

> **Note**: Task IDs are scoped to this file. Cross-file references use the format `tasks-usX.md#TXXX`.

## Assumptions from Prior Completion

The following are already implemented and available:

- `src/config/schema.ts` — All Zod schemas (`AgentConfigSchema`, `ClaudeConfigSchema`, etc.)
- `src/config/loader.ts` — `loadAgentConfig()` with YAML parsing and env var resolution
- `src/lib/errors.ts` — `HoloDeckError`, `ConfigError`, `ToolError` hierarchy
- `src/lib/logger.ts` — LogTape structured logging (`getModuleLogger()`, stderr only)
- `src/lib/env.ts` — Environment variable resolution
- `src/cli/index.ts` — Commander entry point
- `src/cli/commands/chat.ts` — Chat command with interactive loop, signal handling, rendering
- `src/cli/render.ts` — Terminal markdown rendering (marked + marked-terminal + remend)
- `src/agent/session.ts` — `ChatSession` with `createChatSession()`, `sendMessage()`, multi-turn, context monitoring, compaction
- `src/agent/streaming.ts` — `ChatEvent` union type, `mapSDKMessages()` AsyncGenerator
- `src/agent/hooks.ts` — `buildHooks()` with PreToolUse, PostToolUse, PreCompact, PostCompact
- `src/agent/permissions.ts` — `canUseTool` callback for manual permission mode
- `src/tools/mcp.ts` — MCP tool config mapping
- Test fixtures in `tests/fixtures/`

## Independent Test

Create a `.claude/skills/greet/SKILL.md` file in a test project directory, start a chat session pointing at that directory, and verify the agent's system prompt includes the skill instructions. Also verify that starting a session in a directory with no `.claude/skills/` directory completes without errors.

---

## Phase 7: Skills Auto-Discovery and Invocation

**Goal**: Auto-discover SKILL.md files from `.claude/skills/*/SKILL.md` at session startup, parse them into `Skill` objects, append skill information to the agent's system prompt, and handle edge cases (missing directory, invalid files) gracefully.

### 7A. Test Fixtures

- [ ] T105 [US7] Create valid skill fixture with frontmatter (name, description) and body content — `tests/fixtures/skills/.claude/skills/greet/SKILL.md`
- [ ] T106 [US7] Create invalid skill fixture with empty content (0 bytes) — `tests/fixtures/skills/.claude/skills/invalid/SKILL.md`
- [ ] T107 [US7] Create valid skill fixture without frontmatter (description inferred from first paragraph) — `tests/fixtures/skills/.claude/skills/summarize/SKILL.md`

### 7B. Skill Discovery (`discoverSkills`) — Tests First

- [ ] T108 [US7] Write test: `discoverSkills` returns array of `Skill` objects for valid SKILL.md files in `.claude/skills/*/` — `tests/unit/tools/skills.test.ts`
- [ ] T109 [US7] Write test: `discoverSkills` extracts `name` from directory name (not file content) — `tests/unit/tools/skills.test.ts`
- [ ] T110 [US7] Write test: `discoverSkills` extracts `description` from frontmatter `description` field when present — `tests/unit/tools/skills.test.ts`
- [ ] T111 [US7] Write test: `discoverSkills` falls back to first paragraph as `description` when no frontmatter — `tests/unit/tools/skills.test.ts`
- [ ] T112 [US7] Write test: `discoverSkills` sets `instructions` to full SKILL.md content (excluding frontmatter) — `tests/unit/tools/skills.test.ts`
- [ ] T113 [US7] Write test: `discoverSkills` sets `path` to absolute path of the SKILL.md file — `tests/unit/tools/skills.test.ts`
- [ ] T114 [US7] Write test: `discoverSkills` returns empty array when `.claude/skills/` directory does not exist — `tests/unit/tools/skills.test.ts`
- [ ] T115 [US7] Write test: `discoverSkills` returns empty array when `.claude/` directory does not exist — `tests/unit/tools/skills.test.ts`
- [ ] T116 [US7] Write test: `discoverSkills` skips empty SKILL.md files and logs a warning — `tests/unit/tools/skills.test.ts`
- [ ] T117 [US7] Write test: `discoverSkills` skips unreadable SKILL.md files (permission denied) and logs a warning — `tests/unit/tools/skills.test.ts`
- [ ] T118 [US7] Write test: `discoverSkills` returns valid skills even when some files are invalid (partial failure) — `tests/unit/tools/skills.test.ts`

### 7C. Skill Discovery — Implementation

- [ ] T119 [US7] Define `Skill` interface with `name`, `description`, `instructions`, `path` fields — `src/tools/skills.ts`
- [ ] T120 [US7] Implement `discoverSkills(basePath: string): Promise<Skill[]>` — glob for `{basePath}/.claude/skills/*/SKILL.md` using `Bun.Glob` — `src/tools/skills.ts`
- [ ] T121 [US7] Implement frontmatter parsing: extract `name`/`description` from YAML frontmatter delimited by `---` markers — `src/tools/skills.ts`
- [ ] T122 [US7] Implement fallback logic: use directory name for `name`, first non-empty paragraph for `description` when no frontmatter — `src/tools/skills.ts`
- [ ] T123 [US7] Handle empty files: log warning via LogTape `["holodeck", "tools"]` logger and skip — `src/tools/skills.ts`
- [ ] T124 [US7] Handle read errors (permissions, I/O): catch, log warning, continue with remaining files — `src/tools/skills.ts`

### 7D. Session Integration — Tests First

- [ ] T125 [US7] Write test: `createChatSession` calls `discoverSkills` with `claude.working_directory` from config when set — `tests/unit/agent/session.test.ts`
- [ ] T126 [US7] Write test: `createChatSession` calls `discoverSkills` with `process.cwd()` when `claude.working_directory` is not set — `tests/unit/agent/session.test.ts`
- [ ] T127 [US7] Write test: `createChatSession` stores discovered skills in `session.skills` — `tests/unit/agent/session.test.ts`
- [ ] T128 [US7] Write test: discovered skills are appended to system prompt passed to SDK `query()` — `tests/unit/agent/session.test.ts`
- [ ] T129 [US7] Write test: system prompt skill section includes skill name, description, and instructions for each skill — `tests/unit/agent/session.test.ts`
- [ ] T130 [US7] Write test: session creates successfully with empty skills array (no `.claude/skills/` directory) — `tests/unit/agent/session.test.ts`

### 7E. Session Integration — Implementation

- [ ] T131 [US7] In `createChatSession()`, call `discoverSkills()` with resolved working directory during initialization — `src/agent/session.ts`
- [ ] T132 [US7] Store discovered skills array in `session.skills` field — `src/agent/session.ts`
- [ ] T133 [US7] Build skill prompt section: format each skill as a block with name, description, and full instructions — `src/agent/session.ts`
- [ ] T134 [US7] Append skill prompt section to system prompt before passing to SDK `query()` — `src/agent/session.ts`
- [ ] T135 [US7] Log discovered skill count and names at `info` level during session creation — `src/agent/session.ts`

### 7F. Verification

- [ ] T136 [US7] Run all skill discovery tests (`bun test tests/unit/tools/skills.test.ts`) and verify pass — `tests/unit/tools/skills.test.ts`
- [ ] T137 [US7] Run all session integration tests (`bun test tests/unit/agent/session.test.ts`) and verify pass — `tests/unit/agent/session.test.ts`
- [ ] T138 [US7] Run full test suite (`bun test`) and verify no regressions — all test files

---

### Checkpoint: US7 Complete

All acceptance scenarios verified:

1. **Skill discovery** — SKILL.md files globbed from `.claude/skills/*/SKILL.md`, parsed into `Skill` objects with name, description, instructions, path (T108-T118, T119-T124)
2. **Agent invocation** — Skills appended to system prompt so the agent can invoke them when matching user requests (T125-T129, T131-T135)
3. **No skills directory** — Session starts normally with empty skills array, no errors (T114-T115, T130)
4. **Invalid skill files** — Empty or unreadable files logged as warnings, remaining valid skills still loaded (T116-T118, T123-T124)

### Parallelization Guide

The following task groups can be executed in parallel:

- **7A fixtures** (T105-T107) are independent of each other
- **7B tests** (T108-T118) depend on 7A fixtures but are independent of each other
- **7D tests** (T125-T130) can be written in parallel with 7B tests (they test different modules)
- **7C implementation** (T119-T124) depends on 7B tests being written
- **7E implementation** (T131-T135) depends on 7C implementation and 7D tests being written

```
T105-T107 (7A fixtures, parallel)
  --> T108-T118 (7B discovery tests, parallel) | T125-T130 (7D session tests, parallel)
        --> T119-T124 (7C discovery impl, sequential)
              --> T131-T135 (7E session impl, sequential)
                    --> T136-T138 (7F verification, sequential)
```
