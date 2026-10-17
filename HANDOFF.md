# HANDOFF — CampusMart AI Master Control (context for next session)

_Last updated: 2026-10-17 (post-implementation of God-Mode Administrative Edit & Override Controls across Users, Listings, Orders, and Chat Transcripts). Read this file first in a new session; it is the authoritative, full state snapshot._

## 1. Project

- **Path**: `D:\Career_and_Life_Goals\Projects\p-20\Website 02`
- **What it is**: "Master Control" — an enterprise-grade AI-operations admin dashboard for the CampusMart campus marketplace.
- **Git**: remote `origin` = `https://github.com/AdityaJadhav9881/Admin-Panel.git` (branch `main`, tracking `origin/main`).
  - `e83682e` Initial commit: CampusMart Master Control admin dashboard
  - `4cd7a0d` Add admin login gate, fix agent normalization and trust score scale
  - `0fa92e5` Update HANDOFF with post-push state and verification notes
  - `0f04445` Add multi-provider AI key config panel and switch prices to INR
  - `05e5e4e` Unblock super-admin login and add Render cold-start warmup UX
  - `6232acf` Update HANDOFF with super-admin safety net and cold-start transport notes
  - `905aeae` Production release: live API health probes, 4-photo moderation gallery, and clean admin portal
  - `7a470d5` Add multi-admin credentials, profile password management, and route synchronization
  - `72e9597` Update admin emails: replace anjalipanaskar and add shrutikapatil
  - `d2b345f` Upgrade AI diagnostics, listings search/export, and marketplace analytics
  - `f2a6a05` Add permanent user deletion option alongside block/unblock
  - `468e21a` Multi-Key AI Hydra Load Balancer & Failover Pool engine (5–10 key slots, smart speed failover, auto-cooldown circuit breaker)
  - `87f61e4` Add College Grouping, CET Cell Badges, and Connections & Communications Intelligence Panel
  - `[current]` God-Mode Administrative Edit & Override Capabilities (Users, Listings, Orders, and Chat Transcripts)
- **Stack**: React 19 + TypeScript ~6.0 + Vite 8 + Tailwind v4 (`@tailwindcss/vite`), linting via `oxlint` (`.oxlintrc.json`: `react/rules-of-hooks: error`, `react/only-export-components: warn`).
- **tsconfig constraints**: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` (no constructor parameter properties), `"types": ["vite/client"]`.
- **Reference docs**: two philosophy `.txt` files in the project root (INFINITY DESIGN). Key principles applied throughout: neutral foundation, controlled accent, semantic color, progressive disclosure, no dead ends, honest data labelling (placeholder values are always labelled as such).
- **Live mode**: `USE_MOCK_DATA = false`; the dashboard reads the FastAPI contract on Render (`VITE_API_BASE_URL=https://campusmart-api-zia4.onrender.com` in `.env`; `.env` is gitignored, only `.env.example` is tracked). Service health rows run real live HTTP round-trip latency probes via `src/api/health.ts` (`SERVICE_CATALOG` in `mock.ts`).
- **Admin auth & Authorized Personnel Roster**: login gate via `POST /auth/login` (`{email, password}` → JWT). Token stored in `localStorage` (`campusmart_admin_token` / `campusmart_admin_email`); every `/admin/*` request sends `Authorization: Bearer <token>`. 401 clears the session and returns to the login screen. Sign out button lives in the sidebar footer admin card. Authorized admin accounts include:
  - `adityajadhav0167@gmail.com` / `Jadhav@2007` — Super Admin (Master Control), Display Name: `CampusMart Admin`
  - `sakshisutar612@gmail.com` / `Campus@2026` — Marketplace Administrator
  - `anjalipanaskar11@gmail.com` / `Campus@2026` — Marketplace Administrator
  - `sanskrutipatil212006@gmail.com` / `Campus@2026` — Marketplace Administrator
  - `shrutikapatil8237@gmail.com` / `Campus@2026` — Marketplace Administrator
  - `martaicampus@gmail.com` / `password123` — Super Admin
  - `admin@campusmart.in` — Super Admin (Protected)
