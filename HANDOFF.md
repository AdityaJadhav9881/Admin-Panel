# HANDOFF — CampusMart AI Master Control (context for next session)

_Last updated: 2026-10-15 (post-push of auth/agents/trust work). Read this file first in a new session; it is the full state snapshot._

## 1. Project

- **Path**: `D:\Career_and_Life_Goals\Projects\p-20\Website 02`
- **What it is**: "Master Control" — an AI-operations admin dashboard for the CampusMart campus marketplace.
- **Git**: remote `origin` = `https://github.com/AdityaJadhav9881/Admin-Panel.git` (branch `main`, tracking `origin/main`). Working tree clean after last session.
  - `e83682e` Initial commit: CampusMart Master Control admin dashboard
  - `4cd7a0d` Add admin login gate, fix agent normalization and trust score scale
- **Stack**: React 19 + TypeScript ~6.0 + Vite 8 + Tailwind v4 (`@tailwindcss/vite`), linting via `oxlint` (`.oxlintrc.json`: `react/rules-of-hooks: error`, `react/only-export-components: warn`).
- **tsconfig constraints**: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` (no constructor parameter properties), `"types": ["vite/client"]`.
- **Reference docs**: two philosophy `.txt` files in the project root (INFINITY DESIGN). Key principles applied throughout: neutral foundation, controlled accent, semantic color, progressive disclosure, no dead ends, honest data labelling (placeholder values are always labelled as such).
- **Live mode**: `USE_MOCK_DATA = false`; the dashboard reads the FastAPI contract on Render (`VITE_API_BASE_URL=https://campusmart-api-zia4.onrender.com` in `.env`; `.env` is gitignored, only `.env.example` is tracked). Mock seed arrays were deleted; only `PLACEHOLDER_SERVICES` (service-health rows, latency `null`) remains static and is labelled as not-yet-wired in the Settings view.
- **Admin auth**: login gate via `POST /auth/login` (`{email, password}` → JWT). Token stored in `localStorage` (`campusmart_admin_token` / `campusmart_admin_email`); every `/admin/*` request sends `Authorization: Bearer <token>`. 401 clears the session and returns to the login screen. Demo helper on the login card fills `aditya.jadhav@campus.edu` / `password123` (still validated by the backend). Sign out button lives in the sidebar footer admin card.

## 2. Commands

```bash
npm run lint        # oxlint — must pass clean
npm run build       # tsc -b && vite build — must pass clean
npm run dev         # vite dev server
```

- **Windows note**: `npm` via `Start-Process FilePath "npm"` fails; start dev server directly:
  `Start-Process -FilePath "node" -ArgumentList "node_modules/vite/bin/vite.js","--port","5273","--strictPort" -WorkingDirectory <project> -WindowStyle Hidden`
- **Port 5173 may be occupied** by another project (`Website 01`) — use **5273** and verify with `Invoke-WebRequest` that the HTML contains "Master Control" before trusting screenshots.
- **Screenshots**: `playwright-core` is NOT in devDependencies (intentionally removed after verification). Temporarily `npm i -D playwright-core`, use `chromium.launch({ channel: 'msedge', headless: true })`, then `npm rm playwright-core` and delete the script. Scripts must live in the project dir (ESM resolution); output PNGs to `C:/Users/jadha/AppData/Local/Temp/opencode/shots3`.
- Playwright gotchas learned the hard way:
  - Prefer `locator('table button', { hasText: 'Title...' })` over `getByRole(name)` — desktop table and mobile list both exist in the DOM (one hidden by `sm:hidden`), so scope by `table`/`ul` or use `.first()`.
  - `getByRole('button', { name: 'Cancel' })` matches substrings ("cancelling") — use `exact: true`.
  - The Flag Inspector drawer is a modal (z-[60]); it must be closed before clicking table rows. Close via `button[aria-label="Close listing inspector"]` (Escape also works but a confirm dialog must be closed first).
  - Avoid em dashes in test-selector strings when writing files via PowerShell (encoding mojibake); prefer ASCII substrings.
  - **CORS**: a stand-in FastAPI on `127.0.0.1:8000` must send `Access-Control-Allow-Origin: *` AND answer `OPTIONS` preflights (PATCH with `Content-Type: application/json` triggers one). Without this the app appears stuck "Offline". The Render API must allow the dashboard origin for the same reason.
  - The "Connecting…" refresh state completes in milliseconds when the server refuses connections — don't assert on it; assert the error banner persists instead.
  - With the login gate, Playwright flows must sign in first (or seed `localStorage` with `campusmart_admin_token`) before dashboard selectors exist.

