// notion-time-tracker/backend/src/routes/settings.js
const express = require('express');
const router = express.Router();
const settings = require('../settings');

// GET /api/settings - App-wide settings
router.get('/', async (req, res, next) => {
  try {
    res.json({ timeZone: await settings.getTimeZone() });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings - Update settings (currently just the display/day-boundary timezone)
router.put('/', async (req, res, next) => {
  const { timeZone } = req.body || {};
  if (!timeZone) {
    return res.status(400).json({ message: 'timeZone is required.' });
  }
  try {
    const saved = await settings.setTimeZone(timeZone);
    console.log('Settings updated - timeZone:', saved);
    res.json({ timeZone: saved });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    next(error);
  }
});

module.exports = router;
