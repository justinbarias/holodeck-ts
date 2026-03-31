# HoloDeck Chat TUI — Implementation Plan

## Context

The `001-holodeck-chat` branch has a **fully functional** readline-based chat command (~1100 LOC src, ~1000 LOC tests). The agent session, streaming, config loading, MCP tools, and skills discovery all work. This plan replaces **only the rendering layer** with an OpenTUI-based terminal UI while preserving all existing functionality.

## Design Decisions (from user interview)

| Decision | Choice |
|---|---|
| Layout | Three-pane: collapsible sidebar (25%, Ctrl+B) + chat history + input |
| Tool calls | Status bar/ticker at bottom (spinner + tool name + elapsed) |
| Input | Single-line auto-expanding (1-5 lines), Enter to send, Shift+Enter newline |
| Markdown | Buffer-then-render: raw text streaming, formatted markdown on complete |
| Code blocks | Syntax-highlighted via OpenTUI Code/SyntaxStyle |
| Theme | Branded HoloDeck (cyan #00E5FF, purple #B388FF, dark #0D1117) |
| Keybindings | Ctrl+B sidebar, Esc cancel generation, Up/Down input history |
| Token display | Per-message badge + session totals in sidebar |

## Layout Mockup

```
┌──────────┬───────────────────────────────────────────┐
│ Agent    │                                           │
│ research │  You: What is contextual retrieval?       │
│          │                                           │
│ Model    │  Agent: Contextual retrieval is an        │
│ sonnet   │  approach where each chunk is enriched    │
│ temp 0.3 │  with document-level context before...    │
│          │                             42↑ 380↓ $0.003│
│ ── Tools │                                           │
│ ▸ search │  You: How does it compare?                │
│ ▸ web    │                                           │
│          │  Agent: streaming raw text here██         │
│ ── Stats │                                           │
│ Turns: 2 ├───────────────────────────────────────────┤
│ In: 84   │ ⠋ Running: web_search("benchmarks")  3.2s│
│ Out: 760 ├───────────────────────────────────────────┤
│ $0.006   │ > Type a message...                [Enter]│
└──────────┴───────────────────────────────────────────┘
```

## What Is Reused vs. Replaced

| Artifact | Status |
|---|---|
| `src/agent/session.ts` (ChatSession, sendMessage, etc.) | **Reused entirely** |
| `src/agent/streaming.ts` (ChatEvent, mapSDKMessages) | **Reused entirely** — ChatEvent is the data contract |
| `src/config/schema.ts`, `loader.ts` | **Reused entirely** |
| `src/tools/mcp.ts`, `skills.ts` | **Reused entirely** |
| `src/lib/errors.ts`, `env.ts`, `logger.ts` | **Reused entirely** |
| `src/cli/render.ts` | **Kept** for `--prompt` stdout mode |
| `chat.ts` — `chatCommand()`, `formatRuntimeErrorMessage()` | **Kept** |
| `chat.ts` — `runSingleMessage()` (--prompt path) | **Kept as-is** |
| `chat.ts` — `renderChatEvent()`, `RenderState`, readline loop | **Replaced** by TUI |

## New File Structure

```
src/cli/tui/
├── app.ts               # Root: renderer, layout, lifecycle, SIGINT, main loop
├── state.ts             # Reactive store: messages[], toolStatus, sidebar, history
├── hooks.ts             # Event bridge: AsyncGenerator<ChatEvent> → state mutations
├── theme.ts             # HoloDeck color palette constants
└── components/
    ├── chat-history.ts  # ScrollBox of message bubbles (sticky bottom)
    ├── message-bubble.ts# Single message: role label, Text/Markdown content, token badge
    ├── input-bar.ts     # Auto-expanding input (1-5 lines), Enter/Shift+Enter
    ├── sidebar.ts       # Collapsible: agent info, tools, session stats
    └── status-bar.ts    # Tool ticker (spinner + name + elapsed) + context %
```

## Data Flow

```
User types in InputBar
  → app.ts onSubmit(text)
    → state.addUserMessage(text)
    → sendMessage(session, text) returns AsyncGenerator<ChatEvent>
    → hooks.processEventStream(events, state, session)
      ChatEvent::text           → state.appendStreamDelta()     → message-bubble updates Text
      ChatEvent::tool_start     → state.setActiveToolCall()     → status-bar shows spinner
      ChatEvent::tool_end       → state.clearActiveToolCall()   → status-bar clears
      ChatEvent::complete       → state.finalizeMessage()       → message-bubble swaps Text → Markdown
      ChatEvent::context_warning→ state.updateContextPct()      → sidebar/status-bar warning
      ChatEvent::error          → state.setError()              → status-bar shows error
    → state changes trigger onChange → components re-render → renderer.requestRender()
```

## Refactoring Plan for `chat.ts`

**Stays in `chat.ts`:**
- `chatCommand()` — Commander definition (--agent, --prompt, --verbose)
- `ChatCommandOptions` interface
- `formatRuntimeErrorMessage()` — shared utility
- `runChatCommand()` skeleton — config loading, session creation, --prompt branching
- `runSingleMessage()` — non-interactive path, unchanged
- Exported constants: `USER_PROMPT_PREFIX`, `AGENT_RESPONSE_PREFIX`, `FAREWELL_MESSAGE`

**Replaced:**
- `RenderState`, `flushResponseLine()`, `renderChatEvent()` → `state.ts` + `hooks.ts`
- readline event loop → `app.ts` with OpenTUI components

**New code in `runChatCommand()`:**
```typescript
if (options.prompt) { await runSingleMessage(...); return; }
await launchTUI(session, agentConfig);  // replaces readline loop
```

## State Architecture

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;           // raw text accumulated from ChatEvent.text
  isStreaming: boolean;
  tokenCount?: number;       // from session.contextUsage after complete
  timestamp: Date;
}

