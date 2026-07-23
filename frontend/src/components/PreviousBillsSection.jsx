import React, { useState, useEffect } from 'react';
import { getProjectBills } from '../services/api';
import { formatHoursHuman } from '../utils/timeUtils';
import { ChevronDownIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

// Bill timestamps follow the app convention: NZ wall-clock time stored as a UTC ISO
// string, so format in UTC to display the original NZ time unshifted
const formatBillDate = (isoString) => {
  if (!isoString) return 'Unknown date';
  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(isoString));
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(amount || 0);
};

function PreviousBillsSection({ project, refreshToken = 0 }) {
  const [bills, setBills] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedBillId, setExpandedBillId] = useState(null);

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
    <div className="bg-white p-6 rounded-lg shadow-xl">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">Previous Bills</h2>

      {isLoading && (
        <div className="flex items-center text-gray-500 py-4">
          <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" />
          Loading bills...
        </div>
      )}

      {!isLoading && bills.length === 0 && (
        <p className="text-gray-500">No bills created yet. Completed bills will appear here with their task breakdowns.</p>
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
                    <div>
                      <p className="font-medium text-gray-800">{formatBillDate(bill.createdAt)}</p>
                      <p className="text-sm text-gray-500">
                        {bill.tasks.length} task{bill.tasks.length !== 1 ? 's' : ''} · {formatHoursHuman(bill.totalHours || 0)}
                        {' '}(billed as {formatHoursHuman(bill.roundedHours || 0)})
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800">{formatCurrency(bill.total)}</p>
                    <p className="text-xs text-gray-500">incl. GST</p>
                  </div>
                </button>

                {/* Expanded task breakdown */}
                {isExpanded && (
                  <div className="p-4 border-t border-gray-200 space-y-3">
                    <div className="space-y-1">
                      {bill.tasks.map(task => (
                        <div key={task.id} className="flex justify-between text-sm py-1">
                          <span className="text-gray-700 truncate pr-4">{task.taskName}</span>
                          <span className="text-gray-600 whitespace-nowrap tabular-nums">
                            {formatHoursHuman(task.hoursSpent || 0)}
                            <span className="text-gray-400 ml-2">({(task.hoursSpent || 0).toFixed(2)}h)</span>
                          </span>
                        </div>
                      ))}
                    </div>

                    <hr className="border-gray-200" />

                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Rate:</span>
                        <span className="text-gray-800">{formatCurrency(bill.hourlyRate)}/hour</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Subtotal ({formatHoursHuman(bill.roundedHours || 0)}):</span>
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
