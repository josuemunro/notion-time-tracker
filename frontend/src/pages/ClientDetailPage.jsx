import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getClientDetails } from '../services/api';
import { ArrowPathIcon, ArrowLeftIcon, BriefcaseIcon, ClockIcon } from '@heroicons/react/24/solid'; // Added icons

function ProjectRow({ project }) {
  const budgetUsedPercent = project.budgetedTime > 0
    ? Math.min(100, (project.totalHoursSpent / project.budgetedTime) * 100)
    : 0;

  return (
    <Link
      to={`/projects/${project.id}`} // Link to project detail page
      className="block p-4 mb-3 bg-gray-50 hover:bg-gray-100 rounded-md shadow transition-all"
    >
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold text-lg text-blue-600">{project.name}</h4>
        <span className={`px-2 py-0.5 text-xs rounded-full ${
          project.status === 'Active' || project.status === 'In Progress' ? 'bg-green-100 text-green-700' :
          project.status === 'Completed' ? 'bg-blue-100 text-blue-700' :
          'bg-gray-100 text-gray-700'
        }`}>{project.status || 'N/A'}</span>
      </div>

      <div className="text-sm text-gray-600 space-y-1">
        <div className="flex items-center">
          <ClockIcon className="h-4 w-4 mr-1.5 text-gray-400" />
          Logged: {parseFloat(project.totalHoursSpent || 0).toFixed(1)} hrs / Budgeted: {parseFloat(project.budgetedTime || 0).toFixed(1)} hrs
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

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  if (isLoading) return (
    <div className="flex justify-center items-center h-64">
      <ArrowPathIcon className="h-12 w-12 text-gray-500 animate-spin" />
    </div>
  );
  if (error) return <p className="text-center text-red-500 bg-red-100 p-4 rounded-md">{error}</p>;
  if (!client) return <p className="text-center text-gray-500">Client not found.</p>;

  const totalHoursForClient = client.projects?.reduce((sum, p) => sum + (p.totalHoursSpent || 0), 0) || 0;

  return (
    <div className="space-y-8">
      <Link to="/clients" className="inline-flex items-center text-indigo-600 hover:text-indigo-800 transition-colors mb-6 group">
        <ArrowLeftIcon className="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform" />
        Back to Clients
      </Link>

      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-1">{client.name}</h1>
            <p className="text-gray-600">
              Total Time Logged for Client:
              <span className="font-semibold ml-1">{totalHoursForClient.toFixed(2)} hrs</span>
            </p>
          </div>
          <button onClick={fetchClient} disabled={isLoading} className="mt-4 sm:mt-0 p-2 rounded-full hover:bg-gray-100 transition-colors" title="Refresh data">
            <ArrowPathIcon className={`h-6 w-6 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-gray-700 mb-4 pb-2 border-b flex items-center">
            <BriefcaseIcon className="h-6 w-6 mr-2 text-indigo-500" />
            Projects
          </h2>
          {client.projects && client.projects.length > 0 ? (
            <div className="space-y-4">
              {client.projects.map(project => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">No projects found for this client.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClientDetailPage;