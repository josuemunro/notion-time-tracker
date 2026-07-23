import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTimer } from '../contexts/TimerContext';
import { useToast } from '../contexts/ToastContext';
import { getTasksInProgress, getTimeEntries, updateTaskStatus } from '../services/api';
import TaskItem from '../components/common/TaskItem';
import TimelineView from '../components/TimelineView';
import MoneyTimer from '../components/MoneyTimer';
import ProjectIcon from '../components/ProjectIcon';
import AddTaskModal from '../components/AddTaskModal';
import EmptyState from '../components/common/EmptyState';
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

  // State for selected date with navigation support (?date=YYYY-MM-DD deep-links
  // from the calendar view land on that day's timeline)
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(dateParam || '') ? dateParam : getNZDateString()
  );

  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam || '')) setSelectedDate(dateParam);
  }, [dateParam]);

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
    <div className="space-y-10">
      {/* Money-first shader timer */}
      <MoneyTimer />

      {/* Stop Button for Active Timer */}
      {isRunning && (
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleStop}
            className="w-full flex items-center justify-center bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
          >
            <StopIcon className="h-5 w-5 mr-2" /> Stop Timer
          </button>
        </div>
      )}

      {/* Timeline View with Date Navigation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <button
            onClick={() => navigateToDate('prev')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            <span>Previous Day</span>
          </button>

          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {new Date(selectedDate).toLocaleDateString('en-NZ', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </h2>
            {selectedDate === todayDate ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                Today
              </span>
            ) : (
              <button
                onClick={goToToday}
                className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-200 transition-colors"
              >
                Go to Today
              </button>
            )}
          </div>

          <button
            onClick={() => navigateToDate('next')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span>Next Day</span>
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        <TimelineView selectedDate={selectedDate} />
      </div>

      {/* Tabbed section: one card, the tab bar is its header (single structural line) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 px-3 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`-mb-px flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'tasks'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <ListBulletIcon className="h-5 w-5" />
            Quick Start Tasks
          </button>
          <button
            onClick={() => setActiveTab('entries')}
            className={`-mb-px flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'entries'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <ClockIcon className="h-5 w-5" />
            Today's Entries
            {dayEntries.length > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{dayEntries.length}</span>
            )}
          </button>
          <div className="ml-auto flex items-center gap-2 py-2 pr-1">
            {activeTab === 'tasks' && (
              <button
                onClick={() => setShowAddTaskModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Add Task
              </button>
            )}
            <button
              onClick={() => activeTab === 'tasks' ? fetchInProgress() : fetchDayEntries()}
              disabled={isLoadingTasks || isLoadingEntries}
              className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <ArrowPathIcon className={`h-5 w-5 ${(isLoadingTasks || isLoadingEntries) ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="p-5">

        {/* Quick Start Tasks Tab */}
        {activeTab === 'tasks' && (
          <>
            {isLoadingTasks && !errorTasks && (
              <div className="flex justify-center items-center py-8">
                <ArrowPathIcon className="h-10 w-10 text-gray-400 animate-spin" />
                <p className="ml-3 text-gray-600">Loading tasks...</p>
              </div>
            )}
            {errorTasks && <p className="text-center text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{errorTasks}</p>}
            {!isLoadingTasks && !errorTasks && inProgressTasksByProject.length === 0 && (
              <EmptyState
                icon={ListBulletIcon}
                title="No tasks in progress"
                hint="Tasks marked 'To Do' or 'Doing' in Notion will appear here after a sync."
              />
            )}
            {!isLoadingTasks && !errorTasks && inProgressTasksByProject.length > 0 && (
              <div className="space-y-7">
                {inProgressTasksByProject.map((projectGroup) => (
                  <div key={projectGroup.projectId || projectGroup.projectName}>
                    {/* No underline — icon + name + count chip, whitespace separates groups */}
                    <div className="flex items-center gap-2.5 mb-3">
                      <ProjectIcon
                        iconType={projectGroup.projectIconType}
                        iconValue={projectGroup.projectIconValue}
                        projectName={projectGroup.projectName}
                        projectColor={projectGroup.projectColor}
                        className="w-6 h-6"
                      />
                      <h4 className="text-base font-semibold text-gray-900">
                        {projectGroup.projectName || 'Unnamed Project'}
                      </h4>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {projectGroup.tasks?.length || 0}
                      </span>
                    </div>
                    {projectGroup.tasks && projectGroup.tasks.length > 0 ? (
                      <div className="space-y-3">
                        {projectGroup.tasks.map((task) => (
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
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No tasks listed for this project group.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
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
              <EmptyState
                icon={ClockIcon}
                title="No time entries for this day"
                hint="Start a timer or drag on the timeline to log time."
              />
            )}
            {!isLoadingEntries && dayEntries.length > 0 && (
              <>
                {/* Flat divided list — the card provides the frame, rows don't need their own */}
                <div className="divide-y divide-gray-100">
                  {dayEntries.map((entry) => (
                    <div
                      key={entry.timeEntryId}
                      className="flex items-center gap-3 py-3 first:pt-0"
                    >
                      <div
                        className="w-1 h-10 rounded-full flex-shrink-0"
                        style={{ backgroundColor: entry.projectColor || '#6366f1' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">{entry.taskName}</div>
                        <div className="text-sm text-gray-500 truncate">{entry.projectName}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-medium text-gray-700 tabular-nums">
                          {formatNZTime(entry.startTime)} – {entry.endTime ? formatNZTime(entry.endTime) : 'Running'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {entry.duration ? formatDurationHuman(entry.duration) : 'In progress'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Footer strip bleeds to the card edges for a clean total row */}
                <div className="mt-4 -mx-5 -mb-5 px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-end items-baseline gap-2 text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="font-semibold text-gray-900">
                    {formatDurationHuman(dayEntries.reduce((sum, e) => sum + (e.duration || 0), 0))}
                  </span>
                </div>
              </>
            )}
          </>
        )}
        </div>
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