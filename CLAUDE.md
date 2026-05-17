# CLAUDE.md — Notion Time Tracker

## Quick Start

```powershell
# Docker (production-like)
docker compose up --build        # Build + start both services
docker compose up --build -d     # Detached mode

# Local dev (faster iteration)
cd backend; npm run dev          # Terminal 1 — nodemon on :3001
cd frontend; npm run dev         # Terminal 2 — Vite on :3000, proxies /api → :3001
```

## Platform Notes

- **Windows environment** — use PowerShell, not Bash (Bash produces no output in this setup)
- **Glob/search timeouts** — the `node_modules` folder causes ripgrep timeouts; use PowerShell `Get-ChildItem` for file listing when glob fails

## Architecture

| Layer | Stack | Port |
|-------|-------|------|
| Frontend | React 19, Vite 6, Tailwind CSS 4, React Router 7 | 3000 |
| Backend | Node.js, Express 5 | 3001 |
| Database | SQLite (file-based) | — |
| External | Notion API (@notionhq/client 3.x) | — |
| Auth | Simple password via `APP_PASSWORD` env var | — |

Notion is the source of truth for clients/projects/tasks. The local SQLite DB is a cache + stores time entries. Sync is manual (triggered by user).

## Key Files

```
backend/src/
  app.js              — Express entry point + auth middleware
  database.js         — SQLite schema + migrations (ALTER TABLE ADD COLUMN style)
  routes/index.js     — Router mount
  routes/tasks.js     — Task queries (Quick Start, filtering)
  routes/timeEntries.js — Timer start/stop/CRUD
  routes/sync.js      — Notion sync orchestration
  services/notionService.js — Notion API calls + sync logic

frontend/src/
  App.jsx             — Layout + route definitions
  services/api.js     — Axios client (baseURL: /api)
  contexts/TimerContext.jsx — Active timer state, favicon, doc title
  contexts/ToastContext.jsx — Toast notifications + undo
  pages/HomePage.jsx  — Dashboard: Quick Start + Timeline
  components/TimelineView.jsx — Day timeline (drag, resize, create entries)
  components/DopamineTimer.jsx — XP/level gamified timer
  utils/timeUtils.js  — Date helpers (Pacific/Auckland timezone)

frontend/nginx.conf   — Production reverse proxy (proxies /api → backend:3001)
docker-compose.yml    — Container orchestration
```

## Database Schema

```
Clients (id, notionId, name, status)
  → Projects (id, notionId, name, clientId, notionClientId, budgetedTime, hourlyRate, status, iconType, iconValue, color)
    → Tasks (id, notionId, name, projectId, notionProjectId, status, isBillable, beenBilled, assignee, deadline, taskOrPage)
      → TimeEntries (id, taskId, notionTaskId, startTime, endTime, duration, isSyncedToNotion)
```

- `notionId` = Notion page UUID (UNIQUE, used for sync dedup)
- `duration` is in seconds
- Timestamps are ISO 8601 strings
- FKs (`clientId`, `projectId`) resolved by `updateLocalRelationalIds()` after sync

## Important Conventions

- **Timezone**: All date logic uses `Pacific/Auckland` (NZ). Check boundary logic carefully.
- **Currency**: NZD with 15% GST. Time rounded up to nearest 0.25 hrs for billing.
- **Assignee filter**: `tasks.js` filters by `'%Josue Munro%'` (hardcoded).
- **Icon caching**: Notion file URLs expire ~1hr, so icons download to `backend/assets/icons/` on sync.
- **No auto-sync**: Manual only to avoid Notion rate limits.
- **Timeline versioning**: When modifying `TimelineView.jsx`, update the version log at the top.

## Deployment

- **Live URL**: https://timer.webdune.co.nz
- **Platform**: Railway (Docker deployment, runs as root via `RAILWAY_RUN_UID=0`)
- **CI/CD**: Auto-deploys on push to `master`
- **Persistent volume**: Mounted at `/data` for SQLite file
- **Port**: Railway injects `PORT` env var (used over `BACKEND_PORT`)
- **Auth**: `APP_PASSWORD` env var — single password for the whole site
- **DNS**: CNAME `timer.webdune.co.nz` → Railway-provided target (SSL auto-provisioned)

## Environment Variables

```env
BACKEND_PORT=3001
FRONTEND_PORT=3000
DATABASE_PATH=/data/notion_time_tracker.sqlite
APP_PASSWORD=<required in production>

NOTION_API_KEY=secret_...
NOTION_CLIENTS_DB_ID=<uuid>
NOTION_PROJECTS_DB_ID=<uuid>
NOTION_TASKS_DB_ID=<uuid>
NOTION_USER_ID=<uuid>          # Optional — filters tasks by assignee
```

## Common Pitfalls

- Notion property names are **exact-match** — "In Progress" vs "Doing" matters
- SQLite migrations use `ALTER TABLE ADD COLUMN` which silently no-ops if column exists
- Frontend proxy: dev = Vite proxy, production = nginx reverse proxy
- Timer state lives in `TimerContext` + backend; stopping re-fetches timeline data
- The `TimelineView` component uses refs for drag state to avoid stale closures
