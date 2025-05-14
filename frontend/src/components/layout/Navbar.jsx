import React from 'react';
import { Link, NavLink } from 'react-router-dom';

function Navbar() {
  const activeClassName = "text-yellow-400 border-b-2 border-yellow-400";
  const linkClassName = "hover:text-yellow-300 px-3 py-2 rounded-md text-sm font-medium transition-colors";

  return (
    <nav className="bg-gray-900 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="text-2xl font-bold text-yellow-400 hover:text-yellow-300">
              ⏳ N-Tracker
            </Link>
          </div>
          <div className="flex items-baseline space-x-4">
            <NavLink
              to="/"
              className={({ isActive }) => `${linkClassName} ${isActive ? activeClassName : ''}`}
            >
              Home
            </NavLink>
            <NavLink
              to="/clients" // Will be enabled later
              className={({ isActive }) => `${linkClassName} ${isActive ? activeClassName : ''}`}
            >
              Clients
            </NavLink>
            <NavLink
              to="/projects" // Will be enabled later
              className={({ isActive }) => `${linkClassName} ${isActive ? activeClassName : ''}`}
            >
              Projects
            </NavLink>
             <NavLink
              to="/tasks/in-progress" // For quick access to active tasks
              className={({ isActive }) => `${linkClassName} ${isActive ? activeClassName : ''}`}
            >
              In Progress
            </NavLink>
          </div>
          <div>
            {/* Placeholder for potential user profile or settings icon */}
             <button
                onClick={() => console.log('Sync button clicked')} // Later, this will call the sync API
                className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold py-2 px-4 rounded transition-colors"
              >
                Sync Notion
              </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;