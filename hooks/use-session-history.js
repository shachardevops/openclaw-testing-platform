'use client';

import { startTransition, useState, useRef, useCallback, useEffect } from 'react';

/**
 * Polls session history for a given task ID.
 * Returns parsed conversation entries with incremental updates.
 *
 * On initial load, the server returns only the last ~100 entries.
 * Use loadEarlier() to fetch older messages on demand.
 *
 * When no new entries arrive for RECHECK_INTERVAL, re-resolves the taskId
 * to pick up new sessions (e.g. after model swap or respawn).
 */
const RECHECK_INTERVAL = 60_000; // Re-resolve taskId every 60s of no new entries
const OLDER_PAGE_SIZE = 60;

export function useSessionHistory(taskId, { enabled = true, interval = 4000, hintSessionId = null } = {}) {
  const [entries, setEntries] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const offsetRef = useRef(0);
  const headOffsetRef = useRef(0);
  const timerRef = useRef(null);
  const taskIdRef = useRef(taskId);
  const sessionIdRef = useRef(null);
  const lastNewEntriesRef = useRef(Date.now());

  // Reset when taskId changes
  useEffect(() => {
    if (taskId !== taskIdRef.current) {
      taskIdRef.current = taskId;
      sessionIdRef.current = null;
      setEntries([]);
      setSessionId(null);
      setTruncated(false);
      offsetRef.current = 0;
      headOffsetRef.current = 0;
      lastNewEntriesRef.current = Date.now();
    }
  }, [taskId]);

  // Accept hint session ID from external source (e.g. session manager)
  const hintSessionIdRef = useRef(hintSessionId);
  hintSessionIdRef.current = hintSessionId;

  // When a hint arrives and we have no resolved session yet, adopt it immediately
  useEffect(() => {
    if (hintSessionId && !sessionIdRef.current && taskId) {
      sessionIdRef.current = hintSessionId;
      setSessionId(hintSessionId);
      offsetRef.current = 0;
      lastNewEntriesRef.current = Date.now();
    }
  }, [hintSessionId, taskId]);

  const poll = useCallback(async () => {
    if (!taskIdRef.current) return;
    try {
      const params = new URLSearchParams();

      // If we have a session but haven't seen new entries for a while,
      // re-resolve by taskId to pick up new/replacement sessions
      const staleSince = Date.now() - lastNewEntriesRef.current;
      const shouldRecheck = sessionIdRef.current && staleSince > RECHECK_INTERVAL;

      if (shouldRecheck) {
        // Query by taskId to see if there's a newer session
        params.set('taskId', taskIdRef.current);
        params.set('offset', '0');
        params.set('recheck', '1');
      } else if (sessionIdRef.current) {
        params.set('sessionId', sessionIdRef.current);
        params.set('offset', String(offsetRef.current));
      } else if (hintSessionIdRef.current) {
        // Use hint from session manager when own resolution hasn't found a session yet
        sessionIdRef.current = hintSessionIdRef.current;
        setSessionId(hintSessionIdRef.current);
        params.set('sessionId', hintSessionIdRef.current);
        params.set('offset', String(offsetRef.current));
      } else {
        params.set('taskId', taskIdRef.current);
        params.set('offset', String(offsetRef.current));
      }

      const res = await fetch(`/api/session-history?${params}`);
      const data = await res.json();

      if (!data.ok) return;

      // Track truncation state from server
      if (data.truncatedHead) {
        setTruncated(true);
        headOffsetRef.current = data.headOffset;
      }

      // Check if session changed (new session spawned for same task)
      if (shouldRecheck && data.sessionId && data.sessionId !== sessionIdRef.current) {
        // New session detected! Keep old entries but append a separator, then new entries
        sessionIdRef.current = data.sessionId;
        setSessionId(data.sessionId);
        offsetRef.current = data.nextOffset;
        headOffsetRef.current = data.headOffset || 0;
        setTruncated(!!data.truncatedHead);
        lastNewEntriesRef.current = Date.now();

        if (data.entries?.length > 0) {
          const separator = {
            id: `session-change-${Date.now()}`,
            kind: 'session_change',
            timestamp: new Date().toISOString(),
            newSessionId: data.sessionId,
          };
          setEntries(prev => [...prev, separator, ...data.entries]);
        }
        return;
      }

      // Normal incremental update
      if (data.entries?.length > 0) {
        startTransition(() => {
          setEntries(prev => [...prev, ...data.entries]);
        });
        offsetRef.current = data.nextOffset;
        lastNewEntriesRef.current = Date.now();
      }

      // Lock in session ID on first resolve
      if (data.sessionId && !sessionIdRef.current) {
        sessionIdRef.current = data.sessionId;
        setSessionId(data.sessionId);
      }

      // If recheck found same session, just update offset
      if (shouldRecheck && data.sessionId === sessionIdRef.current) {
        offsetRef.current = data.nextOffset;
        lastNewEntriesRef.current = Date.now(); // Reset timer
      }
    } catch { /* ignore polling errors */ }
  }, []);

  useEffect(() => {
    if (!enabled || !taskId) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Initial fetch
    setLoading(true);
    poll().finally(() => setLoading(false));

    // Poll interval
    timerRef.current = setInterval(poll, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, taskId, poll, interval]);

  const clear = useCallback(() => {
    setEntries([]);
    setSessionId(null);
    setTruncated(false);
    sessionIdRef.current = null;
    offsetRef.current = 0;
    headOffsetRef.current = 0;
    lastNewEntriesRef.current = Date.now();
  }, []);

  // Load full history for a specific session
  const loadSession = useCallback(async (sid) => {
    setEntries([]);
    setSessionId(sid);
    sessionIdRef.current = sid;
    offsetRef.current = 0;
    headOffsetRef.current = 0;
    setTruncated(false);
    lastNewEntriesRef.current = Date.now();
    try {
      const res = await fetch(`/api/session-history?sessionId=${encodeURIComponent(sid)}&offset=0`);
      const data = await res.json();
      if (data.ok && data.entries) {
        setEntries(data.entries);
        offsetRef.current = data.nextOffset;
        if (data.truncatedHead) {
          setTruncated(true);
          headOffsetRef.current = data.headOffset;
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Load earlier (older) messages that were truncated
  const loadEarlier = useCallback(async () => {
    if (!sessionIdRef.current || headOffsetRef.current <= 0) return;
    setLoadingEarlier(true);
    try {
      const res = await fetch(
        `/api/session-history?sessionId=${encodeURIComponent(sessionIdRef.current)}&before=${headOffsetRef.current}&limit=${OLDER_PAGE_SIZE}`
      );
      const data = await res.json();
      if (data.ok && data.entries) {
        startTransition(() => {
          setEntries(prev => [...data.entries, ...prev]);
        });
        offsetRef.current = data.nextOffset;
        headOffsetRef.current = data.headOffset || 0;
        setTruncated(!!data.truncatedHead);
      }
    } catch { /* ignore */ } finally {
      setLoadingEarlier(false);
    }
  }, []);

  return { entries, sessionId, loading, truncated, loadingEarlier, clear, loadSession, loadEarlier };
}
