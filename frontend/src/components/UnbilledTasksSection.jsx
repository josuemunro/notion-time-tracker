import React, { useState } from 'react';
import { formatHoursHuman } from '../utils/timeUtils';
import { CheckIcon } from '@heroicons/react/24/solid';
import BillingModal from './BillingModal';
import ProjectIcon from './ProjectIcon';
import EmptyState from './common/EmptyState';
import { computeBillTotals, taskBillAmount, formatNZD } from '../utils/billingUtils';

function UnbilledTasksSection({ project, tasks, onTasksBilled, onRefresh }) {
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [showBillingModal, setShowBillingModal] = useState(false);

  if (!project || !tasks) return null;

  const unbilledTasks = tasks.filter(task => task.isBillable && !task.beenBilled);

  if (unbilledTasks.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Unbilled Tasks</h2>
        <EmptyState title="No unbilled tasks for this project" hint="Billable tasks that haven't been billed yet will appear here." />
      </div>
    );
  }

  const toggleTaskSelection = (taskId) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const selectedTasksArray = unbilledTasks.filter(task => selectedTasks.has(task.id));
  const totals = computeBillTotals(selectedTasksArray, project.hourlyRate);

  const handleCreateBill = () => {
    setShowBillingModal(true);
  };

  const handleBillCompleted = async (taskIds) => {
    setSelectedTasks(new Set());
    setShowBillingModal(false);
    if (onTasksBilled) {
      await onTasksBilled(taskIds);
    }
    if (onRefresh) {
      onRefresh();
    }
  };

  return (
    <>
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2.5 mb-5">
          <ProjectIcon
            iconType={project.iconType}
            iconValue={project.iconValue}
            projectName={project.name}
            projectColor={project.color}
            className="w-6 h-6"
          />
          <h2 className="text-lg font-semibold text-gray-900">Unbilled Tasks</h2>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Task List - 70% width on desktop */}
          <div className="lg:w-[70%]">
            <div className="space-y-3">
              {unbilledTasks.map(task => (
                <div
                  key={task.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${selectedTasks.has(task.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
                    }`}
                  onClick={() => toggleTaskSelection(task.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${selectedTasks.has(task.id)
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                        }`}>
                        {selectedTasks.has(task.id) && (
                          <CheckIcon className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-gray-800">{task.name}</h3>
                          {task.fixedPrice != null && (
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                              Fixed {formatNZD(task.fixedPrice)}
                            </span>
                          )}
                          {task.fixedPrice == null && task.hourlyRateOverride != null && (
                            <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                              @{formatNZD(task.hourlyRateOverride)}/hr
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">Status: {task.status}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-800">
                        {formatHoursHuman(task.totalHoursSpent || 0)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {formatNZD(taskBillAmount(task, project.hourlyRate))}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bill Preview - 30% width on desktop */}
          <div className="lg:w-[30%]">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 sticky top-4">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Bill Preview</h3>

              {selectedTasksArray.length === 0 ? (
                <p className="text-gray-500 text-sm">Select tasks to preview bill</p>
              ) : (
                <div className="space-y-3">
                  {/* Selected Tasks */}
                  <div className="space-y-2">
                    {selectedTasksArray.map(task => (
                      <div key={task.id} className="flex justify-between text-sm">
                        <span className="truncate pr-2">{task.name}</span>
                        <span className="whitespace-nowrap">
                          {task.fixedPrice != null
                            ? formatNZD(task.fixedPrice)
                            : formatHoursHuman(task.totalHoursSpent || 0)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <hr className="border-gray-300" />

                  {/* Totals */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total Time:</span>
                      <span className="font-medium">{formatHoursHuman(totals.totalHours)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Billed Time:</span>
                      <span className="font-medium">{formatHoursHuman(totals.roundedHours)}</span>
                    </div>
                    {totals.fixedAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Fixed-price items:</span>
                        <span className="font-medium">{formatNZD(totals.fixedAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span className="font-medium">{formatNZD(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>GST (15%):</span>
                      <span className="font-medium">{formatNZD(totals.gst)}</span>
                    </div>
                    <hr className="border-gray-300" />
                    <div className="flex justify-between font-semibold">
                      <span>Total:</span>
                      <span>{formatNZD(totals.total)}</span>
                    </div>
                  </div>

                  {/* Create Bill Button */}
                  <button
                    onClick={handleCreateBill}
                    disabled={selectedTasksArray.length === 0}
                    className="w-full mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    Create Bill
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Billing Modal */}
      {showBillingModal && (
        <BillingModal
          project={project}
          selectedTasks={selectedTasksArray}
          onClose={() => setShowBillingModal(false)}
          onCompleted={handleBillCompleted}
        />
      )}
    </>
  );
}

export default UnbilledTasksSection; 