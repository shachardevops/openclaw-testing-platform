import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook that consumes the SSE screencast stream and provides the latest frame.
 *
 * @param {object} opts
 * @param {boolean} opts.enabled - Whether to connect
 * @param {number} [opts.quality=55] - JPEG quality
 * @param {number} [opts.fps=4] - Target fps
 * @param {string} [opts.targetId] - Specific CDP target ID
 * @param {string} [opts.taskId] - Task ID whose orchestrator-managed browser should be streamed
 * @returns {{ imageUrl, pageUrl, pageTitle, status, dimensions, reconnect }}
 */
export function useScreencast({ enabled = false, quality = 55, fps = 4, targetId = null, taskId = null } = {}) {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | streaming | error
  const [pageUrl, setPageUrl] = useState(null);
  const [pageTitle, setPageTitle] = useState(null);
  const [dimensions, setDimensions] = useState(null);
  const [frameCount, setFrameCount] = useState(0);

  // Use refs for the image to avoid re-renders on every frame
  const imgRef = useRef(null); // <img> element ref to set src directly
  const eventSourceRef = useRef(null);
  const retriesRef = useRef(0);
  const retryTimerRef = useRef(null);

  // Refs to break the circular dependency between connect and scheduleRetry
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const connectRef = useRef(null);

  const resetStream = useCallback(() => {
    setStatus('disconnected');
    setPageUrl(null);
    setPageTitle(null);
    setDimensions(null);
    setFrameCount(0);
    if (imgRef.current) {
      imgRef.current.removeAttribute('src');
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    const delay = Math.min(2000 * Math.pow(1.5, retriesRef.current), 15000);
    retriesRef.current++;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (enabledRef.current) connectRef.current?.();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    resetStream();
    setStatus('connecting');

    const params = new URLSearchParams({ mode: 'stream', quality: String(quality), fps: String(fps) });
    if (targetId) params.set('targetId', targetId);
    if (taskId) params.set('taskId', taskId);

    const es = new EventSource(`/api/browser-screencast?${params}`);
    eventSourceRef.current = es;

    es.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      setPageUrl(data.pageUrl);
      setPageTitle(data.title);
      setStatus('streaming');
      retriesRef.current = 0;
    });

    es.addEventListener('frame', (e) => {
      const data = JSON.parse(e.data);
      // Update <img> src directly via ref to avoid React re-render per frame
      if (imgRef.current) {
        imgRef.current.src = `data:image/jpeg;base64,${data.image}`;
      }
      if (data.w && data.h) {
        setDimensions((prev) => {
          if (prev?.w === data.w && prev?.h === data.h) return prev;
          return { w: data.w, h: data.h, scale: data.scale };
        });
      }
      setFrameCount((c) => c + 1);
    });

    es.addEventListener('error', (e) => {
      // SSE native error or our custom error event
      if (e.data) {
        try {
          const data = JSON.parse(e.data);
          console.warn('[screencast] Error:', data.error);
        } catch {}
      }
      es.close();
      eventSourceRef.current = null;
      setStatus('error');
      scheduleRetry();
    });

    es.addEventListener('disconnected', () => {
      es.close();
      eventSourceRef.current = null;
      setStatus('disconnected');
      scheduleRetry();
    });

    es.onerror = () => {
      // EventSource built-in error (connection failed)
      es.close();
      eventSourceRef.current = null;
      setStatus('error');
      scheduleRetry();
    };
  }, [quality, fps, targetId, taskId, resetStream, scheduleRetry]);

  // Keep connectRef in sync so scheduleRetry always calls the latest connect
  connectRef.current = connect;

  const reconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retriesRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      resetStream();
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      resetStream();
    };
  }, [enabled, connect, resetStream]);

  return {
    imgRef,
    pageUrl,
    pageTitle,
    status,
    dimensions,
    frameCount,
    reconnect,
  };
}
