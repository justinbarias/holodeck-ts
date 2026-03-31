# Feature Specification: HoloDeck Chat

**Feature Branch**: `001-holodeck-chat`
**Created**: 2026-03-29
**Status**: Draft
**Input**: User description: "Create a spec for feature 'holodeck chat', and all the foundational requirements to build this capability"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load Agent Configuration and Start Chat (Priority: P1)

A user has a YAML agent configuration file (e.g., `agent.yaml`) defining an agent's name, model settings, system instructions, and optionally tools. The user runs `holodeck chat` pointing to that config, and an interactive chat session begins in the terminal. The user types a message, presses enter, and sees the agent's response stream back in real time.

**Why this priority**: This is the core value proposition — without configuration loading and a basic chat loop, nothing else works. It is the minimal viable slice that proves the system end-to-end.

**Independent Test**: Can be fully tested by creating a simple `agent.yaml` with a model and inline instructions, running `holodeck chat`, sending a message, and verifying a streamed response appears.

**Acceptance Scenarios**:

1. **Given** a valid `agent.yaml` with model and inline instructions, **When** the user runs `holodeck chat --agent agent.yaml`, **Then** the system loads the config, validates it, and presents an interactive prompt.
2. **Given** the chat session is active, **When** the user types "Hello" and presses enter, **Then** the agent's response streams token-by-token to the terminal.
3. **Given** an `agent.yaml` with `instructions.file` pointing to a markdown file, **When** the user starts a chat session, **Then** the system reads the instructions from the referenced file and uses them as the system prompt.
4. **Given** a YAML file with invalid or missing required fields, **When** the user runs `holodeck chat`, **Then** the system displays a clear, human-readable validation error and exits gracefully.
5. **Given** an `agent.yaml` exists in the current directory, **When** the user runs `holodeck chat` without the `--agent` flag, **Then** the system loads the config from `./agent.yaml` automatically.
6. **Given** no `--agent` flag is provided and no `agent.yaml` exists in the current directory, **When** the user runs `holodeck chat`, **Then** the system displays an error indicating no agent config was found.

---

### User Story 2 - Multi-Turn Conversation with Context Retention (Priority: P1)

A user engages in a back-and-forth conversation where the agent remembers what was said earlier in the session. The user asks a question, gets a response, then asks a follow-up that references the previous exchange. The agent responds coherently using the full conversation history.

**Why this priority**: Multi-turn context is essential for any meaningful chat experience. Without it, the chat is limited to single-shot Q&A.

**Independent Test**: Can be tested by starting a session, providing context in message 1 (e.g., "My name is Alice"), then asking "What is my name?" in message 2 and verifying the agent responds correctly.

**Acceptance Scenarios**:

1. **Given** an active chat session where the user said "My name is Alice", **When** the user asks "What is my name?", **Then** the agent responds with "Alice" (or equivalent).
2. **Given** a conversation spanning 10+ turns, **When** the user references information from the first turn, **Then** the agent incorporates that context in its response.
3. **Given** a conversation approaching ~80% of the model's context window, **When** the system detects the threshold, **Then** it displays a warning to the user indicating context is nearing capacity.
4. **Given** the context window is full, **When** the SDK's automatic compaction triggers, **Then** the system notifies the user that older messages have been summarized and the conversation continues.

---

### User Story 3 - Agent with MCP Tools (Priority: P2)

A user configures an agent with one or more MCP server tools in the YAML config. During the chat session, the agent autonomously decides when to invoke a tool, executes it, and incorporates the tool's output into its response.

**Why this priority**: Tools are what differentiate an agent from a basic chatbot. MCP tools are a standard integration path for external capabilities.

**Independent Test**: Can be tested by configuring an agent with a simple MCP stdio tool (e.g., a filesystem tool), asking a question that requires tool use, and verifying the agent invokes the tool and uses its result.

**Acceptance Scenarios**:

