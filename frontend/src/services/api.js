import axios from 'axios';

// This log helps confirm what Vite embedded during the build.
// For the Dockerized version, after the next changes, this should ideally show "/api" or be undefined.
// For local dev using Vite proxy, it might be undefined or what's in .env.development.local
console.log("Original VITE_API_BASE_URL from import.meta.env:", import.meta.env.VITE_API_BASE_URL);

// Frontend will always make requests to relative /api path.
// Vite dev server will proxy this. Nginx (in Docker) will also proxy this.
const API_BASE_URL = '/api';

console.log("Effective API_BASE_URL for Axios (should be /api):", API_BASE_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Timer and Sync
export const getActiveTimer = () => apiClient.get('/time-entries/active');
export const startTimer = (taskId) => apiClient.post('/time-entries/start', { taskId });
export const stopTimer = (timeEntryId) => apiClient.post(`/time-entries/${timeEntryId}/stop`);
export const syncNotion = () => apiClient.post('/sync/notion'); // Will now be POST to /api/sync/notion

// Time Entries
export const getTimeEntries = (filters = {}) => apiClient.get('/time-entries', { params: filters });
export const updateTimeEntry = (timeEntryId, entryData) => apiClient.put(`/time-entries/${timeEntryId}`, entryData);
export const deleteTimeEntry = (timeEntryId) => apiClient.delete(`/time-entries/${timeEntryId}`);
export const addManualTimeEntry = (entryData) => apiClient.post('/time-entries', entryData);

// Clients
export const getClients = () => apiClient.get('/clients');
export const getActiveClients = () => apiClient.get('/clients/active');
export const getClientDetails = (clientId) => apiClient.get(`/clients/${clientId}`);

// Projects
export const getProjects = () => apiClient.get('/projects');
export const getActiveProjects = () => apiClient.get('/projects/active');
export const getProjectDetails = (projectId) => apiClient.get(`/projects/${projectId}`);
export const updateProject = (projectId, projectData) => apiClient.put(`/projects/${projectId}`, projectData);
export const updateTasksBillingStatus = (projectId, taskIds, beenBilled) =>
  apiClient.put(`/projects/${projectId}/tasks/billing`, { taskIds, beenBilled });
export const createTestProject = () => apiClient.post('/projects/test');
export const deleteProject = (projectId) => apiClient.delete(`/projects/${projectId}`);

// Tasks
export const getTasks = (filters = {}) => apiClient.get('/tasks', { params: filters });
export const getTaskDetails = (taskId) => apiClient.get(`/tasks/${taskId}`);
export const getTasksInProgress = () => apiClient.get('/tasks/in-progress');

export default apiClient;