## 3. Architecture (single source of truth)

`src/App.tsx` owns ALL state; views are presentational with callback props (handlers are sync wrappers around async mutations via `withMutation` — single-flight guard `mutationInFlight` ref).

- Auth: `session` (`AdminSession | null` from `readAdminSession()`); `!session` → full-page `LoginView`; `handleLogin` → `loginAdmin` + `persistAdminSession` + `setSession`; `handleSignOut` clears storage and resets all data state. Bootstrap effect only runs when `session` is set.
- State: `view` (`ViewId`), `navOpen`, `users`, `listings`, `queue`, `agents`, `metrics` (`OverviewMetrics` from `/admin/overview`), `services` (`PLACEHOLDER_SERVICES`, constant), `userQuery`, `userFilter`, `backendConnected`, `bootstrapped`, `refreshing`, `loadError`, `toast` (`showToast` via ref timer).
- Derived: `flaggedListings`, `pausedAgents`, `fraudAgentEnabled` (looks up agent id `trust_fraud_detection`), `overall`/`health` (trust band), `backend` (`{connected, label}` with `API_HOST`).
- Bootstrap: `loadData({ initial })` in a `useCallback` — `Promise.all([fetchOverview, fetchUsers, fetchListings, fetchAgents])`; stale-response guard via `loadSeq` ref. Initial effect yields one microtask before calling it (`await Promise.resolve()` first) to satisfy `react/set-state-in-effect`. On `ApiError` 401: clear session → login gate. On other failure: `loadError` banner + critical toast; on success of manual refresh: success toast.
- Mutations (all async, error → critical toast, state updated from requested change after server ack):
  - Block/Unblock & Ban seller → `setUserStatus(id, status)` → `PATCH /admin/users/{id}/status`
  - Approve → `apiApproveListing(id)` → `PATCH /admin/listings/{id}/approve`; clears local flag, decrements `metrics.flaggedCount` when the listing was flagged
  - Delete → `removeListing(id)` → `DELETE /admin/listings/{id}`; removes listing, then silently re-fetches users+listings (server applies the trust penalty)
  - Agent toggle → `setAgentEnabled(key, enabled)` → `PATCH /admin/ai-agents/{key}` body `{ enabled: boolean }`
  - Acknowledge flag is **session-local** (no backend endpoint); decrements `metrics.flaggedCount`; OverviewView copy says so honestly.
- UI states: `!session` → LoginView; `!bootstrapped` → spinner panel; `loadError && bootstrapped` → critical banner with **Retry Connection** button (calls `loadData()`); Topbar chip shows `Live API` / `Offline`; `Refresh data` button in Topbar always available.
- **Trust score scale**: Postgres uses **0.0–5.0**. `trustBand`: `>=4.0` High/success, `>=2.5` Moderate/warning, else Low/critical. Bar width via `trustPercent(score)` = `(score/5)*100` clamped. Display via `formatTrustScore` (`toFixed(1)`). `LISTING_DELETE_TRUST_PENALTY = 0.5` (was 8 on the old 0–100 scale).
- **AI agents payload**: `GET /admin/ai-agents` may return `{ key: boolean, ... }` or `[{key, enabled}, ...]` (or `{data:[]}`). `adaptAgents` always merges runtime state onto `AGENT_CATALOG` (3 core agents): `listing_intelligence`, `price_prediction`, `trust_fraud_detection` — so Overview/Settings never show "0 of 0 active".

### File map

