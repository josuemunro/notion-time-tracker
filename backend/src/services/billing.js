// Billing rules shared by bill creation, the projects list, the project page's
// Unbilled list and the home page's billing schedule. Bill maths is mirrored on
// the client in frontend/src/utils/billingUtils.js — the server is the source
// of truth for stored bills.
//
// What's unbilled becomes "billing items":
//   - an hourly task → its time entries not yet on a bill (TimeEntries.billId
//     NULL). Billing covers the hours so far; time logged later is unbilled again.
//   - a fixed-price task split into payments → one item per unbilled payment
//   - any other fixed-price task not yet billed (beenBilled) → its full price
//
// When an item should be invoiced (its `sendBy` date, display-zone YYYY-MM-DD):
//   1. an explicit date wins — the payment's due date, or the task's invoiceDate
//      (a task's date is used up when it's billed)
//   2. hourly work in a pay-run project is due on the next pay-run cutoff,
//      finished or not — that's the point of billing monthly
//   3. anything else must be finished (task status Done) — until then it's
//      "waiting" (invoice when done)
//   4. finished work follows the project: the next pay-run cutoff, or today
//
// One invoice per pay run: once a project has been billed for time in the
// PAY_RUN_WINDOW_DAYS before a cutoff, new work rolls to the following cutoff.
const { dbAll } = require('../database');
const settings = require('../settings');
const { localDateString, addDays } = require('../utils/time');

const GST_RATE = 0.15;
const PAY_RUN_WINDOW_DAYS = 14;
// Unbilled hourly time below this is ignored (a timer started by accident shouldn't nag)
const MIN_UNBILLED_SECONDS = 60;

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

const DONE_STATUSES = new Set(['done', 'complete', 'completed']);
const isDone = (status) => DONE_STATUSES.has(String(status || '').trim().toLowerCase());

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (n) => String(n).padStart(2, '0');

/**
 * The next pay-run cutoff on or after `today` (YYYY-MM-DD) for a cutoff day of
 * the month. Days past the end of a short month clamp to its last day (31 →
 * 30 Nov, 28/29 Feb).
 */
function nextPayRunDate(today, dayOfMonth) {
  const [y, m, d] = today.split('-').map(Number);
  const thisMonth = Math.min(dayOfMonth, daysInMonth(y, m));
  if (d <= thisMonth) return `${y}-${pad(m)}-${pad(thisMonth)}`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(dayOfMonth, daysInMonth(ny, nm)))}`;
}

/**
 * The pay-run cutoff new work should go to. Normally the next cutoff, but if the
 * project was already billed for time in the run-up to it, that run is done and
 * work rolls to the one after.
 */
function payRunDate(project, today) {
  const next = nextPayRunDate(today, project.invoiceDayOfMonth);
  const billed = project.lastTimeBillDate;
  if (billed && billed <= next && billed >= addDays(next, -PAY_RUN_WINDOW_DAYS)) {
    return { sendBy: nextPayRunDate(addDays(next, 1), project.invoiceDayOfMonth), rolled: true };
  }
  return { sendBy: next, rolled: false };
}

/** When an item should be invoiced, and why. See the rules at the top of the file. */
function itemTiming(item, project, today) {
  if (item.explicitDate) {
    return { sendBy: item.explicitDate, timing: item.kind === 'installment' ? 'scheduled' : 'task-date' };
  }
  const isHourly = item.kind === 'task' && item.fixedPrice == null;
  if (project.invoiceDayOfMonth && (isHourly || isDone(item.status))) {
    const { sendBy, rolled } = payRunDate(project, today);
    return { sendBy, timing: rolled ? 'next-pay-run' : 'pay-run' };
  }
  if (!isDone(item.status)) return { sendBy: null, timing: 'on-completion' };
  return { sendBy: today, timing: 'asap' };
}

/** waiting (no date yet) | due (date today or earlier) | upcoming */
const itemState = (sendBy, today) => (sendBy == null ? 'waiting' : sendBy <= today ? 'due' : 'upcoming');

/** Expected payment: invoice date (or today, if late) plus the project's usual payment time. */
function expectedPaymentDate(sendBy, project, today) {
  if (sendBy == null || project.paymentTermsDays == null) return null;
  return addDays(sendBy < today ? today : sendBy, project.paymentTermsDays);
}

// Something to bill: an unbilled fixed price (hours don't matter), or unbilled hourly time
const hasBillableValue = (task) => (task.fixedPrice != null
  ? !task.beenBilled
  : task.unbilledHours * 3600 >= MIN_UNBILLED_SECONDS);

/**
 * Billing items for one project's unbilled tasks.
 * installmentsByTask: Map(taskId → installments ordered by sortOrder).
 */
function buildBillingItems(project, tasks, installmentsByTask, today) {
  const items = [];
  const push = (item) => {
    const { sendBy, timing } = itemTiming(item, project, today);
    const { explicitDate, ...rest } = item;
    items.push({
      ...rest,
      totalHoursSpent: rest.hours, // same shape the client-side bill maths expects
      sendBy,
      timing,
      state: itemState(sendBy, today),
      overdue: sendBy != null && sendBy < today,
      expectedPaymentDate: expectedPaymentDate(sendBy, project, today),
    });
  };

  for (const task of tasks) {
    const base = {
      taskId: task.id, name: task.name, status: task.status, isManual: !!task.isManual,
      taskTotalHours: task.hours, // everything logged, billed or not
    };
    const installments = installmentsByTask.get(task.id) || [];
    if (installments.length > 0) {
      if (task.beenBilled) continue;
      installments.forEach((inst, index) => {
        if (inst.billId != null) return;
        push({
          ...base,
          key: `i${inst.id}`,
          kind: 'installment',
          installmentId: inst.id,
          label: inst.label || `Payment ${index + 1} of ${installments.length}`,
          paymentNumber: index + 1,
          paymentCount: installments.length,
          fixedPrice: inst.amount,
          hourlyRateOverride: null,
          hours: 0,
          amount: inst.amount,
          explicitDate: inst.dueDate,
        });
      });
    } else if (hasBillableValue(task)) {
      const rate = task.hourlyRateOverride != null ? task.hourlyRateOverride : (project.hourlyRate || 0);
      // Hourly: only time not yet on a bill. Fixed: hours are informational.
      const hours = task.fixedPrice != null ? task.hours : task.unbilledHours;
      push({
        ...base,
        key: `t${task.id}`,
        kind: 'task',
        installmentId: null,
        label: null,
        fixedPrice: task.fixedPrice,
        hourlyRateOverride: task.hourlyRateOverride,
        hours,
        amount: task.fixedPrice != null ? task.fixedPrice : hours * rate,
        explicitDate: task.invoiceDate,
      });
    }
  }
  return items;
}

/**
 * Billable tasks with their logged hours (`hours`) and the part of it not yet on
 * a bill (`unbilledHours`, finished entries only — a running timer joins once
 * stopped). Whether there's anything to bill is decided per item. isBillable is
 * checked in JS so legacy boolean encodings behave like they do in the UI.
 */
async function getUnbilledTasks(projectId = null) {
  const rows = await dbAll(`
    SELECT t.id, t.projectId, t.name, t.status, t.isManual, t.isBillable, t.beenBilled,
           t.fixedPrice, t.hourlyRateOverride, t.invoiceDate,
           COALESCE(SUM(te.duration), 0) / 3600.0 AS hours,
           COALESCE(SUM(CASE WHEN te.billId IS NULL THEN te.duration END), 0) / 3600.0 AS unbilledHours
    FROM Tasks t
    LEFT JOIN TimeEntries te ON te.taskId = t.id AND te.endTime IS NOT NULL
    WHERE t.projectId IS NOT NULL ${projectId != null ? 'AND t.projectId = ?' : ''}
    GROUP BY t.id
    ORDER BY t.name COLLATE NOCASE
  `, projectId != null ? [projectId] : []);
  return rows.filter(t => t.isBillable);
}

/**
 * Local date of each project's latest bill that billed time (not just payments
 * of a split) — the pay-run "already invoiced this run" check.
 */
async function getLastTimeBillDates(timeZone) {
  const rows = await dbAll(`
    SELECT b.projectId, MAX(b.createdAt) AS lastBilledAt
    FROM Bills b
    WHERE COALESCE(b.kind, 'invoice') <> 'waived'
      AND EXISTS (SELECT 1 FROM BillTasks bt WHERE bt.billId = b.id AND bt.installmentId IS NULL)
    GROUP BY b.projectId
  `);
  return new Map(rows.map(r => [r.projectId, localDateString(new Date(r.lastBilledAt), timeZone)]));
}

/** Installments for the given task ids, grouped by task, in payment order. */
async function getInstallmentsByTask(taskIds) {
  const byTask = new Map();
  if (taskIds.length === 0) return byTask;
  const rows = await dbAll(
    `SELECT * FROM TaskInstallments WHERE taskId IN (${taskIds.map(() => '?').join(',')}) ORDER BY taskId, sortOrder, id`,
    taskIds
  );
  for (const row of rows) {
    if (!byTask.has(row.taskId)) byTask.set(row.taskId, []);
    byTask.get(row.taskId).push(row);
  }
  return byTask;
}


/**
 * Every project's unbilled billing items: { today, projects: [{ project, items }] }.
 * Pass projectId to limit it to one project.
 */
async function loadUnbilledItems(projectId = null) {
  const timeZone = await settings.getTimeZone();
  const today = localDateString(new Date(), timeZone);
  const [tasks, projects, lastTimeBillDates] = await Promise.all([
    getUnbilledTasks(projectId),
    dbAll(`
      SELECT p.id, p.name, p.status, p.hourlyRate, p.color, p.iconType, p.iconValue,
             p.invoiceDayOfMonth, p.paymentTermsDays, c.name AS clientName
      FROM Projects p LEFT JOIN Clients c ON p.clientId = c.id
      ${projectId != null ? 'WHERE p.id = ?' : ''}
      ORDER BY p.name COLLATE NOCASE
    `, projectId != null ? [projectId] : []),
    getLastTimeBillDates(timeZone),
  ]);
  for (const project of projects) project.lastTimeBillDate = lastTimeBillDates.get(project.id) || null;
  const installmentsByTask = await getInstallmentsByTask(tasks.map(t => t.id));
  const tasksByProject = new Map();
  for (const task of tasks) {
    if (!tasksByProject.has(task.projectId)) tasksByProject.set(task.projectId, []);
    tasksByProject.get(task.projectId).push(task);
  }
  return {
    today,
    projects: projects.map(project => ({
      project,
      items: buildBillingItems(project, tasksByProject.get(project.id) || [], installmentsByTask, today),
    })),
  };
}

/** One project's billing items (for its Unbilled list). */
async function getProjectBillingItems(projectId) {
  const { projects } = await loadUnbilledItems(projectId);
  return projects[0]?.items || [];
}

// Bills.kind: 'invoice' / 'external' are billed money; 'waived' records written-off work
const BILLED = "(COALESCE(kind, 'invoice') <> 'waived')";

/**
 * What's been billed for a project so far: { subtotal (ex GST), hours, billCount }
 * from invoices and external records, plus what was waived { waivedSubtotal, waivedHours }.
 */
async function getBilledTotals(projectId) {
  const [row] = await dbAll(`
    SELECT
      COALESCE(SUM(CASE WHEN ${BILLED} THEN subtotal END), 0) AS subtotal,
      COALESCE(SUM(CASE WHEN ${BILLED} THEN totalHours END), 0) AS hours,
      COUNT(CASE WHEN ${BILLED} THEN 1 END) AS billCount,
      COALESCE(SUM(CASE WHEN NOT ${BILLED} THEN subtotal END), 0) AS waivedSubtotal,
      COALESCE(SUM(CASE WHEN NOT ${BILLED} THEN totalHours END), 0) AS waivedHours
    FROM Bills WHERE projectId = ?
  `, [projectId]);
  return row;
}

/**
 * Per-project unbilled summary: { [projectId]: { unbilledAmount (ex GST),
 * unbilledHours, unbilledTaskCount, readyAmount, lastBilledAt } }.
 */
async function getUnbilledSummaries() {
  const [{ projects }, lastBills] = await Promise.all([
    loadUnbilledItems(),
    dbAll(`SELECT projectId, MAX(createdAt) AS lastBilledAt FROM Bills WHERE COALESCE(kind, 'invoice') <> 'waived' GROUP BY projectId`),
  ]);
  const lastBilledById = new Map(lastBills.map(b => [b.projectId, b.lastBilledAt]));
  const summaries = {};
  for (const { project, items } of projects) {
    const ready = items.filter(i => i.state !== 'waiting');
    summaries[project.id] = {
      unbilledAmount: computeBillTotals(items, project.hourlyRate).subtotal,
      unbilledHours: items.reduce((sum, i) => sum + (i.hours || 0), 0),
      unbilledTaskCount: new Set(items.map(i => i.taskId)).size,
      readyAmount: computeBillTotals(ready, project.hourlyRate).subtotal,
      lastBilledAt: lastBilledById.get(project.id) || null,
    };
  }
  return summaries;
}

/**
 * The home page's billing schedule. Items are grouped into would-be invoices:
 * everything due now for a project goes on one bill; upcoming items group by
 * project and send-by date; unfinished work groups by project.
 */
async function getBillingSchedule() {
  const { today, projects } = await loadUnbilledItems();
  const groups = [];

  for (const { project, items } of projects) {
    if (items.length === 0) continue;
    const projectInfo = {
      projectId: project.id,
      projectName: project.name,
      clientName: project.clientName,
      projectColor: project.color,
      projectIconType: project.iconType,
      projectIconValue: project.iconValue,
      hourlyRate: project.hourlyRate || 0,
      invoiceDayOfMonth: project.invoiceDayOfMonth,
      paymentTermsDays: project.paymentTermsDays,
    };
    const addGroup = (state, groupItems) => {
      if (groupItems.length === 0) return;
      const dates = groupItems.map(i => i.sendBy).filter(Boolean).sort();
      const sendBy = dates[0] || null;
      groups.push({
        key: `${project.id}:${state}:${state === 'upcoming' ? sendBy : ''}`,
        ...projectInfo,
        state,
        sendBy,
        overdue: groupItems.some(i => i.overdue),
        timings: [...new Set(groupItems.map(i => i.timing))],
        expectedPaymentDate: expectedPaymentDate(sendBy, project, today),
        items: groupItems,
        totals: computeBillTotals(groupItems, project.hourlyRate),
      });
    };

    addGroup('due', items.filter(i => i.state === 'due'));
    const upcoming = items.filter(i => i.state === 'upcoming');
    for (const date of [...new Set(upcoming.map(i => i.sendBy))].sort()) {
      addGroup('upcoming', upcoming.filter(i => i.sendBy === date));
    }
    addGroup('waiting', items.filter(i => i.state === 'waiting'));
  }

  const stateOrder = { due: 0, upcoming: 1, waiting: 2 };
  groups.sort((a, b) =>
    stateOrder[a.state] - stateOrder[b.state]
    || (a.state === 'due' ? Number(b.overdue) - Number(a.overdue) : 0)
    || (a.sendBy || '').localeCompare(b.sendBy || '')
    || a.projectName.localeCompare(b.projectName));

  const sumState = (state) => groups.filter(g => g.state === state);
  const summary = (state) => {
    const list = sumState(state);
    return {
      amount: list.reduce((sum, g) => sum + g.totals.subtotal, 0),
      groupCount: list.length,
      itemCount: list.reduce((sum, g) => sum + g.items.length, 0),
    };
  };

  return { today, totals: { due: summary('due'), upcoming: summary('upcoming'), waiting: summary('waiting') }, groups };
}

module.exports = {
  GST_RATE,
  roundToQuarterHour,
  computeBillTotals,
  isDone,
  nextPayRunDate,
  getUnbilledTasks,
  getInstallmentsByTask,
  getProjectBillingItems,
  getBilledTotals,
  getUnbilledSummaries,
  getBillingSchedule,
};
