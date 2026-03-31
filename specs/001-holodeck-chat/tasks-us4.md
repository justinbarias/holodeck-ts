# Tasks: User Story 4 - Graceful Session Management

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29
**User Story**: US4 - Graceful Session Management (P2)
**Requirements**: FR-010 (graceful termination), FR-011 (interrupt without ending session)
**Assumes**: US1-US3 tasks complete (config loading, session creation, multi-turn chat, MCP tools, streaming all functional)

> **Note**: Task IDs are scoped to this file. Cross-file references use the format `tasks-usX.md#TXXX`.

## Prerequisites from Earlier Stories

These artifacts exist and are functional before US4 work begins:

- `src/agent/session.ts` — `createChatSession()`, `sendMessage()`, `ChatSession` type with `state` field
- `src/agent/streaming.ts` — `mapSDKMessages()` AsyncGenerator, `ChatEvent` types
- `src/cli/commands/chat.ts` — Commander chat command, config loading, basic interactive loop with `node:readline`
- `src/lib/errors.ts` — `HoloDeckError`, `ConfigError` hierarchy
- `src/lib/logger.ts` — LogTape logger setup
- `tests/unit/agent/session.test.ts` — existing session lifecycle tests
- `tests/unit/cli/chat.test.ts` — existing chat command tests (if any)

## Task List

### Phase 1: closeSession() and State Transitions

- [x] T075 [P1] [US4] Write tests for `closeSession()` state transitions in `tests/unit/agent/session.test.ts` — **DONE**
  - Tests: prompting→exited, already-exited no-op, shutting_down no-op

- [x] T076 [P1] [US4] Enhance `closeSession()` in `src/agent/session.ts` — **DONE**
  - `shutting_down` intermediate state + guard, try/catch around `query.close()`, logging

- [x] T077 [P1] [US4] Write tests for `interruptResponse()` state transitions — **DONE**
  - Tests: streaming→prompting, prompting no-op, post-interrupt usability

- [x] T078 [P1] [US4] Implement `interruptResponse(session: ChatSession): Promise<void>` in `src/agent/session.ts` — **DONE**
  - Early return if state is not `"streaming"`
  - Calls `session.query.interrupt()`
  - Transitions directly to `"prompting"` (skips `"interrupted"` intermediate — acceptable for TUI flow)

### Phase 2: Exit Command Detection

- [x] T079 [P1] [US4] ~~Write tests for exit command detection~~ — **SUPERSEDED by TUI**
  - TUI uses Ctrl+C double-tap to exit instead of text-based exit commands
  - No readline input to parse; exit handled via `src/cli/tui/app.ts` keypress handler (lines 122-140)

- [x] T080 [P1] [US4] ~~Implement `isExitCommand()`~~ — **SUPERSEDED by TUI**
  - TUI replaced readline interactive loop; no text-based exit command needed
  - Exit flow: Ctrl+C double-tap → `cleanup()` → `closeSession()` → `process.exit()`

### Phase 3: ~~Readline~~ Signal Handling

- [x] T081 [P1] [US4] ~~Write tests for exit flow orchestration (readline)~~ — **SUPERSEDED by TUI**
  - TUI exit flow: Ctrl+C double-tap → `cleanup()` calls `closeSession(session)` → `renderer.stop()` → `process.exit(0)` (app.ts lines 187-195)
  - No readline `close` event or text-based exit commands
  - **Replacement needed**: Tests for TUI cleanup flow in `tests/unit/cli/tui/` (not covered by existing tasks)

- [x] T082 [P1] [US4] ~~Implement exit command handling in readline interactive loop~~ — **SUPERSEDED by TUI**
  - TUI `cleanup()` function handles exit (app.ts lines 187-195)
  - Single-message mode (`--prompt`) calls `closeSession()` in `runSingleMessage()` finally block (chat.ts line 106)

- [x] T083 [P2] [US4] ~~Implement Ctrl+C signal handling at readline prompt~~ — **SUPERSEDED by TUI**
  - TUI Ctrl+C handler implemented in app.ts (lines 122-140):
    - If streaming: calls `interruptResponse(session)` + `store.finalizeMessage()`
    - If prompting: shows "Press Ctrl+C again to exit" hint
    - Double-tap within 1s: calls `cleanup()` to exit
  - Escape key also interrupts streaming (lines 116-120)

### Phase 4: Exit Codes

- [x] T084 [P2] [US4] Write tests for exit code behavior in `tests/unit/cli/chat.test.ts` — **DONE**
  - Tests: config error→exitCode 1, runtime error format, clean exit defaults to 0

- [x] T085 [P2] [US4] Ensure exit codes are applied correctly in `src/cli/commands/chat.ts` — **DONE**
  - Clean exit: TUI `cleanup()` calls `process.exit(process.exitCode ?? 0)` (app.ts line 194)
  - Config errors: `process.exitCode = 1` (chat.ts line 137)
  - Runtime errors: `process.exitCode = 2` (chat.ts lines 94, 100, 159)
  - Single-message mode wrapped in try/catch with exit code 2

### Phase 5: MCP Cleanup Verification

- [x] T086 [P2] [US4] Write test verifying MCP cleanup on session close — **DONE**
  - Tests: mock query.close() called, null query no error

- [x] T087 [P2] [US4] Verify SDK query close handles MCP teardown — **DONE**
  - query.close() wrapped in try/catch, logging added after state transition

### Phase 6: Edge Cases and Robustness

- [x] T088 [P2] [US4] Write tests for double-close and error-during-close — **DONE**
  - Tests: double-close no throw, error-during-close still reaches exited, shutting_down no-op

- [x] T089 [P2] [US4] Harden `closeSession()` error handling — **DONE**
  - Guards for `exited` and `shutting_down`, try/catch around `query.close()`, state always reaches `exited`

- [ ] T090 [P3] [US4] Write test for rapid Ctrl+C during shutdown — **SKIPPED** (requires complex TUI renderer mocking)
  - Guard implemented in T091; test deferred to TUI test infrastructure buildout

- [x] T091 [P3] [US4] Handle signals during shutdown state in `src/cli/tui/app.ts` — **DONE**
  - Ctrl+C handler checks `session.state` — returns early if `shutting_down` or `exited`

## Task Dependency Graph

```
T075 ──► T076 (done)
T077 ──► T078 (done)
T079 (superseded) ──► T080 (superseded)
T081 (superseded) ──► T082 (superseded)
T083 (superseded)
T084 ──► T085 (done)
T086 ──► T087
T088 ──► T089
T076 ──► T087
T076 ──► T089
T090 ──► T091
T089 ──► T091
```

## Summary

| Phase | Tasks | Priority | Status |
|-------|-------|----------|--------|
| 1. closeSession + interrupt | T075-T078 | P1 | **ALL DONE** |
| 2. Exit commands | T079-T080 | P1 | **SUPERSEDED by TUI** |
| 3. Signal handling | T081-T083 | P1-P2 | **SUPERSEDED by TUI** |
| 4. Exit codes | T084-T085 | P2 | **ALL DONE** |
| 5. MCP cleanup | T086-T087 | P2 | **ALL DONE** |
| 6. Edge cases | T088-T091 | P2-P3 | **DONE** (T090 skipped — needs TUI test infra) |

**Total**: 17 tasks (T075-T091) — **6 superseded**, **10 done**, **1 skipped** (T090)
**Files modified**: `src/agent/session.ts`, `src/cli/tui/app.ts`, `tests/unit/agent/session.test.ts`, `tests/unit/cli/chat.test.ts`
