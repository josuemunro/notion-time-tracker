import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getProjects } from '../services/api';
import { ArrowPathIcon } from '@heroicons/react/24/solid';

function ProjectCard({ project }) {
  const budgetUsedPercent = project.budgetedTime > 0
    ? Math.min(100, (project.totalHoursSpent / project.budgetedTime) * 100)
    : 0;

  return (
    <Link to={`/projects/${project.id}`} className="block p-6 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200 ease-in-out">
      <h3 className="text-xl font-semibold text-blue-700 mb-2">{project.name}</h3>
      <p className="text-sm text-gray-600 mb-1">Client: {project.clientName || 'N/A'}</p>
      <p className="text-sm text-gray-600 mb-3">Status: <span className="font-medium">{project.status || 'N/A'}</span></p>

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

      <div className="text-sm">
        <p>Budgeted: <span className="font-medium">{parseFloat(project.budgetedTime || 0).toFixed(1)} hrs</span></p>
        <p>Logged: <span className="font-medium">{parseFloat(project.totalHoursSpent || 0).toFixed(1)} hrs</span></p>
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
      const { data } = await getProjects();
      setProjects(data || []);
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      setError('Failed to load projects. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  if (isLoading) return (
    <div className="flex justify-center items-center h-64">
        <ArrowPathIcon className="h-12 w-12 text-gray-500 animate-spin" />
        <p className="ml-3 text-lg text-gray-700">Loading Projects...</p>
    </div>
  );
  if (error) return <p className="text-center text-red-500 bg-red-100 p-4 rounded-md">{error}</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Projects</h1>
        {/* Add New Project button could go here if app created projects */}
      </div>
      {projects.length === 0 && !isLoading && (
        <p className="text-center text-gray-500">No projects found. Try syncing with Notion.</p>
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