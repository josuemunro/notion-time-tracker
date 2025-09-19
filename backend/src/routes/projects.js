// notion-time-tracker/backend/src/routes/projects.js
const express = require('express');
const router = express.Router();
const database = require('../database'); // Import the database module

// GET /api/projects - Get all projects with aggregated time and client info
router.get('/', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  try {
    const query = `
      SELECT
        p.id,
        p.notionId,
        p.name,
        p.budgetedTime,
        p.status,
              p.iconType,
      p.iconValue,
      p.color,
        p.createdAt AS projectCreatedAt,
        p.updatedAt AS projectUpdatedAt,
        c.id AS clientId,
        c.name AS clientName,
        c.notionId AS clientNotionId,
        COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent
      FROM Projects p
      LEFT JOIN Clients c ON p.clientId = c.id
      LEFT JOIN Tasks t ON p.id = t.projectId
      LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
      GROUP BY p.id, p.notionId, p.name, p.budgetedTime, p.status, p.iconType, p.iconValue, p.color, p.createdAt, p.updatedAt, c.id, c.name, c.notionId
      ORDER BY p.name COLLATE NOCASE;
    `;
    db.all(query, [], (err, rows) => {
      if (err) return next(err);
      res.json(rows.map(row => ({
        ...row,
        percentageBudgetUsed: row.budgetedTime > 0 ? ((row.totalHoursSpent / row.budgetedTime) * 100) : 0
      })));
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/active - Get all active projects with aggregated time and client info
router.get('/active', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  try {
    const query = `
      SELECT
        p.id,
        p.notionId,
        p.name,
        p.budgetedTime,
        p.status,
        p.iconType,
        p.iconValue,
        p.color,
        p.createdAt AS projectCreatedAt,
        p.updatedAt AS projectUpdatedAt,
        c.id AS clientId,
        c.name AS clientName,
        c.notionId AS clientNotionId,
        COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent
      FROM Projects p
      LEFT JOIN Clients c ON p.clientId = c.id
      LEFT JOIN Tasks t ON p.id = t.projectId
      LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
      WHERE p.status IN ('Proposal', 'In Progress', 'Ongoing')
      GROUP BY p.id, p.notionId, p.name, p.budgetedTime, p.status, p.iconType, p.iconValue, p.color, p.createdAt, p.updatedAt, c.id, c.name, c.notionId
      ORDER BY p.name COLLATE NOCASE;
    `;
    db.all(query, [], (err, rows) => {
      if (err) return next(err);
      res.json(rows.map(row => ({
        ...row,
        percentageBudgetUsed: row.budgetedTime > 0 ? ((row.totalHoursSpent / row.budgetedTime) * 100) : 0
      })));
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:projectId - Get a specific project with its tasks and aggregated time
router.get('/:projectId', async (req, res, next) => {
  const db = database.getDb(); // Get db instance inside the handler
  const { projectId: idOrNotionId } = req.params;
  try {
    const projectQuery = `
      SELECT
        p.id,
        p.notionId,
        p.name,
        p.budgetedTime,
        p.hourlyRate,
        p.status,
        p.iconType,
        p.iconValue,
        p.color,
        p.createdAt,
        p.updatedAt,
        c.id AS clientId,
        c.name AS clientName,
        COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent
      FROM Projects p
      LEFT JOIN Clients c ON p.clientId = c.id
      LEFT JOIN Tasks t ON p.id = t.projectId
      LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
      WHERE (p.id = ? OR p.notionId = ?)
      GROUP BY p.id, p.notionId, p.name, p.budgetedTime, p.hourlyRate, p.status, p.iconType, p.iconValue, p.color, p.createdAt, p.updatedAt, c.id, c.name;
    `;
    db.get(projectQuery, [idOrNotionId, idOrNotionId], (err, project) => {
      if (err) return next(err);
      if (!project) return res.status(404).json({ message: 'Project not found' });

      const tasksQuery = `
        SELECT
          t.id,
          t.notionId,
          t.name,
          t.status,
          t.isBillable,
          t.beenBilled,
          COALESCE(SUM(te.duration), 0) / 3600.0 AS totalHoursSpent,
          (SELECT te_active.startTime FROM TimeEntries te_active WHERE te_active.taskId = t.id AND te_active.endTime IS NULL LIMIT 1) AS activeTimerStartTime
        FROM Tasks t
        LEFT JOIN TimeEntries te ON t.id = te.taskId AND te.endTime IS NOT NULL
        WHERE t.projectId = ?
        GROUP BY t.id, t.notionId, t.name, t.status, t.isBillable, t.beenBilled
        ORDER BY t.name COLLATE NOCASE;
      `;
      db.all(tasksQuery, [project.id], (err, tasks) => {
        if (err) return next(err);
        res.json({
          ...project,
          percentageBudgetUsed: project.budgetedTime > 0 ? ((project.totalHoursSpent / project.budgetedTime) * 100) : 0,
          tasks
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/projects/:projectId - Update a project's local properties (color, hourlyRate, etc.)
router.put('/:projectId', async (req, res, next) => {
  const db = database.getDb();
  const { projectId } = req.params;
  const { color, hourlyRate } = req.body;

  if (!color && hourlyRate === undefined) {
    return res.status(400).json({ message: 'color or hourlyRate is required.' });
  }

  // Validate hex color format if provided
  if (color) {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexColorRegex.test(color)) {
      return res.status(400).json({ message: 'color must be a valid hex color (e.g., #FF5733 or #F53)' });
    }
  }

  // Validate hourlyRate if provided
  if (hourlyRate !== undefined && (isNaN(hourlyRate) || hourlyRate < 0)) {
    return res.status(400).json({ message: 'hourlyRate must be a non-negative number.' });
  }

  try {
    let updateQuery = 'UPDATE Projects SET ';
    const params = [];
    const updates = [];

    if (color) {
      updates.push('color = ?');
      params.push(color);
    }

    if (hourlyRate !== undefined) {
      updates.push('hourlyRate = ?');
      params.push(hourlyRate);
    }

    updateQuery += updates.join(', ') + ' WHERE id = ? OR notionId = ?';
    params.push(projectId, projectId);

    db.run(updateQuery, params, function (err) {
      if (err) return next(err);
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Project not found.' });
      }
      res.json({
        message: 'Project updated successfully.',
        projectId: projectId,
        ...(color && { color }),
        ...(hourlyRate !== undefined && { hourlyRate })
      });
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/projects/:projectId/tasks/billing - Update billing status for multiple tasks
router.put('/:projectId/tasks/billing', async (req, res, next) => {
  const db = database.getDb();
  const { projectId } = req.params;
  const { taskIds, beenBilled } = req.body;

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({ message: 'taskIds array is required and cannot be empty.' });
  }

  if (typeof beenBilled !== 'boolean') {
    return res.status(400).json({ message: 'beenBilled must be a boolean.' });
  }

  try {
    // First verify that all tasks belong to the specified project
    const verifyQuery = `
      SELECT COUNT(*) as count 
      FROM Tasks t 
      JOIN Projects p ON t.projectId = p.id 
      WHERE t.id IN (${taskIds.map(() => '?').join(',')}) 
      AND (p.id = ? OR p.notionId = ?)
    `;

    db.get(verifyQuery, [...taskIds, projectId, projectId], (err, result) => {
      if (err) return next(err);

      if (result.count !== taskIds.length) {
        return res.status(400).json({ message: 'Some tasks do not belong to this project.' });
      }

      // Update the billing status
      const updateQuery = `
        UPDATE Tasks 
        SET beenBilled = ? 
        WHERE id IN (${taskIds.map(() => '?').join(',')})
      `;

      db.run(updateQuery, [beenBilled, ...taskIds], function (err) {
        if (err) return next(err);
        res.json({
          message: `Updated billing status for ${this.changes} tasks.`,
          tasksUpdated: this.changes,
          beenBilled
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/projects/test - Create a test project with billable tasks
router.post('/test', async (req, res, next) => {
  const db = database.getDb();

  try {
    // Create test project
    const projectQuery = `
      INSERT INTO Projects (notionId, name, hourlyRate, status, iconType, iconValue, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const projectNotionId = 'test-project-' + Date.now();

    db.run(projectQuery, [
      projectNotionId,
      'Test Billing Project',
      85.0,
      'In Progress',
      'emoji',
      '🧪',
      '#10b981'
    ], function (projectErr) {
      if (projectErr) return next(projectErr);

      const projectId = this.lastID;

      // Create test tasks
      const taskQuery = `
        INSERT INTO Tasks (notionId, name, projectId, status, isBillable, beenBilled)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const testTasks = [
        ['test-task-1-' + Date.now(), 'Design Homepage', 'Done', true, false],
        ['test-task-2-' + Date.now(), 'Setup Backend API', 'Done', true, false],
        ['test-task-3-' + Date.now(), 'Create Database Schema', 'Done', true, true],
        ['test-task-4-' + Date.now(), 'Write Tests', 'In Progress', true, false],
        ['test-task-5-' + Date.now(), 'Team Meeting', 'Done', false, false],
        ['test-task-6-' + Date.now(), 'Code Review', 'Done', true, false]
      ];

      let completedTasks = 0;

      testTasks.forEach(([notionId, name, status, isBillable, beenBilled]) => {
        db.run(taskQuery, [notionId, name, projectId, status, isBillable ? 1 : 0, beenBilled ? 1 : 0], (taskErr) => {
          if (taskErr) console.error('Error creating test task:', taskErr);
          completedTasks++;

          if (completedTasks === testTasks.length) {
            // Create some time entries for the tasks
            const timeEntryQuery = `
              INSERT INTO TimeEntries (taskId, notionTaskId, startTime, endTime, duration)
              VALUES (?, ?, ?, ?, ?)
            `;

            // Add time entries for some tasks
            const baseTime = new Date();
            baseTime.setHours(9, 0, 0, 0);

            // Get the actual task IDs from the database
            db.all(`SELECT id, name FROM Tasks WHERE projectId = ?`, [projectId], (err, tasks) => {
              if (err) {
                console.error('Error fetching task IDs:', err);
                return res.json({
                  message: 'Test project created successfully',
                  projectId: projectId,
                  tasksCreated: testTasks.length
                });
              }

              const taskMap = {};
              tasks.forEach(task => {
                taskMap[task.name] = task.id;
              });

              // Add time entries for specific tasks
              const timeEntries = [
                {
                  taskId: taskMap['Design Homepage'],
                  hours: 2.5,
                  offset: 0
                },
                {
                  taskId: taskMap['Setup Backend API'],
                  hours: 3.25,
                  offset: 4
                },
                {
                  taskId: taskMap['Create Database Schema'],
                  hours: 1.75,
                  offset: 8
                },
                {
                  taskId: taskMap['Write Tests'],
                  hours: 4.0,
                  offset: 10
                },
                {
                  taskId: taskMap['Code Review'],
                  hours: 1.5,
                  offset: 15
                }
              ];

              let completedEntries = 0;

              timeEntries.forEach(({ taskId, hours, offset }) => {
                if (taskId) {
                  const startTime = new Date(baseTime.getTime() + offset * 60 * 60 * 1000);
                  const endTime = new Date(startTime.getTime() + hours * 60 * 60 * 1000);

                  db.run(timeEntryQuery, [
                    taskId,
                    `test-task-${taskId}-${Date.now()}`,
                    startTime.toISOString(),
                    endTime.toISOString(),
                    hours * 3600
                  ], (entryErr) => {
                    if (entryErr) console.error('Error creating time entry:', entryErr);
                    completedEntries++;

                    if (completedEntries === timeEntries.length) {
                      res.json({
                        message: 'Test project created successfully',
                        projectId: projectId,
                        tasksCreated: testTasks.length,
                        timeEntriesCreated: timeEntries.length
                      });
                    }
                  });
                } else {
                  completedEntries++;
                  if (completedEntries === timeEntries.length) {
                    res.json({
                      message: 'Test project created successfully',
                      projectId: projectId,
                      tasksCreated: testTasks.length,
                      timeEntriesCreated: completedEntries
                    });
                  }
                }
              });
            });
          }
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/projects/:projectId - Delete a project and all its tasks
router.delete('/:projectId', async (req, res, next) => {
  const db = database.getDb();
  const { projectId } = req.params;

  try {
    // First, delete all time entries for tasks in this project
    const deleteTimeEntriesQuery = `
      DELETE FROM TimeEntries 
      WHERE taskId IN (SELECT id FROM Tasks WHERE projectId = ?)
    `;

    db.run(deleteTimeEntriesQuery, [projectId], (err) => {
      if (err) return next(err);

      // Then delete all tasks for this project
      const deleteTasksQuery = `DELETE FROM Tasks WHERE projectId = ?`;

      db.run(deleteTasksQuery, [projectId], (err) => {
        if (err) return next(err);

        // Finally delete the project
        const deleteProjectQuery = `DELETE FROM Projects WHERE id = ?`;

        db.run(deleteProjectQuery, [projectId], function (err) {
          if (err) return next(err);

          if (this.changes === 0) {
            return res.status(404).json({ message: 'Project not found.' });
          }

          res.json({
            message: 'Project deleted successfully',
            projectId: projectId
          });
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;