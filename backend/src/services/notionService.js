// notion-time-tracker/backend/src/services/notionService.js
const { Client, APIErrorCode } = require('@notionhq/client'); // Removed ClientErrorCode as it's not used now
const db = require('../database'); // To interact with SQLite

let notionClient;

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_CLIENTS_DB_ID = process.env.NOTION_CLIENTS_DB_ID;
const NOTION_PROJECTS_DB_ID = process.env.NOTION_PROJECTS_DB_ID;
const NOTION_TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID;
// NOTION_TIME_LOG_DB_ID is removed

// --- Initialization ---
function initializeNotionClient() {
  if (!NOTION_API_KEY) {
    console.warn('NOTION_API_KEY is not set. Notion integration will be disabled.');
    return null;
  }
  if (!NOTION_CLIENTS_DB_ID || !NOTION_PROJECTS_DB_ID || !NOTION_TASKS_DB_ID) {
    console.warn('One or more core Notion Database IDs (Clients, Projects, Tasks) are not set. Notion integration may not function correctly.');
  }
  notionClient = new Client({ auth: NOTION_API_KEY });
  console.log('Notion client initialized.');
  return notionClient;
}

initializeNotionClient(); // Initialize on load

// --- Helper Functions (Remain the same as previous version) ---
/**
 * Helper to extract rich text content from a Notion property.
 */
function getRichTextValue(property) {
  if (property && property.rich_text && property.rich_text.length > 0) {
    return property.rich_text.map(rt => rt.plain_text).join('');
  }
  return '';
}

/**
 * Helper to extract title value from a Notion property.
 */
function getTitleValue(property) {
  if (property && property.title && property.title.length > 0) {
    return property.title.map(t => t.plain_text).join('');
  }
  return '';
}

/**
 * Helper to extract number value from a Notion property.
 */
function getNumberValue(property) {
  if (property && typeof property.number === 'number') {
    return property.number;
  }
  return null;
}

/**
 * Helper to extract select value (name) from a Notion property.
 */
function getSelectValue(property) {
  if (property && property.select) {
    return property.select.name;
  }
  return null;
}

/**
 * Helper to extract status value (name) from a Notion property.
 */
function getStatusValue(property) {
    if (property && property.status) {
        return property.status.name;
    }
    return null;
}

/**
 * Helper to extract relation ID from a Notion property.
 */
function getRelationId(property) {
  if (property && property.relation && property.relation.length > 0) {
    return property.relation[0].id; // Assuming single relation
  }
  return null;
}

/**
 * Helper to extract checkbox value from a Notion property.
 */
function getCheckboxValue(property) {
    return property && property.checkbox ? property.checkbox : false;
}

// --- Fetching Data from Notion (Remains the same logic) ---

/**
 * Fetches all pages from a Notion database with pagination handling.
 */
async function queryNotionDatabase(databaseId, filter = undefined, sorts = undefined) {
  if (!notionClient || !databaseId) return [];
  let results = [];
  let hasMore = true;
  let startCursor = undefined;

  try {
    while (hasMore) {
      const response = await notionClient.databases.query({
        database_id: databaseId,
        filter: filter,
        sorts: sorts,
        start_cursor: startCursor,
        page_size: 100, // Max 100
      });
      results = results.concat(response.results);
      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }
    return results;
  } catch (error) {
    console.error(`Error querying Notion database ${databaseId}:`, error.body || error.message);
    if (error.code === APIErrorCode.ObjectNotFound || error.code === APIErrorCode.Unauthorized) {
        console.error(`Check if NOTION_API_KEY has access to database ID: ${databaseId}`);
    }
    return [];
  }
}

async function fetchNotionClients() {
  if (!notionClient || !NOTION_CLIENTS_DB_ID) {
    console.warn('Notion client or Clients DB ID not configured for fetchNotionClients.');
    return [];
  }
  console.log('Fetching clients from Notion...');
  const pages = await queryNotionDatabase(NOTION_CLIENTS_DB_ID);
  return pages.map(page => ({
    notionId: page.id,
    name: getTitleValue(page.properties.Name), // Assumes 'Name' is the title property
    lastEditedTime: page.last_edited_time,
  }));
}

