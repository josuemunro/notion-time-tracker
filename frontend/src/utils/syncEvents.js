import { useEffect, useRef } from 'react';

// App-wide "Notion sync finished" signal. The Navbar fires it after a
// successful sync; pages that show synced data (tasks, projects, clients)
// subscribe so they refetch without a manual refresh.
const SYNC_COMPLETE_EVENT = 'notion-sync-complete';

export const notifySyncComplete = () => {
  window.dispatchEvent(new Event(SYNC_COMPLETE_EVENT));
};

// Calls the latest `callback` after every successful sync (no stale closures).
export const useSyncComplete = (callback) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler = () => callbackRef.current?.();
    window.addEventListener(SYNC_COMPLETE_EVENT, handler);
    return () => window.removeEventListener(SYNC_COMPLETE_EVENT, handler);
  }, []);
};
