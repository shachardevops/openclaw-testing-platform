'use client';

import { useEffect, useRef, useCallback } from 'react';

interface EventHandler {
  (data: unknown): void;
}

interface UseEventStreamOptions {
  onEvent: (type: string, data: unknown) => void;
  enabled?: boolean;
  reconnectMs?: number;
  maxRetries?: number;
}

/**
 * SSE client hook that connects to /api/events.
 * Auto-reconnects with exponential backoff on disconnect.
 * Returns { connected, reconnecting } status.
 */
export function useEventStream({ onEvent, enabled = true, reconnectMs = 2000, maxRetries = 10 }: UseEventStreamOptions) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const retriesRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource('/api/events');
    esRef.current = es;

    es.addEventListener('connected', () => {
      retriesRef.current = 0;
    });

    es.addEventListener('results', (e) => {
      try { onEventRef.current('results', JSON.parse(e.data)); } catch { /* ignore parse errors */ }
    });

    es.addEventListener('orchestrator', (e) => {
      try { onEventRef.current('orchestrator', JSON.parse(e.data)); } catch {}
    });

    es.addEventListener('pipeline', (e) => {
      try { onEventRef.current('pipeline', JSON.parse(e.data)); } catch {}
    });

    es.addEventListener('log', (e) => {
      try { onEventRef.current('log', JSON.parse(e.data)); } catch {}
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (retriesRef.current < maxRetries) {
        const delay = reconnectMs * Math.pow(2, Math.min(retriesRef.current, 5));
        retriesRef.current++;
        setTimeout(connect, delay);
      }
    };
  }, [reconnectMs, maxRetries]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [enabled, connect]);
}
