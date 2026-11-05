import React from 'react';
import { PlayIcon, StopIcon, ClockIcon, CheckIcon, CurrencyDollarIcon } from '@heroicons/react/24/solid';
import { useTimer } from '../../contexts/TimerContext';
import { formatHoursHuman } from '../../utils/timeUtils';
import { formatNZD } from '../../utils/billingUtils';

// compact: single dense row for grouped lists (home Quick Start) — the group
// header already names the project, so it's omitted here
function TaskItem({ task, onStartOverride, onStopOverride, onMarkDone, onEditPricing, compact = false }) {
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

  if (compact) {
    const name = task.name || task.taskName;
    const chip = 'inline-flex flex-shrink-0 items-center rounded-full px-1.5 py-px text-[11px] font-medium';
    const meta = [
      !isThisTaskActive && task.status,
      task.totalHoursSpent !== undefined && formatHoursHuman(parseFloat(task.totalHoursSpent || 0)),
    ].filter(Boolean).join(' · ');

    return (
      <div className={`flex items-center gap-2 rounded-lg border pl-3 pr-1 py-1.5 transition-colors
                       ${isThisTaskActive
                         ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-400'
                         : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {isThisTaskActive && <ClockIcon className="h-3.5 w-3.5 flex-shrink-0 text-blue-600 animate-pulse" aria-label="Active" />}
            <span className={`truncate text-sm font-medium ${isThisTaskActive ? 'text-blue-700' : 'text-gray-900'}`} title={name}>
              {name}
            </span>
            {task.isManual && <span className={`${chip} bg-amber-100 text-amber-700`}>Local</span>}
            {task.fixedPrice != null && (
              <span className={`${chip} bg-purple-100 text-purple-700`}>Fixed {formatNZD(task.fixedPrice)}</span>
            )}
            {task.fixedPrice == null && task.hourlyRateOverride != null && (
              <span className={`${chip} bg-sky-100 text-sky-700`}>@{formatNZD(task.hourlyRateOverride)}/hr</span>
            )}
          </div>
          {meta && <p className="text-xs text-gray-500 tabular-nums truncate">{meta}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center">
          {onEditPricing && (
            <button
              onClick={() => onEditPricing(task)}
              className="p-1.5 rounded-full text-gray-400 hover:text-purple-600 hover:bg-purple-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 transition-colors"
              title="Edit task pricing"
            >
              <CurrencyDollarIcon className="h-4 w-4" />
            </button>
          )}
          {task.isManual && onMarkDone && !isThisTaskActive && (
            <button
              onClick={() => onMarkDone(task.id)}
              className="p-1.5 rounded-full text-gray-400 hover:text-green-600 hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 transition-colors"
              title="Mark as Done"
            >
              <CheckIcon className="h-4 w-4" />
            </button>
          )}
          {isThisTaskActive ? (
            <button
              onClick={handleStop}
              className="p-1.5 rounded-full text-red-500 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors"
              title="Stop Timer"
            >
              <StopIcon className="h-6 w-6" />
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="p-1.5 rounded-full text-green-500 hover:bg-green-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 transition-colors"
              title="Start Timer"
            >
              <PlayIcon className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>
    );
  }

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
