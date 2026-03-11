'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook that polls GET /api/orchestrator every 10s and provides action dispatchers
 * for the deterministic orchestrator engine.
 */
export function useOrchestrator() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const statusRef = useRef(null);
  const fetchStatusRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/orchestrator');
      const data = await res.json();
      if (data.ok) {
        setStatus(data);
        statusRef.current = data;
      } else if (!statusRef.current) {
        setStatus(data);
        statusRef.current = data;
      }
    } catch { /* silent — keep previous status */ }
    setLoading(false);
  }, []);

  fetchStatusRef.current = fetchStatus;

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, 10000);
    return () => clearInterval(timerRef.current);
  }, [fetchStatus]);

  const sendActionTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (sendActionTimerRef.current) clearTimeout(sendActionTimerRef.current);
    };
  }, []);

  const sendAction = useCallback(async (action, extra = {}) => {
    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (sendActionTimerRef.current) clearTimeout(sendActionTimerRef.current);
      sendActionTimerRef.current = setTimeout(() => fetchStatusRef.current?.(), 500);
      return data;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  return {
    started: status?.started || false,
    paused: status?.paused || false,
    stats: status?.stats || { nudges: 0, swaps: 0, kills: 0, recoveries: 0, purges: 0, aiConsultations: 0 },
    recentDecisions: status?.recentDecisions || [],
    activeConditions: status?.activeConditions || [],
    pendingReview: status?.pendingReview || [],
    memorySize: status?.memorySize || 0,
    rateLimit: status?.rateLimit || { remaining: 0, maxPerMinute: 6 },
    decisionTree: status?.decisionTree || { nodes: [], thresholds: {} },
    loading,

    // Actions
    pause: () => sendAction('pause'),
    resume: () => sendAction('resume'),
    sendNudge: (sessionId) => sendAction('nudge', { sessionId }),
    sendSwap: (sessionId, targetModel) => sendAction('swap', { sessionId, targetModel }),
    sendKill: (sessionId) => sendAction('kill', { sessionId }),
    sendRecover: (taskId) => sendAction('recover', { taskId }),
    approveRecommendation: (id) => sendAction('approve-recommendation', { id }),
    rejectRecommendation: (id) => sendAction('reject-recommendation', { id }),
  };
}
