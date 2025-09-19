import React from 'react';
import { formatHoursHuman } from '../utils/timeUtils';

function BillingOverview({ project, tasks }) {
  if (!project || !tasks) return null;

  // Calculate billing totals
  const billedTasks = tasks.filter(task => task.isBillable && task.beenBilled);
  const unbilledTasks = tasks.filter(task => task.isBillable && !task.beenBilled);
  const unbillableTasks = tasks.filter(task => !task.isBillable);

  const totalBilledTime = billedTasks.reduce((sum, task) => sum + (task.totalHoursSpent || 0), 0);
  const totalUnbilledTime = unbilledTasks.reduce((sum, task) => sum + (task.totalHoursSpent || 0), 0);
  const totalUnbillableTime = unbillableTasks.reduce((sum, task) => sum + (task.totalHoursSpent || 0), 0);

  const totalBilledAmount = totalBilledTime * (project.hourlyRate || 0);
  const totalUnbilledAmount = totalUnbilledTime * (project.hourlyRate || 0);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD'
    }).format(amount);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-xl">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Billing Overview</h2>

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
            {formatHoursHuman(totalBilledTime)}
          </p>
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
            {formatHoursHuman(totalUnbilledTime)}
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