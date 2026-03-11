'use client';

import { useEffect, useRef } from 'react';

export function usePolling(fetchFn, intervalMs, deps = []) {
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;

  useEffect(() => {
    fnRef.current();
    const timer = setInterval(() => fnRef.current(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, ...deps]);
}
