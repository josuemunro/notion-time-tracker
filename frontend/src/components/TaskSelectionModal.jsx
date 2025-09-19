import React, { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { getTasks } from '../services/api';
import ProjectIcon from './ProjectIcon';

const TaskSelectionModal = ({ isOpen, onClose, onSelectTask, startTime, endTime }) => {
  const [tasks, setTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchTasks();
      setSearchTerm('');
      setSelectedTaskId(null);
    }
  }, [isOpen]);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const { data } = await getTasks();
      setTasks(data);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    if (!searchTerm) return tasks;

    const searchLower = searchTerm.toLowerCase();
    return tasks.filter(task =>
      task.name?.toLowerCase().includes(searchLower) ||
      task.projectName?.toLowerCase().includes(searchLower) ||
      task.clientName?.toLowerCase().includes(searchLower)
    );
  }, [tasks, searchTerm]);

  const handleSelectTask = () => {
    if (!selectedTaskId) return;

    const selectedTask = tasks.find(t => t.id === selectedTaskId);
    if (selectedTask) {
      onSelectTask(selectedTask, startTime, endTime);
    }
  };

  const formatTime = (timeString) => {
    return new Date(timeString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateDuration = () => {
    if (!startTime || !endTime) return '';
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Create Time Entry</h2>
            <p className="text-sm text-gray-600 mt-1">
              {formatTime(startTime)} - {formatTime(endTime)} ({calculateDuration()})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks, projects, or clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading tasks...</div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? 'No tasks found matching your search.' : 'No tasks available.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedTaskId === task.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div className="flex items-center space-x-3">
                    <ProjectIcon
                      iconType={task.projectIconType}
                      iconValue={task.projectIconValue}
                      projectName={task.projectName}
                      projectColor={task.projectColor}
                      className="w-8 h-8 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">
                        {task.name}
                      </div>
                      <div className="text-sm text-gray-600 truncate">
                        {task.projectName}
                        {task.clientName && ` • ${task.clientName}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        Status: {task.status}
                        {task.totalHoursSpent > 0 && ` • ${task.totalHoursSpent.toFixed(1)}h logged`}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSelectTask}
            disabled={!selectedTaskId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Create Time Entry
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskSelectionModal; 