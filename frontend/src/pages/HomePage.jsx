import React, { useEffect, useState, useMemo } from 'react';
import { useTimer } from '../contexts/TimerContext';
import { useToast } from '../contexts/ToastContext';
import { getTasksInProgress, getTimeEntries, updateTaskStatus } from '../services/api';
import TaskItem from '../components/common/TaskItem';
import TimelineView from '../components/TimelineView';
import DopamineTimer from '../components/DopamineTimer';
import ProjectIcon from '../components/ProjectIcon';
import AddTaskModal from '../components/AddTaskModal';
import { PlayIcon, StopIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, ListBulletIcon, PlusIcon } from '@heroicons/react/24/solid';
import { getNZDateString, formatNZTime, formatDurationHuman } from '../utils/timeUtils';

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
  const { showSuccess, showError } = useToast();

  const [inProgressTasksByProject, setInProgressTasksByProject] = useState([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [errorTasks, setErrorTasks] = useState(null);
  const [activeTab, setActiveTab] = useState('tasks');
  const [dayEntries, setDayEntries] = useState([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);

  // State for selected date with navigation support
  const [selectedDate, setSelectedDate] = useState(() => getNZDateString());

  // Memoize today's date for comparison using NZ timezone
  const todayDate = useMemo(() => getNZDateString(), []);

  // Navigation functions
  const navigateToDate = (direction) => {
    setSelectedDate(prevDate => {
      const currentDate = new Date(prevDate);
      if (direction === 'prev') {
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return getNZDateString(currentDate);
    });
  };

  const goToToday = () => {
    setSelectedDate(todayDate);
  };

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

  const fetchDayEntries = async () => {
    setIsLoadingEntries(true);
    try {
      const { data } = await getTimeEntries({ date: selectedDate });
      setDayEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch day entries:', err);
      setDayEntries([]);
    } finally {
      setIsLoadingEntries(false);
    }
  };

  useEffect(() => {
    fetchInProgress();
  }, []);

  useEffect(() => {
    if (activeTab === 'entries') {
      fetchDayEntries();
    }
  }, [activeTab, selectedDate]);

  // Refresh when timer stops
  useEffect(() => {
    if (!isRunning) {
      fetchInProgress();
      if (activeTab === 'entries') fetchDayEntries();
    }
  }, [isRunning])

  const handleQuickStart = (taskId, taskName, projectName) => {
    startTimer(taskId, taskName, projectName);
  };

  const handleStop = () => {
    stopTimer();
  };

  const handleMarkDone = async (taskId) => {
    try {
      await updateTaskStatus(taskId, 'Done');
      showSuccess('Task marked as done');
      fetchInProgress();
    } catch (err) {
      console.error('Failed to mark task as done:', err);
      showError('Failed to mark task as done');
    }
  };

  const handleTaskCreated = () => {
    showSuccess('Task added to Quick Start');
    fetchInProgress();
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

      {/* Timeline View with Date Navigation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border p-4">
          <button
            onClick={() => navigateToDate('prev')}
            className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            <span>Previous Day</span>
          </button>

          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-gray-800">
              {new Date(selectedDate).toLocaleDateString('en-NZ', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </h2>
            {selectedDate === todayDate ? (
              <span className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg font-medium">
                Today
              </span>
            ) : (
              <button
                onClick={goToToday}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors"
              >
                Go to Today
              </button>
            )}
          </div>

          <button
            onClick={() => navigateToDate('next')}
            className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span>Next Day</span>
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        <TimelineView selectedDate={selectedDate} />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex items-center border-b mb-6">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'tasks'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ListBulletIcon className="h-5 w-5" />
            Quick Start Tasks
          </button>
          <button
            onClick={() => setActiveTab('entries')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'entries'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ClockIcon className="h-5 w-5" />
            Today's Entries
            {dayEntries.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{dayEntries.length}</span>
            )}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {activeTab === 'tasks' && (
              <button
                onClick={() => setShowAddTaskModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Add Task
              </button>
            )}
            <button
              onClick={() => activeTab === 'tasks' ? fetchInProgress() : fetchDayEntries()}
              disabled={isLoadingTasks || isLoadingEntries}
              className="p-2 rounded-full hover:bg-gray-200 transition-colors"
            >
              <ArrowPathIcon className={`h-5 w-5 text-gray-600 ${(isLoadingTasks || isLoadingEntries) ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Start Tasks Tab */}
        {activeTab === 'tasks' && (
          <>
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
                        totalHoursSpent: task.totalHoursSpent,
                        isManual: task.isManual,
                      }}
                      onStartOverride={handleQuickStart}
                      onMarkDone={handleMarkDone}
                    />
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No tasks listed for this project group.</p>
                )}
              </div>
            ))}
          </>
        )}

        {/* Today's Entries Tab */}
        {activeTab === 'entries' && (
          <>
            {isLoadingEntries && (
              <div className="flex justify-center items-center py-8">
                <ArrowPathIcon className="h-10 w-10 text-gray-400 animate-spin" />
                <p className="ml-3 text-gray-600">Loading entries...</p>
              </div>
            )}
            {!isLoadingEntries && dayEntries.length === 0 && (
              <p className="text-center text-gray-500 py-8">No time entries for this day.</p>
            )}
            {!isLoadingEntries && dayEntries.length > 0 && (
              <div className="space-y-3">
                {dayEntries.map((entry) => (
                  <div
                    key={entry.timeEntryId}
                    className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow"
                  >
                    <ProjectIcon
                      iconType={entry.projectIconType}
                      iconValue={entry.projectIconValue}
                      projectName={entry.projectName}
                      projectColor={entry.projectColor}
                      className="w-8 h-8"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{entry.taskName}</div>
                      <div className="text-sm text-gray-500 truncate">{entry.projectName}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-medium text-gray-700">
                        {formatNZTime(entry.startTime)} – {entry.endTime ? formatNZTime(entry.endTime) : 'Running'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {entry.duration ? formatDurationHuman(entry.duration) : 'In progress'}
                      </div>
                    </div>
                    <div
                      className="w-1.5 h-12 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.projectColor || '#6366f1' }}
                    />
                  </div>
                ))}
                <div className="text-right text-sm font-semibold text-gray-600 pt-2 border-t">
                  Total: {formatDurationHuman(dayEntries.reduce((sum, e) => sum + (e.duration || 0), 0))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        onTaskCreated={handleTaskCreated}
      />
    </div>
  );
}

export default HomePage;