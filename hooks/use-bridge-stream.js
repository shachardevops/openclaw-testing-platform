'use client';

import { useEffect, useRef, useCallback } from 'react';

const MAX_RETRIES = 8;

export function useBridgeStream({ onChunk, onStatusChange }) {
  const offsetRef = useRef(0);
  const retriesRef = useRef(0);
  const esRef = useRef(null);
  const retryTimerRef = useRef(null);

  const connect = useCallback(() => {
    // Clean up previous
    if (esRef.current) {
      try { esRef.current.close(); } catch {}
      esRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const es = new EventSource(`/api/bridge-log/stream?offset=${offsetRef.current}`);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data || '{}');
        if (data?.ok) {
          offsetRef.current = Number(data.nextOffset || offsetRef.current);
          retriesRef.current = 0;
          onChunk?.(data.text || '');
          onStatusChange?.('live');
        } else {
          onStatusChange?.('degraded');
        }
      } catch {
        onStatusChange?.('parse-error');
      }
    };

    es.onerror = () => {
      try { es.close(); } catch {}
      if (esRef.current === es) esRef.current = null;
      retriesRef.current++;

      if (retriesRef.current >= MAX_RETRIES) {
        onStatusChange?.('offline');
        return;
      }

      const delay = Math.min(1000 * Math.pow(2, retriesRef.current - 1), 30000);
      onStatusChange?.(`reconnecting-${retriesRef.current}`);
      retryTimerRef.current = setTimeout(connect, delay);
    };
  }, [onChunk, onStatusChange]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    connect();
    return () => {
      if (esRef.current) try { esRef.current.close(); } catch {}
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [connect]);

  return {};
}

export function useBridgePolling({ onChunk, onStatusChange, enabled }) {
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/bridge-log?offset=${offsetRef.current}`);
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error || 'bridge log error');
        if (data.text) onChunk?.(data.text);
        offsetRef.current = Number(data.nextOffset || offsetRef.current);
        onStatusChange?.('live');
      } catch {
        onStatusChange?.('offline');
      }
    };

    poll();
    const timer = setInterval(poll, 4000);
    return () => clearInterval(timer);
  }, [enabled, onChunk, onStatusChange]);
}
