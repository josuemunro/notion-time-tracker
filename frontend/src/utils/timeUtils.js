/**
 * Time helpers.
 *
 * Timestamps from the API are real UTC instants (ISO 8601). Everything that
 * needs a calendar day or a wall-clock time goes through the configured
 * display timezone below, which SettingsContext sets from the server (and the
 * user can change on the Settings page). Never use the browser's local zone.
 */

export const DEFAULT_TIME_ZONE = 'Pacific/Auckland';

let currentTimeZone = DEFAULT_TIME_ZONE;

export const isValidTimeZone = (timeZone) => {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

/** Set the app-wide display timezone (called by SettingsContext). */
export const setTimeZone = (timeZone) => {
  if (isValidTimeZone(timeZone)) currentTimeZone = timeZone;
};

export const getTimeZone = () => currentTimeZone;

export const getBrowserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const FALLBACK_TIME_ZONES = [
  'Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Dubai',
  'Europe/Berlin', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/London', 'Europe/Lisbon',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'UTC',
];

/** Every IANA zone the browser knows about (falls back to a short list on old browsers). */
export const listTimeZones = () => {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
  } catch { /* fall through */ }
  return FALLBACK_TIME_ZONES;
};

// ---------------------------------------------------------------------------
// Zone-aware primitives
// ---------------------------------------------------------------------------

const formatterCache = new Map();

const getPartsFormatter = (timeZone) => {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
};

const pad = (n) => String(n).padStart(2, '0');

/** Wall-clock components of an instant in the display zone. */
export const localParts = (date, timeZone = currentTimeZone) => {
  const parts = {};
  for (const { type, value } of getPartsFormatter(timeZone).formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return {
    year: parts.year, month: parts.month, day: parts.day,
    hour: parts.hour % 24, minute: parts.minute, second: parts.second,
  };
};

/** YYYY-MM-DD of an instant (default: now) in the display zone. */
export const getLocalDateString = (date = new Date(), timeZone = currentTimeZone) => {
  const p = localParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/** Hours since local midnight as a decimal (for positioning on a day axis). */
export const getLocalHoursDecimal = (date = new Date(), timeZone = currentTimeZone) => {
  const p = localParts(date, timeZone);
  return p.hour + p.minute / 60 + p.second / 3600;
};

const tzOffsetMs = (date, timeZone) => {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/**
 * Instant for a wall-clock time in the display zone. Hours may overflow
 * (24 = next midnight). Gap times shift forward; ambiguous times take the
 * first occurrence. Mirrors backend/src/utils/time.js.
 */
export const zonedTimeToUtc = ({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = currentTimeZone) => {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const DAY = 24 * 3600 * 1000;
  const offsets = new Set([wall - DAY, wall, wall + DAY].map((ms) => tzOffsetMs(new Date(ms), timeZone)));
  const candidates = [...offsets].map((offset) => wall - offset);
  const roundTrips = (c) => {
    const p = localParts(new Date(c), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) === wall;
  };
  const valid = candidates.filter(roundTrips);
  return new Date(valid.length ? Math.min(...valid) : Math.max(...candidates));
};

/** ISO instant for hh:mm on a YYYY-MM-DD in the display zone. */
export const localTimeToIso = (dateStr, hours, minutes = 0, timeZone = currentTimeZone) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return zonedTimeToUtc({ year, month, day, hour: hours, minute: minutes }, timeZone).toISOString();
};

/** Add n calendar days to a YYYY-MM-DD string (pure date arithmetic). */
export const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Whole days from one YYYY-MM-DD to another (positive when `to` is later). */
export const dayDiff = (fromDateStr, toDateStr) => {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number);
  const [ty, tm, td] = toDateStr.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
};

/**
 * Decimal hours of an instant measured from local midnight of `dateStr`.
 * Midnight at the end of the day reads as 24 (not 0), and instants on other
 * days fall outside 0–24, so day-axis maths stays monotonic.
 */
export const hoursIntoDay = (iso, dateStr, timeZone = currentTimeZone) => {
  const date = new Date(iso);
  return dayDiff(dateStr, getLocalDateString(date, timeZone)) * 24 + getLocalHoursDecimal(date, timeZone);
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Wall-clock time of an instant in the display zone ("9:05 AM" or "09:05"). */
export const formatTime = (isoString, options = {}) => {
  const { hour, minute } = localParts(new Date(isoString), options.timeZone || currentTimeZone);
  if (options.format24h) return `${pad(hour)}:${pad(minute)}`;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${pad(minute)} ${period}`;
};

export const formatTimeRange = (startTime, endTime) => `${formatTime(startTime)} - ${formatTime(endTime)}`;

/** Render a YYYY-MM-DD as words without any zone shifting. */
export const formatDateString = (dateStr, options = { day: 'numeric', month: 'short', year: 'numeric' }, locale = 'en-NZ') => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
};

/** Date + time of an instant in the display zone (e.g. bill timestamps). */
export const formatDateTime = (isoString, options = {}) => {
  if (!isoString) return '';
  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
    timeZone: options.timeZone || currentTimeZone,
  }).format(new Date(isoString));
};

/**
 * Formats seconds into a human-readable format
 * @param {number} totalSeconds - Total seconds
 * @returns {string} - Formatted time string (e.g., "2 hrs 30 mins", "45 mins", "30 secs")
 */
export const formatDurationHuman = (totalSeconds) => {
  if (totalSeconds === 0 || totalSeconds === null || totalSeconds === undefined) {
    return '0 mins';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (hours > 0) {
    parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
  }

  if (minutes > 0) {
    parts.push(`${minutes} min${minutes === 1 ? '' : 's'}`);
  }

  // Only show seconds if less than 1 minute total, or if no hours/minutes
  if ((hours === 0 && minutes === 0) || (hours === 0 && minutes < 2 && seconds > 0)) {
    parts.push(`${seconds} sec${seconds === 1 ? '' : 's'}`);
  }

  return parts.join(' ');
};

/**
 * Formats hours (decimal) into a human-readable format
 * @param {number} hours - Hours as decimal (e.g., 2.5)
 * @returns {string} - Formatted time string (e.g., "2 hrs 30 mins")
 */
export const formatHoursHuman = (hours) => {
  if (hours === 0 || hours === null || hours === undefined) {
    return '0 mins';
  }

  const totalSeconds = Math.round(hours * 3600);
  return formatDurationHuman(totalSeconds);
};

/**
 * Timer-specific formatting for active timers (keeps HH:MM:SS format for precision)
 * @param {number} totalSeconds - Total seconds
 * @returns {string} - Formatted time string (HH:MM:SS)
 */
export const formatTimerDisplay = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Alternative human format that's more compact
 * @param {number} totalSeconds - Total seconds
 * @returns {string} - Compact format (e.g., "2h 30m", "45m", "30s")
 */
export const formatDurationCompact = (totalSeconds) => {
  if (totalSeconds === 0 || totalSeconds === null || totalSeconds === undefined) {
    return '0m';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  // Only show seconds if less than 1 minute total
  if (hours === 0 && minutes === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
};
