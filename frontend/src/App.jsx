import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Navbar from './components/layout/Navbar'; // We'll create this next
import HomePage from './pages/HomePage';
// import ClientsPage from './pages/ClientsPage'; // Placeholder for now
// import ProjectsPage from './pages/ProjectsPage'; // Placeholder for now

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* <Route path="/clients" element={<ClientsPage />} /> */}
          {/* <Route path="/projects" element={<ProjectsPage />} /> */}
          <Route path="*" element={ // Basic 404
              <div>
                  <h1 className="text-2xl font-semibold">404 - Not Found</h1>
                  <Link to="/" className="text-blue-600 hover:underline">Go Home</Link>
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