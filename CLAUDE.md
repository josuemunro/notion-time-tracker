# CLAUDE.md — Notion Time Tracker

## Quick Start

```powershell
# Docker (production-like)
docker compose up --build        # Build + start both services
docker compose up --build -d     # Detached mode

# Local dev (faster iteration)
# Root .env holds the Docker DATABASE_PATH (/data/...) which doesn't exist on Windows —
# override it before starting the backend or it crashes with SQLITE_CANTOPEN:
cd backend; $env:DATABASE_PATH = "$(git rev-parse --show-toplevel)\data\notion_time_tracker.sqlite"; npm run dev   # Terminal 1 — nodemon on :3001
cd frontend; npm run dev         # Terminal 2 — Vite on :3000, proxies /api → :3001
```

The local `data/notion_time_tracker.sqlite` is a stale dev snapshot — production data lives on the Railway volume.

## Platform Notes

- **Windows environment** — use PowerShell, not Bash (Bash produces no output in this setup)
- **Glob/search timeouts** — the `node_modules` folder causes ripgrep timeouts; use PowerShell `Get-ChildItem` for file listing when glob fails
- **Zombie dev servers** — "stopped" background dev servers can leave orphaned `node` processes holding :3000/:3001. Vite then silently auto-bumps to :3001, the backend can't bind, and `/api` requests proxy into an infinite loop → the app loads a blank page with no console errors. If localhost looks dead or blank, check first: `Get-Process node | % { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine }` and kill any stray vite/nodemon/`src/app.js` processes before restarting (backend first, then frontend).

## Architecture

| Layer | Stack | Port |
|-------|-------|------|
| Frontend | React 19, Vite 6, Tailwind CSS 4, React Router 7 | 3000 |
| Backend | Node.js, Express 5 | 3001 |
| Database | SQLite (file-based) | — |
| External | Notion API (@notionhq/client 3.x) | — |
| Auth | Password via `APP_PASSWORD` → stateless HMAC-signed tokens (30-day expiry) | — |

Notion is the source of truth for clients/projects/tasks. The local SQLite DB is a cache + stores time entries. Sync is manual (triggered by user).

## Key Files

```
backend/src/
  app.js              — Express entry point + auth (stateless HMAC tokens, see below)
  database.js         — SQLite schema + migrations (ALTER TABLE ADD COLUMN style) + one-time UTC timestamp migration
  settings.js         — Settings table access (timeZone, cached in memory)
  utils/time.js       — Timezone maths (Intl-based): local midnight, day bounds, split-at-midnight
  routes/index.js     — Router mount
  routes/projects.js  — Project CRUD + billing + Bills endpoints (create/list/delete)
  routes/tasks.js     — Task queries (Quick Start, filtering)
  routes/timeEntries.js — Timer start/stop/rollover + CRUD; every write splits entries at local midnight
  routes/settings.js  — GET/PUT app settings (timezone)
  routes/sync.js      — Notion sync orchestration
  services/notionService.js — Notion API calls + sync logic

frontend/src/
  App.jsx             — Layout + route definitions
  services/api.js     — Axios client (baseURL: /api)
  contexts/TimerContext.jsx — Active timer state, favicon, doc title, midnight rollover
  contexts/SettingsContext.jsx — Loads/saves the display timezone (server = source of truth, localStorage cache)
  contexts/ToastContext.jsx — Toast notifications + undo
  pages/HomePage.jsx  — Dashboard: money timer + Quick Start + Timeline (?date= deep-link) + day entries list (with delete/undo)
  pages/CalendarPage.jsx — Read-only week view (day columns, totals, $ earned)
  pages/SettingsPage.jsx — Timezone picker
  components/TimelineView.jsx — Day timeline (drag, resize, create, zoom, live timer entry)
  components/MoneyTimer.jsx — WebGL shader timer with live earnings (replaced XP/streak DopamineTimer)
  components/PreviousBillsSection.jsx — Bill history with task breakdowns (project page)
  components/TaskPricingModal.jsx — Per-task pricing editor (inherit / custom rate / fixed price)
  utils/timeUtils.js  — Date helpers; all zone-aware via the configured display timezone
  utils/billingUtils.js — Billing + earnings math (mirrors server bill rules)

frontend/nginx.conf   — Production reverse proxy (proxies /api → backend:3001)
docker-compose.yml    — Container orchestration
```

## Database Schema

