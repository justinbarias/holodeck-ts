# Tasks: User Story 6 - Environment Variable Resolution in Config

**Feature Branch**: `001-holodeck-chat` | **User Story**: US6 | **Priority**: P3
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/modules.md](./contracts/modules.md)

> **Note**: Task IDs are scoped to this file. Cross-file references use the format `tasks-usX.md#TXXX`.

**Prerequisite**: Setup, Foundational, and US1-US5 tasks are complete. The following exist:
- `src/lib/errors.ts` — `ConfigError` class
- `src/lib/env.ts` — basic `resolveEnvVars()` from US1 (`tasks-us1.md#T011`) that replaces `${VAR}` but silently returns `""` for missing vars; basic `loadHolodeckEnv()` from US1 (`tasks-us1.md#T012`) that reads `~/.holodeck/.env` with minimal parsing
- `src/lib/logger.ts` — `getModuleLogger()` setup
- `src/config/loader.ts` — `loadAgentConfig()` that calls `resolveEnvVars()` on raw YAML (per contracts/modules.md)
- `src/config/schema.ts` — `AgentConfigSchema` and all supporting Zod schemas
- `tests/fixtures/agents/` — YAML fixture files

**US6 scope**: This story enhances the basic US1 implementations, it does NOT reimplement from scratch. US6 adds:
- Missing var detection and reporting (`ConfigError` listing all unresolved var names)
- `~/.holodeck/.env` priority handling (never override shell env or project `.env`)
- Edge cases (empty values, comments, quoted values, nested references)

---

## Tasks

### Phase 1: Enhance `resolveEnvVars()` with Missing Var Detection

- [ ] T095 P3 [US6] Write tests for `resolveEnvVars()` happy path — shell env vars are substituted correctly (`tests/unit/lib/env.test.ts`)
- [ ] T096 P3 [US6] Write tests for `resolveEnvVars()` with multiple vars in a single string (`tests/unit/lib/env.test.ts`)
- [ ] T097 P3 [US6] Write tests for `resolveEnvVars()` with no env var references — string passes through unchanged (`tests/unit/lib/env.test.ts`)
- [ ] T098 P3 [US6] Write test that `resolveEnvVars()` throws `ConfigError` listing the missing var name when `${MISSING_VAR}` is not defined (`tests/unit/lib/env.test.ts`)
- [ ] T099 P3 [US6] Write test that `resolveEnvVars()` collects ALL missing vars and reports them in a single error, not just the first one (`tests/unit/lib/env.test.ts`)
- [ ] T100 P3 [US6] Enhance existing `resolveEnvVars(raw: string): string` — add two-pass approach: first scan for all `${VAR_NAME}` references via `/\$\{(\w+)\}/g`, collect any that are not in `process.env`, throw `ConfigError` listing all missing vars; second pass performs replacement (`src/lib/env.ts`)

### Phase 2: Enhance `loadHolodeckEnv()` — User-Level `.env` Loading

- [ ] T101 P3 [US6] Write test that `loadHolodeckEnv()` reads `~/.holodeck/.env` and sets vars in `process.env` when not already set (`tests/unit/lib/env.test.ts`)
- [ ] T102 P3 [US6] Write test that `loadHolodeckEnv()` does NOT override vars already present in `process.env` (shell takes priority) (`tests/unit/lib/env.test.ts`)
- [ ] T103 P3 [US6] Write test that `loadHolodeckEnv()` does NOT override vars loaded from project-level `.env` (Bun auto-loads these before our code runs) (`tests/unit/lib/env.test.ts`)
- [ ] T104 P3 [US6] Write test that `loadHolodeckEnv()` handles missing `~/.holodeck/.env` gracefully — no error, no-op (`tests/unit/lib/env.test.ts`)
- [ ] T105 P3 [US6] Write test that `loadHolodeckEnv()` handles empty `~/.holodeck/.env` file gracefully (`tests/unit/lib/env.test.ts`)
- [ ] T106 P3 [US6] Write test that `loadHolodeckEnv()` correctly parses `KEY=VALUE` lines, ignoring comments (`#`), blank lines, and lines without `=` (`tests/unit/lib/env.test.ts`)
- [ ] T107 P3 [US6] Write test that `loadHolodeckEnv()` handles quoted values — strips surrounding single and double quotes from values (`tests/unit/lib/env.test.ts`)
- [ ] T108 P3 [US6] Enhance existing `loadHolodeckEnv(): void` — improve parsing to handle comments, blank lines, quoted values, and lines without `=`; ensure `process.env` is never overridden for keys already present; log via `getModuleLogger("env")` (`src/lib/env.ts`)

