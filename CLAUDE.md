---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Plexicus TUI

### Running the TUI

```bash
# Development (mock API — real API not yet live)
MOCK_PLEXICUS=1 bun run src/main.tsx --token test

# CLI subcommands
bun run src/main.tsx config set serverUrl <url>
bun run src/main.tsx login
bun run src/main.tsx repos

# Type check
bun run typecheck   # tsc --noEmit

# Build binary
bun build src/main.tsx --outfile dist/plexicus --target bun
```

### Entry point and CLI (`src/main.tsx`)
Commander entrypoint with 4 subcommands: default (TUI), `login`, `repos`, `config set`. Each lazily imports its module. Token resolution: `--token` flag → `PLEXICUS_TOKEN` env → `~/.config/plexicus/config.json`.

### Web-redirect login flow (`src/services/auth/webRedirect.ts`)
`plexicus login` (no flags) attempts a browser-based auth flow when `webUrl` is configured and `canOpenBrowser()` is true. Flow: bind local `Bun.serve` on `127.0.0.1:9100–9199` → open `{webUrl}/auth/cli?port=PORT&state=NONCE` in browser → frontend page POSTs to `POST /auth/cli/exchange` with the user's web JWT → backend mints a `CLI - YYYY-MM-DD` API token → frontend redirects browser to `http://127.0.0.1:PORT?token=...&email=...&state=NONCE` → TUI verifies state nonce, saves token, exits.

`plexicus login --headless` skips the browser flow and falls back to the `LoginForm` (email/password). Falls back automatically when `SSH_TTY` is set, `DISPLAY`/`WAYLAND_DISPLAY` absent (Linux), or `webUrl` not configured. Use `plexicus config set webUrl https://app.plexicus.ai` to enable it.

Utilities: `src/utils/canOpenBrowser.ts` (env-var checks), `src/utils/url.ts` (`deriveWebUrl`: strips `api.` subdomain prefix, returns `null` for IP:port — set `webUrl` explicitly for self-hosted).

### Navigation model — 3-screen drill-down
The TUI uses a stack-based screen router. `state.screen: Screen` drives which component renders; `state.screenStack` holds history for Esc-to-go-back.

- **Screen 1 `repos`** — Repository list. "All Repos" is a virtual first entry (index 0). Enter on any row pushes `findings` screen and sets `state.selectedRepoId` (null for All Repos, which also sets `findings/filter: {}`; a specific repo sets `findings/filter: { repository_ids: [id] }`).
- **Screen 2 `findings`** — Findings scoped by `selectedRepoId`. Enter pushes `detail` screen and sets `state.selectedFindingId`.
- **Screen 3 `detail`** — Full finding detail (code snippet, SCM link, scores). `r` opens `DiffModal` inline; `o` opens SCM link in browser (falls back to clipboard + URL display); `s`/`f` suppress / toggle false-positive; Esc pops back.

Nav actions: `nav/pushScreen`, `nav/popScreen`, `repo/select`.

### State management (`src/state/`)
Pure `useReducer` + React Context. `AppState.tsx` exports `AppStateProvider` + `useAppState`. `actions.ts` has the full discriminated union `Action` type. No direct state mutation anywhere.

Key state fields:
- `screen: Screen` — current screen (`repos | findings | detail`)
- `screenStack: Screen[]` — navigation history; Esc pops the stack
- `selectedRepoId: string | null` — repo in scope for findings screen (null = all)
- `inputMode: 'navigation' | 'repl' | 'login' | 'filter' | 'scm'` — gates ALL keyboard input
- `fuzzyOpen: boolean` — controls FuzzyPicker (works on both repos and findings screens)
- `filterOpen: boolean` — controls FilterModal; `filter/open` sets `inputMode: 'filter'`
- `scmFlowOpen: boolean` — controls SCMConnectFlow; `scm/open` sets `inputMode: 'scm'`
- `activeStatusJob: StatusJob | null` — drives StatusModal; updated by WebSocket events
- `findingsFilter: FindingsFilter` — full server-side filter shape (15+ dimensions); dispatching `findings/filter` resets `findingsPage` to 0
- `findingsPage: number` — 0-indexed current page; `useFindings` passes to API
- `findingsTotal / findingsPageCount` — populated from `meta.pagination` in API response

