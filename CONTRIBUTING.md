# Contributing to HoloDeck TypeScript

Thank you for your interest in contributing to holodeck-ts! This guide will help you set up your development environment and understand our workflow.

## Prerequisites

- **[Bun](https://bun.sh)** v1.0.0 or later (runtime and package manager)
- **Git** v2.30 or later
- **Node.js** v18+ (only needed for some dev tooling; Bun handles runtime)

## Development Environment Setup

### 1. Clone the repository

```bash
git clone https://github.com/yourorg/holodeck-ts.git
cd holodeck-ts
```

### 2. Install Bun (if not already installed)

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify the installation:

```bash
bun --version
```

### 3. Install dependencies

```bash
bun install
```

This also installs git hooks automatically via `lefthook`.

### 4. Verify your setup

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Run tests
bun test

# Run the CLI
bun run dev -- --version
```

If all commands succeed, you're ready to contribute.

## Available Scripts

| Script | Description |
|---|---|
| `bun run dev` | Run the CLI in development mode |
| `bun run dev -- --version` | Print the CLI version |
| `bun test` | Run all tests |
| `bun test --watch` | Run tests in watch mode |
| `bun run lint` | Check linting and formatting (Biome) |
| `bun run lint:fix` | Auto-fix lint and format issues |
| `bun run format` | Format all files with Biome |
| `bun run typecheck` | Run TypeScript type checking (`tsc --noEmit`) |
| `bun run build` | Build for distribution |

## Code Quality

### Linting and Formatting

We use **[Biome](https://biomejs.dev)** for both linting and formatting (it replaces ESLint + Prettier). Configuration is in `biome.json`.

Key settings:
- Indent style: **tabs**
- Line width: **100**
- Quote style: **double quotes**
- Semicolons: **always**
- `any` is forbidden — use `unknown` + type guards or Zod

### TypeScript Standards

- Strict mode is enabled via `@tsconfig/bun`
- Use `type` imports for type-only references: `import type { Agent } from "./schema"`
- Prefer `interface` for object shapes, `type` for unions/intersections
- Explicit return types on all exported functions
- No `any` — use `unknown` and narrow with Zod or type guards

### VS Code

If you use VS Code, open the workspace and accept the recommended extensions when prompted. The workspace settings configure Biome as the default formatter with format-on-save enabled.

## Git Workflow

### Branching

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes and commit (see commit conventions below).

3. Push your branch and open a pull request against `main`.

### Commit Conventions

We use **[Conventional Commits](https://www.conventionalcommits.org/)** with scoped prefixes. Git hooks enforce this automatically via `commitlint`.

Format: `<type>(<scope>): <description>`

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

**Scopes:** `cli`, `config`, `agent`, `tools`, `eval`, `otel`, `lib`, `deps`

Examples:
```
feat(cli): add interactive chat command
fix(config): handle missing env vars in YAML loader
test(eval): add code grader unit tests
refactor(tools): simplify MCP server config builder
chore(deps): update zod to 4.4.0
```

### Pre-commit Hooks

The following checks run automatically on every commit via `lefthook`:

- **Biome lint** — checks staged `.ts`, `.js`, `.json` files
- **TypeScript type check** — runs `tsc --noEmit`
- **Commitlint** — validates your commit message format

If a hook fails, fix the issue and try committing again.

## Testing

We use **Bun's built-in test runner**. Tests live in `tests/`:

```
tests/
├── unit/           # Fast, isolated unit tests
│   ├── config/
│   ├── agent/
│   ├── tools/
│   └── eval/
├── integration/    # Cross-component tests
└── fixtures/       # Test data (YAML configs, sample files)
```

### Writing Tests

Follow the **Arrange / Act / Assert** pattern:

```typescript
import { describe, it, expect } from "bun:test";

describe("MyFeature", () => {
  it("does something specific", () => {
    // Arrange
    const input = { name: "test" };

    // Act
    const result = process(input);

    // Assert
    expect(result.success).toBe(true);
  });
});
```

### Running Tests

```bash
bun test                    # Run all tests
bun test tests/unit/        # Run only unit tests
bun test --watch            # Watch mode
```

## Project Structure

See `CLAUDE.md` for the full project structure and architecture documentation.

## Need Help?

- Read `CLAUDE.md` for detailed architecture and design decisions
- Read `README.md` for user-facing documentation
- Open an issue for bugs or feature requests
