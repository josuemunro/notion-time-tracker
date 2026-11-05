// Billing rules shared by bill creation and the "what's unbilled" views.
// Mirrored on the client in frontend/src/utils/billingUtils.js — the server
// is the source of truth for stored bills.
const database = require('../database');

const GST_RATE = 0.15;

// Round hours up to the nearest 0.25 (15 min) for billing
const roundToQuarterHour = (hours) => Math.ceil(hours * 4) / 4;

/**
 * Bill totals for a set of items: { hours, fixedPrice, hourlyRateOverride }.
 * Fixed-price items contribute their flat price; hourly-override items bill
 * their own hours (rounded up to 0.25h) at their rate; remaining items pool
 * hours, rounded once, at the project rate. 15% GST on the lot.
 */
function computeBillTotals(items, projectRate) {
  const rate = projectRate || 0;
  const fixed = items.filter(i => i.fixedPrice != null);
  const override = items.filter(i => i.fixedPrice == null && i.hourlyRateOverride != null);
  const pooled = items.filter(i => i.fixedPrice == null && i.hourlyRateOverride == null);

  const totalHours = items.reduce((sum, i) => sum + (i.hours || 0), 0);
  const pooledHours = pooled.reduce((sum, i) => sum + (i.hours || 0), 0);
  const fixedAmount = fixed.reduce((sum, i) => sum + i.fixedPrice, 0);
  const roundedHours = roundToQuarterHour(pooledHours)
    + override.reduce((sum, i) => sum + roundToQuarterHour(i.hours || 0), 0);
  const subtotal = roundToQuarterHour(pooledHours) * rate
    + override.reduce((sum, i) => sum + roundToQuarterHour(i.hours || 0) * i.hourlyRateOverride, 0)
    + fixedAmount;
  const gst = subtotal * GST_RATE;
  return { totalHours, roundedHours, fixedAmount, subtotal, gst, total: subtotal + gst, rate };
}

const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
  database.getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

/**
 * Billable tasks that haven't been billed, with their logged hours.
 * Same rule as the project page's Unbilled list (isBillable && !beenBilled),
 * evaluated in JS so legacy boolean encodings behave identically.
 */
async function getUnbilledTasks(projectId = null) {
  const rows = await dbAll(`
    SELECT t.id, t.projectId, t.name, t.status, t.isManual, t.isBillable, t.beenBilled,
           t.fixedPrice, t.hourlyRateOverride,
           COALESCE(SUM(te.duration), 0) / 3600.0 AS hours
    FROM Tasks t
    LEFT JOIN TimeEntries te ON te.taskId = t.id AND te.endTime IS NOT NULL
    WHERE t.projectId IS NOT NULL ${projectId != null ? 'AND t.projectId = ?' : ''}
    GROUP BY t.id
    ORDER BY t.name COLLATE NOCASE
  `, projectId != null ? [projectId] : []);
  return rows.filter(t => t.isBillable && !t.beenBilled);
}

// Something to bill: a fixed price is owed regardless of hours; hourly work needs logged time
const hasBillableValue = (task) => task.fixedPrice != null || task.hours > 0;

/**
 * Per-project unbilled summary: { [projectId]: { unbilledAmount (ex GST),
 * unbilledHours, unbilledTaskCount, lastBilledAt } }.
 */
async function getUnbilledSummaries() {
  const [tasks, projects, lastBills] = await Promise.all([
    getUnbilledTasks(),
    dbAll('SELECT id, hourlyRate FROM Projects'),
    dbAll('SELECT projectId, MAX(createdAt) AS lastBilledAt FROM Bills GROUP BY projectId'),
  ]);
  const rateById = new Map(projects.map(p => [p.id, p.hourlyRate]));
  const byProject = new Map();
  for (const task of tasks.filter(hasBillableValue)) {
    if (!byProject.has(task.projectId)) byProject.set(task.projectId, []);
    byProject.get(task.projectId).push(task);
  }

  const summaries = {};
  for (const p of projects) {
    const items = byProject.get(p.id) || [];
    const totals = computeBillTotals(items, rateById.get(p.id));
    summaries[p.id] = {
      unbilledAmount: totals.subtotal,
      unbilledHours: totals.totalHours,
      unbilledTaskCount: items.length,
      lastBilledAt: null,
    };
  }
  for (const b of lastBills) {
    if (summaries[b.projectId]) summaries[b.projectId].lastBilledAt = b.lastBilledAt;
  }
  return summaries;
}

module.exports = {
  GST_RATE,
  roundToQuarterHour,
  computeBillTotals,
  getUnbilledTasks,
  getUnbilledSummaries,
};
