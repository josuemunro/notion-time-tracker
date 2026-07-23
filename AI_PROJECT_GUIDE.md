# AI Project Guide — Notion Time Tracker

## Read This First

This guide is the canonical reference for AI assistants working on this project. Read it fully before making changes. For quick-reference conventions, see `.cursor/rules/project-conventions.mdc`.

---

## Architecture Overview

| Layer | Stack | Port | Purpose |
|-------|-------|------|---------|
| Frontend | React 19, Vite 6, Tailwind CSS 4, React Router 7 | 3000 | SPA with time tracking UI |
| Backend | Node.js, Express 5 | 3001 | REST API + Notion sync |
| Database | SQLite | — | Local cache of Notion data + time entries |
| Notion | @notionhq/client 3.x | — | Source of truth for clients, projects, tasks |

### Directory Layout

```
notion-time-tracker/
├── .env.example              # Required env vars
├── docker-compose.yml        # Container orchestration
├── AI_PROJECT_GUIDE.md       # This file
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── assets/icons/         # Cached project icons from Notion
│   └── src/
│       ├── app.js            # Express entry point
│       ├── database.js       # SQLite schema + init
│       ├── routes/
│       │   ├── index.js      # Router mount point
│       │   ├── clients.js
│       │   ├── projects.js
│       │   ├── tasks.js
│       │   ├── timeEntries.js
│       │   └── sync.js
│       └── services/
│           └── notionService.js  # Notion API + sync logic
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf            # Production reverse proxy
    ├── package.json
    └── src/
        ├── main.jsx          # Entry: BrowserRouter → TimerProvider → App
        ├── App.jsx           # Layout + routes
        ├── services/api.js   # Axios client (baseURL: /api)
        ├── contexts/
        │   ├── TimerContext.jsx   # Active timer state, favicon, doc title
        │   └── ToastContext.jsx   # Toast notifications + undo actions
        ├── pages/
        │   ├── HomePage.jsx       # Dashboard: money timer + Quick Start + Timeline
        │   ├── CalendarPage.jsx   # Read-only week view with day/week totals + $
        │   ├── ClientsPage.jsx    # Active clients grid
        │   ├── ClientDetailPage.jsx
        │   ├── ProjectsPage.jsx   # Active projects grid
        │   ├── ProjectDetailPage.jsx  # Settings, billing, tasks
        │   └── TasksPage.jsx      # All tasks list
        ├── components/
        │   ├── layout/Navbar.jsx
        │   ├── common/TaskItem.jsx     # Play/stop per task + pricing badge
        │   ├── MoneyTimer.jsx          # WebGL shader timer with live $ earnings
        │   ├── TimelineView.jsx        # Day timeline (drag, resize, create, zoom)
        │   ├── ProjectIcon.jsx         # Emoji / image / fallback
        │   ├── TaskSelectionModal.jsx   # Pick task for manual entry
        │   ├── TaskPricingModal.jsx     # Per-task pricing (inherit/override/fixed)
        │   ├── BillingOverview.jsx      # Billed / unbilled summary
        │   ├── UnbilledTasksSection.jsx # Select + preview billing
        │   ├── BillingModal.jsx         # Final bill with copy/undo
        │   └── PreviousBillsSection.jsx # Bill history with task breakdowns
        └── utils/
            ├── timeUtils.js     # Date helpers (NZ timezone)
            └── billingUtils.js  # Billing + earnings math (mirrors server rules)
```

---

## Development Environment

### Docker (production-like)

```bash
docker compose up --build        # Build + start both services
docker compose up --build -d     # Detached
docker compose logs -f           # Tail logs
docker compose down              # Stop + remove
```

### Local dev (faster iteration)

```bash
# Terminal 1 — backend
cd backend && npm run dev        # nodemon on port 3001

# Terminal 2 — frontend
cd frontend && npm run dev       # Vite on port 3000, proxies /api → :3001
```

Both approaches work. Docker is closer to production; local dev gives hot reload.

