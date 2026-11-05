import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getActiveProjects } from '../services/api';
import { ArrowPathIcon, BriefcaseIcon } from '@heroicons/react/24/solid';
import { formatHoursHuman, formatDateString, getLocalDateString } from '../utils/timeUtils';
import { formatNZD } from '../utils/billingUtils';
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
  const unbilled = project.unbilledAmount || 0;
  const hasUnbilled = unbilled > 0 || (project.unbilledTaskCount || 0) > 0;
  const lastBilled = project.lastBilledAt
    ? formatDateString(getLocalDateString(new Date(project.lastBilledAt)))
    : 'Never';

  return (
    <Link to={`/projects/${project.id}`} className="flex flex-col p-5 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200">
      <div className="flex items-start gap-3">
        <ProjectIcon
          iconType={project.iconType}
          iconValue={project.iconValue}
          projectName={project.name}
          projectColor={project.color}
          className="w-8 h-8 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{project.name}</h3>
          <p className="text-sm text-gray-500 truncate">{project.clientName || 'No client'}</p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusChipClass(project.status)}`}>
          {project.status || 'N/A'}
        </span>
      </div>

      {/* Unbilled is the headline number (ex GST, rounded the way a bill would be) */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Unbilled</p>
        {hasUnbilled ? (
          <>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">
              {formatNZD(unbilled)}
              <span className="ml-1.5 text-xs font-medium text-gray-400">ex GST</span>
            </p>
            <p className="text-sm text-gray-500">
              {project.unbilledTaskCount} task{project.unbilledTaskCount !== 1 ? 's' : ''} · {formatHoursHuman(project.unbilledHours || 0)}
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-lg font-semibold text-gray-400">Nothing to bill</p>
        )}
      </div>

      <div className="mt-auto pt-4 flex justify-between gap-3 text-xs text-gray-500">
        <span>Logged <span className="font-medium text-gray-700">{formatHoursHuman(parseFloat(project.totalHoursSpent || 0))}</span></span>
        <span>Last billed <span className="font-medium text-gray-700">{lastBilled}</span></span>
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
          <p className="mt-1 text-sm text-gray-500">Active projects and what's waiting to be billed</p>
        </div>
        {projects.length > 0 && (
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total unbilled</p>
            <p className="text-xl font-bold tabular-nums text-gray-900">
              {formatNZD(projects.reduce((sum, p) => sum + (p.unbilledAmount || 0), 0))}
            </p>
            <p className="text-xs text-gray-400">ex GST</p>
          </div>
        )}
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
