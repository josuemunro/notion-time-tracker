// notion-time-tracker/backend/src/routes/billing.js
const express = require('express');
const router = express.Router();
const billing = require('../services/billing');

// GET /api/billing/schedule - What needs billing and when, across all projects
// (rules in services/billing.js). Bills themselves are created per project via
// POST /api/projects/:projectId/bills.
router.get('/schedule', async (req, res, next) => {
  try {
    res.json(await billing.getBillingSchedule());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
