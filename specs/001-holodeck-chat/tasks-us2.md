# Tasks: User Story 2 - Multi-Turn Conversation with Context Retention

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29
**User Story**: US2 - Multi-Turn Conversation with Context Retention (P1)
**FRs**: FR-006 (conversation history), FR-018 (context warning), FR-019 (compaction notice)
**Prerequisite**: All Phase 1 (Setup) and Phase 2 (Foundational) tasks from tasks-us1.md are complete.

> **Note**: Task IDs are scoped to this file. Cross-file references use the format `tasks-usX.md#TXXX`.

## Assumptions from US1 Completion

The following are already implemented and available:

- `src/config/schema.ts` — All Zod schemas (`AgentConfigSchema`, `ClaudeConfigSchema`, etc.)
- `src/config/loader.ts` — `loadAgentConfig()` with YAML parsing and env var resolution
- `src/lib/errors.ts` — `HoloDeckError`, `ConfigError` hierarchy
- `src/lib/logger.ts` — LogTape structured logging
- `src/lib/env.ts` — Environment variable resolution
- `src/cli/index.ts` — Commander entry point
- `src/cli/commands/chat.ts` — Basic chat command registration and single-turn flow
- `src/agent/session.ts` — `ChatSession` interface, `createChatSession()`, basic `sendMessage()`
- `src/agent/streaming.ts` — `ChatEvent` union type, `mapSDKMessages()` for text/tool/complete events
- `src/agent/hooks.ts` — `buildHooks()` with `PreToolUse`/`PostToolUse`
- `src/cli/render.ts` — Terminal markdown rendering
- Test fixtures in `tests/fixtures/`

## Independent Test

Start a chat session, send "My name is Alice" as message 1, then send "What is my name?" as message 2. Verify the agent responds with "Alice" (or equivalent). This confirms multi-turn context is preserved via SDK `resume: sessionId`.

---

## Phase 3: Multi-Turn Conversation with Context Retention

**Goal**: Enable multi-turn conversations by tracking `sessionId` from the SDK, resuming sessions across turns, monitoring context window usage, and handling automatic compaction events.

### 3A. Multi-Turn Session Management (FR-006)

#### Tests First

- [ ] T040 [US2] Write test: `sendMessage` on first turn sets `sessionId` from `SDKResultMessage.session_id` — `tests/unit/agent/session.test.ts`
- [ ] T041 [US2] Write test: `sendMessage` on second turn passes `resume: sessionId` to `query()` — `tests/unit/agent/session.test.ts`
- [ ] T042 [US2] Write test: `sessionId` remains `null` if SDK response has no `session_id` — `tests/unit/agent/session.test.ts`
- [ ] T043 [US2] Write test: `sendMessage` across 3+ turns preserves same `sessionId` — `tests/unit/agent/session.test.ts`

#### Implementation

- [ ] T044 [US2] Update `ChatSession` interface to include `sessionId: string | null` field initialized to `null` — `src/agent/session.ts`
- [ ] T045 [US2] Update `sendMessage()` to extract `session_id` from `SDKResultMessage` and store in `session.sessionId` — `src/agent/session.ts`
- [ ] T046 [US2] Update `sendMessage()` to pass `resume: session.sessionId` to SDK `query()` when `sessionId` is not null — `src/agent/session.ts`
- [ ] T047 [US2] Update `mapSDKMessages()` to emit `{ type: "complete", sessionId }` with the session ID from `SDKResultMessage` — `src/agent/streaming.ts`

### 3B. Context Usage Monitoring (FR-018)

#### Tests First

- [ ] T048 [P] [US2] Write test: `mapSDKMessages` emits `context_warning` event when context usage >= 80% — `tests/unit/agent/streaming.test.ts`
- [ ] T049 [P] [US2] Write test: `context_warning` is emitted only once per session (not repeated on subsequent turns) — `tests/unit/agent/streaming.test.ts`
- [ ] T050 [P] [US2] Write test: no `context_warning` emitted when context usage < 80% — `tests/unit/agent/streaming.test.ts`
- [ ] T051 [P] [US2] Write test: `contextUsage` field on `ChatSession` is updated after each turn completes — `tests/unit/agent/session.test.ts`

#### Implementation

