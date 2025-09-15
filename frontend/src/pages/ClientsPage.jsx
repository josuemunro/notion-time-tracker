import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getActiveClients } from '../services/api';
import { ArrowPathIcon, UserGroupIcon } from '@heroicons/react/24/solid'; // Added UserGroupIcon
import { formatHoursHuman } from '../utils/timeUtils';

function ClientCard({ client }) {
  return (
    <Link
      to={`/clients/${client.id}`} // Use local DB ID for routing
      className="block p-6 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200 ease-in-out"
    >
      <div className="flex items-center mb-3">
        <UserGroupIcon className="h-8 w-8 text-indigo-500 mr-3" />
        <h3 className="text-xl font-semibold text-indigo-700">{client.name}</h3>
      </div>
      <div className="text-sm text-gray-600">
        <p>
          Total Time Logged:
          <span className="font-medium ml-1">
            {formatHoursHuman(parseFloat(client.totalHoursSpent || 0))}
          </span>
        </p>
        {/* You can add more summary details here if available, like number of projects */}
      </div>
    </Link>
  );
}

function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchClients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await getActiveClients();
      if (Array.isArray(data)) {
        setClients(data);
      } else {
        console.warn('/api/clients/active did not return an array. Received:', data);
        setClients([]);
        setError(data?.message || 'Failed to load active clients: Unexpected data format.');
      }
    } catch (err) {
      console.error("Failed to fetch clients:", err);
      setError(err.response?.data?.message || err.message || 'Failed to load clients. Please try again.');
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  if (isLoading) return (
    <div className="flex justify-center items-center h-64">
      <ArrowPathIcon className="h-12 w-12 text-gray-500 animate-spin" />
      <p className="ml-3 text-lg text-gray-700">Loading Clients...</p>
    </div>
  );
  if (error) return <p className="text-center text-red-500 bg-red-100 p-4 rounded-md">{error}</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Active Clients</h1>
        <button onClick={fetchClients} disabled={isLoading} className="p-2 rounded-full hover:bg-gray-200 transition-colors" title="Refresh clients">
          <ArrowPathIcon className={`h-6 w-6 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {clients.length === 0 && !isLoading && (
        <p className="text-center text-gray-500 py-8">No active clients found. Try syncing with Notion first.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.map(client => (
          <ClientCard key={client.id} client={client} />
        ))}
      </div>
    </div>
  );
}

export default ClientsPage;