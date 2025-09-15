import React, { useState, useEffect, useRef } from 'react';
import { getTimeEntries, updateTimeEntry, deleteTimeEntry, addManualTimeEntry } from '../services/api';
import { formatDurationHuman } from '../utils/timeUtils';
import ProjectIcon from './ProjectIcon';

// Helper function to calculate optimal text color for contrast
function getOptimalTextColor(backgroundColor) {
  // Remove # if present
  const color = backgroundColor.replace('#', '');

  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Calculate luminance using relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light backgrounds, white for dark backgrounds
  return luminance > 0.5 ? 'text-black' : 'text-white';
}

const TimelineView = ({ selectedDate = new Date().toISOString().split('T')[0] }) => {
  const [timeEntries, setTimeEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dragState, setDragState] = useState(null);
  const [deleteMode, setDeleteMode] = useState(null); // Track which entry is in delete mode
  const [dragTooltip, setDragTooltip] = useState(null); // { x, y, time }
  const [deletedEntry, setDeletedEntry] = useState(null); // Store deleted entry for undo
  const [undoTimeout, setUndoTimeout] = useState(null);
  const [hasDragged, setHasDragged] = useState(false); // Track if user has dragged
  const timelineRef = useRef(null);

  // Timeline constants
  const HOUR_WIDTH = 80; // pixels per hour
  const START_HOUR = 5; // 5 AM (expanded range)
  const END_HOUR = 23; // 11 PM (expanded range)
  const TIMELINE_HOURS = END_HOUR - START_HOUR;
  const SNAP_MINUTES = 5; // Snap to 5-minute increments
  const TIMELINE_HEIGHT = 120; // Height of the timeline track

  useEffect(() => {
    fetchTimeEntries();
  }, [selectedDate]);

  // Clear delete mode when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setDeleteMode(null);
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const handleDelete = async (entry) => {
    try {
      // Remove from UI immediately
      setTimeEntries(prev => prev.filter(te => te.timeEntryId !== entry.timeEntryId));
      setDeleteMode(null);

      // Store for undo
      setDeletedEntry(entry);

      // Delete from backend
      await deleteTimeEntry(entry.timeEntryId);

      // Set undo timeout
      const timeout = setTimeout(() => {
        setDeletedEntry(null);
      }, 10000); // 10 seconds to undo

      setUndoTimeout(timeout);
    } catch (error) {
      console.error('Failed to delete time entry:', error);
      // Restore entry on error
      setTimeEntries(prev => [...prev, entry].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)));
    }
  };

  const handleUndo = async () => {
    if (!deletedEntry) return;

    try {
      // Clear timeout
      if (undoTimeout) {
        clearTimeout(undoTimeout);
        setUndoTimeout(null);
      }

      // Recreate the entry
      const newEntry = {
        taskId: deletedEntry.taskId,
        startTime: deletedEntry.startTime,
        endTime: deletedEntry.endTime,
        duration: deletedEntry.duration
      };

      const { data } = await addManualTimeEntry(newEntry);

      // Add back to UI
      fetchTimeEntries(); // Refresh to get the new entry with proper ID
      setDeletedEntry(null);
    } catch (error) {
      console.error('Failed to undo delete:', error);
    }
  };

  const fetchTimeEntries = async () => {
    setIsLoading(true);
    try {
      console.log('Timeline: Requesting entries for date:', selectedDate);
      console.log('Timeline: Today is:', new Date().toISOString().split('T')[0]);
      const { data } = await getTimeEntries({ date: selectedDate });
      console.log('Timeline: Fetched time entries for', selectedDate, ':', data);
      console.log('Timeline: API URL called:', `/api/time-entries?date=${selectedDate}`);
      setTimeEntries(data);
    } catch (error) {
      console.error('Failed to fetch time entries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert time to pixels from left of timeline
  const timeToPixels = (timeString) => {
    const date = new Date(timeString);
    const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    return (hours - START_HOUR) * HOUR_WIDTH;
  };

  // Convert pixels to time
  const pixelsToTime = (pixels, baseDate) => {
    const hours = START_HOUR + (pixels / HOUR_WIDTH);
    const totalMinutes = Math.round(hours * 60 / SNAP_MINUTES) * SNAP_MINUTES;
    const finalHours = Math.floor(totalMinutes / 60);
    const finalMinutes = totalMinutes % 60;

    const newDate = new Date(baseDate);
    newDate.setHours(finalHours, finalMinutes, 0, 0);
    return newDate.toISOString();
  };

  // Handle mouse down for dragging
  const handleMouseDown = (e, entryId, handle) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent entry click
    const entry = timeEntries.find(te => te.timeEntryId === entryId);
    if (!entry) return;

    setHasDragged(false); // Reset drag flag

    const dragStartData = {
      entryId,
      handle, // 'start' or 'end'
      startX: e.clientX,
      originalEntry: { ...entry }
    };

    setDragState(dragStartData);

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - dragStartData.startX;

      // Mark as dragged if moved more than 3 pixels
      if (Math.abs(deltaX) > 3) {
        setHasDragged(true);
      }

      let newPixels;
      if (handle === 'start') {
        newPixels = timeToPixels(dragStartData.originalEntry.startTime) + deltaX;
      } else {
        newPixels = timeToPixels(dragStartData.originalEntry.endTime) + deltaX;
      }

      // Ensure within timeline bounds
      newPixels = Math.max(0, Math.min(newPixels, TIMELINE_HOURS * HOUR_WIDTH));

      const baseDate = new Date(selectedDate + 'T00:00:00');
      const newTime = pixelsToTime(newPixels, baseDate);

      // Update tooltip position and time
      const timelineRect = timelineRef.current?.getBoundingClientRect();
      if (timelineRect) {
        setDragTooltip({
          x: moveEvent.clientX,
          y: moveEvent.clientY - 40,
          time: new Date(newTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }

      // Update local state immediately for smooth dragging
      setTimeEntries(prev => prev.map(te => {
        if (te.timeEntryId === entryId) {
          const updated = { ...te };
          if (handle === 'start') {
            updated.startTime = newTime;
            // Ensure start time is before end time
            if (new Date(newTime) >= new Date(te.endTime)) {
              return te; // Don't update if invalid
            }
            // Recalculate duration
            const start = new Date(newTime);
            const end = new Date(te.endTime);
            updated.duration = Math.round((end - start) / 1000);
          } else {
            updated.endTime = newTime;
            // Ensure end time is after start time
            if (new Date(newTime) <= new Date(te.startTime)) {
              return te; // Don't update if invalid
            }
            // Recalculate duration
            const start = new Date(te.startTime);
            const end = new Date(newTime);
            updated.duration = Math.round((end - start) / 1000);
          }
          return updated;
        }
        return te;
      }));
    };

    const handleMouseUp = async () => {
      // Save to backend
      const entry = timeEntries.find(te => te.timeEntryId === entryId);
      if (entry && dragStartData) {
        try {
          await updateTimeEntry(entryId, {
            startTime: entry.startTime,
            endTime: entry.endTime,
            duration: entry.duration
          });
        } catch (error) {
          console.error('Failed to update time entry:', error);
          // Revert on error
          setTimeEntries(prev => prev.map(te =>
            te.timeEntryId === entryId ? dragStartData.originalEntry : te
          ));
        }
      }

      setDragState(null);
      setDragTooltip(null);

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const renderTimeEntry = (entry) => {
    if (!entry.endTime) {
      console.log('Skipping active entry (no endTime):', entry);
      return null;
    }

    const startPixels = timeToPixels(entry.startTime);
    const endPixels = timeToPixels(entry.endTime);
    const width = endPixels - startPixels;

    // Don't render if outside visible timeline
    if (startPixels > TIMELINE_HOURS * HOUR_WIDTH || endPixels < 0) {
      console.log('Entry outside visible timeline:', entry.taskName);
      return null;
    }

    const isInDeleteMode = deleteMode === entry.timeEntryId;
    const projectColor = entry.projectColor || '#6366f1'; // Default blue
    const textColor = getOptimalTextColor(projectColor);

    // Determine layout based on width
    const showOnlyIcon = width < 50;
    const showIconAndTask = width >= 50 && width < 150;
    const showFullInfo = width >= 150;

    const handleEntryClick = (e) => {
      e.stopPropagation();

      // Don't trigger delete mode if we just finished dragging
      if (hasDragged) {
        setHasDragged(false);
        return;
      }

      if (isInDeleteMode) {
        // Handle delete
        handleDelete(entry);
      } else {
        // Enter delete mode
        setDeleteMode(entry.timeEntryId);
      }
    };

    const handleDragAreaMouseDown = (e, handle) => {
      e.stopPropagation();
      handleMouseDown(e, entry.timeEntryId, handle);
    };

    return (
      <div
        key={entry.timeEntryId}
        className={`absolute rounded-lg shadow-sm z-10 group transition-all duration-200 cursor-pointer
          ${isInDeleteMode ? 'ring-2 ring-red-500' : 'hover:shadow-md'}`}
        style={{
          left: `${Math.max(0, startPixels)}px`,
          width: `${Math.max(40, width)}px`,
          top: '40px',
          height: '60px',
          backgroundColor: projectColor,
        }}
        onClick={handleEntryClick}
      >
        {/* Start drag area */}
        <div
          className="absolute left-0 top-0 bottom-0 w-4 cursor-col-resize"
          onMouseDown={(e) => handleDragAreaMouseDown(e, 'start')}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-black opacity-0 hover:opacity-100 transition-opacity" />
        </div>

        {/* End drag area */}
        <div
          className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize"
          onMouseDown={(e) => handleDragAreaMouseDown(e, 'end')}
        >
          <div className="absolute right-0 top-0 bottom-0 w-1 bg-black opacity-0 hover:opacity-100 transition-opacity" />
        </div>

        {/* Content based on width */}
        <div className={`p-2 h-full flex items-center ${textColor}`}>
          {isInDeleteMode ? (
            // Delete mode content
            <div className="w-full h-full flex items-center justify-center bg-red-500 text-white rounded font-medium text-sm">
              Delete?
            </div>
          ) : showOnlyIcon ? (
            // Only icon for very narrow entries (< 50px)
            <div className="w-full flex items-center justify-center">
              <ProjectIcon
                iconType={entry.projectIconType}
                iconValue={entry.projectIconValue}
                projectName={entry.projectName}
                projectColor={entry.projectColor}
                className="w-4 h-4"
              />
            </div>
          ) : showIconAndTask ? (
            // Icon + task name for medium entries (50px - 150px)
            <div className="flex items-center space-x-2 w-full">
              <ProjectIcon
                iconType={entry.projectIconType}
                iconValue={entry.projectIconValue}
                projectName={entry.projectName}
                projectColor={entry.projectColor}
                className="w-5 h-5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-xs">{entry.taskName}</div>
              </div>
            </div>
          ) : (
            // Full info for wide entries (>= 150px)
            <div className="flex items-center space-x-2 w-full">
              <ProjectIcon
                iconType={entry.projectIconType}
                iconValue={entry.projectIconValue}
                projectName={entry.projectName}
                projectColor={entry.projectColor}
                className="w-5 h-5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-xs">{entry.taskName}</div>
                <div className="truncate text-xs opacity-80">{entry.projectName}</div>
                <div className="text-xs opacity-70">
                  {formatDurationHuman(entry.duration)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const generateTimeLabels = () => {
    const labels = [];
    for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
      const displayHour = hour > 12 ? hour - 12 : hour;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const timeLabel = `${displayHour === 0 ? 12 : displayHour}${ampm}`;

      labels.push(
        <div
          key={hour}
          className="absolute text-xs text-gray-500 font-medium"
          style={{
            left: `${(hour - START_HOUR) * HOUR_WIDTH}px`,
            top: '10px',
            transform: 'translateX(-50%)'
          }}
        >
          {timeLabel}
        </div>
      );

      // Add hour line
      labels.push(
        <div
          key={`line-${hour}`}
          className="absolute top-8 bottom-0 border-l border-gray-200"
          style={{ left: `${(hour - START_HOUR) * HOUR_WIDTH}px` }}
        />
      );
    }
    return labels;
  };

  // Calculate total time for the day
  const calculateDayTotal = () => {
    const totalSeconds = timeEntries.reduce((sum, entry) => {
      return sum + (entry.duration || 0);
    }, 0);
    return formatDurationHuman(totalSeconds);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-500">Loading timeline...</div>
      </div>
    );
  }

  console.log('Timeline render - Total entries:', timeEntries.length);

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Timeline for {new Date(selectedDate).toLocaleDateString()}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Drag the blue handles to adjust start and end times (snaps to 5-minute intervals)
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Found {timeEntries.length} time entries • Showing 5AM-11PM
              {timeEntries.length === 0 && (
                <span className="text-amber-600 font-medium"> • Start and stop a timer to see entries here</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{calculateDayTotal()}</div>
            <div className="text-sm text-gray-500">Total logged</div>
          </div>
        </div>
      </div>

      <div className="p-4 overflow-x-auto">
        <div
          ref={timelineRef}
          className="relative"
          style={{
            width: `${TIMELINE_HOURS * HOUR_WIDTH}px`,
            height: `${TIMELINE_HEIGHT}px`,
            minWidth: '100%'
          }}
          onClick={(e) => {
            // Clear delete mode when clicking on timeline background
            if (e.target === e.currentTarget) {
              setDeleteMode(null);
            }
          }}
        >
          {/* Time labels and grid lines */}
          {generateTimeLabels()}

          {/* Time entries */}
          {timeEntries.map(renderTimeEntry)}

          {/* Quarter-hour markers */}
          {Array.from({ length: TIMELINE_HOURS * 4 }, (_, i) => (
            <div
              key={`quarter-${i}`}
              className="absolute top-8 bottom-0 border-l border-gray-100"
              style={{ left: `${i * (HOUR_WIDTH / 4)}px` }}
            />
          ))}
        </div>
      </div>

      {/* Undo notification */}
      {deletedEntry && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3">
          <span className="text-sm">Time entry deleted</span>
          <button
            onClick={handleUndo}
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 py-1 rounded transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {/* Drag tooltip */}
      {dragTooltip && (
        <div
          className="fixed z-50 bg-black text-white px-2 py-1 rounded text-sm pointer-events-none"
          style={{
            left: `${dragTooltip.x}px`,
            top: `${dragTooltip.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          {dragTooltip.time}
        </div>
      )}
    </div>
  );
};

export default TimelineView; 