| File | Role |
|---|---|
| `src/App.tsx` | Shell + session gate + all state/handlers/loadData; renders LoginView or Sidebar/Topbar/views/Toast/error banner/loading panel |
| `src/api/client.ts` | API layer: `API_BASE_URL` (from `VITE_API_BASE_URL` in `.env`, default `http://127.0.0.1:8000`), `API_HOST`, `USE_MOCK_DATA = false`, `ApiError` (fields not param-props), `endpoints` (`/auth/login`, `/admin/overview\|users\|listings\|ai-agents`), JWT helpers (`getAuthToken`, `readAdminSession`, `persistAdminSession`, `clearAdminSession`, `loginAdmin`), `request<T>()` (Bearer on `/admin/*`; 401 → friendly message), `api.get/post/patch/remove`, wire types (`WireUser/Listing/Agent/Overview/RecentFlag`), adapters (`adaptUser/Listing/Agent/Agents/Overview`, `asArray` accepts bare array or `{data:[]}`), `apiErrorMessage`, fetchers (`fetchOverview/Users/Listings/Agents`), mutations (`setUserStatus`, `approveListing`, `removeListing`, `setAgentEnabled`) |
| `src/vite-env.d.ts` | `ImportMetaEnv` with `VITE_API_BASE_URL?` |
| `.env` / `.env.example` | `VITE_API_BASE_URL=https://campusmart-api-zia4.onrender.com` |
| `src/data/mock.ts` | Domain model (file name kept; seeds deleted): `ViewId`, `User`/`UserStatus`, `Listing`/`ListingStatus`/`ListingCategory`(+`other`)/`ListingFlag`, `FlaggedTransaction`, `Agent`, `Service`, `OverviewMetrics` (`{totalActiveUsers, listingsToday, flaggedCount}` — no delta fields), `AGENT_CATALOG` (3 core snake_case ids + display metadata), `PLACEHOLDER_SERVICES` (latency `null`), `LISTING_DELETE_TRUST_PENALTY` (0.5), `categoryLabel`, `priceDeviation()`, `TRUST_SCALE_MAX`, `trustBand`, `trustPercent`, `formatTrustScore`, `overallServiceState`, `stateTone/Label` |
| `src/lib/format.ts` | `initials()`, `formatMoney()`, `formatDate()` (ISO → "14 Oct 2026", returns raw on parse failure, "—" on empty) |
| `src/index.css` | Tailwind v4 `@theme` tokens (see §4) + utilities + animations |
| `src/components/auth/LoginView.tsx` | Full-page login gate; email/password → `onLogin`; error alert; "Fill demo admin credentials" helper (`aditya.jadhav@campus.edu` / `password123`) |
| `src/components/icons.tsx` | Inline stroke icons incl. Tag/Book/Laptop/Chair/Bike/Box/Trash/Ban/Refresh/SignOut |
| `src/components/layout/Sidebar.tsx` | Dark rail nav; props: `current`, `onNavigate`, `open`, `onClose`, `flaggedCount` (from `metrics.flaggedCount`), `flaggedListings`, `pausedAgents`, `backend {connected,label}`, `adminEmail`, `onSignOut`; footer admin card (email + Sign out button) + backend status dot (`bg-success` when connected) |
| `src/components/layout/Topbar.tsx` | Props: `title`, `subtitle`, `onOpenMenu`, `health {tone,label}`, `onOpenHealth`, `dataMode: 'live' \| 'offline'` (chip "Live API"/"Offline"), `onRefresh`, `refreshing` (spinner + "Refreshing…" label) |
| `src/components/views/OverviewView.tsx` | Metrics from live `/admin/overview` (`flaggedCount` on the flag card; no delta contexts — MetricCard `context` is optional), queue (ack), agents, services; ack copy says session-local; fraud warnings look up `trust_fraud_detection` |
| `src/components/views/ListingsView.tsx` | Moderation: tabs All/Flagged(by AI, critical count)/Active/Sold; desktop table (`min-w-[920px]`, flagged rows tinted `bg-critical-soft/40`); mobile stacked cards; empty states; Delete/Ban `ConfirmDialog`s (delete dialog shows exact trust consequence on 0–5 scale); mounts FlagInspector; approve wrapper closes drawer (`setSelectedId(null)`); footer "Approving clears the flag · deleting lowers the seller's trust score." |
| `src/components/listings/FlagInspector.tsx` | Right drawer z-[60], `max-w-[470px]`; Escape handler skips when `[data-confirm]` present; body scroll lock; sections: identity, pricing, seller (Open in Users, 0–5 trust bar), AI trust reason, record; footer: Approve (disabled unless `status==='flagged'`), Delete, Ban seller (disabled when seller blocked/missing) |
| `src/components/listings/ListingThumb.tsx` | Category-tinted tile (incl. `other`) or dashed "No image" (`hasImage: false`); sizes sm/lg |
| `src/components/views/UsersView.tsx` | Filters All/Active/Blocked + search; desktop table + mobile cards; Block/Unblock with ConfirmDialog; trust bar uses `trustPercent`/`trustBand`/`formatTrustScore` |
| `src/components/views/SettingsView.tsx` | Agent toggles (live PATCH) + placeholder service health (footer says probes not wired); "{n} of {agents.length} active" badge |
| `src/components/ui/*` | `Button` (variants: primary, outline, danger-outline, danger-quiet, danger-solid, ghost), `Badge`, `Toggle` (`role="switch"`), `Panel`, `MetricCard` (`context` optional), `ConfirmDialog` (z-[70], `data-confirm="true"`), `Toast` (z-40), `ServiceRow` |

