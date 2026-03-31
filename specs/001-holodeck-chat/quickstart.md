# Quickstart: HoloDeck Chat

**Feature Branch**: `001-holodeck-chat` | **Date**: 2026-03-29

## Prerequisites

- [Bun](https://bun.sh) >= 1.0.0 installed
- Anthropic API key (`ANTHROPIC_API_KEY`)

## 1. Install Dependencies

```bash
cd holodeck-ts
bun install
```

## 2. Set Your Credentials

Provide one of the following (checked in order):

```bash
# Option 1: API key (recommended for production)
export ANTHROPIC_API_KEY="sk-ant-..."

# Option 2: OAuth token (for personal development)
export CLAUDE_CODE_OAUTH_TOKEN="your-oauth-token"
```

Or create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## 3. Create an Agent Config

Create `agent.yaml` in your working directory:

```yaml
name: my-assistant
description: A helpful AI assistant

model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  temperature: 0.3
  max_tokens: 4096

instructions:
  inline: |
    You are a helpful assistant. Be concise and accurate.
```

## 4. Start Chatting

```bash
bun run dev -- chat
```

Or with a specific config path:

```bash
bun run dev -- chat --agent path/to/agent.yaml
```

Enable verbose logging (debug output to stderr):

```bash
bun run dev -- chat --verbose
```

## 5. Chat Interaction

```
You: Hello! What can you help me with?
Agent: I can help with a variety of tasks including answering questions,
writing code, analyzing data, and more. What would you like to work on?

You: exit
Goodbye!
```

## Example: Agent with MCP Tools

```yaml
name: filesystem-agent
description: Agent with filesystem access

model:
  provider: anthropic
  name: claude-sonnet-4-20250514

instructions:
  inline: |
    You are a helpful assistant with filesystem access.
    Use the filesystem tool to read and explore files when asked.

tools:
  - type: mcp
    name: filesystem
    description: Read and search files
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]

claude:
  permission_mode: manual
```

In `manual` mode, tool calls require your approval:

```
You: List the files in /tmp
⟳ Agent wants to call: filesystem({ "path": "/tmp" })
  Allow? [Y/n]: y
✓ filesystem done
Agent: Here are the files in /tmp: ...
```

## Example: Agent with File-Based Instructions

Create `instructions.md`:

```markdown
# System Instructions

You are a senior software engineer specializing in TypeScript.

## Guidelines
- Always explain your reasoning
- Provide code examples when helpful
- Follow TypeScript best practices
```

Reference it in `agent.yaml`:

```yaml
name: code-reviewer
model:
  provider: anthropic
  name: claude-sonnet-4-20250514

instructions:
  file: ./instructions.md
```

## Example: Agent with Environment Variables

```yaml
name: my-agent
model:
  provider: anthropic
  name: ${MODEL_NAME}
  temperature: 0.5

instructions:
  inline: You are helpful.
```

Set the env var before running:

```bash
MODEL_NAME=claude-sonnet-4-20250514 bun run dev -- chat
```

## Keyboard Shortcuts

| Shortcut / Flag | Action |
|-----------------|--------|
| Enter | Send message |
| Ctrl+C (streaming) | Interrupt current response |
| Ctrl+D | Exit session |
| Ctrl+O | Inspect last tool call details |
| Type `exit` or `quit` | Exit session |
| `--verbose` | Show debug-level logs on stderr (config loading, SDK events, tool lifecycle) |

## Troubleshooting

**"No agent configuration found"**
- Ensure `agent.yaml` exists in CWD, or use `--agent <path>`

**"Authentication failed"**
- Check `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` is set and valid

**"Unresolved environment variable: ${VAR}"**
- Set the variable in your shell, `.env` file, or `~/.holodeck/.env`

**"Invalid configuration"**
- The error message shows the exact field and constraint. Fix the YAML and retry.
