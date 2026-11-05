// TimelineView version log
// v1.6 — Click an entry to select it (ring highlight) instead of arming delete; a floating
//        Resume / Delete bar sits below the selected entry (outside it, so tiny entries work
//        too). Resume starts a new timer for the same task. The track is taller to leave room
//        for the bar. Delete undo now uses the shared toast (ToastContext.showUndo).
//        Click outside or Esc deselects without creating an entry. Resize handles scale with
//        entry width (2–12px) — fixed 12px handles used to cover entries under ~24px entirely.
// v1.5 — Timezone-aware: timestamps are real UTC, positions/labels use the configured display
//        zone (hoursIntoDay/localTimeToIso); entries that cross local midnight are split by the
//        server, so refetch when a create/update response says `split`; new `refreshToken` and
//        `onEntriesChanged` props keep the home page's entries list and the timeline in sync;
//        the now-line re-evaluates "is today" on every tick so it disappears after midnight
// v1.4 — Styling only: outer container aligned to the app card language
//        (rounded-xl + border-gray-200 + shadow-sm); no behavior changes
// v1.3 — Zoomable timeline: Ctrl/Cmd+scroll (cursor-anchored) or header buttons, 20–240px/hr;
//        snap increments scale with zoom; sub-28px entries render as a bar with the icon above;
//        loading screen only on first load (refetches no longer unmount the timeline)
// v1.2 — Render the running timer as a live breathing entry that grows in real time;
//        refresh entries on timer start as well as stop (auto-stopped timers appear immediately)
// v1.1 — Fix stuck drag tooltip after moving an entry (mouseup removed the wrong
//        mousemove listener: handleMainMouseMove instead of the attached trackingWrapper)
// v1.0 — Baseline: drag/resize/create/delete entries, hover preview, current-time line

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { getTimeEntries, updateTimeEntry, deleteTimeEntry, addManualTimeEntry } from '../services/api';
import { formatHoursHuman, formatDurationHuman, formatTime, formatTimeRange, getLocalDateString, getLocalHoursDecimal, hoursIntoDay, localTimeToIso, formatDateString, formatTimerDisplay } from '../utils/timeUtils';
import ProjectIcon from './ProjectIcon';
import TaskSelectionModal from './TaskSelectionModal';
import { useTimer } from '../contexts/TimerContext';
import { useToast } from '../contexts/ToastContext';
import { PlayIcon, TrashIcon } from '@heroicons/react/24/solid';

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

