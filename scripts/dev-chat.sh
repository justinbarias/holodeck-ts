#!/bin/bash
# Launch TUI with Bun inspector, auto-open debugger in browser.
# Stderr is piped through a background reader that extracts the debug URL.

FIFO=$(mktemp -u)
mkfifo "$FIFO"

# Background: read stderr lines, extract the ws:// path to build a clean URL
(
  while IFS= read -r line; do
    # Match the ws:// line which has the token, e.g. "  ws://localhost:6499/abc123"
    # Strip all non-printable/ANSI chars first, then extract
    token=$(printf '%s' "$line" | LC_ALL=C tr -dc '[:print:]' | grep -oE 'ws://localhost:[0-9]+/[a-zA-Z0-9]+')
    if [ -n "$token" ]; then
      # Convert ws://localhost:PORT/TOKEN -> https://debug.bun.sh/#localhost:PORT/TOKEN
      path=${token#ws://}
      open "https://debug.bun.sh/#${path}"
      break
    fi
  done
  cat >/dev/null
) < "$FIFO" &

bun --inspect src/cli/index.ts chat "$@" 2>"$FIFO"
rm -f "$FIFO"
