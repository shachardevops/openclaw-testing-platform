/**
 * HTTP client for Rust microservices (vector-service, audit-service).
 * Provides health-check caching and graceful fallback to JS implementations.
 */

import type { ServiceHealthResponse } from '@/types/services';

interface ServiceClient {
  isAvailable(): Promise<boolean>;
  fetch<T = unknown>(path: string, options?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string } | null>;
}

function createServiceClient(baseUrl: string, healthCheckTtlMs = 30000, timeoutMs = 5000): ServiceClient {
  let _available: boolean | null = null;
  let _lastCheck = 0;

  async function checkHealth(): Promise<boolean> {
    const now = Date.now();
    if (_available !== null && now - _lastCheck < healthCheckTtlMs) {
      return _available;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data: ServiceHealthResponse = await res.json();
        _available = data.ok === true;
      } else {
        _available = false;
      }
    } catch {
      _available = false;
    }

    _lastCheck = now;
    return _available;
  }

  return {
    isAvailable: checkHealth,

    async fetch<T = unknown>(path: string, options?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string } | null> {
      if (!(await checkHealth())) return null;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`${baseUrl}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await res.json();
        return data as { ok: boolean; data?: T; error?: string };
      } catch {
        // Service call failed — invalidate cache so next call re-checks
        _available = null;
        return null;
      }
    },
  };
}

const VECTOR_SERVICE_URL = process.env.VECTOR_SERVICE_URL || 'http://localhost:4001';
const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://localhost:4002';

export const vectorServiceClient = createServiceClient(VECTOR_SERVICE_URL);
export const auditServiceClient = createServiceClient(AUDIT_SERVICE_URL);
