// Labels for billing items/groups from the server's billing schedule
// (backend/src/services/billing.js decides sendBy/timing/state; this only words it).
import { dayDiff, formatDateString, getLocalDateString } from './timeUtils';

export const shortDate = (dateStr) => formatDateString(dateStr, { weekday: 'short', day: 'numeric', month: 'short' });

export const ordinal = (n) => {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Badge for when something should be invoiced: { text, detail, tone }.
 * Works for a single item or a group (groups carry `timings`).
 */
export const sendByLabel = ({ sendBy, timing, timings, state, overdue }, today = getLocalDateString()) => {
  const onlyTiming = timing || (timings?.length === 1 ? timings[0] : null);
  if (state === 'waiting' || !sendBy) return { text: 'When done', detail: null, tone: 'waiting' };
  if (overdue) {
    return { text: `Overdue ${plural(dayDiff(sendBy, today), 'day')}`, detail: `was due ${shortDate(sendBy)}`, tone: 'overdue' };
  }
  if (sendBy <= today) return { text: onlyTiming === 'asap' ? 'Send now' : 'Send today', detail: null, tone: 'due' };
  return { text: `Send by ${shortDate(sendBy)}`, detail: `in ${plural(dayDiff(today, sendBy), 'day')}`, tone: 'upcoming' };
};

/** Why an item has its date, in a few words. */
export const timingReason = (timing, invoiceDayOfMonth) => {
  switch (timing) {
    case 'asap': return 'work is done';
    case 'pay-run': return invoiceDayOfMonth ? `pay run (by the ${ordinal(invoiceDayOfMonth)})` : 'pay run';
    case 'task-date': return 'task invoice date';
    case 'scheduled': return 'payment schedule';
    case 'on-completion': return 'invoice when done';
    default: return '';
  }
};

export const TONE_CLASSES = {
  overdue: 'bg-red-100 text-red-700',
  due: 'bg-amber-100 text-amber-800',
  upcoming: 'bg-sky-100 text-sky-700',
  waiting: 'bg-gray-100 text-gray-600',
};

/** Split billing items into the createBill payload. */
export const billPayload = (items) => ({
  taskIds: items.filter(i => i.kind === 'task').map(i => i.taskId),
  installmentIds: items.filter(i => i.kind === 'installment').map(i => i.installmentId),
});
