# Master Control — CampusMart AI

Internal admin dashboard for CampusMart AI. React + TypeScript + Tailwind CSS (Vite).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run lint     # oxlint
```

## Structure

```
src/
  App.tsx                  shell + single source of truth (useState) for all views
  data/mock.ts             domain types, mock records, derived-state helpers
  components/
    layout/                Sidebar, Topbar
    ui/                    Button, Badge, Toggle, Panel, MetricCard, ConfirmDialog, Toast, ServiceRow
    views/                 OverviewView, UsersView, SettingsView
```

## Views

- **Overview** — metric cards (active users, listings today, flagged transactions), an
  expandable flag queue with acknowledge action, and system status.
- **User management** — searchable/filterable directory with trust scores and
  Block (confirmed) / Unblock actions.
- **AI & API settings** — per-agent pause/resume switches and server health snapshot.

All views are connected to the live FastAPI backend with real-time health probes,
multi-provider AI engine configuration, and Cloudinary image moderation.

Design follows the INFINITY DESIGN philosophy in this folder: neutral foundation,
controlled accents, semantic colour only, progressive disclosure, no dead ends.