1. **Given** an agent configured with an MCP stdio tool, **When** the user asks a question that requires the tool, **Then** the agent invokes the tool and incorporates its output in the response.
2. **Given** an agent configured with an MCP HTTP/SSE tool, **When** the tool is invoked, **Then** the system communicates with the remote server and returns the result to the agent.
3. **Given** an MCP tool that fails or times out, **When** the agent attempts to use it, **Then** the system surfaces a meaningful error and the agent continues the conversation gracefully.
4. **Given** the agent has just invoked a tool and the summary indicator is displayed, **When** the user presses Ctrl+O, **Then** the system shows the full tool arguments and results for the most recent invocation.
5. **Given** an agent in `manual` permission mode, **When** the agent wants to invoke a tool, **Then** the system displays the tool name and arguments summary with an inline "Allow? [Y/n]" prompt, and only executes the tool if the user approves.

---

### User Story 4 - Graceful Session Management (Priority: P2)

A user wants to end the chat session cleanly. They can type an exit command (e.g., `exit`, `quit`, or press Ctrl+C/Ctrl+D) and the session terminates gracefully, cleaning up any active connections.

**Why this priority**: Users need reliable ways to exit. Ungraceful termination could leave processes hanging or lose context.

**Independent Test**: Can be tested by starting a session, typing "exit", and verifying the process terminates with exit code 0 and no orphaned child processes.

**Acceptance Scenarios**:

1. **Given** an active chat session, **When** the user types "exit" or "quit", **Then** the session ends with a farewell message and the process exits cleanly.
2. **Given** an active chat session, **When** the user presses Ctrl+C, **Then** the session terminates gracefully without error output.
3. **Given** an active chat session with connected MCP servers, **When** the user exits, **Then** all MCP server connections are properly closed.

---

### User Story 5 - Streaming Response Display (Priority: P2)

A user sees the agent's response appear incrementally as tokens arrive, rather than waiting for the entire response to complete. Long responses feel responsive and the user can read as the agent "types."

**Why this priority**: Streaming is essential for perceived performance and usability with large language models.

**Independent Test**: Can be tested by asking the agent to write a long response (e.g., "Write a 500-word essay") and verifying text appears incrementally before the full response is complete.

**Acceptance Scenarios**:

1. **Given** the agent is generating a long response, **When** tokens arrive from the model, **Then** they are displayed to the user immediately as they arrive.
2. **Given** a streaming response is in progress, **When** the user presses Ctrl+C, **Then** the current response is interrupted but the session remains active for the next input.

---

### User Story 6 - Environment Variable Resolution in Config (Priority: P3)

A user references environment variables in their YAML config (e.g., `${ANTHROPIC_API_KEY}`) and the system resolves them at load time from the environment, project-level `.env`, and user-level `~/.holodeck/.env`.

**Why this priority**: Required for secure credential handling — users should never hardcode API keys in config files.

**Independent Test**: Can be tested by setting an env var, referencing it in `agent.yaml`, and verifying the config loader resolves it correctly.

**Acceptance Scenarios**:

1. **Given** a YAML config with `${ANTHROPIC_API_KEY}`, **When** the env var is set in the shell, **Then** the system substitutes the actual value at load time.
2. **Given** a `.env` file in the project directory with `ANTHROPIC_API_KEY=sk-...`, **When** the config references `${ANTHROPIC_API_KEY}`, **Then** the value is resolved from the `.env` file.
3. **Given** a config references `${MISSING_VAR}` that is not defined anywhere, **When** the config is loaded, **Then** the system reports which variable is missing and where it was referenced.

---

### User Story 7 - Skills Auto-Discovery and Invocation (Priority: P3)

A user has created `SKILL.md` files in `.claude/skills/*/SKILL.md` within their project. When the chat session starts, the system auto-discovers these skill files and makes them available to the agent. During conversation, when a user's request matches a skill's description, the agent invokes the skill and uses it to fulfill the request.

