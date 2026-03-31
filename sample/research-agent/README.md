# Research Agent Sample

This sample project is ready for `holodeck chat` with `.env`-based auth.

## Setup

1. `cd sample/research-agent`
2. `cp .env.example .env`
3. Set `CLAUDE_CODE_OAUTH_TOKEN` in `.env`

## Run

From this directory:

```bash
bun ../../src/cli/index.ts chat --agent ./agent.yaml
```

Or from repo root:

```bash
bun run dev -- chat --agent sample/research-agent/agent.yaml
```

Note: `.env` is loaded from the current working directory. If you run from repo root, put credentials in the root `.env` (or export in your shell).
