const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { zonedTimeToUtc, DEFAULT_TIME_ZONE } = require('./utils/time');
const DB_PATH = process.env.DATABASE_PATH || '../data/notion_time_tracker.sqlite';

let db;

/** Directory for on-volume snapshots (next to the DB file, so it persists on Railway). */
function getBackupsDir() {
  const dir = path.join(path.dirname(path.resolve(DB_PATH)), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a consistent copy of the live database to filePath (SQLite VACUUM INTO). */
function vacuumInto(filePath) {
  return new Promise((resolve, reject) => {
    db.run(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`, (err) => (err ? reject(err) : resolve(filePath)));
  });
}

/** Snapshot the DB into the backups dir as <label>-<timestamp>.sqlite and return the path. */
function snapshotDatabase(label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return vacuumInto(path.join(getBackupsDir(), `${label}-${stamp}.sqlite`));
}

const dbRun = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

/**
 * Convert a pre-migration timestamp to a real UTC ISO string.
 *
 * Before the UTC migration, timestamps written by the app were NZ wall-clock
 * time labelled as UTC: "2026-01-15T09:00:00.000Z" meant 9am in Auckland.
 * SQLite's own CURRENT_TIMESTAMP defaults ("2026-01-15 09:00:00", no T/Z)
 * were always genuine UTC and only need normalising to ISO format.
 */
function legacyTimestampToUtc(value) {
  if (!value) return value;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z').toISOString();
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return zonedTimeToUtc({
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
    millisecond: d.getUTCMilliseconds(),
  }, DEFAULT_TIME_ZONE).toISOString();
}

/**
 * One-time migration: rewrite every stored timestamp from NZ-wall-clock-as-UTC
 * to real UTC, then record `timestampFormat = utc` so it never runs again.
 * Runs inside a transaction so a failure leaves the data untouched.
 */
async function migrateTimestampsToUtc() {
  const flag = await dbGet("SELECT value FROM Settings WHERE key = 'timestampFormat'");
  if (flag && flag.value === 'utc') return;

  // Safety net: keep an untouched copy on the volume before rewriting anything
  // (skipped on an empty DB where there is nothing to lose)
  const counts = await dbGet('SELECT (SELECT COUNT(*) FROM TimeEntries) + (SELECT COUNT(*) FROM Bills) AS n');
  if (counts && counts.n > 0) {
    const snapshot = await snapshotDatabase('pre-utc-migration');
    console.log('Timestamp migration: pre-migration snapshot written to', snapshot);
  }

  await dbRun('BEGIN TRANSACTION;');
  try {
    const entries = await dbAll('SELECT id, startTime, endTime FROM TimeEntries');
    for (const e of entries) {
      await dbRun('UPDATE TimeEntries SET startTime = ?, endTime = ? WHERE id = ?',
        [legacyTimestampToUtc(e.startTime), legacyTimestampToUtc(e.endTime), e.id]);
    }
    const bills = await dbAll('SELECT id, createdAt FROM Bills');
    for (const b of bills) {
      await dbRun('UPDATE Bills SET createdAt = ? WHERE id = ?', [legacyTimestampToUtc(b.createdAt), b.id]);
    }
    // Existing data was NZ time, so NZ stays the display zone until changed in Settings
    await dbRun("INSERT OR IGNORE INTO Settings (key, value) VALUES ('timeZone', ?)", [DEFAULT_TIME_ZONE]);
    await dbRun("INSERT INTO Settings (key, value) VALUES ('timestampFormat', 'utc') ON CONFLICT(key) DO UPDATE SET value = 'utc'");
    await dbRun('COMMIT;');
    console.log(`Timestamp migration: converted ${entries.length} time entries and ${bills.length} bills to UTC.`);
  } catch (err) {
    await dbRun('ROLLBACK;').catch(() => { });
    throw err;
  }
}

function connect() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error connecting to SQLite:', err.message);
        reject(err);
      } else {
        console.log('Connected to the SQLite database.');
        resolve();
      }
    });
  });
}

function init() {
  return new Promise(async (resolve, reject) => {
    try {
      await connect();

      db.serialize(() => {
        // Clients Table
        db.run(`
          CREATE TABLE IF NOT EXISTS Clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notionId TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            status TEXT, -- Stage/Status from Notion (e.g., 'Active', 'Done', etc.)
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) return reject(err);
          console.log('Clients table created or already exists.');

          // Add status column if it doesn't exist (for existing tables)
          db.run(`ALTER TABLE Clients ADD COLUMN status TEXT`, () => { });
        });

        // Projects Table
        db.run(`
          CREATE TABLE IF NOT EXISTS Projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notionId TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            clientId INTEGER,
            notionClientId TEXT, -- Storing Notion ID for relation
            budgetedTime REAL DEFAULT 0, -- in hours
            hourlyRate REAL DEFAULT 0, -- hourly rate for billing
            status TEXT, -- e.g., 'To Do', 'In Progress', 'Done' (from Notion)
            iconType TEXT, -- 'emoji', 'external', 'file'
            iconValue TEXT, -- The emoji character or URL
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (clientId) REFERENCES Clients(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) return reject(err);
          console.log('Projects table created or already exists.');

          // Add icon columns if they don't exist (for existing tables)
          db.run(`ALTER TABLE Projects ADD COLUMN iconType TEXT`, () => { });
          db.run(`ALTER TABLE Projects ADD COLUMN iconValue TEXT`, () => { });
          db.run(`ALTER TABLE Projects ADD COLUMN color TEXT`, () => { });
          db.run(`ALTER TABLE Projects ADD COLUMN hourlyRate REAL DEFAULT 0`, () => { });
          db.run(`ALTER TABLE Projects ADD COLUMN isManual BOOLEAN DEFAULT false`, () => { });
        });

        // Tasks Table
        db.run(`
          CREATE TABLE IF NOT EXISTS Tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notionId TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            projectId INTEGER,
            notionProjectId TEXT, -- Storing Notion ID for relation
            status TEXT, -- e.g., 'To Do', 'In Progress', 'Done' (from Notion)
            isBillable BOOLEAN DEFAULT true,
            beenBilled BOOLEAN DEFAULT false,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) return reject(err);
          console.log('Tasks table created or already exists.');

          // Add columns if they don't exist (for existing tables)
          db.run(`ALTER TABLE Tasks ADD COLUMN assignee TEXT`, () => { });
          db.run(`ALTER TABLE Tasks ADD COLUMN beenBilled BOOLEAN DEFAULT false`, () => { });
          db.run(`ALTER TABLE Tasks ADD COLUMN deadline TEXT`, () => { });
          db.run(`ALTER TABLE Tasks ADD COLUMN taskOrPage TEXT`, () => { });
          db.run(`ALTER TABLE Tasks ADD COLUMN isManual BOOLEAN DEFAULT false`, () => { });
          // Local-only pricing (not synced from Notion): a task either inherits the
          // project hourlyRate, has its own hourly rate, or is fixed-price
          db.run(`ALTER TABLE Tasks ADD COLUMN fixedPrice REAL`, () => { });
          db.run(`ALTER TABLE Tasks ADD COLUMN hourlyRateOverride REAL`, () => { });
        });

        // TimeEntries Table
        db.run(`
          CREATE TABLE IF NOT EXISTS TimeEntries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            taskId INTEGER NOT NULL,
            notionTaskId TEXT NOT NULL, -- Storing Notion ID for easier sync
            startTime DATETIME NOT NULL,
            endTime DATETIME,
            duration INTEGER, -- in seconds
            isSyncedToNotion BOOLEAN DEFAULT false,
            notionEntryId TEXT, -- ID of the corresponding time entry in Notion (if you create separate entries)
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) return reject(err);
          console.log('TimeEntries table created or already exists.');
        });

        // Bills Table — snapshot of a bill at creation time (task hours/financials frozen)
        db.run(`
          CREATE TABLE IF NOT EXISTS Bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projectId INTEGER NOT NULL,
            totalHours REAL DEFAULT 0,
            roundedHours REAL DEFAULT 0,
            hourlyRate REAL DEFAULT 0,
            subtotal REAL DEFAULT 0,
            gst REAL DEFAULT 0,
            total REAL DEFAULT 0,
            fixedAmount REAL DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) return reject(err);
          console.log('Bills table created or already exists.');
          db.run(`ALTER TABLE Bills ADD COLUMN fixedAmount REAL DEFAULT 0`, () => { });
        });

        // BillTasks Table — per-task snapshot within a bill (name/hours frozen at billing time)
        db.run(`
          CREATE TABLE IF NOT EXISTS BillTasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            billId INTEGER NOT NULL,
            taskId INTEGER,
            taskName TEXT,
            hoursSpent REAL DEFAULT 0,
            fixedPrice REAL,
            rate REAL,
            FOREIGN KEY (billId) REFERENCES Bills(id) ON DELETE CASCADE,
            FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) return reject(err);
          console.log('BillTasks table created or already exists.');
          db.run(`ALTER TABLE BillTasks ADD COLUMN fixedPrice REAL`, () => { });
          db.run(`ALTER TABLE BillTasks ADD COLUMN rate REAL`, () => { });
        });

        // Triggers to update `updatedAt` timestamps (Optional but good practice)
        const tablesWithUpdatedAt = ['Clients', 'Projects', 'Tasks', 'TimeEntries'];
        tablesWithUpdatedAt.forEach(table => {
          db.run(`
            CREATE TRIGGER IF NOT EXISTS set_${table}_updated_at
            AFTER UPDATE ON ${table}
            FOR EACH ROW
            BEGIN
              UPDATE ${table}
              SET updatedAt = CURRENT_TIMESTAMP
              WHERE id = OLD.id;
            END;
          `, (err) => {
            if (err) console.warn(`Warning: Could not create update trigger for ${table}: ${err.message}`);
          });
        });

        // Settings Table — key/value app settings (timezone, migration flags).
        // Queued last so the migration runs after every statement above.
        db.run(`
          CREATE TABLE IF NOT EXISTS Settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) return reject(err);
          console.log('Settings table created or already exists.');
          migrateTimestampsToUtc().then(resolve).catch(reject);
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call connect() or init() first.');
  }
  return db;
}

// Allow running init directly via CLI e.g. `node src/database.js init`
if (require.main === module && process.argv[2] === 'init') {
  init()
    .then(() => {
      console.log('Database initialization script completed.');
      db.close();
    })
    .catch(err => {
      console.error('Database initialization script failed:', err);
      if (db) db.close();
      process.exit(1);
    });
}

module.exports = {
  init,
  getDb,
  connect, // Export connect if needed separately
  getBackupsDir,
  vacuumInto,
  snapshotDatabase,
};