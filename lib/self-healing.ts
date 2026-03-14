import { getProjectConfig } from './project-loader';
import { registry } from './service-registry';

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

interface HealingConfig {
  enabled: boolean;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  circuitBreaker: CircuitBreakerConfig;
}

const DEFAULT_CONFIG: HealingConfig = {
  enabled: true,
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  jitterFactor: 0.3,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 300000,
    halfOpenMaxAttempts: 2,
  },
};

function loadHealingConfig(): HealingConfig {
  try {
    const { project } = getProjectConfig();
    return {
      ...DEFAULT_CONFIG,
      ...(project.selfHealing || {}),
      circuitBreaker: {
        ...DEFAULT_CONFIG.circuitBreaker,
        ...((project.selfHealing || {}).circuitBreaker || {}),
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

const CB_STATES = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half-open' } as const;

class CircuitBreaker {
  name: string;
  private _config: CircuitBreakerConfig;
  private _state: string = CB_STATES.CLOSED;
  private _failures: number = 0;
  private _lastFailureAt: number = 0;
  private _halfOpenAttempts: number = 0;
  private _successCount: number = 0;

  constructor(name: string, config: CircuitBreakerConfig) {
    this.name = name;
    this._config = config;
  }

  get state(): string { return this._state; }

  canAttempt(): boolean {
    if (this._state === CB_STATES.CLOSED) return true;

    if (this._state === CB_STATES.OPEN) {
      if (Date.now() - this._lastFailureAt >= this._config.resetTimeoutMs) {
        this._state = CB_STATES.HALF_OPEN;
        this._halfOpenAttempts = 0;
        return true;
      }
      return false;
    }

    return this._halfOpenAttempts < this._config.halfOpenMaxAttempts;
  }

  recordSuccess(): void {
    if (this._state === CB_STATES.HALF_OPEN) {
      this._successCount++;
      if (this._successCount >= this._config.halfOpenMaxAttempts) {
        this._state = CB_STATES.CLOSED;
        this._failures = 0;
        this._successCount = 0;
      }
    } else {
      this._failures = Math.max(0, this._failures - 1);
    }
  }

  recordFailure(): void {
    this._failures++;
    this._lastFailureAt = Date.now();

    if (this._state === CB_STATES.HALF_OPEN) {
      this._halfOpenAttempts++;
      if (this._halfOpenAttempts >= this._config.halfOpenMaxAttempts) {
        this._state = CB_STATES.OPEN;
      }
    } else if (this._failures >= this._config.failureThreshold) {
      this._state = CB_STATES.OPEN;
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this._state,
      failures: this._failures,
      lastFailureAt: this._lastFailureAt ? new Date(this._lastFailureAt).toISOString() : null,
      remainingCooldownMs: this._state === CB_STATES.OPEN
        ? Math.max(0, this._config.resetTimeoutMs - (Date.now() - this._lastFailureAt))
        : 0,
    };
  }
}

function calculateDelay(attempt: number, config: HealingConfig): number {
  const base = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = base * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.min(base + jitter, config.maxDelayMs);
}

interface HealingEvent {
  ts: number;
  type: string;
  operation: string;
  [key: string]: any;
}

interface RetryTracker {
  attempts: number;
  lastAttempt: number;
  errors: string[];
}

class SelfHealingEngine {
  private _circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private _retryTrackers: Map<string, RetryTracker> = new Map();
  private _healingEvents: HealingEvent[] = [];

  getCircuitBreaker(name: string): CircuitBreaker {
    if (!this._circuitBreakers.has(name)) {
      const config = loadHealingConfig();
      this._circuitBreakers.set(name, new CircuitBreaker(name, config.circuitBreaker));
    }
    return this._circuitBreakers.get(name)!;
  }

  async executeWithHealing(
    operationName: string,
    fn: () => Promise<any>,
    opts: { maxRetries?: number; onRetry?: (attempt: number, delay: number, err: Error) => void; fallback?: () => Promise<any> } = {}
  ): Promise<Record<string, any>> {
    const config = loadHealingConfig();
    if (!config.enabled) {
      const result = await fn();
      return { ok: true, result, attempts: 1, healed: false };
    }

    const cb = this.getCircuitBreaker(operationName);
    const maxRetries = opts.maxRetries ?? config.maxRetries;

    if (!cb.canAttempt()) {
      this._addEvent('circuit-open', operationName, { state: cb.state });

      if (opts.fallback) {
        try {
          const fallbackResult = await opts.fallback();
          this._addEvent('fallback-success', operationName);
          return { ok: true, result: fallbackResult, attempts: 0, healed: true, usedFallback: true };
        } catch (e: unknown) {
          return { ok: false, error: `Circuit open and fallback failed: ${(e as Error).message}`, circuitState: cb.state };
        }
      }

      return { ok: false, error: 'Circuit breaker open', circuitState: cb.state };
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        cb.recordSuccess();
        if (attempt > 0) {
          this._addEvent('retry-success', operationName, { attempt });
        }
        return { ok: true, result, attempts: attempt + 1, healed: attempt > 0 };
      } catch (e: unknown) {
        lastError = e as Error;
        cb.recordFailure();
        this._addEvent('failure', operationName, { attempt, error: (e as Error).message });

        if (attempt < maxRetries) {
          const delay = calculateDelay(attempt, config);
          if (opts.onRetry) opts.onRetry(attempt, delay, e as Error);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (opts.fallback) {
      try {
        const fallbackResult = await opts.fallback();
        this._addEvent('fallback-success', operationName, { afterRetries: maxRetries });
        return { ok: true, result: fallbackResult, attempts: maxRetries + 1, healed: true, usedFallback: true };
      } catch { /* fallback also failed */ }
    }

    return { ok: false, error: lastError?.message || 'Max retries exceeded', attempts: maxRetries + 1 };
  }

  shouldRetryTask(taskId: string, failureContext: { error?: string } = {}): Record<string, any> {
    const config = loadHealingConfig();
    if (!config.enabled) return { shouldRetry: false, reason: 'Self-healing disabled' };

    const key = `task:${taskId}`;
    const tracker = this._retryTrackers.get(key) || { attempts: 0, lastAttempt: 0, errors: [] };

    if (tracker.attempts >= config.maxRetries) {
      return { shouldRetry: false, reason: `Max retries (${config.maxRetries}) exceeded` };
    }

    const timeSinceLast = Date.now() - tracker.lastAttempt;
    const requiredDelay = calculateDelay(tracker.attempts, config);
    if (timeSinceLast < requiredDelay) {
      return {
        shouldRetry: true,
        delay: requiredDelay - timeSinceLast,
        reason: `Waiting for backoff (${Math.round((requiredDelay - timeSinceLast) / 1000)}s remaining)`,
      };
    }

    tracker.attempts++;
    tracker.lastAttempt = Date.now();
    tracker.errors.push(failureContext.error || 'unknown');
    if (tracker.errors.length > 10) tracker.errors = tracker.errors.slice(-10);
    this._retryTrackers.set(key, tracker);

    return {
      shouldRetry: true,
      delay: 0,
      attempt: tracker.attempts,
      reason: `Retry ${tracker.attempts}/${config.maxRetries}`,
    };
  }

  resetTask(taskId: string): void {
    this._retryTrackers.delete(`task:${taskId}`);
  }

  getStatus() {
    const config = loadHealingConfig();
    const breakers: Record<string, any>[] = [];
    for (const [, cb] of this._circuitBreakers) {
      breakers.push(cb.getStatus());
    }

    const retries: Record<string, any>[] = [];
    for (const [key, tracker] of this._retryTrackers) {
      retries.push({ key, ...tracker, lastAttempt: new Date(tracker.lastAttempt).toISOString() });
    }

    return {
      enabled: config.enabled,
      config: {
        maxRetries: config.maxRetries,
        baseDelayMs: config.baseDelayMs,
        circuitBreaker: config.circuitBreaker,
      },
      circuitBreakers: breakers,
      activeRetries: retries,
      recentEvents: this._healingEvents.slice(0, 30),
    };
  }

  private _addEvent(type: string, operation: string, data: Record<string, any> = {}): void {
    this._healingEvents.unshift({
      ts: Date.now(),
      type,
      operation,
      ...data,
    });
    if (this._healingEvents.length > 200) this._healingEvents.length = 200;
  }
}

const selfHealing = new SelfHealingEngine();

registry.register('selfHealing', () => selfHealing);

export default selfHealing;
export { CircuitBreaker, CB_STATES };