### Keyboard input architecture (`src/components/App.tsx`, `src/hooks/useKeymap.ts`)
**Critical**: The REPL bar does NOT use `ink-text-input`. It uses direct `useInput` char capture in `App.tsx` because `ink-text-input` v6 focus is unreliable in tmux. Characters accumulate in `replInput` state; a `replInputRef` (updated each render) provides stale-closure-safe access for the Enter handler.

Key bindings by mode:
- **Navigation**: `j/k` (move), `gg/G` (top/bottom), `Enter` (drill-down), `s/f` (suppress/fp from list), `a` (add repo — repos screen), `o` (open SCM link — detail screen), `F` (filter modal), `/` (fuzzy), `:` (REPL), `?` (help), `Esc` (back)
- **REPL**: printable chars → accumulate; `Backspace` → delete; `Enter` → submit; `↑/↓` → history or dropdown nav; `Tab` → accept dropdown item; `Esc` → exit. Unknown input (non-command) → "Unknown command" message
- **Fuzzy**: `↑/↓` → cursor; `Enter` → select; `Esc` → cancel
- **Filter**: `↑/↓` → navigate sections; `j/k` → navigate within checkbox sections; `Space` → toggle; `Enter` → apply; `r` → reset; `Esc` → cancel
- **SCM flow**: `j/k` → navigate; `Space` → toggle repo selection; `Enter` → confirm; `Esc` → back/cancel

### REPL
Known commands: `:filter`, `:scan`, `:theme <plexicus|dark|light>`, `:config set <key> <value>`, `:help` / `:?`. Unknown non-empty input → shows an "Unknown command" message.

`:scan` requires `state.selectedRepoId` to be set (i.e., user must be on findings screen for a specific repo). It calls `api.requestScan(repoId)` and opens `StatusModal`.

### Component tree (`src/components/`)
`App.tsx` → `AuthGate` (FirstRunWizard → LoginForm → AppShell). `AppShell`: breadcrumb header, screen router (`ReposPanel | FindingsPanel | FindingDetailScreen`), overlay modals (FilterModal, StatusModal), REPL bar + autocomplete dropdown.

`FuzzyPicker` renders inside `ReposPanel` or `FindingsPanel` when `state.fuzzyOpen && state.screen === 'repos|findings'`.

`FilterModal` renders in `AppShell` when `state.filterOpen`. Holds a local draft of `FindingsFilter`; dispatches only on Apply (Enter).

`FindingDetailScreen` — Screen 3. Renders inline `DiffModal` when `r` is pressed (`r=fix` for unfixed findings, `r=view remediation` for `ready` or `mitigated`). Status display: `open` (yellow), `enriched` (cyan, ⊕), `ready` (magenta, ⚡ — has a remediation ready), `mitigated` (green, ✓). SCM link uses `src/utils/scm.ts`: `scmUrl(repo, finding)` builds the URL, `openScmLink(url)` tries `open`/`xdg-open`, falls back to `pbcopy`/`xclip` and returns `{ opened: false, url }` for UI display.

`DiffModal` — inline overlay for AI remediation. Shows 12 scrollable lines of unified diff (j/k or ↑↓ to scroll). When opened: checks for existing ready remediation via HTTP, then creates one if missing, opens StatusModal, and sends a WS `status-remediation` request. HTTP polling (3s interval, 15 min max) runs as fallback. `p` creates a PR, Esc cancels.

`SCMConnectFlow` renders inside `ReposPanel` when `state.scmFlowOpen`. State machine: `pick-provider → authorizing → gitea-form → pick-repos → importing → done/error`.

`StatusModal` renders in `AppShell` when `state.activeStatusJob !== null`. Auto-closes 2s after finish events.

