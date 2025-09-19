import React, { useState, useEffect, useRef } from 'react';
import { getTimeEntries, updateTimeEntry, deleteTimeEntry, addManualTimeEntry } from '../services/api';
import { formatHoursHuman, formatDurationHuman, formatNZTime, formatNZTimeRange } from '../utils/timeUtils';
import ProjectIcon from './ProjectIcon';
import TaskSelectionModal from './TaskSelectionModal';
import { useTimer } from '../contexts/TimerContext';

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
  const [hoverPreview, setHoverPreview] = useState(null); // { x, y, startTime, endTime }
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [pendingTimeEntry, setPendingTimeEntry] = useState(null); // { startTime, endTime }
  const [dragPreview, setDragPreview] = useState(null); // For dragging entire entries
  const timelineRef = useRef(null);
  const hasDraggedRef = useRef(false); // Use ref for immediate drag detection

  // Get timer context to register for stop events
  const { registerTimerStopCallback } = useTimer();

  // Timeline constants
  const HOUR_WIDTH = 80; // pixels per hour
  const START_HOUR = 5; // 5 AM (expanded range)
  const END_HOUR = 23; // 11 PM (expanded range)
  const TIMELINE_HOURS = END_HOUR - START_HOUR;
  const SNAP_MINUTES = 5; // Snap to 5-minute increments
  const TIMELINE_HEIGHT = 120; // Height of the timeline track
  const DEFAULT_DURATION_HOURS = 1; // Default 1 hour for new entries

  // Console log to verify component version - only fires once per mount
  useEffect(() => {
    console.log('🕒 TimelineView last updated @ 2025-09-19 19:40 NZ time - Restored original delete mode styling with working functionality');
  }, []);

  useEffect(() => {
    fetchTimeEntries();
  }, [selectedDate]);

  // Register callback to refresh timeline when timer stops
  useEffect(() => {
    const unregister = registerTimerStopCallback(() => {
      console.log('🔄 Timer stopped, refreshing timeline...');
      fetchTimeEntries();
    });

    return unregister; // Cleanup callback on unmount
  }, [registerTimerStopCallback]);

  // Clear delete mode when clicking outside and cleanup drag states
  useEffect(() => {
    const handleClickOutside = () => {
      setDeleteMode(null);
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setDeleteMode(null);
        setDragState(null);
        setDragTooltip(null);
        setDragPreview(null);
        setHasDragged(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
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
      setTimeEntries(prev => [...prev, entry].sort((a, b) => {
        if (!a?.startTime || !b?.startTime) return 0;
        return new Date(a.startTime) - new Date(b.startTime);
      }));
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
      console.log('📥 Fetching time entries for date:', selectedDate);
      const response = await getTimeEntries({ date: selectedDate });
      const entries = response.data || [];
      console.log('📊 Received time entries:', entries.length, 'entries:', entries);

      // Debug each entry in detail
      entries.forEach((entry, index) => {
        console.log(`📋 Entry ${index + 1}:`, {
          timeEntryId: entry.timeEntryId,
          taskName: entry.taskName,
          startTime: entry.startTime,
          endTime: entry.endTime,
          duration: entry.duration,
          startPixels: timeToPixels(entry.startTime),
          endPixels: timeToPixels(entry.endTime),
          projectName: entry.projectName,
          allData: entry
        });
      });

      setTimeEntries(entries);
    } catch (error) {
      console.error('Failed to fetch time entries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert time to pixels from left of timeline
  const timeToPixels = (timeString) => {
    const date = new Date(timeString);
    // Use UTC methods to stay consistent with pixelsToTime which creates UTC dates
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    const pixels = (hours - START_HOUR) * HOUR_WIDTH;

    return pixels;
  };

  // Convert pixels to time
  const pixelsToTime = (pixels) => {
    const hours = START_HOUR + (pixels / HOUR_WIDTH);
    const totalMinutes = Math.round(hours * 60 / SNAP_MINUTES) * SNAP_MINUTES;
    const finalHours = Math.floor(totalMinutes / 60);
    const finalMinutes = totalMinutes % 60;

    // Format time string
    const timeStr = `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}:00`;
    const dateStr = selectedDate; // Assuming selectedDate is YYYY-MM-DD format

    // Create date directly in UTC to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day, finalHours, finalMinutes, 0));

    return utcDate.toISOString();
  };

  // Check for overlaps and find insertion position
  const findInsertionPosition = (startPixels, endPixels, excludeEntryId = null) => {
    const overlappingEntries = timeEntries.filter(entry => {
      if (excludeEntryId && entry.timeEntryId === excludeEntryId) return false;

      const entryStart = timeToPixels(entry.startTime);
      const entryEnd = timeToPixels(entry.endTime);

      // Check if there's any overlap
      return !(endPixels <= entryStart || startPixels >= entryEnd);
    });

    if (overlappingEntries.length === 0) {
      return { startPixels, endPixels };
    }

    // Find the best position to avoid overlaps
    const entryWidth = endPixels - startPixels;

    // Sort by start time
    const sortedEntries = overlappingEntries.sort((a, b) => {
      if (!a?.startTime || !b?.startTime) return 0;
      return timeToPixels(a.startTime) - timeToPixels(b.startTime);
    });

    // Try to place before the first entry
    const firstEntryStart = timeToPixels(sortedEntries[0].startTime);
    if (firstEntryStart >= entryWidth) {
      return {
        startPixels: Math.max(0, firstEntryStart - entryWidth),
        endPixels: firstEntryStart
      };
    }

    // Try to place between entries
    for (let i = 0; i < sortedEntries.length - 1; i++) {
      const currentEnd = timeToPixels(sortedEntries[i].endTime);
      const nextStart = timeToPixels(sortedEntries[i + 1].startTime);
      const gapWidth = nextStart - currentEnd;

      if (gapWidth >= entryWidth) {
        return {
          startPixels: currentEnd,
          endPixels: currentEnd + entryWidth
        };
      }
    }

    // Place after the last entry
    const lastEntryEnd = timeToPixels(sortedEntries[sortedEntries.length - 1].endTime);
    const maxPixels = TIMELINE_HOURS * HOUR_WIDTH;

    if (lastEntryEnd + entryWidth <= maxPixels) {
      return {
        startPixels: lastEntryEnd,
        endPixels: Math.min(maxPixels, lastEntryEnd + entryWidth)
      };
    }

    // If no space found, return original position (will overlap)
    return { startPixels, endPixels };
  };

  // Handle timeline hover for preview
  const handleTimelineMouseMove = (e) => {
    // Don't show preview when dragging, in delete mode, or when modal is open
    if (dragState || dragPreview || deleteMode || showTaskModal) {
      setHoverPreview(null);
      return;
    }

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    const relativeX = e.clientX - timelineRect.left;
    const relativeY = e.clientY - timelineRect.top;

    // Only show preview in the main timeline area (below time labels)
    if (relativeY < 35 || relativeY > TIMELINE_HEIGHT - 10) {
      setHoverPreview(null);
      return;
    }

    // Check if hovering over an existing entry or its drag handles
    const isOverEntry = timeEntries.some(entry => {
      if (!entry?.startTime || !entry?.endTime) return false;
      const startPixels = timeToPixels(entry.startTime);
      const endPixels = timeToPixels(entry.endTime);
      // Include the drag handle areas (5px on each side) and expand Y range slightly
      return relativeX >= startPixels - 5 && relativeX <= endPixels + 5 &&
        relativeY >= 35 && relativeY <= 105;
    });

    if (isOverEntry) {
      setHoverPreview(null);
      return;
    }

    // Calculate 1-hour preview position
    const startPixels = Math.max(0, relativeX - (DEFAULT_DURATION_HOURS * HOUR_WIDTH) / 2);
    const endPixels = Math.min(TIMELINE_HOURS * HOUR_WIDTH, startPixels + (DEFAULT_DURATION_HOURS * HOUR_WIDTH));
    const adjustedStartPixels = endPixels - (DEFAULT_DURATION_HOURS * HOUR_WIDTH);

    const startTime = pixelsToTime(Math.max(0, adjustedStartPixels));
    const endTime = pixelsToTime(endPixels);

    // Create hover preview
    setHoverPreview({
      relativeX,
      startPixels: Math.max(0, adjustedStartPixels),
      endPixels,
      startTime,
      endTime,
      taskSelectionNeeded: true
    });
  };

  // Handle timeline click to create new entry
  const handleTimelineClick = (e) => {
    if (dragState || dragPreview || deleteMode) return;

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    const relativeY = e.clientY - timelineRect.top;

    // Only create entries in the main timeline area
    if (relativeY < 35 || relativeY > TIMELINE_HEIGHT - 10) return;

    // Check if clicking on an existing entry
    const clickedEntry = timeEntries.find(entry => {
      if (!entry?.startTime || !entry?.endTime) return false;
      const startPixels = timeToPixels(entry.startTime);
      const endPixels = timeToPixels(entry.endTime);
      const relativeX = e.clientX - timelineRect.left;
      return relativeX >= startPixels && relativeX <= endPixels &&
        relativeY >= 40 && relativeY <= 100;
    });

    if (clickedEntry) return; // Let the entry handle its own click

    // Create new entry from hover preview
    if (hoverPreview) {
      console.log('👆 Timeline clicked, creating entry from hover preview:', {
        startTime: hoverPreview.startTime,
        endTime: hoverPreview.endTime,
        calculatedDuration: (new Date(hoverPreview.endTime) - new Date(hoverPreview.startTime)) / 1000 / 3600 + ' hours'
      });
      setPendingTimeEntry({
        startTime: hoverPreview.startTime,
        endTime: hoverPreview.endTime
      });
      setShowTaskModal(true);
      setHoverPreview(null);
    }
  };

  // Handle task selection for new entry
  const handleTaskSelected = async (task, startTime, endTime) => {
    try {
      console.log('🆕 Creating new time entry for task:', task.name);
      console.log('📍 Received times:', { startTime, endTime });

      const start = new Date(startTime);
      const end = new Date(endTime);
      const duration = Math.round((end - start) / 1000);

      console.log('📅 Parsed dates:', {
        start: start.toISOString(),
        end: end.toISOString(),
        duration: duration,
        durationHours: duration / 3600
      });

      const newEntry = {
        taskId: task.id,
        startTime,
        endTime,
        duration
      };

      console.log('🔄 Sending new entry data:', newEntry);
      const response = await addManualTimeEntry(newEntry);
      console.log('✅ Create response:', response);

      console.log('🔄 Refreshing timeline...');
      await fetchTimeEntries(); // Refresh to show the new entry
      console.log('✅ Timeline refreshed');

      setShowTaskModal(false);
      setPendingTimeEntry(null);
    } catch (error) {
      console.error('❌ Failed to create time entry:', error);
    }
  };

  // Handle mouse down for dragging (both resize and move)
  const handleMouseDown = (e, entryId, handle) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent entry click
    const entry = timeEntries.find(te => te.timeEntryId === entryId);
    if (!entry) return;

    setHasDragged(false); // Reset drag flag
    hasDraggedRef.current = false; // Reset ref too

    const dragStartData = {
      entryId,
      handle, // 'start', 'end', or 'move'
      startX: e.clientX,
      originalEntry: { ...entry },
      finalEntry: null // Track final calculated position for resize operations
    };

    if (handle === 'move') {
      // Set up move drag preview
      const timelineRect = timelineRef.current?.getBoundingClientRect();
      const entryStartPixels = timeToPixels(entry.startTime);
      const offsetX = e.clientX - timelineRect.left - entryStartPixels;

      console.log('🎯 Setting up move drag preview:', {
        clientX: e.clientX,
        timelineLeft: timelineRect.left,
        entryStartPixels,
        offsetX
      });

      setDragPreview({
        entryId,
        x: e.clientX,
        y: e.clientY,
        offsetX,
        originalEntry: { ...entry }
      });
    }

    setDragState(dragStartData);

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - dragStartData.startX;

      // Mark as dragged if moved more than 5 pixels
      if (Math.abs(deltaX) > 5) {
        setHasDragged(true);
        hasDraggedRef.current = true; // Update ref immediately
      }

      const timelineRect = timelineRef.current?.getBoundingClientRect();
      if (!timelineRect) return;

      let newPixels;
      let newStartPixels, newEndPixels;

      if (handle === 'move') {
        // Moving entire entry
        const originalStartPixels = timeToPixels(dragStartData.originalEntry.startTime);
        const originalEndPixels = timeToPixels(dragStartData.originalEntry.endTime);
        const entryWidth = originalEndPixels - originalStartPixels;

        newStartPixels = originalStartPixels + deltaX;
        newEndPixels = newStartPixels + entryWidth;

        // Ensure within timeline bounds
        if (newStartPixels < 0) {
          newStartPixels = 0;
          newEndPixels = entryWidth;
        }
        if (newEndPixels > TIMELINE_HOURS * HOUR_WIDTH) {
          newEndPixels = TIMELINE_HOURS * HOUR_WIDTH;
          newStartPixels = newEndPixels - entryWidth;
        }

        // Update drag preview position
        setDragPreview(prev => ({
          ...prev,
          x: moveEvent.clientX,
          y: moveEvent.clientY
        }));

      } else if (handle === 'start') {
        newPixels = timeToPixels(dragStartData.originalEntry.startTime) + deltaX;
        newPixels = Math.max(0, Math.min(newPixels, TIMELINE_HOURS * HOUR_WIDTH));
        newStartPixels = newPixels;
        newEndPixels = timeToPixels(dragStartData.originalEntry.endTime);
      } else {
        newPixels = timeToPixels(dragStartData.originalEntry.endTime) + deltaX;
        newPixels = Math.max(0, Math.min(newPixels, TIMELINE_HOURS * HOUR_WIDTH));
        newStartPixels = timeToPixels(dragStartData.originalEntry.startTime);
        newEndPixels = newPixels;
      }

      const newStartTime = pixelsToTime(newStartPixels);
      const newEndTime = pixelsToTime(newEndPixels);

      // Store final calculated position for resize operations
      if (handle !== 'move') {
        const newDuration = Math.round((new Date(newEndTime) - new Date(newStartTime)) / 1000);
        dragStartData.finalEntry = {
          startTime: newStartTime,
          endTime: newEndTime,
          duration: newDuration
        };
      }

      // Update tooltip position and time
      if (timelineRect) {
        const displayTime = handle === 'start' ? formatNZTime(newStartTime) :
          handle === 'end' ? formatNZTime(newEndTime) :
            formatNZTimeRange(newStartTime, newEndTime);

        setDragTooltip({
          x: moveEvent.clientX,
          y: moveEvent.clientY - 40,
          time: displayTime
        });
      }

      // Update local state immediately for smooth dragging (except for move, which uses preview)
      if (handle !== 'move') {
        setTimeEntries(prev => prev.map(te => {
          if (te.timeEntryId === entryId) {
            const updated = { ...te };
            if (handle === 'start') {
              updated.startTime = newStartTime;
              // Ensure start time is before end time
              if (new Date(newStartTime) >= new Date(te.endTime)) {
                return te; // Don't update if invalid
              }
              // Recalculate duration
              const start = new Date(newStartTime);
              const end = new Date(te.endTime);
              updated.duration = Math.round((end - start) / 1000);
            } else {
              updated.endTime = newEndTime;
              // Ensure end time is after start time
              if (new Date(newEndTime) <= new Date(te.startTime)) {
                return te; // Don't update if invalid
              }
              // Recalculate duration
              const start = new Date(te.startTime);
              const end = new Date(newEndTime);
              updated.duration = Math.round((end - start) / 1000);
            }
            return updated;
          }
          return te;
        }));
      }
    };

    const handleMouseUp = async () => {
      console.log('🖱️ Mouse up - drag state:', dragState, 'hasDraggedRef:', hasDraggedRef.current);

      // Always clean up drag state first
      setDragState(null);
      setDragTooltip(null);
      setDragPreview(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Only proceed with update if user actually dragged
      if (!hasDraggedRef.current) {
        console.log('⏭️ No drag detected, skipping update');
        return;
      }

      // Save to backend
      let finalEntry = null;

      if (handle === 'move' && dragPreview) {
        // Calculate final position for moved entry
        const timelineRect = timelineRef.current?.getBoundingClientRect();
        console.log('🎯 Move calculation - timeline rect:', timelineRect);
        console.log('🎯 Move calculation - dragPreview:', dragPreview);

        if (timelineRect) {
          // Calculate the actual position relative to timeline
          const relativeX = dragPreview.x - timelineRect.left;
          const originalWidth = timeToPixels(dragStartData.originalEntry.endTime) - timeToPixels(dragStartData.originalEntry.startTime);

          console.log('🎯 Move calculation - relativeX:', relativeX, 'originalWidth:', originalWidth);

          let finalStartPixels = relativeX - dragPreview.offsetX;
          let finalEndPixels = finalStartPixels + originalWidth;

          console.log('🎯 Move calculation - before bounds check:', { finalStartPixels, finalEndPixels });

          // Ensure within timeline bounds
          if (finalStartPixels < 0) {
            finalStartPixels = 0;
            finalEndPixels = originalWidth;
          }
          if (finalEndPixels > TIMELINE_HOURS * HOUR_WIDTH) {
            finalEndPixels = TIMELINE_HOURS * HOUR_WIDTH;
            finalStartPixels = finalEndPixels - originalWidth;
          }

          console.log('🎯 Move calculation - after bounds check:', { finalStartPixels, finalEndPixels });

          const newStartTime = pixelsToTime(finalStartPixels);
          const newEndTime = pixelsToTime(finalEndPixels);
          const newDuration = Math.round((new Date(newEndTime) - new Date(newStartTime)) / 1000);

          console.log('🎯 Move calculation - final times:', { newStartTime, newEndTime, newDuration });

          finalEntry = {
            startTime: newStartTime,
            endTime: newEndTime,
            duration: newDuration
          };
        }
      } else {
        // Resize operation - use the final calculated position
        finalEntry = dragStartData.finalEntry;
      }

      if (finalEntry && dragStartData) {
        console.log('📊 Final entry data:', finalEntry);
        console.log('📊 Drag start data:', dragStartData.originalEntry);

        // Check if the data actually changed
        const original = dragStartData.originalEntry;
        const hasChanged =
          finalEntry.startTime !== original.startTime ||
          finalEntry.endTime !== original.endTime ||
          finalEntry.duration !== original.duration;

        console.log('🔍 Has changed?', hasChanged);

        if (!hasChanged) {
          console.log('⏭️ No changes detected, skipping update');
          return;
        }

        try {
          console.log('🔄 Updating time entry:', entryId, 'with data:', finalEntry);
          console.log('📝 Original:', {
            startTime: original.startTime,
            endTime: original.endTime,
            duration: original.duration
          });
          const response = await updateTimeEntry(entryId, finalEntry);
          console.log('✅ Update response:', response);

          // Refresh from server to ensure consistency for move operations
          if (handle === 'move') {
            console.log('🔄 Refreshing timeline after move operation...');
            await fetchTimeEntries();
          }
          console.log('✅ Drag update completed');
        } catch (error) {
          console.error('❌ Failed to update time entry:', error);
          // Revert on error
          setTimeEntries(prev => prev.map(te =>
            te.timeEntryId === entryId ? dragStartData.originalEntry : te
          ));
        }
      } else {
        console.log('❌ Missing finalEntry or dragStartData:', { finalEntry, dragStartData });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const renderTimeEntry = (entry) => {
    if (!entry || !entry.endTime || !entry.startTime) {
      console.warn('🚫 Invalid entry in renderTimeEntry:', entry);
      return null;
    }

    // Don't render the entry being drag-previewed
    if (dragPreview && dragPreview.entryId === entry.timeEntryId) {
      return null;
    }

    const startPixels = timeToPixels(entry.startTime);
    const endPixels = timeToPixels(entry.endTime);
    const width = endPixels - startPixels;

    // Don't render if outside visible timeline
    if (startPixels > TIMELINE_HOURS * HOUR_WIDTH || endPixels < 0) {
      return null;
    }

    const isInDeleteMode = deleteMode === entry.timeEntryId;
    const projectColor = entry.projectColor || '#6366f1'; // Default blue
    const textColor = getOptimalTextColor(projectColor);

    // Determine layout based on width
    const showOnlyIcon = width < 50;
    const showIconAndTask = width >= 50 && width < 150;
    const showFullInfo = width >= 150;

    const handleEntryMouseDown = (e) => {
      e.stopPropagation();
      e.preventDefault(); // Also prevent default to stop any other event handling
      console.log('🖱️ Entry mouse down on', entry.taskName);

      // Don't trigger if clicking on drag handles (only left and right edges now)
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const handleSize = 3; // Match the actual handle width
      const isOnLeftHandle = relativeX <= handleSize;
      const isOnRightHandle = relativeX >= rect.width - handleSize;

      if (isOnLeftHandle || isOnRightHandle) {
        console.log('🚫 Clicked on drag handle, ignoring');
        return;
      }

      // If in delete mode, handle delete immediately
      if (isInDeleteMode) {
        console.log('🗑️ Entry in delete mode, deleting immediately');
        handleDelete(entry);
        return;
      }

      // Set up for potential drag or click
      const startX = e.clientX;
      const startY = e.clientY;
      const startTime = Date.now();
      let hasMoved = false;
      console.log('👆 Setting up click/drag detection at', startX, startY);

      const handleMouseMove = (moveEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);

        // If moved more than 10 pixels, start dragging
        if (!hasMoved && (deltaX > 10 || deltaY > 10)) {
          hasMoved = true;
          console.log('🏃 Movement detected, delta:', deltaX, deltaY, 'switching to drag mode');
          // Clean up these temporary listeners first
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);

          // Manually set up the drag state instead of creating a fake event
          setHasDragged(false);
          hasDraggedRef.current = false;

          const timelineRect = timelineRef.current?.getBoundingClientRect();
          const entryStartPixels = timeToPixels(entry.startTime);
          const offsetX = startX - timelineRect.left - entryStartPixels;

          console.log('🎯 Manual drag setup:', {
            startX, startY,
            timelineLeft: timelineRect.left,
            entryStartPixels,
            offsetX
          });

          const dragStartData = {
            entryId: entry.timeEntryId,
            handle: 'move',
            startX: startX,
            originalEntry: { ...entry },
            finalEntry: null
          };

          setDragPreview({
            entryId: entry.timeEntryId,
            x: startX,
            y: startY,
            offsetX,
            originalEntry: { ...entry }
          });

          setDragState(dragStartData);

          // Set up the main drag handlers
          const handleMainMouseMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - dragStartData.startX;

            // Mark as dragged if moved more than 5 pixels
            if (Math.abs(deltaX) > 5) {
              setHasDragged(true);
              hasDraggedRef.current = true;
            }

            // Update drag preview position
            setDragPreview(prev => ({
              ...prev,
              x: moveEvent.clientX,
              y: moveEvent.clientY
            }));

            // Update tooltip
            const relativeX = moveEvent.clientX - timelineRect.left;
            const originalWidth = timeToPixels(entry.endTime) - timeToPixels(entry.startTime);
            let newStartPixels = relativeX - offsetX;
            let newEndPixels = newStartPixels + originalWidth;

            // Bounds check
            if (newStartPixels < 0) {
              newStartPixels = 0;
              newEndPixels = originalWidth;
            }
            if (newEndPixels > TIMELINE_HOURS * HOUR_WIDTH) {
              newEndPixels = TIMELINE_HOURS * HOUR_WIDTH;
              newStartPixels = newEndPixels - originalWidth;
            }

            const newStartTime = pixelsToTime(newStartPixels);
            const newEndTime = pixelsToTime(newEndPixels);
            const displayTime = formatNZTimeRange(newStartTime, newEndTime);

            setDragTooltip({
              x: moveEvent.clientX,
              y: moveEvent.clientY - 40,
              time: displayTime
            });
          };

          const handleMainMouseUp = async () => {
            console.log('🖱️ Main mouse up - hasDraggedRef:', hasDraggedRef.current);

            // Clean up
            setDragState(null);
            setDragTooltip(null);
            setDragPreview(null);
            document.removeEventListener('mousemove', handleMainMouseMove);
            document.removeEventListener('mouseup', handleMainMouseUp);

            // Only proceed with update if user actually dragged
            if (!hasDraggedRef.current) {
              console.log('⏭️ No drag detected in main handler, skipping update');
              return;
            }

            // Calculate final position for moved entry
            const currentEvent = moveEvent || { clientX: startX, clientY: startY };
            const relativeX = currentEvent.clientX - timelineRect.left;
            const originalWidth = timeToPixels(entry.endTime) - timeToPixels(entry.startTime);

            let finalStartPixels = relativeX - offsetX;
            let finalEndPixels = finalStartPixels + originalWidth;

            // Bounds check
            if (finalStartPixels < 0) {
              finalStartPixels = 0;
              finalEndPixels = originalWidth;
            }
            if (finalEndPixels > TIMELINE_HOURS * HOUR_WIDTH) {
              finalEndPixels = TIMELINE_HOURS * HOUR_WIDTH;
              finalStartPixels = finalEndPixels - originalWidth;
            }

            const newStartTime = pixelsToTime(finalStartPixels);
            const newEndTime = pixelsToTime(finalEndPixels);
            const newDuration = Math.round((new Date(newEndTime) - new Date(newStartTime)) / 1000);

            const finalEntry = {
              startTime: newStartTime,
              endTime: newEndTime,
              duration: newDuration
            };

            console.log('🎯 Final move calculation:', finalEntry);

            try {
              console.log('🔄 Updating time entry:', entry.timeEntryId, 'with move data:', finalEntry);
              const response = await updateTimeEntry(entry.timeEntryId, finalEntry);
              console.log('✅ Move update response:', response);

              // Update the local state with the new entry data instead of full refresh
              console.log('🔄 Updating local state after move operation...');
              setTimeEntries(prev => prev.map(te =>
                te.timeEntryId === entry.timeEntryId ? { ...te, ...finalEntry } : te
              ));
              console.log('✅ Move operation completed');
            } catch (error) {
              console.error('❌ Failed to update time entry:', error);
              // Revert on error
              setTimeEntries(prev => prev.map(te =>
                te.timeEntryId === entry.timeEntryId ? entry : te
              ));
            }
          };

          // Store the current mouse event for the mouseup handler
          let moveEvent = null;
          const trackingWrapper = (e) => {
            moveEvent = e;
            handleMainMouseMove(e);
          };

          document.addEventListener('mousemove', trackingWrapper);
          document.addEventListener('mouseup', handleMainMouseUp);

          console.log('🎯 Manual drag handlers attached');
        }
      };

      const handleMouseUp = () => {
        const duration = Date.now() - startTime;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // If we didn't move, treat as click for delete mode
        if (!hasMoved) {
          console.log('👆 Detected click (no movement) after', duration, 'ms - entering delete mode for entry', entry.timeEntryId);
          setDeleteMode(entry.timeEntryId);
          console.log('🗑️ Delete mode state set to:', entry.timeEntryId);
          setTimeout(() => {
            console.log('⏰ Auto-clearing delete mode after 3 seconds');
            setDeleteMode(null);
          }, 3000); // Auto exit after 3 seconds
        } else {
          console.log('🏃 Detected drag (had movement) - not entering delete mode');
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    const handleDragAreaMouseDown = (e, handle) => {
      e.stopPropagation();
      // Reset drag state
      setHasDragged(false);
      hasDraggedRef.current = false;
      handleMouseDown(e, entry.timeEntryId, handle);
    };

    return (
      <div
        key={entry.timeEntryId}
        data-entry-id={entry.timeEntryId}
        className={`absolute rounded-lg shadow-sm z-10 group transition-all duration-200 cursor-pointer
          ${isInDeleteMode ? 'ring-4 ring-red-500 bg-red-100 border-2 border-red-600' : 'hover:shadow-md'}`}
        style={{
          left: `${Math.max(0, startPixels)}px`,
          width: `${Math.max(40, width)}px`,
          top: '40px',
          height: '60px',
          backgroundColor: isInDeleteMode ? 'transparent' : projectColor,
        }}
        onMouseDown={handleEntryMouseDown}
      >
        {/* Delete mode overlay - positioned absolutely over entire entry */}
        {isInDeleteMode && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500 text-white rounded-lg font-bold text-sm z-50 border-2 border-red-700 pointer-events-auto">
            🗑️ DELETE?
          </div>
        )}

        {/* Content based on width - pointer-events-none to allow drag handles to work, hidden when in delete mode */}
        <div className={`p-2 h-full flex items-center ${textColor} pointer-events-none relative z-10 ${isInDeleteMode ? 'invisible' : ''}`}>
          {showOnlyIcon ? (
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

        {/* Drag areas - only show when not in delete mode */}
        {!isInDeleteMode && (
          <>
            {/* Start drag area for resizing */}
            <div
              className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-40 bg-blue-500 opacity-0 hover:opacity-50 transition-opacity"
              onMouseDown={(e) => handleDragAreaMouseDown(e, 'start')}
              title="Drag to change start time"
            />

            {/* End drag area for resizing */}
            <div
              className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-40 bg-blue-500 opacity-0 hover:opacity-50 transition-opacity"
              onMouseDown={(e) => handleDragAreaMouseDown(e, 'end')}
              title="Drag to change end time"
            />

            {/* Remove the conflicting center drag area - let the main entry handle click/drag */}
          </>
        )}
      </div>
    );
  };

  // Render drag preview for moving entries
  const renderDragPreview = () => {
    if (!dragPreview || !dragPreview.originalEntry) return null;

    const entry = dragPreview.originalEntry;
    const width = timeToPixels(entry.endTime) - timeToPixels(entry.startTime);
    const projectColor = entry.projectColor || '#6366f1';
    const textColor = getOptimalTextColor(projectColor);

    return (
      <div
        className="absolute rounded-lg shadow-lg z-50 opacity-60 pointer-events-none border-2 border-blue-400"
        style={{
          left: `${dragPreview.x}px`,
          top: `${dragPreview.y}px`,
          width: `${Math.max(40, width)}px`,
          height: '60px',
          backgroundColor: projectColor,
        }}
      >
        <div className={`p-2 h-full flex items-center ${textColor}`}>
          <ProjectIcon
            iconType={entry.projectIconType}
            iconValue={entry.projectIconValue}
            projectName={entry.projectName}
            projectColor={entry.projectColor}
            className="w-5 h-5 flex-shrink-0"
          />
          <div className="flex-1 min-w-0 ml-2">
            <div className="font-medium truncate text-xs">{entry.taskName}</div>
          </div>
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

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Timeline for {new Date(selectedDate).toLocaleDateString()}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Drag blue handles to resize • Drag entries to move • Click empty areas to create • Click entries to delete
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
          className="relative cursor-crosshair"
          style={{
            width: `${TIMELINE_HOURS * HOUR_WIDTH}px`,
            height: `${TIMELINE_HEIGHT}px`,
            minWidth: '100%'
          }}
          onMouseMove={handleTimelineMouseMove}
          onMouseLeave={() => setHoverPreview(null)}
          onClick={handleTimelineClick}
        >
          {/* Time labels and grid lines */}
          {generateTimeLabels()}

          {/* Hover preview for new entries */}
          {hoverPreview && (
            <div
              className="absolute rounded-lg border-2 border-dashed border-blue-400 bg-blue-100 opacity-50 z-5"
              style={{
                left: `${hoverPreview.startPixels}px`,
                width: `${hoverPreview.endPixels - hoverPreview.startPixels}px`,
                top: '40px',
                height: '60px',
              }}
            >
              <div className="p-2 h-full flex items-center justify-center text-blue-600 text-xs font-medium">
                Click to create 1h task
              </div>
            </div>
          )}

          {/* Time entries */}
          {timeEntries.map(renderTimeEntry)}

          {/* Drag preview */}
          {renderDragPreview()}

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

      {/* Task Selection Modal */}
      <TaskSelectionModal
        isOpen={showTaskModal}
        onClose={() => {
          setShowTaskModal(false);
          setPendingTimeEntry(null);
        }}
        onSelectTask={handleTaskSelected}
        startTime={pendingTimeEntry?.startTime}
        endTime={pendingTimeEntry?.endTime}
      />

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

      {/* Drag preview for move operations */}
      {dragPreview && dragPreview.originalEntry && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${dragPreview.x}px`,
            top: `${dragPreview.y}px`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {(() => {
            const entry = dragPreview.originalEntry;
            if (!entry?.startTime || !entry?.endTime) {
              console.warn('🚫 Invalid dragPreview entry:', entry);
              return null;
            }
            const startPixels = timeToPixels(entry.startTime);
            const endPixels = timeToPixels(entry.endTime);
            const width = endPixels - startPixels;
            const projectColor = entry.projectColor || '#6b7280';
            const textColor = getOptimalTextColor(projectColor);

            return (
              <div
                className="rounded-lg shadow-lg border-2 border-blue-400 opacity-80"
                style={{
                  width: `${Math.max(40, width)}px`,
                  height: '60px',
                  backgroundColor: projectColor,
                }}
              >
                <div className={`p-2 h-full flex items-center ${textColor} text-sm font-medium`}>
                  {entry.taskName}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default TimelineView; 