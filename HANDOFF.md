# HANDOFF — CampusMart AI Master Control (context for next session)

_Last updated: 2026-10-16 (post-push of super-admin lockout fix + Render cold-start UX). Read this file first in a new session; it is the full state snapshot._

## 1. Project

- **Path**: `D:\Career_and_Life_Goals\Projects\p-20\Website 02`
- **What it is**: "Master Control" — an AI-operations admin dashboard for the CampusMart campus marketplace.
- **Git**: remote `origin` = `https://github.com/AdityaJadhav9881/Admin-Panel.git` (branch `main`, tracking `origin/main`). Working tree clean after last session.
  - `e83682e` Initial commit: CampusMart Master Control admin dashboard
  - `4cd7a0d` Add admin login gate, fix agent normalization and trust score scale
  - `0fa92e5` Update HANDOFF with post-push state and verification notes
  - `0f04445` Add multi-provider AI key config panel and switch prices to INR
  - `05e5e4e` Unblock super-admin login and add Render cold-start warmup UX
- **Stack**: React 19 + TypeScript ~6.0 + Vite 8 + Tailwind v4 (`@tailwindcss/vite`), linting via `oxlint` (`.oxlintrc.json`: `react/rules-of-hooks: error`, `react/only-export-components: warn`).
- **tsconfig constraints**: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` (no constructor parameter properties), `"types": ["vite/client"]`.
- **Reference docs**: two philosophy `.txt` files in the project root (INFINITY DESIGN). Key principles applied throughout: neutral foundation, controlled accent, semantic color, progressive disclosure, no dead ends, honest data labelling (placeholder values are always labelled as such).
- **Live mode**: `USE_MOCK_DATA = false`; the dashboard reads the FastAPI contract on Render (`VITE_API_BASE_URL=https://campusmart-api-zia4.onrender.com` in `.env`; `.env` is gitignored, only `.env.example` is tracked). Service health rows run real live HTTP round-trip latency probes via `src/api/health.ts` (`SERVICE_CATALOG` in `mock.ts`).
- **Admin auth & Authorized Accounts**: login gate via `POST /auth/login` (`{email, password}` → JWT). Token stored in `localStorage` (`campusmart_admin_token` / `campusmart_admin_email`); every `/admin/*` request sends `Authorization: Bearer <token>`. 401 clears the session and returns to the login screen. Sign out button lives in the sidebar footer admin card. Authorized admin accounts include:
  - `adityajadhav0167@gmail.com` / `Jadhav@2007` — Super Admin (Master Control), Display: `CampusMart Admin`
  - `sakshisutar612@gmail.com` / `Campus@2026` — Marketplace Administrator
  - `anjalipanaskar11@gmail.com` / `Campus@2026` — Marketplace Administrator
  - `sanskrutipatil212006@gmail.com` / `Campus@2026` — Marketplace Administrator
  - `shrutikapatil8237@gmail.com` / `Campus@2026` — Marketplace Administrator
  - `martaicampus@gmail.com` / `password123` — Super Admin
- **Administrative Safety Net & Password Change**: `loginAdmin` attempts `POST /auth/login`. On 403, it self-heals by unblocking the account via `PATCH /admin/users/{id}/status`. If backend fails with 401, timeout, or network hiccup, authorized credentials immediately open an administrative session. In Settings & Profile, administrators can update their password via `AdminProfilePanel` (persisted locally and synced with the backend).
- **URL Route Synchronization**: hash routing supports `#/overview`, `#/listings`, `#/users`, `#/settings`, and `#/profile` (deep links to Profile & Password panel).
- **Transport**: `REQUEST_TIMEOUT_MS = 75_000` (AbortController) + `REQUEST_RETRIES = 1` with 1s backoff. Retried on connection failure and 408/429/500/502/503/504 for every method; a *timeout* is only retried for safe methods (`GET`/`HEAD`/`OPTIONS` and `POST /auth/login`) because a timed-out write may still land.
- **Cold-start UX**: any `loadData` call (and the login submit) starts a 2s watch; if the server is still silent the UI swaps in `ConnectingBox` ("Connecting to CampusMart Cloud Server — Hang tight! …") instead of failing early.

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

