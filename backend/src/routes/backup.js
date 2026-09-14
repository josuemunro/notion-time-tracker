// notion-time-tracker/backend/src/routes/backup.js
//
// Database backups. Protected by the normal /api auth middleware.
//   GET /api/backup                  — stream a consistent copy of the live DB
//   GET /api/backup/snapshots        — list on-volume snapshots (e.g. pre-migration)
//   GET /api/backup/snapshots/:name  — download one snapshot
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const router = express.Router();
const database = require('../database');

const SNAPSHOT_NAME = /^[A-Za-z0-9._-]+\.sqlite$/; // no path separators, ever

const downloadName = (prefix) => `${prefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sqlite`;

router.get('/', async (req, res, next) => {
  const tmpFile = path.join(os.tmpdir(), `ntt-backup-${process.pid}-${Date.now()}.sqlite`);
  try {
    await database.vacuumInto(tmpFile);
    res.download(tmpFile, downloadName('notion_time_tracker'), (err) => {
      fs.unlink(tmpFile, () => { });
      if (err && !res.headersSent) next(err);
    });
  } catch (error) {
    fs.unlink(tmpFile, () => { });
    next(error);
  }
});

router.get('/snapshots', (req, res, next) => {
  try {
    const dir = database.getBackupsDir();
    const snapshots = fs.readdirSync(dir)
      .filter((name) => SNAPSHOT_NAME.test(name))
      .map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(snapshots);
  } catch (error) {
    next(error);
  }
});

router.get('/snapshots/:name', (req, res, next) => {
  const { name } = req.params;
  if (!SNAPSHOT_NAME.test(name)) return res.status(400).json({ message: 'Invalid snapshot name.' });
  const file = path.join(database.getBackupsDir(), name);
  if (!fs.existsSync(file)) return res.status(404).json({ message: 'Snapshot not found.' });
  res.download(file, name, (err) => {
    if (err && !res.headersSent) next(err);
  });
});

module.exports = router;
