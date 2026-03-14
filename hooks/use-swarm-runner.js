'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Client-side hook for managing swarm pipeline execution.
 */
export function useSwarmRunner({ dispatch, addLog, runTask }) {
  const [swarmStatus, setSwarmStatus] = useState(null);
  const pollRef = useRef(null);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ruflo/swarm');
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        setSwarmStatus(data);
        dispatch?.({ type: 'SET_SWARM_STATUS', data });
      }
    } catch { /* skip */ }
  }, [dispatch]);

  const startSwarm = useCallback(async (pipelineId, taskIds, mode = 'tactical') => {
    try {
      const res = await fetch('/api/ruflo/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', pipelineId, taskIds, mode }),
      });
      const data = await res.json();
      if (data.ok) {
        addLog?.('SWARM', `Started swarm: ${taskIds.length} tasks, mode=${mode}`);
        setSwarmStatus(data);

        // Start polling
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(pollStatus, 3000);
      }
      return data;
    } catch (e) {
      addLog?.('SWARM', `Start failed: ${e.message}`, 'error');
      return { ok: false, error: e.message };
    }
  }, [addLog, pollStatus]);

  const stopSwarm = useCallback(async () => {
    try {
      const res = await fetch('/api/ruflo/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const data = await res.json();
      if (data.ok) {
        addLog?.('SWARM', 'Swarm stopped');
        if (pollRef.current) clearInterval(pollRef.current);
      }
      return data;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [addLog]);

  const pauseSwarm = useCallback(async () => {
    const res = await fetch('/api/ruflo/swarm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause' }),
    });
    return res.json();
  }, []);

  const resumeSwarm = useCallback(async () => {
    const res = await fetch('/api/ruflo/swarm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume' }),
    });
    return res.json();
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return { swarmStatus, startSwarm, stopSwarm, pauseSwarm, resumeSwarm };
}
