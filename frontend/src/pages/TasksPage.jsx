import React, { useEffect, useState } from 'react';
import { getTasks } from '../services/api';
import TaskItem from '../components/common/TaskItem';
import { ArrowPathIcon, ListBulletIcon } from '@heroicons/react/24/solid';
import EmptyState from '../components/common/EmptyState';


function TasksPage() {
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    // Add filters state if you want to allow user to filter tasks
    // const [filters, setFilters] = useState({});

    const fetchTasks = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // const { data } = await getTasks(filters); // If using filters
            const { data } = await getTasks();
            setTasks(data || []);
        } catch (err) {
            setError('Failed to load tasks.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []); // Add filters to dependency array if they can change

    if (isLoading) return (
        <div className="flex justify-center items-center h-64">
            <ArrowPathIcon className="h-12 w-12 text-gray-500 animate-spin" />
            <p className="ml-3 text-lg text-gray-700">Loading Tasks...</p>
        </div>
    );
    if (error) return <p className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-lg">{error}</p>;


    return (
        <div>
            <div className="flex items-start justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">All Tasks</h1>
                    <p className="mt-1 text-sm text-gray-500">Every task cached locally from Notion</p>
                </div>
            </div>
             {/* Add filter controls here if needed */}
            {tasks.length === 0 && (
                <EmptyState
                    icon={ListBulletIcon}
                    title="No tasks found"
                    hint="Try syncing with Notion first."
                />
            )}
            <div className="space-y-3">
                {tasks.map(task => (
                    <TaskItem key={task.id} task={task} />
                ))}
            </div>
        </div>
    );
}
export default TasksPage;
