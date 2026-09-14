// Timezone helpers for the backend.
//
// All timestamps in the database are real UTC instants stored as ISO 8601
// strings (`new Date().toISOString()`). "Local" in this file always means the
// user's configured timezone (Settings.timeZone), never the server's zone —
// the server runs in UTC on Railway and should behave identically anywhere.
//
// Everything here is built on Intl.DateTimeFormat so DST is handled by the
// runtime's tz database rather than by hand.

const DEFAULT_TIME_ZONE = 'Pacific/Auckland';

const formatterCache = new Map();

function getFormatter(timeZone) {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock components of an instant in the given zone. */
function localParts(date, timeZone) {
  const parts = {};
  for (const { type, value } of getFormatter(timeZone).formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour % 24, // some engines emit "24" at midnight
    minute: parts.minute,
    second: parts.second,
  };
}

const pad = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD of an instant in the given zone. */
function localDateString(date, timeZone) {
  const p = localParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Offset (ms) of the zone at the given instant: local wall time minus UTC. */
function tzOffsetMs(date, timeZone) {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Instant for a wall-clock time in the given zone.
 * Hours/minutes may overflow (e.g. hour 24 = midnight of the next day).
 * Non-existent times (spring-forward gap) resolve to the instant the clock
 * would have shown that wall time had the jump not happened; ambiguous times
 * (fall-back overlap) resolve to the first occurrence.
 */
function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const wallSeconds = wall - millisecond;
  // Offsets in force a day either side of the naive instant cover both sides
  // of any transition near it; each yields a candidate instant.
  const DAY = 24 * 3600 * 1000;
  const offsets = new Set([wall - DAY, wall, wall + DAY].map((ms) => tzOffsetMs(new Date(ms), timeZone)));
  const candidates = [...offsets].map((offset) => wall - offset);
  const roundTrips = (c) => {
    const p = localParts(new Date(c), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) === wallSeconds;
  };
  const valid = candidates.filter(roundTrips);
  if (valid.length) return new Date(Math.min(...valid)); // overlap → first occurrence
  return new Date(Math.max(...candidates)); // gap → shifted forward past the jump
}

/** Add n calendar days to a YYYY-MM-DD string (pure date arithmetic, no zones). */
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Instant of local midnight at the start of a YYYY-MM-DD in the given zone. */
function dayStart(dateStr, timeZone) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return zonedTimeToUtc({ year, month, day }, timeZone);
}

/** Half-open [start, end) instants covering a local calendar day. */
function dayBounds(dateStr, timeZone) {
  return { start: dayStart(dateStr, timeZone), end: dayStart(addDays(dateStr, 1), timeZone) };
}

/** First local midnight strictly after the given instant. */
function nextLocalMidnight(date, timeZone) {
  return dayStart(addDays(localDateString(date, timeZone), 1), timeZone);
}

/**
 * Split an interval at every local midnight it crosses.
 * Returns [{ startTime, endTime, duration }] with ISO strings and whole seconds.
 * An interval ending exactly at midnight is NOT split (end is exclusive).
 */
function splitAtLocalMidnights(startIso, endIso, timeZone) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const segment = (s, e) => ({
    startTime: s.toISOString(),
    endTime: e.toISOString(),
    duration: Math.max(0, Math.round((e - s) / 1000)),
  });

  if (!(end > start)) return [segment(start, end)];

  const segments = [];
  let cursor = start;
  // Hard cap so a corrupt row can't spin forever (a year of days is plenty)
  for (let i = 0; i < 400; i++) {
    const midnight = nextLocalMidnight(cursor, timeZone);
    if (midnight >= end) {
      segments.push(segment(cursor, end));
      return segments;
    }
    segments.push(segment(cursor, midnight));
    cursor = midnight;
  }
  segments.push(segment(cursor, end));
  return segments;
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  localParts,
  localDateString,
  tzOffsetMs,
  zonedTimeToUtc,
  addDays,
  dayStart,
  dayBounds,
  nextLocalMidnight,
  splitAtLocalMidnights,
  nowIso,
};
