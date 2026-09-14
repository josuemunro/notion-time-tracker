import React, { createContext, useState, useEffect, useCallback, useContext, useRef } from 'react';
import { getActiveTimer, startTimer as apiStartTimer, stopTimer as apiStopTimer, rolloverTimer as apiRolloverTimer } from '../services/api';
import { formatTimerDisplay, getLocalDateString } from '../utils/timeUtils';

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
  const [timerChangeCallbacks, setTimerChangeCallbacks] = useState([]); // Callbacks to call when a timer starts or stops
  const [faviconBreathing, setFaviconBreathing] = useState(false); // For breathing animation
  const [originalFaviconHref, setOriginalFaviconHref] = useState(null); // Store original favicon

  // Function to register callbacks for timer start/stop events
  const registerTimerChangeCallback = useCallback((callback) => {
    setTimerChangeCallbacks(prev => [...prev, callback]);
    // Return unregister function
    return () => {
      setTimerChangeCallbacks(prev => prev.filter(cb => cb !== callback));
    };
  }, []);

  // Ref mirror so long-lived closures (the 1s tick) always see current listeners
  const callbacksRef = useRef(timerChangeCallbacks);
  callbacksRef.current = timerChangeCallbacks;
  const notifyTimerChange = useCallback(() => {
    callbacksRef.current.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error calling timer change callback:', error);
      }
    });
  }, []);

  const fetchCurrentActiveTimer = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const { data: timer } = await getActiveTimer();
      if (timer) {
        // Keep the full enriched row (rates, pricing, project color/icon,
        // taskTotalSeconds) — MoneyTimer needs it for live earnings
        setActiveTimerDetails(timer);
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

  // Midnight rollover guard: one request in flight at a time, and back off after a failure
  const rolloverState = useRef({ inFlight: false, retryAfter: 0 });

  useEffect(() => {
    let interval;
    if (activeTimerDetails?.startTime) {
      const start = new Date(activeTimerDetails.startTime);
      const tick = () => {
        const now = new Date();
        // Both are real UTC instants, so elapsed time is a plain difference
        setElapsedTime(Math.max(0, Math.floor((now - start) / 1000)));

        // Crossed local midnight (in the configured timezone): ask the server to close
        // this entry at midnight and continue as a fresh entry from midnight onwards.
        // The server re-checks, so a stale client view is harmless.
        const guard = rolloverState.current;
        if (getLocalDateString(now) !== getLocalDateString(start) && !guard.inFlight && Date.now() >= guard.retryAfter) {
          guard.inFlight = true;
          apiRolloverTimer(activeTimerDetails.timeEntryId)
            .then(({ data }) => {
              if (data?.rolled) {
                console.log('🌙 Timer rolled over midnight → new entry', data.timeEntryId);
                notifyTimerChange();
                return fetchCurrentActiveTimer(true); // pick up the new entry
              }
              // Server disagrees that midnight has passed (zone mismatch) — don't hammer it
              guard.retryAfter = Date.now() + 60000;
            })
            .catch((error) => {
              console.error('Failed to roll timer over midnight:', error);
              guard.retryAfter = Date.now() + 60000;
              fetchCurrentActiveTimer(true);
            })
            .finally(() => { guard.inFlight = false; });
        }
      };
      tick(); // Initial calculation
      interval = setInterval(tick, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [activeTimerDetails, fetchCurrentActiveTimer, notifyTimerChange]);

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
      // Quiet refetch to pick up the enriched row (rates/pricing for earnings display)
      fetchCurrentActiveTimer(true);

      // Notify listeners (e.g. timeline) — starting a timer may have auto-stopped
      // the previous one on the backend, so views need to refresh
      notifyTimerChange();
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
      notifyTimerChange();
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
      registerTimerChangeCallback, // Expose callback registration (fires on start and stop)
    }}>
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => useContext(TimerContext);