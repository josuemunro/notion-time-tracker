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

// Attach auth token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401 (skip if already on login page to avoid refresh loop)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config.url?.includes('/auth/') && window.location.pathname !== '/login') {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Timer and Sync
export const getActiveTimer = () => apiClient.get('/time-entries/active');
export const startTimer = (taskId) => apiClient.post('/time-entries/start', { taskId });
export const stopTimer = (timeEntryId) => apiClient.post(`/time-entries/${timeEntryId}/stop`);
// A running timer crossed local midnight: close it at midnight and continue as a new entry
export const rolloverTimer = (timeEntryId) => apiClient.post(`/time-entries/${timeEntryId}/rollover`);
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

// Bills — taskIds for whole tasks, installmentIds for payments of split fixed-price tasks
export const createBill = (projectId, { taskIds = [], installmentIds = [] }) =>
  apiClient.post(`/projects/${projectId}/bills`, { taskIds, installmentIds });
export const getProjectBills = (projectId) => apiClient.get(`/projects/${projectId}/bills`);
export const deleteBill = (projectId, billId) => apiClient.delete(`/projects/${projectId}/bills/${billId}`);
export const deleteProject = (projectId) => apiClient.delete(`/projects/${projectId}`);

// Tasks
export const getTasks = (filters = {}) => apiClient.get('/tasks', { params: filters });
export const getTaskDetails = (taskId) => apiClient.get(`/tasks/${taskId}`);
export const getTasksInProgress = () => apiClient.get('/tasks/in-progress');
export const createTask = (taskData) => apiClient.post('/tasks', taskData);
export const updateTaskStatus = (taskId, status) => apiClient.patch(`/tasks/${taskId}/status`, { status });
// Billing plan: pricing, invoice date, fixed-price payment split, billable (local tasks)
export const getTaskBilling = (taskId) => apiClient.get(`/tasks/${taskId}/billing`);
export const updateTaskBilling = (taskId, plan) => apiClient.put(`/tasks/${taskId}/billing`, plan);

// Billing schedule (home page): what needs invoicing, grouped by project and send-by date
export const getBillingSchedule = () => apiClient.get('/billing/schedule');

// Projects (manual creation)
export const createProject = (projectData) => apiClient.post('/projects', projectData);

// Auth
export const login = (password) => apiClient.post('/auth/login', { password });
export const checkAuth = () => apiClient.get('/auth/check');

// Settings
export const getSettings = () => apiClient.get('/settings');
export const updateSettings = (settings) => apiClient.put('/settings', settings);

// Backups (blobs, since a plain link can't carry the auth header)
export const downloadBackup = () => apiClient.get('/backup', { responseType: 'blob' });
export const getBackupSnapshots = () => apiClient.get('/backup/snapshots');
export const downloadBackupSnapshot = (name) => apiClient.get(`/backup/snapshots/${encodeURIComponent(name)}`, { responseType: 'blob' });

export default apiClient;