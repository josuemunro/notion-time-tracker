import React, { useState } from 'react';
import { XMarkIcon, ClipboardIcon, CheckIcon } from '@heroicons/react/24/solid';
import { formatHoursHuman } from '../utils/timeUtils';
import { updateTasksBillingStatus } from '../services/api';
import { useToast } from '../contexts/ToastContext';

function BillingModal({ project, selectedTasks, onClose, onCompleted }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedType, setCopiedType] = useState(null);
  const { showUndo } = useToast();

  if (!project || !selectedTasks || selectedTasks.length === 0) return null;

  // Round time to nearest 0.25 hours (15 minutes)
  const roundToQuarterHour = (hours) => {
    return Math.ceil(hours * 4) / 4;
  };

  const totalTime = selectedTasks.reduce((sum, task) => sum + (task.totalHoursSpent || 0), 0);
  const roundedTime = roundToQuarterHour(totalTime);
  const subtotal = roundedTime * (project.hourlyRate || 0);
  const gst = subtotal * 0.15;
  const total = subtotal + gst;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD'
    }).format(amount);
  };

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const handleCompleteBill = async () => {
    setIsUpdating(true);
    try {
      const taskIds = selectedTasks.map(task => task.id);
      await updateTasksBillingStatus(project.id, taskIds, true);

      // Show undo toast
      showUndo(
        `Bill completed for ${selectedTasks.length} task${selectedTasks.length !== 1 ? 's' : ''}`,
        async () => {
          try {
            await updateTasksBillingStatus(project.id, taskIds, false);
            onCompleted(taskIds); // Refresh the data
          } catch (error) {
            console.error('Failed to undo billing:', error);
          }
        }
      );

      onCompleted(taskIds);
    } catch (error) {
      console.error('Failed to update billing status:', error);
      alert('Failed to update billing status. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      className="fixed z-50"
      style={{
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        marginBottom: '0'
      }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-800">Final Bill</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Bill Content */}
        <div className="p-6 space-y-6">
          {/* Project Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-2">Project: {project.name}</h3>
            <p className="text-sm text-gray-600">Client: {project.clientName || 'N/A'}</p>
            <p className="text-sm text-gray-600">Rate: {formatCurrency(project.hourlyRate || 0)}/hour</p>
          </div>

          {/* Task Details */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">Tasks Included:</h3>
            <div className="space-y-2">
              {selectedTasks.map(task => (
                <div key={task.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{task.name}</p>
                    <p className="text-sm text-gray-600">Status: {task.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-800">
                      {formatHoursHuman(task.totalHoursSpent || 0)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {(task.totalHoursSpent || 0).toFixed(2)}h decimal
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Time Summary */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-3">Time Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-blue-700">Actual Time:</span>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-blue-800">{formatHoursHuman(totalTime)}</span>
                  <button
                    onClick={() => copyToClipboard(totalTime.toFixed(2), 'actual')}
                    className="p-1 rounded hover:bg-blue-200 transition-colors"
                    title="Copy decimal hours"
                  >
                    {copiedType === 'actual' ? (
                      <CheckIcon className="w-4 h-4 text-green-600" />
                    ) : (
                      <ClipboardIcon className="w-4 h-4 text-blue-600" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Rounded Time (0.25h increments):</span>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-blue-800">{formatHoursHuman(roundedTime)}</span>
                  <button
                    onClick={() => copyToClipboard(roundedTime.toFixed(2), 'rounded')}
                    className="p-1 rounded hover:bg-blue-200 transition-colors"
                    title="Copy decimal hours"
                  >
                    {copiedType === 'rounded' ? (
                      <CheckIcon className="w-4 h-4 text-green-600" />
                    ) : (
                      <ClipboardIcon className="w-4 h-4 text-blue-600" />
                    )}
                  </button>
                </div>
              </div>
              <div className="text-xs text-blue-600 mt-1">
                Decimal: {totalTime.toFixed(2)}h → {roundedTime.toFixed(2)}h
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <h3 className="font-semibold text-green-800 mb-3">Financial Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-green-700">Subtotal:</span>
                <span className="font-medium text-green-800">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">GST (15%):</span>
                <span className="font-medium text-green-800">{formatCurrency(gst)}</span>
              </div>
              <hr className="border-green-300" />
              <div className="flex justify-between text-lg">
                <span className="font-semibold text-green-800">Total:</span>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-green-800">{formatCurrency(total)}</span>
                  <button
                    onClick={() => copyToClipboard(total.toFixed(2), 'total')}
                    className="p-1 rounded hover:bg-green-200 transition-colors"
                    title="Copy total amount"
                  >
                    {copiedType === 'total' ? (
                      <CheckIcon className="w-4 h-4 text-green-600" />
                    ) : (
                      <ClipboardIcon className="w-4 h-4 text-green-600" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCompleteBill}
            disabled={isUpdating}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isUpdating ? 'Processing...' : 'Complete Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BillingModal; 