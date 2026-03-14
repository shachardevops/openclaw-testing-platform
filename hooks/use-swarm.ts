'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface SwarmAgent {
  id: string;
  [key: string]: unknown;
}

interface SwarmData {
  ok: boolean;
  agents?: SwarmAgent[];
  topology?: Record<string, unknown>;
  timeline?: unknown[];
  stats?: Record<string, unknown>;
  engine?: Record<string, unknown>;
  pendingReview?: unknown[];
  pendingConfirmations?: unknown[];
  subsystems?: Record<string, unknown>;
  thresholds?: Record<string, unknown>;
  agent?: Record<string, unknown>;
}

interface ActionResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Hook that polls /api/swarm for unified swarm state.
 * Provides agents, topology, timeline, stats, and engine controls.
 */
export function useSwarm(enabled = true, interval = 5000) {
  const [data, setData] = useState<SwarmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentDetail, setAgentDetail] = useState<Record<string, unknown> | null>(null);
  const mountedRef = useRef(true);

  const fetchSwarm = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/swarm');
      const json: SwarmData = await res.json();
      if (!mountedRef.current) return;
      if (json.ok) {
        setData(json);
      }
    } catch (e: unknown) { /* keep previous state */ }
    if (mountedRef.current) setLoading(false);
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      fetchSwarm();
      const id = setInterval(fetchSwarm, interval);
      return () => { mountedRef.current = false; clearInterval(id); };
    }
    return () => { mountedRef.current = false; };
  }, [enabled, interval, fetchSwarm]);

  // Fetch agent detail when selected
  const selectAgent = useCallback(async (agentId: string) => {
    if (agentId === selectedAgentId) {
      setSelectedAgentId(null);
      setAgentDetail(null);
      return;
    }
    setSelectedAgentId(agentId);
    try {
      const res = await fetch(`/api/swarm?agentId=${encodeURIComponent(agentId)}`);
      const json: SwarmData = await res.json();
      if (json.ok) setAgentDetail(json.agent || null);
    } catch (e: unknown) {
      setAgentDetail(null);
    }
  }, [selectedAgentId]);

  // Engine actions (proxy to orchestrator API)
  const sendAction = useCallback(async (action: string, extra: Record<string, unknown> = {}): Promise<ActionResult> => {
    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const result: ActionResult = await res.json();
      // Refresh swarm state after action
      setTimeout(fetchSwarm, 500);
      return result;
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [fetchSwarm]);

  // Derived data
  const agents = useMemo(() => data?.agents || [], [data]);
  const timeline = useMemo(() => data?.timeline || [], [data]);
  const stats = useMemo(() => data?.stats || {}, [data]);

  return {
    // State
    agents,
    topology: data?.topology || {},
    timeline,
    stats,
    engine: data?.engine || {},
    pendingReview: data?.pendingReview || [],
    pendingConfirmations: data?.pendingConfirmations || [],
    subsystems: data?.subsystems || {},
    thresholds: data?.thresholds || {},
    loading,

    // Agent selection
    selectedAgentId,
    agentDetail,
    selectAgent,

    // Actions
    pause: () => sendAction('pause'),
    resume: () => sendAction('resume'),
    sendNudge: (sessionId: string) => sendAction('nudge', { sessionId }),
    sendSwap: (sessionId: string, targetModel: string) => sendAction('swap', { sessionId, targetModel }),
    sendKill: (sessionId: string) => sendAction('kill', { sessionId }),
    sendRecover: (taskId: string) => sendAction('recover', { taskId }),
    setAutonomyLevel: (level: number) => sendAction('set-autonomy-level', { level }),
    approveRecommendation: (id: string) => sendAction('approve-recommendation', { id }),
    rejectRecommendation: (id: string) => sendAction('reject-recommendation', { id }),
    confirmAction: (id: string) => sendAction('confirm-action', { id }),
    denyAction: (id: string) => sendAction('deny-action', { id }),
    refresh: fetchSwarm,
  };
}
