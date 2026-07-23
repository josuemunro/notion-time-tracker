// notion-time-tracker/backend/src/app.js
require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const db = require('./database');
const notionService = require('./services/notionService');
const apiRoutes = require('./routes/index'); // Import the main API router

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;

// Stateless signed auth tokens — survive process restarts (Railway App Sleeping,
// redeploys). Changing APP_PASSWORD invalidates all existing tokens.
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function tokenSecret() {
  return crypto.createHash('sha256')
    .update('ntt-auth:' + (process.env.APP_PASSWORD || 'dev'))
    .digest();
}

function createToken() {
  const expiry = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac('sha256', tokenSecret()).update(String(expiry)).digest('hex');
  return `${expiry}.${sig}`;
}

function isValidToken(token) {
  if (!token) return false;
  const [expiryStr, sig] = token.split('.');
  const expiry = Number(expiryStr);
  if (!expiry || !sig || Date.now() > expiry) return false;
  const expected = crypto.createHmac('sha256', tokenSecret()).update(expiryStr).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

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
    return res.json({ token: createToken() });
  }
  if (password === appPassword) {
    return res.json({ token: createToken() });
  }
  return res.status(401).json({ message: 'Invalid password' });
});

app.get('/api/auth/check', (req, res) => {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) return res.json({ authenticated: true });
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (isValidToken(token)) return res.json({ authenticated: true });
  return res.status(401).json({ authenticated: false });
});

// Auth middleware — skip if APP_PASSWORD is not set
app.use('/api', (req, res, next) => {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (isValidToken(token)) return next();
  return res.status(401).json({ message: 'Unauthorized' });
});

// Serve downloaded project icons (unprotected — loaded via img tags)
// In production, icons live on the persistent volume alongside the DB
const iconsPath = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(__dirname, '../assets');
app.use('/assets/icons', express.static(path.join(iconsPath, 'icons')));
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