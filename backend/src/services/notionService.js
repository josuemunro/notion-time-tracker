// notion-time-tracker/backend/src/services/notionService.js
const { Client, APIErrorCode } = require('@notionhq/client'); // Removed ClientErrorCode as it's not used now
const db = require('../database'); // To interact with SQLite
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

/**
 * Helper to extract people value from a Notion property.
 */
function getPeopleValue(property) {
  if (property && property.people && property.people.length > 0) {
    return property.people.map(person => person.name || person.id).join(', ');
  }
  return null;
}

/**
 * Helper to extract date value (start date) from a Notion property.
 */
function getDateValue(property) {
  if (property && property.date && property.date.start) {
    return property.date.start;
  }
  return null;
}

/**
 * Helper to extract icon value from a Notion page.
 */
function getIconValue(page) {
  if (page.icon) {
    if (page.icon.type === 'emoji') {
      return {
        type: 'emoji',
        value: page.icon.emoji
      };
    } else if (page.icon.type === 'external') {
      return {
        type: 'external',
        value: page.icon.external.url
      };
    } else if (page.icon.type === 'file') {
      // Note: Notion file URLs expire after ~1 hour, so we store the URL but
      // should handle the case where it might be expired when fetched
      return {
        type: 'file',
        value: page.icon.file.url,
        expiryTime: page.icon.file.expiry_time
      };
    }
  }
  return null;
}

/**
 * Downloads an icon from a URL and saves it locally
 * @param {string} iconUrl - The URL of the icon to download
 * @param {string} projectNotionId - The Notion ID of the project (for filename)
 * @returns {Promise<string|null>} - The local file path relative to assets, or null if failed
 */
