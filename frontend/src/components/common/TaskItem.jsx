import React from 'react';
import { PlayIcon, StopIcon, ClockIcon } from '@heroicons/react/24/solid'; // Added ClockIcon
import { useTimer } from '../../contexts/TimerContext';

// You'll need to install @heroicons/react: npm install @heroicons/react
// Or use any other icon library / SVGs

function TaskItem({ task, onStartOverride, onStopOverride }) {
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
    <div className={`p-4 mb-3 rounded-lg shadow-sm hover:shadow-lg transition-all duration-300 ease-in-out relative overflow-hidden
                     ${isThisTaskActive ? 'bg-blue-50 ring-2 ring-blue-500 ring-offset-1' : 'bg-white'}`}>
      {isThisTaskActive && (
        <div className="absolute top-2 right-2 flex items-center text-blue-600">
          <ClockIcon className="h-4 w-4 animate-pulse" />
          <span className="ml-1 text-xs font-medium">ACTIVE</span>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h4 className={`font-semibold text-lg ${isThisTaskActive ? 'text-blue-700' : 'text-gray-800'}`}>{task.name || task.taskName}</h4>
          <p className="text-sm text-gray-600">
            {task.projectName ? `Project: ${task.projectName}` : (task.project?.name || 'No Project')}
          </p>
          {task.status && !isThisTaskActive && <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full mt-1 inline-block">{task.status}</span>}
        </div>
        <div className="flex items-center ml-2"> {/* Added ml-2 for spacing */}
          {isThisTaskActive ? (
            <button
              onClick={handleStop}
              className="p-2 rounded-full text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors"
              title="Stop Timer"
            >
              <StopIcon className="h-7 w-7 sm:h-8 sm:w-8" /> {/* Slightly larger icons */}
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="p-2 rounded-full text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors"
              title="Start Timer"
            >
              <PlayIcon className="h-7 w-7 sm:h-8 sm:w-8" /> {/* Slightly larger icons */}
            </button>
          )}
        </div>
      </div>
      {/* This part for totalHoursSpent will be addressed in the next point */}
      {task.totalHoursSpent !== undefined && (
          <p className="text-xs text-gray-500 mt-1">
            Logged: {parseFloat(task.totalHoursSpent).toFixed(2)} hrs
          </p>
      )}
    </div>
  );
}

export default TaskItem;