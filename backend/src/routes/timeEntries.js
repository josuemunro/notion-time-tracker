// notion-time-tracker/backend/src/routes/timeEntries.js
const express = require('express');
const router = express.Router();
const database = require('../database'); // Import the database module

// GET /api/time-entries/active - Get the currently active time entry (if any)
router.get('/active', (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  try {
    const query = `
      SELECT
        te.id AS timeEntryId,
        te.startTime,
        t.id AS taskId,
        t.name AS taskName,
        t.notionId AS taskNotionId,
        p.id AS projectId,
        p.name AS projectName,
        p.notionId AS projectNotionId,
        c.id AS clientId,
        c.name AS clientName,
        c.notionId AS clientNotionId
      FROM TimeEntries te
      JOIN Tasks t ON te.taskId = t.id
      JOIN Projects p ON t.projectId = p.id
      JOIN Clients c ON p.clientId = c.id
      WHERE te.endTime IS NULL
      ORDER BY te.startTime DESC
      LIMIT 1;
    `;
    db.get(query, [], (err, row) => {
      if (err) return next(err);
      if (!row) return res.json(null); // No active timer
      res.json(row);
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/time-entries/start - Start a timer for a task
router.post('/start', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  const { taskId } = req.body;

  if (!taskId) {
    return res.status(400).json({ message: 'taskId is required.' });
  }

  try {
    // Using db.serialize to ensure sequential execution for transaction
    db.serialize(async () => {
      try {
        await new Promise((resolve, reject) => db.run('BEGIN TRANSACTION;', err => err ? reject(err) : resolve()));

        const activeTimerQuery = "SELECT id FROM TimeEntries WHERE endTime IS NULL LIMIT 1;";
        const activeTimer = await new Promise((resolve, reject) => {
          db.get(activeTimerQuery, [], (err, row) => err ? reject(err) : resolve(row));
        });

        if (activeTimer) {
          const now = new Date().toISOString();
          const durationQuery = "SELECT (strftime('%s', ?) - strftime('%s', startTime)) FROM TimeEntries WHERE id = ?;";
          const durationResult = await new Promise((resolve, reject) => {
            db.get(durationQuery, [now, activeTimer.id], (err, row) => err ? reject(err) : resolve(row));
          });
          const durationSeconds = durationResult ? Object.values(durationResult)[0] : 0;

          const stopQuery = "UPDATE TimeEntries SET endTime = ?, duration = ? WHERE id = ?;";
          await new Promise((resolve, reject) => {
            db.run(stopQuery, [now, durationSeconds, activeTimer.id], function(err) { err ? reject(err) : resolve(this); });
          });
          console.log(`Timer ${activeTimer.id} stopped due to new timer start.`);
        }

        const task = await new Promise((resolve, reject) => {
            db.get("SELECT notionId FROM Tasks WHERE id = ?", [taskId], (err, row) => err ? reject(err) : resolve(row));
        });
        if (!task) {
            await new Promise((resolve, reject) => db.run('ROLLBACK;', err => err ? reject(err) : resolve()));
            // Important: return here to prevent further execution which leads to headers already sent
            return res.status(404).json({ message: 'Task not found.' });
        }

        const startTime = new Date().toISOString();
        const insertQuery = "INSERT INTO TimeEntries (taskId, notionTaskId, startTime) VALUES (?, ?, ?);";
        const result = await new Promise((resolve, reject) => {
          db.run(insertQuery, [taskId, task.notionId, startTime], function(err) { err ? reject(err) : resolve(this); });
        });

        await new Promise((resolve, reject) => db.run('COMMIT;', err => err ? reject(err) : resolve()));
        // Ensure response is sent only once
        if (!res.headersSent) {
            res.status(201).json({
                message: 'Timer started successfully.',
                timeEntryId: result.lastID,
                taskId: taskId,
                taskNotionId: task.notionId,
                startTime: startTime
            });
        }

      } catch (dbError) {
        await new Promise((resolve, reject) => db.run('ROLLBACK;', err => err ? reject(err) : resolve()));
        if (!res.headersSent) { // Check before passing to next if an error occurred before sending response
            next(dbError);
        } else {
            console.error("DB error after headers sent in /start:", dbError);
        }
      }
    });
  } catch (error) { // Catch errors outside db.serialize (less likely for this structure)
    if (!res.headersSent) {
        next(error);
    } else {
        console.error("Outer error after headers sent in /start:", error);
    }
  }
});

// POST /api/time-entries/:timeEntryId/stop - Stop a specific timer
router.post('/:timeEntryId/stop', (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  const { timeEntryId } = req.params;
  const endTime = new Date().toISOString();

  try {
    db.get("SELECT startTime FROM TimeEntries WHERE id = ? AND endTime IS NULL", [timeEntryId], (err, entry) => {
      if (err) return next(err);
      if (!entry) return res.status(404).json({ message: 'Active time entry not found or already stopped.' });

      const durationQuery = "SELECT (strftime('%s', ?) - strftime('%s', startTime)) FROM TimeEntries WHERE id = ?;";
       db.get(durationQuery, [endTime, timeEntryId], (err, durationResult) => {
        if (err) return next(err);
        const durationSeconds = durationResult ? Object.values(durationResult)[0] : 0;

        const updateQuery = "UPDATE TimeEntries SET endTime = ?, duration = ? WHERE id = ?;";
        db.run(updateQuery, [endTime, durationSeconds, timeEntryId], function(err) {
          if (err) return next(err);
          if (this.changes === 0) {
            return res.status(404).json({ message: 'Timer not found or could not be stopped.' });
          }
          res.json({
            message: 'Timer stopped successfully.',
            timeEntryId: timeEntryId,
            endTime: endTime,
            duration: durationSeconds
          });
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/time-entries - Manually add a time entry
router.post('/', (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  const { taskId, startTime, endTime, duration } = req.body;

  if (!taskId || !startTime) {
    return res.status(400).json({ message: 'taskId and startTime are required.' });
  }
  if (!endTime && (duration === undefined || duration === null)) {
    return res.status(400).json({ message: 'Either endTime or duration (in seconds) is required.' });
  }

  let calculatedEndTime = endTime;
  let calculatedDuration = duration;

  try {
    const parsedStartTime = new Date(startTime);
    if (isNaN(parsedStartTime)) return res.status(400).json({ message: 'Invalid startTime format.' });

    if (endTime) {
        const parsedEndTime = new Date(endTime);
        if (isNaN(parsedEndTime)) return res.status(400).json({ message: 'Invalid endTime format.' });
        if (parsedEndTime < parsedStartTime) return res.status(400).json({ message: 'endTime cannot be before startTime.' });
        calculatedDuration = Math.round((parsedEndTime.getTime() - parsedStartTime.getTime()) / 1000);
        calculatedEndTime = parsedEndTime.toISOString();
    } else { 
        if (typeof duration !== 'number' || duration < 0) return res.status(400).json({ message: 'Invalid duration.' });
        const endMillis = parsedStartTime.getTime() + (duration * 1000);
        calculatedEndTime = new Date(endMillis).toISOString();
    }

    db.get("SELECT notionId FROM Tasks WHERE id = ?", [taskId], (err, task) => {
        if (err) return next(err);
        if (!task) return res.status(404).json({ message: 'Task not found.' });

        const insertQuery = `
            INSERT INTO TimeEntries (taskId, notionTaskId, startTime, endTime, duration)
            VALUES (?, ?, ?, ?, ?);
        `;
        db.run(insertQuery, [taskId, task.notionId, parsedStartTime.toISOString(), calculatedEndTime, calculatedDuration], function(err) {
            if (err) return next(err);
            res.status(201).json({
                message: 'Time entry added successfully.',
                id: this.lastID,
                taskId,
                notionTaskId: task.notionId,
                startTime: parsedStartTime.toISOString(),
                endTime: calculatedEndTime,
                duration: calculatedDuration
            });
        });
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;