interface ToolStatus {
  toolName: string;
  state: "calling" | "done" | "failed";
  startedAt: Date;
  error?: string;
}

interface TUIState {
  messages: ChatMessage[];
  currentToolStatus: ToolStatus | null;
  inputHistory: string[];
  inputHistoryIndex: number;
  sidebarVisible: boolean;
  contextPercentage: number;
  sessionTokens: { input: number; output: number } | null;
  statusMessage: string | null;
  isStreaming: boolean;
  agentName: string;
  modelName: string;
  temperature: number;
  skills: string[];
  tools: Array<{ name: string; type: string }>;
}
```

Plain mutable store with `getState()`, `subscribe(listener)`, and typed mutation methods. No external state library.

## Implementation Phases (Parallel Agent Strategy)

### Pre-requisite: Install dependency
```bash
bun add @opentui/core
```

### Wave 1 — Three parallel agents, no dependencies between them

**Agent A: Foundation (theme + state + tests)**
- `src/cli/tui/theme.ts` — HoloDeck color palette constants (RGBA values)
- `src/cli/tui/state.ts` — TUIState interface, ChatStore class with all mutations + onChange subscription
- `tests/unit/cli/tui/state.test.ts` — pure state logic tests (no TUI rendering)

**Agent B: Message + Input components**
- `src/cli/tui/components/message-bubble.ts` — role label (cyan user / purple agent), Text (streaming) / Markdown (complete), token badge
- `src/cli/tui/components/input-bar.ts` — auto-expanding Textarea (1-5 lines), Enter to send, Shift+Enter newline, Up/Down history navigation

**Agent C: Status + Sidebar components**
- `src/cli/tui/components/status-bar.ts` — tool ticker with braille spinner animation + tool name + elapsed time + context %
- `src/cli/tui/components/sidebar.ts` — collapsible panel (agent info, tool list, session stats), 25% width

### Wave 2 — Two parallel agents, depend on Wave 1

**Agent D: Event bridge (depends on Agent A's state.ts)**
- `src/cli/tui/hooks.ts` — `processEventStream()` consuming `AsyncGenerator<ChatEvent>`, dispatching to ChatStore
- `tests/unit/cli/tui/hooks.test.ts` — event bridge tests feeding mock ChatEvent sequences

**Agent E: Chat history (depends on Agent B's message-bubble.ts)**
- `src/cli/tui/components/chat-history.ts` — ScrollBox with sticky bottom scroll, manages MessageBubble array

### Wave 3 — Two parallel agents, depends on Waves 1+2

**Agent F: App shell + component integration**
- `src/cli/tui/app.ts` — createCliRenderer, flexbox layout assembly, keybinding registration (Ctrl+B, Esc, Up/Down), SIGINT handling, main event loop wiring state ↔ components ↔ session
- Refactor `src/cli/commands/chat.ts` — strip readline loop, add `launchTUI()` call, keep `--prompt` path untouched
- Component tests with `createTestRenderer()` (headless)
- Integration test: mock session → TUI → verify rendered output
- Regression: existing `chat.test.ts` still passes

**Agent G: Live E2E integration test (independent of TUI — tests existing --prompt path)**
- `tests/fixtures/agents/e2e-minimal.yaml` — deterministic test agent (temp 0, max_tokens 100)
- `tests/integration/cli/chat-e2e.test.ts` — full CLI subprocess tests via `Bun.spawn()`
- Loads `.env` for `CLAUDE_CODE_OAUTH_TOKEN`, sets `CLAUDECODE=""` for nested execution
- Tests: single message output, deterministic response, invalid config exit 1, missing creds, streaming completion
- Skips gracefully when credentials unavailable

### Dependency Graph

```
                    bun add @opentui/core
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         Agent A       Agent B       Agent C
        theme.ts    message-bubble  status-bar
        state.ts     input-bar      sidebar
       state.test
              │             │
         ┌────┘        ┌────┘
         ▼             ▼
      Agent D       Agent E
      hooks.ts    chat-history
     hooks.test
              │        │
              └───┬────┘
              ┌───┴───────────────┐
              ▼                   ▼
          Agent F             Agent G
          app.ts           e2e test suite
       chat.ts refactor    e2e fixture
      component tests     (independent — tests
     integration tests     existing --prompt path,
                           no TUI dependency)