// refreshToken: bump to force a refetch (e.g. after the home page deletes an entry)
// onEntriesChanged: called after this component creates/updates/deletes an entry
const TimelineView = ({ selectedDate = getLocalDateString(), refreshToken = 0, onEntriesChanged }) => {

  const [timeEntries, setTimeEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dragState, setDragState] = useState(null);
  const [selectedEntryId, setSelectedEntryId] = useState(null); // Entry showing the Resume/Delete bar
  const selectedEntryIdRef = useRef(null); // Mirror for the document-level listeners
  selectedEntryIdRef.current = selectedEntryId;
  const suppressNextClickRef = useRef(false); // The click that deselects must not also create an entry
  const [dragTooltip, setDragTooltip] = useState(null); // { x, y, time }
  const [hasDragged, setHasDragged] = useState(false); // Track if user has dragged
  const [hoverPreview, setHoverPreview] = useState(null); // { x, y, startTime, endTime }
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [pendingTimeEntry, setPendingTimeEntry] = useState(null); // { startTime, endTime }
  const [dragPreview, setDragPreview] = useState(null); // For dragging entire entries
  const timelineRef = useRef(null);
  const hasDraggedRef = useRef(false); // Use ref for immediate drag detection

  // Get timer context: change events for refreshing, active timer for the live entry
  const { registerTimerChangeCallback, activeTimerDetails, elapsedTime, startTimer } = useTimer();
  const { showUndo, showError } = useToast();

  // Timeline constants
  const ZOOM_LEVELS = [20, 30, 40, 60, 80, 120, 160, 240]; // pixels per hour
  const DEFAULT_ZOOM_INDEX = 4; // 80px/hr
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const HOUR_WIDTH = ZOOM_LEVELS[zoomIndex]; // pixels per hour (zoom-dependent)
  const START_HOUR = 0; // 12 AM (midnight)
  const END_HOUR = 23; // 11 PM
  const TIMELINE_HOURS = END_HOUR - START_HOUR + 1; // Include hour 23 (11 PM to midnight)
  // Snap step scales with zoom: finest increment that still spans ≥4px of mouse travel
  const SNAP_MINUTES = [1, 5, 10, 15, 30].find(m => (HOUR_WIDTH / 60) * m >= 4) || 30;
  // Vertical layout of the track: hour labels on top, entries at ENTRY_TOP..ENTRY_BOTTOM,
  // then room for the selected entry's floating action bar
  const ENTRY_TOP = 40;
  const ENTRY_HEIGHT = 60;
  const ENTRY_BOTTOM = ENTRY_TOP + ENTRY_HEIGHT;
  const ENTRY_ZONE_BOTTOM = ENTRY_BOTTOM + 10; // hover/click-to-create area ends here
  const ACTION_BAR_TOP = ENTRY_BOTTOM + 8;
  const ACTION_BAR_HALF_WIDTH = 92; // ≈ half the Resume+Delete bar, for edge clamping
  const TIMELINE_HEIGHT = 152; // Height of the timeline track
  const DEFAULT_DURATION_HOURS = 1; // Default 1 hour for new entries

  const scrollContainerRef = useRef(null);
  const pendingZoomAnchor = useRef(null); // { timeHours, offsetX } — keeps this time under the cursor across a zoom
  const applyZoomRef = useRef(null);

  const applyZoom = (newIndex, anchorClientX = null) => {
    const clamped = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, newIndex));
    if (clamped === zoomIndex) return;
    const container = scrollContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const offsetX = anchorClientX !== null ? anchorClientX - rect.left : rect.width / 2;
      pendingZoomAnchor.current = {
        timeHours: (container.scrollLeft + offsetX) / HOUR_WIDTH,
        offsetX,
      };
    }
    setZoomIndex(clamped);
  };
  applyZoomRef.current = applyZoom;

  // Restore scroll so the anchored time stays put after the zoom re-render
  useLayoutEffect(() => {
    const anchor = pendingZoomAnchor.current;
    const container = scrollContainerRef.current;
    if (anchor && container) {
      container.scrollLeft = anchor.timeHours * HOUR_WIDTH - anchor.offsetX;
      pendingZoomAnchor.current = null;
    }
  }, [zoomIndex]);

  const [currentTimePixels, setCurrentTimePixels] = useState(null);

  // Update current time indicator every 30 seconds
  useEffect(() => {
    const updateCurrentTime = () => {
      // Re-evaluated every tick so the line vanishes once midnight passes
      if (selectedDate !== getLocalDateString()) { setCurrentTimePixels(null); return; }
      setCurrentTimePixels((getLocalHoursDecimal() - START_HOUR) * HOUR_WIDTH);
    };
    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 30000);
    return () => clearInterval(interval);
  }, [selectedDate, HOUR_WIDTH]);

  const zoomIndexRef = useRef(zoomIndex);
  zoomIndexRef.current = zoomIndex;

  // Ctrl/Cmd + scroll to zoom, anchored on the cursor (native listener: React's
  // onWheel can't preventDefault reliably)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyZoomRef.current(zoomIndexRef.current + (e.deltaY < 0 ? 1 : -1), e.clientX);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [isLoading]);

  useEffect(() => {
    fetchTimeEntries();
  }, [selectedDate, refreshToken]);

  // Register callback to refresh timeline when a timer starts or stops
  useEffect(() => {
    const unregister = registerTimerChangeCallback(() => {
      console.log('🔄 Timer changed, refreshing timeline...');
      fetchTimeEntries();
    });

    return unregister; // Cleanup callback on unmount
  }, [registerTimerChangeCallback]);

  // Deselect when clicking outside (entries and the action bar stop propagation) and cleanup drag states
  useEffect(() => {
    const handleClickOutside = () => {
      if (selectedEntryIdRef.current === null) return;
      suppressNextClickRef.current = true; // this click only deselects
      setSelectedEntryId(null);
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setSelectedEntryId(null);
        setDragState(null);
        setDragTooltip(null);
        setDragPreview(null);
        setHasDragged(false);
      }
    };

    // Document click runs after React's handlers, so the suppress flag only ever
    // covers the click that belongs to the deselecting mousedown
    const resetSuppress = () => { suppressNextClickRef.current = false; };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('click', resetSuppress);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('click', resetSuppress);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleDelete = async (entry) => {
    try {
      // Remove from UI immediately
      setTimeEntries(prev => prev.filter(te => te.timeEntryId !== entry.timeEntryId));
      setSelectedEntryId(null);

      // Delete from backend
      await deleteTimeEntry(entry.timeEntryId);
      onEntriesChanged?.();

      // Undo re-creates the entry (it gets a new id, so refetch)
      showUndo(`Deleted ${entry.taskName} (${formatDurationHuman(entry.duration)})`, async () => {
        try {
          await addManualTimeEntry({
            taskId: entry.taskId,
            startTime: entry.startTime,
            endTime: entry.endTime,
            duration: entry.duration,
            billId: entry.billId ?? null // billed time stays billed
          });
          fetchTimeEntries();
          onEntriesChanged?.();
        } catch (error) {
          console.error('Failed to undo delete:', error);
          showError('Failed to restore entry');
        }
      });
    } catch (error) {
      console.error('Failed to delete time entry:', error);
      showError('Failed to delete entry');
      // Restore entry on error
      setTimeEntries(prev => [...prev, entry].sort((a, b) => {
        if (!a?.startTime || !b?.startTime) return 0;
        return new Date(a.startTime) - new Date(b.startTime);
      }));
    }
  };

  // Start a fresh timer on the selected entry's task (auto-stops any running timer;
  // the timer-change callback refetches the timeline so the live entry appears)
  const handleResume = (entry) => {
    setSelectedEntryId(null);
    startTimer(entry.taskId, entry.taskName, entry.projectName);
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
    // Hours from local midnight of the selected day in the display timezone.
    // Midnight at the end of the day reads as 24 so an entry ending at midnight
    // reaches the right edge instead of wrapping to 0.
    const hours = hoursIntoDay(timeString, selectedDate);
    return (hours - START_HOUR) * HOUR_WIDTH;
  };

  // Convert pixels to time
  const pixelsToTime = (pixels) => {
    const hours = START_HOUR + (pixels / HOUR_WIDTH);
    const totalMinutes = Math.round(hours * 60 / SNAP_MINUTES) * SNAP_MINUTES;
    const finalHours = Math.floor(totalMinutes / 60);
    const finalMinutes = totalMinutes % 60;

    // Wall-clock hh:mm on the selected day in the display timezone → UTC instant
    // (hour 24 = midnight at the end of the day)
    return localTimeToIso(selectedDate, finalHours, finalMinutes);
  };

  // Effective right edge of an entry in pixels — running entries grow to "now"
  const getEntryEndPixels = (entry) => {
    if (entry.endTime) return timeToPixels(entry.endTime);
    const startPixels = timeToPixels(entry.startTime);
    if (activeTimerDetails?.timeEntryId === entry.timeEntryId) {
      return startPixels + (elapsedTime / 3600) * HOUR_WIDTH;
    }
    if (currentTimePixels !== null) return Math.max(startPixels, currentTimePixels);
    return startPixels;
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
    // Don't show preview when dragging, while an entry is selected, or when modal is open
    if (dragState || dragPreview || selectedEntryId || showTaskModal) {
      setHoverPreview(null);
      return;
    }

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    const relativeX = e.clientX - timelineRect.left;
    const relativeY = e.clientY - timelineRect.top;

    // Only show preview in the main timeline area (below time labels)
    if (relativeY < 35 || relativeY > ENTRY_ZONE_BOTTOM) {
      setHoverPreview(null);
      return;
    }

    // Check if hovering over an existing entry or its drag handles
    const isOverEntry = timeEntries.some(entry => {
      if (!entry?.startTime) return false;
      const startPixels = timeToPixels(entry.startTime);
      const endPixels = getEntryEndPixels(entry);
      // Include the drag handle areas (5px on each side) and expand Y range slightly
      return relativeX >= startPixels - 5 && relativeX <= endPixels + 5 &&
        relativeY >= 35 && relativeY <= ENTRY_BOTTOM + 5;
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
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (dragState || dragPreview || selectedEntryId) return;

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    const relativeY = e.clientY - timelineRect.top;

    // Only create entries in the main timeline area
    if (relativeY < 35 || relativeY > ENTRY_ZONE_BOTTOM) return;

    // Check if clicking on an existing entry
    const clickedEntry = timeEntries.find(entry => {
      if (!entry?.startTime) return false;
      const startPixels = timeToPixels(entry.startTime);
      const endPixels = getEntryEndPixels(entry);
      const relativeX = e.clientX - timelineRect.left;
      return relativeX >= startPixels && relativeX <= endPixels &&
        relativeY >= ENTRY_TOP && relativeY <= ENTRY_BOTTOM;
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

      if (response.data?.split) {
        console.log('🌙 Entry crossed midnight and was split into', response.data.entries?.length, 'entries');
      }
      console.log('🔄 Refreshing timeline...');
      await fetchTimeEntries(); // Refresh to show the new entry
      onEntriesChanged?.();
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
        const displayTime = handle === 'start' ? formatTime(newStartTime) :
          handle === 'end' ? formatTime(newEndTime) :
            formatTimeRange(newStartTime, newEndTime);

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

          // Refresh from server for moves, and whenever the server split the
          // entry at midnight (the local row no longer matches what's stored)
          if (handle === 'move' || response.data?.split) {
            console.log('🔄 Refreshing timeline after update...');
            await fetchTimeEntries();
          }
          onEntriesChanged?.();
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

  // Render the currently running timer as a live, breathing, non-interactive entry
  const renderActiveEntry = (entry) => {
    const startPixels = timeToPixels(entry.startTime);
    const endPixels = getEntryEndPixels(entry);
    const width = Math.max(24, endPixels - startPixels);

    if (startPixels > TIMELINE_HOURS * HOUR_WIDTH || endPixels < 0) return null;

    const projectColor = entry.projectColor || '#6366f1';
    const textColor = getOptimalTextColor(projectColor);
    const isThisActive = activeTimerDetails?.timeEntryId === entry.timeEntryId;
    const liveSeconds = isThisActive
      ? elapsedTime
      : Math.max(0, Math.round(((endPixels - startPixels) / HOUR_WIDTH) * 3600));
    const showText = width >= 90;

    return (
      <div
        key={entry.timeEntryId}
        data-entry-id={entry.timeEntryId}
        className="absolute rounded-lg shadow-md z-10 pointer-events-none animate-timeline-breathe"
        style={{
          left: `${Math.max(0, startPixels)}px`,
          width: `${width}px`,
          top: '40px',
          height: '60px',
          backgroundColor: projectColor,
        }}
      >
        <div className={`p-2 h-full flex items-center ${textColor}`}>
          {showText ? (
            <div className="flex items-center space-x-2 w-full">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <ProjectIcon
                iconType={entry.projectIconType}
                iconValue={entry.projectIconValue}
                projectName={entry.projectName}
                projectColor={entry.projectColor}
                className="w-5 h-5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-xs">{entry.taskName}</div>
                <div className="text-xs opacity-80 tabular-nums">{formatTimerDisplay(liveSeconds)}</div>
              </div>
            </div>
          ) : (
            <div className="w-full flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTimeEntry = (entry) => {
    if (!entry || !entry.startTime) {
      console.warn('🚫 Invalid entry in renderTimeEntry:', entry);
      return null;
    }

    // Running entry (no endTime yet) renders as the live breathing entry
    if (!entry.endTime) {
      return renderActiveEntry(entry);
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

    const isSelected = selectedEntryId === entry.timeEntryId;
    const projectColor = entry.projectColor || '#6366f1'; // Default blue
    const textColor = getOptimalTextColor(projectColor);

    // Determine layout based on width
    const showIconAbove = width < 28; // Too narrow to hold the icon — float it above the bar
    const showOnlyIcon = width >= 28 && width < 50;
    const showIconAndTask = width >= 50 && width < 150;
    const showFullInfo = width >= 150;
    // Resize handles shrink on narrow entries so the middle stays clickable (select/move)
    const handleWidth = Math.min(12, Math.max(2, Math.floor(Math.max(8, width) / 4)));

    const handleEntryMouseDown = (e) => {
      e.stopPropagation();
      e.preventDefault(); // Also prevent default to stop any other event handling
      console.log('🖱️ Entry mouse down on', entry.taskName);

      // Don't trigger if clicking on drag handles (only left and right edges now)
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const handleSize = handleWidth; // Match the actual handle width
      const isOnLeftHandle = relativeX <= handleSize;
      const isOnRightHandle = relativeX >= rect.width - handleSize;

      if (isOnLeftHandle || isOnRightHandle) {
        console.log('🚫 Clicked on drag handle, ignoring');
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
            const displayTime = formatTimeRange(newStartTime, newEndTime);

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
            document.removeEventListener('mousemove', trackingWrapper);
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

              if (response.data?.split) {
                // Server split the entry at midnight — local row no longer matches
                console.log('🌙 Move crossed midnight, refetching split entries...');
                await fetchTimeEntries();
              } else {
                // Update the local state with the new entry data instead of full refresh
                console.log('🔄 Updating local state after move operation...');
                setTimeEntries(prev => prev.map(te =>
                  te.timeEntryId === entry.timeEntryId ? { ...te, ...finalEntry } : te
                ));
              }
              onEntriesChanged?.();
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

        // If we didn't move, it's a click: toggle selection (shows the Resume/Delete bar)
        if (!hasMoved) {
          console.log('👆 Detected click (no movement) after', duration, 'ms - toggling selection for entry', entry.timeEntryId);
          setSelectedEntryId(prev => (prev === entry.timeEntryId ? null : entry.timeEntryId));
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
        className={`absolute rounded-lg group transition-shadow duration-200 cursor-pointer
          ${isSelected ? 'z-20 shadow-lg ring-2 ring-gray-900 ring-offset-2' : 'z-10 shadow-sm hover:shadow-md'}`}
        style={{
          left: `${Math.max(0, startPixels)}px`,
          width: `${Math.max(8, width)}px`,
          top: `${ENTRY_TOP}px`,
          height: `${ENTRY_HEIGHT}px`,
          backgroundColor: projectColor,
        }}
        onMouseDown={handleEntryMouseDown}
        aria-pressed={isSelected}
      >
        {/* Icon floated above the bar when the entry is too narrow to hold it */}
        {showIconAbove && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-none z-20">
            <ProjectIcon
              iconType={entry.projectIconType}
              iconValue={entry.projectIconValue}
              projectName={entry.projectName}
              projectColor={entry.projectColor}
              className="w-5 h-5"
            />
          </div>
        )}

        {/* Content based on width - pointer-events-none to allow drag handles to work */}
        <div className={`p-2 h-full flex items-center ${textColor} pointer-events-none relative z-10 ${showIconAbove ? 'invisible' : ''}`}>
          {showOnlyIcon || showIconAbove ? (
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

        {/* Start drag area for resizing */}
        <div
          className="absolute left-0 top-0 bottom-0 cursor-col-resize z-40 bg-blue-500 opacity-0 hover:opacity-50 transition-opacity"
          style={{ width: `${handleWidth}px` }}
          onMouseDown={(e) => handleDragAreaMouseDown(e, 'start')}
          title="Drag to change start time"
        />

        {/* End drag area for resizing */}
        <div
          className="absolute right-0 top-0 bottom-0 cursor-col-resize z-40 bg-blue-500 opacity-0 hover:opacity-50 transition-opacity"
          style={{ width: `${handleWidth}px` }}
          onMouseDown={(e) => handleDragAreaMouseDown(e, 'end')}
          title="Drag to change end time"
        />
      </div>
    );
  };

  // Floating Resume / Delete bar below the selected entry. Always outside the entry
  // so it works for entries too narrow to hold buttons; centred under it and
  // clamped so it never runs off either end of the track.
  const renderSelectionActions = () => {
    if (!selectedEntryId || dragState || dragPreview) return null;
    const entry = timeEntries.find(te => te.timeEntryId === selectedEntryId);
    if (!entry || !entry.endTime) return null;

    const startPixels = timeToPixels(entry.startTime);
    const endPixels = timeToPixels(entry.endTime);
    const trackWidth = TIMELINE_HOURS * HOUR_WIDTH;
    const center = Math.min(
      Math.max((startPixels + Math.max(8, endPixels - startPixels) / 2), ACTION_BAR_HALF_WIDTH),
      trackWidth - ACTION_BAR_HALF_WIDTH
    );
    const isTaskRunning = activeTimerDetails?.taskId === entry.taskId;
    // Keep these clicks away from the document deselect listener and the track's create handler
    const stop = (e) => e.stopPropagation();

    return (
      <div
        className="absolute z-40 flex items-center gap-1 rounded-lg bg-white p-1 shadow-lg ring-1 ring-gray-200 cursor-default whitespace-nowrap"
        style={{ left: `${center}px`, top: `${ACTION_BAR_TOP}px`, transform: 'translateX(-50%)' }}
        onMouseDown={stop}
        onClick={stop}
        role="toolbar"
        aria-label={`Actions for ${entry.taskName}`}
      >
        <button
          type="button"
          onClick={() => handleResume(entry)}
          disabled={isTaskRunning}
          title={isTaskRunning ? 'This task is already running' : `Start a new timer for ${entry.taskName}`}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
        >
          <PlayIcon className="h-4 w-4" />
          {isTaskRunning ? 'Running' : 'Resume'}
        </button>
        <div className="h-5 w-px bg-gray-200" aria-hidden="true" />
        <button
          type="button"
          onClick={() => handleDelete(entry)}
          title="Delete this entry"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <TrashIcon className="h-4 w-4" />
          Delete
        </button>
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

  // Calculate total time for the day (running timer counts live)
  const calculateDayTotal = () => {
    const totalSeconds = timeEntries.reduce((sum, entry) => {
      if (!entry.endTime && activeTimerDetails?.timeEntryId === entry.timeEntryId) {
        return sum + elapsedTime;
      }
      return sum + (entry.duration || 0);
    }, 0);
    return formatDurationHuman(totalSeconds);
  };

  // Only block rendering on the very first load — refetches (timer start/stop,
  // drag updates) keep the timeline mounted so it doesn't flicker
  if (isLoading && timeEntries.length === 0) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-500">Loading timeline...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Timeline for {formatDateString(selectedDate)}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Drag blue handles to resize • Drag entries to move • Click empty areas to create • Click an entry to resume or delete it
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Found {timeEntries.length} time entries • Showing 12AM-11PM (full day)
              {timeEntries.length === 0 && (
                <span className="text-amber-600 font-medium"> • Start and stop a timer to see entries here</span>
              )}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            {/* Zoom controls */}
            <div className="flex items-center space-x-1 bg-gray-100 rounded-lg px-1 py-1">
              <button
                onClick={() => applyZoom(zoomIndex - 1)}
                disabled={zoomIndex === 0}
                className="px-2 py-1 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                title="Zoom out (Ctrl+scroll)"
              >
                −
              </button>
              <button
                onClick={() => applyZoom(DEFAULT_ZOOM_INDEX)}
                className="px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-200 rounded tabular-nums w-12 text-center"
                title="Reset zoom"
              >
                {Math.round((HOUR_WIDTH / ZOOM_LEVELS[DEFAULT_ZOOM_INDEX]) * 100)}%
              </button>
              <button
                onClick={() => applyZoom(zoomIndex + 1)}
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                className="px-2 py-1 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                title="Zoom in (Ctrl+scroll)"
              >
                +
              </button>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">{calculateDayTotal()}</div>
              <div className="text-sm text-gray-500">Total logged</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 overflow-x-auto" ref={scrollContainerRef}>
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

          {/* Current time red line */}
          {currentTimePixels !== null && currentTimePixels >= 0 && currentTimePixels <= TIMELINE_HOURS * HOUR_WIDTH && (
            <div
              className="absolute top-6 bottom-0 z-30 pointer-events-none"
              style={{ left: `${currentTimePixels}px` }}
            >
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full -ml-1" />
              <div className="w-0.5 h-full bg-red-500 mx-auto -mt-0.5" />
            </div>
          )}

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
              <div className="p-2 h-full flex items-center justify-center text-blue-600 text-xs font-medium overflow-hidden whitespace-nowrap">
                {DEFAULT_DURATION_HOURS * HOUR_WIDTH >= 120 ? 'Click to create 1h task' : '+1h'}
              </div>
            </div>
          )}

          {/* Time entries */}
          {timeEntries.map(renderTimeEntry)}

          {/* Resume / Delete for the selected entry */}
          {renderSelectionActions()}

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