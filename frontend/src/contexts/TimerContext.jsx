import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { getActiveTimer, startTimer as apiStartTimer, stopTimer as apiStopTimer } from '../services/api';
import { formatTimerDisplay } from '../utils/timeUtils';

// Favicon management functions
const createRecordingFavicon = (isBreathing = false) => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  // Clear canvas with transparent background
  ctx.clearRect(0, 0, 32, 32);

  // Create gradient for more appealing look
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, isBreathing ? 15 : 12);
  gradient.addColorStop(0, isBreathing ? '#ff6666' : '#ff3333');
  gradient.addColorStop(1, isBreathing ? '#cc0000' : '#990000');

  // Draw red circle (recording symbol) with breathing effect
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(16, 16, isBreathing ? 15 : 11, 0, 2 * Math.PI);
  ctx.fill();

  // Add subtle outline for definition
  ctx.strokeStyle = isBreathing ? '#990000' : '#660000';
  ctx.lineWidth = isBreathing ? 0.5 : 1;
  ctx.beginPath();
  ctx.arc(16, 16, isBreathing ? 15 : 11, 0, 2 * Math.PI);
  ctx.stroke();

  // Add small white highlight for 3D effect
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(isBreathing ? 13 : 13, isBreathing ? 13 : 13, isBreathing ? 3 : 2.5, 0, 2 * Math.PI);
  ctx.fill();

  return canvas.toDataURL();
};

const createNormalFavicon = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  // Clear canvas
  ctx.clearRect(0, 0, 32, 32);

  // Draw clock symbol
  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(16, 16, 12, 0, 2 * Math.PI);
  ctx.stroke();

  // Draw clock hands
  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 2;
  // Hour hand
  ctx.beginPath();
  ctx.moveTo(16, 16);
  ctx.lineTo(16, 8);
  ctx.stroke();
  // Minute hand
  ctx.beginPath();
  ctx.moveTo(16, 16);
  ctx.lineTo(22, 10);
  ctx.stroke();

  return canvas.toDataURL();
};

const updateFavicon = (dataUrl) => {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = dataUrl;
};

export const TimerContext = createContext();

export const TimerProvider = ({ children }) => {
  const [activeTimerDetails, setActiveTimerDetails] = useState(null); // Stores { timeEntryId, taskId, taskName, projectName, startTime }
  const [elapsedTime, setElapsedTime] = useState(0); // in seconds
  const [isLoading, setIsLoading] = useState(true);
  const [timerStopCallbacks, setTimerStopCallbacks] = useState([]); // Callbacks to call when timer stops
  const [faviconBreathing, setFaviconBreathing] = useState(false); // For breathing animation
  const [originalFaviconHref, setOriginalFaviconHref] = useState(null); // Store original favicon

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
        // The backend stores time by converting local time to NZ time and storing as ISO
        // So we need to do the same conversion for the current time to match
        const now = new Date();

        // Apply the same NZ offset that the backend uses (UTC+12)
        const nzOffset = 12 * 60; // 12 hours in minutes
        const nzNow = new Date(now.getTime() + (nzOffset * 60 * 1000));

        // The start time from backend is already in the correct format (NZ time as ISO)
        const start = new Date(activeTimerDetails.startTime);

        // Calculate elapsed time in seconds
        const elapsedSeconds = Math.floor((nzNow - start) / 1000);

        // Ensure elapsed time is never negative (fallback protection)
        const safeElapsedTime = Math.max(0, elapsedSeconds);
        console.log('⏱️ Timer calculation:', {
          localNow: now.toISOString(),
          nzNow: nzNow.toISOString(),
          start: start.toISOString(),
          timeDifference: `${elapsedSeconds}s`,
          safeElapsedTime
        });
        setElapsedTime(safeElapsedTime);
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
      const newTitle = `${formattedTime} - ${activeTimerDetails.taskName} | Time Tracker`;
      console.log('🏷️ Updating document title:', newTitle, 'elapsedTime:', elapsedTime);
      document.title = newTitle;
    } else {
      console.log('🏷️ Resetting document title. activeTimerDetails:', !!activeTimerDetails, 'elapsedTime:', elapsedTime);
      document.title = 'Time Tracker';
    }

    // Cleanup function to reset title when component unmounts
    return () => {
      document.title = 'Time Tracker';
    };
  }, [activeTimerDetails, elapsedTime]);

  // Manage favicon based on timer state
  useEffect(() => {
    if (activeTimerDetails && elapsedTime > 0) {
      // Start breathing favicon animation
      const breathingInterval = setInterval(() => {
        setFaviconBreathing(prev => !prev);
      }, 800); // Breathe faster for more noticeable effect

      return () => clearInterval(breathingInterval);
    } else {
      // Reset to original favicon
      if (originalFaviconHref) {
        updateFavicon(originalFaviconHref);
      }
      setFaviconBreathing(false);
    }
  }, [activeTimerDetails, elapsedTime, originalFaviconHref]);

  // Update favicon when breathing state changes
  useEffect(() => {
    if (activeTimerDetails && elapsedTime > 0) {
      updateFavicon(createRecordingFavicon(faviconBreathing));
    }
  }, [faviconBreathing, activeTimerDetails, elapsedTime]);

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

      // Reset favicon to original when timer stops
      if (originalFaviconHref) {
        updateFavicon(originalFaviconHref);
      }
      setFaviconBreathing(false);

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

  const formattedElapsedTime = formatTimerDisplay(elapsedTime);

  // Store original favicon on mount
  useEffect(() => {
    const link = document.querySelector("link[rel~='icon']");
    if (link && link.href) {
      setOriginalFaviconHref(link.href);
      console.log('💾 Stored original favicon:', link.href);
    }
  }, []);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Reset favicon to original when component unmounts
      if (originalFaviconHref) {
        updateFavicon(originalFaviconHref);
      }
    };
  }, [originalFaviconHref]);

  return (
    <TimerContext.Provider value={{
      activeTimerDetails,
      elapsedTime,
      formattedElapsedTime,
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