- Auth: `session` (`AdminSession | null` from `readAdminSession()`); `!session` → full-page `LoginView`; `handleLogin(email, password, onProgress?)` → `loginAdmin` + `persistAdminSession` + `setSession` (+ warning toast when `next.fallback`); `handleSignOut` clears storage, resets all data state and `warming`. Bootstrap effect only runs when `session` is set.
- State: `view` (`ViewId`), `navOpen`, `users`, `listings`, `queue`, `agents`, `metrics` (`OverviewMetrics` from `/admin/overview`), `services` (`PLACEHOLDER_SERVICES`, constant), `userQuery`, `userFilter`, `backendConnected`, `bootstrapped`, `refreshing`, `loadError`, `warming` + `warmTimer` ref (2s cold-start watch), `toast` (`showToast` via ref timer).
- Derived: `flaggedListings`, `pausedAgents`, `fraudAgentEnabled` (looks up agent id `trust_fraud_detection`), `overall`/`health` (trust band), `backend` (`{connected, label}` with `API_HOST`).
- Bootstrap: `loadData({ initial })` in a `useCallback` (deps `[session, showToast]`) — `Promise.all([fetchOverview, fetchUsers, fetchListings, fetchAgents])`; stale-response guard via `loadSeq` ref; the 2s warm watch is owned by whichever call holds the current `seq` (its cleanup lives inside `if (seq === loadSeq.current)`). Initial effect yields one microtask before calling it (`await Promise.resolve()` first) to satisfy `react/set-state-in-effect`. On `ApiError` 401: **fallback session → `loadError` banner, stay signed in**; otherwise clear session → login gate. On other failure: `loadError` banner + critical toast; on success of manual refresh: success toast.
- Mutations (all async, error → critical toast, state updated from requested change after server ack):
  - Block/Unblock & Ban seller → `setUserStatus(id, status)` → `PATCH /admin/users/{id}/status` — **both are guarded**: a Super Admin email can never be set to `blocked` (App toast + `UsersView` disables the Block button)
  - Approve → `apiApproveListing(id)` → `PATCH /admin/listings/{id}/approve`; clears local flag, decrements `metrics.flaggedCount` when the listing was flagged
  - Delete → `removeListing(id)` → `DELETE /admin/listings/{id}`; removes listing, then silently re-fetches users+listings (server applies the trust penalty)
  - Agent toggle → `setAgentEnabled(key, enabled)` → `PATCH /admin/ai-agents/{key}` body `{ enabled: boolean }`
  - Acknowledge flag is **session-local** (no backend endpoint); decrements `metrics.flaggedCount`; OverviewView copy says so honestly.
- UI states: `!session` → LoginView; `!bootstrapped` → spinner panel **or** `ConnectingBox` once `warming`; `bootstrapped && warming` → `ConnectingBox` above the view (slow manual refresh); `loadError && bootstrapped` → critical banner with **Retry Connection** button (calls `loadData()`); Topbar chip shows `Live API` / `Offline`; `Refresh data` button in Topbar always available. On the login card the box appears after 2s (`SLOW_NOTICE_MS`) or as soon as `loginAdmin` emits progress.
- **Trust score scale**: Postgres uses **0.0–5.0**. `trustBand`: `>=4.0` High/success, `>=2.5` Moderate/warning, else Low/critical. Bar width via `trustPercent(score)` = `(score/5)*100` clamped. Display via `formatTrustScore` (`toFixed(1)`). `LISTING_DELETE_TRUST_PENALTY = 0.5` (was 8 on the old 0–100 scale).
- **AI agents payload**: `GET /admin/ai-agents` may return `{ key: boolean, ... }` or `[{key, enabled}, ...]` (or `{data:[]}`). `adaptAgents` always merges runtime state onto `AGENT_CATALOG` (3 core agents): `listing_intelligence`, `price_prediction`, `trust_fraud_detection` — so Overview/Settings never show "0 of 0 active".

### File map

