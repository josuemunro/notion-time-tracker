import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { updateTaskPricing } from '../services/api';
import { formatNZD } from '../utils/billingUtils';

// Set a task's pricing mode: inherit the project rate (default), a custom
// hourly rate, or a fixed price. Local-only — never synced to Notion.
function TaskPricingModal({ task, project, onClose, onSaved }) {
  const initialMode = task.fixedPrice != null ? 'fixed' : task.hourlyRateOverride != null ? 'hourly' : 'inherit';
  const [mode, setMode] = useState(initialMode);
  const [amount, setAmount] = useState(
    task.fixedPrice != null ? String(task.fixedPrice)
      : task.hourlyRateOverride != null ? String(task.hourlyRateOverride)
        : ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!task) return null;

  const needsAmount = mode !== 'inherit';
  const parsedAmount = parseFloat(amount);
  const amountValid = !needsAmount || (!isNaN(parsedAmount) && parsedAmount >= 0);

  const handleSave = async () => {
    if (!amountValid) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateTaskPricing(task.id, {
        fixedPrice: mode === 'fixed' ? parsedAmount : null,
        hourlyRateOverride: mode === 'hourly' ? parsedAmount : null,
      });
      onSaved();
    } catch (err) {
      console.error('Failed to update task pricing:', err);
      setError('Failed to save pricing. Please try again.');
      setIsSaving(false);
    }
  };

  const options = [
    {
      key: 'inherit',
      label: 'Project rate',
      description: `Bills at the project's rate (${formatNZD(project?.hourlyRate || 0)}/hr)`,
    },
    {
      key: 'hourly',
      label: 'Custom hourly rate',
      description: 'Bills this task\'s hours at its own rate',
    },
    {
      key: 'fixed',
      label: 'Fixed price',
      description: 'Flat amount regardless of hours — the timer shows your live effective $/hr',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Task Pricing</h2>
            <p className="text-sm text-gray-500 truncate">{task.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {options.map(opt => (
            <label
              key={opt.key}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${mode === opt.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <input
                type="radio"
                name="pricing-mode"
                checked={mode === opt.key}
                onChange={() => setMode(opt.key)}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-gray-900">{opt.label}</p>
                <p className="text-sm text-gray-500">{opt.description}</p>
              </div>
            </label>
          ))}

          {needsAmount && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                placeholder={mode === 'fixed' ? 'e.g. 190' : 'e.g. 70'}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">{mode === 'hourly' ? '/hour' : 'flat'}</span>
            </div>
          )}

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
            onClick={handleSave}
            disabled={isSaving || !amountValid || (needsAmount && amount === '')}
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