async function fetchNotionProjects() {
  if (!notionClient || !NOTION_PROJECTS_DB_ID) {
    console.warn('Notion client or Projects DB ID not configured for fetchNotionProjects.');
    return [];
  }
  console.log('Fetching projects from Notion...');
  const pages = await queryNotionDatabase(NOTION_PROJECTS_DB_ID);
  return pages.map(page => ({
    notionId: page.id,
    name: getTitleValue(page.properties['Project Name']), // Assumes 'Project Name' is title
    notionClientId: getRelationId(page.properties['Client Link']),
    budgetedTime: getNumberValue(page.properties['Budget (hrs)']),
    status: getStatusValue(page.properties['Status']) || getSelectValue(page.properties['Status']),
    lastEditedTime: page.last_edited_time,
  }));
}

async function fetchNotionTasks() {
  if (!notionClient || !NOTION_TASKS_DB_ID) {
    console.warn('Notion client or Tasks DB ID not configured for fetchNotionTasks.');
    return [];
  }
  console.log('Fetching tasks from Notion...');
  const pages = await queryNotionDatabase(NOTION_TASKS_DB_ID);
  return pages.map(page => ({
    notionId: page.id,
    name: getTitleValue(page.properties['Task Name']), // Assumes 'Task Name' is title
    notionProjectId: getRelationId(page.properties['Project Link']),
    status: getStatusValue(page.properties['Status']) || getSelectValue(page.properties['Status']),
    isBillable: getCheckboxValue(page.properties['Is Billable']),
    lastEditedTime: page.last_edited_time,
  }));
}

// --- Syncing Data from Notion to Local SQLite DB (Remains the same logic) ---

async function syncClientsWithDb() {
  const notionClients = await fetchNotionClients();
  if (!notionClients.length) {
    console.log('No clients found in Notion to sync.');
    return;
  }

  const localDb = db.getDb();
  return new Promise((resolve, reject) => {
    localDb.serialize(() => {
      const stmt = localDb.prepare(`
        INSERT INTO Clients (notionId, name, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(notionId) DO UPDATE SET
          name = excluded.name,
          updatedAt = excluded.updatedAt;
      `);
      let completed = 0;
      notionClients.forEach(client => {
        stmt.run(client.notionId, client.name, client.lastEditedTime, (err) => {
          if (err) console.error('Error syncing client to DB:', client.notionId, err.message);
          completed++;
          if (completed === notionClients.length) {
            stmt.finalize(errFinalize => {
              if (errFinalize) reject(errFinalize); else resolve();
            });
          }
        });
      });
      if (notionClients.length === 0) {
        resolve();
      }
    });
  });
}

async function syncProjectsWithDb() {
  const notionProjects = await fetchNotionProjects();
  if (!notionProjects.length) {
    console.log('No projects found in Notion to sync.');
    return;
  }

  const localDb = db.getDb();
  return new Promise((resolve, reject) => {
    localDb.serialize(() => {
      const stmt = localDb.prepare(`
        INSERT INTO Projects (notionId, name, notionClientId, budgetedTime, status, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(notionId) DO UPDATE SET
          name = excluded.name,
          notionClientId = excluded.notionClientId,
          budgetedTime = excluded.budgetedTime,
          status = excluded.status,
          updatedAt = excluded.updatedAt;
      `);
      let completed = 0;
      notionProjects.forEach(proj => {
        stmt.run(
          proj.notionId,
          proj.name,
          proj.notionClientId,
          proj.budgetedTime,
          proj.status,
          proj.lastEditedTime,
          (err) => {
            if (err) console.error('Error syncing project to DB:', proj.notionId, err.message);
            completed++;
            if (completed === notionProjects.length) {
              stmt.finalize(errFinalize => {
                if (errFinalize) reject(errFinalize); else resolve();
              });
            }
          }
        );
      });
      if (notionProjects.length === 0) {
        resolve();
      }
    });
  });
}

async function syncTasksWithDb() {
  const notionTasks = await fetchNotionTasks();
  if (!notionTasks.length) {
    console.log('No tasks found in Notion to sync.');
    return;
  }

  const localDb = db.getDb();
  return new Promise((resolve, reject) => {
    localDb.serialize(() => {
      const stmt = localDb.prepare(`
        INSERT INTO Tasks (notionId, name, notionProjectId, status, isBillable, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(notionId) DO UPDATE SET
          name = excluded.name,
          notionProjectId = excluded.notionProjectId,
          status = excluded.status,
          isBillable = excluded.isBillable,
          updatedAt = excluded.updatedAt;
      `);
      let completed = 0;
      notionTasks.forEach(task => {
        stmt.run(
          task.notionId,
          task.name,
          task.notionProjectId,
          task.status,
          task.isBillable,
          task.lastEditedTime,
          (err) => {
            if (err) console.error('Error syncing task to DB:', task.notionId, err.message);
            completed++;
            if (completed === notionTasks.length) {
              stmt.finalize(errFinalize => {
                if (errFinalize) reject(errFinalize); else resolve();
              });
            }
          }
        );
      });
      if (notionTasks.length === 0) {
        resolve();
      }
    });
  });
}

