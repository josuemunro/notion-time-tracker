// notion-time-tracker/backend/src/routes/projects.js
const express = require('express');
const router = express.Router();
const database = require('../database'); // Import the database module

// GET /api/projects - Get all projects with aggregated time and client info
router.get('/', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  try {
    const query = `
      SELECT
        p.id,
        p.notionId,
        p.name,
        p.budgetedTime,
        p.status,
        p.createdAt AS projectCreatedAt,
        p.updatedAt AS projectUpdatedAt,
        c.id AS clientId,
        c.name AS clientName,
        c.notionId AS clientNotionId,
        COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent
      FROM Projects p
      LEFT JOIN Clients c ON p.clientId = c.id
      LEFT JOIN Tasks t ON p.id = t.projectId
      LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
      GROUP BY p.id, p.notionId, p.name, p.budgetedTime, p.status, p.createdAt, p.updatedAt, c.id, c.name, c.notionId
      ORDER BY p.name COLLATE NOCASE;
    `;
    db.all(query, [], (err, rows) => {
      if (err) return next(err);
      res.json(rows.map(row => ({
          ...row,
          percentageBudgetUsed: row.budgetedTime > 0 ? ((row.totalHoursSpent / row.budgetedTime) * 100) : 0
      })));
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:projectId - Get a specific project with its tasks and aggregated time
router.get('/:projectId', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  const { projectId: idOrNotionId } = req.params;
  try {
    const projectQuery = `
      SELECT
        p.id,
        p.notionId,
        p.name,
        p.budgetedTime,
        p.status,
        p.createdAt,
        p.updatedAt,
        c.id AS clientId,
        c.name AS clientName,
        COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent
      FROM Projects p
      LEFT JOIN Clients c ON p.clientId = c.id
      LEFT JOIN Tasks t ON p.id = t.projectId
      LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
      WHERE (p.id = ? OR p.notionId = ?)
      GROUP BY p.id, p.notionId, p.name, p.budgetedTime, p.status, p.createdAt, p.updatedAt, c.id, c.name;
    `;
    db.get(projectQuery, [idOrNotionId, idOrNotionId], (err, project) => {
      if (err) return next(err);
      if (!project) return res.status(404).json({ message: 'Project not found' });

      const tasksQuery = `
        SELECT
          t.id,
          t.notionId,
          t.name,
          t.status,
          t.isBillable,
          COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent,
          (SELECT te_active.startTime FROM TimeEntries te_active WHERE te_active.taskId = t.id AND te_active.endTime IS NULL LIMIT 1) AS activeTimerStartTime
        FROM Tasks t
        LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
        WHERE t.projectId = ?
        GROUP BY t.id, t.notionId, t.name, t.status, t.isBillable
        ORDER BY t.name COLLATE NOCASE;
      `;
      db.all(tasksQuery, [project.id], (err, tasks) => {
        if (err) return next(err);
        res.json({
            ...project,
            percentageBudgetUsed: project.budgetedTime > 0 ? ((project.totalHoursSpent / project.budgetedTime) * 100) : 0,
            tasks
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;