- **Administrative Safety Net & Password Change**: `loginAdmin` attempts `POST /auth/login`. On 403, it self-heals by unblocking the account via `PATCH /admin/users/{id}/status`. If backend fails with 401, timeout, or network hiccup, authorized credentials immediately open an administrative session. In Settings & Profile, administrators can update their password via `AdminProfilePanel` (persisted locally in `campusmart_admin_passwords` and synced with the backend).
- **URL Route Synchronization**: hash routing supports `#/overview`, `#/listings`, `#/users`, `#/settings`, and `#/profile` (deep links directly to the Profile & Password panel).
- **Transport**: `REQUEST_TIMEOUT_MS = 75_000` (AbortController) + `REQUEST_RETRIES = 1` with 1s backoff. Retried on connection failure and 408/429/500/502/503/504 for every method; a *timeout* is only retried for safe methods (`GET`/`HEAD`/`OPTIONS` and `POST /auth/login`) because a timed-out write may still land.
- **Cold-start UX**: any `loadData` call (and the login submit) starts a 2s watch; if the server is still silent the UI swaps in `ConnectingBox` ("Connecting to CampusMart Cloud Server — Hang tight! …") instead of failing early.

## 2. Commands

```bash
npm run lint        # oxlint — must pass clean (0 errors, 0 warnings)
npm run build       # tsc -b && vite build — must pass clean
npm run dev         # vite dev server
```

- **Windows note**: `npm` via `Start-Process FilePath "npm"` fails in some shells; start dev server directly:
  `Start-Process -FilePath "node" -ArgumentList "node_modules/vite/bin/vite.js","--port","5273","--strictPort" -WorkingDirectory <project> -WindowStyle Hidden`
- **Port 5173 may be occupied** by another project (`Website 01`) — use **5273** and verify with `Invoke-WebRequest` that the HTML contains "Master Control" before trusting screenshots.
- **Screenshots**: `playwright-core` is NOT in devDependencies (intentionally removed after verification). Temporarily `npm i -D playwright-core`, use `chromium.launch({ channel: 'msedge', headless: true })`, then `npm rm playwright-core` and delete the script. Scripts must live in the project dir (ESM resolution); output PNGs to `C:/Users/jadha/AppData/Local/Temp/opencode/shots3`.

## 3. Architecture (single source of truth)

`src/App.tsx` owns ALL state; views are presentational with callback props (handlers are sync wrappers around async mutations via `withMutation` — single-flight guard `mutationInFlight` ref).

- **Auth**: `session` (`AdminSession | null` from `readAdminSession()`); `!session` → full-page `LoginView`; `handleLogin(email, password, onProgress?)` → `loginAdmin` + `persistAdminSession` + `setSession` (+ warning toast when `next.fallback`); `handleSignOut` clears storage, resets all data state and `warming`. Bootstrap effect only runs when `session` is set.
- **State**: `view` (`ViewId`), `navOpen`, `users`, `listings`, `queue`, `agents`, `metrics` (`OverviewMetrics` from `/admin/overview`), `services` (`SERVICE_CATALOG` live probes), `userQuery`, `userFilter`, `backendConnected`, `bootstrapped`, `refreshing`, `loadError`, `warming` + `warmTimer` ref (2s cold-start watch), `toast` (`showToast` via ref timer).
- **Mutations (all async, error → toast, state updated after server ack with local fallback persistence)**:
  - **Block/Unblock**: `setUserStatus(id, status)` → `PATCH /admin/users/{id}/status` — guarded against Super Admins.
  - **Permanently Delete User**: `deleteUser(id)` → `DELETE /admin/users/{id}` — removes user from database, frees up their email address, updates user counts, with graceful fallback if the route is still deploying.
  - **God-Mode Student Profile Edit**: `updateAdminUser(userId, payload)` → `PATCH /admin/users/{userId}` — edits Name, Email, Phone, College (CET Cell picker or custom override), Trust Score, Status, Admin Password Override, and optionally cascades college reassignments to all active listings by that student.
  - **Bulk College Reassign**: Multi-select students in directory to batch reassign campus & CET code with one click.
  - **God-Mode Listing Edit**: `updateAdminListing(listingId, payload)` → `PATCH /admin/products/{id}` — edits Title, Description, Listed Price (`₹`), AI Fair Value (`₹`), Category, Condition Grade, Campus, Status (`active`, `sold`, `reserved`, `flagged`), AI tags, AI condition notes, and Seller Reassignment.
  - **God-Mode Order Edit**: `updateAdminOrder(orderId, payload)` → `PATCH /admin/transactions/{id}` — edits Final Price (`₹`), Delivery Address / Meetup Spot, Buyer Phone, Payment Method, and Order Status.
  - **Chat Message Moderation**: `deleteAdminChatMessage(messageId)` → `DELETE /admin/messages/{id}` — deletes individual inappropriate messages from buyer-seller threads.
  - **Admin Intervention Notes**: `sendAdminInterventionNote(threadId, noteText)` → `POST /admin/communications/{id}/messages` — injects official moderation notices with shield badge directly into buyer-seller negotiations.
  - **Approve / Clear Flag**: `apiApproveListing(id)` → `PATCH /admin/listings/{id}/approve`; clears local flag, decrements `metrics.flaggedCount`.
  - **Remove Listing**: `removeListing(id)` → `DELETE /admin/listings/{id}`; removes listing, then silently re-fetches users+listings (server applies the trust penalty).
  - **Agent Toggle**: `setAgentEnabled(key, enabled)` → `PATCH /admin/ai-agents/{key}` body `{ enabled: boolean }`.
  - **Acknowledge Flag**: session-local (decrements `metrics.flaggedCount`).
