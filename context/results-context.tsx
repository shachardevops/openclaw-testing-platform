'use client';

import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { usePolling } from '@/hooks/use-polling';
import { useEventStream } from '@/hooks/use-event-stream';

import type { ResultsMap } from '@/types/results';

interface ResultsContextValue {
  results: ResultsMap;
  pollStatus: string;
  hasRunning: boolean;
}

const ResultsCtx = createContext<ResultsContextValue | null>(null);

/**
 * Dedicated results context that handles polling + SSE.
 * Components that only need results data can use `useResults()` instead of
 * `useDashboard()`, avoiding re-renders from unrelated state changes
 * (logs, skills, pipelines, etc.).
 */
export function ResultsProvider({ children, onResults }: { children: React.ReactNode; onResults?: (results: ResultsMap) => void }) {
  const [results, setResults] = useState<ResultsMap>({});
  const [pollStatus, setPollStatus] = useState('Polling...');
  const onResultsRef = useRef(onResults);
  onResultsRef.current = onResults;

  const updateResults = useCallback((newResults: ResultsMap) => {
    setResults(newResults);
    setPollStatus(`Live \u00b7 ${new Date().toLocaleTimeString('en-GB')}`);
    onResultsRef.current?.(newResults);
  }, []);

  const pollResults = useCallback(async () => {
    try {
      const res = await fetch('/api/results');
      const data: ResultsMap = await res.json();
      updateResults(data);
    } catch {
      setPollStatus('Offline');
    }
  }, [updateResults]);

  // SSE push updates
  const handleSSEEvent = useCallback((type: string, data: unknown) => {
    if (type === 'results' && data) {
      updateResults(data as ResultsMap);
    }
  }, [updateResults]);
  useEventStream({ onEvent: handleSSEEvent });

  const hasRunning = useMemo(() => {
    return Object.values(results).some(r => r?.status === 'running');
  }, [results]);

  // Poll as fallback: slower when SSE active, faster when tasks running
  usePolling(pollResults, hasRunning ? 3000 : 8000);

  const value = useMemo(() => ({
    results,
    pollStatus,
    hasRunning,
  }), [results, pollStatus, hasRunning]);

  return (
    <ResultsCtx.Provider value={value}>
      {children}
    </ResultsCtx.Provider>
  );
}

/**
 * Use this hook in components that only need results data.
 * Avoids re-renders from dashboard state changes (logs, skills, pipelines).
 */
export function useResults(): ResultsContextValue {
  const ctx = useContext(ResultsCtx);
  if (!ctx) throw new Error('useResults must be inside ResultsProvider');
  return ctx;
}
