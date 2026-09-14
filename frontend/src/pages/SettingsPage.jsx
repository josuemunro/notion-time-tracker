import React, { useEffect, useMemo, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import { listTimeZones, getBrowserTimeZone, localParts, formatDateTime } from '../utils/timeUtils';
import { downloadBackup, getBackupSnapshots, downloadBackupSnapshot } from '../services/api';
import { GlobeAltIcon, ArrowPathIcon, CheckIcon, CircleStackIcon, ArrowDownTrayIcon } from '@heroicons/react/24/solid';

// Hand a blob response to the browser as a file download
const saveBlob = (response, fallbackName) => {
  const disposition = response.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const formatBytes = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const pad = (n) => String(n).padStart(2, '0');

// Live clock for a candidate zone so the choice can be sanity-checked before saving
const previewIn = (timeZone, now) => {
  try {
    const p = localParts(now, timeZone);
    const weekday = new Intl.DateTimeFormat('en-NZ', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    const offset = new Intl.DateTimeFormat('en-NZ', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(now).find(part => part.type === 'timeZoneName')?.value;
    return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)} on ${weekday}${offset ? ` (${offset})` : ''}`;
  } catch {
    return 'Unknown timezone';
  }
};

function SettingsPage() {
  const { timeZone, updateTimeZone } = useSettings();
  const { showSuccess, showError } = useToast();
  const [selected, setSelected] = useState(timeZone);
  const [isSaving, setIsSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const zones = useMemo(() => listTimeZones(), []);
  const browserZone = useMemo(() => getBrowserTimeZone(), []);
  const isDirty = selected !== timeZone;

  // Backups
  const [snapshots, setSnapshots] = useState([]);
  const [isDownloading, setIsDownloading] = useState(null); // 'live' | snapshot name | null

  const loadSnapshots = async () => {
    try {
      const { data } = await getBackupSnapshots();
      setSnapshots(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to list backup snapshots:', err);
    }
  };

  useEffect(() => {
    loadSnapshots();
  }, []);

  const handleDownloadBackup = async () => {
    setIsDownloading('live');
    try {
      saveBlob(await downloadBackup(), 'notion_time_tracker.sqlite');
      showSuccess('Backup downloaded');
    } catch (err) {
      console.error('Failed to download backup:', err);
      showError('Failed to download backup');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadSnapshot = async (name) => {
    setIsDownloading(name);
    try {
      saveBlob(await downloadBackupSnapshot(name), name);
    } catch (err) {
      console.error('Failed to download snapshot:', err);
      showError('Failed to download snapshot');
    } finally {
      setIsDownloading(null);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      const saved = await updateTimeZone(selected);
      showSuccess(`Timezone set to ${saved}`);
    } catch (err) {
      console.error('Failed to save timezone:', err);
      showError(err.response?.data?.message || 'Failed to save timezone');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">App-wide preferences. Saved on the server, so they apply on every device.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-200">
          <GlobeAltIcon className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Timezone</h2>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-sm text-gray-600">
            Times are stored as exact moments, so changing the timezone only changes how they are shown
            and where each day starts and ends. Days roll over at midnight in this zone, and a timer
            running across midnight is split into one entry per day.
          </p>

          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1.5">
              Display timezone
            </label>
            <select
              id="timezone"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {!zones.includes(selected) && <option value={selected}>{selected}</option>}
              {zones.map((zone) => (
                <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>
              ))}
            </select>
            {browserZone && browserZone !== selected && (
              <button
                type="button"
                onClick={() => setSelected(browserZone)}
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Use this device's timezone ({browserZone.replace(/_/g, ' ')})
              </button>
            )}
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Right now in {selected.replace(/_/g, ' ')}</span>
              <span className="font-medium text-gray-900 tabular-nums">{previewIn(selected, now)}</span>
            </div>
            {isDirty && (
              <div className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t border-gray-200">
                <span className="text-gray-500">Currently saved: {timeZone.replace(/_/g, ' ')}</span>
                <span className="text-gray-700 tabular-nums">{previewIn(timeZone, now)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            {isDirty && (
              <button
                type="button"
                onClick={() => setSelected(timeZone)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            >
              {isSaving ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckIcon className="h-4 w-4" />}
              {isSaving ? 'Saving…' : 'Save timezone'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-200">
          <CircleStackIcon className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Backups</h2>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-600">
              Download a complete copy of the database (clients, projects, tasks, time entries, bills) as a SQLite file.
            </p>
            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={isDownloading !== null}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            >
              {isDownloading === 'live' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
              Download backup
            </button>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1.5">Snapshots on the server</h3>
            <p className="text-xs text-gray-500 mb-3">
              Automatic copies taken before data migrations. They live on the persistent volume next to the database.
            </p>
            {snapshots.length === 0 ? (
              <p className="text-sm text-gray-400">No snapshots yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {snapshots.map((snap) => (
                  <div key={snap.name} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{snap.name}</div>
                      <div className="text-xs text-gray-500">{formatDateTime(snap.createdAt)} · {formatBytes(snap.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadSnapshot(snap.name)}
                      disabled={isDownloading !== null}
                      title="Download snapshot"
                      className="p-2 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      {isDownloading === snap.name ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