**Why this priority**: Skills provide a lightweight, file-based way to extend agent capabilities without writing code or configuring MCP servers. They are a natural extension of the agent's instruction system.

**Independent Test**: Can be tested by creating a `.claude/skills/greet/SKILL.md` with a description and instructions, starting a chat session, and asking the agent to perform the task described by the skill.

**Acceptance Scenarios**:

1. **Given** a project with `SKILL.md` files in `.claude/skills/*/`, **When** the chat session starts, **Then** the system discovers and registers all skills found in the expected directory structure.
2. **Given** a registered skill with a description matching the user's request, **When** the user sends a message, **Then** the agent invokes the skill and incorporates its instructions into its response.
3. **Given** a project with no `.claude/skills/` directory, **When** the chat session starts, **Then** the system proceeds normally with no skills registered and no errors.
4. **Given** a `SKILL.md` file with invalid or missing content, **When** the system attempts to discover skills, **Then** it logs a warning for the invalid skill and continues loading the remaining valid skills.

---

### Edge Cases

- What happens when the YAML config file does not exist at the specified path? The system should report a clear "file not found" error with the path attempted.
- What happens when the Anthropic API key is invalid or expired? The system should surface the API error message clearly and suggest checking credentials.
- What happens when network connectivity is lost mid-conversation? The system should display an error for the failed request and allow the user to retry.
- What happens when the model returns an empty response? The system should indicate that no response was received and allow the user to continue.
- What happens when the YAML config contains unknown fields? The system should reject unknown fields (strict validation) and list which fields are unrecognized.
- What happens when an MCP server process crashes during a session? The system should detect the failure, inform the user, and continue the session without the failed tool.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST parse YAML agent configuration files and validate them against the defined schema using strict validation (unknown fields rejected).
- **FR-002**: System MUST resolve environment variable references (`${VAR_NAME}`) in YAML configs from shell environment, project `.env`, and user `~/.holodeck/.env` (in priority order).
- **FR-003**: System MUST display clear, human-readable error messages when config validation fails, including the specific field path and constraint that was violated.
- **FR-004**: System MUST support `instructions.inline` (string in YAML) and `instructions.file` (path to markdown file) as mutually exclusive instruction sources.
- **FR-005**: System MUST establish an interactive terminal prompt where users can type messages and receive responses.
- **FR-006**: System MUST maintain full conversation history within a session so the agent has multi-turn context.
- **FR-007**: System MUST stream agent responses token-by-token to the terminal as they arrive from the model, rendering markdown with terminal-native formatting (ANSI bold/italic, syntax-highlighted code blocks, indented lists).
- **FR-008**: System MUST support MCP tool integration for both stdio and HTTP/SSE transport types as defined in the agent config.
- **FR-009**: System MUST auto-discover `SKILL.md` files from `.claude/skills/*/SKILL.md` at session startup and make them available to the agent as invocable skills.
- **FR-010**: System MUST handle session termination gracefully via exit commands (`exit`, `quit`) and signals (Ctrl+C, Ctrl+D), cleaning up all connections.
- **FR-011**: System MUST allow users to interrupt a streaming response (Ctrl+C) without ending the session.
- **FR-012**: System MUST surface tool execution errors to the user and allow the conversation to continue.
- **FR-016**: System MUST display a summary indicator when the agent invokes a tool (tool name and status: calling / done / failed), hiding arguments and raw results by default.
- **FR-017**: System MUST allow the user to press Ctrl+O to inspect the full arguments and results of the most recent tool invocation.
- **FR-013**: System MUST provide a CLI command (`holodeck chat`) with an optional `--agent` flag to specify the path to the agent YAML config. If omitted, the system MUST default to `./agent.yaml` in the current directory and error with a clear message if neither the flag nor the default file is present.
- **FR-014**: System MUST report API authentication errors clearly, distinguishing them from other connection failures.
- **FR-015**: System MUST support the Claude Agent SDK permission modes (`manual`, `acceptEdits`, `acceptAll`) as configured in the YAML. In `manual` mode, the system MUST display an inline "Allow? [Y/n]" prompt showing the tool name and arguments summary before executing each tool call.
- **FR-018**: System MUST warn the user when conversation context usage approaches ~80% of the model's context window capacity.
- **FR-019**: System MUST notify the user when the SDK's automatic conversation compaction occurs, indicating that older messages have been summarized.

