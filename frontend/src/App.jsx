import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TasksPage from './pages/TasksPage';
import CalendarPage from './pages/CalendarPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import { ToastProvider } from './contexts/ToastContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { checkAuth } from './services/api';

function RequireAuth({ children }) {
  const [status, setStatus] = useState('checking');
  const location = useLocation();

  useEffect(() => {
    checkAuth()
      .then(() => setStatus('authenticated'))
      .catch(() => setStatus('unauthenticated'));
  }, [location.pathname]);

  if (status === 'checking') return null;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={
          <RequireAuth>
            {/* Settings (timezone) must be loaded before any page computes "today" */}
            <SettingsProvider>
              <div className="min-h-screen flex flex-col bg-gray-50">
                <Navbar />
                <main className="flex-grow container mx-auto px-4 py-8">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/clients" element={<ClientsPage />} />
                    <Route path="/clients/:clientId" element={<ClientDetailPage />} />
                    <Route path="/projects" element={<ProjectsPage />} />
                    <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={
                      <div className="text-center py-16">
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900">404 - Page Not Found</h1>
                        <p className="text-sm text-gray-500 mt-2">The page you are looking for does not exist.</p>
                        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">Go Home</Link>
                      </div>
                    } />
                  </Routes>
                </main>
                <footer className="bg-gray-900 text-gray-400 text-sm text-center p-4">
                  © {new Date().getFullYear()} Notion Time Tracker
                </footer>
              </div>
            </SettingsProvider>
          </RequireAuth>
        } />
      </Routes>
    </ToastProvider>
  );
}

export default App;