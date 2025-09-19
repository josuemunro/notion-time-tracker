const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.DATABASE_PATH || '../data/notion_time_tracker.sqlite';

let db;

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

          // Add assignee column if it doesn't exist (for existing tables)
          db.run(`ALTER TABLE Tasks ADD COLUMN assignee TEXT`, () => { });
          // Add beenBilled column if it doesn't exist (for existing tables)
          db.run(`ALTER TABLE Tasks ADD COLUMN beenBilled BOOLEAN DEFAULT false`, () => { });
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
        resolve();
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
  connect // Export connect if needed separately
};