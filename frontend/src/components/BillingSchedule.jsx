import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowPathIcon, BanknotesIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { getBillingSchedule } from '../services/api';
import { useTimer } from '../contexts/TimerContext';
import { useSyncComplete } from '../utils/syncEvents';
import { formatNZD } from '../utils/billingUtils';
import { formatHoursHuman } from '../utils/timeUtils';
import { sendByLabel, shortDate, timingReason, ordinal, TONE_CLASSES } from '../utils/billingSchedule';
import ProjectIcon from './ProjectIcon';
import BillingModal from './BillingModal';

// Home page billing area: what needs invoicing and when, from GET /billing/schedule.
// Groups are would-be invoices (one project, one send-by date); "Bill" opens the
// same BillingModal the project page uses. Rules live in backend services/billing.js.
function BillingSchedule({ refreshToken = 0 }) {
  const [schedule, setSchedule] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [billingGroup, setBillingGroup] = useState(null);
  const [showWaiting, setShowWaiting] = useState(false);
  const { registerTimerChangeCallback } = useTimer();

  const fetchSchedule = async () => {
    setIsLoading(true);
    try {
      const { data } = await getBillingSchedule();
      setSchedule(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load billing schedule:', err);
      setError('Could not load the billing schedule.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSchedule(); }, [refreshToken]);
  useSyncComplete(fetchSchedule);
  // Stopping/starting a timer changes logged hours (and so amounts)
  useEffect(() => registerTimerChangeCallback(fetchSchedule), [registerTimerChangeCallback]);

  const groups = schedule?.groups || [];
  const due = groups.filter(g => g.state === 'due');
  const upcoming = groups.filter(g => g.state === 'upcoming');
  const waiting = groups.filter(g => g.state === 'waiting');
  const totals = schedule?.totals;
  const anyOverdue = due.some(g => g.overdue);

  const renderGroup = (group) => {
    const badge = sendByLabel(group, schedule.today);
    const reasons = group.timings.map(t => timingReason(t, group.invoiceDayOfMonth)).filter(Boolean);
    return (
      <div key={group.key} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
        <ProjectIcon
          iconType={group.projectIconType}
          iconValue={group.projectIconValue}
          projectName={group.projectName}
          projectColor={group.projectColor}
          className="w-6 h-6 mt-0.5 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
            <Link to={`/projects/${group.projectId}`} className="font-semibold text-gray-900 hover:text-blue-700 truncate">
              {group.projectName}
            </Link>
            {group.clientName && <span className="text-sm text-gray-500 truncate">{group.clientName}</span>}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[badge.tone]}`}>
              {badge.text}
            </span>
            {badge.detail && <span className="text-xs text-gray-500">{badge.detail}</span>}
          </div>
          <ul className="mt-1.5 space-y-0.5 text-sm text-gray-600">
            {group.items.map(item => (
              <li key={item.key} className="flex justify-between gap-3">
                <span className="truncate">
                  {item.name}
                  {item.label && <span className="text-gray-400"> — {item.label}</span>}
                </span>
                <span className="flex-shrink-0 tabular-nums text-gray-500">
                  {item.fixedPrice != null ? formatNZD(item.amount) : formatHoursHuman(item.totalHoursSpent)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-gray-400">
            {reasons.join(' · ')}
            {group.expectedPaymentDate && (
              <span className="text-gray-500"> · expect payment around {shortDate(group.expectedPaymentDate)}</span>
            )}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-semibold tabular-nums text-gray-900">{formatNZD(group.totals.subtotal)}</p>
          <p className="text-xs text-gray-400">ex GST</p>
          {group.state !== 'waiting' && (
            <button
              onClick={() => setBillingGroup(group)}
              className="mt-2 inline-flex items-center rounded-lg bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Bill
            </button>
          )}
        </div>
      </div>
    );
  };

  const stat = (label, summary, sub, tone = 'text-gray-900') => (
    <div className="px-4 py-3 sm:px-5 min-w-0">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 truncate">{label}</p>
      <p className={`mt-0.5 text-lg sm:text-xl font-bold tabular-nums ${summary.amount > 0 ? tone : 'text-gray-300'}`}>
        {formatNZD(summary.amount)}
      </p>
      <p className="text-xs text-gray-500 truncate">{sub}</p>
    </div>
  );

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-200">
        <BanknotesIcon className="h-5 w-5 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">Billing</h2>
        <span className="hidden sm:inline text-sm text-gray-500">What to invoice, and when</span>
        <button
          onClick={fetchSchedule}
          disabled={isLoading}
          className="ml-auto p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          title="Refresh billing"
        >
          <ArrowPathIcon className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p className="m-5 text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{error}</p>}

      {totals && (
        <div className="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200 bg-gray-50/60">
          {stat(anyOverdue ? 'Send now · overdue' : 'Send now', totals.due,
            totals.due.groupCount ? plural(totals.due.groupCount, 'invoice') : 'Nothing due',
            anyOverdue ? 'text-red-600' : 'text-amber-700')}
          {stat('Upcoming', totals.upcoming,
            upcoming.length ? `next ${shortDate(upcoming[0].sendBy)}` : 'Nothing scheduled')}
          {stat('In progress', totals.waiting, 'invoice when done', 'text-gray-700')}
        </div>
      )}

      {schedule && (
        <div className="p-5 space-y-6">
          {groups.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500">All caught up. Nothing is waiting to be billed.</p>
          )}

          {due.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Send now</h3>
              {due.map(renderGroup)}
            </section>
          )}

          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Upcoming</h3>
              {upcoming.map(renderGroup)}
            </section>
          )}

          {waiting.length > 0 && (
            <section className="space-y-2">
              <button
                onClick={() => setShowWaiting(v => !v)}
                className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700"
                aria-expanded={showWaiting}
              >
                {showWaiting ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                In progress · {plural(totals.waiting.itemCount, 'item')} · {formatNZD(totals.waiting.amount)}
              </button>
              {showWaiting && (
                <>
                  <p className="text-xs text-gray-500">
                    Unfinished work is invoiced once it's done, at the project's pay run
                    {waiting.some(g => g.invoiceDayOfMonth) ? ` (e.g. by the ${ordinal(waiting.find(g => g.invoiceDayOfMonth).invoiceDayOfMonth)})` : ''} or
                    straight away. Give a task an invoice date to bill it sooner.
                  </p>
                  {waiting.map(renderGroup)}
                </>
              )}
            </section>
          )}
        </div>
      )}

      {billingGroup && (
        <BillingModal
          project={{
            id: billingGroup.projectId,
            name: billingGroup.projectName,
            clientName: billingGroup.clientName,
            hourlyRate: billingGroup.hourlyRate,
          }}
          items={billingGroup.items}
          onClose={() => setBillingGroup(null)}
          onCompleted={() => {
            setBillingGroup(null);
            fetchSchedule();
          }}
        />
      )}
    </div>
  );
}

export default BillingSchedule;
