import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getProjects, getActiveProjects } from '../services/api';
import { ArrowPathIcon, BriefcaseIcon } from '@heroicons/react/24/solid';
import { formatHoursHuman } from '../utils/timeUtils';
import ProjectIcon from '../components/ProjectIcon';
import EmptyState from '../components/common/EmptyState';
import { useSyncComplete } from '../utils/syncEvents';

// Shared status-chip colors (kept in sync with ClientDetailPage)
const statusChipClass = (status) => {
  if (status === 'Active' || status === 'In Progress' || status === 'In progress' || status === 'Ongoing') {
    return 'bg-green-100 text-green-700';
  }
  if (status === 'Completed') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
};

function ProjectCard({ project }) {
  const budgetUsedPercent = project.budgetedTime > 0
    ? Math.min(100, (project.totalHoursSpent / project.budgetedTime) * 100)
    : 0;

  return (
    <Link to={`/projects/${project.id}`} className="block p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200">
      <div className="flex items-start space-x-3 mb-3">
        <ProjectIcon
          iconType={project.iconType}
          iconValue={project.iconValue}
          projectName={project.name}
          projectColor={project.color}
          className="w-8 h-8 mt-1"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">{project.name}</h3>
          <p className="text-sm text-gray-500 mb-1.5">Client: {project.clientName || 'N/A'}</p>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusChipClass(project.status)}`}>
            {project.status || 'N/A'}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Budget Usage</span>
          <span>{budgetUsedPercent.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full ${budgetUsedPercent > 85 ? 'bg-red-500' : budgetUsedPercent > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${budgetUsedPercent}%` }}
          ></div>
        </div>
      </div>

      <div className="text-sm text-gray-500">
        <p>Budgeted: <span className="font-medium text-gray-700">{parseFloat(project.budgetedTime || 0).toFixed(1)} hrs</span></p>
        <p>Logged: <span className="font-medium text-gray-700">{formatHoursHuman(parseFloat(project.totalHoursSpent || 0))}</span></p>
      </div>
    </Link>
  );
}

function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await getActiveProjects();
      setProjects(data || []);
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      setError('Failed to load projects. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useSyncComplete(fetchProjects);

  useEffect(() => {
    fetchProjects();
  }, []);

  if (isLoading) return (
    <div className="flex justify-center items-center h-64">
      <ArrowPathIcon className="h-12 w-12 text-gray-500 animate-spin" />
      <p className="ml-3 text-lg text-gray-700">Loading Projects...</p>
    </div>
  );
  if (error) return <p className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-lg">{error}</p>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-500">Active projects with budgets and logged time</p>
        </div>
        {/* Add New Project button could go here if app created projects */}
      </div>
      {projects.length === 0 && !isLoading && (
        <EmptyState
          icon={BriefcaseIcon}
          title="No projects found"
          hint="Try syncing with Notion."
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}

export default ProjectsPage;
