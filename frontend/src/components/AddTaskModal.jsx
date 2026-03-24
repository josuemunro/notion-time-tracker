import React, { useState, useEffect } from 'react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/solid';
import { getProjects, createProject, createTask } from '../services/api';
import ProjectIcon from './ProjectIcon';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#64748b', '#78716c',
];

const AddTaskModal = ({ isOpen, onClose, onTaskCreated }) => {
  const [taskName, setTaskName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectEmoji, setNewProjectEmoji] = useState('');
  const [newProjectColor, setNewProjectColor] = useState(PRESET_COLORS[0]);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setTaskName('');
    setSelectedProjectId('');
    setShowNewProject(false);
    setNewProjectName('');
    setNewProjectEmoji('');
    setNewProjectColor(PRESET_COLORS[0]);
    setError(null);
  };

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const { data } = await getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError('Could not load projects.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!taskName.trim()) {
      setError('Task name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      let projectId = selectedProjectId;

      if (showNewProject) {
        if (!newProjectName.trim()) {
          setError('Project name is required.');
          setIsSubmitting(false);
          return;
        }
        const { data } = await createProject({
          name: newProjectName.trim(),
          iconEmoji: newProjectEmoji || null,
          color: newProjectColor,
        });
        projectId = data.project.id;
      }

      if (!projectId) {
        setError('Please select or create a project.');
        setIsSubmitting(false);
        return;
      }

      await createTask({ name: taskName.trim(), projectId: parseInt(projectId) });
      onTaskCreated?.();
      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
      setError(err.response?.data?.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">Add New Task</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Task Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task Name
            </label>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="What are you working on?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </div>

          {/* Project Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project
            </label>

            {!showNewProject ? (
              <div className="space-y-2">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  disabled={isLoading}
                >
                  <option value="">
                    {isLoading ? 'Loading projects...' : 'Select a project'}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewProject(true);
                    setSelectedProjectId('');
                  }}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create new project
                </button>
              </div>
            ) : (
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">New Project</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewProject(false);
                      setNewProjectName('');
                      setNewProjectEmoji('');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    Use existing instead
                  </button>
                </div>

                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Icon (emoji)</label>
                    <input
                      type="text"
                      value={newProjectEmoji}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.length <= 2) setNewProjectEmoji(val);
                      }}
                      placeholder="e.g. 🎯"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Color</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewProjectColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            newProjectColor === c
                              ? 'border-gray-800 scale-110'
                              : 'border-transparent hover:scale-110'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="flex items-center gap-2 pt-1">
                  <ProjectIcon
                    iconType={newProjectEmoji ? 'emoji' : null}
                    iconValue={newProjectEmoji || null}
                    projectName={newProjectName || 'Preview'}
                    projectColor={newProjectColor}
                    className="w-6 h-6"
                  />
                  <span className="text-sm text-gray-600">
                    {newProjectName || 'Project preview'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTaskModal;