- [ ] T052 [US2] Add `contextUsage: SDKControlGetContextUsageResponse | null` field to `ChatSession` initialized to `null` — `src/agent/session.ts`
- [ ] T053 [US2] Add `contextWarningShown: boolean` field to `ChatSession` initialized to `false` — `src/agent/session.ts`
- [ ] T054 [US2] After each turn completes in `sendMessage()`, call `query.getContextUsage()` and store result in `session.contextUsage` — `src/agent/session.ts`
- [ ] T055 [US2] In `sendMessage()` (or `mapSDKMessages`), after updating context usage, yield `{ type: "context_warning", ratio: percentage }` if `percentage >= 80` and `contextWarningShown` is `false`, then set `contextWarningShown = true` — `src/agent/streaming.ts`

### 3C. Compaction Event Handling (FR-019)

#### Tests First

- [ ] T056 [P] [US2] Write test: `mapSDKMessages` maps `SDKCompactBoundaryMessage` to `{ type: "compaction", summary }` ChatEvent — `tests/unit/agent/streaming.test.ts`
- [ ] T057 [P] [US2] Write test: `PreCompact` hook builder returns a hook that logs compaction start — `tests/unit/agent/hooks.test.ts`
- [ ] T058 [P] [US2] Write test: `PostCompact` hook builder returns a hook that logs compaction completion — `tests/unit/agent/hooks.test.ts`

#### Implementation

- [ ] T059 [US2] In `mapSDKMessages()`, handle `SDKCompactBoundaryMessage` and yield `{ type: "compaction", summary: "<extracted summary>" }` — `src/agent/streaming.ts`
- [ ] T060 [US2] Add `PreCompact` hook to `buildHooks()` that logs compaction initiation via LogTape — `src/agent/hooks.ts`
- [ ] T061 [US2] Add `PostCompact` hook to `buildHooks()` that logs compaction completion and resets `contextWarningShown` to `false` — `src/agent/hooks.ts`

### 3D. CLI Rendering for Context Events

#### Tests First

- [ ] T062 [P] [US2] Write test: chat loop renders context warning formatted as `"Warning: Context usage at {N}% -- older messages may be summarized soon."` to stderr — `tests/unit/cli/chat.test.ts`
- [ ] T063 [P] [US2] Write test: chat loop renders compaction notice formatted as `"Info: Conversation compacted -- older messages have been summarized to free context space."` to stderr — `tests/unit/cli/chat.test.ts`

#### Implementation

- [ ] T064 [US2] In the chat command event loop, handle `context_warning` ChatEvent and display warning to stderr via logger — `src/cli/commands/chat.ts`
- [ ] T065 [US2] In the chat command event loop, handle `compaction` ChatEvent and display compaction notice to stderr via logger — `src/cli/commands/chat.ts`
- [ ] T066 [US2] Ensure the chat loop continues accepting input after context warning and compaction notices without interruption — `src/cli/commands/chat.ts`

---

### Checkpoint: US2 Complete

All acceptance scenarios verified:

1. **Multi-turn context** — `sessionId` captured on first response, `resume` passed on subsequent turns (T040-T047)
2. **10+ turn conversations** — same `sessionId` preserved across all turns (T043, T046)
3. **80% context warning** — one-time warning when `percentage >= 80` (T048-T055, T062, T064)
4. **Compaction notification** — `SDKCompactBoundaryMessage` mapped and displayed, hooks log lifecycle (T056-T061, T063, T065)

### Parallelization Guide

The following task groups can be executed in parallel:

- **3B tests** (T048-T051) can run in parallel with each other since they test independent conditions
- **3C tests** (T056-T058) can run in parallel with each other and with 3B tests
- **3D tests** (T062-T063) can run in parallel with each other and with 3B/3C tests
- **3A tests** (T040-T043) are sequential — each builds on the previous turn behavior

After tests are written, implementation within each sub-phase (3A, 3B, 3C, 3D) is sequential, but sub-phases 3B, 3C, and 3D are independent of each other and can be implemented in parallel after 3A is complete (since context monitoring and compaction both depend on the multi-turn session infrastructure).

```
T040-T043 (3A tests, sequential)
  --> T044-T047 (3A impl, sequential)
        --> T048-T051 (3B tests) | T056-T058 (3C tests) | T062-T063 (3D tests)  [parallel]
              --> T052-T055 (3B impl) | T059-T061 (3C impl) | T064-T066 (3D impl)  [parallel]
```
