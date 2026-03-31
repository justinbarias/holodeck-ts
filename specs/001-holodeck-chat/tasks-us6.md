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

- [x] T095 P3 [US6] Write tests for `resolveEnvVars()` happy path — **DONE** (env.test.ts lines 29-33)
- [x] T096 P3 [US6] Write tests for multiple vars in a single string — **DONE** (env.test.ts lines 41-47, tests 3 adjacent vars)
- [x] T097 P3 [US6] Write tests for no env var references — **DONE** (passthrough test added)
- [x] T098 P3 [US6] Write test that `resolveEnvVars()` throws `ConfigError` for missing vars — **DONE**
- [x] T099 P3 [US6] Write test that `resolveEnvVars()` collects ALL missing vars in a single error — **DONE**
- [x] T100 P3 [US6] Enhance `resolveEnvVars()` with two-pass approach — **DONE** (two-pass: scan for missing vars → throw ConfigError listing all, then replace)

### Phase 2: Enhance `loadHolodeckEnv()` — User-Level `.env` Loading

- [x] T101 P3 [US6] Write test that `loadHolodeckEnv()` reads `~/.holodeck/.env` and sets vars — **DONE** (env.test.ts line 49-77, verifies `NEW_KEY=from-home`)
- [x] T102 P3 [US6] Write test that `loadHolodeckEnv()` does NOT override shell vars — **DONE** (env.test.ts line 67-72, verifies `EXISTING_KEY` preserved)
- [x] T103 P3 [US6] Write test that `loadHolodeckEnv()` does NOT override project-level `.env` vars — **DONE**
- [x] T104 P3 [US6] Write test for missing `~/.holodeck/.env` — **DONE**
- [x] T105 P3 [US6] Write test for empty `~/.holodeck/.env` file — **DONE**
- [x] T106 P3 [US6] Write test for `KEY=VALUE` parsing, comments, blank lines — **DONE** (env.test.ts lines 56-62, verifies comments and INVALID_LINE skipped)
- [x] T107 P3 [US6] Write test for quoted values — **DONE** (env.test.ts lines 59-60, 73-74, verifies double and single quotes stripped)
- [x] T108 P3 [US6] Enhance `loadHolodeckEnv()` — **DONE** (env.ts lines 48-81: `parseEnvLine()` handles comments, blank lines, quoted values, lines without `=`; respects `process.env` priority; logs via `getModuleLogger("env")`)

### Phase 3: Integration — Config Loader Uses `resolveEnvVars()`, CLI Calls `loadHolodeckEnv()`

- [x] T109 P3 [US6] Write test that `loadAgentConfig()` resolves `${VAR}` in YAML — **DONE** (loader.test.ts has "resolves environment variables in YAML values" test)
- [x] T110 P3 [US6] Write test that CLI calls `loadHolodeckEnv()` before `loadAgentConfig()` — **DONE** (verified via integration test)
- [x] T111 P3 [US6] Write test that `loadAgentConfig()` throws `ConfigError` for missing vars — **DONE** (unblocked by T100)
- [x] T112 P3 [US6] Write test for env var priority — **DONE** (shell env takes priority in resolution chain)
- [x] T113 P3 [US6] Integrate env resolution into `loadAgentConfig()` — **DONE** (loader.ts line 35: `resolveEnvVars(rawYaml)` called before parsing; CLI calls `loadHolodeckEnv()` at chat.ts line 117)

### Phase 4: Fixtures and Edge Cases

- [x] T114 P3 [US6] Create YAML fixture with env var references — **DONE** (`tests/fixtures/agents/valid-env-vars.yaml`)
- [x] T115 P3 [US6] Create YAML fixture with missing env var references — **DONE** (`tests/fixtures/agents/invalid-missing-env.yaml`)
- [x] T116 P3 [US6] Write test for empty string var — **DONE** (substitutes empty string, does not throw)
- [x] T117 P3 [US6] Write test for nested-looking references — **DONE** (regex matches `${INNER}` only, outer remains literal)
- [x] T118 P3 [US6] Write test for literal `$` characters — **DONE** (`$VAR` and `$$` not substituted)

### Phase 5: Verify All Acceptance Scenarios

- [x] T119 P3 [US6] Verify acceptance scenario 1: shell env var substituted — **DONE**
- [x] T120 P3 [US6] Verify acceptance scenario 2: project `.env` resolution — **DONE**
- [x] T121 P3 [US6] Verify acceptance scenario 3: missing var → ConfigError — **DONE**

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1 | T095-T100 | **ALL DONE** — two-pass resolveEnvVars with ConfigError implemented |
| 2 | T101-T108 | **ALL DONE** — loadHolodeckEnv fully tested |
| 3 | T109-T113 | **ALL DONE** — integration and priority tests |
| 4 | T114-T118 | **ALL DONE** — fixtures created, edge cases tested |
| 5 | T119-T121 | **ALL DONE** — all acceptance scenarios verified |

**Total**: 27 tasks — **ALL COMPLETE**
