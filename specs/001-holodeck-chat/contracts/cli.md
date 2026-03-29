# Contract: CLI Interface

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29

## Command: `holodeck chat`

### Synopsis

```
holodeck chat [--agent <path>] [--verbose]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--agent <path>` | `string` | `./agent.yaml` | Path to agent YAML configuration file |
| `--verbose` | `boolean` | `false` | Enable verbose logging (debug-level output to stderr) |

### Behavior

1. If `--agent` is provided, load config from that path
2. If `--agent` is omitted, look for `./agent.yaml` in CWD
3. If neither exists, exit with error: `Error: No agent configuration found. Provide --agent <path> or create agent.yaml in the current directory.`
4. Parse and validate YAML against `AgentConfigSchema`
5. On validation failure, display human-readable error with field path and exit(1)
6. On success, start interactive chat session

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Clean exit (user typed `exit`/`quit` or Ctrl+D) |
| `1` | Configuration error (file not found, validation failure, missing env var) |
| `2` | Runtime error (API authentication failure, unrecoverable SDK error) |

### Interactive Session Commands

| Input | Action |
|-------|--------|
| Any text + Enter | Send as message to agent |
| `exit` or `quit` | Graceful session termination |
| Ctrl+C (during streaming) | Interrupt current response, keep session |
| Ctrl+C (at prompt) | Display exit hint |
| Ctrl+D | Graceful session termination |
| Ctrl+O | Toggle display of last tool invocation details |

### Output Format

**User prompt:**
```
You: <cursor>
```

**Agent response (streaming):**
```
Agent: <tokens appear incrementally, markdown rendered with ANSI>
```

**Tool invocation (default view):**
```
⟳ Calling search_docs...
✓ search_docs done
```

**Tool invocation (expanded via Ctrl+O):**
```
┌─ search_docs ─────────────────────────
│ Args: { "query": "refund policy", "top_k": 5 }
│ Result: { "results": [...] }
└────────────────────────────────────────
```

**Context warning (FR-018):**
```
⚠ Context usage at 82% — older messages may be summarized soon.
```

**Compaction notice (FR-019):**
```
ℹ Conversation compacted — older messages have been summarized to free context space.
```

**Permission prompt (manual mode, FR-015):**
```
⟳ Agent wants to call: search_docs({ "query": "refund policy" })
  Allow? [Y/n]: <cursor>
```

**Error display:**
```
Error: Invalid configuration in agent.yaml
  → model.temperature: Number must be less than or equal to 2 (received 5.0)
```

**API error:**
```
Error: Authentication failed — invalid or expired credentials.
  Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.
```

**Farewell:**
```
Goodbye!
```
