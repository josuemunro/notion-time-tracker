import React, { useState } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/solid';
import { createBill, deleteBill } from '../services/api';
import { computeBillTotals, formatNZD } from '../utils/billingUtils';
import { formatHoursHuman, getLocalDateString } from '../utils/timeUtils';
import { billPayload, shortDate } from '../utils/billingSchedule';
import { useToast } from '../contexts/ToastContext';

const MODES = {
  external: {
    tab: 'Already billed',
    title: 'Mark as already billed',
    explain: 'Records this as billed on that date without making an invoice here. It counts toward Total billed.',
    notePlaceholder: 'e.g. INV-1042 in Xero',
  },
  waived: {
    tab: 'Waive',
    title: 'Waive',
    explain: 'Writes this off. It leaves the billing lists and doesn\'t count as billed money. Undo it any time from Previous Bills.',
    notePlaceholder: 'e.g. Goodwill, covered by the retainer',
  },
};

// Settle billing items without invoicing them here: record them as billed
// elsewhere (on a date) or waive them. Both are bill records with a `kind`,
// so they mark the same work billed and undo the same way (delete the record).
// items: billing items from the server; project: { id, name, hourlyRate }.
function ResolveItemsModal({ project, items, initialMode = 'external', onClose, onCompleted }) {
  const [mode, setMode] = useState(initialMode);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(items.map(i => i.key)));
  const [billedOn, setBilledOn] = useState(getLocalDateString());
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const { showUndo, showError } = useToast();

  const today = getLocalDateString();
  const selected = items.filter(i => selectedKeys.has(i.key));
  const totals = computeBillTotals(selected, project.hourlyRate);
  const dateValid = mode !== 'external' || (billedOn && billedOn <= today);
  const copy = MODES[mode];

  const toggle = (key) => setSelectedKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const handleConfirm = async () => {
    if (selected.length === 0 || !dateValid) return;
    setIsSaving(true);
    setError(null);
    try {
      const { data: bill } = await createBill(project.id, {
        ...billPayload(selected),
        kind: mode,
        billedOn: mode === 'external' ? billedOn : null,
        note: note.trim() || null,
      });
      const what = `${selected.length} item${selected.length !== 1 ? 's' : ''} (${formatNZD(totals.subtotal)})`;
      showUndo(
        mode === 'waived' ? `Waived ${what}` : `Marked ${what} as billed on ${shortDate(billedOn)}`,
        async () => {
          try {
            await deleteBill(project.id, bill.billId);
            onCompleted();
          } catch (err) {
            console.error('Failed to undo:', err);
            showError('Failed to undo');
          }
        }
      );
      onCompleted();
    } catch (err) {
      console.error('Failed to settle items:', err);
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
      setIsSaving(false);
    }
  };

  const input = 'px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">{copy.title}</h2>
            <p className="text-sm text-gray-500 truncate">{project.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm">
            {Object.entries(MODES).map(([key, m]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${mode === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {m.tab}
              </button>
            ))}
          </div>

          <ul className="space-y-1.5">
            {items.map(item => {
              const checked = selectedKeys.has(item.key);
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => toggle(item.key)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <span className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center ${checked ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                      {checked && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-gray-800">
                      {item.name}
                      {item.label && <span className="text-gray-500"> — {item.label}</span>}
                    </span>
                    <span className="flex-shrink-0 tabular-nums text-gray-500">
                      {item.fixedPrice != null ? formatNZD(item.amount) : formatHoursHuman(item.totalHoursSpent)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-baseline justify-between text-sm">
            <span className="text-gray-500">{mode === 'waived' ? 'Writing off' : 'Recording'}</span>
            <span className="font-semibold tabular-nums text-gray-900">{formatNZD(totals.subtotal)} <span className="text-xs font-normal text-gray-400">ex GST</span></span>
          </div>

          {mode === 'external' && (
            <div className="flex items-center gap-2">
              <label htmlFor="billed-on" className="text-sm text-gray-700">Billed on</label>
              <input id="billed-on" type="date" value={billedOn} max={today} onChange={(e) => setBilledOn(e.target.value)} className={input} />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="settle-note" className="text-sm text-gray-700">Note <span className="text-gray-400">(optional)</span></label>
            <input
              id="settle-note"
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={copy.notePlaceholder}
              className={`${input} w-full`}
            />
          </div>

          <p className="text-xs text-gray-500">{copy.explain}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSaving || selected.length === 0 || !dateValid}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${mode === 'waived' ? 'bg-gray-700 hover:bg-gray-800 focus-visible:ring-gray-500' : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500'}`}
          >
            {isSaving ? 'Saving...' : mode === 'waived' ? `Waive ${formatNZD(totals.subtotal)}` : `Mark ${selected.length} as billed`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResolveItemsModal;