async function syncAllFromNotion() {
  if (!notionClient) {
    console.warn('Notion client not initialized. Skipping sync.');
    return;
  }
  console.log('Starting full sync from Notion to local DB...');
  try {
    await syncClientsWithDb();
    console.log('Clients sync complete.');
    await syncProjectsWithDb();
    console.log('Projects sync complete.');
    await syncTasksWithDb();
    console.log('Tasks sync complete.');
    console.log('Full sync from Notion finished.');

    await updateLocalRelationalIds();
  } catch (error) {
    console.error('Error during sync from Notion:', error);
  }
}

async function updateLocalRelationalIds() {
    const localDb = db.getDb();
    console.log('Updating local relational IDs...');

    const updateProjectClientIdsPromise = new Promise((resolve, reject) => {
        localDb.run(`
            UPDATE Projects
            SET clientId = (SELECT id FROM Clients WHERE Clients.notionId = Projects.notionClientId)
            WHERE Projects.notionClientId IS NOT NULL AND (Projects.clientId IS NULL OR Projects.clientId != (SELECT id FROM Clients WHERE Clients.notionId = Projects.notionClientId));
        `, function(err) { // Added condition to re-update if changed
            if (err) {
                console.error('Error updating Project client IDs:', err.message);
                return reject(err);
            }
            console.log(`Project client IDs updated. ${this.changes} rows affected.`);
            resolve();
        });
    });

    const updateTaskProjectIdsPromise = new Promise((resolve, reject) => {
        localDb.run(`
            UPDATE Tasks
            SET projectId = (SELECT id FROM Projects WHERE Projects.notionId = Tasks.notionProjectId)
            WHERE Tasks.notionProjectId IS NOT NULL AND (Tasks.projectId IS NULL OR Tasks.projectId != (SELECT id FROM Projects WHERE Projects.notionId = Tasks.notionProjectId));
        `, function(err) { // Added condition to re-update if changed
            if (err) {
                console.error('Error updating Task project IDs:', err.message);
                return reject(err);
            }
            console.log(`Task project IDs updated. ${this.changes} rows affected.`);
            resolve();
        });
    });

    try {
        await Promise.all([updateProjectClientIdsPromise, updateTaskProjectIdsPromise]);
        console.log('Local relational IDs updated successfully.');
    } catch (error) {
        console.error('Failed to update all local relational IDs:', error);
    }
}

// --- Pushing Data to Notion (REMOVED) ---
// Functions createNotionTimeLogEntry, updateNotionTaskTimeSpent, updateNotionProjectTimeSpent are removed.

// --- Webhook Handling (Foundation - can remain if user wants to sync Notion changes) ---
async function handleNotionWebhook(payload) {
  console.log('Received Notion webhook (raw):', JSON.stringify(payload, null, 2));
  // If the user updates a task name, project name, client name, status, budget etc. in Notion,
  // a webhook (if configured) could trigger a selective re-sync of that item.
  // For now, a simple full re-sync or targeted re-sync can be triggered.
  // Example: if (payload.type === 'page.updated' && payload.page.database_id === NOTION_TASKS_DB_ID) {
  //   await syncTasksWithDb(); // Or a more targeted sync for the specific page ID.
  // }
  // console.log('Webhook processing: For now, consider a full sync or more targeted sync based on payload.');
  // await syncAllFromNotion(); // Be cautious with full syncs on every webhook to avoid rate limits.
}

module.exports = {
  initializeNotionClient,
  fetchNotionClients,
  fetchNotionProjects,
  fetchNotionTasks,
  syncClientsWithDb,
  syncProjectsWithDb,
  syncTasksWithDb,
  syncAllFromNotion,
  updateLocalRelationalIds,
  handleNotionWebhook, // Keep for potential future use or if Notion is updated manually
  // getDb: db.getDb // Can be re-exported if needed elsewhere
};