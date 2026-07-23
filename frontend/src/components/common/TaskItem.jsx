import React from 'react';
import { PlayIcon, StopIcon, ClockIcon, CheckIcon, CurrencyDollarIcon } from '@heroicons/react/24/solid';
import { useTimer } from '../../contexts/TimerContext';
import { formatHoursHuman } from '../../utils/timeUtils';
import { formatNZD } from '../../utils/billingUtils';

function TaskItem({ task, onStartOverride, onStopOverride, onMarkDone, onEditPricing }) {
  const { startTimer, stopTimer, activeTimerDetails, isRunning } = useTimer();
  const isThisTaskActive = isRunning && activeTimerDetails?.taskId === task.id;

  const handleStart = () => {
    if (onStartOverride) {
      onStartOverride(task.id, task.name, task.projectName);
    } else {
      startTimer(task.id, task.name, task.projectName);
    }
  };

  const handleStop = () => {
    if (onStopOverride) {
      onStopOverride();
    } else {
      stopTimer();
    }
  };

  return (
    <div className={`p-4 rounded-xl border transition-all duration-200 relative overflow-hidden
                     ${isThisTaskActive
                       ? 'border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 ring-2 ring-blue-500 ring-offset-1'
                       : 'border-gray-200 bg-white shadow-sm hover:shadow-md'}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-start flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className={`font-semibold text-base ${isThisTaskActive ? 'text-blue-700' : 'text-gray-900'}`}>{task.name || task.taskName}</h4>
              {isThisTaskActive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  <ClockIcon className="h-3 w-3 animate-pulse" />
                  ACTIVE
                </span>
              )}
              {task.isManual && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  Local
                </span>
              )}
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
            <p className="text-sm text-gray-500">
              {task.projectName ? `Project: ${task.projectName}` : (task.project?.name || 'No Project')}
            </p>
            {task.status && !isThisTaskActive && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 mt-1.5">{task.status}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-4 flex-shrink-0">
          {onEditPricing && (
            <button
              onClick={() => onEditPricing(task)}
              className="p-2 rounded-full text-gray-400 hover:text-purple-600 hover:bg-purple-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 transition-colors duration-200"
              title="Edit task pricing"
            >
              <CurrencyDollarIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          )}
          {task.isManual && onMarkDone && !isThisTaskActive && (
            <button
              onClick={() => onMarkDone(task.id)}
              className="p-2 rounded-full text-gray-400 hover:text-green-600 hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 transition-colors duration-200"
              title="Mark as Done"
            >
              <CheckIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          )}
          {isThisTaskActive ? (
            <button
              onClick={handleStop}
              className="p-3 rounded-full text-red-500 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow-md"
              title="Stop Timer"
            >
              <StopIcon className="h-7 w-7 sm:h-8 sm:w-8" />
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="p-3 rounded-full text-green-500 hover:bg-green-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow-md"
              title="Start Timer"
            >
              <PlayIcon className="h-7 w-7 sm:h-8 sm:w-8" />
            </button>
          )}
        </div>
      </div>
      {task.totalHoursSpent !== undefined && (
        <p className="text-xs text-gray-400 mt-1">
          Logged: {formatHoursHuman(parseFloat(task.totalHoursSpent))}
        </p>
      )}
    </div>
  );
}

export default TaskItem;
