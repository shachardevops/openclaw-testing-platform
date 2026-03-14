'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface OrchestratorStats {
  nudges: number;
  swaps: number;
  kills: number;
  recoveries: number;
  purges: number;
  aiConsultations: number;
}

interface OrchestratorDecision {
  [key: string]: unknown;
}

interface OrchestratorCondition {
  [key: string]: unknown;
}

interface PendingReviewItem {
  id: string;
  [key: string]: unknown;
}

interface RateLimit {
  remaining: number;
  maxPerMinute: number;
}

interface DecisionTree {
  nodes: unknown[];
  thresholds: Record<string, unknown>;
}

interface OrchestratorStatus {
  ok: boolean;
  started?: boolean;
  paused?: boolean;
  stats?: OrchestratorStats;
  recentDecisions?: OrchestratorDecision[];
  activeConditions?: OrchestratorCondition[];
  pendingReview?: PendingReviewItem[];
  memorySize?: number;
  rateLimit?: RateLimit;
  decisionTree?: DecisionTree;
}

interface ActionResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Hook that polls GET /api/orchestrator every 10s and provides action dispatchers
 * for the deterministic orchestrator engine.
 */
export function useOrchestrator() {
  const [status, setStatus] = useState<OrchestratorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<OrchestratorStatus | null>(null);
  const fetchStatusRef = useRef<(() => Promise<void>) | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/orchestrator');
      const data: OrchestratorStatus = await res.json();
      if (data.ok) {
        setStatus(data);
        statusRef.current = data;
      } else if (!statusRef.current) {
        setStatus(data);
        statusRef.current = data;
      }
    } catch (e: unknown) { /* silent — keep previous status */ }
    setLoading(false);
  }, []);

  fetchStatusRef.current = fetchStatus;

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, 10000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchStatus]);

  const sendActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (sendActionTimerRef.current) clearTimeout(sendActionTimerRef.current);
    };
  }, []);

  const sendAction = useCallback(async (action: string, extra: Record<string, unknown> = {}): Promise<ActionResult> => {
    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data: ActionResult = await res.json();
      if (sendActionTimerRef.current) clearTimeout(sendActionTimerRef.current);
      sendActionTimerRef.current = setTimeout(() => fetchStatusRef.current?.(), 500);
      return data;
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
    sendNudge: (sessionId: string) => sendAction('nudge', { sessionId }),
    sendSwap: (sessionId: string, targetModel: string) => sendAction('swap', { sessionId, targetModel }),
    sendKill: (sessionId: string) => sendAction('kill', { sessionId }),
    sendRecover: (taskId: string) => sendAction('recover', { taskId }),
    approveRecommendation: (id: string) => sendAction('approve-recommendation', { id }),
    rejectRecommendation: (id: string) => sendAction('reject-recommendation', { id }),
  };
}
