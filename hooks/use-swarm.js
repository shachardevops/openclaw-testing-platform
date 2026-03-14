'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * Hook that polls /api/swarm for unified swarm state.
 * Provides agents, topology, timeline, stats, and engine controls.
 */
export function useSwarm(enabled = true, interval = 5000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [agentDetail, setAgentDetail] = useState(null);
  const mountedRef = useRef(true);

  const fetchSwarm = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/swarm');
      const json = await res.json();
      if (!mountedRef.current) return;
      if (json.ok) {
        setData(json);
      }
    } catch { /* keep previous state */ }
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
  const selectAgent = useCallback(async (agentId) => {
    if (agentId === selectedAgentId) {
      setSelectedAgentId(null);
      setAgentDetail(null);
      return;
    }
    setSelectedAgentId(agentId);
    try {
      const res = await fetch(`/api/swarm?agentId=${encodeURIComponent(agentId)}`);
      const json = await res.json();
      if (json.ok) setAgentDetail(json.agent);
    } catch {
      setAgentDetail(null);
    }
  }, [selectedAgentId]);

  // Engine actions (proxy to orchestrator API)
  const sendAction = useCallback(async (action, extra = {}) => {
    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const result = await res.json();
      // Refresh swarm state after action
      setTimeout(fetchSwarm, 500);
      return result;
    } catch (e) {
      return { ok: false, error: e.message };
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
    sendNudge: (sessionId) => sendAction('nudge', { sessionId }),
    sendSwap: (sessionId, targetModel) => sendAction('swap', { sessionId, targetModel }),
    sendKill: (sessionId) => sendAction('kill', { sessionId }),
    sendRecover: (taskId) => sendAction('recover', { taskId }),
    setAutonomyLevel: (level) => sendAction('set-autonomy-level', { level }),
    approveRecommendation: (id) => sendAction('approve-recommendation', { id }),
    rejectRecommendation: (id) => sendAction('reject-recommendation', { id }),
    confirmAction: (id) => sendAction('confirm-action', { id }),
    denyAction: (id) => sendAction('deny-action', { id }),
    refresh: fetchSwarm,
  };
}
