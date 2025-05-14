// src/services/api.js
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'; // Fallback for local dev if not set by build

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Example API functions (we will expand this in Part 5)
export const getActiveTimer = () => {
  return apiClient.get('/time-entries/active');
};

export const startTimer = (taskId) => {
  return apiClient.post('/time-entries/start', { taskId });
};

export const stopTimer = (timeEntryId) => {
  return apiClient.post(`/time-entries/${timeEntryId}/stop`);
};

export const syncNotion = () => {
  return apiClient.post('/sync/notion');
};

export const getClients = () => apiClient.get('/clients');
export const getProjects = () => apiClient.get('/projects');
export const getTasksInProgress = () => apiClient.get('/tasks/in-progress');


// Add more functions as needed for clients, projects, tasks, etc.

export default apiClient;