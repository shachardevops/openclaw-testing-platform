'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook to poll Direct AI provider status and decision history.
 * Provides real-time monitoring of direct SDK vs gateway routing decisions.
 */
export function useDirectAI(enabled = true, interval = 5000) {
  const [providers, setProviders] = useState({ claude: false, codex: false });
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/direct-ai');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.ok) {
        setProviders(data.providers || {});
        setStats(data.stats || null);
        setHistory(data.history || []);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      setLoading(true);
      fetchStatus().finally(() => mountedRef.current && setLoading(false));
      const id = setInterval(fetchStatus, interval);
      return () => { mountedRef.current = false; clearInterval(id); };
    }
    return () => { mountedRef.current = false; };
  }, [enabled, interval, fetchStatus]);

  const testPrompt = useCallback(async (prompt, opts = {}) => {
    try {
      const res = await fetch('/api/direct-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...opts }),
      });
      const data = await res.json();
      return data;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  return { providers, stats, history, loading, error, refresh: fetchStatus, testPrompt };
}
