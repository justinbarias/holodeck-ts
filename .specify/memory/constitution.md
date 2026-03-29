<!--
  Sync Impact Report
  ==================
  Version change: N/A (initial) → 1.0.0
  Added principles:
    - I. Claude Agent SDK Exclusivity
    - II. Configuration-Driven Design
    - III. Modern TypeScript Strictness
    - IV. Zod-First Validation
    - V. Test Discipline
    - VI. Anthropic Evaluation Methodology
    - VII. Streaming & Async-Only I/O
    - VIII. Observability by Design
  Added sections:
    - Technology Constraints
    - Development Workflow
    - Governance
  Removed sections: none (initial creation)
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ no changes needed (generic)
    - .specify/templates/spec-template.md ✅ no changes needed (generic)
    - .specify/templates/tasks-template.md ✅ no changes needed (generic)
  Follow-up TODOs: none
-->

# HoloDeck TypeScript Constitution

## Core Principles

### I. Claude Agent SDK Exclusivity

HoloDeck TypeScript is built **exclusively** on the
[Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript).
No other agent framework, orchestration library, or LLM backend is permitted.

- All agent execution MUST use `@anthropic-ai/claude-agent-sdk`.
- No Semantic Kernel, LangChain, CrewAI, AutoGen, DeepEval, or equivalent
  MUST ever be added as a dependency.
- The only supported LLM provider value is `"anthropic"`.
- Tool registration MUST use the SDK's `tool()` function with Zod schemas.
- Hook lifecycle (PreToolUse, PostToolUse, Stop, SubagentStart/Stop) MUST
  use the SDK's native hook system.

**Rationale:** Single-backend architecture eliminates provider abstraction
overhead and ensures full compatibility with Claude capabilities.

### II. Configuration-Driven Design

All agent behavior MUST be definable through YAML configuration validated
by Zod schemas. No agent requires custom TypeScript code to function.

- Agent definitions (model, instructions, tools, evals, test cases) MUST
  be expressible entirely in YAML.
- Every YAML field MUST have a corresponding Zod schema with defaults,
  constraints, and descriptive error messages.
- Environment variable substitution (`${VAR}`) MUST be supported in YAML.
- Configuration changes MUST NOT require code changes to take effect.

**Rationale:** The core value proposition is no-code agent experimentation;
code-only features break that contract.

### III. Modern TypeScript Strictness

All code MUST adhere to strict, modern TypeScript conventions enforced by
tooling and review.

- TypeScript strict mode MUST be enabled via `@tsconfig/bun`.
- `any` is **forbidden**. Use `unknown` + type guards or Zod parsing.
- All exported functions MUST have explicit return type annotations.
- Use `type` imports for type-only references:
  `import type { X } from "./schema"`.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- Use `satisfies` for type checking without widening.
- Use discriminated unions (not type assertions) for polymorphic data.
- `require()` is forbidden; all imports MUST be ESM (`import`/`export`).
- Mutable default arguments are forbidden; use `| undefined` and default
  in function body.
- Biome MUST enforce formatting (tabs, 100-char line width) and linting
  (recommended rules + `noExplicitAny: "error"`).
- All code MUST pass `bun run typecheck` (`tsc --noEmit`) with zero errors.

**Rationale:** Strict typing catches bugs at compile time, reduces runtime
errors, and makes the codebase self-documenting.

### IV. Zod-First Validation

All external data boundaries MUST be validated with Zod schemas.

- Every Zod schema MUST export both the schema and the inferred type:
  `export type X = z.infer<typeof XSchema>`.
- YAML configs, API inputs, environment variables, and external API
  responses MUST be parsed through Zod before use.
- Tool types and grader types MUST use `z.discriminatedUnion()`.
- Schemas MUST use `.strict()` to reject unknown fields in configs.
- Custom error messages MUST be provided for user-facing validation.

**Rationale:** Zod is the TypeScript equivalent of Python's Pydantic;
consistent schema-first validation prevents invalid state from propagating.

### V. Test Discipline

Every schema, grader, and public API surface MUST have test coverage.

- Tests MUST use Bun's built-in test runner (`bun:test`).
- Tests MUST follow Arrange / Act / Assert structure.
- Unit tests live in `tests/unit/`, integration tests in
  `tests/integration/`.
- All Zod schemas MUST have both positive (valid input) and negative
  (invalid input) test cases.
- All code graders MUST have deterministic test cases.
- Tests MUST NOT mock the Claude Agent SDK for integration tests;
  use SDK-provided test utilities where available.
- `bun test` MUST pass with zero failures before any merge.

**Rationale:** Deterministic test coverage is essential for a platform
that evaluates AI agent behavior; the evaluator itself must be correct.

