import React, {useEffect, useState} from 'react';
import { getTasks } from '../services/api';
import TaskItem from '../components/common/TaskItem';
import { ArrowPathIcon } from '@heroicons/react/24/solid';


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
    if (error) return <p className="text-center text-red-500 bg-red-100 p-4 rounded-md">{error}</p>;


    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">All Tasks</h1>
             {/* Add filter controls here if needed */}
            {tasks.length === 0 && (
                <p className="text-center text-gray-500">No tasks found.</p>
            )}
            <div className="space-y-4">
                {tasks.map(task => (
                    <TaskItem key={task.id} task={task} />
                ))}
            </div>
        </div>
    );
}
export default TasksPage;