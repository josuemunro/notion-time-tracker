// notion-time-tracker/backend/src/routes/index.js
const express = require('express');
const router = express.Router();

const clientRoutes = require('./clients');
const projectRoutes = require('./projects');
const taskRoutes = require('./tasks');
const timeEntryRoutes = require('./timeEntries');
const syncRoutes = require('./sync');

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API is healthy and running' });
});

router.use('/clients', clientRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);
router.use('/time-entries', timeEntryRoutes); // For managing time entries, including active timer
router.use('/sync', syncRoutes); // For Notion sync trigger and webhook

module.exports = router;