import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { getActiveTimer, startTimer as apiStartTimer, stopTimer as apiStopTimer } from '../services/api';
import { formatTimerDisplay } from '../utils/timeUtils';

export const TimerContext = createContext();

export const TimerProvider = ({ children }) => {
  const [activeTimerDetails, setActiveTimerDetails] = useState(null); // Stores { timeEntryId, taskId, taskName, projectName, startTime }
  const [elapsedTime, setElapsedTime] = useState(0); // in seconds
  const [isLoading, setIsLoading] = useState(true);
  const [timerStopCallbacks, setTimerStopCallbacks] = useState([]); // Callbacks to call when timer stops

  // Function to register callbacks for timer stop events
  const registerTimerStopCallback = useCallback((callback) => {
    setTimerStopCallbacks(prev => [...prev, callback]);
    // Return unregister function
    return () => {
      setTimerStopCallbacks(prev => prev.filter(cb => cb !== callback));
    };
  }, []);

  const fetchCurrentActiveTimer = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: timer } = await getActiveTimer();
      if (timer) {
        setActiveTimerDetails({
          timeEntryId: timer.timeEntryId,
          taskId: timer.taskId,
          taskName: timer.taskName,
          projectName: timer.projectName,
          startTime: timer.startTime,
        });
      } else {
        setActiveTimerDetails(null);
        setElapsedTime(0);
      }
    } catch (error) {
      console.error("Failed to fetch active timer:", error);
      setActiveTimerDetails(null);
      setElapsedTime(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentActiveTimer();
  }, [fetchCurrentActiveTimer]);

  useEffect(() => {
    let interval;
    if (activeTimerDetails?.startTime) {
      const calculateElapsedTime = () => {
        const now = new Date();
        const start = new Date(activeTimerDetails.startTime);
        setElapsedTime(Math.floor((now - start) / 1000));
      };
      calculateElapsedTime(); // Initial calculation
      interval = setInterval(calculateElapsedTime, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [activeTimerDetails]);

  // Update document title when timer is running
  useEffect(() => {
    if (activeTimerDetails && elapsedTime > 0) {
      const formattedTime = formatTimerDisplay(elapsedTime);
      document.title = `${formattedTime} - ${activeTimerDetails.taskName} | Time Tracker`;
    } else {
      document.title = 'Time Tracker';
    }

    // Cleanup function to reset title when component unmounts
    return () => {
      document.title = 'Time Tracker';
    };
  }, [activeTimerDetails, elapsedTime]);

  const startTimer = async (taskId, taskName = 'Selected Task', projectName = 'Project') => {
    if (activeTimerDetails?.taskId === taskId) {
      console.log("Timer already running for this task.");
      return;
    }
    try {
      // If another timer is running, the backend /start endpoint should handle stopping it.
      const { data: newTimer } = await apiStartTimer(taskId);
      setActiveTimerDetails({
        timeEntryId: newTimer.timeEntryId,
        taskId: newTimer.taskId, // or taskId from input
        taskName: taskName, // ideally fetch full task details or pass them
        projectName: projectName,
        startTime: newTimer.startTime,
      });
      // No need to call fetchCurrentActiveTimer here as we've set it directly
    } catch (error) {
      console.error("Failed to start timer:", error);
      // Optionally, refetch active timer to ensure UI consistency
      fetchCurrentActiveTimer();
    }
  };

  const stopTimer = async () => {
    if (!activeTimerDetails) return;
    try {
      await apiStopTimer(activeTimerDetails.timeEntryId);
      setActiveTimerDetails(null);
      setElapsedTime(0);

      // Call all registered callbacks when timer stops
      timerStopCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Error calling timer stop callback:', error);
        }
      });
    } catch (error) {
      console.error("Failed to stop timer:", error);
      // Optionally, refetch active timer to ensure UI consistency
      fetchCurrentActiveTimer();
    }
  };

  const formatTime = (totalSeconds) => {
    return formatTimerDisplay(totalSeconds);
  };

  return (
    <TimerContext.Provider value={{
      activeTimerDetails,
      elapsedTime,
      formattedElapsedTime: formatTime(elapsedTime),
      isRunning: !!activeTimerDetails,
      startTimer,
      stopTimer,
      isLoadingTimer: isLoading,
      refreshActiveTimer: fetchCurrentActiveTimer,
      registerTimerStopCallback, // Expose callback registration
    }}>
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => useContext(TimerContext);