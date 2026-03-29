# Tasks: User Story 5 — Streaming Response Display

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29

> **Note**: Task IDs are scoped to this file. Cross-file references use the format `tasks-usX.md#TXXX`.

**User Story**: US5 — Streaming Response Display (Priority: P2)
**FRs**: FR-007 (streaming markdown rendering), FR-011 (interrupt without ending session)
**Assumes**: Setup, Foundational, US1–US4 tasks are complete. `src/config/schema.ts`, `src/config/loader.ts`, `src/agent/session.ts` (createChatSession, sendMessage, closeSession, interruptResponse), `src/agent/streaming.ts` (ChatEvent type, mapSDKMessages), `src/agent/hooks.ts`, `src/tools/mcp.ts`, `src/tools/skills.ts`, `src/lib/errors.ts`, `src/lib/logger.ts`, `src/lib/env.ts`, `src/cli/index.ts`, `src/cli/commands/chat.ts` (basic chat loop, readline prompt, exit handling) are all implemented and tested. `src/cli/render.ts` already exists from US1 (tasks-us1.md#T021–T022) with `renderMarkdown()` and `renderStreamingMarkdown()`. `interruptResponse()` already exists from US4 (tasks-us4.md#T077–T078). The `readline` interface used in `chat.ts` is Bun-native (`node:readline` is built into the Bun runtime; no separate Node.js dependency is required).

---

## Phase A — Streaming Markdown Rendering Enhancements (`src/cli/render.ts`)

> `src/cli/render.ts` already exists from US1 (tasks-us1.md#T021–T022) with base `renderMarkdown()` and `renderStreamingMarkdown()` implementations. This phase adds streaming-specific behavior and edge case coverage.

### A1. Enhance renderMarkdown() for streaming edge cases

- [ ] T085 [P2] [US5] Write additional tests for `renderMarkdown()` in `tests/unit/cli/render.test.ts` — streaming-specific edge cases: very long single-line input, deeply nested lists, mixed heading levels, consecutive code blocks, Unicode/emoji content, ANSI escape passthrough safety
- [ ] T086 [P2] [US5] Enhance existing `renderMarkdown()` in `src/cli/render.ts` — add handling for streaming edge cases identified in T085 tests (e.g., ensure no double-rendering of ANSI escapes, stable output on repeated calls with growing buffer)
- [ ] T087 [P2] [US5] Verify enhanced `renderMarkdown()` passes all new and existing tests in `tests/unit/cli/render.test.ts`

### A2. Enhance renderStreamingMarkdown() edge cases

- [ ] T088 [P2] [US5] Write additional tests for `renderStreamingMarkdown()` in `tests/unit/cli/render.test.ts` — unterminated bold (`**bol`), unterminated code fence (triple backtick without closing), unterminated inline code, partial list items, empty buffer, rapid successive calls with growing buffer, buffer with trailing newlines
- [ ] T089 [P2] [US5] Enhance existing `renderStreamingMarkdown()` in `src/cli/render.ts` — harden `remend()` integration for edge cases identified in T088 tests; ensure idempotent output when called repeatedly with the same buffer
- [ ] T090 [P2] [US5] Verify enhanced `renderStreamingMarkdown()` passes all new and existing tests in `tests/unit/cli/render.test.ts`

---

## Phase B — Streaming Text Event Mapping (`src/agent/streaming.ts`)

### B1. Map SDKPartialAssistantMessage to ChatEvent text

- [ ] T091 [P2] [US5] Write tests for `SDKPartialAssistantMessage` handling in `mapSDKMessages()` — verify each partial message yields `{ type: "text", content }` with the incremental text delta — in `tests/unit/agent/streaming.test.ts`
- [ ] T092 [P2] [US5] Write tests for sequential partial messages — verify multiple `SDKPartialAssistantMessage` messages each yield separate `{ type: "text" }` events preserving order — in `tests/unit/agent/streaming.test.ts`
- [ ] T093 [P2] [US5] Implement `SDKPartialAssistantMessage` branch in `mapSDKMessages()` in `src/agent/streaming.ts` — extract text delta from message content blocks and yield `{ type: "text", content: delta }`
- [ ] T094 [P2] [US5] Verify streaming text event mapping passes all tests in `tests/unit/agent/streaming.test.ts`

### B2. Map SDKResultMessage to ChatEvent complete

- [ ] T095 [P2] [US5] Write tests for `SDKResultMessage` with `subtype: "success"` — verify it yields `{ type: "complete", sessionId }` extracting `session_id` from the result — in `tests/unit/agent/streaming.test.ts`
- [ ] T096 [P2] [US5] Write tests for `SDKResultMessage` with error subtypes — verify it yields `{ type: "error", message }` with the error description — in `tests/unit/agent/streaming.test.ts`
- [ ] T097 [P2] [US5] Implement `SDKResultMessage` branch in `mapSDKMessages()` in `src/agent/streaming.ts` — yield `complete` for success, `error` for error subtypes
- [ ] T098 [P2] [US5] Verify result event mapping passes all tests in `tests/unit/agent/streaming.test.ts`

### B3. Map additional SDK message types (status, retry, rate limit)

- [ ] T098a [P2] [US5] Write tests for `SDKStatusMessage`, `SDKAPIRetryMessage`, and `SDKRateLimitEvent` handling in `mapSDKMessages()` — verify `SDKStatusMessage` yields `{ type: "status", message }`, `SDKAPIRetryMessage` logs via LogTape and optionally yields a user-visible event, `SDKRateLimitEvent` logs via LogTape — in `tests/unit/agent/streaming.test.ts`
- [ ] T098b [P2] [US5] Implement `SDKStatusMessage`, `SDKAPIRetryMessage`, and `SDKRateLimitEvent` branches in `mapSDKMessages()` in `src/agent/streaming.ts` — map `SDKStatusMessage` to `{ type: "status", message }`, log `SDKAPIRetryMessage` via `getModuleLogger("streaming")` and optionally surface to user, log `SDKRateLimitEvent` via `getModuleLogger("streaming")`

---

## Phase C — Interrupt Response Integration with Streaming Display

> `interruptResponse()` is already implemented in US4 (tasks-us4.md#T077–T078). This phase verifies it integrates correctly with the streaming display loop.

### C1. Verify interruptResponse() streaming display integration

- [ ] T099 [P2] [US5] Write tests verifying `interruptResponse()` (from US4) integrates correctly with streaming display — verify that interrupting during active streaming cleans up partial terminal output (cursor reset, buffer cleared), and the rendered partial response is preserved with "[interrupted]" suffix — in `tests/unit/cli/commands/chat.test.ts`
- [ ] T100 [P2] [US5] Write tests verifying post-interrupt re-render — verify that after `interruptResponse()` completes, the accumulated buffer is rendered via `renderMarkdown()` (not `renderStreamingMarkdown()`), trailing "[interrupted]" text is appended, and the prompt returns to input mode — in `tests/unit/cli/commands/chat.test.ts`
- [ ] T101 [P2] [US5] ~~removed~~ (implementation owned by US4 tasks-us4.md#T078)
- [ ] T102 [P2] [US5] Verify interrupt-streaming integration passes all tests in `tests/unit/cli/commands/chat.test.ts`

---

## Phase D — Streaming Display Loop (`src/cli/commands/chat.ts`)

### D1. Token accumulation and incremental rendering

- [ ] T103a [P2] [US5] Write tests for token accumulation and incremental re-rendering in `tests/unit/cli/commands/chat.test.ts` — verify each `{ type: "text" }` ChatEvent appends to buffer and triggers `renderStreamingMarkdown(buffer)`; verify cursor is reset to start of response area before each re-render; verify multiple sequential text events produce correct accumulated output
- [ ] T103b [P2] [US5] Write tests for response completion rendering in `tests/unit/cli/commands/chat.test.ts` — verify `{ type: "complete" }` ChatEvent triggers final `renderMarkdown(buffer)` (not `renderStreamingMarkdown`), writes trailing newline, clears the buffer, and transitions prompt display back to input mode
- [ ] T103 [P2] [US5] Implement streaming display loop in `src/cli/commands/chat.ts` — for each `{ type: "text" }` ChatEvent: append `content` to a buffer string, call `renderStreamingMarkdown(buffer)`, clear the output region (move cursor to start of response area), and rewrite the rendered output via `process.stdout.write()`
- [ ] T104 [P2] [US5] Implement response completion handling in `src/cli/commands/chat.ts` — on `{ type: "complete" }` ChatEvent: do a final `renderMarkdown(buffer)` of the full accumulated buffer (without remend), write trailing newline, clear the buffer, transition prompt display back to input mode

### D2. Ctrl+C during streaming

- [ ] T105 [P2] [US5] Write tests for Ctrl+C during streaming — verify `SIGINT` while session state is `streaming` calls `interruptResponse()` instead of exiting, and session state returns to `prompting` — in `tests/unit/agent/session.test.ts`
- [ ] T106 [P2] [US5] Implement SIGINT handler branching in `src/cli/commands/chat.ts` — in the Bun-native readline (`node:readline`, built into the Bun runtime) `SIGINT` event handler, check `session.state`: if `streaming`, call `interruptResponse(session)` and display partial response with "[interrupted]" suffix; if `prompting`, display hint "Type 'exit' or press Ctrl+D to quit"
- [ ] T107 [P2] [US5] Verify Ctrl+C during streaming preserves session — after interrupt, the readline prompt reappears and accepts new input

### D3. Error event rendering

- [ ] T108a [P2] [US5] Write tests for error ChatEvent rendering in `tests/unit/cli/commands/chat.test.ts` — verify `{ type: "error", message }` writes formatted error to stderr (not stdout), clears any accumulated buffer, and returns to prompt state; verify error output includes the error message text
- [ ] T108 [P2] [US5] Implement error ChatEvent handling in the streaming loop in `src/cli/commands/chat.ts` — on `{ type: "error", message }`: render error message to stderr using LogTape error logging (`getModuleLogger("cli").error(...)`), clear the buffer, return to prompt

---

## Phase E — Integration Verification

- [ ] T109 [P2] [US5] Run full test suite (`bun test`) — verify all new tests in `tests/unit/cli/render.test.ts`, `tests/unit/agent/streaming.test.ts`, `tests/unit/agent/session.test.ts` pass alongside existing tests
- [ ] T110 [P2] [US5] Run `bun run lint` — verify all new/modified files pass Biome linting and formatting (tabs, 100-char line width, no `any`, no `console.log` in library code)
- [ ] T111 [P2] [US5] Run `bun run typecheck` — verify all new/modified files pass TypeScript strict mode checking with no errors

---

## Task Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| A — Streaming Markdown Enhancements | T085–T090 | Enhance existing `src/cli/render.ts` (from US1) for streaming edge cases |
| B — Streaming Event Mapping | T091–T098b | `src/agent/streaming.ts`: SDKPartialAssistantMessage, SDKResultMessage, SDKStatusMessage, SDKAPIRetryMessage, SDKRateLimitEvent handling |
| C — Interrupt Response Integration | T099–T102 | Verify `interruptResponse()` (from US4) integrates with streaming display |
| D — Streaming Display Loop | T103a–T108 | `src/cli/commands/chat.ts`: token accumulation, Ctrl+C handling, error rendering |
| E — Integration Verification | T109–T111 | Full test suite, lint, typecheck |

**Total**: 32 tasks (T085–T111, including T098a, T098b, T103a, T103b, T108a; T101 removed)

## Dependency Graph

```
Phase A (render.ts — enhance existing from US1)
  T085 → T086 → T087
  T088 → T089 → T090

Phase B (streaming.ts)          Phase C (interrupt integration)
  T091 → T093                     T099 → T102
  T092 → T093 → T094             T100 → T102
  T095 → T097
  T096 → T097 → T098
  T098a → T098b

Phase D (chat.ts) — depends on A, B, C
  A + B → T103a → T103b → T103 → T104
  C + T103 → T105 → T106 → T107
  T103 → T108a → T108

Phase E — depends on all above
  D → T109 → T110 → T111
```

**Critical path**: T085 → T086 → T087 → T088 → T089 → T090 → T103a → T103b → T103 → T104 → T109 → T110 → T111

**Parallelizable**: Phases A, B, and C can execute concurrently (no cross-dependencies until Phase D).
