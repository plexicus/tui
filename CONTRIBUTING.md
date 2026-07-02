# Contributing to plexicus

Thank you for your interest in contributing. This guide covers everything you need to go from zero to a merged pull request.

## Table of Contents

- [Development setup](#development-setup)
- [Running the TUI locally](#running-the-tui-locally)
- [Architecture overview](#architecture-overview)
- [Running tests](#running-tests)
- [Code style](#code-style)
- [Pull request checklist](#pull-request-checklist)
- [Releases](#releases)
- [Reporting issues](#reporting-issues)

---

## Development setup

**Prerequisites**: [Bun](https://bun.sh) ≥ 1.1

```bash
git clone https://github.com/plexicus/tui
cd tui
bun install
```

**Type check** (no emit):

```bash
bun run typecheck
```

---

## Running the TUI locally

The live Plexicus API is not required for development. Use mock mode to load fixture data from `tests/fixtures/plexicus/`:

```bash
MOCK_PLEXICUS=1 bun run src/main.tsx --token test
```

Other subcommands:

```bash
bun run src/main.tsx login
bun run src/main.tsx repos
bun run src/main.tsx config set llm.provider claude
bun run src/main.tsx config set llm.api_key <key>
```

Build a standalone binary:

```bash
bun build src/main.tsx --outfile dist/plexicus --target bun
```

---

## Architecture overview

> For the full internals — state machine, component tree, keyboard system, and service layer — read [CLAUDE.md](./CLAUDE.md). This section covers only what you need to orient yourself quickly.

### Layers

```
src/main.tsx          CLI entrypoint (Commander subcommands)
src/state/            useReducer + React Context (AppState)
src/components/       Ink/React TUI components
src/hooks/            Reusable React hooks (keymap, findings, LLM stream)
src/services/         API client, config, LLM routing
src/commands/         Lazily-loaded REPL command implementations
src/utils/            Pure helpers (severity, diff, paths)
```

### The input mode state machine

All keyboard input is gated by `state.inputMode`:

| Mode | Who owns input |
|------|---------------|
| `navigation` | `useKeymap` hook + global handler in `App.tsx` |
| `repl` | Direct `useInput` char capture in `App.tsx` |
| `chat` | `TextInput` in `ChatSidebar.tsx` |
| `login` | `TextInput` in `LoginForm.tsx` |

The REPL bar intentionally bypasses `ink-text-input` and captures characters directly via `useInput` — `ink-text-input` v6 focus proved unreliable in tmux (focus never transferred, causing every `Enter` to fire `onSubmit('')`). The chat sidebar uses `TextInput` safely because its focus is managed independently by the `inputMode` guard and the `helpOpen` prop. Do not use `ink-text-input` for any new REPL-style input; use the same direct-capture pattern.

When adding a new keyboard shortcut, always check which `inputMode` it should be active in and guard accordingly.

### State mutations

All state changes go through `dispatch`. Never mutate state directly. Action types are defined as a discriminated union in `src/state/actions.ts` — add new actions there first.

### Adding a REPL command

1. Create `src/commands/<name>/index.ts`
2. Register it in `src/commands.ts` (discriminated union + `memoize` loader)
3. For inline commands handled in the REPL bar (`ask`, `filter`, `theme`), add a branch in `handleReplSubmit` in `App.tsx`

---

## Running tests

```bash
bun test                                   # all tests
bun test tests/services/config.test.ts    # single file
bun test --watch                          # watch mode
```

**Mock API**: tests that exercise the API client set `MOCK_PLEXICUS=1` (or import the module dynamically after setting the env var) to load fixture JSON from `tests/fixtures/plexicus/`.

**Config isolation**: tests that write config use `mkdtemp` + `process.env.HOME` override in `beforeEach`/`afterEach` so they never touch your real `~/.config/plexicus/config.json`.

**Component tests**: use `ink-testing-library`. See `tests/` for existing examples.

---

## Code style

- **Immutability**: always create new objects — never mutate state or props.
- **Functional state updaters**: use `setState(prev => ...)` instead of capturing the current value in a closure.
- **Small files**: aim for 200–400 lines; extract when a file grows past ~800 lines.
- **No comments explaining what**: code and names do that. Add a comment only when the *why* is non-obvious.
- **Error handling at boundaries**: validate at system boundaries (user input, API responses via Zod). Don't add try/catch for things that can't fail.
- **No direct `node:fs`**: use `Bun.file` / `Bun.write` for file I/O.

---

## Pull request checklist

Before opening a PR, confirm:

- [ ] `bun run typecheck` passes with zero errors
- [ ] `bun test` passes (add new tests for new behaviour)
- [ ] The TUI runs in mock mode: `MOCK_PLEXICUS=1 bun run src/main.tsx --token test`
- [ ] New keyboard shortcuts are documented in `src/components/design-system/KeybindingsHelp.tsx`
- [ ] New config keys are documented in this file, in `README.md`, and in `src/services/config.ts`
- [ ] No hardcoded API URLs or tokens in committed code

---

## Releases

Releases are fully automated via GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)). To publish a new version:

1. Bump `version` in `package.json` on `main` (via PR, following the [checklist](#pull-request-checklist)).
2. Tag and push:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. The `Release` workflow runs typecheck and tests, builds standalone binaries for macOS (arm64, x64) and Linux (x64) with `bun build --compile`, generates `SHA256SUMS`, and publishes a GitHub release with auto-generated notes.

The tag must match the `package.json` version (`v` + semver). CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) also smoke-tests the compiled binary on every PR so release builds don't break silently.

---

## Reporting issues

Open an issue at [github.com/plexicus/tui/issues](https://github.com/plexicus/tui/issues). Include:

- plexicus version (`plexicus --version`)
- OS and terminal emulator
- Steps to reproduce
- Expected vs actual behaviour
