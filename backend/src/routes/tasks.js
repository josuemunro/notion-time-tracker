// notion-time-tracker/backend/src/routes/tasks.js
const express = require('express');
const router = express.Router();
const database = require('../database'); // Import the database module

// GET /api/tasks - Get all tasks (potentially filterable)
router.get('/', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  const { status, projectId } = req.query;
  let query = `
    SELECT
      t.id,
      t.notionId,
      t.name,
      t.status,
      t.isBillable,
      t.beenBilled,
      t.assignee,
      t.createdAt AS taskCreatedAt,
      t.updatedAt AS taskUpdatedAt,
      p.id AS projectId,
      p.name AS projectName,
      p.notionId AS projectNotionId,
      p.iconType AS projectIconType,
      p.iconValue AS projectIconValue,
      p.color AS projectColor,
      c.id AS clientId,
      c.name AS clientName,
      c.notionId AS clientNotionId,
      COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent,
      (SELECT te_active.startTime FROM TimeEntries te_active WHERE te_active.taskId = t.id AND te_active.endTime IS NULL LIMIT 1) AS activeTimerStartTime
    FROM Tasks t
    LEFT JOIN Projects p ON t.projectId = p.id
    LEFT JOIN Clients c ON p.clientId = c.id
    LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
  `;
  const params = [];
  const conditions = [];

  if (status) {
    conditions.push("t.status = ?");
    params.push(status);
  }
  if (projectId) {
    conditions.push("t.projectId = ? OR p.notionId = ?"); // Assuming projectId can be local ID or Notion ID
    params.push(projectId, projectId);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += `
    GROUP BY t.id, t.notionId, t.name, t.status, t.isBillable, t.beenBilled, t.assignee, t.createdAt, t.updatedAt, p.id, p.name, p.notionId, p.iconType, p.iconValue, p.color, c.id, c.name, c.notionId
    ORDER BY p.name COLLATE NOCASE, t.name COLLATE NOCASE;
  `;

  try {
    db.all(query, params, (err, rows) => {
      if (err) return next(err);
      res.json(rows);
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/in-progress - View in-progress tasks grouped by project
router.get('/in-progress', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  try {
    const query = `
      SELECT
        p.id AS projectId,
        p.name AS projectName,
        p.notionId AS projectNotionId,
        p.iconType AS projectIconType,
        p.iconValue AS projectIconValue,
        p.color AS projectColor,
        p.hourlyRate AS projectHourlyRate,
        t.id AS taskId,
        t.notionId AS taskNotionId,
        t.name AS taskName,
        t.status AS taskStatus,
        t.assignee AS taskAssignee,
        t.isManual AS taskIsManual,
        t.fixedPrice AS taskFixedPrice,
        t.hourlyRateOverride AS taskHourlyRateOverride,
        (SELECT te_active.startTime FROM TimeEntries te_active WHERE te_active.taskId = t.id AND te_active.endTime IS NULL LIMIT 1) AS activeTimerStartTime,
        COALESCE(SUM(CASE WHEN te_done.endTime IS NOT NULL THEN te_done.duration ELSE 0 END), 0) / 3600.0 AS totalHoursSpent
      FROM Tasks t
      JOIN Projects p ON t.projectId = p.id
      LEFT JOIN TimeEntries te_done ON t.id = te_done.taskId
      WHERE (t.status IN ('Doing', 'To Do') OR
            EXISTS (SELECT 1 FROM TimeEntries te_check WHERE te_check.taskId = t.id AND te_check.endTime IS NULL))
            AND (t.assignee IS NULL OR t.assignee LIKE '%Josue Munro%')
            AND (t.deadline IS NOT NULL OR t.isManual = 1)
            AND (t.taskOrPage = 'Task' OR t.taskOrPage IS NULL)
      GROUP BY t.id, p.id
      ORDER BY p.name COLLATE NOCASE, t.name COLLATE NOCASE;
    `;
    db.all(query, [], (err, rows) => {
      if (err) return next(err);
      const groupedByProject = rows.reduce((acc, row) => {
        const { projectId, projectName, projectNotionId, projectIconType, projectIconValue, projectColor, projectHourlyRate, ...taskData } = row;
        if (!acc[projectId]) {
          acc[projectId] = {
            projectId,
            projectName,
            projectNotionId,
            projectIconType,
            projectIconValue,
            projectColor,
            projectHourlyRate,
            tasks: [],
          };
        }
        if (taskData.taskId) {
          acc[projectId].tasks.push({
            id: taskData.taskId,
            notionId: taskData.taskNotionId,
            name: taskData.taskName,
            status: taskData.taskStatus,
            assignee: taskData.taskAssignee,
            isManual: !!taskData.taskIsManual,
            fixedPrice: taskData.taskFixedPrice,
            hourlyRateOverride: taskData.taskHourlyRateOverride,
            activeTimerStartTime: taskData.activeTimerStartTime,
            totalHoursSpent: row.totalHoursSpent
          });
        }
        return acc;
      }, {});
      res.json(Object.values(groupedByProject));
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/tasks - Create a manual (local-only) task
router.post('/', async (req, res, next) => {
  const db = database.getDb();
  const { name, projectId } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Task name is required.' });
  }
  if (!projectId) {
    return res.status(400).json({ message: 'projectId is required.' });
  }

  try {
    db.get("SELECT id FROM Projects WHERE id = ?", [projectId], (err, project) => {
      if (err) return next(err);
      if (!project) return res.status(404).json({ message: 'Project not found.' });

      const syntheticNotionId = `local-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Local tasks are billable like Notion tasks (they show in the project's Unbilled list)
      const insertQuery = `
        INSERT INTO Tasks (notionId, name, projectId, status, isManual, isBillable)
        VALUES (?, ?, ?, 'To Do', 1, 1)
      `;

      db.run(insertQuery, [syntheticNotionId, name.trim(), projectId], function (err) {
        if (err) return next(err);
        res.status(201).json({
          message: 'Task created successfully.',
          task: {
            id: this.lastID,
            notionId: syntheticNotionId,
            name: name.trim(),
            projectId,
            status: 'To Do',
            isManual: true,
            isBillable: true
          }
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/tasks/:taskId/status - Update a task's status
router.patch('/:taskId/status', async (req, res, next) => {
  const db = database.getDb();
  const { taskId } = req.params;
  const { status } = req.body;

  const allowedStatuses = ['To Do', 'Doing', 'Done'];
  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${allowedStatuses.join(', ')}` });
  }

  try {
    db.run("UPDATE Tasks SET status = ? WHERE id = ?", [status, taskId], function (err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ message: 'Task not found.' });
      res.json({ message: 'Task status updated.', taskId: parseInt(taskId), status });
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/tasks/:taskId/pricing - Set per-task pricing (local-only, not synced to Notion)
// Body: { fixedPrice: number|null, hourlyRateOverride: number|null } — null clears; at most one may be set
router.patch('/:taskId/pricing', async (req, res, next) => {
  const db = database.getDb();
  const { taskId } = req.params;
  const { fixedPrice = null, hourlyRateOverride = null } = req.body;

  const validAmount = (v) => v === null || (typeof v === 'number' && !isNaN(v) && v >= 0);
  if (!validAmount(fixedPrice) || !validAmount(hourlyRateOverride)) {
    return res.status(400).json({ message: 'fixedPrice and hourlyRateOverride must be non-negative numbers or null.' });
  }
  if (fixedPrice !== null && hourlyRateOverride !== null) {
    return res.status(400).json({ message: 'A task can have a fixed price or an hourly rate override, not both.' });
  }

  try {
    db.run(
      "UPDATE Tasks SET fixedPrice = ?, hourlyRateOverride = ? WHERE id = ?",
      [fixedPrice, hourlyRateOverride, taskId],
      function (err) {
        if (err) return next(err);
        if (this.changes === 0) return res.status(404).json({ message: 'Task not found.' });
        res.json({ message: 'Task pricing updated.', taskId: parseInt(taskId), fixedPrice, hourlyRateOverride });
      }
    );
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:taskId - Get a specific task with its time entries
router.get('/:taskId', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  const { taskId: idOrNotionId } = req.params;
  try {
    const taskQuery = `
      SELECT
        t.*,
        p.name as projectName,
        p.notionId as projectNotionId,
        c.name as clientName,
        c.notionId as clientNotionId,
        (SELECT te_active.startTime FROM TimeEntries te_active WHERE te_active.taskId = t.id AND te_active.endTime IS NULL LIMIT 1) AS activeTimerStartTime
      FROM Tasks t
      LEFT JOIN Projects p ON t.projectId = p.id
      LEFT JOIN Clients c ON p.clientId = c.id
      WHERE t.id = ? OR t.notionId = ?;
    `;
    db.get(taskQuery, [idOrNotionId, idOrNotionId], (err, task) => {
      if (err) return next(err);
      if (!task) return res.status(404).json({ message: 'Task not found' });

      const timeEntriesQuery = "SELECT * FROM TimeEntries WHERE taskId = ? ORDER BY startTime DESC";
      db.all(timeEntriesQuery, [task.id], (err, timeEntries) => {
        if (err) return next(err);
        const totalHoursSpent = timeEntries
          .filter(te => te.duration)
          .reduce((sum, te) => sum + te.duration, 0) / 3600.0;
        res.json({ ...task, timeEntries, totalHoursSpent });
      });
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;