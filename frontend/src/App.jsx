import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TasksPage from './pages/TasksPage'; // Create this - general tasks list

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50"> {/* Changed default bg */}
      <Navbar />
      <main className="flex-grow container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:clientId" element={<ClientDetailPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} /> {/* Route for general tasks list */}
          {/* Consider a more specific route for in-progress tasks if needed e.g. /tasks/active */}
          <Route path="*" element={
              <div className="text-center py-10">
                  <h1 className="text-3xl font-semibold text-gray-700">404 - Page Not Found</h1>
                  <p className="text-gray-500 mt-2">The page you are looking for does not exist.</p>
                  <Link to="/" className="mt-6 inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition">Go Home</Link>
              </div>
          } />
        </Routes>
      </main>
      <footer className="bg-gray-800 text-white text-center p-4">
        © {new Date().getFullYear()} Notion Time Tracker
      </footer>
    </div>
  );
}

export default App;