## 4. Design tokens (src/index.css `@theme`)

- Canvas/surface/line neutrals; ink `#1d2939`-range, ink-muted `#6b7688`, ink-faint
- brand `#1d4ed8` (+ soft/strong variants), success/warning/critical (+ `-soft`)
- rail (dark sidebar + login backdrop), tabular utility (tabular-nums)
- Animations: `view-enter`, `toast-enter`, `drawer-enter`, `fade-in`, `animate-spin` (loading panel + refresh spinner); `--ease-out-soft`; `prefers-reduced-motion` block disables them
- **z-order**: topbar 30, sidebar backdrop 40 / aside 50, FlagInspector 60, ConfirmDialog 70, toast 40

## 5. API contract adapters (src/api/client.ts)

- Auth: `POST /auth/login` body `{email, password}`; token taken from `access_token` / `token` / `jwt` / `accessToken` (top-level or under `data`).
- Users: `{id, name, email, trust_score, status, created_at}` → `User` (`trust_score→trustScore` on **0–5 scale**, `created_at→joined` via `formatDate`, `listings` derived in App from the listings response counts).
- Listings: `{…, seller_id, listed_price→price, suggested_price→aiPrice, image_url→hasImage, trust_reason→flag}`; flag severity derived from price deviation (`>50%` → high); `detectedBy` inferred from reason keywords; unknown categories map to `other`.
- Agents: dict of booleans or list of `{key, enabled}` → always merged with `AGENT_CATALOG` (`listing_intelligence` / `price_prediction` / `trust_fraud_detection`). PATCH sends `{ enabled: boolean }`.
- Overview: `{total_active_users, listings_today, flagged_count, recent_flags[]}` → `OverviewMetrics` + `FlaggedTransaction[]` (lenient recent-flag adapter; severity defaults from confidence ≥85).
- All list fetchers go through `asArray` (bare array or `{data: []}` envelope) except agents (special dual-shape parser).

## 6. Verification status (as of 2026-10-15 / commit `4cd7a0d`)

- `npm run lint` clean (note: bootstrap effect must `await Promise.resolve()` before `loadData` or `react/set-state-in-effect` warns); `npm run build` clean (37 modules, ~290 kB JS / ~32 kB CSS).
- Auth gate + agent dual-shape normalization + trust 0–5 scale: **lint/build verified only** in the last session — not yet Playwright-verified against the live Render API. Next session should smoke-test: login (demo fill + bad password), Sign out, agents "N of 3 active" from both payload shapes, trust bars on a 4.9 vs 3.1 user.
- Playwright-verified **offline path** at 1440×920 (backend down, pre-auth-gate): loading panel → "Live data unavailable" banner + Retry Connection, `Offline` chip, "Backend unreachable" sidebar label, banner persists after Retry; only console errors are the expected `ERR_CONNECTION_REFUSED` network logs.
- Playwright-verified **live path** against a local contract stand-in on `127.0.0.1:8000` with CORS + OPTIONS preflight (script deleted after; pre-auth-gate): Live API chip, overview metrics/queue from `/admin/overview`, Refresh data button, inspector open on live listing, Approve → toast + flagged tab count 2→1, agent toggle → toast, **zero console/page errors**.
- Earlier (mock era) verifications still hold for pure presentation: mobile 390×844 stacked cards, no overflow, Escape/confirm-dialog layering, Open in Users prefill.

## 7. Next steps (suggested backlog — none started)

1. Smoke-test auth + Render live path in the browser (login, Sign out, agent counts, 0–5 trust bars).
2. Wire a service-health endpoint (e.g. `GET /admin/health`) to replace `PLACEHOLDER_SERVICES` and the "not wired" footers in Overview/Settings.
3. Backend endpoint for flag acknowledgement (currently session-local in OverviewView).
4. Optional: disable action buttons while `mutationInFlight` (guard already ignores double-clicks; UI just doesn't grey out).
5. Consider focus-trap/aria-focus management in the drawer (Escape + close button work; no full trap yet).
6. CORS: ensure the Render FastAPI app enables CORS for the dashboard origin(s) (`http://localhost:5273`, production host) — required for login + PATCH preflights.
7. Optional UX: refresh token / longer sessions; show admin name from the login response if the backend returns it.
