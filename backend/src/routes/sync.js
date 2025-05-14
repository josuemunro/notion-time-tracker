// notion-time-tracker/backend/src/routes/sync.js
const express = require('express');
const router = express.Router();
const notionService = require('../services/notionService');
// No direct db access needed here as it's handled by notionService or not applicable

// POST /api/sync/notion
router.post('/notion', async (req, res, next) => {
  console.log('API: Received request to POST /api/sync/notion');
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_CLIENTS_DB_ID || !process.env.NOTION_PROJECTS_DB_ID || !process.env.NOTION_TASKS_DB_ID) {
     return res.status(400).json({ message: 'Notion API Key or one of the core Database IDs is not configured. Sync aborted.' });
  }
  try {
    await notionService.syncAllFromNotion();
    res.status(200).json({ message: 'Sync with Notion (Clients, Projects, Tasks) initiated successfully.' });
  } catch (error) {
    console.error('API Error: Error during manual sync request:', error);
    next(error);
  }
});

// POST /api/sync/notion/webhook
router.post('/notion/webhook', async (req, res, next) => {
  console.log('API: Received request to POST /api/sync/notion/webhook');
  const payload = req.body;
  try {
    await notionService.handleNotionWebhook(payload);
    res.status(200).send('Webhook received and acknowledged.');
  } catch (error) {
    console.error('API Error: Error processing Notion webhook:', error);
    if (!res.headersSent) {
        next(error);
    }
  }
});

module.exports = router;