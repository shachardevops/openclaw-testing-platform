'use client';

import { useState, useCallback } from 'react';
import { usePolling } from './use-polling';

export function useOrphanedSessions(maxAgeMin = 30) {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('Checking...');

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/orphaned-sessions?maxAgeMin=${encodeURIComponent(maxAgeMin)}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'orphaned sessions error');
      setSessions(data.orphaned || []);
      setStatus(`${data.count} stale · ${new Date().toLocaleTimeString('en-GB')}`);
    } catch {
      setStatus('Monitor offline');
    }
  }, [maxAgeMin]);

  usePolling(poll, 15000, [maxAgeMin]);

  return { sessions, status };
}
