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
      LEFT JOIN Tasks t ON te.taskId = t.id
      LEFT JOIN Projects p ON t.projectId = p.id
      LEFT JOIN Clients c ON p.clientId = c.id
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
          // Convert current time to New Zealand timezone for storage
          const now = new Date();
          // New Zealand is UTC+12 (or UTC+13 during daylight saving)
          // Get the actual offset for NZ
          const nzOffset = 12 * 60; // Start with 12 hours in minutes
          const nzTime = new Date(now.getTime() + (nzOffset * 60000));
          const nzTimestamp = nzTime.toISOString();

          const durationQuery = "SELECT (strftime('%s', ?) - strftime('%s', startTime)) FROM TimeEntries WHERE id = ?;";
          const durationResult = await new Promise((resolve, reject) => {
            db.get(durationQuery, [nzTimestamp, activeTimer.id], (err, row) => err ? reject(err) : resolve(row));
          });
          const durationSeconds = durationResult ? Object.values(durationResult)[0] : 0;

          const stopQuery = "UPDATE TimeEntries SET endTime = ?, duration = ? WHERE id = ?;";
          await new Promise((resolve, reject) => {
            db.run(stopQuery, [nzTimestamp, durationSeconds, activeTimer.id], function (err) { err ? reject(err) : resolve(this); });
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

        // Convert current time to New Zealand timezone for storage
        const now = new Date();
        // New Zealand is UTC+12 (or UTC+13 during daylight saving)
        const nzOffset = 12 * 60; // 12 hours in minutes
        const nzTime = new Date(now.getTime() + (nzOffset * 60000));
        const startTime = nzTime.toISOString();
        const insertQuery = "INSERT INTO TimeEntries (taskId, notionTaskId, startTime) VALUES (?, ?, ?);";
        const result = await new Promise((resolve, reject) => {
          db.run(insertQuery, [taskId, task.notionId, startTime], function (err) { err ? reject(err) : resolve(this); });
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

// POST /api/time-entries - Create a manual time entry
router.post('/', (req, res, next) => {
  const db = database.getDb();
  const { taskId, startTime, endTime, duration } = req.body;

  if (!taskId || !startTime || !endTime) {
    return res.status(400).json({ message: 'taskId, startTime, and endTime are required.' });
  }

  try {
    // Verify the task exists and get its notionId
    db.get("SELECT notionId FROM Tasks WHERE id = ?", [taskId], (err, task) => {
      if (err) return next(err);
      if (!task) {
        return res.status(404).json({ message: 'Task not found.' });
      }

      // Calculate duration if not provided
      const calculatedDuration = duration || Math.floor((new Date(endTime) - new Date(startTime)) / 1000);

      const insertQuery = "INSERT INTO TimeEntries (taskId, notionTaskId, startTime, endTime, duration) VALUES (?, ?, ?, ?, ?)";
      db.run(insertQuery, [taskId, task.notionId, startTime, endTime, calculatedDuration], function (err) {
        if (err) return next(err);

        console.log('Manual time entry created - ID:', this.lastID, 'Duration:', calculatedDuration, 'seconds');
        res.status(201).json({
          message: 'Time entry created successfully.',
          timeEntryId: this.lastID,
          taskId: taskId,
          taskNotionId: task.notionId,
          startTime: startTime,
          endTime: endTime,
          duration: calculatedDuration
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/time-entries/:timeEntryId/stop - Stop a specific timer
router.post('/:timeEntryId/stop', (req, res, next) => {
  const db = database.getDb();
  const { timeEntryId } = req.params;

  // Convert current time to New Zealand timezone for storage
  const now = new Date();
  // New Zealand is UTC+12 (or UTC+13 during daylight saving)
  const nzOffset = 12 * 60; // 12 hours in minutes
  const nzTime = new Date(now.getTime() + (nzOffset * 60000));
  const endTime = nzTime.toISOString();

  try {
    db.get("SELECT startTime FROM TimeEntries WHERE id = ? AND endTime IS NULL", [timeEntryId], (err, entry) => {
      if (err) return next(err);
      if (!entry) return res.status(404).json({ message: 'Active time entry not found or already stopped.' });

      const durationQuery = "SELECT (strftime('%s', ?) - strftime('%s', startTime)) FROM TimeEntries WHERE id = ?;";
      db.get(durationQuery, [endTime, timeEntryId], (err, durationResult) => {
        if (err) return next(err);
        const durationSeconds = durationResult ? Object.values(durationResult)[0] : 0;

        const updateQuery = "UPDATE TimeEntries SET endTime = ?, duration = ? WHERE id = ?;";
        db.run(updateQuery, [endTime, durationSeconds, timeEntryId], function (err) {
          if (err) return next(err);
          if (this.changes === 0) {
            return res.status(404).json({ message: 'Timer not found or could not be stopped.' });
          }
          console.log('Timer stopped - Entry ID:', timeEntryId, 'Duration:', durationSeconds, 'EndTime:', endTime);
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

// PUT /api/time-entries/:timeEntryId - Update a time entry
router.put('/:timeEntryId', (req, res, next) => {
  const db = database.getDb();
  const { timeEntryId } = req.params;
  const { startTime, endTime, duration } = req.body;

  if (!startTime || !endTime) {
    return res.status(400).json({ message: 'startTime and endTime are required.' });
  }

  try {
    // Calculate duration if not provided
    const calculatedDuration = duration || Math.floor((new Date(endTime) - new Date(startTime)) / 1000);

    const updateQuery = "UPDATE TimeEntries SET startTime = ?, endTime = ?, duration = ? WHERE id = ?";
    db.run(updateQuery, [startTime, endTime, calculatedDuration, timeEntryId], function (err) {
      if (err) return next(err);

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Time entry not found.' });
      }

      console.log('Time entry updated - ID:', timeEntryId, 'Duration:', calculatedDuration, 'seconds');
      res.json({
        message: 'Time entry updated successfully.',
        timeEntryId: timeEntryId,
        startTime: startTime,
        endTime: endTime,
        duration: calculatedDuration
      });
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/time-entries/:timeEntryId - Delete a time entry
router.delete('/:timeEntryId', (req, res, next) => {
  const db = database.getDb();
  const { timeEntryId } = req.params;

  try {
    const deleteQuery = "DELETE FROM TimeEntries WHERE id = ?";
    db.run(deleteQuery, [timeEntryId], function (err) {
      if (err) return next(err);

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Time entry not found.' });
      }

      console.log('Time entry deleted - ID:', timeEntryId);
      res.json({
        message: 'Time entry deleted successfully.',
        timeEntryId: timeEntryId
      });
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/time-entries - Get time entries with optional date filtering
router.get('/', (req, res, next) => {
  const db = database.getDb();
  const { date, startDate, endDate } = req.query;

  let query = `
    SELECT
      te.id AS timeEntryId,
      te.startTime,
      te.endTime,
      te.duration,
      t.id AS taskId,
      t.name AS taskName,
      t.notionId AS taskNotionId,
      p.id AS projectId,
      p.name AS projectName,
      p.notionId AS projectNotionId,
      p.iconType AS projectIconType,
      p.iconValue AS projectIconValue,
      p.color AS projectColor,
      c.id AS clientId,
      c.name AS clientName,
      c.notionId AS clientNotionId
    FROM TimeEntries te
    LEFT JOIN Tasks t ON te.taskId = t.id
    LEFT JOIN Projects p ON t.projectId = p.id
    LEFT JOIN Clients c ON p.clientId = c.id
  `;

  const params = [];
  const conditions = [];

  if (date) {
    // Get entries for a specific date (YYYY-MM-DD)
    // Use SUBSTR to extract date part from ISO datetime string
    conditions.push("SUBSTR(te.startTime, 1, 10) = ?");
    params.push(date);
  } else if (startDate && endDate) {
    // Get entries between two dates
    conditions.push("SUBSTR(te.startTime, 1, 10) >= ? AND SUBSTR(te.startTime, 1, 10) <= ?");
    params.push(startDate, endDate);
  } else if (startDate) {
    // Get entries from startDate onwards
    conditions.push("SUBSTR(te.startTime, 1, 10) >= ?");
    params.push(startDate);
  } else if (endDate) {
    // Get entries up to endDate
    conditions.push("SUBSTR(te.startTime, 1, 10) <= ?");
    params.push(endDate);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY te.startTime ASC";

  try {
    console.log('Time Entries API - Query:', query);
    console.log('Time Entries API - Params:', params);

    // Debug: Let's check what the SUBSTR actually returns
    if (date) {
      const debugQuery = `
        SELECT 
          te.id,
          te.startTime,
          SUBSTR(te.startTime, 1, 10) as extractedDate,
          ? as requestedDate
        FROM TimeEntries te 
        LIMIT 5
      `;
      db.all(debugQuery, [date], (err, debugRows) => {
        if (!err) {
          console.log('DEBUG - Date extraction comparison:', debugRows);
        }
      });
    }

    db.all(query, params, (err, rows) => {
      if (err) return next(err);
      console.log('Time Entries API - Results:', rows);
      res.json(rows);
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;