// notion-time-tracker/backend/src/routes/timeEntries.js
//
// Timestamps are real UTC ISO strings. Calendar-day logic (which day an entry
// belongs to, where midnight falls) uses the user's configured timezone from
// Settings. Invariant: a stored entry never spans a local midnight — every
// write path splits crossing intervals into one row per calendar day.
const express = require('express');
const router = express.Router();
const database = require('../database');
const settings = require('../settings');
const { splitAtLocalMidnights, dayBounds, dayStart, addDays, localDateString, nowIso } = require('../utils/time');

const dbGet = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const dbAll = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const dbRun = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

async function withTransaction(db, work) {
  await dbRun(db, 'BEGIN TRANSACTION;');
  try {
    const result = await work();
    await dbRun(db, 'COMMIT;');
    return result;
  } catch (err) {
    await dbRun(db, 'ROLLBACK;').catch(() => { });
    throw err;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidIso = (value) => typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
const toIso = (value) => new Date(value).toISOString();

const ENTRY_SELECT = `
  SELECT
    te.id AS timeEntryId,
    te.startTime,
    te.endTime,
    te.duration,
    t.id AS taskId,
    t.name AS taskName,
    t.notionId AS taskNotionId,
    t.fixedPrice,
    t.hourlyRateOverride,
    (SELECT COALESCE(SUM(te2.duration), 0) FROM TimeEntries te2 WHERE te2.taskId = t.id AND te2.endTime IS NOT NULL) AS taskTotalSeconds,
    p.id AS projectId,
    p.name AS projectName,
    p.notionId AS projectNotionId,
    p.hourlyRate,
    p.color AS projectColor,
    p.iconType AS projectIconType,
    p.iconValue AS projectIconValue,
    c.id AS clientId,
    c.name AS clientName,
    c.notionId AS clientNotionId
  FROM TimeEntries te
  LEFT JOIN Tasks t ON te.taskId = t.id
  LEFT JOIN Projects p ON t.projectId = p.id
  LEFT JOIN Clients c ON p.clientId = c.id
`;

/**
 * Write the interval [startIso, endIso) for an existing row, splitting at local
 * midnights: the row itself becomes the first segment and one extra row is
 * inserted per following day. Returns every row written, in order.
 * Caller owns the transaction.
 */
async function writeInterval(db, entry, startIso, endIso, timeZone) {
  const [first, ...rest] = splitAtLocalMidnights(startIso, endIso, timeZone);
  await dbRun(db, 'UPDATE TimeEntries SET startTime = ?, endTime = ?, duration = ? WHERE id = ?',
    [first.startTime, first.endTime, first.duration, entry.id]);
  const written = [{ timeEntryId: entry.id, ...first }];
  for (const seg of rest) {
    const result = await dbRun(db,
      'INSERT INTO TimeEntries (taskId, notionTaskId, startTime, endTime, duration) VALUES (?, ?, ?, ?, ?)',
      [entry.taskId, entry.notionTaskId, seg.startTime, seg.endTime, seg.duration]);
    written.push({ timeEntryId: result.lastID, ...seg });
  }
  return written;
}

const totalDuration = (entries) => entries.reduce((sum, e) => sum + (e.duration || 0), 0);

// GET /api/time-entries/active - Get the currently active time entry (if any)
router.get('/active', async (req, res, next) => {
  const db = database.getDb();
  try {
    const row = await dbGet(db, `${ENTRY_SELECT} WHERE te.endTime IS NULL ORDER BY te.startTime DESC LIMIT 1;`);
    res.json(row || null);
  } catch (error) {
    next(error);
  }
});

// POST /api/time-entries/start - Start a timer for a task (stops any running timer first)
router.post('/start', async (req, res, next) => {
  const db = database.getDb();
  const { taskId } = req.body;

  if (!taskId) {
    return res.status(400).json({ message: 'taskId is required.' });
  }

  try {
    const timeZone = await settings.getTimeZone();
    const outcome = await withTransaction(db, async () => {
      const task = await dbGet(db, 'SELECT notionId FROM Tasks WHERE id = ?', [taskId]);
      if (!task) return { notFound: true };

      const now = nowIso();
      const active = await dbGet(db, 'SELECT id, taskId, notionTaskId, startTime FROM TimeEntries WHERE endTime IS NULL LIMIT 1;');
      if (active) {
        const closed = await writeInterval(db, active, active.startTime, now, timeZone);
        console.log(`Timer ${active.id} stopped due to new timer start (${closed.length} segment(s)).`);
      }

      const result = await dbRun(db,
        'INSERT INTO TimeEntries (taskId, notionTaskId, startTime) VALUES (?, ?, ?);',
        [taskId, task.notionId, now]);
      return { timeEntryId: result.lastID, taskNotionId: task.notionId, startTime: now };
    });

    if (outcome.notFound) return res.status(404).json({ message: 'Task not found.' });
    res.status(201).json({
      message: 'Timer started successfully.',
      timeEntryId: outcome.timeEntryId,
      taskId,
      taskNotionId: outcome.taskNotionId,
      startTime: outcome.startTime,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/time-entries - Create a manual time entry (one row per calendar day it covers)
router.post('/', async (req, res, next) => {
  const db = database.getDb();
  const { taskId, startTime, endTime } = req.body;

  if (!taskId || !startTime || !endTime) {
    return res.status(400).json({ message: 'taskId, startTime, and endTime are required.' });
  }
  if (!isValidIso(startTime) || !isValidIso(endTime)) {
    return res.status(400).json({ message: 'startTime and endTime must be ISO 8601 timestamps.' });
  }
  if (new Date(endTime) < new Date(startTime)) {
    return res.status(400).json({ message: 'endTime must not be before startTime.' });
  }

  try {
    const timeZone = await settings.getTimeZone();
    const task = await dbGet(db, 'SELECT notionId FROM Tasks WHERE id = ?', [taskId]);
    if (!task) return res.status(404).json({ message: 'Task not found.' });

    const segments = splitAtLocalMidnights(toIso(startTime), toIso(endTime), timeZone);
    const entries = await withTransaction(db, async () => {
      const written = [];
      for (const seg of segments) {
        const result = await dbRun(db,
          'INSERT INTO TimeEntries (taskId, notionTaskId, startTime, endTime, duration) VALUES (?, ?, ?, ?, ?)',
          [taskId, task.notionId, seg.startTime, seg.endTime, seg.duration]);
        written.push({ timeEntryId: result.lastID, ...seg });
      }
      return written;
    });

    console.log('Manual time entry created - IDs:', entries.map(e => e.timeEntryId).join(','), 'Duration:', totalDuration(entries), 'seconds');
    res.status(201).json({
      message: entries.length > 1
        ? `Time entry created and split into ${entries.length} days.`
        : 'Time entry created successfully.',
      timeEntryId: entries[0].timeEntryId,
      taskId,
      taskNotionId: task.notionId,
      startTime: entries[0].startTime,
      endTime: entries[entries.length - 1].endTime,
      duration: totalDuration(entries),
      entries,
      split: entries.length > 1,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/time-entries/:timeEntryId/stop - Stop a specific timer
router.post('/:timeEntryId/stop', async (req, res, next) => {
  const db = database.getDb();
  const { timeEntryId } = req.params;

  try {
    const timeZone = await settings.getTimeZone();
    const entry = await dbGet(db,
      'SELECT id, taskId, notionTaskId, startTime FROM TimeEntries WHERE id = ? AND endTime IS NULL', [timeEntryId]);
    if (!entry) return res.status(404).json({ message: 'Active time entry not found or already stopped.' });

    const endTime = nowIso();
    const entries = await withTransaction(db, () => writeInterval(db, entry, entry.startTime, endTime, timeZone));

    console.log('Timer stopped - Entry ID:', timeEntryId, 'Segments:', entries.length, 'Duration:', totalDuration(entries), 'EndTime:', endTime);
    res.json({
      message: entries.length > 1
        ? `Timer stopped and split into ${entries.length} days.`
        : 'Timer stopped successfully.',
      timeEntryId: entry.id,
      endTime,
      duration: totalDuration(entries),
      entries,
      split: entries.length > 1,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/time-entries/:timeEntryId/rollover - A running timer has crossed local
// midnight: close it at midnight (one row per day passed) and start a fresh timer
// for the same task from the most recent midnight. No-op if still on its start day.
router.post('/:timeEntryId/rollover', async (req, res, next) => {
  const db = database.getDb();
  const { timeEntryId } = req.params;

  try {
    const timeZone = await settings.getTimeZone();
    const entry = await dbGet(db,
      'SELECT id, taskId, notionTaskId, startTime FROM TimeEntries WHERE id = ? AND endTime IS NULL', [timeEntryId]);
    if (!entry) return res.status(404).json({ message: 'Active time entry not found or already stopped.' });

    const now = new Date();
    const today = localDateString(now, timeZone);
    if (localDateString(new Date(entry.startTime), timeZone) === today) {
      return res.json({ rolled: false, timeEntryId: entry.id, startTime: entry.startTime });
    }

    const lastMidnight = dayStart(today, timeZone).toISOString();
    const outcome = await withTransaction(db, async () => {
      const closed = await writeInterval(db, entry, entry.startTime, lastMidnight, timeZone);
      const result = await dbRun(db,
        'INSERT INTO TimeEntries (taskId, notionTaskId, startTime) VALUES (?, ?, ?);',
        [entry.taskId, entry.notionTaskId, lastMidnight]);
      return { closed, newId: result.lastID };
    });

    console.log(`Timer ${entry.id} rolled over midnight → closed ${outcome.closed.length} segment(s), new timer ${outcome.newId} from ${lastMidnight}`);
    res.json({
      rolled: true,
      timeEntryId: outcome.newId,
      taskId: entry.taskId,
      startTime: lastMidnight,
      closedEntries: outcome.closed,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/time-entries/:timeEntryId - Update a time entry (splits if it now crosses midnight)
router.put('/:timeEntryId', async (req, res, next) => {
  const db = database.getDb();
  const { timeEntryId } = req.params;
  const { startTime, endTime } = req.body;

  if (!startTime || !endTime) {
    return res.status(400).json({ message: 'startTime and endTime are required.' });
  }
  if (!isValidIso(startTime) || !isValidIso(endTime)) {
    return res.status(400).json({ message: 'startTime and endTime must be ISO 8601 timestamps.' });
  }
  if (new Date(endTime) < new Date(startTime)) {
    return res.status(400).json({ message: 'endTime must not be before startTime.' });
  }

  try {
    const timeZone = await settings.getTimeZone();
    const entry = await dbGet(db, 'SELECT id, taskId, notionTaskId FROM TimeEntries WHERE id = ?', [timeEntryId]);
    if (!entry) return res.status(404).json({ message: 'Time entry not found.' });

    const entries = await withTransaction(db, () => writeInterval(db, entry, toIso(startTime), toIso(endTime), timeZone));

    console.log('Time entry updated - ID:', timeEntryId, 'Segments:', entries.length, 'Duration:', totalDuration(entries), 'seconds');
    res.json({
      message: entries.length > 1
        ? `Time entry updated and split into ${entries.length} days.`
        : 'Time entry updated successfully.',
      timeEntryId: entry.id,
      startTime: entries[0].startTime,
      endTime: entries[entries.length - 1].endTime,
      duration: totalDuration(entries),
      entries,
      split: entries.length > 1,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/time-entries/:timeEntryId - Delete a time entry
router.delete('/:timeEntryId', async (req, res, next) => {
  const db = database.getDb();
  const { timeEntryId } = req.params;

  try {
    const result = await dbRun(db, 'DELETE FROM TimeEntries WHERE id = ?', [timeEntryId]);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Time entry not found.' });
    }
    console.log('Time entry deleted - ID:', timeEntryId);
    res.json({ message: 'Time entry deleted successfully.', timeEntryId });
  } catch (error) {
    next(error);
  }
});

// GET /api/time-entries - List entries, optionally filtered to local calendar days.
//   ?date=YYYY-MM-DD                      one day
//   ?startDate=YYYY-MM-DD&endDate=...     inclusive day range (either side optional)
// Day boundaries are local midnights in the configured timezone.
router.get('/', async (req, res, next) => {
  const db = database.getDb();
  const { date, startDate, endDate } = req.query;

  for (const [name, value] of Object.entries({ date, startDate, endDate })) {
    if (value !== undefined && !DATE_RE.test(value)) {
      return res.status(400).json({ message: `${name} must be YYYY-MM-DD.` });
    }
  }

  try {
    const timeZone = await settings.getTimeZone();
    const conditions = [];
    const params = [];

    if (date) {
      const { start, end } = dayBounds(date, timeZone);
      conditions.push('te.startTime >= ? AND te.startTime < ?');
      params.push(start.toISOString(), end.toISOString());
    } else {
      if (startDate) {
        conditions.push('te.startTime >= ?');
        params.push(dayStart(startDate, timeZone).toISOString());
      }
      if (endDate) {
        conditions.push('te.startTime < ?');
        params.push(dayStart(addDays(endDate, 1), timeZone).toISOString());
      }
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const rows = await dbAll(db, `${ENTRY_SELECT}${where} ORDER BY te.startTime ASC`, params);

    // Which local calendar day each entry belongs to (handy for grouping client-side)
    res.json(rows.map(row => ({ ...row, localDate: localDateString(new Date(row.startTime), timeZone) })));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
