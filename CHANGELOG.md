# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Findings/repositories pagination: the cursor lost its base64 padding, so every page after the first returned HTTP 400
- Two-factor login: send the `pending_token` issued by `POST /sessions`; the TOTP secret in the login response is no longer required or read
- Live status modal: authenticate the WebSocket with the `plexicus.access.jwt` subprotocol (the backend rejects tokens in the query string), stop reconnecting on close code 1008, `ws://` for `http://` servers, nested `data{}` frame fields, `scan-progress` / `scan-run-finalized` frames
- SCM connect hint points to `/connector`; finding-type filter lists the platform types (legacy DAST removed)

### Added

- Forgejo and Azure DevOps in the SCM connect flow; per-forge "view source" links
- Forgejo Actions CI and tag release pipeline (scm.plexicus.ai is the origin; GitHub is a mirror and release host)

### Added

**Browser-based login (web-redirect flow)**
- `plexicus login` (without flags) now opens the Plexicus web app in your browser; the frontend mints a scoped CLI token and redirects back to a local server bound on `127.0.0.1:9100–9199` — no token copy-pasting
- CSRF state nonce (`randomUUID`) verified in the callback to prevent token injection
- `plexicus login --headless` forces the classic email/password form
- Automatic fallback to `--headless` when SSH session detected, no display available (Linux), or `webUrl` is not configured
- `src/utils/canOpenBrowser.ts` — runtime environment check for browser availability
- `src/utils/url.ts` — `deriveWebUrl()` helper strips `api.` subdomain prefix; returns `null` for IP:port (set `webUrl` explicitly)

**Two-factor authentication (2FA)**
- Interactive login now handles the 2FA challenge: after email/password, users are prompted for a TOTP code
- `verify2FA(secret, otp_code)` API method added; on success the session token is saved transparently

**Full JSON:API response alignment**
- Findings and repository endpoints now correctly parse the `{ data: [...], meta: { pagination } }` envelope
- All other endpoints auto-unwrap `{ success, data }` via centralised `unwrapEnvelope()` — eliminated 17 field-mismatch FIXMEs
- Zod schemas updated: `SingleFindingResponseSchema`, `RemediationsCollectionSchema`, `LoginResponseUnion`, `Verify2FAResponseSchema`, `ApiTokenListItemSchema`, `ApiTokenCreatedSchema`

**SCM integration**
- `a` key in Repos panel opens the SCM connect flow
- OAuth flow for GitHub: opens browser automatically, polls backend until authorization completes — no token copy-pasting
- GitLab, Bitbucket, and Gitea marked as "coming soon" pending backend OAuth endpoints
- Gitea support via in-TUI token form (URL + access token) — backend endpoint pending
- Headless / SSH fallback: displays the authorization URL when the browser cannot be opened
- Multi-select repository picker with fuzzy search; imports via `POST /create_repository_with_list`

**Real-time status modal**
- WebSocket client connects after login: `wss://{serverUrl}/ws/{client_id}?token={token}` (uses `client_id`, `/ws/` path prefix)
- Exponential backoff reconnect (1 s → 30 s max)
- Live progress modal (progress bar + scrollable log lines) for repo scans and AI remediations
- Auto-closes 2 s after finish events; `Esc` dismisses early without stopping the background job

**Filter modal**
- `F` key opens an interactive multi-dimensional filter modal
- Filters: severity, repository (fuzzy), status, type, CVSS range, priority range, language, category, CWE IDs, false positives
- Draft edits dispatched to state only on Apply (`Enter`); `r` resets to no filter; `Esc` cancels

**Configuration**
- `webUrl` config field — web frontend URL for browser-based login and OAuth flows (required for IP:port self-hosted installs)
- `wsUrl` config field — explicit WebSocket URL (defaults to `serverUrl` with `wss://` scheme)
- `plexicus` theme added as default (brand violet `#9241ff`)

### Fixed
- `s` (suppress) and `f` (false positive) actions in the Detail pane were no-ops; they now call the API and update state immediately
- WebSocket connected using `user.id` instead of `user.client_id`; corrected to `client_id` to match backend route
- `createRemediation` and `createPR` incorrectly expected response bodies; both are now fire-and-forget (`void`) — results arrive via WebSocket

### Tests
- 66 tests across 9 files (up from 52 in v0.1.0)

## [0.1.0] — 2026-04-25

### Added

**Core TUI**
- Findings panel with paginated list (20 per page), severity badges, CVE IDs, repo, and date columns
- Repos panel with scan status indicators (idle / scanning / completed / failed)
- Detail pane for individual findings: CVE ID, CVSS score, description, file/line location
- Diff viewer for AI-generated remediations

**Navigation**
- Vim-style keyboard navigation: `j`/`k` to move, `gg`/`G` to jump to top/bottom
- Panel switching via `1`, `2`, or `Tab`
- Fuzzy search overlay triggered by `/`
- REPL command bar triggered by `:`
- Full keybindings help overlay via `?`

**Remediation workflow**
- `r` — request AI-powered remediation
- `p` — create pull request from remediation diff
- `s` — mark finding as mitigated
- `f` — toggle false positive status

**AI chat sidebar**
- Toggle with `c`; streaming responses from Claude or OpenAI
- `:ask <question>` REPL shortcut pre-fills and auto-sends a question
- Context-aware: includes current findings in the system prompt

**REPL commands**
- `:ask <question>` — open chat and send a question
- `:filter severity:<levels> repo:<name>` — client-side filter
- `:theme dark|light` — switch theme live

**Configuration**
- `~/.config/plexicus/config.json` with atomic writes (0o600 permissions)
- `plexicus config set <key> <value>` CLI subcommand
- LLM provider selection: Claude (Anthropic SDK) and OpenAI (OpenAI SDK)
- Custom `baseUrl` support for OpenAI-compatible endpoints

**Auth**
- Interactive `plexicus login` flow
- `--token` flag, `PLEXICUS_TOKEN` environment variable, and config file fallback
- First-run wizard for initial server URL setup

**Developer experience**
- `MOCK_PLEXICUS=1` mode loads fixture data — no live API required
- 52 tests across 7 files (Bun test)
- Full TypeScript with strict mode

[Unreleased]: https://github.com/plexicus/cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/plexicus/cli/releases/tag/v0.1.0
