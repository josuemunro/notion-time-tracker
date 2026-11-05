import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getProjectDetails, updateProject, deleteProject } from '../services/api';
import TaskItem from '../components/common/TaskItem';
import ProjectIcon from '../components/ProjectIcon';
import BillingOverview from '../components/BillingOverview';
import UnbilledTasksSection from '../components/UnbilledTasksSection';
import PreviousBillsSection from '../components/PreviousBillsSection';
import TaskPricingModal from '../components/TaskPricingModal';
import { ArrowPathIcon, ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/solid';
import EmptyState from '../components/common/EmptyState';
import { formatHoursHuman } from '../utils/timeUtils';
import { ordinal } from '../utils/billingSchedule';
import { useTimer } from '../contexts/TimerContext'; // Import useTimer
import { useSyncComplete } from '../utils/syncEvents';

function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdatingColor, setIsUpdatingColor] = useState(false);
  const [colorError, setColorError] = useState(null);
  const [isUpdatingRate, setIsUpdatingRate] = useState(false);
  const [rateError, setRateError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [rateInput, setRateInput] = useState(''); // Add separate state for rate input
  const [invoiceDayInput, setInvoiceDayInput] = useState(''); // Pay-run cutoff day (1-31)
  const [termsInput, setTermsInput] = useState(''); // Days the client usually takes to pay
  const [isUpdatingInvoicing, setIsUpdatingInvoicing] = useState(false);
  const [invoicingError, setInvoicingError] = useState(null);
  const [billsRefreshToken, setBillsRefreshToken] = useState(0); // Bump to refetch Previous Bills
  const [pricingTask, setPricingTask] = useState(null); // Task being edited in TaskPricingModal
  const { startTimer, activeTimerDetails, isRunning } = useTimer(); // Get timer functions
  const prevIsRunningRef = useRef(isRunning); // Track previous isRunning state
  const isFetchingRef = useRef(false); // Track if already fetching to prevent concurrent calls

  const fetchProject = useCallback(async (skipInputUpdate = false) => {
    // Prevent concurrent calls
    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const { data } = await getProjectDetails(projectId);
      setProject(data);

      // Only update input states if not currently editing to prevent input reversion
      if (!skipInputUpdate && !isUpdatingColor && !isUpdatingRate) {
        setHexInput(data.color || '#6366f1');
        setRateInput(data.hourlyRate === 0 ? '' : String(data.hourlyRate));
        setInvoiceDayInput(data.invoiceDayOfMonth ? String(data.invoiceDayOfMonth) : '');
        setTermsInput(data.paymentTermsDays != null ? String(data.paymentTermsDays) : '');
      }
      setError(null);
    } catch (err) {
      console.error("Failed to fetch project details:", err);
      setError('Failed to load project details.');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [projectId, isUpdatingColor, isUpdatingRate]);

  // Initial fetch - separate useEffect for initial load
  useEffect(() => {
    fetchProject();
  }, [projectId]);

  // Notion sync can rename/complete tasks; keep any half-typed setting inputs
  useSyncComplete(() => fetchProject(true));

  // Refresh project data if the active timer changes (e.g. time logged might update)
  // Use useRef to track previous state and avoid fetchProject dependency
  useEffect(() => {
    // Only refresh when timer stops (was running, now not running)
    if (prevIsRunningRef.current && !isRunning && project) {
      fetchProject(true); // Skip input update when refreshing after timer stop
    }
    prevIsRunningRef.current = isRunning; // Update the ref
  }, [isRunning, project?.id]);

  const handleColorChange = async (newColor) => {
    setIsUpdatingColor(true);
    setColorError(null);
    try {
      await updateProject(projectId, { color: newColor });
      setProject(prev => ({ ...prev, color: newColor }));
      setHexInput(newColor);
    } catch (err) {
      console.error('Failed to update project color:', err);
      setColorError('Failed to update color. Please try again.');
    } finally {
      setIsUpdatingColor(false);
    }
  };

  const handleRateChange = async (newRate) => {
    setIsUpdatingRate(true);
    setRateError(null);
    try {
      const rateValue = newRate === '' ? 0 : parseFloat(newRate);
      await updateProject(projectId, { hourlyRate: rateValue });
      setProject(prev => ({ ...prev, hourlyRate: rateValue }));
      setRateInput(rateValue === 0 ? '' : String(rateValue));
      fetchProject(true); // unbilled amounts are priced server-side at the project rate
    } catch (err) {
      console.error('Failed to update project rate:', err);
      setRateError('Failed to update rate. Please try again.');
    } finally {
      setIsUpdatingRate(false);
    }
  };

  // Invoicing defaults. Saving refetches so the Unbilled list's due dates follow.
  const saveInvoicing = async (patch) => {
    setIsUpdatingInvoicing(true);
    setInvoicingError(null);
    try {
      await updateProject(projectId, patch);
      setProject(prev => ({ ...prev, ...patch }));
      await fetchProject(true);
    } catch (err) {
      console.error('Failed to update invoicing settings:', err);
      setInvoicingError(err.response?.data?.message || 'Failed to update invoicing settings.');
    } finally {
      setIsUpdatingInvoicing(false);
    }
  };

  const handleInvoicingModeChange = (mode) => {
    if (mode === 'payrun') {
      // 20th is the common NZ cutoff; payment terms only apply to as-soon-as-done projects
      const day = parseInt(invoiceDayInput, 10) || 20;
      setInvoiceDayInput(String(day));
      saveInvoicing({ invoiceDayOfMonth: day, paymentTermsDays: null });
      setTermsInput('');
    } else {
      saveInvoicing({ invoiceDayOfMonth: null });
    }
  };

  const commitInvoiceDay = () => {
    const day = parseInt(invoiceDayInput, 10);
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      if (day !== project.invoiceDayOfMonth) saveInvoicing({ invoiceDayOfMonth: day });
      setInvoiceDayInput(String(day));
    } else {
      setInvoiceDayInput(project.invoiceDayOfMonth ? String(project.invoiceDayOfMonth) : '');
    }
  };

  const commitPaymentTerms = () => {
    const trimmed = termsInput.trim();
    const days = trimmed === '' ? null : parseInt(trimmed, 10);
    if (days === null || (Number.isInteger(days) && days >= 0 && days <= 365)) {
      if (days !== (project.paymentTermsDays ?? null)) saveInvoicing({ paymentTermsDays: days });
      setTermsInput(days === null ? '' : String(days));
    } else {
      setTermsInput(project.paymentTermsDays != null ? String(project.paymentTermsDays) : '');
    }
  };

  const handleTasksBilled = async () => {
    // Refresh project data after billing tasks
    await fetchProject(true); // Skip input update when refreshing after billing
    setBillsRefreshToken(prev => prev + 1); // Refetch Previous Bills (also fires on undo)
  };

  const handleDeleteProject = async () => {
    setIsDeleting(true);
    try {
      await deleteProject(projectId);
      navigate('/projects');
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('Failed to delete project. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading && !project) { // Only show big spinner on initial load when no project data exists yet
    return (
      <div className="flex justify-center items-center py-20"> {/* Reduced height/padding */}
        <ArrowPathIcon className="h-10 w-10 text-gray-500 animate-spin" /> {/* Smaller icon */}
        <p className="ml-3 text-gray-600">Loading project details...</p>
      </div>
    );
  }
  if (error) return <p className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-lg">{error}</p>;
  if (!project) return <p className="text-center text-gray-500">Project not found.</p>;

  const isPayRun = !!project.invoiceDayOfMonth;

  return (
    <div className="space-y-8">
      <Link to="/projects" className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors group">
        <ArrowLeftIcon className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
        Back to Projects
      </Link>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div className="flex items-start space-x-4">
            <ProjectIcon
              iconType={project.iconType}
              iconValue={project.iconValue}
              projectName={project.name}
              projectColor={project.color}
              className="w-12 h-12 mt-1"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">{project.name}</h1>
              <p className="text-sm text-gray-500 mb-1.5">
                Client: {project.clientName || 'N/A'}
                <span className="mx-1.5 text-gray-300">·</span>
                Logged <span className="font-medium text-gray-700">{formatHoursHuman(parseFloat(project.totalHoursSpent || 0))}</span>
              </p>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{project.status || 'N/A'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 mt-4 md:mt-0">
            <button onClick={() => fetchProject()} disabled={isLoading} className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Refresh project">
              <ArrowPathIcon className={`h-6 w-6 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 rounded-full text-red-600 hover:bg-red-50 transition-colors"
              title="Delete Project"
            >
              <TrashIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Project Settings Section */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Project Settings</h4>

          {/* Color Picker Row */}
          <div className="flex flex-col md:flex-row md:items-center md:space-x-6 space-y-4 md:space-y-0 mb-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label htmlFor="color-picker" className="text-sm text-gray-700">Color:</label>
                <input
                  id="color-picker"
                  type="color"
                  value={project.color || '#6366f1'}
                  onChange={(e) => handleColorChange(e.target.value)}
                  disabled={isUpdatingColor}
                  className="w-10 h-10 rounded-lg border-2 border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
              <div className="flex items-center space-x-2">
                <label htmlFor="hex-input" className="text-sm text-gray-700">Hex:</label>
                <input
                  id="hex-input"
                  type="text"
                  value={hexInput}
                  onChange={(e) => {
                    // Allow any typing in the hex input
                    setHexInput(e.target.value);
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    // Only validate and update if it's a valid 6-character hex color
                    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                      handleColorChange(value);
                    } else {
                      // Revert to original color if invalid
                      setHexInput(project.color || '#6366f1');
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.target.blur(); // Trigger onBlur validation
                    }
                  }}
                  disabled={isUpdatingColor}
                  placeholder="#6366f1"
                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
              {isUpdatingColor && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>Updating...</span>
                </div>
              )}
            </div>
          </div>

          {/* Hourly Rate Row */}
          <div className="flex flex-col md:flex-row md:items-center md:space-x-6 space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <label htmlFor="rate-input" className="text-sm text-gray-700">Hourly Rate:</label>
              <div className="flex items-center">
                <span className="text-sm text-gray-500 mr-1">$</span>
                <input
                  id="rate-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateInput} // Use separate rate input state
                  onChange={(e) => {
                    const value = e.target.value;
                    setRateInput(value);
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value === '' || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0)) {
                      const numericValue = value === '' ? 0 : parseFloat(value);
                      handleRateChange(numericValue);
                    } else {
                      // Revert to original rate if invalid
                      setRateInput(project.hourlyRate === 0 ? '' : String(project.hourlyRate));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.target.blur(); // Trigger onBlur validation
                    }
                  }}
                  disabled={isUpdatingRate}
                  placeholder="0.00"
                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
                <span className="text-sm text-gray-500 ml-1">/hour</span>
              </div>
              {isUpdatingRate && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>Updating...</span>
                </div>
              )}
            </div>
          </div>

          {/* Invoicing defaults: when finished work should be billed (tasks can override) */}
          <div className="mt-4 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-700">
              <label htmlFor="invoicing-mode">Invoicing:</label>
              <select
                id="invoicing-mode"
                value={isPayRun ? 'payrun' : 'asap'}
                onChange={(e) => handleInvoicingModeChange(e.target.value)}
                disabled={isUpdatingInvoicing}
                className="px-2 py-1 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="asap">As soon as work is done</option>
                <option value="payrun">Monthly pay run</option>
              </select>
              {isPayRun ? (
                <span className="inline-flex items-center gap-1.5">
                  <label htmlFor="invoice-day">Invoice by the</label>
                  <input
                    id="invoice-day"
                    type="number"
                    min="1"
                    max="31"
                    value={invoiceDayInput}
                    onChange={(e) => setInvoiceDayInput(e.target.value)}
                    onBlur={() => commitInvoiceDay()}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                    disabled={isUpdatingInvoicing}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                  <span>of each month</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <label htmlFor="payment-terms">Client usually pays within</label>
                  <input
                    id="payment-terms"
                    type="number"
                    min="0"
                    max="365"
                    value={termsInput}
                    onChange={(e) => setTermsInput(e.target.value)}
                    onBlur={() => commitPaymentTerms()}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                    disabled={isUpdatingInvoicing}
                    placeholder="—"
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                  <span>days</span>
                </span>
              )}
              {isUpdatingInvoicing && <ArrowPathIcon className="h-4 w-4 animate-spin text-gray-500" />}
            </div>
            <p className="text-xs text-gray-500">
              {isPayRun
                ? `Finished work is due on the next ${project.invoiceDayOfMonth ? ordinal(project.invoiceDayOfMonth) : 'cutoff'} (short months use their last day).`
                : 'Finished work is due straight away. The payment time estimates when the money arrives.'}
              {' '}Tasks can set their own invoice date or payment split from their $ button.
            </p>
          </div>

          {/* Error Messages */}
          {colorError && (
            <p className="text-sm text-red-600 mt-2">{colorError}</p>
          )}
          {rateError && (
            <p className="text-sm text-red-600 mt-2">{rateError}</p>
          )}
          {invoicingError && (
            <p className="text-sm text-red-600 mt-2">{invoicingError}</p>
          )}
        </div>
      </div>

      {/* Billing Section */}
      <BillingOverview project={project} tasks={project.tasks || []} />
      <UnbilledTasksSection
        project={project}
        onTasksBilled={handleTasksBilled}
        onRefresh={() => fetchProject(true)}
      />
      <PreviousBillsSection project={project} refreshToken={billsRefreshToken} />

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tasks</h2>
        {project.tasks && project.tasks.length > 0 ? (
          <div className="space-y-3">
            {project.tasks.map(task => (
              <TaskItem
                key={task.id}
                task={{
                  ...task,
                  projectName: project.name // Pass project name to TaskItem
                }}
                onEditPricing={setPricingTask}
              // onStartOverride and onStopOverride are handled by useTimer context via TaskItem itself
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No tasks found for this project" hint="Tasks will appear here after a Notion sync." />
        )}
      </div>

      {/* Task Pricing Modal */}
      {pricingTask && (
        <TaskPricingModal
          task={pricingTask}
          project={project}
          onClose={() => setPricingTask(null)}
          onSaved={() => {
            setPricingTask(null);
            fetchProject(true);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center mb-4">
                <TrashIcon className="h-8 w-8 text-red-600 mr-3" />
                <h2 className="text-lg font-semibold text-gray-900">Delete Project</h2>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete "{project.name}"? This will permanently delete the project and all its tasks and time entries. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteProject}
                  disabled={isDeleting}
                  className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectDetailPage;