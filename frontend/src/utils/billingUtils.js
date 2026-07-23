// Billing + earnings math shared by the timer, billing previews, and calendar.
// Mirrors the server-side rules in backend/src/routes/projects.js (bills) —
// the server remains the source of truth for stored bills.

// Round hours up to the nearest 0.25 (15 min) for billing
export const roundToQuarterHour = (hours) => Math.ceil(hours * 4) / 4;

export const formatNZD = (amount) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(amount || 0);

// The hourly rate that applies to a task: its own override, else the project rate.
// Returns null for fixed-price tasks (they have no meaningful hourly rate).
export const taskHourlyRate = (task, projectRate) => {
  if (task.fixedPrice != null) return null;
  return task.hourlyRateOverride != null ? task.hourlyRateOverride : (projectRate || 0);
};

// What a task is worth on a bill right now (unrounded, for previews/lists)
export const taskBillAmount = (task, projectRate) => {
  if (task.fixedPrice != null) return task.fixedPrice;
  return (task.totalHoursSpent || 0) * taskHourlyRate(task, projectRate);
};

// Full bill totals for a set of tasks. Fixed-price tasks contribute their flat
// price; hourly-override tasks bill their own rounded hours at their rate;
// remaining tasks pool hours (rounded once) at the project rate. 15% GST.
export const computeBillTotals = (tasks, projectRate) => {
  const rate = projectRate || 0;
  const fixedTasks = tasks.filter(t => t.fixedPrice != null);
  const overrideTasks = tasks.filter(t => t.fixedPrice == null && t.hourlyRateOverride != null);
  const pooledTasks = tasks.filter(t => t.fixedPrice == null && t.hourlyRateOverride == null);

  const totalHours = tasks.reduce((s, t) => s + (t.totalHoursSpent || 0), 0);
  const pooledHours = pooledTasks.reduce((s, t) => s + (t.totalHoursSpent || 0), 0);
  const fixedAmount = fixedTasks.reduce((s, t) => s + t.fixedPrice, 0);
  const roundedHours = roundToQuarterHour(pooledHours)
    + overrideTasks.reduce((s, t) => s + roundToQuarterHour(t.totalHoursSpent || 0), 0);
  const subtotal = roundToQuarterHour(pooledHours) * rate
    + overrideTasks.reduce((s, t) => s + roundToQuarterHour(t.totalHoursSpent || 0) * t.hourlyRateOverride, 0)
    + fixedAmount;
  const gst = subtotal * 0.15;
  return { totalHours, roundedHours, fixedAmount, subtotal, gst, total: subtotal + gst };
};

// Earnings attributable to one completed time entry. For fixed-price tasks the
// entry earns its share of the flat price (entry duration / task total).
// Entry rows come from GET /time-entries which includes hourlyRate,
// hourlyRateOverride, fixedPrice, and taskTotalSeconds.
export const entryEarnings = (entry) => {
  if (!entry.duration) return 0;
  if (entry.fixedPrice != null) {
    const total = entry.taskTotalSeconds || 0;
    return total > 0 ? entry.fixedPrice * (entry.duration / total) : 0;
  }
  const rate = entry.hourlyRateOverride != null ? entry.hourlyRateOverride : (entry.hourlyRate || 0);
  return (entry.duration / 3600) * rate;
};
