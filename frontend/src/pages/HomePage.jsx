import React, { useEffect, useState, useMemo } from 'react';
import { useTimer } from '../contexts/TimerContext';
import { getTasksInProgress } from '../services/api';
import TaskItem from '../components/common/TaskItem';
import TimelineView from '../components/TimelineView';
import DopamineTimer from '../components/DopamineTimer';
import { PlayIcon, StopIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

function HomePage() {
  const {
    activeTimerDetails,
    formattedElapsedTime,
    isRunning,
    startTimer,
    stopTimer,
    isLoadingTimer,
    refreshActiveTimer
  } = useTimer();

  const [inProgressTasksByProject, setInProgressTasksByProject] = useState([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [errorTasks, setErrorTasks] = useState(null);

  // Memoize today's date to prevent unnecessary re-renders of TimelineView
  const todayDate = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchInProgress = async () => {
    setIsLoadingTasks(true);
    setErrorTasks(null);
    try {
      const { data } = await getTasksInProgress();
      console.log('API response for /tasks/in-progress:', data); // For debugging

      if (Array.isArray(data)) {
        setInProgressTasksByProject(data);
      } else {
        // If data is not an array, log a warning and default to an empty array.
        // This could happen if the API returns an error object or unexpected format.
        console.warn('/api/tasks/in-progress did not return an array. Received:', data);
        setInProgressTasksByProject([]);
        // Optionally, if data seems like an error object, you could set an error message.
        if (data && typeof data === 'object' && data.message) {
          setErrorTasks(`Failed to load tasks: ${data.message}`);
        } else if (data === null || (typeof data === 'object' && Object.keys(data).length === 0 && data.constructor === Object)) {
          // If data is null or an empty object and we expect an array for "no tasks"
          setInProgressTasksByProject([]); // Already handled, but good to be explicit.
        }
      }
    } catch (err) {
      console.error("Failed to fetch in-progress tasks:", err);
      setErrorTasks('Failed to load tasks. Please try again or check the console.');
      setInProgressTasksByProject([]); // Ensure it's an array on error
    } finally {
      setIsLoadingTasks(false);
    }
  };

  useEffect(() => {
    fetchInProgress();
  }, []);

  // Refresh tasks if timer stops, to update their active status display potentially
  useEffect(() => {
    if (!isRunning) {
      fetchInProgress();
    }
  }, [isRunning])

  const handleQuickStart = (taskId, taskName, projectName) => {
    startTimer(taskId, taskName, projectName);
  };

  const handleStop = () => {
    stopTimer();
  };

  if (isLoadingTimer) {
    return (
      <div className="flex justify-center items-center h-64">
        <ArrowPathIcon className="h-12 w-12 text-gray-500 animate-spin" />
        <p className="ml-3 text-lg text-gray-700">Loading Timer...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Enhanced Dopamine Timer */}
      <DopamineTimer />

      {/* Stop Button for Active Timer */}
      {isRunning && (
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleStop}
            className="w-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            <StopIcon className="h-6 w-6 mr-2" /> Stop Timer
          </button>
        </div>
      )}

      {/* Timeline View */}
      <TimelineView selectedDate={todayDate} />

      {/* In-Progress Tasks List */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl sm:text-3xl font-semibold text-gray-800">Quick Start Tasks</h3>
          <button onClick={fetchInProgress} disabled={isLoadingTasks} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
            <ArrowPathIcon className={`h-6 w-6 text-gray-600 ${isLoadingTasks ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {isLoadingTasks && !errorTasks && (
          <div className="flex justify-center items-center py-8">
            <ArrowPathIcon className="h-10 w-10 text-gray-400 animate-spin" />
            <p className="ml-3 text-gray-600">Loading tasks...</p>
          </div>
        )}
        {errorTasks && <p className="text-center text-red-500 bg-red-100 p-3 rounded-md">{errorTasks}</p>}
        {!isLoadingTasks && !errorTasks && inProgressTasksByProject.length === 0 && (
          <p className="text-center text-gray-500 py-8">No tasks currently marked as 'in-progress' or active.</p>
        )}
        {!isLoadingTasks && !errorTasks && inProgressTasksByProject.map((projectGroup) => (
          <div key={projectGroup.projectId || projectGroup.projectName} className="mb-8 p-4 bg-gray-50/50 rounded-lg shadow">
            <h4 className="text-xl font-semibold text-gray-700 mb-3 border-b pb-2">
              {projectGroup.projectName || 'Unnamed Project'}
            </h4>
            {projectGroup.tasks && projectGroup.tasks.length > 0 ? (
              projectGroup.tasks.map((task) => (
                <TaskItem
                  key={task.id || task.taskId}
                  task={{
                    id: task.id || task.taskId,
                    name: task.name || task.taskName,
                    projectName: projectGroup.projectName,
                    projectIconType: projectGroup.projectIconType,
                    projectIconValue: projectGroup.projectIconValue,
                    projectColor: projectGroup.projectColor,
                    status: task.status || task.taskStatus,
                    totalHoursSpent: task.totalHoursSpent, // Ensure this is passed from the API data
                  }}
                  onStartOverride={handleQuickStart}
                />
              ))
            ) : (
              <p className="text-sm text-gray-500">No tasks listed for this project group.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default HomePage;