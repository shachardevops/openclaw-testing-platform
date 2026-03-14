'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface DirectAIProviders {
  claude: boolean;
  codex: boolean;
  [key: string]: boolean;
}

interface DirectAIStats {
  [key: string]: unknown;
}

interface DirectAIHistoryEntry {
  [key: string]: unknown;
}

interface TestPromptOptions {
  [key: string]: unknown;
}

interface TestPromptResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Hook to poll Direct AI provider status and decision history.
 * Provides real-time monitoring of direct SDK vs gateway routing decisions.
 */
export function useDirectAI(enabled = true, interval = 5000) {
  const [providers, setProviders] = useState<DirectAIProviders>({ claude: false, codex: false });
  const [stats, setStats] = useState<DirectAIStats | null>(null);
  const [history, setHistory] = useState<DirectAIHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    } catch (e: unknown) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
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

  const testPrompt = useCallback(async (prompt: string, opts: TestPromptOptions = {}): Promise<TestPromptResult> => {
    try {
      const res = await fetch('/api/direct-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...opts }),
      });
      const data = await res.json();
      return data;
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  return { providers, stats, history, loading, error, refresh: fetchStatus, testPrompt };
}
