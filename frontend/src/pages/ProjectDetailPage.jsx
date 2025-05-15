import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProjectDetails } from '../services/api';
import TaskItem from '../components/common/TaskItem';
import { ArrowPathIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';
import { useTimer } from '../contexts/TimerContext'; // Import useTimer

function ProjectDetailPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
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
  }, [isRunning, fetchProject, project])


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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-1">{project.name}</h1>
            <p className="text-md text-gray-600">Client: {project.clientName || 'N/A'}</p>
            <p className="text-md text-gray-600">Status: <span className="font-medium">{project.status || 'N/A'}</span></p>
          </div>
          <button onClick={fetchProject} disabled={isLoading} className="mt-4 md:mt-0 p-2 rounded-full hover:bg-gray-200 transition-colors">
            <ArrowPathIcon className={`h-6 w-6 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
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
              Budgeted: <span className="font-semibold">{parseFloat(project.budgetedTime || 0).toFixed(1)} hrs</span>
            </p>
            <p className="text-gray-700">
              Logged: <span className="font-semibold">{parseFloat(project.totalHoursSpent || 0).toFixed(1)} hrs</span>
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