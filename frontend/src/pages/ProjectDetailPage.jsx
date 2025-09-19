import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getProjectDetails, updateProject, deleteProject } from '../services/api';
import TaskItem from '../components/common/TaskItem';
import ProjectIcon from '../components/ProjectIcon';
import BillingOverview from '../components/BillingOverview';
import UnbilledTasksSection from '../components/UnbilledTasksSection';
import { ArrowPathIcon, ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/solid';
import { formatHoursHuman } from '../utils/timeUtils';
import { useTimer } from '../contexts/TimerContext'; // Import useTimer

function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdatingColor, setIsUpdatingColor] = useState(false);
  const [colorError, setColorError] = useState(null);
  const [isUpdatingRate, setIsUpdatingRate] = useState(false);
  const [rateError, setRateError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [rateInput, setRateInput] = useState(''); // Add separate state for rate input
  const { startTimer, activeTimerDetails, isRunning } = useTimer(); // Get timer functions
  const prevIsRunningRef = useRef(isRunning); // Track previous isRunning state
  const isFetchingRef = useRef(false); // Track if already fetching to prevent concurrent calls

  const fetchProject = useCallback(async (skipInputUpdate = false) => {
    // Prevent concurrent calls
    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const { data } = await getProjectDetails(projectId);
      setProject(data);

      // Only update input states if not currently editing to prevent input reversion
      if (!skipInputUpdate && !isUpdatingColor && !isUpdatingRate) {
        setHexInput(data.color || '#6366f1');
        setRateInput(data.hourlyRate === 0 ? '' : String(data.hourlyRate));
      }
      setError(null);
    } catch (err) {
      console.error("Failed to fetch project details:", err);
      setError('Failed to load project details.');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [projectId, isUpdatingColor, isUpdatingRate]);

  // Initial fetch - separate useEffect for initial load
  useEffect(() => {
    fetchProject();
  }, [projectId]);

  // Refresh project data if the active timer changes (e.g. time logged might update)
  // Use useRef to track previous state and avoid fetchProject dependency
  useEffect(() => {
    // Only refresh when timer stops (was running, now not running)
    if (prevIsRunningRef.current && !isRunning && project) {
      fetchProject(true); // Skip input update when refreshing after timer stop
    }
    prevIsRunningRef.current = isRunning; // Update the ref
  }, [isRunning, project?.id]);

  const handleColorChange = async (newColor) => {
    setIsUpdatingColor(true);
    setColorError(null);
    try {
      await updateProject(projectId, { color: newColor });
      setProject(prev => ({ ...prev, color: newColor }));
      setHexInput(newColor);
    } catch (err) {
      console.error('Failed to update project color:', err);
      setColorError('Failed to update color. Please try again.');
    } finally {
      setIsUpdatingColor(false);
    }
  };

  const handleRateChange = async (newRate) => {
    setIsUpdatingRate(true);
    setRateError(null);
    try {
      const rateValue = newRate === '' ? 0 : parseFloat(newRate);
      await updateProject(projectId, { hourlyRate: rateValue });
      setProject(prev => ({ ...prev, hourlyRate: rateValue }));
      setRateInput(rateValue === 0 ? '' : String(rateValue));
    } catch (err) {
      console.error('Failed to update project rate:', err);
      setRateError('Failed to update rate. Please try again.');
    } finally {
      setIsUpdatingRate(false);
    }
  };

  const handleTasksBilled = async (taskIds) => {
    // Refresh project data after billing tasks
    await fetchProject(true); // Skip input update when refreshing after billing
  };

  const handleDeleteProject = async () => {
    setIsDeleting(true);
    try {
      await deleteProject(projectId);
      navigate('/projects');
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('Failed to delete project. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading && !project) { // Only show big spinner on initial load when no project data exists yet
    return (
      <div className="flex justify-center items-center py-20"> {/* Reduced height/padding */}
        <ArrowPathIcon className="h-10 w-10 text-gray-500 animate-spin" /> {/* Smaller icon */}
        <p className="ml-3 text-gray-600">Loading project details...</p>
      </div>
    );
  }
  if (error) return <p className="text-center text-red-500 bg-red-100 p-4 rounded-md">{error}</p>;
  if (!project) return <p className="text-center text-gray-500">Project not found.</p>;

  const budgetUsedPercent = project.budgetedTime > 0
    ? Math.min(100, (project.totalHoursSpent / project.budgetedTime) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <Link to="/projects" className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-6">
        <ArrowLeftIcon className="h-5 w-5 mr-2" />
        Back to Projects
      </Link>

      <div className="bg-white p-6 rounded-lg shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div className="flex items-start space-x-4">
            <ProjectIcon
              iconType={project.iconType}
              iconValue={project.iconValue}
              projectName={project.name}
              projectColor={project.color}
              className="w-12 h-12 mt-1"
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-1">{project.name}</h1>
              <p className="text-md text-gray-600">Client: {project.clientName || 'N/A'}</p>
              <p className="text-md text-gray-600">Status: <span className="font-medium">{project.status || 'N/A'}</span></p>
            </div>
          </div>
          <div className="flex items-center space-x-2 mt-4 md:mt-0">
            <button onClick={() => fetchProject()} disabled={isLoading} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <ArrowPathIcon className={`h-6 w-6 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 rounded-full hover:bg-red-100 transition-colors"
              title="Delete Project"
            >
              <TrashIcon className="h-6 w-6 text-red-600" />
            </button>
          </div>
        </div>

        {/* Project Settings Section */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Project Settings</h4>

          {/* Color Picker Row */}
          <div className="flex flex-col md:flex-row md:items-center md:space-x-6 space-y-4 md:space-y-0 mb-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label htmlFor="color-picker" className="text-sm text-gray-700">Color:</label>
                <input
                  id="color-picker"
                  type="color"
                  value={project.color || '#6366f1'}
                  onChange={(e) => handleColorChange(e.target.value)}
                  disabled={isUpdatingColor}
                  className="w-10 h-10 rounded-lg border-2 border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
              <div className="flex items-center space-x-2">
                <label htmlFor="hex-input" className="text-sm text-gray-700">Hex:</label>
                <input
                  id="hex-input"
                  type="text"
                  value={hexInput}
                  onChange={(e) => {
                    // Allow any typing in the hex input
                    setHexInput(e.target.value);
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    // Only validate and update if it's a valid 6-character hex color
                    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                      handleColorChange(value);
                    } else {
                      // Revert to original color if invalid
                      setHexInput(project.color || '#6366f1');
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.target.blur(); // Trigger onBlur validation
                    }
                  }}
                  disabled={isUpdatingColor}
                  placeholder="#6366f1"
                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
              {isUpdatingColor && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>Updating...</span>
                </div>
              )}
            </div>
          </div>

          {/* Hourly Rate Row */}
          <div className="flex flex-col md:flex-row md:items-center md:space-x-6 space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <label htmlFor="rate-input" className="text-sm text-gray-700">Hourly Rate:</label>
              <div className="flex items-center">
                <span className="text-sm text-gray-500 mr-1">$</span>
                <input
                  id="rate-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateInput} // Use separate rate input state
                  onChange={(e) => {
                    const value = e.target.value;
                    setRateInput(value);
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value === '' || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0)) {
                      const numericValue = value === '' ? 0 : parseFloat(value);
                      handleRateChange(numericValue);
                    } else {
                      // Revert to original rate if invalid
                      setRateInput(project.hourlyRate === 0 ? '' : String(project.hourlyRate));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.target.blur(); // Trigger onBlur validation
                    }
                  }}
                  disabled={isUpdatingRate}
                  placeholder="0.00"
                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
                <span className="text-sm text-gray-500 ml-1">/hour</span>
              </div>
              {isUpdatingRate && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>Updating...</span>
                </div>
              )}
            </div>
          </div>

          {/* Error Messages */}
          {colorError && (
            <p className="text-sm text-red-600 mt-2">{colorError}</p>
          )}
          {rateError && (
            <p className="text-sm text-red-600 mt-2">{rateError}</p>
          )}
        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Budget Usage</h4>
            <div className="w-full bg-gray-200 rounded-full h-3.5">
              <div
                className={`h-3.5 rounded-full ${budgetUsedPercent > 85 ? 'bg-red-500' : budgetUsedPercent > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${budgetUsedPercent}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-1 text-right">{budgetUsedPercent.toFixed(0)}%</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Time Summary</h4>
            <p className="text-gray-700">
              Budgeted: <span className="font-semibold">{formatHoursHuman(parseFloat(project.budgetedTime || 0))}</span>
            </p>
            <p className="text-gray-700">
              Logged: <span className="font-semibold">{formatHoursHuman(parseFloat(project.totalHoursSpent || 0))}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Billing Section */}
      <BillingOverview project={project} tasks={project.tasks || []} />
      <UnbilledTasksSection
        project={project}
        tasks={project.tasks || []}
        onTasksBilled={handleTasksBilled}
        onRefresh={() => fetchProject(true)}
      />

      <div>
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Tasks</h2>
        {project.tasks && project.tasks.length > 0 ? (
          <div className="space-y-3">
            {project.tasks.map(task => (
              <TaskItem
                key={task.id}
                task={{
                  ...task,
                  projectName: project.name // Pass project name to TaskItem
                }}
              // onStartOverride and onStopOverride are handled by useTimer context via TaskItem itself
              />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No tasks found for this project.</p>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
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
            padding: '1rem'
          }}
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center mb-4">
                <TrashIcon className="h-8 w-8 text-red-600 mr-3" />
                <h2 className="text-xl font-semibold text-gray-800">Delete Project</h2>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete "{project.name}"? This will permanently delete the project and all its tasks and time entries. This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteProject}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectDetailPage;