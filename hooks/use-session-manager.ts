'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SessionInfo {
  [key: string]: unknown;
}

interface SessionSummary {
  total: number;
  healthy: number;
  stale: number;
  errored: number;
  orphaned: number;
  duplicates: number;
}

interface CanSpawnInfo {
  canSpawn: boolean;
  count: number;
  max: number;
  warning: string | null;
}

interface SessionManagerState {
  ok: boolean;
  sessions?: SessionInfo[];
  summary?: SessionSummary;
  issues?: unknown[];
  actionLog?: unknown[];
  debugLog?: unknown[];
  lastError?: string | null;
  errorCount?: number;
  consecutiveEmptyScans?: number;
  canSpawn?: CanSpawnInfo;
  escalationPaused?: boolean;
  lastScanAt?: string | null;
  scanCount?: number;
}

interface ActionResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Hook that polls GET /api/session-manager every 10s and provides action dispatchers.
 */
export function useSessionManager() {
  const [state, setState] = useState<SessionManagerState | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/session-manager');
      const data: SessionManagerState = await res.json();
      if (data.ok) setState(data);
    } catch (e: unknown) { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchState();
    timerRef.current = setInterval(fetchState, 10000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchState]);

  const sendAction = useCallback(async (action: string, extra: Record<string, unknown> = {}): Promise<ActionResult> => {
    try {
      const res = await fetch('/api/session-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data: ActionResult = await res.json();
      // Refresh state after action
      setTimeout(fetchState, 500);
      return data;
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
    nudge: (sessionId: string) => sendAction('nudge', { sessionId }),
    swapModel: (sessionId: string, targetModel: string) => sendAction('swap', { sessionId, targetModel }),
    killSession: (sessionId: string) => sendAction('kill', { sessionId }),
    killOrphans: () => sendAction('kill-orphans'),
    dedup: (taskId: string) => sendAction('dedup', { taskId }),
    dedupAll: () => sendAction('dedup-all'),
    toggleEscalation: () => sendAction(state?.escalationPaused ? 'resume-escalation' : 'pause-escalation'),
  };
}