```
Clients (id, notionId, name, status)
  → Projects (id, notionId, name, clientId, notionClientId, budgetedTime, hourlyRate, status, iconType, iconValue, color)
    → Tasks (id, notionId, name, projectId, notionProjectId, status, isBillable, beenBilled, assignee, deadline, taskOrPage, fixedPrice, hourlyRateOverride)
      → TimeEntries (id, taskId, notionTaskId, startTime, endTime, duration, isSyncedToNotion)
    → Bills (id, projectId, totalHours, roundedHours, hourlyRate, subtotal, gst, total, fixedAmount, createdAt)
      → BillTasks (id, billId, taskId, taskName, hoursSpent, fixedPrice, rate)
Settings (key, value, updatedAt) — `timeZone`, `timestampFormat` (= 'utc' once migrated)
```

- `notionId` = Notion page UUID (UNIQUE, used for sync dedup)
- `duration` is in seconds
- Timestamps are **real UTC** ISO 8601 strings (`new Date().toISOString()`); see Timezone below
- A TimeEntry **never spans a local midnight** — the server splits crossing intervals into one row per day
- FKs (`clientId`, `projectId`) resolved by `updateLocalRelationalIds()` after sync
- `Bills`/`BillTasks` are **snapshots** taken at billing time (task names, hours, financials frozen) so history survives task renames/deletions. Financials are computed server-side in `projects.js`. Deleting a bill un-bills its tasks (that's how undo works).

## Important Conventions

- **Timezone**: Timestamps are real UTC instants. The **display timezone** lives in `Settings.timeZone` (default `Pacific/Auckland`, changeable on the Settings page) and drives everything calendar-shaped: which day an entry belongs to (`GET /time-entries?date=` uses local-midnight bounds computed server-side), where the timeline's hours sit, and where midnight is for splitting. Frontend code must go through `timeUtils.js` (`getLocalDateString`, `formatTime`, `hoursIntoDay`, `localTimeToIso`) — never `getUTC*`, `toLocale*` without a zone, or the browser's zone. Backend equivalents are in `utils/time.js`.
- **Midnight splitting**: Stop, auto-stop (starting another timer), manual create and update all run through `splitAtLocalMidnights`; responses carry `entries[]` and `split: true` when more than one row was written, and the timeline refetches in that case. A *running* timer is rolled over by the client: `TimerContext` ticks every second and when the local date differs from the start date it calls `POST /time-entries/:id/rollover`, which closes the entry at midnight (one row per day passed) and starts a new one for the same task from the last midnight. If no browser was open at midnight, the eventual stop splits it the same way.
- **Legacy data migration**: Before Sept 2026 timestamps were NZ wall-clock labelled as UTC. `database.js` converts them once on startup (guarded by `Settings.timestampFormat = 'utc'`), after writing a `pre-utc-migration-<ts>.sqlite` snapshot to `<db dir>/backups/` on the volume. Never clear that flag on a migrated DB — the conversion would run again and shift everything by another 12–13 hours.
- **Backups**: `GET /api/backup` streams a `VACUUM INTO` copy of the live DB (auth-protected; the Settings page has a download button). `GET /api/backup/snapshots[/:name]` lists/downloads on-volume snapshots. Railway's own volume backups need a paid plan, so this is the backup path.
- **Currency**: NZD with 15% GST. Time rounded up to nearest 0.25 hrs for billing.
- **Per-task pricing** (local-only, survives Notion sync): a task inherits the project `hourlyRate`, or has its own `hourlyRateOverride`, or a `fixedPrice` (flat, regardless of hours). Bill math: fixed tasks add their flat price; override tasks bill their rounded hours at their rate; remaining tasks pool hours rounded once at the project rate. Mirrored in `billingUtils.js` (client) and `projects.js` (server, source of truth).
- **MoneyTimer earnings**: hourly tasks show session $ ticking up (rate × elapsed); fixed-price tasks show live effective $/hr ticking down (price ÷ total task hours). Shader pauses when tab is hidden; no explicit `loseContext()` on cleanup (breaks React StrictMode remounts).
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
- **Auth**: `APP_PASSWORD` env var — single password for the whole site. Login issues **stateless HMAC-signed tokens** (secret derived from `APP_PASSWORD`, 30-day expiry) so sessions survive restarts, redeploys, and App Sleeping. Changing `APP_PASSWORD` invalidates all sessions.
- **App Sleeping**: Enabled on Railway (scales to zero when idle). Restarts are invisible to auth, but anything held only in backend memory dies with each sleep — persist state to `/data` or make it stateless.
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
- `SettingsProvider` renders nothing until `/api/settings` answers, so pages can compute "today" in the right zone on first render — keep it inside `RequireAuth` (the endpoint needs auth)
- The `TimelineView` component uses refs for drag state to avoid stale closures
