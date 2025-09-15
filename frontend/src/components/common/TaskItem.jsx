import React from 'react';
import { PlayIcon, StopIcon, ClockIcon } from '@heroicons/react/24/solid'; // Added ClockIcon
import { useTimer } from '../../contexts/TimerContext';
import { formatHoursHuman } from '../../utils/timeUtils';
import ProjectIcon from '../ProjectIcon';

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
                     ${isThisTaskActive ? 'bg-gradient-to-r from-blue-50 to-indigo-50 ring-2 ring-blue-500 ring-offset-1' : 'bg-white'}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <ProjectIcon
            iconType={task.projectIconType || task.project?.iconType}
            iconValue={task.projectIconValue || task.project?.iconValue}
            projectName={task.projectName || task.project?.name}
            projectColor={task.projectColor || task.project?.color}
            className="w-6 h-6 mt-1 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-semibold text-lg ${isThisTaskActive ? 'text-blue-700' : 'text-gray-800'}`}>{task.name || task.taskName}</h4>
              {isThisTaskActive && (
                <div className="flex items-center bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                  <ClockIcon className="h-3 w-3 animate-pulse mr-1" />
                  <span className="text-xs font-medium">ACTIVE</span>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-600">
              {task.projectName ? `Project: ${task.projectName}` : (task.project?.name || 'No Project')}
            </p>
            {task.status && !isThisTaskActive && <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full mt-1 inline-block">{task.status}</span>}
          </div>
        </div>
        <div className="flex items-center ml-4 flex-shrink-0">
          {isThisTaskActive ? (
            <button
              onClick={handleStop}
              className="p-3 rounded-full text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow-md"
              title="Stop Timer"
            >
              <StopIcon className="h-7 w-7 sm:h-8 sm:w-8" />
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="p-3 rounded-full text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow-md"
              title="Start Timer"
            >
              <PlayIcon className="h-7 w-7 sm:h-8 sm:w-8" />
            </button>
          )}
        </div>
      </div>
      {task.totalHoursSpent !== undefined && (
        <p className="text-xs text-gray-500 mt-1">
          Logged: {formatHoursHuman(parseFloat(task.totalHoursSpent))}
        </p>
      )}
    </div>
  );
}

export default TaskItem;