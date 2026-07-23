import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTimeEntries } from '../services/api';
import { formatDurationCompact, formatNZTimeRange, getNZDateString, getNZHoursDecimal } from '../utils/timeUtils';
import { entryEarnings, formatNZD } from '../utils/billingUtils';
import ProjectIcon from '../components/ProjectIcon';
import { ChevronLeftIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

// Read-only week calendar: seven day columns, entries as project-colored blocks.
// Click a day header to open that day in the home timeline for editing.

const HOUR_HEIGHT = 44; // px per hour
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The Monday-Sunday week (as YYYY-MM-DD strings) containing today + offset weeks
const getWeekDates = (weekOffset) => {
  const [y, m, d] = getNZDateString().split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d + weekOffset * 7));
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day.toISOString().split('T')[0];
  });
};

// Stored timestamps are NZ wall-clock labeled UTC — read with getUTC*
const isoToHours = (iso) => {
  const date = new Date(iso);
  return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
};

function CalendarPage() {
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const todayStr = getNZDateString();

  useEffect(() => {
    let cancelled = false;
    const fetchWeek = async () => {
      setIsLoading(true);
      try {
        const { data } = await getTimeEntries({ startDate: weekDates[0], endDate: weekDates[6] });
        if (!cancelled) setEntries(Array.isArray(data) ? data.filter(e => e.endTime) : []);
      } catch (err) {
        console.error('Failed to fetch week entries:', err);
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchWeek();
    return () => { cancelled = true; };
  }, [weekDates]);

  const entriesByDate = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      const date = (e.startTime || '').slice(0, 10);
      (map[date] = map[date] || []).push(e);
    });
    return map;
  }, [entries]);

  // Visible hour window: at least 7am-7pm, expanded to fit entries
  const [startHour, endHour] = useMemo(() => {
    let min = 7, max = 19;
    entries.forEach(e => {
      min = Math.min(min, Math.floor(isoToHours(e.startTime)));
      max = Math.max(max, Math.ceil(isoToHours(e.endTime)));
    });
    return [min, Math.min(24, max)];
  }, [entries]);

  const daySeconds = (date) => (entriesByDate[date] || []).reduce((s, e) => s + (e.duration || 0), 0);
  const dayEarnings = (date) => (entriesByDate[date] || []).reduce((s, e) => s + entryEarnings(e), 0);
  const weekSeconds = entries.reduce((s, e) => s + (e.duration || 0), 0);
  const weekEarnings = entries.reduce((s, e) => s + entryEarnings(e), 0);

  const gridHeight = (endHour - startHour) * HOUR_HEIGHT;
  const nowHours = getNZHoursDecimal();

  const rangeLabel = (() => {
    const fmt = (dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    };
    return `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;
  })();

  return (
    <div className="space-y-4">
      {/* Header: navigation + totals */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Previous week"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            This Week
          </button>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Next week"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 ml-2">{rangeLabel}</h1>
        </div>
        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-xl font-bold text-blue-600">{formatDurationCompact(weekSeconds)}</div>
            <div className="text-xs text-gray-500">logged this week</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-600">{formatNZD(weekEarnings)}</div>
            <div className="text-xs text-gray-500">earned this week</div>
          </div>
        </div>
      </div>

      {/* Week grid */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="min-w-[840px] p-4">
            {/* Day headers */}
            <div className="grid" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
              <div />
              {weekDates.map((date, i) => {
                const isToday = date === todayStr;
                return (
                  <button
                    key={date}
                    onClick={() => navigate(`/?date=${date}`)}
                    title="Open this day in the timeline"
                    className={`text-center py-2 rounded-lg transition-colors hover:bg-blue-50 ${isToday ? 'bg-blue-50' : ''}`}
                  >
                    <div className={`text-sm font-semibold ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                      {DAY_LABELS[i]} {Number(date.slice(8, 10))}
                    </div>
                    <div className="text-xs text-gray-500">
                      {daySeconds(date) > 0
                        ? <>{formatDurationCompact(daySeconds(date))} · <span className="text-emerald-600">{formatNZD(dayEarnings(date))}</span></>
                        : '—'}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Time grid */}
            <div className="grid mt-1" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
              {/* Hour labels gutter */}
              <div className="relative" style={{ height: `${gridHeight}px` }}>
                {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-2 text-xs text-gray-400 -translate-y-1/2"
                    style={{ top: `${i * HOUR_HEIGHT}px` }}
                  >
                    {(startHour + i) % 24 === 0 ? '12am' : (startHour + i) < 12 ? `${startHour + i}am` : (startHour + i) === 12 ? '12pm' : `${startHour + i - 12}pm`}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDates.map((date) => {
                const isToday = date === todayStr;
                return (
                  <div
                    key={date}
                    className={`relative border-l border-gray-100 ${isToday ? 'bg-blue-50/40' : ''}`}
                    style={{ height: `${gridHeight}px` }}
                  >
                    {/* Hour lines */}
                    {Array.from({ length: endHour - startHour }, (_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-gray-100"
                        style={{ top: `${i * HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {/* Current time line */}
                    {isToday && nowHours >= startHour && nowHours <= endHour && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                        style={{ top: `${(nowHours - startHour) * HOUR_HEIGHT}px` }}
                      />
                    )}

                    {/* Entries */}
                    {(entriesByDate[date] || []).map(entry => {
                      const top = (isoToHours(entry.startTime) - startHour) * HOUR_HEIGHT;
                      const height = Math.max(6, (isoToHours(entry.endTime) - isoToHours(entry.startTime)) * HOUR_HEIGHT);
                      return (
                        <div
                          key={entry.timeEntryId}
                          className="absolute left-0.5 right-0.5 rounded-md overflow-hidden z-10 shadow-sm"
                          style={{ top: `${top}px`, height: `${height}px`, backgroundColor: entry.projectColor || '#6366f1' }}
                          title={`${entry.taskName} — ${entry.projectName}\n${formatNZTimeRange(entry.startTime, entry.endTime)} · ${formatDurationCompact(entry.duration || 0)} · ${formatNZD(entryEarnings(entry))}`}
                        >
                          {height >= 18 && (
                            <div className="px-1.5 py-0.5 flex items-center gap-1 text-[11px] leading-tight text-white/95 font-medium" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                              {height >= 30 && (
                                <ProjectIcon
                                  iconType={entry.projectIconType}
                                  iconValue={entry.projectIconValue}
                                  projectName={entry.projectName}
                                  projectColor={entry.projectColor}
                                  className="w-3.5 h-3.5 flex-shrink-0"
                                />
                              )}
                              <span className="truncate">{entry.taskName}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        Read-only view — click a day header to open it in the timeline for editing.
      </p>
    </div>
  );
}

export default CalendarPage;
