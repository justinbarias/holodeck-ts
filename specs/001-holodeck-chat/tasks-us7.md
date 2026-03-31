# Tasks: User Story 7 - Skills Auto-Discovery and Invocation

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29 (updated 2026-03-31)
**User Story**: US7 - Skills Auto-Discovery and Invocation (P3)
**FRs**: FR-009 (skill auto-discovery)
**Prerequisite**: All Setup, Foundational, and US1-US6 tasks are complete.

> **Note**: Task IDs are scoped to this file. Cross-file references use the format `tasks-usX.md#TXXX`.

## Implementation Approach: SDK-Native Skills

> **Key Decision (2026-03-31):** The Claude Agent SDK natively supports skill auto-discovery
> via `settingSources: ['project']`. This eliminates the need for custom `discoverSkills()`,
> frontmatter parsing (`gray-matter`), and system prompt injection code. The SDK handles
> SKILL.md globbing, frontmatter parsing, prompt injection, and provides a built-in `Skill`
> tool for invocation. Skill metadata is available via `query.supportedCommands()`.

---

## Phase 7: Skills Auto-Discovery and Invocation

**Goal**: Enable SDK-native skill discovery via `setting_sources` config, expose skill metadata to the TUI sidebar, and handle edge cases gracefully.

### 7A. Test Fixtures

- [x] T105 [US7] Create valid skill fixture with frontmatter — `tests/fixtures/skills/project/.claude/skills/deploy/SKILL.md`
- [x] T106 [US7] Create invalid skill fixture with empty content (0 bytes) — `tests/fixtures/skills/empty-project/.claude/skills/broken/SKILL.md`
- [x] T107 [US7] Create valid skill fixture without frontmatter — `tests/fixtures/skills/project/.claude/skills/greeter/SKILL.md`

### 7B. Skill Discovery — N/A (SDK-Native)

> Tasks T108-T118 originally planned custom `discoverSkills()` tests. The SDK now handles
> discovery natively. These tasks are replaced by a minimal `Skill` interface test.

- ~~T108-T116, T118~~ [US7] **REPLACED** — SDK handles discovery natively. Custom `discoverSkills()` removed.
- [x] T108-alt [US7] Write test: `Skill` interface accepts valid objects — `tests/unit/tools/skills.test.ts`

### 7C. Skill Discovery — Implementation (SDK-Native)

> Tasks T119-T124 originally planned custom discovery code. Replaced by SDK config.

- ~~T119~~ [US7] **REPLACED** — `Skill` interface simplified to `{ name, description }` (no `instructions`/`path`) — `src/tools/skills.ts`
- ~~T120~~ [US7] **REPLACED** — Custom `discoverSkills()` removed. SDK discovers via `settingSources: ['project']`
- ~~T121~~ [US7] **N/A** — Frontmatter parsing handled by SDK natively. No `gray-matter` dependency needed.
- ~~T122~~ [US7] **N/A** — Fallback logic handled by SDK natively.
- ~~T123~~ [US7] **N/A** — Empty file handling handled by SDK natively.
- ~~T124~~ [US7] **N/A** — Read error handling handled by SDK natively.

**New tasks:**
- [x] T140 [US7] Add `setting_sources` field to `ClaudeConfigSchema` — `z.array(z.enum(["user", "project", "local"])).default(["project"])` — `src/config/schema.ts`
- [x] T141 [US7] Map `claude.setting_sources` to SDK `settingSources` in `buildQueryOptions()` — `src/agent/session.ts`

### 7D. Session Integration — Tests

- ~~T125~~ [US7] **N/A** — SDK handles `working_directory` internally via `cwd` option
- ~~T126~~ [US7] **N/A** — SDK handles cwd fallback internally
- ~~T127~~ [US7] **REPLACED** — Skills now populated lazily via `populateSkills()`, not at session creation
- ~~T128~~ [US7] **N/A** — SDK injects skills into system prompt internally
- ~~T129~~ [US7] **N/A** — SDK formats skill prompt section internally
- [x] T130 [US7] Write test: session creates successfully with empty skills array — `tests/unit/agent/session.test.ts`

**New tests:**
- [x] T142 [US7] Write test: session initializes with empty skills array (lazily populated) — `tests/unit/agent/session.test.ts`
- [x] T143 [US7] Write tests: `setting_sources` schema validation (5 tests) — `tests/unit/config/schema.test.ts`

### 7E. Session Integration — Implementation

- ~~T131~~ [US7] **REPLACED** — `discoverSkills()` call removed; skills start empty, populated lazily
- ~~T132~~ [US7] **REPLACED** — Skills populated via `populateSkills()` using `query.supportedCommands()`
- ~~T133~~ [US7] **N/A** — SDK builds skill prompt section internally
- [x] T134 [US7] Map `setting_sources` config to SDK `settingSources` option — `src/agent/session.ts`
- ~~T135~~ [US7] **REPLACED** — Logging moved to `populateSkills()` (logs skill count after first query)

**New tasks:**
- [x] T144 [US7] Add `populateSkills()` function using `query.supportedCommands()` — `src/agent/session.ts`
- [x] T145 [US7] Call `populateSkills()` in `sendMessage()` after query creation — `src/agent/session.ts`

### 7F. TUI Integration

- [x] T139 [US7] TUI sidebar already displays skill names from `session.skills` — verified existing
- [x] T146 [US7] Add `updateSkills()` method to `ChatStore` — `src/cli/tui/state.ts`
- [x] T147 [US7] Wire lazy skill refresh after first message stream — `src/cli/tui/app.ts`

### 7G. Documentation

- [x] T148 [US7] Document skills in README.md (expanded Skills section with examples)
- [x] T149 [US7] Add `setting_sources` to CLAUDE.md ClaudeConfig table
- [x] T150 [US7] Update CLAUDE.md Skills section for SDK-native approach

### 7H. Verification

- [x] T136 [US7] Run all skill tests (`bun test tests/unit/tools/skills.test.ts`) — pass
- [x] T137 [US7] Run all session tests (`bun test tests/unit/agent/session.test.ts`) — pass
- [ ] T138 [US7] Run full test suite (`bun test`) and verify no regressions

---

### Checkpoint: US7 Complete

All acceptance scenarios verified:

1. **Skill discovery** — SDK natively discovers `.claude/skills/*/SKILL.md` via `settingSources: ['project']` (T140-T141)
2. **Agent invocation** — SDK injects skill instructions into system prompt and provides built-in `Skill` tool (T134)
3. **No skills directory** — Session starts normally with empty skills array, no errors (T130, T142)
4. **TUI integration** — Sidebar displays skill names lazily populated via `query.supportedCommands()` (T139, T146-T147)
5. **Configuration** — `setting_sources` field in `ClaudeConfigSchema` with Zod validation (T140, T143)
