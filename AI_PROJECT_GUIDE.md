# AI Project Guide - Notion Time Tracker

## 🚨 CRITICAL: READ THIS FIRST

This guide contains essential information for AI assistants working on this project. **Always read this file completely before starting any development work.**

## 🐳 Development Environment

### **USE DOCKER - NOT npm run dev**

This project runs in Docker containers. **Do NOT use `npm run dev` or `npm start` directly.**

#### Starting the Development Environment:
```bash
# Start both frontend and backend
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

#### Individual Container Commands:
```bash
# Frontend only
docker-compose up frontend

# Backend only  
docker-compose up backend
```

#### Rebuilding After Code Changes:
```bash
# Rebuild and restart (needed for most code changes)
docker-compose up --build

# Force rebuild specific service
docker-compose build frontend
docker-compose build backend
```

## 📁 Project Structure

```
notion-time-tracker/
├── docker-compose.yml          # Docker orchestration
├── frontend/                   # React + Vite frontend
│   ├── Dockerfile
│   ├── nginx.conf             # Production nginx config
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── contexts/          # React contexts (Timer, Toast)
│   │   ├── pages/             # Page components
│   │   └── services/api.js    # API client
├── backend/                    # Node.js + Express backend
│   ├── Dockerfile
│   ├── src/
│   │   ├── routes/            # API route handlers
│   │   ├── services/          # Business logic (Notion sync)
│   │   └── database.js        # SQLite database layer
└── data/                      # SQLite database storage
```

## 🌐 Service URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Frontend Dev Server** (when using Vite directly): http://localhost:3002

## 🗄️ Database

- **Type**: SQLite
- **Location**: `./data/notion_time_tracker.sqlite`
- **Schema**: Clients → Projects → Tasks → TimeEntries
- **Initialization**: Automatic on first backend startup

### Key Tables:
- `Clients` - Client information from Notion
- `Projects` - Projects with icons, colors, budgets
- `Tasks` - Tasks with status and billing info
- `TimeEntries` - Time tracking entries

## 🔄 Notion Integration

### Environment Variables Required:
```env
NOTION_API_KEY=secret_...
NOTION_CLIENTS_DB_ID=...
NOTION_PROJECTS_DB_ID=...
NOTION_TASKS_DB_ID=...
NOTION_USER_ID=...
```

### Sync Process:
- Manual sync via `/api/sync/notion` endpoint
- Fetches clients, projects, and tasks from Notion
- Updates local SQLite database
- **Note**: Notion file URLs expire after ~1 hour

## 🕒 Timeline Component - Key Features

### Critical Functionality:
1. **Timer Integration**: Timeline auto-refreshes when timers stop
2. **Drag & Drop**: Resize entries by dragging blue handles, move by dragging center
3. **Click Interactions**: Click entries to delete, click empty areas to create
4. **Task Selection**: Modal opens when creating new entries
5. **Real-time Updates**: All changes persist to database immediately

### Development Tracking:
**IMPORTANT**: When making timeline updates, change the console log version string in TimelineView.jsx to a new hardcoded string (with current date/time) so we can verify changes are loaded in the browser. This log should only fire once per page load, not on every re-render.

Example: `console.log("🕒 TimelineView last updated @ 2025-09-19 16:45 NZ time - Fixed hover outline issue");`

### Common Issues to Avoid:
- Don't disable pointer events on drag handles
- Ensure proper z-index layering (handles above content)
- Handle timezone conversions correctly for time calculations (entries should appear on selected date)
- Include proper fallbacks for failed project icons
- Use refs for immediate state checks in async operations (like drag detection)
- Expand hover detection areas to account for drag handles and user precision

## 📝 Development Guidelines

### Code Changes:
1. **Frontend changes**: Usually hot-reload in Docker
2. **Backend changes**: May need container restart
3. **Package.json changes**: Requires rebuild (`docker-compose up --build`)
4. **Dockerfile changes**: Requires rebuild

### Testing:
```bash
# Run backend tests (if any exist)
docker-compose exec backend npm test

# Check database
docker-compose exec backend sqlite3 /app/data/notion_time_tracker.sqlite

# View logs
docker-compose logs backend
docker-compose logs frontend
```

### API Testing:
```bash
# Test API endpoints
curl http://localhost:3001/api/tasks
curl http://localhost:3001/api/time-entries?date=2024-01-15
```

## 🎯 Common Tasks

### Adding New Features:
1. Update relevant components in `frontend/src/`
2. Add/modify API routes in `backend/src/routes/`
3. Test in Docker environment
4. Ensure database schema supports new features

### Debugging:
1. Check Docker logs: `docker-compose logs -f`
2. Verify database state: Connect to SQLite directly
3. Test API endpoints: Use curl or Postman
4. Frontend console: Browser dev tools

### Database Migrations:
- Add new columns with `ALTER TABLE` in `database.js`
- Use `IF NOT EXISTS` for safe migrations
- Test with fresh database in new container

## 🚀 Deployment Notes

- Frontend uses nginx for production serving
- Backend serves API on port 3001
- Database persists in Docker volume
- All environment variables needed for Notion integration

## ⚠️ Important Warnings

1. **Never run `npm run dev` directly** - Use Docker
2. **Project icons may fail after 1 hour** - This is normal (Notion URL expiry)
3. **Always test timeline functionality** - It's the core feature
4. **Database is file-based** - Backup `./data/` directory
5. **Notion sync is manual** - No automatic scheduling

## 🔧 Troubleshooting

### Container Won't Start:
- Check if ports 3000/3001 are available
- Run `docker-compose down` first
- Check Docker logs for specific errors

### Database Issues:
- Ensure `./data/` directory exists
- Check file permissions on SQLite file
- Verify environment variables for Notion

### Timeline Not Working:
- Check that TimerContext is properly wrapped
- Verify API endpoints are responding
- Ensure proper date formatting in requests

---

## 📋 Quick Start Checklist for AI Assistants:

- [ ] Read this entire guide
- [ ] Verify Docker is running
- [ ] Start with `docker-compose up`
- [ ] Test both frontend (3000) and backend (3001)
- [ ] Check that Notion env vars are set
- [ ] Test timeline functionality first
- [ ] Never use npm run commands directly

**Remember**: This project's core value is the timeline functionality. Always ensure it works correctly after any changes. 