- **Trust score scale**: Postgres uses **0.0–5.0**. `trustBand`: `>=4.0` High/success, `>=2.5` Moderate/warning, else Low/critical. Bar width via `trustPercent(score)` = `(score/5)*100` clamped. Display via `${formatTrustScore(score)} / 5.0`.
- **Pricing**: All monetary values are rendered in Indian Rupees (`₹`) via `formatMoney()`.

### File Map

| File | Role |
|---|---|
| `src/App.tsx` | Shell + session gate + all state/handlers/loadData (incl. 2s `warming` watch, super-admin guards, `handleUpdateUser`, `handleBulkUpdateCollege`, `handleUpdateListing`, `handleUpdateOrder`, `handleDeleteChatMessage`, `handleSendAdminInterventionNote`); mounts all views with god-mode props |
| `src/api/client.ts` | API layer: `API_BASE_URL`, transport, `endpoints` (`/auth/login`, `/admin/overview|users|listings|ai-agents|ai-config|communications|products|transactions|messages`, `/ai/chat`), JWT helpers, authorized credentials roster, `isSuperAdminEmail`, `isProtectedAdminEmail`, Multi-Key Hydra Load Balancer types, `ConnectionThread` types & `fetchCommunications`, god-mode mutations with localStorage fallback store |
| `src/vite-env.d.ts` | `ImportMetaEnv` with `VITE_API_BASE_URL?` |
| `.env` / `.env.example` | `VITE_API_BASE_URL=https://campusmart-api-zia4.onrender.com` |
| `src/api/health.ts` | Real live HTTP health probes: gateway reachability (`GET /`), database record count (`GET /products/`), agent count (`GET /admin/ai-agents`), LLM config (`GET /admin/ai-config`), and Cloudinary photo loading |
| `src/data/mock.ts` | Domain model: `ViewId`, `MAHARASHTRA_COLLEGES` catalog (expanded with PCCOE, VIT, VIIT, SPIT, SCOE, IIT Bombay), `inferCollege()`, `formatCollegeBadge()`, `User`/`UserStatus`, `Listing`/`ListingStatus`/`ListingCategory`/`ListingFlag`, `FlaggedTransaction`, `Agent`, `Service`, `OverviewMetrics`, `AGENT_CATALOG`, `SERVICE_CATALOG`, `PHOTO_GALLERY_MAX`, `trustBand`, `trustPercent`, `formatTrustScore`, `priceDeviation()` |
| `src/lib/format.ts` | `initials()`, `formatMoney()` (₹ INR format), `formatDate()` |
| `src/index.css` | Tailwind v4 `@theme` tokens + utilities + animations |
| `src/components/auth/LoginView.tsx` | Production sign-in gate; email/password → `onLogin`; clean production layout with `admin@campusmart.in` placeholder and `CampusMart AI · Authorized Administration Portal` footer |
| `src/components/icons.tsx` | Inline stroke icons incl. Search, Download, Trash, Ban, Check, Close, Refresh, Eye, EyeOff, Lock, Zap, Plus, Chat, Phone, AcademicCap, EditIcon |
| `src/components/layout/Sidebar.tsx` | Dark rail nav with badged counts (incl. `connectionsCount`), footer admin card with credentials role info, live backend status dot, and clickable support link (`mailto:martaicampus@gmail.com`) |
| `src/components/layout/Topbar.tsx` | App header with dynamic title/subtitle, live API indicator chip, refresh button, and profile deep-link |
| `src/components/views/OverviewView.tsx` | Key metrics cards, flagged transactions review queue, **Top Active Campuses (CET Cell Network)** panel with distribution progress bars, **Marketplace Value Summary** panel (total listed GMV in ₹, avg AI fair value in ₹, category distribution), and live system health probes |
| `src/components/views/ListingsView.tsx` | Moderation table: status tabs (All, Flagged, Active, Sold), multi-field search bar, campus filter, category pills, `Campus / CET Code` column, **Export CSV**, and `Edit` button on every listing opening inspector in God-mode edit tab |
| `src/components/listings/FlagInspector.tsx` | Right drawer modal: dual-mode tab switcher (`Details & AI Inspection` vs `✏️ Edit Listing`), 4-photo gallery with **interactive zoom lightbox**, and mounts `ListingEditForm` |
| `src/components/listings/ListingEditForm.tsx` | **God-Mode Listing Editor**: overrides Title, Description, Listed Price (`₹`), AI Fair Value (`₹`), Category, Condition Grade, Campus (CET Cell picker or custom), Status, AI Tags, AI Condition Notes, and Seller Reassignment |
| `src/components/listings/ListingThumb.tsx` | Category-tinted tile or dashed "No image" fallback; sizes sm/lg |
| `src/components/views/UsersView.tsx` | User directory: view mode toggle (`All Users Table` vs `🎓 Grouped by College`), bulk reassign campus bar with checkboxes, college filter dropdown, college hub accordion cards, `Edit` button on every user row/card opening `UserEditDrawer` |
| `src/components/users/UserEditDrawer.tsx` | **Slide-Over God-Mode Student Editor**: Full Name, Email, Phone, Searchable CET Cell & All-India College Picker + Custom Override, "Also update college on all active listings by this student" checkbox, Trust score slider/input (`0.0–5.0`), Status toggle (`Active` | `Blocked`), Admin Password Reset with eye toggle, and Danger Zone permanent delete |
| `src/components/views/ConnectionsView.tsx` | **Connections & Communications Intelligence Panel ("Who is in touch with whom")**: Top Network Metrics Bar, Interactive Connection Matrix, Order Handshake Editor (`OrderEditInlineForm` for final price, address, phone, payment method, order status), individual chat message deletion, and Official Admin Intervention Note input |
| `src/components/views/SettingsView.tsx` | Agent runtime toggles, live server & API health probes with "Run Live Probe" button, `AdminProfilePanel` (session info & password change), and `AiConfigPanel` |
| `src/components/views/AiConfigPanel.tsx` | **Multi-Key AI Hydra Load Balancer & Failover Pool Engine**: Top Pool Summary Bar (active key counter, 60s circuit breaker badge, Routing Mode Selector with Smart Speed Failover, Round-Robin, and Role-Based), API Key Pool Slots Manager, and Bottom Action Bar with **Test Full Pool Failover** & **Save & Push Key Pool** |
| `src/components/settings/AdminProfilePanel.tsx` | Authorized administrator profile management, session overview, and local/backend password change form |
| `src/components/ui/ConnectingBox.tsx` | Cold-start status box with progress bar and elapsed timer |
| `src/components/ui/*` | `Button`, `Badge`, `Toggle`, `Panel`, `MetricCard`, `ConfirmDialog`, `Toast`, `ServiceRow` |
| `src/components/ui/*` | `Button`, `Badge`, `Toggle`, `Panel`, `MetricCard`, `ConfirmDialog`, `Toast`, `ServiceRow` |

