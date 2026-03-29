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

- [ ] T075 [P1] [US4] Write tests for `closeSession()` state transitions in `tests/unit/agent/session.test.ts`
  - Test: calling `closeSession()` on a session in `prompting` state transitions to `shutting_down` then `exited`
  - Test: calling `closeSession()` on a session in `streaming` state transitions to `shutting_down` then `exited`
  - Test: calling `closeSession()` on an already `exited` session is a no-op (idempotent)
  - Test: after `closeSession()`, `session.state` is `"exited"`

- [ ] T076 [P1] [US4] Enhance `closeSession()` in `src/agent/session.ts` (base implementation exists from tasks-us1.md#T024)
  - Add `"shutting_down"` intermediate state: set `session.state` to `"shutting_down"` before cleanup
  - If `session.query` is not null, call `query.close()` (SDK handles MCP server shutdown)
  - Set `session.state` to `"exited"` after cleanup completes
  - Ensure the function remains exported alongside existing session exports

- [ ] T077 [P1] [US4] Write tests for `interruptResponse()` state transitions in `tests/unit/agent/session.test.ts`
  - Test: calling `interruptResponse()` on a session in `streaming` state transitions to `interrupted` then `prompting`
  - Test: calling `interruptResponse()` on a session in `prompting` state is a no-op
  - Test: after interrupt, session remains usable (state is `prompting`, not `exited`)

- [ ] T078 [P1] [US4] Implement `interruptResponse(session: ChatSession): Promise<void>` in `src/agent/session.ts`
  - If `session.state` is not `"streaming"`, return early (no-op)
  - Call `session.query.interrupt()` if query handle exists
  - Set state to `"interrupted"`, then to `"prompting"`

### Phase 2: Exit Command Detection

- [ ] T079 [P1] [US4] Write tests for exit command detection in `tests/unit/cli/chat.test.ts`
  - Test: `isExitCommand("exit")` returns `true`
  - Test: `isExitCommand("quit")` returns `true`
  - Test: `isExitCommand("EXIT")` returns `true` (case-insensitive)
  - Test: `isExitCommand("  quit  ")` returns `true` (trimmed)
  - Test: `isExitCommand("exit now")` returns `false` (not a substring match)
  - Test: `isExitCommand("hello")` returns `false`
  - Test: `isExitCommand("")` returns `false`

- [ ] T080 [P1] [US4] Implement `isExitCommand(input: string): boolean` in `src/cli/commands/chat.ts`
  - Match `input.trim().toLowerCase()` against `"exit"` and `"quit"` exactly
  - Export for testability

### Phase 3: Readline Signal Handling

- [ ] T081 [P1] [US4] Write tests for exit flow orchestration in `tests/unit/cli/chat.test.ts`
  - Test: when user input matches exit command, `closeSession()` is called and farewell message `"Goodbye!"` is printed
  - Test: after exit command, process exits with code 0
  - Test: Ctrl+D (readline `close` event) triggers `closeSession()` and exits with code 0

- [ ] T082 [P1] [US4] Implement exit command handling in the interactive loop in `src/cli/commands/chat.ts`
  - Before sending user input to `sendMessage()`, check `isExitCommand(input)`
  - If exit command: log farewell `"Goodbye!"` to stdout, call `closeSession(session)`, close readline, `process.exit(0)`
  - Wire `rl.on("close", ...)` handler for Ctrl+D: same flow as exit command (farewell, closeSession, exit 0)

- [ ] T083 [P2] [US4] Implement Ctrl+C signal handling at the prompt in `src/cli/commands/chat.ts`
  - Wire `rl.on("SIGINT", ...)` handler
  - If `session.state === "prompting"`: display hint `'Type "exit" or press Ctrl+D to quit.'` to stderr, re-display prompt
  - If `session.state === "streaming"`: call `interruptResponse(session)` (FR-011 — session stays alive, handled by US5 streaming interrupt, but wire the call here)

### Phase 4: Exit Codes

- [ ] T084 [P2] [US4] Write tests for exit code behavior in `tests/unit/cli/chat.test.ts`
  - Test: clean exit (exit/quit/Ctrl+D) results in exit code 0
  - Test: config error path results in exit code 1 (already handled in US1, verify here)
  - Test: unrecoverable runtime error results in exit code 2

- [ ] T085 [P2] [US4] Ensure exit codes are applied correctly in `src/cli/commands/chat.ts`
  - Clean exit paths (exit command, Ctrl+D): `process.exit(0)`
  - Config errors caught in command handler: `process.exit(1)` (verify US1 implementation)
  - Runtime errors (SDK auth failure, unrecoverable): catch in interactive loop, `process.exit(2)`
  - Wrap the interactive loop in try/catch to handle unexpected errors with exit code 2

### Phase 5: MCP Cleanup Verification

- [ ] T086 [P2] [US4] Write test verifying MCP cleanup on session close in `tests/unit/agent/session.test.ts`
  - Test: when session has an active SDK query handle, `closeSession()` calls `query.close()`
  - Test: when session has no query handle (null), `closeSession()` completes without error
  - Mock the SDK query handle to verify `.close()` is called

- [ ] T087 [P2] [US4] Verify SDK query close handles MCP teardown in `src/agent/session.ts`
  - The SDK's `query.close()` is responsible for shutting down MCP server connections
  - Ensure `closeSession()` awaits the close call (not fire-and-forget)
  - Add structured log entry: `logger.info("Session closed", { sessionId, state: "exited" })`

### Phase 6: Edge Cases and Robustness

- [ ] T088 [P2] [US4] Write tests for double-close and error-during-close in `tests/unit/agent/session.test.ts`
  - Test: calling `closeSession()` twice does not throw (idempotent guard on `exited` state)
  - Test: if `query.close()` throws, `closeSession()` still transitions to `exited` and logs the error
  - Test: calling `closeSession()` during `shutting_down` state is a no-op

- [ ] T089 [P2] [US4] Harden `closeSession()` error handling in `src/agent/session.ts`
  - Guard: if `session.state` is `"exited"` or `"shutting_down"`, return early
  - Wrap `query.close()` in try/catch — log error but still transition to `exited`
  - Ensure state always reaches `exited` even if cleanup fails (finally block or explicit set)

- [ ] T090 [P3] [US4] Write test for rapid Ctrl+C during shutdown in `tests/unit/cli/chat.test.ts`
  - Test: if user presses Ctrl+C while session is in `shutting_down` state, no error is thrown
  - The SIGINT handler should check state and skip action if already shutting down or exited

- [ ] T091 [P3] [US4] Handle signals during shutdown state in `src/cli/commands/chat.ts`
  - In the SIGINT handler, check `session.state` — if `shutting_down` or `exited`, ignore the signal
  - Prevents double-cleanup race conditions

## Task Dependency Graph

```
T075 ──► T076 ──► T082
T077 ──► T078 ──► T083
T079 ──► T080 ──► T082
T081 ──► T082
T081 ──► T083
T084 ──► T085
T086 ──► T087
T088 ──► T089
T076 ──► T087
T076 ──► T089
T090 ──► T091
T089 ──► T091
```

## Summary

| Phase | Tasks | Priority | Focus |
|-------|-------|----------|-------|
| 1. closeSession + interrupt | T075-T078 | P1 | Core session teardown and interrupt logic |
| 2. Exit commands | T079-T080 | P1 | Detect exit/quit input |
| 3. Signal handling | T081-T083 | P1-P2 | Readline close/SIGINT wiring |
| 4. Exit codes | T084-T085 | P2 | Correct process exit codes |
| 5. MCP cleanup | T086-T087 | P2 | Verify SDK handles MCP teardown |
| 6. Edge cases | T088-T091 | P2-P3 | Idempotency, error resilience, race conditions |

**Total**: 17 tasks (T075-T091)
**Files modified**: `src/agent/session.ts`, `src/cli/commands/chat.ts`, `tests/unit/agent/session.test.ts`, `tests/unit/cli/chat.test.ts`