### VI. Anthropic Evaluation Methodology

The evaluation framework MUST follow Anthropic's published methodology.

- Code graders (deterministic, no LLM) + model graders (Claude-as-judge)
  are the only grader categories.
- NLP metrics (BLEU, ROUGE, METEOR) MUST NOT be added.
- DeepEval or any third-party eval framework MUST NOT be added.
- Model graders MUST support both `output` (final response) and
  `transcript` (full execution trace) context modes.
- Metrics MUST include pass@k, pass^k, and accuracy calculations.
- The judge model MUST score on a 1-5 scale normalized to 0.0-1.0.

**Rationale:** Anthropic's eval methodology is purpose-built for agent
evaluation and aligns with the Claude Agent SDK ecosystem.

### VII. Streaming & Async-Only I/O

All I/O operations MUST be non-blocking and use async/await.

- Agent responses MUST stream via `AsyncGenerator`.
- File I/O MUST use `Bun.file()` and `Bun.write()`, not Node.js `fs`.
- `console.log` is forbidden in library code; use structured logger.
- `console.log` is forbidden in CLI code; use Commander's output or
  structured logger.
- Node.js built-ins (`node:fs`, `node:path`) MUST NOT be used when
  Bun-native APIs exist.

**Rationale:** Streaming architecture enables real-time feedback in chat
and efficient resource use during batch evaluation.

### VIII. Observability by Design

OpenTelemetry integration MUST follow GenAI semantic conventions.

- Custom spans MUST use the `holodeck.*` namespace.
- GenAI attributes (`gen_ai.system`, `gen_ai.request.model`, etc.) MUST
  be set on all LLM invocation spans.
- Exporters (OTLP, console) MUST be configurable via YAML.
- Observability MUST be opt-in (`enabled: false` by default) and MUST NOT
  add overhead when disabled.

**Rationale:** Production agent deployments require trace-level visibility
into tool calls, token usage, and evaluation runs.

## Technology Constraints

The following technology choices are binding and MUST NOT be substituted
without a constitution amendment.

| Category | Required | Forbidden Alternatives |
|---|---|---|
| Runtime | Bun | Node.js, Deno |
| Language | TypeScript 5.x (strict) | JavaScript, CoffeeScript |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` | LangChain, Semantic Kernel, CrewAI |
| CLI | Commander | yargs, oclif, clipanion |
| Validation | Zod | joi, yup, io-ts, ajv |
| Linting/Formatting | Biome | ESLint, Prettier |
| Testing | Bun test | Jest, Vitest, Mocha |
| Config | yaml (npm) + Zod | toml, json5, cosmiconfig |
| Observability | OpenTelemetry JS SDK | Datadog SDK, New Relic SDK |

**Dependency policy:** New runtime dependencies MUST be justified against
existing capabilities. Prefer Bun built-ins and the Claude Agent SDK's
native features before adding external packages.

## Development Workflow

### Error Handling

- All custom errors MUST extend `HoloDeckError`.
- Error chaining via `{ cause: err }` is mandatory.
- Error hierarchy: `HoloDeckError` > `ConfigError`, `ToolError`, `EvalError`.

### Git Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- Scoped commits: `feat(cli):`, `fix(eval):`, `test(config):`, `refactor(tools):`.
- Commits MUST be atomic and focused on a single concern.
- Commit messages MUST focus on the "why", not the "what".

### Code Review Gates

- `bun run typecheck` MUST pass (zero errors).
- `bun run lint` MUST pass (zero warnings/errors).
- `bun test` MUST pass (zero failures).
- No `any` types in changed files.
- No `console.log` in library or CLI code.

## Governance

This constitution is the highest-authority document for architectural and
engineering decisions in HoloDeck TypeScript. It supersedes informal
agreements, ad-hoc decisions, and prior patterns that conflict with it.

### Amendment Procedure

1. Propose the change with rationale in a PR modifying this file.
2. The change MUST include a version bump following semantic versioning:
   - **MAJOR**: Principle removal, redefinition, or backward-incompatible
     governance change.
   - **MINOR**: New principle added or existing principle materially expanded.
   - **PATCH**: Clarification, wording fix, or non-semantic refinement.
3. All dependent templates (plan, spec, tasks) MUST be checked for
   consistency and updated if affected.
4. A Sync Impact Report MUST be prepended as an HTML comment.

### Compliance

- All PRs and code reviews MUST verify compliance with these principles.
- Complexity beyond what is specified here MUST be explicitly justified
  in the PR description.
- CLAUDE.md serves as the runtime development guidance document and MUST
  remain consistent with this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-03-29 | **Last Amended**: 2026-03-29
