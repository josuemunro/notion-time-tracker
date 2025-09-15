import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProjectDetails, updateProject } from '../services/api';
import TaskItem from '../components/common/TaskItem';
import ProjectIcon from '../components/ProjectIcon';
import { ArrowPathIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';
import { formatHoursHuman } from '../utils/timeUtils';
import { useTimer } from '../contexts/TimerContext'; // Import useTimer

function ProjectDetailPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdatingColor, setIsUpdatingColor] = useState(false);
  const [colorError, setColorError] = useState(null);
  const { startTimer, activeTimerDetails, isRunning } = useTimer(); // Get timer functions

  // fetchProject in ProjectDetailPage.jsx
  const fetchProject = useCallback(async () => {
    setIsLoading(true); // Indicates loading starts
    // setError(null); // Keep previous error or clear it based on preference for refreshes
    try {
      const { data } = await getProjectDetails(projectId);
      setProject(data); // Directly set new data
      setError(null); // Clear error on success
    } catch (err) {
      console.error("Failed to fetch project details:", err);
      setError('Failed to load project details.');
      // Don't setProject(null) here if you want to show stale data on refresh error
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Refresh project data if the active timer changes (e.g. time logged might update)
  useEffect(() => {
    if (!isRunning && project) { // Or more sophisticated check if the change is relevant
      fetchProject();
    }
  }, [isRunning, fetchProject, project]);

  const handleColorChange = async (newColor) => {
    setIsUpdatingColor(true);
    setColorError(null);
    try {
      await updateProject(projectId, { color: newColor });
      setProject(prev => ({ ...prev, color: newColor }));
    } catch (err) {
      console.error('Failed to update project color:', err);
      setColorError('Failed to update color. Please try again.');
    } finally {
      setIsUpdatingColor(false);
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
          <button onClick={fetchProject} disabled={isLoading} className="mt-4 md:mt-0 p-2 rounded-full hover:bg-gray-200 transition-colors">
            <ArrowPathIcon className={`h-6 w-6 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Color Picker Section */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Project Color</h4>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="color-picker" className="text-sm text-gray-700">Choose color:</label>
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
                value={project.color || '#6366f1'}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                    if (value.length === 7) {
                      handleColorChange(value);
                    }
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
          {colorError && (
            <p className="text-sm text-red-600 mt-2">{colorError}</p>
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
    </div>
  );
}

export default ProjectDetailPage;