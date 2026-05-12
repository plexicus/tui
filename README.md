# plexicus

> Security findings & remediation, right in your terminal.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/plexicus/cli?label=release)](https://github.com/plexicus/cli/releases/latest)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun&logoColor=black)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-66%20passing-brightgreen)](https://github.com/plexicus/cli/actions)

<p align="center">
  <img src="media/demo.gif" alt="Plexicus CLI demo — browse findings, view detail, remediate" width="780" />
</p>

<sub>↑ Recorded with the CLI in mock mode (<code>MOCK_PLEXICUS=1</code>). Replay it locally with <code>asciinema play media/demo.cast</code>.</sub>

**plexicus** is a terminal UI for [Plexicus ASPM](https://plexicus.ai) — browse security findings, triage vulnerabilities, trigger AI-powered remediations, and open pull requests, all without leaving your terminal.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Self-hosted setup](#self-hosted-setup)
- [Panels](#panels)
  - [Findings panel](#findings-panel)
  - [Repos panel](#repos-panel)
  - [SCM integration](#scm-integration)
  - [AI chat sidebar](#ai-chat-sidebar)
  - [Detail pane](#detail-pane)
  - [Real-time status modal](#real-time-status-modal)
- [Keyboard reference](#keyboard-reference)
- [REPL commands](#repl-commands)
- [AI chat setup](#ai-chat-setup)
- [Configuration](#configuration)
- [CLI reference](#cli-reference)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Findings panel** — paginated list of security findings sorted by severity, with CVE IDs, repository, and date
- **Repos panel** — browse connected repositories with scan status and per-severity finding counts
- **SCM integration** — connect GitHub, GitLab, Bitbucket Cloud, and Gitea directly from the TUI; OAuth providers open your browser automatically with no token copy-pasting
- **Real-time status modal** — live WebSocket progress bar and log stream while repos are scanned or AI remediations are generated
- **Filter modal** — interactive multi-dimensional filter: severity, repository, status, type, CVSS range, priority, language, category, CWE IDs, false positives
- **AI chat sidebar** — ask questions about your findings using Claude or OpenAI; context-aware, streams live
- **Remediation workflow** — request AI-generated remediations, review diffs, and open pull requests from the TUI
- **Fuzzy search** — instantly filter findings by name, CVE ID, or repository
- **REPL command bar** — `:ask`, `:filter`, `:theme` without touching a config file
- **Vim navigation** — `j`/`k`, `gg`/`G`, `Enter`, `Esc` — no mouse required
- **Themes** — `plexicus` (default), `dark`, `light` — switch live with `:theme <name>`
- **Zero-dependency install** — single static binary, no Node.js or Bun runtime needed on the target machine

---

## Installation

Download the latest binary for your platform from the [releases page](https://github.com/plexicus/cli/releases/latest):

```bash
# macOS (Apple Silicon)
curl -fsSL https://github.com/plexicus/cli/releases/latest/download/plexicus-darwin-arm64 \
  -o plexicus && chmod +x plexicus && sudo mv plexicus /usr/local/bin/

# macOS (Intel)
curl -fsSL https://github.com/plexicus/cli/releases/latest/download/plexicus-darwin-x64 \
  -o plexicus && chmod +x plexicus && sudo mv plexicus /usr/local/bin/

# Linux (x86-64)
curl -fsSL https://github.com/plexicus/cli/releases/latest/download/plexicus-linux-x64 \
  -o plexicus && chmod +x plexicus && sudo mv plexicus /usr/local/bin/
```

Verify:

```bash
plexicus --version
```

---

## Quick start

> **First launch**: if you have no existing configuration, plexicus will open a setup wizard to collect the server URL before proceeding to login. Enter `https://api.app.plexicus.ai` (the default) or your self-hosted endpoint, then press `Enter`.

**1. Authenticate**

```bash
plexicus login
```

When `webUrl` is configured (or derived from `serverUrl`), this opens your browser to the Plexicus web app which mints a CLI token automatically — no copy-pasting. Once authorized, the token is saved and you return to the terminal.

Use `--headless` to skip the browser flow and enter email/password directly:

```bash
plexicus login --headless
```

Or pass a token directly:

```bash
plexicus --token <your-token>
# or
export PLEXICUS_TOKEN=<your-token>
plexicus
```

**2. Open the TUI**

```bash
plexicus
```

**3. Navigate**

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `Enter` | Open finding detail |
| `/` | Fuzzy search |
| `?` | Show all keybindings |
| `Ctrl+C` | Quit |

---

## Self-hosted setup

If you are running a self-hosted Plexicus instance, configure all three URLs before launching:

```bash
plexicus config set serverUrl http://192.168.1.144:8085   # REST API
plexicus config set webUrl    http://192.168.1.144:3000   # web frontend (for browser redirects)
plexicus config set wsUrl     ws://192.168.1.144:8085     # WebSocket (real-time status)
```

`webUrl` is required for browser-based login (`plexicus login` without `--headless`). If it is not set, the TUI attempts to derive it from `serverUrl` by stripping the `api.` subdomain prefix — this works for `https://api.app.plexicus.ai` but not for IP:port addresses. Always set it explicitly for self-hosted installs.

---

## Panels

### Findings panel

The default view. Shows all findings for your connected repositories, sorted by severity (Critical → High → Medium → Low → Informational).

- **Pagination**: 20 findings per page. Use `]` and `[` to move between pages.
- **Filter modal**: press `F` to open the interactive filter modal — filter by severity, repository (with fuzzy search), status, type, CVSS range, priority range, language, category, CWE IDs, and false positive inclusion.
- **REPL filter**: quick filter via `:filter severity:critical,high` or `:filter repo:my-service`.
- **Jump to CVE**: launch with `plexicus --cve CVE-2024-1234` to open the TUI with that finding pre-selected.

### Repos panel

Press `2` or `Tab` to switch to the repos panel. Shows all repositories connected to your Plexicus account with their current scan status and per-severity finding counts (Critical / High).

Press `a` to connect a new SCM account and import repositories.

### SCM integration

Press `a` in the Repos panel to open the SCM connect flow:

1. **Pick a provider** — GitHub, GitLab, Bitbucket Cloud, or Gitea
2. **Authorize**
   - *GitHub / GitLab / Bitbucket*: your browser opens automatically to the OAuth page. Complete authorization there; the TUI polls in the background until your account is linked (no token copy-pasting).
   - *Gitea*: enter your Gitea server URL and access token directly in the terminal.
3. **Pick repositories** — fuzzy-search your repos, toggle selections with `Space`, confirm with `Enter`
4. **Import** — selected repositories are added to Plexicus and will appear in the list

**Headless / SSH sessions**: if the browser cannot be opened, the TUI displays the authorization URL prominently so you can click it in your terminal emulator. The polling flow continues normally once you complete auth on your local machine.

### AI chat sidebar

Press `c` to toggle the chat sidebar. Ask anything about your findings:

```
You: What's the risk of CVE-2024-1234 in my environment?
AI:  CVE-2024-1234 is a SQL injection vulnerability rated CVSS 9.8 (Critical).
     In your backend service it affects the user authentication endpoint...
```

The sidebar streams responses live. Press `Esc` to close it.

You can also pre-fill the chat from the REPL: `:ask what is the safest way to fix this?`

### Detail pane

Press `Enter` on any finding to open the detail pane:

- CVE ID and CVSS score
- Full vulnerability description
- File path and line number
- Status (`open` / `mitigated` / `enriched`), false positive flag
- Actions: remediate, create PR, suppress, toggle false positive

### Real-time status modal

A progress modal appears automatically when:
- A repository scan starts (triggered by adding a repo or a webhook event)
- An AI remediation is being generated

```
╭─ Scanning: api-service ────────────────────────╮
│ ████████████░░░░░░░░░░░░░░░░░░░░░░  38%        │
│ scanning                                        │
│ [12:03:01] Cloning repository...               │
│ [12:03:04] Running Semgrep rules...             │
│                                                 │
│ Esc=dismiss (continues in background)           │
╰─────────────────────────────────────────────────╯
```

The modal auto-closes two seconds after the job finishes. Press `Esc` to dismiss it early — the underlying job continues running in the background.

---

## Keyboard reference

### Navigation mode (default)

| Key | Action |
|-----|--------|
| `j` or `↓` | Move cursor down |
| `k` or `↑` | Move cursor up |
| `gg` | Jump to top of list |
| `G` | Jump to bottom of list |
| `Enter` | Select / open detail pane |
| `Esc` | Close detail pane / go back |
| `1` | Switch to Findings panel |
| `2` | Switch to Repos panel |
| `Tab` | Toggle between panels |
| `]` / `[` | Next / previous page |
| `/` | Open fuzzy search (findings panel only) |
| `F` | Open filter modal |
| `:` | Open REPL command bar |
| `c` | Toggle AI chat sidebar |
| `?` | Show keybindings help |
| `Ctrl+C` | Exit (press `Esc` first if you are in REPL mode) |

### Finding actions (navigation mode, Findings panel)

| Key | Action |
|-----|--------|
| `r` | Request AI remediation |
| `p` | Create pull request from remediation |
| `s` | Mark finding as mitigated |
| `f` | Toggle false positive (lowercase f) |
| `F` | Open filter modal (uppercase F / Shift+F) |

### Repos panel actions (navigation mode)

| Key | Action |
|-----|--------|
| `a` | Connect SCM account and import repositories |
| `Enter` | Expand / collapse repo details |
| `Esc` | Collapse expanded row / return to Findings panel |

### SCM connect flow (`a` to enter)

| Key | Action |
|-----|--------|
| `j` / `k` or `↓` / `↑` | Navigate provider / repo list |
| `Space` | Toggle repository selection |
| `Enter` | Confirm selection / advance step |
| `Esc` | Go back / cancel |

### Login screen

| Key | Action |
|-----|--------|
| `r` | Open browser to registration page (shown at email step) |

### Status modal

| Key | Action |
|-----|--------|
| `Esc` | Dismiss modal (job continues in background) |

### REPL mode (`:` to enter)

| Key | Action |
|-----|--------|
| Any char | Type command |
| `↑` / `↓` | Navigate command history (last 20) |
| `Backspace` | Delete last character |
| `Enter` | Execute command |
| `Esc` | Exit REPL, return to navigation |

### Fuzzy search (`/` to enter)

| Key | Action |
|-----|--------|
| Any char | Filter results |
| `↑` / `↓` | Move cursor in results |
| `Enter` | Select result |
| `Esc` | Cancel |

### Chat mode (`c` to enter)

| Key | Action |
|-----|--------|
| `Esc` | Close sidebar, return to navigation |

---

## REPL commands

Open the REPL with `:` and type a command. Press `Esc` to return to navigation without running anything.

### `:ask <question>` (alias: `:a`)

Opens the AI chat sidebar and sends the question immediately.

```
:ask what is the impact of CVE-2024-1234?
:a how should I prioritize these findings?
```

### `F` — Filter modal (recommended)

Press `F` in navigation mode to open the interactive filter modal. Navigate with `↑`/`↓`, toggle checkboxes with `Space`, press `Enter` to apply, `r` to reset, `Esc` to cancel.

Available filters:

| Filter | Type | Notes |
|--------|------|-------|
| Severity | Multi-select | critical, high, medium, low, informational |
| Repository | Fuzzy multi-select | Type to search, `j`/`k` to navigate, `Space` to select |
| Status | Multi-select | open, mitigated, enriched |
| Type | Multi-select | SAST, SCA, DAST |
| CVSS score | Min / max range | 0.0–10.0 |
| Priority | Min / max range | 0–100 |
| Language | Text | e.g. `python` |
| Category | Text | e.g. `Application` |
| CWE IDs | Multi-chip | Type number + Enter to add |
| False positives | Toggle | Include findings marked as false positive |

A cyan `●` indicator appears in the column header when a non-default filter is active.

### `:filter <criteria>` (REPL shortcut)

Quick filter from the REPL. Criteria can be combined.

```bash
:filter severity:critical
:filter severity:critical,high
:filter repo:my-backend
:filter severity:high repo:frontend status:open
```

Valid severity levels: `critical`, `high`, `medium`, `low`, `informational`
Valid status values: `open`, `mitigated`, `enriched`

To clear the filter, run `:filter` with no arguments (or restart the TUI).

### `:theme <name>`

Switches the UI colour theme live.

```
:theme plexicus   # default — brand violet
:theme dark
:theme light
```

### `:config set <key> <value>`

Set a configuration value without leaving the TUI.

```
:config set llm.provider claude
:config set llm.api_key sk-ant-...
:config set theme light
```

This is equivalent to running `plexicus config set <key> <value>` from your shell. Key aliases apply: `llm.api_key` → stored as `llm.apiKey`, `llm.base_url` → stored as `llm.baseUrl`.

---

## AI chat setup

The AI chat sidebar uses your own API key. Configure a provider once:

```bash
# Use Claude (Anthropic)
plexicus config set llm.provider claude
plexicus config set llm.api_key sk-ant-...

# Use OpenAI (or any OpenAI-compatible endpoint)
plexicus config set llm.provider openai
plexicus config set llm.api_key sk-...
plexicus config set llm.model gpt-4o          # optional, overrides default
plexicus config set llm.base_url https://...  # optional, for custom endpoints
```

Your API key is stored in `~/.config/plexicus/config.json` with `0600` permissions (owner read/write only).

---

## Configuration

All configuration is stored in `~/.config/plexicus/config.json`. Modify it with `plexicus config set` or edit the file directly.

Keys passed to `plexicus config set` use snake_case aliases (`llm.api_key`, `llm.base_url`). They are normalized to camelCase when written to the JSON file (`llm.apiKey`, `llm.baseUrl`).

| Key (CLI / `config set`) | Key (JSON file) | Description | Default |
|--------------------------|-----------------|-------------|---------|
| `serverUrl` | `serverUrl` | Plexicus REST API base URL | `https://api.app.plexicus.ai` |
| `webUrl` | `webUrl` | Web frontend URL — used for browser-based login (`plexicus login`) and OAuth flows | derived from `serverUrl` |
| `wsUrl` | `wsUrl` | WebSocket URL for real-time status events | derived from `serverUrl` |
| `token` | `token` | Authentication token | — |
| `theme` | `theme` | UI colour theme (`plexicus` \| `dark` \| `light`) | `plexicus` |
| `llm.provider` | `llm.provider` | LLM provider (`claude` \| `openai`) | — |
| `llm.api_key` | `llm.apiKey` | API key for the LLM provider | — |
| `llm.model` | `llm.model` | Model name (optional override) | Provider default |
| `llm.base_url` | `llm.baseUrl` | Custom base URL (OpenAI-compatible endpoints) | — |

> **Self-hosted note**: `webUrl` and `wsUrl` must be set explicitly when your instance uses IP:port addresses. See [Self-hosted setup](#self-hosted-setup).

Example `~/.config/plexicus/config.json`:

```json
{
  "serverUrl": "https://api.app.plexicus.ai",
  "token": "plx_...",
  "theme": "plexicus",
  "llm": {
    "provider": "claude",
    "apiKey": "sk-ant-..."
  }
}
```

---

## CLI reference

### `plexicus` (default — opens TUI)

```
plexicus [options]

Options:
  --token <token>   Authentication token (overrides PLEXICUS_TOKEN env and config)
  --repo <name>     Filter findings to a specific repository on launch
  --cve <id>        Open the TUI with a specific CVE pre-selected (e.g. CVE-2024-1234)
  --version         Print version
  --help            Show help
```

### `plexicus login`

```
plexicus login [options]

Options:
  --token <token>   Authenticate non-interactively with a token
  --headless        Skip browser-based login; use email/password form instead
```

### `plexicus repos`

Opens the TUI directly on the Repos panel.

### `plexicus config set <key> <value>`

```
plexicus config set <key> <value>

Examples:
  plexicus config set llm.provider claude
  plexicus config set llm.api_key sk-ant-...
  plexicus config set theme light
  plexicus config set serverUrl https://api.example.com
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `PLEXICUS_TOKEN` | Authentication token (lower priority than `--token`, higher than config file) |
| `MOCK_PLEXICUS` | Set to `1` to load fixture data instead of making real API calls (for development) |

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture overview, testing guide, and pull request checklist.

---

## License

[MIT](LICENSE) — Copyright © 2026 Plexicus
