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
          const now = new Date().toISOString();
          const durationQuery = "SELECT (strftime('%s', ?) - strftime('%s', startTime)) FROM TimeEntries WHERE id = ?;";
          const durationResult = await new Promise((resolve, reject) => {
            db.get(durationQuery, [now, activeTimer.id], (err, row) => err ? reject(err) : resolve(row));
          });
          const durationSeconds = durationResult ? Object.values(durationResult)[0] : 0;

          const stopQuery = "UPDATE TimeEntries SET endTime = ?, duration = ? WHERE id = ?;";
          await new Promise((resolve, reject) => {
            db.run(stopQuery, [now, durationSeconds, activeTimer.id], function (err) { err ? reject(err) : resolve(this); });
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

// PUT /api/time-entries/:timeEntryId - Update a time entry
router.put('/:timeEntryId', (req, res, next) => {
  const db = database.getDb();
  const { timeEntryId } = req.params;
  const { startTime, endTime, duration } = req.body;

  if (!startTime) {
    return res.status(400).json({ message: 'startTime is required.' });
  }

  let calculatedEndTime = endTime;
  let calculatedDuration = duration;

  try {
    const parsedStartTime = new Date(startTime);
    if (isNaN(parsedStartTime)) {
      return res.status(400).json({ message: 'Invalid startTime format.' });
    }

    if (endTime) {
      const parsedEndTime = new Date(endTime);
      if (isNaN(parsedEndTime)) {
        return res.status(400).json({ message: 'Invalid endTime format.' });
      }
      if (parsedEndTime < parsedStartTime) {
        return res.status(400).json({ message: 'endTime cannot be before startTime.' });
      }
      calculatedDuration = Math.round((parsedEndTime.getTime() - parsedStartTime.getTime()) / 1000);
      calculatedEndTime = parsedEndTime.toISOString();
    } else if (duration) {
      if (typeof duration !== 'number' || duration < 0) {
        return res.status(400).json({ message: 'Invalid duration.' });
      }
      const endMillis = parsedStartTime.getTime() + (duration * 1000);
      calculatedEndTime = new Date(endMillis).toISOString();
    } else {
      return res.status(400).json({ message: 'Either endTime or duration is required.' });
    }

    const updateQuery = `
      UPDATE TimeEntries 
      SET startTime = ?, endTime = ?, duration = ? 
      WHERE id = ?
    `;

    db.run(updateQuery, [parsedStartTime.toISOString(), calculatedEndTime, calculatedDuration, timeEntryId], function (err) {
      if (err) return next(err);
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Time entry not found.' });
      }
      res.json({
        message: 'Time entry updated successfully.',
        timeEntryId: timeEntryId,
        startTime: parsedStartTime.toISOString(),
        endTime: calculatedEndTime,
        duration: calculatedDuration
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
      db.run(insertQuery, [taskId, task.notionId, parsedStartTime.toISOString(), calculatedEndTime, calculatedDuration], function (err) {
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

// DEBUG: Get all time entries (no filtering)
router.get('/debug/all', (req, res, next) => {
  const db = database.getDb();
  const query = `
    SELECT
      te.id AS timeEntryId,
      te.startTime,
      te.endTime,
      te.duration,
      t.name AS taskName
    FROM TimeEntries te
    LEFT JOIN Tasks t ON te.taskId = t.id
    ORDER BY te.startTime DESC
    LIMIT 20
  `;

  db.all(query, [], (err, rows) => {
    if (err) return next(err);
    console.log('DEBUG: All time entries:', rows);
    res.json(rows);
  });
});

// DELETE /api/time-entries/:timeEntryId - Delete a time entry
router.delete('/:timeEntryId', (req, res, next) => {
  const db = database.getDb();
  const { timeEntryId } = req.params;

  try {
    const deleteQuery = 'DELETE FROM TimeEntries WHERE id = ?';
    db.run(deleteQuery, [timeEntryId], function (err) {
      if (err) return next(err);
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Time entry not found.' });
      }
      res.json({
        message: 'Time entry deleted successfully.',
        timeEntryId: timeEntryId
      });
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;