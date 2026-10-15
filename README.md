# plexicus

> Security findings & remediation, right in your terminal.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/plexicus/tui?label=release)](https://github.com/plexicus/tui/releases/latest)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun&logoColor=black)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://github.com/plexicus/tui/actions/workflows/ci.yml/badge.svg)](https://github.com/plexicus/tui/actions/workflows/ci.yml)

> **Source of truth**: development happens on `scm.plexicus.ai/plexicus/tui` (CI + releases there). This GitHub repository is a read-only mirror that also hosts the same release binaries. Support is the in-app ticket (`plexicus support`, or Support in the Plexicus web app), not GitHub issues.

<p align="center">
  <img src="media/demo.gif" alt="Plexicus TUI demo — browse findings, view detail, remediate" width="780" />
</p>

<sub>↑ Recorded with the TUI in mock mode (<code>MOCK_PLEXICUS=1</code>). Replay it locally with <code>asciinema play media/demo.cast</code>.</sub>

**plexicus** is a terminal UI for [Plexicus AppSec](https://plexicus.ai) — browse security findings, triage vulnerabilities, trigger AI-powered remediations, and open pull requests, all without leaving your terminal.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Self-hosted setup](#self-hosted-setup)
- [Panels](#panels)
  - [Findings panel](#findings-panel)
  - [Repos panel](#repos-panel)
  - [SCM integration](#scm-integration)
  - [Detail pane](#detail-pane)
  - [Real-time status modal](#real-time-status-modal)
- [Keyboard reference](#keyboard-reference)
- [REPL commands](#repl-commands)
- [Configuration](#configuration)
- [Command reference](#command-reference)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Findings panel** — paginated list of security findings sorted by severity, with CVE IDs, repository, and date
- **Repos panel** — browse connected repositories with scan status and per-severity finding counts
- **SCM integration** — import repositories from GitHub, GitLab, Bitbucket Cloud, Gitea, Forgejo and Azure DevOps once the provider is connected in the Plexicus web app (Connectors page)
- **Credits and pentests** — remaining AI credits and Pentest Units in the header, read-only AI pentest status (`:pentests`), shown only when your server provides them
- **Secure login** — browser login (PKCE) or device code, token kept in the OS keychain, revoked on logout
- **Real-time status modal** — live WebSocket progress bar and log stream while repos are scanned or AI remediations are generated
- **Filter modal** — interactive multi-dimensional filter: severity, repository, status, type, CVSS range, priority, language, category, CWE IDs, false positives
- **Remediation workflow** — request AI-generated remediations, review diffs, and open pull requests from the TUI
- **Fuzzy search** — instantly filter findings by name, CVE ID, or repository
- **REPL command bar** — `:filter`, `:scan`, `:theme` without touching a config file
- **Vim navigation** — `j`/`k`, `gg`/`G`, `Enter`, `Esc` — no mouse required
- **Themes** — `plexicus` (default), `dark`, `light` — switch live with `:theme <name>`
- **Zero-dependency install** — single static binary, no Node.js or Bun runtime needed on the target machine

---

## Installation

Download the latest binary for your platform from the [releases page](https://github.com/plexicus/tui/releases/latest):

```bash
# macOS (Apple Silicon)
curl -fsSL https://github.com/plexicus/tui/releases/latest/download/plexicus-darwin-arm64 \
  -o plexicus && chmod +x plexicus && sudo mv plexicus /usr/local/bin/

# macOS (Intel)
curl -fsSL https://github.com/plexicus/tui/releases/latest/download/plexicus-darwin-x64 \
  -o plexicus && chmod +x plexicus && sudo mv plexicus /usr/local/bin/

# Linux (x86-64)
curl -fsSL https://github.com/plexicus/tui/releases/latest/download/plexicus-linux-x64 \
  -o plexicus && chmod +x plexicus && sudo mv plexicus /usr/local/bin/
```

Verify:

```bash
plexicus --version
```

---

## Quick start

> **First launch**: if you have no existing configuration, plexicus will open a setup wizard to collect the server URL before proceeding to login. Enter `https://api.app.plexicus.ai` (the default) or your self-hosted endpoint, then press `Enter`.

**1. Log in**

```bash
plexicus login
```

Your browser opens on the Plexicus web app, you review the request (client, device, access, lifetime) and click Authorize. The TUI receives a one-time code on `127.0.0.1` (PKCE-bound, valid 60 seconds, single use) and exchanges it for a personal API token that is stored in your operating-system keychain. You never type a key or a password into the terminal.

On a machine without a browser (SSH, containers), or when the browser cannot be opened, the TUI switches to the device flow by itself; you can also ask for it:

```bash
plexicus login --device
# Open https://app.plexicus.ai/activate and enter the code:  WDJB-MJHT
```

Open the printed address on any device, sign in, enter the code and approve. The terminal continues as soon as you do.

Tokens last 90 days by default (1-365 days, chosen on the consent screen). `plexicus logout` revokes the token on the server and removes it from this machine; if the server cannot be reached it still clears the local copy and tells you to revoke the token in the web app under Settings → API tokens.

Where the token is stored:

| OS | Store | Fallback |
|----|-------|----------|
| macOS | Keychain (`security`) | `~/.config/plexicus/credentials.json` (mode 0600), with a warning |
| Linux | Secret Service / libsecret (`secret-tool`) | same file, with a warning |
| Windows | Credential Manager (PowerShell PasswordVault) | same file, with a warning |

An old `token` in `config.json` is moved into the keychain on first run and removed from the file.

**Non-interactive use (CI, scripts)**: export a personal API token created in the web app (Settings → API tokens) as `PLEXICUS_TOKEN`. It is used as is, never written to disk and never printed; on an interactive terminal the TUI warns that `plexicus login` is the preferred route.

```bash
export PLEXICUS_TOKEN=<token from Settings → API tokens>
plexicus pentests --status completed
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

`webUrl` is required for browser-based login (`plexicus login`; without it the device flow is used). If it is not set, the TUI attempts to derive it from `serverUrl` by stripping the `api.` subdomain prefix — this works for `https://api.app.plexicus.ai` but not for IP:port addresses. Always set it explicitly for self-hosted installs.

---

## Panels

### Findings panel

The default view. Shows all findings for your connected repositories, sorted by severity (Critical → High → Medium → Low → Informational).

- **Pagination**: 25 findings per page. Use `]` and `[` to move between pages.
- **Filter modal**: press `F` to open the interactive filter modal — filter by severity, repository (with fuzzy search), status, type, CVSS range, priority range, language, category, CWE IDs, and false positive inclusion.
- **REPL filter**: quick filter via `:filter severity:critical,high` or `:filter repo:my-service`.
- **Jump to CVE**: launch with `plexicus --cve CVE-2024-1234` to open the TUI with that finding pre-selected.

### Repos panel

Press `2` or `Tab` to switch to the repos panel. Shows all repositories connected to your Plexicus account with their current scan status and per-severity finding counts (Critical / High).

Press `a` to connect a new SCM account and import repositories.

### SCM integration

Press `a` in the Repos panel to open the SCM connect flow:

1. **Pick a provider** — GitHub, GitLab, Bitbucket Cloud, Gitea, Forgejo or Azure DevOps. Only providers already connected to your account are selectable; for the others the TUI shows the web app's Connectors page (`<webUrl>/connector`), where the connection is made.
2. **Load repositories** — the TUI lists what the connected account can access.
3. **Pick repositories** — fuzzy-search your repos, toggle selections with `Space`, confirm with `Enter`
4. **Import** — selected repositories are added to Plexicus and will appear in the list

**Headless / SSH sessions**: SCM providers are connected in the Plexicus web app (Connectors page); the TUI only imports from providers that are already connected.

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

## REPL commands

Open the REPL with `:` and type a command. Press `Esc` to return to navigation without running anything.

### `F` — Filter modal (recommended)

Press `F` in navigation mode to open the interactive filter modal. Navigate with `↑`/`↓`, toggle checkboxes with `Space`, press `Enter` to apply, `r` to reset, `Esc` to cancel.

Available filters:

| Filter | Type | Notes |
|--------|------|-------|
| Severity | Multi-select | critical, high, medium, low, informational |
| Repository | Fuzzy multi-select | Type to search, `j`/`k` to navigate, `Space` to select |
| Status | Multi-select | open, mitigated, enriched |
| Type | Multi-select | SAST, SCA, Secrets, PII, Access Control, License, Configuration, IaC, API, Cryptography, Malicious Artifact |
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
:config set theme light
:config set serverUrl https://api.example.com
```

This is equivalent to running `plexicus config set <key> <value>` from your shell.

---

## Configuration

All configuration is stored in `~/.config/plexicus/config.json`. Modify it with `plexicus config set` or edit the file directly. The file never holds a token: credentials live in the OS keychain (see [Quick start](#quick-start)).

| Key (command line / `config set`) | Key (JSON file) | Description | Default |
|--------------------------|-----------------|-------------|---------|
| `serverUrl` | `serverUrl` | Plexicus REST API base URL | `https://api.app.plexicus.ai` |
| `webUrl` | `webUrl` | Web frontend URL — used for browser-based login (`plexicus login`) and OAuth flows | derived from `serverUrl` |
| `wsUrl` | `wsUrl` | WebSocket URL for real-time status events | derived from `serverUrl` |
| `theme` | `theme` | UI colour theme (`plexicus` \| `dark` \| `light`) | `plexicus` |

> **Self-hosted note**: `webUrl` and `wsUrl` must be set explicitly when your instance uses IP:port addresses. See [Self-hosted setup](#self-hosted-setup).

Example `~/.config/plexicus/config.json`:

```json
{
  "serverUrl": "https://api.app.plexicus.ai",
  "theme": "plexicus"
}
```

---

## Command reference

### `plexicus` (default — opens TUI)

```
plexicus [options]

Options:
  --repo <name>     Filter findings to a specific repository on launch
  --cve <id>        Open the TUI with a specific CVE pre-selected (e.g. CVE-2024-1234)
  --version         Print version
  --help            Show help
```

### `plexicus login`

```
plexicus login [options]

Options:
  --device          Device flow: print a code to enter at the verification URL (SSH, headless)
```

Opens your browser (loopback + PKCE) and stores a revocable token in the OS keychain. There is no `--token` and no password prompt.

### `plexicus logout`

Revokes the stored token on the server (`DELETE /users/me/api-tokens/self`) and removes it from the keychain and the file fallback.

### `plexicus credits`

Prints your remaining AI credits and Pentest Units (also shown in the TUI header when the server provides them).

### `plexicus pentests`

Lists your AI pentests with status and severity counts. Read-only: launching, cancelling, logs and reports stay in the web app.

```
plexicus pentests [--status draft|pending|running|completed|failed|cancelled] [--page <n>]
```

### `plexicus support`

Files an in-app support ticket (reaches the Plexicus support team; no repository or finding data is attached).

```
plexicus support [--category question|bug|feature_request|billing|security|other]
                 [--subject <text>] [--message <text>] [--yes]
```

Subject up to 200 characters, message up to 5000. You are asked to confirm before anything is sent. Do not paste passwords, tokens or customer data.

### `plexicus repos`

Opens the TUI directly on the Repos panel.

### `plexicus config set <key> <value>`

```
plexicus config set <key> <value>

Examples:
  plexicus config set theme light
  plexicus config set serverUrl https://api.example.com
  plexicus config set webUrl https://app.example.com
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `PLEXICUS_TOKEN` | Personal API token for non-interactive use (CI, scripts). Takes precedence over the stored login, is never written to disk or printed |
| `PLEXICUS_DEBUG` | Set to `1` for debug output on stderr (tokens and one-time codes are redacted) |
| `MOCK_PLEXICUS` | Set to `1` to load fixture data instead of making real API calls (for development) |

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture overview, testing guide, and pull request checklist.

---

## License

[MIT](LICENSE) — Copyright © 2026 Plexicus
