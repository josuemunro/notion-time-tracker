import React from 'react';
import { formatHoursHuman } from '../utils/timeUtils';
import { computeBillTotals, formatNZD } from '../utils/billingUtils';

function BillingOverview({ project, tasks }) {
  if (!project || !tasks) return null;

  // Billed: what the project's bills actually charged (ex GST), from the server.
  // Billing is per time entry, so a task can be part billed, part waiting.
  const billed = project.billedTotals || { subtotal: 0, hours: 0, billCount: 0 };
  const totalBilledAmount = billed.subtotal;
  const totalBilledTime = billed.hours;

  // Waiting: what billing everything outstanding would come to (bill rounding,
  // ex GST) — the server's billing items, matching the projects page and Unbilled list
  const items = project.billingItems || [];
  const totalUnbilledAmount = computeBillTotals(items, project.hourlyRate).subtotal;
  const totalUnbilledTime = items.filter(i => i.fixedPrice == null).reduce((sum, i) => sum + (i.hours || 0), 0);

  // In a non-billable project every task's time is unbillable
  const unbillableTasks = project.isBillable === false ? tasks : tasks.filter(task => !task.isBillable);
  const totalUnbillableTime = unbillableTasks.reduce((sum, task) => sum + (task.totalHoursSpent || 0), 0);

  const formatCurrency = formatNZD;

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-5">Billing Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Billed */}
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wider mb-2">
            Total Billed
          </h3>
          <p className="text-2xl font-bold text-green-800">
            {formatCurrency(totalBilledAmount)}
          </p>
          <p className="text-sm text-green-600 mt-1">
            {billed.billCount} bill{billed.billCount !== 1 ? 's' : ''} · {formatHoursHuman(totalBilledTime)} · ex GST
          </p>
          {billed.waivedSubtotal > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Waived {formatCurrency(billed.waivedSubtotal)} ({formatHoursHuman(billed.waivedHours)})
            </p>
          )}
        </div>

        {/* Waiting to be Billed */}
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h3 className="text-sm font-semibold text-yellow-700 uppercase tracking-wider mb-2">
            Waiting to be Billed
          </h3>
          <p className="text-2xl font-bold text-yellow-800">
            {formatCurrency(totalUnbilledAmount)}
          </p>
          <p className="text-sm text-yellow-600 mt-1">
            {formatHoursHuman(totalUnbilledTime)} · ex GST
          </p>
        </div>

        {/* Unbillable Time */}
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
            Unbillable Time
          </h3>
          <p className="text-2xl font-bold text-gray-800">
            {formatHoursHuman(totalUnbillableTime)}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {unbillableTasks.length} task{unbillableTasks.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Project Rate Info */}
      {project.hourlyRate > 0 && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-700">
            <span className="font-semibold">Project Rate:</span> {formatCurrency(project.hourlyRate)}/hour
          </p>
        </div>
      )}
    </div>
  );
}

export default BillingOverview; 