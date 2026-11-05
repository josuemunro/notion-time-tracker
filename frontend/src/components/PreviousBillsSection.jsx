import React, { useState, useEffect } from 'react';
import { getProjectBills, deleteBill } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { formatHoursHuman, formatDateTime } from '../utils/timeUtils';
import { ChevronDownIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import EmptyState from './common/EmptyState';

// Bill timestamps are real UTC instants; show them in the configured display timezone.
// Records of billing done elsewhere only carry a day (stored at midday), so no time.
const formatBillDate = (bill) => {
  if (!bill.createdAt) return 'Unknown date';
  return bill.kind === 'external' ? formatDateTime(bill.createdAt, { timeStyle: undefined }) : formatDateTime(bill.createdAt);
};

// Bills.kind: 'invoice' (billed here), 'external' (already billed elsewhere), 'waived' (written off)
const KIND_BADGES = {
  external: { label: 'Billed elsewhere', className: 'bg-blue-100 text-blue-700' },
  waived: { label: 'Waived', className: 'bg-gray-200 text-gray-700' },
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(amount || 0);
};

// onBillDeleted: called after a record is deleted (its work is unbilled again)
function PreviousBillsSection({ project, refreshToken = 0, onBillDeleted }) {
  const [bills, setBills] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedBillId, setExpandedBillId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { showSuccess, showError } = useToast();

  const handleDelete = async (bill) => {
    setDeletingId(bill.id);
    try {
      await deleteBill(project.id, bill.id);
      setBills(prev => prev.filter(b => b.id !== bill.id));
      setConfirmDeleteId(null);
      showSuccess(bill.kind === 'waived' ? 'Waiver removed — that work is unbilled again' : 'Bill deleted — its work is unbilled again');
      onBillDeleted?.();
    } catch (err) {
      console.error('Failed to delete bill:', err);
      showError('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;

    const fetchBills = async () => {
      setIsLoading(true);
      try {
        const { data } = await getProjectBills(project.id);
        if (!cancelled) setBills(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch bills:', err);
        if (!cancelled) setBills([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchBills();
    return () => { cancelled = true; };
  }, [project?.id, refreshToken]);

  if (!project) return null;

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Previous Bills</h2>

      {isLoading && (
        <div className="flex items-center text-gray-500 py-4">
          <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" />
          Loading bills...
        </div>
      )}

      {!isLoading && bills.length === 0 && (
        <EmptyState title="No bills created yet" hint="Completed bills will appear here with their task breakdowns." />
      )}

      {!isLoading && bills.length > 0 && (
        <div className="space-y-3">
          {bills.map(bill => {
            const isExpanded = expandedBillId === bill.id;
            return (
              <div key={bill.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Bill summary row */}
                <button
                  onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex items-center space-x-3">
                    {isExpanded ? (
                      <ChevronDownIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 flex items-center gap-2 flex-wrap">
                        {formatBillDate(bill)}
                        {KIND_BADGES[bill.kind] && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGES[bill.kind].className}`}>
                            {KIND_BADGES[bill.kind].label}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">
                        {bill.tasks.length} item{bill.tasks.length !== 1 ? 's' : ''} · {formatHoursHuman(bill.totalHours || 0)}
                        {' '}(billed as {formatHoursHuman(bill.roundedHours || 0)})
                      </p>
                      {bill.note && <p className="text-sm text-gray-600 italic truncate">{bill.note}</p>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-semibold ${bill.kind === 'waived' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{formatCurrency(bill.total)}</p>
                    <p className="text-xs text-gray-500">{bill.kind === 'waived' ? 'written off' : 'incl. GST'}</p>
                  </div>
                </button>

                {/* Expanded task breakdown */}
                {isExpanded && (
                  <div className="p-4 border-t border-gray-200 space-y-3">
                    <div className="space-y-1">
                      {bill.tasks.map(task => (
                        <div key={task.id} className="flex justify-between text-sm py-1">
                          <span className="text-gray-700 truncate pr-4">
                            {task.taskName}
                            {task.fixedPrice != null && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                                {task.installmentId != null ? 'Payment' : 'Fixed'} {formatCurrency(task.fixedPrice)}
                              </span>
                            )}
                          </span>
                          {/* A payment of a split task carries no hours of its own */}
                          {task.installmentId == null && (
                            <span className="text-gray-600 whitespace-nowrap tabular-nums">
                              {formatHoursHuman(task.hoursSpent || 0)}
                              <span className="text-gray-400 ml-2">
                                ({(task.hoursSpent || 0).toFixed(2)}h{task.fixedPrice == null && task.rate != null ? ` @ ${formatCurrency(task.rate)}/hr` : ''})
                              </span>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    <hr className="border-gray-200" />

                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Rate:</span>
                        <span className="text-gray-800">{formatCurrency(bill.hourlyRate)}/hour</span>
                      </div>
                      {(bill.fixedAmount || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Fixed-price items:</span>
                          <span className="text-gray-800">{formatCurrency(bill.fixedAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Subtotal ({formatHoursHuman(bill.roundedHours || 0)} billed):</span>
                        <span className="text-gray-800">{formatCurrency(bill.subtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">GST (15%):</span>
                        <span className="text-gray-800">{formatCurrency(bill.gst)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span className="text-gray-800">Total:</span>
                        <span className="text-gray-800">{formatCurrency(bill.total)}</span>
                      </div>
                    </div>

                    {/* Delete the record: everything on it goes back to unbilled */}
                    <div className="flex items-center justify-end gap-3 pt-1 text-sm">
                      {confirmDeleteId === bill.id ? (
                        <>
                          <span className="text-gray-600">Delete this {bill.kind === 'waived' ? 'waiver' : 'bill'}? Its work becomes unbilled again.</span>
                          <button onClick={() => setConfirmDeleteId(null)} className="font-medium text-gray-500 hover:text-gray-800">Cancel</button>
                          <button
                            onClick={() => handleDelete(bill)}
                            disabled={deletingId === bill.id}
                            className="rounded-lg bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700 disabled:bg-red-300 transition-colors"
                          >
                            {deletingId === bill.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(bill.id)} className="font-medium text-red-600 hover:text-red-800 transition-colors">
                          {bill.kind === 'waived' ? 'Remove waiver…' : 'Delete bill…'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PreviousBillsSection;
