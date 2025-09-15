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