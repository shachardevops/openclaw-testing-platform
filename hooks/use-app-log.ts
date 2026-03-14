'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface AppLogResponse {
  ok: boolean;
  text?: string;
  nextOffset?: number;
  headOffset?: number;
  exists?: boolean;
  truncatedHead?: boolean;
}

interface ServerActionResponse {
  ok: boolean;
  status?: string;
  error?: string;
}

type AppStatus = 'stopped' | 'starting' | 'running' | 'errored';

/**
 * Polls /api/app-log at byte offsets and accumulates text.
 * Also polls /api/app-server for status.
 */
const OLDER_LOG_BYTES = 128 * 1024;

export function useAppLog({ enabled = true } = {}) {
  const offsetRef = useRef<number>(0);
  const headOffsetRef = useRef<number>(0);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<AppStatus>('stopped');
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [serverInfo, setServerInfo] = useState<Record<string, unknown> | null>(null);
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
        const data: AppLogResponse = await res.json();
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
      } catch (e: unknown) { /* ignore */ } finally {
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
      } catch (e: unknown) { /* ignore */ }
    };

    poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [enabled]);

  const sendAction = useCallback(async (action: string): Promise<ServerActionResponse> => {
    try {
      if (action === 'start' || action === 'restart') clearLog();
      const res = await fetch('/api/app-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data: ServerActionResponse = await res.json();
      if (data?.ok) setStatus(data.status as AppStatus);
      return data;
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [clearLog]);

  const loadEarlier = useCallback(async () => {
    if (headOffsetRef.current <= 0) return;
    setLoadingEarlier(true);
    try {
      const res = await fetch(`/api/app-log?before=${headOffsetRef.current}&limitBytes=${OLDER_LOG_BYTES}`);
      const data: AppLogResponse = await res.json();
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
    } catch (e: unknown) { /* ignore */ } finally {
      setLoadingEarlier(false);
    }
  }, []);

  return { lines, status, healthy, serverInfo, loading, truncated, loadingEarlier, loadEarlier, clearLog, sendAction };
}
