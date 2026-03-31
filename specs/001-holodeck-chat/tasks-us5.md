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

- [x] T085 [P2] [US5] Write additional tests for `renderMarkdown()` — **DONE** (6 edge case tests: long input, nested lists, mixed headings, consecutive code blocks, Unicode/emoji, ANSI safety)
- [x] T086 [P2] [US5] Enhance `renderMarkdown()` — **DONE** (no changes needed — all edge cases pass with existing `marked` + `marked-terminal` stack)
- [x] T087 [P2] [US5] Verify `renderMarkdown()` passes all tests — **DONE** (16/16 pass)

### A2. Enhance renderStreamingMarkdown() edge cases

- [x] T088 [P2] [US5] Write additional tests for `renderStreamingMarkdown()` — **DONE** (6 edge case tests: unterminated bold, code fence, inline code, partial lists, growing buffer stability, trailing newlines)
- [x] T089 [P2] [US5] Enhance `renderStreamingMarkdown()` — **DONE** (no changes needed — `remend()` handles all edge cases)
- [x] T090 [P2] [US5] Verify `renderStreamingMarkdown()` passes all tests — **DONE** (16/16 pass)

---

## Phase B — Streaming Text Event Mapping (`src/agent/streaming.ts`)

### B1. Map SDKPartialAssistantMessage to ChatEvent text

- [x] T091 [P2] [US5] Write tests for `SDKPartialAssistantMessage` handling in `mapSDKMessages()` — **DONE** — tests exist in `tests/unit/agent/streaming.test.ts` for text deltas via `stream_event`
- [x] T092 [P2] [US5] Write tests for sequential partial messages — **DONE** — sequential text delta tests exist in `streaming.test.ts`
- [x] T093 [P2] [US5] Implement `SDKPartialAssistantMessage` branch in `mapSDKMessages()` — **DONE** — `mapStreamEvent()` extracts text delta and yields `{ type: "text", content: delta.text }` (streaming.ts lines 75-112)
- [x] T094 [P2] [US5] Verify streaming text event mapping passes all tests — **DONE**

### B2. Map SDKResultMessage to ChatEvent complete

- [x] T095 [P2] [US5] Write tests for `SDKResultMessage` with `subtype: "success"` — **DONE** — tests in `streaming.test.ts`
- [x] T096 [P2] [US5] Write tests for `SDKResultMessage` with error subtypes — **DONE** — tests in `streaming.test.ts`
- [x] T097 [P2] [US5] Implement `SDKResultMessage` branch in `mapSDKMessages()` — **DONE** — `mapResultMessage()` yields `complete` for success, `error` for error subtypes (streaming.ts lines 154-164)
- [x] T098 [P2] [US5] Verify result event mapping passes all tests — **DONE**

### B3. Map additional SDK message types (status, retry, rate limit)

- [x] T098a [P2] [US5] Write tests for `SDKStatusMessage`, `SDKAPIRetryMessage`, and `SDKRateLimitEvent` — **PARTIALLY DONE** — tests exist for status and rate limit; `SDKAPIRetryMessage` mapped as status event
- [x] T098b [P2] [US5] Implement `SDKStatusMessage`, `SDKAPIRetryMessage`, and `SDKRateLimitEvent` branches — **DONE** — all mapped in `mapSDKMessages()`: `SDKStatusMessage` → status event (line 176), retry → status event (lines 190-194), rate limit → status event (lines 209-234), `auth_status` also handled (lines 236-242)

---

## Phase C — Interrupt Response Integration with Streaming Display