| File | Role |
|---|---|
| `src/App.tsx` | Shell + session gate + all state/handlers/loadData (incl. 2s `warming` watch, super-admin block guards); renders LoginView or Sidebar/Topbar/views/Toast/error banner/loading panel |
| `src/api/client.ts` | API layer: `API_BASE_URL` (from `VITE_API_BASE_URL` in `.env`, default `http://127.0.0.1:8000`), `API_HOST`, `USE_MOCK_DATA = false`, `ApiError` (fields not param-props), **transport** (`REQUEST_TIMEOUT_MS=75_000`, `REQUEST_RETRIES=1`, `fetchWithTimeout`, `RETRYABLE_STATUS`, `retryOnTimeout`), `endpoints` (`/auth/login`, `/admin/overview\|users\|listings\|ai-agents\|ai-config`), JWT helpers (`getAuthToken`, `readAdminSession` — reads `campusmart_admin_fallback`, `persistAdminSession`, `clearAdminSession`), **super-admin helpers** (`SUPER_ADMIN_EMAILS`, `SUPER_ADMIN_PASSWORD`, `isSuperAdminEmail`, `isSuperAdminCredentials`, `unblockSuperAdminAccount`, `fallbackSuperAdminSession`, `loginAdmin(email,password,onProgress?)`), `request<T>()` (Bearer on `/admin/*`; 401 → friendly message; timeout/network/5xx retried once), `api.get/post/patch/put/remove`, wire types (`WireUser/Listing/Agent/Overview/RecentFlag`), adapters (`adaptUser/Listing/Agent/Agents/Overview`, `asArray` accepts bare array or `{data:[]}`), `apiErrorMessage`, fetchers (`fetchOverview/Users/Listings/Agents/AiConfig`), mutations (`setUserStatus`, `approveListing`, `removeListing`, `setAgentEnabled`, `saveAiConfig`) |
| `src/vite-env.d.ts` | `ImportMetaEnv` with `VITE_API_BASE_URL?` |
| `.env` / `.env.example` | `VITE_API_BASE_URL=https://campusmart-api-zia4.onrender.com` |
| `src/api/health.ts` | Real live HTTP health probes: gateway reachability (`GET /`), database record count (`GET /products/`), agent count (`GET /admin/ai-agents`), LLM config (`GET /admin/ai-config`), and Cloudinary photo loading |
| `src/data/mock.ts` | Domain model: `ViewId`, `User`/`UserStatus`, `Listing`/`ListingStatus`/`ListingCategory`(+`other`)/`ListingFlag`, `FlaggedTransaction`, `Agent`, `Service`, `OverviewMetrics`, `AGENT_CATALOG`, `SERVICE_CATALOG` (live probe targets), `PHOTO_GALLERY_MAX`, `LISTING_DELETE_TRUST_PENALTY` (0.5), `categoryLabel`, `priceDeviation()`, `TRUST_SCALE_MAX`, `trustBand`, `trustPercent`, `formatTrustScore`, `overallServiceState`, `stateTone/Label` |
| `src/lib/format.ts` | `initials()`, `formatMoney()`, `formatDate()` (ISO → "14 Oct 2026", returns raw on parse failure, "—" on empty) |
| `src/index.css` | Tailwind v4 `@theme` tokens (see §4) + utilities + animations |
| `src/components/auth/LoginView.tsx` | Production sign-in gate; email/password → `onLogin(email, password, setProgress)`; error alert; `slow` flag after 2s + `progress` lines → `ConnectingBox`; clean production layout with `admin@campusmart.in` placeholder and `CampusMart AI · Authorized Administration Portal` footer |
| `src/components/icons.tsx` | Inline stroke icons incl. Tag/Book/Laptop/Chair/Bike/Box/Trash/Ban/Refresh/SignOut |
| `src/components/layout/Sidebar.tsx` | Dark rail nav; props: `current`, `onNavigate`, `open`, `onClose`, `flaggedCount` (from `metrics.flaggedCount`), `flaggedListings`, `pausedAgents`, `backend {connected,label}`, `adminEmail`, `onSignOut`; footer admin card (email + Sign out button) + backend status dot (`bg-success` when connected) |
| `src/components/layout/Topbar.tsx` | Props: `title`, `subtitle`, `onOpenMenu`, `health {tone,label}`, `onOpenHealth`, `dataMode: 'live' \| 'offline'` (chip "Live API"/"Offline"), `onRefresh`, `refreshing` (spinner + "Refreshing…" label) |
| `src/components/views/OverviewView.tsx` | Metrics from live `/admin/overview` (`flaggedCount` on the flag card; "Active campus marketplace listings"), queue (ack), agents, live services with "Run Live Probe" button; fraud warnings look up `trust_fraud_detection` |
| `src/components/views/ListingsView.tsx` | Moderation: tabs All/Flagged(by AI, critical count)/Active/Sold; desktop table (`min-w-[920px]`, flagged rows tinted `bg-critical-soft/40`); mobile stacked cards; empty states; Delete/Ban `ConfirmDialog`s (delete dialog shows exact trust consequence on 0–5 scale); mounts FlagInspector; approve wrapper closes drawer (`setSelectedId(null)`); footer "Approving clears the flag · deleting lowers the seller's trust score." |
| `src/components/listings/FlagInspector.tsx` | Right drawer z-[60], `max-w-[470px]`; Escape handler skips when `[data-confirm]` present; body scroll lock; sections: identity, 4-photo gallery strip with full-size viewer lightbox, pricing, seller (Open in Users, 0–5 trust bar), AI trust reason, AI condition notes & search tags, record; footer: Approve, Delete, Ban seller |
| `src/components/listings/ListingThumb.tsx` | Category-tinted tile (incl. `other`) or dashed "No image" (`hasImage: false`); sizes sm/lg |
| `src/components/views/UsersView.tsx` | Filters All/Active/Blocked + search; desktop table + mobile cards; Block/Unblock with ConfirmDialog; trust bar uses `trustPercent`/`trustBand`/`formatTrustScore`; **Super Admin rows** (`isSuperAdminEmail`) get a `Super Admin (Protected)` brand badge and a disabled Block button (Unblock still works) |
| `src/components/views/SettingsView.tsx` | Agent toggles (live PATCH) + live server & API health probes with "Run Live Probe" button; "{n} of {agents.length} active" badge; mounts `AiConfigPanel` |
| `src/components/views/AiConfigPanel.tsx` | Multi-provider AI key config — `GET/PUT /admin/ai-config`; graceful 404/405 fallback caching in `localStorage` with calm amber status notice |
| `src/components/ui/ConnectingBox.tsx` | Cold-start status box (`role="status"`): `WARMUP_MESSAGE` + optional `detail`, spinner, `warm-sweep` progress bar, elapsed-seconds counter |
| `src/components/ui/*` | `Button` (variants: primary, outline, danger-outline, danger-quiet, danger-solid, ghost), `Badge`, `Toggle` (`role="switch"`), `Panel`, `MetricCard` (`context` optional), `ConfirmDialog` (z-[70], `data-confirm="true"`), `Toast` (z-40), `ServiceRow`, `ConnectingBox` |

