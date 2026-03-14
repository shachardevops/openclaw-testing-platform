'use client';

import { useEffect, useRef } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function usePolling(fetchFn: () => void | Promise<void>, intervalMs: number, deps: any[] = []) {
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;

  useEffect(() => {
    fnRef.current();
    const timer = setInterval(() => fnRef.current(), intervalMs);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