### WebSocket integration (`src/services/websocket.ts`, `src/hooks/useWebSocket.ts`)
`plexicusWs` singleton connects after login: `wss://{serverUrl}/ws/{user.client_id}?token={token}` (note `/ws/` prefix and `client_id` not `user.id` — backend route is `WS /ws/{client_id}` and rejects if decoded client_id != path param). Reconnects with exponential backoff (1s → 30s max). `plexicusWs.send(data)` sends a JSON message to the server (used to request remediation status). `useWebSocket(config)` hook is called in `AppShell` and routes events to AppState:
- `trigger-check-repository` → `status/open` (repo scan started)
- `status-repository` → `status/update` (progress + log lines)
- `trigger-finish-repository` → `status/update` + auto-close after 2s
- `status-remediation` → parses `msg.data` via `RemediationSchema`, dispatches `remediation/set`; auto-closes StatusModal on `ready`/`error`. The server sends this in response to a client request `{ request_type: "status-remediation", finding_id }`.
- `workflow_status` (with `page_console === "remediation_generation"`) → `status/update` (remediation generation progress)

`wsUrl` config field overrides derived URL. Default derivation: `serverUrl.replace(/^https?:\/\//, 'wss://')`.
Set via: `bun run src/main.tsx config set wsUrl wss://custom.example.com`

### API response format (JSON:API)
All findings and repo responses are `{ data: [{ id, attributes: {...} }], meta: { pagination: {...} } }`. `plexicusApi.ts` parses these via Zod schemas and maps to flat `Finding`/`Repository` types. Field renames: `name→title`, `file→file_path`, `cvss_score→cvssv3_score`, `created_at→date`, `repo→repo_id+repo_nickname`, `cve_id→cve`. Finding status values (from libcovulor): `enriched` (default/processed), `ready` (has a ready remediation), `completed/pr_submitted/solved` → mapped to `'mitigated'`, `issued` → `'enriched'`, `pending_input` → `'open'`. Use `is_false_positive: boolean` (no `false_positive` status). SCM repos endpoint `GET /vulnerability_tool/repositories/{provider}` returns `{ success, data: { repositories: [...] } }` — `fetch()` auto-unwraps to `{ repositories: [...] }`, so read `raw.repositories` directly (not `raw.data.repositories`).

### Server-side filtering (`src/hooks/useFindings.ts`)
`useEffect` watches `[state.isAuthenticated, state.findingsFilter, state.findingsPage]`. Uses `AbortController` to cancel stale requests. Builds a `repoMap` from `state.repos` for `repo_nickname` denormalization. Pagination comes from `meta.pagination` in the response.

### API and mock mode (`src/services/plexicusApi.ts`)
Set `MOCK_PLEXICUS=1` to load fixture data from `tests/fixtures/plexicus/` instead of making HTTP calls. All responses validated via Zod schemas in `src/services/apiSchemas.ts`.

### Config (`src/services/config.ts`)
Stored at `~/.config/plexicus/config.json`. Atomic writes: `mkdir(0o700)` → `chmod` → `writeFile(tmp, 0o600)` → `rename` → `chmod`.

Config fields: `serverUrl`, `webUrl` (optional web frontend URL for browser redirects), `wsUrl` (optional WebSocket URL), `token`, `theme`.

If `webUrl` is not set, it is derived from `serverUrl` by stripping the `api.` subdomain prefix — works for cloud (`https://api.app.plexicus.ai → https://app.plexicus.ai`) but not for IP:port deployments. Always set `webUrl` explicitly on self-hosted installs.

### Command registry (`src/commands.ts`)
Discriminated union: `PromptCommand | LocalCommand | LocalJSXCommand`. Lazily loaded via lodash-es `memoize()`. Registered commands: `theme`, `filter`, `config`. The REPL in `App.tsx` inline-handles `filter`, `scan`, `theme`, `help`; unknown input shows an "Unknown command" message.

### Testing
Mock API via `MOCK_PLEXICUS=1`. Config tests use `beforeEach`/`afterEach` with `mkdtemp` + `process.env.HOME` override to isolate filesystem. Component tests use `ink-testing-library`. Use dynamic `import()` (not top-level) in tests when the module reads env vars at init time.
