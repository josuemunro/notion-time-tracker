import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon, PlusIcon, ArrowPathIcon, LockClosedIcon } from '@heroicons/react/24/solid';
import { getTaskBilling, updateTaskBilling } from '../services/api';
import { formatNZD } from '../utils/billingUtils';
import { getLocalDateString } from '../utils/timeUtils';
import { ordinal, shortDate } from '../utils/billingSchedule';

const roundCents = (n) => Math.round(n * 100) / 100;
let paymentUid = 0;
const newPayment = (fields = {}) => ({ uid: ++paymentUid, label: '', amount: '', dueDate: '', ...fields });

// A task's billing plan — local-only, never synced to Notion:
//  - pricing: inherit the project rate (default), a custom hourly rate, or a fixed price
//  - when to invoice: blank follows the project (pay run / as soon as done), or a set date
//  - fixed price can instead be split into payments, each with its own send-by date
//    (blank = when the task is done); invoiced payments are locked
//  - local tasks can be marked not billable (Notion tasks take that from Notion)
function TaskPricingModal({ task, project, onClose, onSaved }) {
  const [plan, setPlan] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [mode, setMode] = useState('inherit');
  const [amount, setAmount] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [invoiceDate, setInvoiceDate] = useState('');
  const [split, setSplit] = useState(false);
  const [payments, setPayments] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const amountInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getTaskBilling(task.id)
      .then(({ data }) => {
        if (cancelled) return;
        setPlan(data);
        setMode(data.fixedPrice != null ? 'fixed' : data.hourlyRateOverride != null ? 'hourly' : 'inherit');
        setAmount(data.fixedPrice != null ? String(data.fixedPrice) : data.hourlyRateOverride != null ? String(data.hourlyRateOverride) : '');
        setIsBillable(data.isBillable);
        setInvoiceDate(data.invoiceDate || '');
        setSplit(data.installments.length > 0);
        setPayments(data.installments.filter(i => i.billId == null).map(i => newPayment({
          label: i.label || '', amount: String(i.amount), dueDate: i.dueDate || '',
        })));
      })
      .catch(err => {
        console.error('Failed to load task billing plan:', err);
        if (!cancelled) setLoadError('Could not load this task\'s pricing.');
      });
    return () => { cancelled = true; };
  }, [task.id]);

  if (!task) return null;

  const lockedPayments = plan ? plan.installments.filter(i => i.billId != null) : [];
  const hasLocked = lockedPayments.length > 0;
  const needsAmount = mode !== 'inherit';
  const parsedAmount = parseFloat(amount);
  const amountValid = !needsAmount || (amount !== '' && !isNaN(parsedAmount) && parsedAmount >= 0);
  const isSplit = mode === 'fixed' && split;

  const lockedTotal = lockedPayments.reduce((sum, p) => sum + p.amount, 0);
  const scheduledTotal = roundCents(lockedTotal + payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0));
  const remaining = roundCents((amountValid && mode === 'fixed' ? parsedAmount : 0) - scheduledTotal);
  const paymentsValid = payments.every(p => parseFloat(p.amount) > 0);
  const splitValid = !isSplit || (paymentsValid && Math.abs(remaining) < 0.005 && (payments.length > 0 || hasLocked));

  const projectRate = plan?.projectHourlyRate ?? project?.hourlyRate ?? 0;
  const projectDefault = plan?.projectInvoiceDayOfMonth
    ? `the project's pay run (invoice by the ${ordinal(plan.projectInvoiceDayOfMonth)})`
    : 'as soon as the work is done';

  const updatePayment = (uid, field, value) =>
    setPayments(prev => prev.map(p => (p.uid === uid ? { ...p, [field]: value } : p)));

  const startSplit = () => {
    setSplit(true);
    if (payments.length === 0 && !hasLocked) {
      // Sensible starting point: half up front, the rest when it's done
      const price = amountValid ? parsedAmount : 0;
      const half = roundCents(price / 2);
      setPayments([
        newPayment({ label: 'Deposit', amount: price ? String(half) : '', dueDate: getLocalDateString() }),
        newPayment({ label: 'Final payment', amount: price ? String(roundCents(price - half)) : '' }),
      ]);
    }
  };

  // Spread what's left after invoiced payments evenly; the last payment takes the odd cents
  const splitEvenly = () => {
    if (!amountValid || payments.length === 0) return;
    const pool = roundCents(parsedAmount - lockedTotal);
    const each = Math.floor((pool / payments.length) * 100) / 100;
    setPayments(prev => prev.map((p, i) => ({
      ...p,
      amount: String(i === prev.length - 1 ? roundCents(pool - each * (prev.length - 1)) : each),
    })));
  };

  const handleSave = async () => {
    if (!amountValid || !splitValid) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateTaskBilling(task.id, {
        fixedPrice: mode === 'fixed' ? parsedAmount : null,
        hourlyRateOverride: mode === 'hourly' ? parsedAmount : null,
        invoiceDate: isSplit ? null : (invoiceDate || null),
        installments: isSplit
          ? payments.map(p => ({ label: p.label.trim() || null, amount: roundCents(parseFloat(p.amount)), dueDate: p.dueDate || null }))
          : [],
        ...(plan?.isManual ? { isBillable } : {}),
      });
      onSaved();
    } catch (err) {
      console.error('Failed to update task billing:', err);
      setError(err.response?.data?.message || 'Failed to save. Please try again.');
      setIsSaving(false);
    }
  };

  const options = [
    { key: 'inherit', label: 'Project rate', description: `Bills at the project's rate (${formatNZD(projectRate)}/hr)` },
    { key: 'hourly', label: 'Custom hourly rate', description: 'Bills this task\'s hours at its own rate' },
    { key: 'fixed', label: 'Fixed price', description: 'Flat amount regardless of hours — the timer shows your live effective $/hr' },
  ];

  const sectionTitle = 'text-xs font-semibold uppercase tracking-wider text-gray-500';
  const input = 'px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Pricing & invoicing</h2>
            <p className="text-sm text-gray-500 truncate">{task.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {!plan && !loadError && (
          <div className="flex items-center justify-center gap-2 p-10 text-gray-500">
            <ArrowPathIcon className="h-5 w-5 animate-spin" /> Loading…
          </div>
        )}
        {loadError && <p className="p-5 text-sm text-red-600">{loadError}</p>}

        {plan && (
          <div className="p-5 space-y-6 overflow-y-auto">
            {!plan.projectIsBillable && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {plan.projectName || 'This project'} is set to non-billable, so this task won't show up for billing until the project is billable again.
              </p>
            )}

            {/* Pricing */}
            <section className="space-y-3">
              <h3 className={sectionTitle}>Pricing</h3>
              {options.map(opt => {
                const disabled = hasLocked && opt.key !== 'fixed';
                return (
                  <label
                    key={opt.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${mode === opt.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <input
                      type="radio"
                      name="pricing-mode"
                      checked={mode === opt.key}
                      disabled={disabled}
                      onChange={() => { setMode(opt.key); setTimeout(() => amountInputRef.current?.focus(), 0); }}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{opt.label}</p>
                      <p className="text-sm text-gray-500">{opt.description}</p>
                    </div>
                  </label>
                );
              })}
              {hasLocked && (
                <p className="text-xs text-gray-500">Payments of this task are already invoiced, so it stays fixed-price.</p>
              )}

              {needsAmount && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-gray-500">$</span>
                  <input
                    ref={amountInputRef}
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={mode === 'fixed' ? 'e.g. 190' : 'e.g. 70'}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-500">{mode === 'hourly' ? '/hour' : 'flat'}</span>
                </div>
              )}
            </section>

            {/* When to invoice */}
            <section className="space-y-3">
              <h3 className={sectionTitle}>When to invoice</h3>

              {mode === 'fixed' && (
                <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm">
                  <button
                    type="button"
                    disabled={hasLocked}
                    onClick={() => setSplit(false)}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${!split ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    One invoice
                  </button>
                  <button
                    type="button"
                    onClick={startSplit}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors ${split ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Split into payments
                  </button>
                </div>
              )}

              {!isSplit && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label htmlFor="invoice-date" className="text-sm text-gray-700">Invoice on</label>
                    <input id="invoice-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={input} />
                    {invoiceDate && (
                      <button type="button" onClick={() => setInvoiceDate('')} className="text-sm text-gray-500 hover:text-gray-700">Clear</button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {invoiceDate
                      ? `Shows up to bill on ${shortDate(invoiceDate)}, whether or not the task is done. Billing the task clears the date.`
                      : `Blank follows ${projectDefault}.`}
                  </p>
                </div>
              )}

              {isSplit && (
                <div className="space-y-2">
                  {lockedPayments.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
                      <LockClosedIcon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 truncate">{p.label || `Payment ${i + 1}`}</span>
                      <span className="tabular-nums">{formatNZD(p.amount)}</span>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Invoiced</span>
                    </div>
                  ))}

                  {payments.map((p, i) => {
                    const pct = amountValid && parsedAmount > 0 ? Math.round(((parseFloat(p.amount) || 0) / parsedAmount) * 100) : null;
                    return (
                      <div key={p.uid} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <input
                          type="text"
                          value={p.label}
                          maxLength={80}
                          onChange={(e) => updatePayment(p.uid, 'label', e.target.value)}
                          placeholder={`Payment ${lockedPayments.length + i + 1}`}
                          aria-label="Payment label"
                          className={`${input} flex-1 min-w-0`}
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-500">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={p.amount}
                            onChange={(e) => updatePayment(p.uid, 'amount', e.target.value)}
                            aria-label="Payment amount"
                            className={`${input} w-24`}
                          />
                          <span className="w-9 text-right text-xs text-gray-400 tabular-nums">{pct != null ? `${pct}%` : ''}</span>
                        </div>
                        <input
                          type="date"
                          value={p.dueDate}
                          onChange={(e) => updatePayment(p.uid, 'dueDate', e.target.value)}
                          aria-label="Send by"
                          title="Send by (blank = when the task is done)"
                          className={`${input} w-36`}
                        />
                        <button
                          type="button"
                          onClick={() => setPayments(prev => prev.filter(x => x.uid !== p.uid))}
                          className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Remove payment"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPayments(prev => [...prev, newPayment({ amount: remaining > 0 ? String(remaining) : '' })])}
                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        <PlusIcon className="h-4 w-4" /> Add payment
                      </button>
                      {payments.length > 1 && (
                        <button type="button" onClick={splitEvenly} className="text-sm text-gray-500 hover:text-gray-700">
                          Split evenly
                        </button>
                      )}
                    </div>
                    <p className={`text-sm font-medium tabular-nums ${Math.abs(remaining) < 0.005 ? 'text-green-700' : 'text-amber-700'}`}>
                      {Math.abs(remaining) < 0.005
                        ? `✓ Adds up to ${formatNZD(scheduledTotal)}`
                        : remaining > 0
                          ? `${formatNZD(remaining)} left to schedule`
                          : `${formatNZD(-remaining)} over the price`}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">Leave a date blank to invoice that payment when the task is done.</p>
                </div>
              )}
            </section>

            {plan.isManual && (
              <section>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} className="h-4 w-4 rounded" />
                  Billable
                  <span className="text-gray-400">— untick for internal work that shouldn't be invoiced</span>
                </label>
              </section>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!plan || isSaving || !amountValid || !splitValid}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskPricingModal;
