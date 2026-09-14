// Key/value app settings persisted in the Settings table (on the /data volume,
// so they survive Railway App Sleeping). The timezone setting is read on every
// time-entry request, so it is cached in memory and invalidated on write.
const database = require('./database');
const { DEFAULT_TIME_ZONE, isValidTimeZone } = require('./utils/time');

const KEYS = {
  TIME_ZONE: 'timeZone',
  TIMESTAMP_FORMAT: 'timestampFormat', // 'utc' once the NZ-wall-clock → UTC migration has run
};

let timeZoneCache = null;

function getSetting(key) {
  const db = database.getDb();
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM Settings WHERE key = ?', [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });
}

function setSetting(key, value) {
  const db = database.getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO Settings (key, value, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP`,
      [key, String(value)],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

async function getTimeZone() {
  if (timeZoneCache) return timeZoneCache;
  const stored = await getSetting(KEYS.TIME_ZONE);
  timeZoneCache = isValidTimeZone(stored) ? stored : DEFAULT_TIME_ZONE;
  return timeZoneCache;
}

async function setTimeZone(timeZone) {
  if (!isValidTimeZone(timeZone)) {
    const err = new Error(`Unknown timezone: ${timeZone}`);
    err.status = 400;
    throw err;
  }
  await setSetting(KEYS.TIME_ZONE, timeZone);
  timeZoneCache = timeZone;
  return timeZone;
}

module.exports = { KEYS, getSetting, setSetting, getTimeZone, setTimeZone };
