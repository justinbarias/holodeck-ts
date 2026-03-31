# Feature Specification: Custom Tool Plugin System

**Feature Branch**: `002-custom-tool-plugins`  
**Created**: 2026-03-31  
**Status**: Draft  
**Input**: User description: "Custom tool plugin system allowing users to define tools using the Claude Agent SDK tool() function with Zod schemas, loaded from TypeScript files referenced in YAML configuration"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define and Use a Custom Tool (Priority: P1)

A HoloDeck user wants to add a custom capability to their agent — such as querying a database, calling an internal API, or performing domain-specific computation — without writing a full MCP server. They create a TypeScript file that exports a single tool using the Claude Agent SDK's `tool()` function with a Zod input schema, reference it in their `agent.yaml`, and the agent can immediately invoke it during chat or test sessions.

**Why this priority**: This is the core value proposition. Without this, users are forced to write full MCP servers for any custom logic, which is a significant barrier. This story delivers the entire plugin loading pipeline end-to-end.

**Independent Test**: Can be fully tested by creating a minimal `.ts` tool file, referencing it in YAML, and verifying the agent can invoke the tool and receive results during a chat session.

**Acceptance Scenarios**:

1. **Given** a user has a TypeScript file exporting a valid `tool()` as its default export, **When** they reference it in `agent.yaml` under `tools` with `type: custom` and a `source` path, **Then** the agent can invoke that tool by name during a session and receives the tool's return value.
2. **Given** a user defines a custom tool with Zod-validated input parameters, **When** the agent calls the tool with arguments matching the schema, **Then** the tool executes successfully and returns structured output.
3. **Given** a user defines a custom tool with Zod-validated input parameters, **When** the agent calls the tool with arguments that violate the schema, **Then** the tool returns a clear validation error without crashing the session.

---

### User Story 2 - Validation at Config Load Time (Priority: P1)

A HoloDeck user makes a mistake in their YAML configuration or tool file — a typo in the source path, a name mismatch between YAML and the tool export, a file that doesn't export a valid tool, or a duplicate tool name. They need clear, actionable error messages at startup rather than mysterious failures during a session.

**Why this priority**: Equal to P1 because a plugin system without good error reporting is unusable. Users will spend more time debugging config than building tools. Early, clear validation is essential for adoption.

**Independent Test**: Can be tested by providing various invalid configurations (missing file, wrong export, name mismatch, duplicates) and verifying that each produces a specific, helpful error message before any agent session starts.

**Acceptance Scenarios**:

1. **Given** a YAML config references a `source` file that does not exist, **When** HoloDeck loads the config, **Then** it reports a clear error naming the missing file path and the tool entry that references it.
2. **Given** a tool file's default export has a `name` that differs from the YAML `name` field, **When** HoloDeck loads the config, **Then** it reports the mismatch with both names so the user knows which to fix.
3. **Given** a tool file does not have a default export or its default export is not a valid SDK tool, **When** HoloDeck loads the config, **Then** it reports that the file does not export a valid tool and names the expected format.
4. **Given** two tools (custom or otherwise) share the same name, **When** HoloDeck loads the config, **Then** it reports the duplicate and identifies both entries.

---

### User Story 3 - Custom Tool Appears in Evaluations (Priority: P2)

A HoloDeck user writes test cases that expect their custom tool to be called. The custom tool shows up as a proper named tool in evaluation transcripts, can be referenced in `expected_tools`, and is graded by code graders like `tool_usage` and `tool_usage_contains`.

**Why this priority**: Evaluation integration is what elevates custom tools from "works in chat" to "testable and measurable." Without this, users can't systematically verify their agents use custom tools correctly.

**Independent Test**: Can be tested by defining a test case with `expected_tools: [my_custom_tool]`, running `holodeck test`, and verifying the grader correctly detects whether the custom tool was called.

**Acceptance Scenarios**:

1. **Given** a test case specifies `expected_tools` that includes a custom tool name, **When** the agent calls that custom tool during the test, **Then** the `tool_usage` and `tool_usage_contains` graders correctly detect the tool invocation.
2. **Given** a custom tool is invoked during a test, **When** the evaluation transcript is generated, **Then** the tool appears by its YAML-defined name (not as a generic MCP call or Bash invocation).

---

### User Story 4 - Custom Tools with Project Dependencies (Priority: P3)

A HoloDeck user's custom tool needs third-party packages (e.g., a database driver, an HTTP client, a domain library). They install these packages in their project's `package.json` as usual, and their tool file imports them normally. HoloDeck does not manage, install, or interfere with the user's dependencies.

**Why this priority**: This is a natural extension of the plugin model. Most real-world tools will need external packages. The design should work with standard module resolution rather than requiring special configuration.

