'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook that polls GET /api/session-manager every 5s and provides action dispatchers.
 */
export function useSessionManager() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/session-manager');
      const data = await res.json();
      if (data.ok) setState(data);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchState();
    timerRef.current = setInterval(fetchState, 10000);
    return () => clearInterval(timerRef.current);
  }, [fetchState]);

  const sendAction = useCallback(async (action, extra = {}) => {
    try {
      const res = await fetch('/api/session-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      // Refresh state after action
      setTimeout(fetchState, 500);
      return data;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [fetchState]);

  return {
    sessions: state?.sessions || [],
    summary: state?.summary || { total: 0, healthy: 0, stale: 0, errored: 0, orphaned: 0, duplicates: 0 },
    issues: state?.issues || [],
    actionLog: state?.actionLog || [],
    debugLog: state?.debugLog || [],
    lastError: state?.lastError || null,
    errorCount: state?.errorCount || 0,
    consecutiveEmptyScans: state?.consecutiveEmptyScans || 0,
    canSpawn: state?.canSpawn || { canSpawn: true, count: 0, max: 4, warning: null },
    escalationPaused: state?.escalationPaused || false,
    lastScanAt: state?.lastScanAt || null,
    scanCount: state?.scanCount || 0,
    loading,

    // Action dispatchers
    forceScan: () => sendAction('scan'),
    nudge: (sessionId) => sendAction('nudge', { sessionId }),
    swapModel: (sessionId, targetModel) => sendAction('swap', { sessionId, targetModel }),
    killSession: (sessionId) => sendAction('kill', { sessionId }),
    killOrphans: () => sendAction('kill-orphans'),
    dedup: (taskId) => sendAction('dedup', { taskId }),
    dedupAll: () => sendAction('dedup-all'),
    toggleEscalation: () => sendAction(state?.escalationPaused ? 'resume-escalation' : 'pause-escalation'),
  };
}