async function downloadAndStoreIcon(iconUrl, projectNotionId) {
  try {
    const parsedUrl = new URL(iconUrl);
    let extension = path.extname(parsedUrl.pathname) || '.png';

    // Hash only the stable path (not query params which contain rotating S3 tokens)
    const hash = crypto.createHash('md5').update(parsedUrl.pathname + projectNotionId).digest('hex');
    const filename = `${projectNotionId}_${hash}${extension}`;
    const assetsDir = path.join(__dirname, '../../assets/icons');
    const filePath = path.join(assetsDir, filename);

    // Skip download if icon already exists locally
    if (fs.existsSync(filePath)) {
      const relativePath = `icons/${filename}`;
      console.log(`⏩ Icon already cached: ${relativePath}`);
      return relativePath;
    }

    console.log(`📥 Downloading icon for project ${projectNotionId}...`);

    const response = await axios.get(iconUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Detect extension from content-type if URL didn't have one
    if (extension === '.png') {
      const contentType = response.headers['content-type'];
      if (contentType) {
        if (contentType.includes('jpg') || contentType.includes('jpeg')) extension = '.jpg';
        else if (contentType.includes('gif')) extension = '.gif';
        else if (contentType.includes('svg')) extension = '.svg';
        else if (contentType.includes('webp')) extension = '.webp';
      }
    }

    fs.writeFileSync(filePath, response.data);

    const relativePath = `icons/${filename}`;
    console.log(`✅ Icon downloaded successfully: ${relativePath}`);
    return relativePath;

  } catch (error) {
    console.error(`❌ Failed to download icon for project ${projectNotionId}:`, error.message);
    return null;
  }
}

/**
 * Processes an icon value, downloading it if it's a file/external URL
 * @param {Object} icon - Icon object with type and value
 * @param {string} projectNotionId - The Notion ID of the project
 * @returns {Promise<Object>} - Updated icon object with local path if applicable
 */
async function processProjectIcon(icon, projectNotionId) {
  if (!icon) return null;

  // For emojis, return as-is
  if (icon.type === 'emoji') {
    return icon;
  }

  // For external and file URLs, download and store locally
  if ((icon.type === 'external' || icon.type === 'file') && icon.value) {
    const localPath = await downloadAndStoreIcon(icon.value, projectNotionId);

    if (localPath) {
      // Return the local URL that the frontend can use
      return {
        type: 'local',
        value: `/assets/${localPath}`,
        originalUrl: icon.value // Keep original for reference
      };
    } else {
      // If download failed, keep the original but mark it as potentially expired
      console.warn(`⚠️ Keeping original icon URL for project ${projectNotionId}, but it may expire`);
      return icon;
    }
  }

  return icon;
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
    status: getStatusValue(page.properties.Status) || getSelectValue(page.properties.Status) || getSelectValue(page.properties.Stage),
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
  return pages.map(page => {
    const icon = getIconValue(page);
    return {
      notionId: page.id,
      name: getTitleValue(page.properties['Project Name']), // Assumes 'Project Name' is title
      notionClientId: getRelationId(page.properties['Client Link']),
      budgetedTime: getNumberValue(page.properties['Budget (hrs)']),
      status: getStatusValue(page.properties['Status']) || getSelectValue(page.properties['Status']),
      iconType: icon ? icon.type : null,
      iconValue: icon ? icon.value : null,
      color: getSelectValue(page.properties['Color']) || null, // Extract color if available
      lastEditedTime: page.last_edited_time,
    };
  });
}

async function fetchNotionTasks() {
  if (!notionClient || !NOTION_TASKS_DB_ID) {
    console.warn('Notion client or Tasks DB ID not configured for fetchNotionTasks.');
    return [];
  }
  console.log('Fetching tasks from Notion...');

  // Create filter - only use user filter if NOTION_USER_ID is provided and looks like a UUID
  let filter = undefined;
  const userId = process.env.NOTION_USER_ID;

  const filterConditions = [];

  // Only sync tasks (not pages)
  filterConditions.push({
    property: 'Task or Page',
    select: { equals: 'Task' }
  });

  // Only sync tasks with a deadline
  filterConditions.push({
    property: 'Deadline',
    date: { is_not_empty: true }
  });

  // Only sync active tasks (To Do or Doing)
  filterConditions.push({
    or: [
      { property: 'Status', status: { equals: 'To Do' } },
      { property: 'Status', status: { equals: 'Doing' } }
    ]
  });

  if (userId && userId.length > 20 && userId.includes('-')) {
    filterConditions.push({
      or: [
        { property: 'Assign', people: { contains: userId } },
        { property: 'Assign', people: { is_empty: true } }
      ]
    });
    console.log('Applying user filter for:', userId);
  } else {
    console.log('No valid NOTION_USER_ID provided, fetching all tasks');
  }

  filter = filterConditions.length === 1 ? filterConditions[0] : { and: filterConditions };

  const pages = await queryNotionDatabase(NOTION_TASKS_DB_ID, filter);
  return pages.map(page => ({
    notionId: page.id,
    name: getTitleValue(page.properties['Task Name']),
    notionProjectId: getRelationId(page.properties['Project Link']),
    status: getStatusValue(page.properties['Status']) || getSelectValue(page.properties['Status']),
    isBillable: getCheckboxValue(page.properties['Is Billable']),
    assignee: getPeopleValue(page.properties['Assign']),
    deadline: getDateValue(page.properties['Deadline']),
    taskOrPage: getSelectValue(page.properties['Task or Page']),
    lastEditedTime: page.last_edited_time,
  })).filter(task => {
    if (userId && userId.length > 20 && userId.includes('-')) {
      return !task.assignee || task.assignee.includes('Josue Munro');
    }
    return true;
  });
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
        INSERT INTO Clients (notionId, name, status, updatedAt)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(notionId) DO UPDATE SET
          name = excluded.name,
          status = excluded.status,
          updatedAt = excluded.updatedAt;
      `);
      let completed = 0;
      notionClients.forEach(client => {
        stmt.run(client.notionId, client.name, client.status, client.lastEditedTime, (err) => {
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

  // Process icons in parallel (batches of 5 to avoid overwhelming the network)
  console.log('🔄 Processing project icons...');
  const BATCH_SIZE = 5;
  for (let i = 0; i < notionProjects.length; i += BATCH_SIZE) {
    const batch = notionProjects.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (proj) => {
      if (proj.iconType && proj.iconValue) {
        const icon = { type: proj.iconType, value: proj.iconValue };
        const processedIcon = await processProjectIcon(icon, proj.notionId);
        if (processedIcon) {
          proj.iconType = processedIcon.type;
          proj.iconValue = processedIcon.value;
          proj.originalIconUrl = processedIcon.originalUrl;
        }
      }
    }));
  }
  console.log('✅ Icon processing complete');

  const localDb = db.getDb();
  return new Promise((resolve, reject) => {
    localDb.serialize(() => {
      const stmt = localDb.prepare(`
        INSERT INTO Projects (notionId, name, notionClientId, budgetedTime, status, iconType, iconValue, color, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(notionId) DO UPDATE SET
          name = excluded.name,
          notionClientId = excluded.notionClientId,
          budgetedTime = excluded.budgetedTime,
          status = excluded.status,
          iconType = excluded.iconType,
          iconValue = excluded.iconValue,
          -- Only update color if we actually have color data from Notion (preserve local colors)
          color = CASE WHEN excluded.color IS NOT NULL THEN excluded.color ELSE Projects.color END,
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
          proj.iconType,
          proj.iconValue,
          proj.color || null,
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
        INSERT INTO Tasks (notionId, name, notionProjectId, status, isBillable, assignee, deadline, taskOrPage, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(notionId) DO UPDATE SET
          name = excluded.name,
          notionProjectId = excluded.notionProjectId,
          status = excluded.status,
          isBillable = excluded.isBillable,
          assignee = excluded.assignee,
          deadline = excluded.deadline,
          taskOrPage = excluded.taskOrPage,
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
          task.assignee,
          task.deadline,
          task.taskOrPage,
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
        `, function (err) { // Added condition to re-update if changed
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
        `, function (err) { // Added condition to re-update if changed
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