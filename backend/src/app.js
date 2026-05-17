// notion-time-tracker/backend/src/app.js
require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const notionService = require('./services/notionService');
const apiRoutes = require('./routes/index'); // Import the main API router

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;

// Auth token store (in-memory, survives until process restart)
const validTokens = new Set();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (unprotected)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Auth login endpoint (unprotected)
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    // No password configured = auth disabled (local dev)
    const token = crypto.randomBytes(32).toString('hex');
    validTokens.add(token);
    return res.json({ token });
  }
  if (password === appPassword) {
    const token = crypto.randomBytes(32).toString('hex');
    validTokens.add(token);
    return res.json({ token });
  }
  return res.status(401).json({ message: 'Invalid password' });
});

app.get('/api/auth/check', (req, res) => {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) return res.json({ authenticated: true });
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && validTokens.has(token)) return res.json({ authenticated: true });
  return res.status(401).json({ authenticated: false });
});

// Auth middleware — skip if APP_PASSWORD is not set
app.use('/api', (req, res, next) => {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && validTokens.has(token)) return next();
  return res.status(401).json({ message: 'Unauthorized' });
});

// TEMPORARY: DB upload/download for migration (remove after data is migrated)
app.post('/api/admin/db-upload', express.raw({ type: 'application/octet-stream', limit: '50mb' }), (req, res) => {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/notion_time_tracker.sqlite');
  fs.writeFileSync(dbPath, req.body);
  res.json({ message: 'Database replaced', size: req.body.length });
});
app.get('/api/admin/db-download', (req, res) => {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/notion_time_tracker.sqlite');
  res.download(dbPath);
});

// Serve downloaded project icons (unprotected — loaded via img tags)
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// Use API routes
app.use('/api', apiRoutes); // All API routes will be prefixed with /api

// In production, serve frontend static files
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/assets')) return next();
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Something broke!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

db.init().then(() => {
  console.log('Database initialized.');
  // Optional: Initial sync on startup
  // if (process.env.NODE_ENV !== 'test' && process.env.NOTION_API_KEY) {
  //   console.log("Attempting initial sync from Notion on startup...");
  //   notionService.syncAllFromNotion().catch(err => console.error("Initial sync failed:", err));
  // }
  app.listen(PORT, () => {
    console.log(`Backend server listening on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = app;