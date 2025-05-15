import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { syncNotion } from '../../services/api'; // Import syncNotion
import { useTimer } from '../../contexts/TimerContext'; // To refresh timer if needed
import { ArrowPathIcon } from '@heroicons/react/24/solid';


function Navbar() {
  const activeClassName = "text-yellow-400 border-b-2 border-yellow-400";
  const linkClassName = "hover:text-yellow-300 px-3 py-2 rounded-md text-sm font-medium transition-colors";
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const { refreshActiveTimer } = useTimer(); // Get refresh function from context


  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage('');
    try {
      await syncNotion();
      setSyncMessage('Sync successful!');
      refreshActiveTimer(); // Refresh active timer state as sync might affect task IDs/status
      // Consider a way to notify other components to refresh their data, e.g., via a shared context/event
      setTimeout(() => setSyncMessage(''), 3000); // Clear message after 3s
    } catch (error) {
      console.error("Failed to sync with Notion:", error);
      setSyncMessage('Sync failed. Check console.');
      setTimeout(() => setSyncMessage(''), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <nav className="bg-gray-900 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="text-2xl font-bold text-yellow-400 hover:text-yellow-300">
              ⏳ N-Tracker
            </Link>
          </div>
          <div className="md:flex items-baseline space-x-1 lg:space-x-4"> {/* Adjusted spacing */}
            <NavLink
              to="/"
              className={({ isActive }) => `${linkClassName} ${isActive ? activeClassName : ''}`}
            >
              Home
            </NavLink>
            <NavLink
              to="/clients"
              className={({ isActive }) => `${linkClassName} ${isActive ? activeClassName : ''}`}
            >
              Clients
            </NavLink>
            <NavLink
              to="/projects"
              className={({ isActive }) => `${linkClassName} ${isActive ? activeClassName : ''}`}
            >
              Projects
            </NavLink>
             <NavLink
              to="/tasks" // Changed from /tasks/in-progress to a more general tasks page
              className={({ isActive }) => `${linkClassName} ${isActive ? activeClassName : ''}`}
            >
              Tasks
            </NavLink>
          </div>
          <div className="flex items-center">
            {syncMessage && <span className={`text-xs mr-3 ${syncMessage.includes('failed') ? 'text-red-400' : 'text-green-400'}`}>{syncMessage}</span>}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold py-2 px-3 sm:px-4 rounded transition-colors flex items-center disabled:opacity-70"
            >
              <ArrowPathIcon className={`h-5 w-5 mr-1 sm:mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Notion'}
            </button>
            {/* Add a mobile menu button here if needed */}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;