### Phase 3: Integration — Config Loader Uses `resolveEnvVars()`, CLI Calls `loadHolodeckEnv()`

- [ ] T109 P3 [US6] Write test that `loadAgentConfig()` resolves `${VAR}` in YAML before parsing — e.g., `model.name: "${MODEL_NAME}"` resolves to the env var value (`tests/unit/config/loader.test.ts`)
- [ ] T110 P3 [US6] Write test that when the CLI action handler calls `loadHolodeckEnv()` before `loadAgentConfig()`, `~/.holodeck/.env` values are available for env var resolution (`tests/unit/lib/env.test.ts`)
- [ ] T111 P3 [US6] Write test that `loadAgentConfig()` throws `ConfigError` with missing var name when YAML contains unresolved `${VAR}` (`tests/unit/config/loader.test.ts`)
- [ ] T112 P3 [US6] Write test confirming env var priority: shell env > project `.env` > `~/.holodeck/.env` (test calls `loadHolodeckEnv()` then `loadAgentConfig()` to simulate CLI behavior) (`tests/unit/config/loader.test.ts`)
- [ ] T113 P3 [US6] Integrate env resolution into `loadAgentConfig()` — call `resolveEnvVars(rawYaml)` before `parse()` and `AgentConfigSchema.parse()` (per contracts/modules.md, the config loader only calls `resolveEnvVars()`; the CLI action handler is responsible for calling `loadHolodeckEnv()` separately before `loadAgentConfig()`) (`src/config/loader.ts`)

### Phase 4: Fixtures and Edge Cases

- [ ] T114 P3 [US6] Create YAML fixture with env var references for testing: `${ANTHROPIC_API_KEY}` in model auth, `${CUSTOM_INSTRUCTION}` in instructions.inline (`tests/fixtures/agents/valid-env-vars.yaml`)
- [ ] T115 P3 [US6] Create YAML fixture with missing env var references for negative testing (`tests/fixtures/agents/invalid-missing-env.yaml`)
- [ ] T116 P3 [US6] Write test for edge case: `${VAR}` where VAR is set to empty string — should substitute empty string, not treat as missing (`tests/unit/lib/env.test.ts`)
- [ ] T117 P3 [US6] Write test for edge case: nested-looking references like `${OUTER_${INNER}}` — should NOT attempt nested resolution, treat as literal or fail gracefully (`tests/unit/lib/env.test.ts`)
- [ ] T118 P3 [US6] Write test for edge case: escaped or literal `$` characters (e.g., `$$` or `\${VAR}`) — document behavior, ensure no accidental substitution of non-references (`tests/unit/lib/env.test.ts`)

### Phase 5: Verify All Acceptance Scenarios

- [ ] T119 P3 [US6] Verify acceptance scenario 1: YAML with `${ANTHROPIC_API_KEY}` + shell env var set = value substituted at load time (`tests/unit/config/loader.test.ts`)
- [ ] T120 P3 [US6] Verify acceptance scenario 2: project `.env` with `ANTHROPIC_API_KEY=sk-...` + YAML reference = value resolved from `.env` file (`tests/unit/config/loader.test.ts`)
- [ ] T121 P3 [US6] Verify acceptance scenario 3: YAML references `${MISSING_VAR}` not defined anywhere = `ConfigError` reporting var name and that it is missing (`tests/unit/config/loader.test.ts`)

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | T095-T100 | Enhance `resolveEnvVars()` with missing var detection |
| 2 | T101-T108 | Enhance `loadHolodeckEnv()` for `~/.holodeck/.env` |
| 3 | T109-T113 | Integrate env resolution into config loader; CLI calls `loadHolodeckEnv()` separately |
| 4 | T114-T118 | Fixtures and edge cases |
| 5 | T119-T121 | Acceptance scenario verification |

**Total**: 27 tasks (T095-T121)