**Independent Test**: Can be tested by creating a tool file that imports a third-party package from the user's `node_modules/`, referencing it in YAML, and verifying the tool loads and executes successfully.

**Acceptance Scenarios**:

1. **Given** a custom tool file imports a package installed in the user's project `node_modules/`, **When** HoloDeck loads the tool, **Then** the import resolves successfully via standard module resolution.
2. **Given** a custom tool file imports a package that is NOT installed, **When** HoloDeck loads the tool, **Then** it reports a clear error indicating the missing dependency and that the user should install it in their project.

---

### Edge Cases

- What happens when a tool file has a syntax error or fails to compile?
- What happens when a tool's async handler throws an unhandled exception during execution? → Caught and returned as a tool error message to the agent; session continues.
- What happens when a tool file has side effects at import time (e.g., opens a database connection)?
- What happens when the `source` path is absolute vs relative?
- What happens when a custom tool has the same name as a built-in Claude Code tool (e.g., `Read`, `Bash`)? → Rejected at config load time with a clear error.
- What happens when `tools` contains a mix of `mcp`, `hierarchical_document`, and `custom` types?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a new tool type `custom` in the YAML `tools` array, with required fields `name`, `type: "custom"`, `description`, and `source` (path to a TypeScript file).
- **FR-002**: System MUST resolve the `source` path relative to the YAML config file's directory.
- **FR-003**: System MUST dynamically import the tool file at config load time using dynamic import.
- **FR-004**: System MUST validate that the imported module has a default export that is a valid Claude Agent SDK tool.
- **FR-005**: System MUST validate that the tool's name matches the `name` field in the YAML config.
- **FR-006**: System MUST bundle all loaded custom tools into an in-process MCP server and pass it to the SDK's `query()` alongside external MCP servers.
- **FR-007**: System MUST enforce that no two tools (across all types: custom, mcp, hierarchical_document) share the same name.
- **FR-013**: System MUST reject custom tools whose name matches a built-in Claude Code tool (e.g., Read, Write, Edit, Bash, Glob, Grep, Agent, WebSearch, WebFetch) with a clear error at config load time.
- **FR-008**: System MUST produce clear, actionable error messages for: missing source file, invalid export, name mismatch, duplicate names, import failures (syntax errors, missing dependencies).
- **FR-009**: Custom tools MUST appear by their configured name in evaluation transcripts and be matchable by `expected_tools` in test cases.
- **FR-010**: System MUST NOT manage, install, or validate the user's project dependencies. Dependency resolution is the user's responsibility.
- **FR-011**: Each tool file MUST export exactly one tool as its default export.
- **FR-012**: When a custom tool's handler throws an exception at runtime, the system MUST catch the error and return it as a tool error message to the agent. The session MUST continue — a single tool failure MUST NOT crash the session.

### Key Entities

- **CustomTool**: A tool definition loaded from a user-provided TypeScript file. Has a name, description, source path, and the loaded SDK tool instance.
- **ToolBundle**: The collection of all custom tools bundled into a single in-process MCP server for consumption by the SDK.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can define and use a custom tool with zero boilerplate beyond the tool file and one YAML entry, completing the process in under 5 minutes.
- **SC-002**: All validation errors (missing file, bad export, name mismatch, duplicates) are reported at config load time with actionable messages naming the specific file and field.
- **SC-003**: Custom tools are indistinguishable from MCP tools in evaluation transcripts — graders like `tool_usage` work identically for both.
- **SC-004**: Custom tools that import third-party packages from the user's project load without any HoloDeck-specific configuration.
- **SC-005**: A user familiar with the Claude Agent SDK's `tool()` function can create a working custom tool on their first attempt using only the documentation and a single example.

## Clarifications

### Session 2026-03-31

- Q: When a custom tool's handler throws at runtime, should HoloDeck crash the session, return the error to the agent, or return a generic failure? → A: Catch and return error as tool error message to agent; session continues.
- Q: Should custom tools be allowed to use names that match built-in Claude Code tools? → A: Reject at config load time with a clear error.

## Assumptions

- Users are comfortable writing TypeScript and using the Claude Agent SDK's `tool()` function.
- Users manage their own project dependencies via their package manager of choice (bun, npm, pnpm).
- The Claude Agent SDK's `tool()` function returns an object with a discoverable `name` property that can be validated against the YAML config.
- The SDK's `createSdkMcpServer()` accepts tools created via `tool()` and can be passed to `query()` as an MCP server.
- The runtime can load `.ts` files directly via dynamic import without a build step.
- The `source` path convention is relative to the config file, consistent with how `instructions.file` and `hierarchical_document.source` resolve paths.
- Side effects at import time (e.g., database connections) are the user's responsibility to manage.
