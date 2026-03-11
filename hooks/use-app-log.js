'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Polls /api/app-log at byte offsets and accumulates text.
 * Also polls /api/app-server for status.
 */
const OLDER_LOG_BYTES = 128 * 1024;

export function useAppLog({ enabled = true } = {}) {
  const offsetRef = useRef(0);
  const headOffsetRef = useRef(0);
  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState('stopped'); // stopped | starting | running | errored
  const [healthy, setHealthy] = useState(null); // null = unknown, true/false
  const [serverInfo, setServerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  const clearLog = useCallback(() => {
    setLines([]);
    offsetRef.current = 0;
    headOffsetRef.current = 0;
    setTruncated(false);
  }, []);

  // Poll log content
  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/app-log?offset=${offsetRef.current}`);
        const data = await res.json();
        if (data?.ok) {
          const nextOffset = Number(data.nextOffset ?? offsetRef.current);
          const nextHeadOffset = Number(data.headOffset ?? 0);

          if (!data.exists || nextOffset < offsetRef.current) {
            setLines([]);
            setTruncated(false);
            headOffsetRef.current = 0;
          }

          if (data.text) {
            const newLines = data.text.split('\n').filter(Boolean);
            if (newLines.length > 0) {
              setLines(prev => {
                const combined = [...prev, ...newLines];
                // Keep last 2000 lines
                return combined.length > 2000 ? combined.slice(-2000) : combined;
              });
            }
          }

          setTruncated(!!data.truncatedHead);
          headOffsetRef.current = data.truncatedHead ? nextHeadOffset : 0;
          offsetRef.current = nextOffset;
        }
      } catch {} finally {
        setLoading(false);
      }
    };

    setLoading(true);
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [enabled]);

  // Poll server status
  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      try {
        const res = await fetch('/api/app-server');
        const data = await res.json();
        if (data?.ok) {
          setStatus(data.status);
          setHealthy(data.healthy);
          setServerInfo(data);
        }
      } catch {}
    };

    poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [enabled]);

  const sendAction = useCallback(async (action) => {
    try {
      if (action === 'start' || action === 'restart') clearLog();
      const res = await fetch('/api/app-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data?.ok) setStatus(data.status);
      return data;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [clearLog]);

  const loadEarlier = useCallback(async () => {
    if (headOffsetRef.current <= 0) return;
    setLoadingEarlier(true);
    try {
      const res = await fetch(`/api/app-log?before=${headOffsetRef.current}&limitBytes=${OLDER_LOG_BYTES}`);
      const data = await res.json();
      if (!data?.ok) return;

      const olderLines = (data.text || '').split('\n').filter(Boolean);
      if (olderLines.length > 0) {
        setLines((prev) => {
          const combined = [...olderLines, ...prev];
          return combined.length > 4000 ? combined.slice(-4000) : combined;
        });
      }

      setTruncated(!!data.truncatedHead);
      headOffsetRef.current = Number(data.headOffset ?? 0);
      offsetRef.current = Number(data.nextOffset ?? offsetRef.current);
    } catch {} finally {
      setLoadingEarlier(false);
    }
  }, []);

  return { lines, status, healthy, serverInfo, loading, truncated, loadingEarlier, loadEarlier, clearLog, sendAction };
}
