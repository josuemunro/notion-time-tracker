// notion-time-tracker/backend/src/routes/tasks.js
const express = require('express');
const router = express.Router();
const database = require('../database'); // Import the database module
const { dbRun, dbGet, dbAll } = database;
const { isDateString } = require('../utils/time');

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

// Per-task billing plan (local-only, never synced to Notion): pricing, when to
// invoice, a fixed-price payment split, and — for local tasks — billable.
const roundCents = (n) => Math.round(n * 100) / 100;

async function getTaskBillingPlan(taskId) {
  const task = await dbGet(`
    SELECT t.id, t.name, t.status, t.isManual, t.isBillable, t.beenBilled, t.fixedPrice,
           t.hourlyRateOverride, t.invoiceDate, t.projectId,
           p.name AS projectName, p.hourlyRate AS projectHourlyRate,
           p.invoiceDayOfMonth AS projectInvoiceDayOfMonth, p.paymentTermsDays AS projectPaymentTermsDays
    FROM Tasks t LEFT JOIN Projects p ON p.id = t.projectId
    WHERE t.id = ?
  `, [taskId]);
  if (!task) return null;
  const installments = await dbAll(
    `SELECT id, label, amount, dueDate, billId, sortOrder FROM TaskInstallments WHERE taskId = ? ORDER BY sortOrder, id`,
    [task.id]
  );
  return { ...task, isManual: !!task.isManual, isBillable: !!task.isBillable, beenBilled: !!task.beenBilled, installments };
}

// GET /api/tasks/:taskId/billing - The task's billing plan (pricing, invoice date, payment split)
router.get('/:taskId/billing', async (req, res, next) => {
  try {
    const plan = await getTaskBillingPlan(req.params.taskId);
    if (!plan) return res.status(404).json({ message: 'Task not found.' });
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

// PUT /api/tasks/:taskId/billing - Replace the task's billing plan.
// Body: { fixedPrice: number|null, hourlyRateOverride: number|null (at most one set),
//         invoiceDate: 'YYYY-MM-DD'|null (null = follow the project's schedule),
//         installments: [{ label, amount, dueDate: 'YYYY-MM-DD'|null }] (fixed price only),
//         isBillable?: boolean (local tasks only — Notion tasks get it from Notion) }
// `installments` lists the *unbilled* payments; already-invoiced ones are kept as
// they are. Together they must add up to the fixed price.
router.put('/:taskId/billing', async (req, res, next) => {
  const { taskId } = req.params;
  const { fixedPrice = null, hourlyRateOverride = null, invoiceDate = null, installments = [], isBillable } = req.body;

  const validAmount = (v) => v === null || (typeof v === 'number' && !isNaN(v) && v >= 0);
  if (!validAmount(fixedPrice) || !validAmount(hourlyRateOverride)) {
    return res.status(400).json({ message: 'fixedPrice and hourlyRateOverride must be non-negative numbers or null.' });
  }
  if (fixedPrice !== null && hourlyRateOverride !== null) {
    return res.status(400).json({ message: 'A task can have a fixed price or an hourly rate override, not both.' });
  }
  if (invoiceDate !== null && !isDateString(invoiceDate)) {
    return res.status(400).json({ message: 'invoiceDate must be a YYYY-MM-DD date or null.' });
  }
  if (isBillable !== undefined && typeof isBillable !== 'boolean') {
    return res.status(400).json({ message: 'isBillable must be a boolean.' });
  }
  const validInstallment = (i) => i
    && typeof i.amount === 'number' && !isNaN(i.amount) && i.amount > 0
    && (i.dueDate == null || isDateString(i.dueDate))
    && (i.label == null || (typeof i.label === 'string' && i.label.length <= 80));
  if (!Array.isArray(installments) || !installments.every(validInstallment)) {
    return res.status(400).json({ message: 'Each payment needs an amount above 0, an optional label (max 80 chars) and a YYYY-MM-DD dueDate or null.' });
  }

  try {
    const task = await dbGet('SELECT id, isManual, beenBilled FROM Tasks WHERE id = ?', [taskId]);
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    const billed = await dbAll('SELECT amount FROM TaskInstallments WHERE taskId = ? AND billId IS NOT NULL', [task.id]);

    if (installments.length > 0 || billed.length > 0) {
      if (fixedPrice === null) {
        return res.status(billed.length ? 409 : 400).json({
          message: billed.length
            ? 'Some payments of this task are already invoiced, so it has to stay fixed-price. Delete those bills first to change its pricing.'
            : 'Only fixed-price tasks can be split into payments.',
        });
      }
      const scheduled = roundCents([...billed, ...installments].reduce((sum, i) => sum + i.amount, 0));
      if (Math.abs(scheduled - roundCents(fixedPrice)) > 0.005) {
        return res.status(400).json({
          message: `The payments add up to $${scheduled.toFixed(2)} but the fixed price is $${roundCents(fixedPrice).toFixed(2)}.`,
        });
      }
      if (task.beenBilled && billed.length === 0 && installments.length > 0) {
        return res.status(409).json({ message: 'This task has already been billed in full, so it can\'t be split into payments.' });
      }
    }

    await dbRun('BEGIN TRANSACTION;');
    try {
      const setBillable = task.isManual && isBillable !== undefined;
      await dbRun(
        `UPDATE Tasks SET fixedPrice = ?, hourlyRateOverride = ?, invoiceDate = ?${setBillable ? ', isBillable = ?' : ''} WHERE id = ?`,
        [fixedPrice, hourlyRateOverride, invoiceDate, ...(setBillable ? [isBillable ? 1 : 0] : []), task.id]
      );
      // Unbilled payments are replaced wholesale; invoiced ones stay put
      await dbRun('DELETE FROM TaskInstallments WHERE taskId = ? AND billId IS NULL', [task.id]);
      for (const [index, inst] of installments.entries()) {
        await dbRun(
          'INSERT INTO TaskInstallments (taskId, label, amount, dueDate, sortOrder) VALUES (?, ?, ?, ?, ?)',
          [task.id, inst.label?.trim() || null, roundCents(inst.amount), inst.dueDate || null, billed.length + index]
        );
      }
      // A split task is billed once every payment is
      if (installments.length > 0) {
        await dbRun('UPDATE Tasks SET beenBilled = 0 WHERE id = ?', [task.id]);
      } else if (billed.length > 0) {
        await dbRun('UPDATE Tasks SET beenBilled = 1 WHERE id = ?', [task.id]);
      }
      await dbRun('COMMIT;');
    } catch (err) {
      await dbRun('ROLLBACK;').catch(() => { });
      throw err;
    }
    res.json(await getTaskBillingPlan(task.id));
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