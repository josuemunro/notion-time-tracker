// notion-time-tracker/backend/src/routes/clients.js
const express = require('express');
const router = express.Router();
const database = require('../database'); // Import the database module

// GET /api/clients - Get all clients with aggregated time data
router.get('/', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  try {
    const query = `
      SELECT
        c.id,
        c.notionId,
        c.name,
        c.status,
        c.createdAt,
        c.updatedAt,
        COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent
      FROM Clients c
      LEFT JOIN Projects p ON c.id = p.clientId
      LEFT JOIN Tasks t ON p.id = t.projectId
      LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
      GROUP BY c.id, c.notionId, c.name, c.status, c.createdAt, c.updatedAt
      ORDER BY c.name COLLATE NOCASE;
    `;
    db.all(query, [], (err, rows) => {
      if (err) {
        return next(err);
      }
      res.json(rows);
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/clients/active - Get only active clients (excluding Done/deleted)
router.get('/active', async (req, res, next) => {
  const db = database.getDb();
  try {
    const query = `
      SELECT
        c.id,
        c.notionId,
        c.name,
        c.status,
        c.createdAt,
        c.updatedAt,
        COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent
      FROM Clients c
      LEFT JOIN Projects p ON c.id = p.clientId
      LEFT JOIN Tasks t ON p.id = t.projectId
      LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
      WHERE c.status IS NULL OR (c.status != 'Done' AND c.status != 'Completed' AND c.status != 'Archived')
      GROUP BY c.id, c.notionId, c.name, c.status, c.createdAt, c.updatedAt
      ORDER BY c.name COLLATE NOCASE;
    `;
    db.all(query, [], (err, rows) => {
      if (err) {
        return next(err);
      }
      res.json(rows);
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/clients/:clientId - Get a specific client (details + projects under it)
router.get('/:clientId', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  const { clientId } = req.params;
  try {
    const clientQuery = "SELECT * FROM Clients WHERE id = ? OR notionId = ?";
    db.get(clientQuery, [clientId, clientId], (err, client) => {
      if (err) return next(err);
      if (!client) return res.status(404).json({ message: 'Client not found' });

      const projectsQuery = `
        SELECT
          p.id,
          p.notionId,
          p.name,
          p.budgetedTime,
          p.status,
          p.createdAt,
          p.updatedAt,
          COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent
        FROM Projects p
        LEFT JOIN Tasks t ON p.id = t.projectId
        LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
        WHERE p.clientId = ?
        GROUP BY p.id, p.notionId, p.name, p.budgetedTime, p.status, p.createdAt, p.updatedAt
        ORDER BY p.name COLLATE NOCASE;
      `;
      db.all(projectsQuery, [client.id], (err, projects) => {
        if (err) return next(err);
        res.json({ ...client, projects });
      });
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;