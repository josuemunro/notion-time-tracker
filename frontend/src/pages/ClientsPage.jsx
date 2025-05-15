import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getClients } from '../services/api';
import { ArrowPathIcon, UserGroupIcon } from '@heroicons/react/24/solid'; // Added UserGroupIcon

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
            {parseFloat(client.totalHoursSpent || 0).toFixed(2)} hrs
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
      const { data } = await getClients();
      if (Array.isArray(data)) {
        setClients(data);
      } else {
        console.warn('/api/clients did not return an array. Received:', data);
        setClients([]);
        setError(data?.message || 'Failed to load clients: Unexpected data format.');
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
        <h1 className="text-3xl font-bold text-gray-800">Clients</h1>
        {/* Add New Client button could go here if app created clients */}
      </div>
      {clients.length === 0 && !isLoading && (
        <p className="text-center text-gray-500 py-8">No clients found. Try syncing with Notion first.</p>
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