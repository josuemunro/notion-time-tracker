// notion-time-tracker/backend/src/app.js
require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const db = require('./database');
const notionService = require('./services/notionService');
const apiRoutes = require('./routes/index'); // Import the main API router

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('Notion Time Tracker Backend is running!');
});

// Use API routes
app.use('/api', apiRoutes); // All API routes will be prefixed with /api

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