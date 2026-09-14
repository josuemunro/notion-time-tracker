import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSettings, updateSettings } from '../services/api';
import { DEFAULT_TIME_ZONE, isValidTimeZone, setTimeZone as applyTimeZone } from '../utils/timeUtils';

// App settings (currently just the display timezone). The server copy is the
// source of truth — it also uses the timezone to decide where days start and
// end — and localStorage keeps the last known value so the first paint after
// a reload already uses the right zone.

const STORAGE_KEY = 'app_settings';

const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};

const writeCache = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode / quota — the server copy is what matters */
  }
};

const SettingsContext = createContext({
  timeZone: DEFAULT_TIME_ZONE,
  updateTimeZone: async () => DEFAULT_TIME_ZONE,
});

export const SettingsProvider = ({ children }) => {
  const [timeZone, setTimeZoneState] = useState(() => {
    const cached = readCache().timeZone;
    const initial = isValidTimeZone(cached) ? cached : DEFAULT_TIME_ZONE;
    applyTimeZone(initial); // before any child computes "today"
    return initial;
  });
  const [isLoaded, setIsLoaded] = useState(false);

  const apply = useCallback((tz) => {
    if (!isValidTimeZone(tz)) return;
    applyTimeZone(tz);
    setTimeZoneState(tz);
    writeCache({ timeZone: tz });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then(({ data }) => { if (!cancelled) apply(data?.timeZone); })
      .catch((err) => console.error('Failed to load settings, using cached/default timezone:', err))
      .finally(() => { if (!cancelled) setIsLoaded(true); });
    return () => { cancelled = true; };
  }, [apply]);

  const updateTimeZone = useCallback(async (tz) => {
    const { data } = await updateSettings({ timeZone: tz });
    apply(data.timeZone);
    return data.timeZone;
  }, [apply]);

  // Hold rendering until the server has answered so no view is built on the wrong zone
  if (!isLoaded) return null;

  return (
    <SettingsContext.Provider value={{ timeZone, updateTimeZone }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
