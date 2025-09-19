import React, { useState } from 'react';
import { formatHoursHuman } from '../utils/timeUtils';
import { CheckIcon } from '@heroicons/react/24/solid';
import BillingModal from './BillingModal';

function UnbilledTasksSection({ project, tasks, onTasksBilled, onRefresh }) {
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [showBillingModal, setShowBillingModal] = useState(false);

  if (!project || !tasks) return null;

  const unbilledTasks = tasks.filter(task => task.isBillable && !task.beenBilled);

  if (unbilledTasks.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Unbilled Tasks</h2>
        <p className="text-gray-500">No unbilled tasks found for this project.</p>
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
  const totalSelectedTime = selectedTasksArray.reduce((sum, task) => sum + (task.totalHoursSpent || 0), 0);
  const subtotal = totalSelectedTime * (project.hourlyRate || 0);
  const gst = subtotal * 0.15; // 15% GST
  const total = subtotal + gst;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD'
    }).format(amount);
  };

  // Round time to nearest 0.25 hours (15 minutes)
  const roundToQuarterHour = (hours) => {
    return Math.ceil(hours * 4) / 4;
  };

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
      <div className="bg-white p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">Unbilled Tasks</h2>

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
                        <h3 className="font-medium text-gray-800">{task.name}</h3>
                        <p className="text-sm text-gray-600">Status: {task.status}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-800">
                        {formatHoursHuman(task.totalHoursSpent || 0)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {formatCurrency((task.totalHoursSpent || 0) * (project.hourlyRate || 0))}
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
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Bill Preview</h3>

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
                          {formatHoursHuman(task.totalHoursSpent || 0)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <hr className="border-gray-300" />

                  {/* Totals */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total Time:</span>
                      <span className="font-medium">{formatHoursHuman(totalSelectedTime)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Rounded Time:</span>
                      <span className="font-medium">{formatHoursHuman(roundToQuarterHour(totalSelectedTime))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span className="font-medium">{formatCurrency(roundToQuarterHour(totalSelectedTime) * (project.hourlyRate || 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>GST (15%):</span>
                      <span className="font-medium">{formatCurrency(roundToQuarterHour(totalSelectedTime) * (project.hourlyRate || 0) * 0.15)}</span>
                    </div>
                    <hr className="border-gray-300" />
                    <div className="flex justify-between font-semibold">
                      <span>Total:</span>
                      <span>{formatCurrency(roundToQuarterHour(totalSelectedTime) * (project.hourlyRate || 0) * 1.15)}</span>
                    </div>
                  </div>

                  {/* Create Bill Button */}
                  <button
                    onClick={handleCreateBill}
                    disabled={selectedTasksArray.length === 0}
                    className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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