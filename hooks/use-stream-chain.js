'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Client-side hook for consuming stream chain events via SSE.
 */
export function useStreamChain(chainId, { enabled = true, pollIntervalMs = 2000 } = {}) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const offsetRef = useRef(0);

  const poll = useCallback(async () => {
    if (!chainId || !enabled) return;
    try {
      const res = await fetch(`/api/stream-chain?chainId=${encodeURIComponent(chainId)}&offset=${offsetRef.current}`);
      if (!res.ok) return;

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'sync') {
                offsetRef.current = event.offset;
              } else {
                setEvents(prev => [...prev, event]);
              }
            } catch { /* skip */ }
          }
        }
      }
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, [chainId, enabled]);

  useEffect(() => {
    if (!enabled || !chainId) return;
    poll();
    const timer = setInterval(poll, pollIntervalMs);
    return () => clearInterval(timer);
  }, [poll, enabled, chainId, pollIntervalMs]);

  const clear = useCallback(() => {
    setEvents([]);
    offsetRef.current = 0;
  }, []);

  return { events, connected, clear };
}