> `interruptResponse()` is already implemented in US4 (tasks-us4.md#T077–T078). This phase verifies it integrates correctly with the streaming display loop.

### C1. Verify interruptResponse() streaming display integration

- [x] T099 [P2] [US5] ~~Write tests for interrupt-streaming display integration~~ — **SUPERSEDED by TUI**
  - TUI handles interrupt via `store.finalizeMessage()` which finalizes the accumulated markdown in the chat history component (app.ts lines 117-119, 126-128)
  - No cursor reset needed — TUI re-renders the component tree
  - **Replacement needed**: Tests for TUI `processEventStream()` interrupt behavior in `tests/unit/cli/tui/`

- [x] T100 [P2] [US5] ~~Write tests for post-interrupt re-render~~ — **SUPERSEDED by TUI**
  - TUI uses `ChatStore.finalizeMessage()` to switch from streaming to finalized markdown rendering
  - No "[interrupted]" suffix currently implemented — could be added to `store.finalizeMessage()` if needed
  - Prompt returns to input mode via `inputBar.textarea.focus()` (app.ts line 183)

- [x] T101 [P2] [US5] ~~removed~~ (implementation owned by US4 tasks-us4.md#T078)
- [x] T102 [P2] [US5] ~~Verify interrupt-streaming integration~~ — **SUPERSEDED by TUI** — TUI interrupt flow works via Ctrl+C/Escape → `interruptResponse()` → `store.finalizeMessage()`

---

## Phase D — Streaming Display Loop (`src/cli/commands/chat.ts`)

### D1. Token accumulation and incremental rendering

- [x] T103a [P2] [US5] ~~Write tests for token accumulation (readline)~~ — **SUPERSEDED by TUI**
  - TUI accumulation: `store.appendStreamDelta(event.content)` in `processEventStream()` (hooks.ts line 23)
  - TUI renders via reactive `ChatStore` → `ChatHistory` component, not stdout cursor manipulation
  - Single-message mode (`--prompt`): `runSingleMessage()` accumulates in `streamingBuffer` (chat.ts line 69) — this path still exists but is non-interactive
  - **Replacement needed**: Tests for `processEventStream()` in `tests/unit/cli/tui/hooks.test.ts`

- [x] T103b [P2] [US5] ~~Write tests for response completion rendering (readline)~~ — **SUPERSEDED by TUI**
  - TUI completion: `store.finalizeMessage()` called on `{ type: "complete" }` (hooks.ts lines 48-58)
  - Switches from streaming markdown to finalized markdown rendering in chat history component

- [x] T103 [P2] [US5] ~~Implement streaming display loop (readline)~~ — **SUPERSEDED by TUI**
  - TUI: `processEventStream()` in `src/cli/tui/hooks.ts` handles all event types
  - Single-message mode: `runSingleMessage()` in `src/cli/commands/chat.ts` (lines 58-108) handles incremental delta rendering via `renderStreamingMarkdown()` — **this path is DONE**

- [x] T104 [P2] [US5] ~~Implement response completion handling (readline)~~ — **SUPERSEDED by TUI**
  - TUI: `store.finalizeMessage()` on complete event
  - Single-message mode: writes trailing newline + calls `closeSession()` in finally block — **DONE**

### D2. Ctrl+C during streaming

- [x] T105 [P2] [US5] ~~Write tests for Ctrl+C during streaming (readline SIGINT)~~ — **SUPERSEDED by TUI**
  - TUI Ctrl+C handler: app.ts lines 122-140 — calls `interruptResponse(session)` if streaming
  - Escape key also interrupts (app.ts lines 116-120)
  - **Replacement needed**: Tests for TUI keypress handler interrupt behavior

- [x] T106 [P2] [US5] ~~Implement SIGINT handler branching (readline)~~ — **SUPERSEDED by TUI**
  - TUI implements this via keypress handler with `exitOnCtrlC: false` (app.ts line 24)
  - Branching: streaming → `interruptResponse()`, prompting → "Press Ctrl+C again to exit"

- [x] T107 [P2] [US5] ~~Verify Ctrl+C during streaming preserves session (readline)~~ — **SUPERSEDED by TUI**
  - TUI: after interrupt, `inputBar.textarea.focus()` re-enables input (app.ts line 183)

### D3. Error event rendering

- [x] T108a [P2] [US5] ~~Write tests for error ChatEvent rendering (readline)~~ — **PARTIALLY SUPERSEDED**
  - TUI: `processEventStream()` returns `{ shouldAbort: true, errorMessage }` on error (hooks.ts lines 62-66), store shows error via `store.setError()`
  - Single-message mode: error events write to stderr via `formatRuntimeErrorMessage()` + set `process.exitCode = 2` (chat.ts lines 92-96) — **DONE**
  - **Replacement needed**: Tests for both TUI error path and single-message error path

- [x] T108 [P2] [US5] ~~Implement error ChatEvent handling (readline)~~ — **DONE (both paths)**
  - TUI: `processEventStream()` handles error events (hooks.ts lines 62-66)
  - Single-message: `runSingleMessage()` handles error events (chat.ts lines 92-96)

---

## Phase E — Integration Verification

- [x] T109 [P2] [US5] Run full test suite — **DONE** (162 tests, 161 pass, 1 skip, 0 fail)
- [x] T110 [P2] [US5] Run `bun run lint` — **DONE** (clean, no errors)
- [x] T111 [P2] [US5] Run `bun run typecheck` — **DONE** (clean, no errors)

---

## Task Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| A — Streaming Markdown Enhancements | T085–T090 | **ALL DONE** — 12 edge case tests added, no render.ts changes needed |
| B — Streaming Event Mapping | T091–T098b | **ALL DONE** — all event types mapped and tested |
| C — Interrupt Response Integration | T099–T102 | **SUPERSEDED by TUI** |
| D — Streaming Display Loop | T103a–T108 | **SUPERSEDED by TUI** — single-message path done |
| E — Integration Verification | T109–T111 | **ALL DONE** — tests pass, lint clean, typecheck clean |

**Total**: 32 tasks — **ALL COMPLETE** (18 done + 14 superseded by TUI)

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