```

**Note:** Agent G can run in parallel with Agent F because it tests the _existing_ `--prompt` non-interactive path, which is preserved unchanged by the TUI refactor. It validates the full CLI pipeline (config → session → SDK → streaming → output) independently of any TUI work.

## Behavioral Contracts (Must Preserve)

### SIGINT Handling
- During streaming: `interruptResponse(session)`, stop event processing, finalize message
- At prompt (not streaming): show hint in status bar, do not exit
- Double SIGINT within 1s: force exit with code 130

### Exit Codes
- 0: clean exit (exit/quit/Ctrl+D)
- 1: config error (before TUI launches, stays in chat.ts)
- 2: runtime error during streaming

## Verification

### Static checks
1. `bun run typecheck` — all new files pass strict TypeScript
2. `bun run lint` — Biome passes on all files
3. `bun test` — unit + component tests pass (mocked, no API calls)

### Live Integration Test (`tests/integration/cli/chat-e2e.test.ts`)

End-to-end test that exercises the **full CLI pipeline** by spawning `holodeck chat -p` as a subprocess. This hits the real Claude API and validates the entire flow: config loading → session creation → SDK query → streaming → output.

**Environment setup:**
- Load `.env` at project root with `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`)
- Set `CLAUDECODE=""` to allow nested Claude Code execution (the SDK inherits `CLAUDECODE=1` from the parent session, which blocks subprocess launches)
- Tests are tagged/skipped when credentials are missing

**Test fixture:** `tests/fixtures/agents/e2e-minimal.yaml`
```yaml
name: e2e-test-agent
model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  max_tokens: 100
  temperature: 0
instructions:
  inline: "You are a test agent. Always respond with exactly: HOLODECK_E2E_OK"
```

**Test cases:**

| Test | Command | Asserts |
|---|---|---|
| Single message returns output | `holodeck chat --agent fixtures/e2e-minimal.yaml -p "Say hello"` | exit code 0, stdout contains text, no stderr errors |
| Deterministic response | `holodeck chat --agent fixtures/e2e-minimal.yaml -p "Respond"` | stdout contains `HOLODECK_E2E_OK` |
| Invalid config exits 1 | `holodeck chat --agent nonexistent.yaml -p "hello"` | exit code 1, stderr contains error message |
| Missing credentials exits 2 | (unset all auth env vars) `holodeck chat -p "hello"` | exit code 2 or 1, stderr contains "Authentication" or "API key" |
| Streaming completes (non-empty) | `holodeck chat --agent fixtures/e2e-minimal.yaml -p "Count to 3"` | stdout length > 0, no truncation |

**Implementation pattern:**
```typescript
import { describe, it, expect, beforeAll } from "bun:test";
import { resolve } from "node:path";

const CLI_PATH = resolve(import.meta.dir, "../../../src/cli/index.ts");
const FIXTURE_PATH = resolve(import.meta.dir, "../../fixtures/agents/e2e-minimal.yaml");

// Skip entire suite if no credentials
const hasCredentials = Boolean(
  process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY
);

describe.skipIf(!hasCredentials)("holodeck chat e2e", () => {
  it("returns output for single message", async () => {
    const proc = Bun.spawn(
      ["bun", CLI_PATH, "chat", "--agent", FIXTURE_PATH, "-p", "Respond"],
      {
        env: {
          ...process.env,
          CLAUDECODE: "",  // Allow nested Claude Code
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stdout.trim().length).toBeGreaterThan(0);
    expect(stderr).not.toContain("Error:");
  }, 30_000);  // 30s timeout for API call
});
```

**Key details:**
- Uses `Bun.spawn()` to run the CLI as a real subprocess (not importing functions)
- Sets `CLAUDECODE: ""` in the subprocess env to bypass the nested-execution check
- 30-second timeout per test (API latency)
- `describe.skipIf(!hasCredentials)` skips gracefully in CI without secrets
- Tests both happy path and error paths (bad config, missing creds)
- Temperature 0 + deterministic prompt for reproducible assertions
- **IMPORTANT:** Prompt the user to provide `.env` with credentials before running e2e tests

**File additions:**
- `tests/integration/cli/chat-e2e.test.ts` — the test file
- `tests/fixtures/agents/e2e-minimal.yaml` — deterministic test fixture
- `.env.example` — update to document `CLAUDE_CODE_OAUTH_TOKEN` for e2e tests

### Manual verification
4. `bun run dev -- chat` — launches TUI, interactive chat works
5. `bun run dev -- chat --prompt "hello"` — non-interactive mode still works