**Windows local dev gotcha**: the root `.env` sets `DATABASE_PATH=/data/...` (the Docker/Railway path), which crashes the backend locally with `SQLITE_CANTOPEN`. Pre-set the env var before starting (dotenv won't override it):

```powershell
$env:DATABASE_PATH = "<repo>\data\notion_time_tracker.sqlite"; npm run dev
```

---

## Data Flow

### Notion → Local DB (sync)

```
POST /api/sync/notion
  → syncAllFromNotion()
    → syncClientsWithDb()    — upsert all clients
    → syncProjectsWithDb()   — upsert all projects + download icons
    → syncTasksWithDb()      — upsert active tasks + mark stale tasks as Done
    → updateLocalRelationalIds()  — resolve Notion IDs → local FK IDs
```

Sync is **manual** — triggered by the "Sync Notion" button in the Navbar or `POST /api/sync/notion`.

### Task sync filter (Notion query)

Only tasks matching ALL of these are fetched:

| Property | Condition |
|----------|-----------|
| Task or Page | equals "Task" |
| Deadline | is not empty |
| Status | equals "To Do" OR "Doing" |
| Assign (if `NOTION_USER_ID` set) | contains user OR is empty |

Tasks that no longer match (e.g. marked "Done" in Notion) are absent from the API response. The sync marks any locally-active task not in the response as `"Done"` so they disappear from the Quick Start list.

### Quick Start (home page)

```
GET /api/tasks/in-progress
  → SQL: status IN ('Doing','To Do') OR has active timer
         AND deadline IS NOT NULL
         AND taskOrPage = 'Task'
         AND assignee IS NULL or contains 'Josue Munro'
  → grouped by project
```

### Timer flow

```
POST /api/time-entries/start   { taskId }   → creates TimeEntry with startTime, no endTime
POST /api/time-entries/:id/stop             → sets endTime + duration
```

Active timer check: `GET /api/time-entries/active` (returns entry where endTime IS NULL).

---

## API Reference

### Clients

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clients` | All clients with total hours |
| GET | `/api/clients/active` | Clients excluding Done/Completed/Archived |
| GET | `/api/clients/:id` | Client detail + projects |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | All projects with time + client info |
| GET | `/api/projects/active` | Projects with status Proposal/In progress/Ongoing |
| GET | `/api/projects/:id` | Project detail + tasks |
| PUT | `/api/projects/:id` | Update `color` (hex) and/or `hourlyRate` |
| PUT | `/api/projects/:id/tasks/billing` | Bulk set `beenBilled` for `taskIds[]` |
| POST | `/api/projects/:id/bills` | Create bill snapshot from `taskIds[]`; computes hours/GST server-side, marks tasks billed |
| GET | `/api/projects/:id/bills` | List bills (newest first) with task snapshots |
| DELETE | `/api/projects/:id/bills/:billId` | Delete bill + un-bill its tasks (undo) |
| POST | `/api/projects/test` | Create test project + sample tasks |
| DELETE | `/api/projects/:id` | Cascade delete project, tasks, time entries |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | All tasks. Query: `?status=`, `?projectId=` |
| GET | `/api/tasks/in-progress` | Quick Start list (grouped by project) |
| GET | `/api/tasks/:id` | Task detail + time entries |
| PATCH | `/api/tasks/:id/status` | Update task status (To Do / Doing / Done) |
| PATCH | `/api/tasks/:id/pricing` | Set `fixedPrice` or `hourlyRateOverride` (null clears; at most one) |

### Time Entries

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/time-entries/active` | Currently running timer (if any) |
| POST | `/api/time-entries/start` | Start timer. Body: `{ taskId }` |
| POST | `/api/time-entries/:id/stop` | Stop timer |
| POST | `/api/time-entries` | Manual entry. Body: `{ taskId, startTime, endTime }` |
| PUT | `/api/time-entries/:id` | Update entry times |
| DELETE | `/api/time-entries/:id` | Delete entry |
| GET | `/api/time-entries` | List. Query: `?date=`, `?startDate=`, `?endDate=` (YYYY-MM-DD) |

### Sync

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync/notion` | Full sync from Notion |
| POST | `/api/sync/notion/webhook` | Handle Notion webhook |

---

## Database Schema

```
Clients (id, notionId, name, status)
  └── Projects (id, notionId, name, clientId, notionClientId, budgetedTime, hourlyRate, status, iconType, iconValue, color)
        ├── Tasks (id, notionId, name, projectId, notionProjectId, status, isBillable, beenBilled, assignee, deadline, taskOrPage)
        │     └── TimeEntries (id, taskId, notionTaskId, startTime, endTime, duration, isSyncedToNotion)
        └── Bills (id, projectId, totalHours, roundedHours, hourlyRate, subtotal, gst, total, createdAt)
              └── BillTasks (id, billId, taskId, taskName, hoursSpent)
```

`Bills`/`BillTasks` are snapshots frozen at billing time — task names and hours are copied in so bill history survives task renames and deletions. Deleting a bill resets `beenBilled` on its tasks.

- `notionId` columns are the Notion page UUIDs, used for sync deduplication (UNIQUE constraint)
- `notionClientId` / `notionProjectId` store the raw Notion relation IDs; `clientId` / `projectId` are resolved local FKs (updated by `updateLocalRelationalIds()` after each sync)
- `duration` is in **seconds**
- Timestamps are ISO 8601 strings

---

## Notion Database Schema Expectations

The Notion integration expects these exact property names:

### Clients DB
- **Name** (title)
- **Status** (status or select)

### Projects DB
- **Project Name** (title)
- **Client Link** (relation → Clients)
- **Budget (hrs)** (number)
- **Status** (status or select)
- **Color** (select, optional)
- Page icon (emoji, external URL, or file)

### Tasks DB
- **Task Name** (title)
- **Project Link** (relation → Projects)
- **Status** (status) — expected values: "To Do", "Doing", "Done"
- **Is Billable** (checkbox)
- **Assign** (people)
- **Deadline** (date)
- **Task or Page** (select) — expected values: "Task", "Page"

---

## Key Design Decisions

1. **Timezone**: All date logic uses `Pacific/Auckland` (NZ time). See `utils/timeUtils.js`. Timestamps are stored as **NZ wall-clock time encoded as UTC ISO strings** (`getNZTimestamp()` pattern) — format them with `timeZone: 'UTC'` when displaying to avoid double-shifting.
2. **Currency**: NZD with 15% GST for billing calculations.
3. **Billing rounding + per-task pricing**: Hours round up to 0.25h. Tasks may carry local-only pricing (`fixedPrice` or `hourlyRateOverride`, set via `TaskPricingModal`, never synced to Notion): fixed tasks bill their flat price, override tasks bill their rounded hours at their own rate, everything else pools hours (rounded once) at the project rate. Client math in `utils/billingUtils.js`; server (bills endpoint in `projects.js`) is the source of truth. The MoneyTimer shows hourly earnings ticking up, or a fixed task's live effective $/hr ticking down.
4. **Icon caching**: Notion file URLs expire after ~1 hour, so project icons are downloaded on sync and served statically (from the `/data` volume in production).
5. **Auth**: Single password (`APP_PASSWORD`). Login issues stateless HMAC-signed tokens (secret derived from `APP_PASSWORD`, 30-day expiry) verified in `app.js` — no server-side session state, so sessions survive restarts, redeploys, and Railway App Sleeping. Changing `APP_PASSWORD` invalidates all tokens. No password set = auth disabled (local dev).
6. **No auto-sync**: Sync is manual to avoid Notion rate limits.
7. **Statelessness matters**: Railway App Sleeping stops the process when idle, so never keep durable state only in backend memory — persist to SQLite on `/data` or make it derivable (like the auth tokens).

---

## Common Pitfalls

1. **Hardcoded assignee**: The in-progress query in `tasks.js` filters by `'%Josue Munro%'` rather than a configurable value.
2. **Notion property names are exact-match**: If a Notion DB uses "In Progress" instead of "Doing", sync will miss those tasks.
3. **SQLite migrations**: New columns are added with `ALTER TABLE ... ADD COLUMN` in `database.js` — these silently no-op if the column already exists.
4. **Frontend proxy**: In dev, Vite proxies `/api` to `localhost:3001`. In Docker, nginx does the same.
5. **Timer state**: `TimerContext` manages the active timer in React state + polls the backend. Stopping a timer re-fetches timeline data.

---

## Timeline Component (Core Feature)

The `TimelineView` is the most complex component. Key behaviors:

- **Drag handles** (blue) on left/right edges resize entries
- **Drag center** moves entries
- **Click empty area** opens `TaskSelectionModal` to create a manual entry
- **Click existing entry** shows delete option
- **Zoom**: Ctrl/Cmd+scroll (cursor-anchored) or header −/+ buttons, 20–240 px/hr; snap increments scale with zoom (finest step ≥4px of mouse travel); entries under 28px render as a bar with the project icon floated above
- **Live timer entry**: the running timer renders as a breathing, non-interactive entry that grows every second (driven by `TimerContext.elapsedTime`)
- **Real-time refresh**: `TimerContext.registerTimerChangeCallback` fires on timer start *and* stop, so auto-stopped timers appear immediately; the loading screen only shows on first load (refetches keep the timeline mounted)
- All changes persist to the backend immediately
- Uses refs for drag state to avoid stale closures

When making timeline changes, update the version log comment block at the top of `TimelineView.jsx` (v1.x entries describing each change).

---

## Environment Variables

```env
BACKEND_PORT=3001
FRONTEND_PORT=3000
DATABASE_PATH=/data/notion_time_tracker.sqlite
APP_PASSWORD=<required in production; unset = auth disabled>

NOTION_API_KEY=secret_...
NOTION_CLIENTS_DB_ID=<uuid>
NOTION_PROJECTS_DB_ID=<uuid>
NOTION_TASKS_DB_ID=<uuid>
NOTION_USER_ID=<uuid>          # Optional — filters tasks by assignee
```

---

## Quick Checklist

- [ ] Read this guide fully
- [ ] Check Docker or local dev is running
- [ ] Verify Notion env vars are set in `.env`
- [ ] After any sync-related changes, test with `POST /api/sync/notion`
- [ ] After any timeline changes, test drag/resize/create/delete in the UI
- [ ] Timestamps use NZ timezone — double-check date boundary logic
