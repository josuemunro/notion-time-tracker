import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getClientDetails } from '../services/api';
import { ArrowPathIcon, ArrowLeftIcon, BriefcaseIcon, ClockIcon } from '@heroicons/react/24/solid';
import { formatHoursHuman } from '../utils/timeUtils';
import ProjectIcon from '../components/ProjectIcon';
import EmptyState from '../components/common/EmptyState';
import { useSyncComplete } from '../utils/syncEvents';

// Shared status-chip colors (kept in sync with ProjectsPage)
const statusChipClass = (status) => {
  if (status === 'Active' || status === 'In Progress' || status === 'In progress' || status === 'Ongoing') {
    return 'bg-green-100 text-green-700';
  }
  if (status === 'Completed') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
};

function ProjectRow({ project }) {
  const budgetUsedPercent = project.budgetedTime > 0
    ? Math.min(100, (project.totalHoursSpent / project.budgetedTime) * 100)
    : 0;

  return (
    <Link
      to={`/projects/${project.id}`} // Link to project detail page
      className="block p-4 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <ProjectIcon
            iconType={project.iconType}
            iconValue={project.iconValue}
            projectName={project.name}
            projectColor={project.color}
            className="w-6 h-6 flex-shrink-0"
          />
          <h4 className="font-semibold text-base text-gray-900 truncate">{project.name}</h4>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0 ${statusChipClass(project.status)}`}>
          {project.status || 'N/A'}
        </span>
      </div>

      <div className="text-sm text-gray-500 space-y-1">
        <div className="flex items-center">
          <ClockIcon className="h-4 w-4 mr-1.5 text-gray-400" />
          Logged: {formatHoursHuman(parseFloat(project.totalHoursSpent || 0))} / Budgeted: {formatHoursHuman(parseFloat(project.budgetedTime || 0))}
        </div>
        {project.budgetedTime > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${budgetUsedPercent > 85 ? 'bg-red-500' : budgetUsedPercent > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${budgetUsedPercent}%` }}
            ></div>
          </div>
        )}
      </div>
    </Link>
  );
}

function ClientDetailPage() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchClient = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await getClientDetails(clientId);
      setClient(data);
    } catch (err) {
      console.error("Failed to fetch client details:", err);
      setError(err.response?.data?.message || err.message || 'Failed to load client details.');
      setClient(null);
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useSyncComplete(fetchClient);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  if (isLoading) return (
    <div className="flex justify-center items-center h-64">
      <ArrowPathIcon className="h-12 w-12 text-gray-500 animate-spin" />
    </div>
  );
  if (error) return <p className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-lg">{error}</p>;
  if (!client) return <p className="text-center text-gray-500">Client not found.</p>;

  const totalHoursForClient = client.projects?.reduce((sum, p) => sum + (p.totalHoursSpent || 0), 0) || 0;

  return (
    <div className="space-y-8">
      <Link to="/clients" className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors group">
        <ArrowLeftIcon className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
        Back to Clients
      </Link>

      <div className="bg-white p-6 sm:p-8 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">{client.name}</h1>
            <p className="text-sm text-gray-500">
              Total Time Logged for Client:
              <span className="font-semibold text-gray-700 ml-1">{formatHoursHuman(totalHoursForClient)}</span>
            </p>
          </div>
          <button onClick={fetchClient} disabled={isLoading} className="mt-4 sm:mt-0 p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Refresh data">
            <ArrowPathIcon className={`h-6 w-6 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200 flex items-center">
            <BriefcaseIcon className="h-5 w-5 mr-2 text-indigo-500" />
            Projects
          </h2>
          {client.projects && client.projects.length > 0 ? (
            <div className="space-y-3">
              {client.projects.map(project => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BriefcaseIcon}
              title="No projects found for this client"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ClientDetailPage;