### Key Entities

- **Agent Configuration**: The root entity parsed from YAML, containing model settings, instructions, tools, and optional Claude SDK settings. Uniquely identified by `name`.
- **Chat Session**: A stateful conversation between a user and an agent, maintaining ordered message history. Scoped to a single CLI invocation.
- **Message**: A single exchange unit within a session — either a user input or an agent response. Contains content and role metadata.
- **Tool**: An external capability available to the agent during chat. Can be an MCP server (stdio or HTTP/SSE). Identified by `name`.
- **Skill**: A file-based capability defined via `SKILL.md`, auto-discovered from `.claude/skills/*/`. Contains a description (for matching) and instructions (for execution).
- **LLM Provider**: The model configuration (provider, model name, temperature, max tokens) used for agent responses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can go from a valid `agent.yaml` to an interactive chat session in under 5 seconds (config load + session initialization).
- **SC-002**: Agent responses begin appearing (first token) within 2 seconds of the user pressing enter, assuming normal network conditions.
- **SC-003**: Users can conduct conversations of 20+ turns without session degradation or context loss.
- **SC-004**: 100% of config validation errors produce a human-readable message that identifies the specific problem and location.
- **SC-005**: Session exit (via command or signal) completes within 2 seconds with no orphaned processes.
- **SC-006**: Tool failures during chat do not crash the session — the conversation continues in 100% of tool error cases.
- **SC-007**: Users with a valid agent config and API key can complete a successful chat interaction on first attempt without consulting documentation.

## Clarifications

### Session 2026-03-29

- Q: When the agent invokes a tool, what should the user see? → A: Show tool name and status indicator (e.g., "Calling X... done") by default. User can press Ctrl+O to inspect full arguments and results for the last tool call.
- Q: What happens when a conversation exceeds the model's context window? → A: Warn the user when approaching context limits (~80% capacity). Leverage the Claude Agent SDK's built-in automatic compaction (which summarizes older messages). Notify the user when compaction occurs via the SDK's PreCompact hook. No custom truncation logic needed.
- Q: What happens when `holodeck chat` is run without the `--agent` flag? → A: Default to `./agent.yaml` in the current directory. Error if neither flag nor file is present.
- Q: Should agent responses render markdown formatting in the terminal? → A: Yes. Render markdown with terminal-native formatting (ANSI bold/italic, syntax-highlighted code blocks, indented lists).
- Q: In manual permission mode, how should tool approval prompts appear? → A: Inline Y/N prompt in the chat flow — show tool name and args summary, ask "Allow? [Y/n]".

## Assumptions

- Users have a valid Anthropic API key and network access to the Anthropic API.
- Users are comfortable with command-line interfaces and terminal-based chat.
- The agent YAML config follows the schema documented in CLAUDE.md — no additional config formats (JSON, TOML) are supported in v1.
- Only the Anthropic provider is supported — no multi-provider routing or fallback.
- Chat history is ephemeral (in-memory for the session duration) — no persistence across sessions in v1.
- The hierarchical vectorstore tool is out of scope for this feature; it will be specified separately.
- Evaluation and test case execution are out of scope — those are part of the `holodeck test` command.
- OpenTelemetry integration is out of scope for the initial chat feature.
- Structured output (schema-enforced agent responses) is out of scope for the initial chat feature; it will be specified separately as a core platform capability.