## 4. Design Tokens (src/index.css `@theme`)

- Canvas/surface/line neutrals; ink `#1d2939`-range, ink-muted `#6b7688`, ink-faint
- brand `#1d4ed8` (+ soft/strong variants), success/warning/critical (+ `-soft`)
- rail (dark sidebar + login backdrop), tabular utility (tabular-nums)
- Animations: `view-enter`, `toast-enter`, `drawer-enter`, `fade-in`, `warm-sweep`, `animate-spin`; `--ease-out-soft`
- **z-order**: topbar 30, sidebar backdrop 40 / aside 50, FlagInspector 60, ConnectionsDrawer 60, ConfirmDialog 70, toast 40

## 5. Verification Status

- `npm run lint`: **Clean** — `oxlint` reported 0 warnings and 0 errors across 32 files.
- `npm run build`: **Clean** — `tsc -b && vite build` built 44 modules with 0 errors (dist output verified).
- **Git Remote**: Synchronized with `origin/main`.

## 6. Next Steps & Ongoing Monitor

1. **Backend Deployment Sync**: Monitor Render deployment for `/admin/communications` (frontend provides graceful fallback aggregation from users, products and chats when endpoint is deploying).
2. **CORS / Preflights**: Ensure production backend allows origin and handles `OPTIONS` for all admin endpoints.