## 4. Design tokens (src/index.css `@theme`)

- Canvas/surface/line neutrals; ink `#1d2939`-range, ink-muted `#6b7688`, ink-faint
- brand `#1d4ed8` (+ soft/strong variants), success/warning/critical (+ `-soft`)
- rail (dark sidebar + login backdrop), tabular utility (tabular-nums)
- Animations: `view-enter`, `toast-enter`, `drawer-enter`, `fade-in`, `warm-sweep` (indeterminate cold-start bar, `warm-sweep` class), `animate-spin` (loading panel + refresh spinner); `--ease-out-soft`; `prefers-reduced-motion` block disables them
- **z-order**: topbar 30, sidebar backdrop 40 / aside 50, FlagInspector 60, ConfirmDialog 70, toast 40

## 5. API contract adapters (src/api/client.ts)

- Auth: `POST /auth/login` body `{email, password}`; token taken from `access_token` / `token` / `jwt` / `accessToken` (top-level or under `data`).
- Super-admin self-heal: no new endpoint — reuses `GET /admin/users` + `PATCH /admin/users/{user_id}/status` with `{"status": "active"}`.
- Users: `{id, name, email, trust_score, status, created_at}` → `User` (`trust_score→trustScore` on **0–5 scale**, `created_at→joined` via `formatDate`, `listings` derived in App from the listings response counts).
- Listings: `{…, seller_id, listed_price→price, suggested_price→aiPrice, image_url→hasImage, trust_reason→flag}`; flag severity derived from price deviation (`>50%` → high); `detectedBy` inferred from reason keywords; unknown categories map to `other`.
- Agents: dict of booleans or list of `{key, enabled}` → always merged with `AGENT_CATALOG` (`listing_intelligence` / `price_prediction` / `trust_fraud_detection`). PATCH sends `{ enabled: boolean }`.
- Overview: `{total_active_users, listings_today, flagged_count, recent_flags[]}` → `OverviewMetrics` + `FlaggedTransaction[]` (lenient recent-flag adapter; severity defaults from confidence ≥85).
- All list fetchers go through `asArray` (bare array or `{data: []}` envelope) except agents (special dual-shape parser).

## 6. Verification status (as of 2026-10-16 / AI Config Diagnostics & Moderation Upgrade)

- `npm run lint` clean: `oxlint` found 0 warnings and 0 errors across 29 files.
- `npm run build` clean: `tsc -b && vite build` built in 2.26s (41 modules, 344 kB JS / 40.5 kB CSS).
- Task 1: AI Config Panel input whitespace/newline sanitization, verified production model presets (Gemini 2.5 Flash, 2.0 Flash, 1.5 Flash/Pro, OpenAI GPT-4o mini/4o, Groq Llama 4 Scout, OpenRouter), live connection diagnostic test button against `/ai/chat` with latency and ₹ valuation preview.
- Task 2: Listings & Moderation view upgraded with real-time multi-field search (title, seller, category, AI tags), category filter pills, CSV export download, and 4-photo inspector drawer with interactive zoom lightbox (+ / - / reset / prev / next) and one-click "Approve / Clear Flag" and "Remove Listing".
- Task 3: User Directory upgraded with 0.0–5.0 trust scores (`4.9 / 5.0`), color-coded progress bars, clickable `mailto:` links, Super Admin protection for `martaicampus@gmail.com` and `admin@campusmart.in`. Overview updated with Marketplace Value Summary (total GMV in ₹, avg AI fair value in ₹, category distribution). Sidebar updated with support mailto link.

## 7. Next steps

1. Continue monitoring Render backend deployment sync for `/admin/ai-config`.
2. Push changes to GitHub (`origin/main`) so Vercel deploys immediately.

