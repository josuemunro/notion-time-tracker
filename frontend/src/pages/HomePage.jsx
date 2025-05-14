import React from 'react';

function HomePage() {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold mb-6 text-gray-800">Welcome to Notion Time Tracker</h1>
      <p className="text-lg text-gray-600 mb-8">
        Track your time efficiently and keep everything in sync.
      </p>
      {/* Timer display and controls will go here */}
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Active Timer</h2>
        <div className="text-6xl font-mono text-gray-800 mb-4">
          00:00:00
        </div>
        <button className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-lg mr-2 transition-colors">
          Start
        </button>
        <button className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors">
          Stop
        </button>
      </div>

      {/* List of in-progress tasks will go here */}
      <div className="mt-12">
        <h3 className="text-2xl font-semibold mb-4">In-Progress Tasks</h3>
        <p className="text-gray-500">(Task list will appear here)</p>
      </div>
    </div>
  );
}

export default HomePage;