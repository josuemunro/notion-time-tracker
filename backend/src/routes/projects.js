// notion-time-tracker/backend/src/routes/projects.js
const express = require('express');
const router = express.Router();
const database = require('../database'); // Import the database module
const { dbRun, dbGet, dbAll } = database;
const { nowIso } = require('../utils/time'); // Timestamps are real UTC ISO strings
const billing = require('../services/billing');

// Project list rows with logged time, client info and the unbilled summary
// (amount ex GST, hours, task count, last bill date) from services/billing.
async function listProjects(whereClause = '') {
  const db = database.getDb();
  const rows = await new Promise((resolve, reject) => db.all(`
    SELECT
      p.id,
      p.notionId,
      p.name,
      p.hourlyRate,
      p.status,
      p.iconType,
      p.iconValue,
      p.color,
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
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.name COLLATE NOCASE;
  `, [], (err, result) => (err ? reject(err) : resolve(result))));
  const summaries = await billing.getUnbilledSummaries();
  return rows.map(row => ({ ...row, ...summaries[row.id] }));
}

// GET /api/projects - Get all projects with aggregated time, client info and unbilled summary
router.get('/', async (req, res, next) => {
  try {
    res.json(await listProjects());
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/active - Active projects with aggregated time, client info and unbilled summary
router.get('/active', async (req, res, next) => {
  try {
    res.json(await listProjects("WHERE p.status IN ('Proposal', 'In progress', 'Ongoing')"));
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:projectId - A project with its tasks (incl. invoice dates, payment
// splits, unbilled hours), logged time, billingItems (what's unbilled and when to
// invoice it — services/billing) and billedTotals (bills so far, ex GST)
router.get('/:projectId', async (req, res, next) => {
  const { projectId: idOrNotionId } = req.params;
  try {
    const project = await dbGet(`
      SELECT
        p.id, p.notionId, p.name, p.hourlyRate, p.status, p.iconType, p.iconValue, p.color,
        p.invoiceDayOfMonth, p.paymentTermsDays, p.createdAt, p.updatedAt,
        c.id AS clientId,
        c.name AS clientName,
        COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent
      FROM Projects p
      LEFT JOIN Clients c ON p.clientId = c.id
      LEFT JOIN Tasks t ON p.id = t.projectId
      LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
      WHERE (p.id = ? OR p.notionId = ?)
      GROUP BY p.id
    `, [idOrNotionId, idOrNotionId]);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const tasks = await dbAll(`
      SELECT
        t.id, t.notionId, t.name, t.status, t.isBillable, t.beenBilled, t.isManual,
        t.fixedPrice, t.hourlyRateOverride, t.invoiceDate,
        COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent,
        COALESCE(SUM(CASE WHEN te.billId IS NULL THEN te.duration END), 0) / 3600.0 AS unbilledHours,
        (SELECT te_active.startTime FROM TimeEntries te_active WHERE te_active.taskId = t.id AND te_active.endTime IS NULL LIMIT 1) AS activeTimerStartTime
      FROM Tasks t
      LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
      WHERE t.projectId = ?
      GROUP BY t.id
      ORDER BY t.name COLLATE NOCASE
    `, [project.id]);

    const [installmentsByTask, billingItems, billedTotals] = await Promise.all([
      billing.getInstallmentsByTask(tasks.map(t => t.id)),
      billing.getProjectBillingItems(project.id),
      billing.getBilledTotals(project.id),
    ]);
    res.json({
      ...project,
      tasks: tasks.map(t => ({ ...t, installments: installmentsByTask.get(t.id) || [] })),
      billingItems,
      billedTotals,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/projects - Create a manual (local-only) project
router.post('/', async (req, res, next) => {
  const db = database.getDb();
  const { name, color, iconEmoji } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Project name is required.' });
  }

  const syntheticNotionId = `local-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const insertQuery = `
      INSERT INTO Projects (notionId, name, status, isManual, iconType, iconValue, color)
      VALUES (?, ?, 'In progress', 1, ?, ?, ?)
    `;

    db.run(insertQuery, [
      syntheticNotionId,
      name.trim(),
      iconEmoji ? 'emoji' : null,
      iconEmoji || null,
      color || null
    ], function (err) {
      if (err) return next(err);
      res.status(201).json({
        message: 'Project created successfully.',
        project: {
          id: this.lastID,
          notionId: syntheticNotionId,
          name: name.trim(),
          status: 'In progress',
          isManual: true,
          iconType: iconEmoji ? 'emoji' : null,
          iconValue: iconEmoji || null,
          color: color || null
        }
      });
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/projects/:projectId - Update a project's local properties.
// Body (any subset): color, hourlyRate, invoiceDayOfMonth (1-31 or null = invoice
// as soon as work is done), paymentTermsDays (0-365 or null = unknown)
router.put('/:projectId', async (req, res, next) => {
  const { projectId } = req.params;
  const { color, hourlyRate, invoiceDayOfMonth, paymentTermsDays } = req.body;

  if (!color && hourlyRate === undefined && invoiceDayOfMonth === undefined && paymentTermsDays === undefined) {
    return res.status(400).json({ message: 'Nothing to update: pass color, hourlyRate, invoiceDayOfMonth or paymentTermsDays.' });
  }

  // Validate hex color format if provided
  if (color) {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexColorRegex.test(color)) {
      return res.status(400).json({ message: 'color must be a valid hex color (e.g., #FF5733 or #F53)' });
    }
  }

  // Validate hourlyRate if provided
  if (hourlyRate !== undefined && (isNaN(hourlyRate) || hourlyRate < 0)) {
    return res.status(400).json({ message: 'hourlyRate must be a non-negative number.' });
  }

  const intInRange = (v, min, max) => v === null || (Number.isInteger(v) && v >= min && v <= max);
  if (invoiceDayOfMonth !== undefined && !intInRange(invoiceDayOfMonth, 1, 31)) {
    return res.status(400).json({ message: 'invoiceDayOfMonth must be a whole number from 1 to 31, or null.' });
  }
  if (paymentTermsDays !== undefined && !intInRange(paymentTermsDays, 0, 365)) {
    return res.status(400).json({ message: 'paymentTermsDays must be a whole number from 0 to 365, or null.' });
  }

  const fields = { color: color || undefined, hourlyRate, invoiceDayOfMonth, paymentTermsDays };
  const updates = Object.entries(fields).filter(([, v]) => v !== undefined);

  try {
    const result = await dbRun(
      `UPDATE Projects SET ${updates.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ? OR notionId = ?`,
      [...updates.map(([, v]) => v), projectId, projectId]
    );
    if (result.changes === 0) return res.status(404).json({ message: 'Project not found.' });
    res.json({ message: 'Project updated successfully.', projectId, ...Object.fromEntries(updates) });
  } catch (error) {
    next(error);
  }
});

// POST /api/projects/:projectId/bills - Create a bill snapshot and mark what it covers as billed.
// Body: { taskIds?: number[], installmentIds?: number[] }
// - hourly tasks bill their time entries not yet on a bill (hours so far); the
//   entries get this billId, so time logged later shows up as unbilled again
// - fixed-price tasks bill their price once (beenBilled)
// - split fixed-price tasks are billed through their payments (installmentIds);
//   the task counts as billed once every payment is
// A task's invoiceDate is used up by billing it (kept on the line for undo).
router.post('/:projectId/bills', async (req, res, next) => {
  const { projectId } = req.params;
  const { taskIds = [], installmentIds = [] } = req.body;
  const isIdList = (v) => Array.isArray(v) && v.every(id => Number.isInteger(id));

  if (!isIdList(taskIds) || !isIdList(installmentIds) || taskIds.length + installmentIds.length === 0) {
    return res.status(400).json({ message: 'Pass taskIds and/or installmentIds (arrays of ids); at least one item is required.' });
  }
  const placeholders = (list) => list.map(() => '?').join(',');

  try {
    const project = await dbGet(`SELECT id, hourlyRate FROM Projects WHERE id = ? OR notionId = ?`, [projectId, projectId]);
    if (!project) return res.status(404).json({ message: 'Project not found.' });

    // Snapshot each task's name, pricing and the time this bill covers
    const tasks = taskIds.length === 0 ? [] : await dbAll(`
      SELECT t.id, t.name, t.fixedPrice, t.hourlyRateOverride, t.beenBilled, t.invoiceDate,
             (SELECT COUNT(*) FROM TaskInstallments i WHERE i.taskId = t.id) AS installmentCount
      FROM Tasks t
      WHERE t.id IN (${placeholders(taskIds)}) AND t.projectId = ?
    `, [...taskIds, project.id]);
    if (tasks.length !== taskIds.length) {
      return res.status(400).json({ message: 'Some tasks do not belong to this project.' });
    }
    const splitTask = tasks.find(t => t.installmentCount > 0);
    if (splitTask) {
      return res.status(400).json({ message: `"${splitTask.name}" is split into payments; bill its payments instead.` });
    }

    // Finished entries not yet on a bill: hourly tasks bill exactly these
    const entries = taskIds.length === 0 ? [] : await dbAll(`
      SELECT id, taskId, duration FROM TimeEntries
      WHERE taskId IN (${placeholders(taskIds)}) AND endTime IS NOT NULL AND billId IS NULL
    `, taskIds);
    for (const t of tasks) {
      const own = entries.filter(e => e.taskId === t.id);
      t.entryIds = own.map(e => e.id);
      t.unbilledHours = own.reduce((sum, e) => sum + (e.duration || 0), 0) / 3600;
    }
    const empty = tasks.find(t => (t.fixedPrice != null ? t.beenBilled : t.entryIds.length === 0));
    if (empty) {
      return res.status(409).json({ message: `"${empty.name}" has nothing left to bill.` });
    }

    const installments = installmentIds.length === 0 ? [] : await dbAll(`
      SELECT i.id, i.taskId, i.label, i.amount, i.billId, t.name AS taskName
      FROM TaskInstallments i JOIN Tasks t ON t.id = i.taskId
      WHERE i.id IN (${placeholders(installmentIds)}) AND t.projectId = ?
    `, [...installmentIds, project.id]);
    if (installments.length !== installmentIds.length) {
      return res.status(400).json({ message: 'Some payments do not belong to this project.' });
    }
    if (installments.some(i => i.billId != null)) {
      return res.status(409).json({ message: 'Some payments have already been billed.' });
    }

    // Billing rules live in services/billing (mirrored in frontend billingUtils.js);
    // a payment is a fixed-price line with no hours of its own. Fixed-price task
    // lines carry their unbilled hours for the record only.
    const { totalHours, roundedHours, fixedAmount, subtotal, gst, total, rate } = billing.computeBillTotals([
      ...tasks.map(t => ({ hours: t.unbilledHours, fixedPrice: t.fixedPrice, hourlyRateOverride: t.hourlyRateOverride })),
      ...installments.map(i => ({ hours: 0, fixedPrice: i.amount, hourlyRateOverride: null })),
    ], project.hourlyRate);
    const createdAt = nowIso();

    await dbRun('BEGIN TRANSACTION;');
    let billId;
    try {
      ({ lastID: billId } = await dbRun(
        `INSERT INTO Bills (projectId, totalHours, roundedHours, hourlyRate, subtotal, gst, total, fixedAmount, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [project.id, totalHours, roundedHours, rate, subtotal, gst, total, fixedAmount, createdAt]
      ));
      const insertLine = `INSERT INTO BillTasks (billId, taskId, taskName, hoursSpent, fixedPrice, rate, installmentId, taskInvoiceDate)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      for (const t of tasks) {
        await dbRun(insertLine, [
          billId, t.id, t.name, t.unbilledHours,
          t.fixedPrice != null ? t.fixedPrice : null,
          t.fixedPrice != null ? null : (t.hourlyRateOverride != null ? t.hourlyRateOverride : rate),
          null,
          t.invoiceDate || null,
        ]);
        if (t.entryIds.length) {
          await dbRun(`UPDATE TimeEntries SET billId = ? WHERE id IN (${placeholders(t.entryIds)})`, [billId, ...t.entryIds]);
        }
      }
      for (const i of installments) {
        await dbRun(insertLine, [billId, i.taskId, `${i.taskName} — ${i.label || 'Payment'}`, 0, i.amount, null, i.id, null]);
      }
      if (taskIds.length) {
        await dbRun(`UPDATE Tasks SET invoiceDate = NULL WHERE id IN (${placeholders(taskIds)})`, taskIds);
        const fixedIds = tasks.filter(t => t.fixedPrice != null).map(t => t.id);
        if (fixedIds.length) {
          await dbRun(`UPDATE Tasks SET beenBilled = 1 WHERE id IN (${placeholders(fixedIds)})`, fixedIds);
        }
      }
      if (installmentIds.length) {
        await dbRun(`UPDATE TaskInstallments SET billId = ? WHERE id IN (${placeholders(installmentIds)})`, [billId, ...installmentIds]);
        const splitTaskIds = [...new Set(installments.map(i => i.taskId))];
        await dbRun(`
          UPDATE Tasks SET beenBilled = 1
          WHERE id IN (${placeholders(splitTaskIds)})
            AND NOT EXISTS (SELECT 1 FROM TaskInstallments i WHERE i.taskId = Tasks.id AND i.billId IS NULL)
        `, splitTaskIds);
      }
      await dbRun('COMMIT;');
    } catch (err) {
      await dbRun('ROLLBACK;').catch(() => { });
      throw err;
    }

    console.log(`Bill ${billId} created for project ${project.id}: ${tasks.length} tasks (${entries.length} entries), ${installments.length} payments.`);
    res.status(201).json({
      message: 'Bill created successfully.',
      billId, createdAt, totalHours, roundedHours,
      hourlyRate: rate, subtotal, gst, total, fixedAmount,
      tasks: tasks.map(({ entryIds, ...t }) => ({ ...t, hoursSpent: t.unbilledHours, entryCount: entryIds.length })),
      installments
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:projectId/bills - List bills (newest first) with their task snapshots
router.get('/:projectId/bills', (req, res, next) => {
  const db = database.getDb();
  const { projectId } = req.params;

  db.get(`SELECT id FROM Projects WHERE id = ? OR notionId = ?`, [projectId, projectId], (err, project) => {
    if (err) return next(err);
    if (!project) return res.status(404).json({ message: 'Project not found.' });

    db.all(`SELECT * FROM Bills WHERE projectId = ? ORDER BY createdAt DESC, id DESC`, [project.id], (err, bills) => {
      if (err) return next(err);
      if (bills.length === 0) return res.json([]);

      const billIds = bills.map(b => b.id);
      const taskQuery = `SELECT * FROM BillTasks WHERE billId IN (${billIds.map(() => '?').join(',')}) ORDER BY taskName COLLATE NOCASE`;
      db.all(taskQuery, billIds, (err, rows) => {
        if (err) return next(err);
        const tasksByBill = {};
        rows.forEach(r => {
          (tasksByBill[r.billId] = tasksByBill[r.billId] || []).push(r);
        });
        res.json(bills.map(b => ({ ...b, tasks: tasksByBill[b.id] || [] })));
      });
    });
  });
});

// DELETE /api/projects/:projectId/bills/:billId - Delete a bill and undo what it marked:
// its time entries and payments go back to unbilled, tasks get back the invoice
// date the bill used up, and beenBilled is recomputed from the bills that remain.
router.delete('/:projectId/bills/:billId', async (req, res, next) => {
  const { billId } = req.params;
  try {
    const lines = await dbAll(`SELECT taskId, taskInvoiceDate FROM BillTasks WHERE billId = ?`, [billId]);
    const taskIds = [...new Set(lines.map(l => l.taskId).filter(id => id != null))];
    const placeholders = taskIds.map(() => '?').join(',');

    await dbRun('BEGIN TRANSACTION;');
    try {
      const result = await dbRun(`DELETE FROM Bills WHERE id = ?`, [billId]);
      if (result.changes === 0) {
        await dbRun('ROLLBACK;');
        return res.status(404).json({ message: 'Bill not found.' });
      }
      // Explicit child cleanup — sqlite3 doesn't enable FK cascades by default
      await dbRun(`DELETE FROM BillTasks WHERE billId = ?`, [billId]);
      await dbRun(`UPDATE TimeEntries SET billId = NULL WHERE billId = ?`, [billId]);
      await dbRun(`UPDATE TaskInstallments SET billId = NULL WHERE billId = ?`, [billId]);
      for (const line of lines) {
        if (line.taskId != null && line.taskInvoiceDate) {
          await dbRun(`UPDATE Tasks SET invoiceDate = ? WHERE id = ? AND invoiceDate IS NULL`, [line.taskInvoiceDate, line.taskId]);
        }
      }
      if (taskIds.length) {
        // Split task: billed once every payment is. Fixed price: billed if a remaining
        // bill charged it. Hourly: tracked per entry, so never flagged.
        await dbRun(`
          UPDATE Tasks SET beenBilled = CASE
            WHEN EXISTS (SELECT 1 FROM TaskInstallments i WHERE i.taskId = Tasks.id)
              THEN NOT EXISTS (SELECT 1 FROM TaskInstallments i WHERE i.taskId = Tasks.id AND i.billId IS NULL)
            WHEN Tasks.fixedPrice IS NOT NULL
              THEN EXISTS (SELECT 1 FROM BillTasks bt WHERE bt.taskId = Tasks.id AND bt.installmentId IS NULL AND bt.fixedPrice IS NOT NULL)
            ELSE 0
          END
          WHERE id IN (${placeholders})
        `, taskIds);
      }
      await dbRun('COMMIT;');
    } catch (err) {
      await dbRun('ROLLBACK;').catch(() => { });
      throw err;
    }

    console.log(`Bill ${billId} deleted; ${taskIds.length} tasks un-billed.`);
    res.json({ message: 'Bill deleted successfully.', billId, tasksUnbilled: taskIds.length });
  } catch (error) {
    next(error);
  }
});

// POST /api/projects/test - Create a test project with billable tasks
router.post('/test', async (req, res, next) => {
  const db = database.getDb();

  try {
    // Create test project
    const projectQuery = `
      INSERT INTO Projects (notionId, name, hourlyRate, status, iconType, iconValue, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const projectNotionId = 'test-project-' + Date.now();

    db.run(projectQuery, [
      projectNotionId,
      'Test Billing Project',
      85.0,
      'In Progress',
      'emoji',
      '🧪',
      '#10b981'
    ], function (projectErr) {
      if (projectErr) return next(projectErr);

      const projectId = this.lastID;

      // Create test tasks
      const taskQuery = `
        INSERT INTO Tasks (notionId, name, projectId, status, isBillable, beenBilled)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const testTasks = [
        ['test-task-1-' + Date.now(), 'Design Homepage', 'Done', true, false],
        ['test-task-2-' + Date.now(), 'Setup Backend API', 'Done', true, false],
        ['test-task-3-' + Date.now(), 'Create Database Schema', 'Done', true, true],
        ['test-task-4-' + Date.now(), 'Write Tests', 'In Progress', true, false],
        ['test-task-5-' + Date.now(), 'Team Meeting', 'Done', false, false],
        ['test-task-6-' + Date.now(), 'Code Review', 'Done', true, false]
      ];

      let completedTasks = 0;

      testTasks.forEach(([notionId, name, status, isBillable, beenBilled]) => {
        db.run(taskQuery, [notionId, name, projectId, status, isBillable ? 1 : 0, beenBilled ? 1 : 0], (taskErr) => {
          if (taskErr) console.error('Error creating test task:', taskErr);
          completedTasks++;

          if (completedTasks === testTasks.length) {
            // Create some time entries for the tasks
            const timeEntryQuery = `
              INSERT INTO TimeEntries (taskId, notionTaskId, startTime, endTime, duration)
              VALUES (?, ?, ?, ?, ?)
            `;

            // Add time entries for some tasks
            const baseTime = new Date();
            baseTime.setHours(9, 0, 0, 0);

            // Get the actual task IDs from the database
            db.all(`SELECT id, name FROM Tasks WHERE projectId = ?`, [projectId], (err, tasks) => {
              if (err) {
                console.error('Error fetching task IDs:', err);
                return res.json({
                  message: 'Test project created successfully',
                  projectId: projectId,
                  tasksCreated: testTasks.length
                });
              }

              const taskMap = {};
              tasks.forEach(task => {
                taskMap[task.name] = task.id;
              });

              // Add time entries for specific tasks
              const timeEntries = [
                {
                  taskId: taskMap['Design Homepage'],
                  hours: 2.5,
                  offset: 0
                },
                {
                  taskId: taskMap['Setup Backend API'],
                  hours: 3.25,
                  offset: 4
                },
                {
                  taskId: taskMap['Create Database Schema'],
                  hours: 1.75,
                  offset: 8
                },
                {
                  taskId: taskMap['Write Tests'],
                  hours: 4.0,
                  offset: 10
                },
                {
                  taskId: taskMap['Code Review'],
                  hours: 1.5,
                  offset: 15
                }
              ];

              let completedEntries = 0;

              timeEntries.forEach(({ taskId, hours, offset }) => {
                if (taskId) {
                  const startTime = new Date(baseTime.getTime() + offset * 60 * 60 * 1000);
                  const endTime = new Date(startTime.getTime() + hours * 60 * 60 * 1000);

                  db.run(timeEntryQuery, [
                    taskId,
                    `test-task-${taskId}-${Date.now()}`,
                    startTime.toISOString(),
                    endTime.toISOString(),
                    hours * 3600
                  ], (entryErr) => {
                    if (entryErr) console.error('Error creating time entry:', entryErr);
                    completedEntries++;

                    if (completedEntries === timeEntries.length) {
                      res.json({
                        message: 'Test project created successfully',
                        projectId: projectId,
                        tasksCreated: testTasks.length,
                        timeEntriesCreated: timeEntries.length
                      });
                    }
                  });
                } else {
                  completedEntries++;
                  if (completedEntries === timeEntries.length) {
                    res.json({
                      message: 'Test project created successfully',
                      projectId: projectId,
                      tasksCreated: testTasks.length,
                      timeEntriesCreated: completedEntries
                    });
                  }
                }
              });
            });
          }
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/projects/:projectId - Delete a project with its tasks, time entries and payment splits
router.delete('/:projectId', async (req, res, next) => {
  const { projectId } = req.params;
  try {
    // Children first (sqlite3 doesn't enable FK cascades by default)
    await dbRun(`DELETE FROM TimeEntries WHERE taskId IN (SELECT id FROM Tasks WHERE projectId = ?)`, [projectId]);
    await dbRun(`DELETE FROM TaskInstallments WHERE taskId IN (SELECT id FROM Tasks WHERE projectId = ?)`, [projectId]);
    await dbRun(`DELETE FROM Tasks WHERE projectId = ?`, [projectId]);
    const result = await dbRun(`DELETE FROM Projects WHERE id = ?`, [projectId]);
    if (result.changes === 0) return res.status(404).json({ message: 'Project not found.' });
    res.json({ message: 'Project deleted successfully', projectId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;