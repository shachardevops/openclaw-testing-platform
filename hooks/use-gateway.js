'use client';

import { useEffect, useCallback, useRef } from 'react';

const HEALTH_INTERVAL_MS = 30000;
const RECOVERY_THRESHOLD = 2; // consecutive failures before auto-restart
const RECOVERY_COOLDOWN_MS = 120000; // don't restart more than once per 2 min

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || 'Unknown error');
}

function isExpectedFetchFailure(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    error?.name === 'AbortError'
    || message.includes('failed to fetch')
    || message.includes('load failed')
    || message.includes('networkerror')
  );
}

/**
 * Gateway health check hook with auto-recovery.
 * Checks health on mount and periodically.
 * After RECOVERY_THRESHOLD consecutive failures, triggers a gateway restart.
 */
export function useGateway(dispatch) {
  const intervalRef = useRef(null);
  const failCountRef = useRef(0);
  const lastRecoveryRef = useRef(0);
  const recoveringRef = useRef(false);

  const tryRecover = useCallback(async () => {
    const now = Date.now();
    if (recoveringRef.current) return;
    if (now - lastRecoveryRef.current < RECOVERY_COOLDOWN_MS) return;

    recoveringRef.current = true;
    lastRecoveryRef.current = now;

    console.log('[useGateway] Gateway down — attempting auto-restart');
    dispatch({ type: 'SET_GATEWAY_STATUS', status: 'recovering' });

    try {
      const res = await fetch('/api/gateway/restart', {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.ok && data.health?.available) {
        console.log('[useGateway] Gateway recovered:', data.action);
        failCountRef.current = 0;
        dispatch({
          type: 'SET_GATEWAY_STATUS',
          status: data.health.endpointsEnabled ? 'connected' : 'needs_config',
        });
      } else {
        console.warn('[useGateway] Recovery failed:', data?.error || `HTTP ${res.status}`);
        dispatch({ type: 'SET_GATEWAY_STATUS', status: 'unavailable' });
      }
    } catch (e) {
      if (!isExpectedFetchFailure(e)) {
        console.warn('[useGateway] Recovery error:', getErrorMessage(e));
      }
      dispatch({ type: 'SET_GATEWAY_STATUS', status: 'unavailable' });
    } finally {
      recoveringRef.current = false;
    }
  }, [dispatch]);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway/health');
      const data = await res.json();
      if (data.available && data.endpointsEnabled) {
        failCountRef.current = 0;
        dispatch({ type: 'SET_GATEWAY_STATUS', status: 'connected' });
      } else if (data.available) {
        failCountRef.current = 0;
        dispatch({ type: 'SET_GATEWAY_STATUS', status: 'needs_config' });
      } else {
        failCountRef.current++;
        if (failCountRef.current >= RECOVERY_THRESHOLD) {
          void tryRecover();
        } else {
          dispatch({ type: 'SET_GATEWAY_STATUS', status: 'unavailable' });
        }
      }
    } catch {
      failCountRef.current++;
      if (failCountRef.current >= RECOVERY_THRESHOLD) {
        void tryRecover();
      } else {
        dispatch({ type: 'SET_GATEWAY_STATUS', status: 'unavailable' });
      }
    }
  }, [dispatch, tryRecover]);

  useEffect(() => {
    checkHealth();
    intervalRef.current = setInterval(checkHealth, HEALTH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [checkHealth]);

  return { checkHealth };
}

/**
 * Start streaming gateway chat for a task.
 * Dispatches APPEND_STREAMING_TEXT as chunks arrive.
 * Returns an abort controller.
 */
export function startGatewayStream(taskId, agentId, message, dispatch) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch('/api/gateway/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, message, stream: true }),
        signal: controller.signal,
      });

      if (!res.ok) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE data lines
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                dispatch({ type: 'APPEND_STREAMING_TEXT', taskId, text: content });
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Gateway stream error:', e);
      }
    } finally {
      // Don't clear streaming text here — let the poll cycle handle cleanup
    }
  })();

  return controller;
}
