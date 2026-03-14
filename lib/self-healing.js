/**
 * Self-Healing Workflow Engine — inspired by ruflo's self-healing workflows
 * and automatic error recovery patterns.
 *
 * Implements intelligent retry strategies for task and system failures:
 *   - Exponential backoff with jitter
 *   - Circuit breaker (stop retrying after repeated failures)
 *   - Fallback chains (try alternative approaches)
 *   - Health-based routing (avoid unhealthy models/sessions)
 *
 * Integration points:
 *   - Task run failures → retry with backoff
 *   - API errors → model fallback chain
 *   - Gateway failures → circuit breaker
 *   - Orchestrator action failures → alternative escalation
 */

import { getProjectConfig } from './project-loader.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  enabled: true,
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  jitterFactor: 0.3,              // random jitter to prevent thundering herd
  circuitBreaker: {
    failureThreshold: 5,          // failures before circuit opens
    resetTimeoutMs: 300000,       // 5 min before retrying after open
    halfOpenMaxAttempts: 2,       // attempts in half-open state
  },
};

function loadHealingConfig() {
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

// ---------------------------------------------------------------------------
// Circuit Breaker States
// ---------------------------------------------------------------------------

const CB_STATES = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half-open' };

class CircuitBreaker {
  constructor(name, config) {
    this.name = name;
    this._config = config;
    this._state = CB_STATES.CLOSED;
    this._failures = 0;
    this._lastFailureAt = 0;
    this._halfOpenAttempts = 0;
    this._successCount = 0;
  }

  get state() { return this._state; }

  canAttempt() {
    if (this._state === CB_STATES.CLOSED) return true;

    if (this._state === CB_STATES.OPEN) {
      // Check if reset timeout has elapsed
      if (Date.now() - this._lastFailureAt >= this._config.resetTimeoutMs) {
        this._state = CB_STATES.HALF_OPEN;
        this._halfOpenAttempts = 0;
        return true;
      }
      return false;
    }

    // Half-open: allow limited attempts
    return this._halfOpenAttempts < this._config.halfOpenMaxAttempts;
  }

  recordSuccess() {
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

  recordFailure() {
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

// ---------------------------------------------------------------------------
// Retry Strategy
// ---------------------------------------------------------------------------

function calculateDelay(attempt, config) {
  const base = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = base * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.min(base + jitter, config.maxDelayMs);
}

// ---------------------------------------------------------------------------
// Self-Healing Engine — singleton
// ---------------------------------------------------------------------------

class SelfHealingEngine {
  constructor() {
    this._circuitBreakers = new Map();   // name -> CircuitBreaker
    this._retryTrackers = new Map();     // key -> { attempts, lastAttempt, resolved }
    this._healingEvents = [];            // ring buffer
  }

  /**
   * Get or create a circuit breaker for a named resource.
   */
  getCircuitBreaker(name) {
    if (!this._circuitBreakers.has(name)) {
      const config = loadHealingConfig();
      this._circuitBreakers.set(name, new CircuitBreaker(name, config.circuitBreaker));
    }
    return this._circuitBreakers.get(name);
  }

  /**
   * Execute an operation with retry and circuit breaker protection.
   * Returns { ok, result, attempts, circuitState }.
   *
   * @param {string} operationName - unique name for the operation
   * @param {Function} fn - async function to execute
   * @param {object} opts - { maxRetries, onRetry, fallback }
   */
  async executeWithHealing(operationName, fn, opts = {}) {
    const config = loadHealingConfig();
    if (!config.enabled) {
      const result = await fn();
      return { ok: true, result, attempts: 1, healed: false };
    }

    const cb = this.getCircuitBreaker(operationName);
    const maxRetries = opts.maxRetries ?? config.maxRetries;

    if (!cb.canAttempt()) {
      this._addEvent('circuit-open', operationName, { state: cb.state });

      // Try fallback if available
      if (opts.fallback) {
        try {
          const fallbackResult = await opts.fallback();
          this._addEvent('fallback-success', operationName);
          return { ok: true, result: fallbackResult, attempts: 0, healed: true, usedFallback: true };
        } catch (e) {
          return { ok: false, error: `Circuit open and fallback failed: ${e.message}`, circuitState: cb.state };
        }
      }

      return { ok: false, error: 'Circuit breaker open', circuitState: cb.state };
    }

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        cb.recordSuccess();
        if (attempt > 0) {
          this._addEvent('retry-success', operationName, { attempt });
        }
        return { ok: true, result, attempts: attempt + 1, healed: attempt > 0 };
      } catch (e) {
        lastError = e;
        cb.recordFailure();
        this._addEvent('failure', operationName, { attempt, error: e.message });

        if (attempt < maxRetries) {
          const delay = calculateDelay(attempt, config);
          if (opts.onRetry) opts.onRetry(attempt, delay, e);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted — try fallback
    if (opts.fallback) {
      try {
        const fallbackResult = await opts.fallback();
        this._addEvent('fallback-success', operationName, { afterRetries: maxRetries });
        return { ok: true, result: fallbackResult, attempts: maxRetries + 1, healed: true, usedFallback: true };
      } catch { /* fallback also failed */ }
    }

    return { ok: false, error: lastError?.message || 'Max retries exceeded', attempts: maxRetries + 1 };
  }

  /**
   * Synchronous retry check — should we retry a failed task?
   * Returns { shouldRetry, delay, reason }.
   */
  shouldRetryTask(taskId, failureContext = {}) {
    const config = loadHealingConfig();
    if (!config.enabled) return { shouldRetry: false, reason: 'Self-healing disabled' };

    const key = `task:${taskId}`;
    const tracker = this._retryTrackers.get(key) || { attempts: 0, lastAttempt: 0, errors: [] };

    if (tracker.attempts >= config.maxRetries) {
      return { shouldRetry: false, reason: `Max retries (${config.maxRetries}) exceeded` };
    }

    // Don't retry if last attempt was very recent
    const timeSinceLast = Date.now() - tracker.lastAttempt;
    const requiredDelay = calculateDelay(tracker.attempts, config);
    if (timeSinceLast < requiredDelay) {
      return {
        shouldRetry: true,
        delay: requiredDelay - timeSinceLast,
        reason: `Waiting for backoff (${Math.round((requiredDelay - timeSinceLast) / 1000)}s remaining)`,
      };
    }

    // Record attempt
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

  /**
   * Reset retry tracker for a task (e.g., when manually re-run).
   */
  resetTask(taskId) {
    this._retryTrackers.delete(`task:${taskId}`);
  }

  /**
   * Get full status for API.
   */
  getStatus() {
    const config = loadHealingConfig();
    const breakers = [];
    for (const [, cb] of this._circuitBreakers) {
      breakers.push(cb.getStatus());
    }

    const retries = [];
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

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  _addEvent(type, operation, data = {}) {
    this._healingEvents.unshift({
      ts: Date.now(),
      type,
      operation,
      ...data,
    });
    if (this._healingEvents.length > 200) this._healingEvents.length = 200;
  }
}

// Module-level singleton
const selfHealing = new SelfHealingEngine();
export default selfHealing;
export { CircuitBreaker, CB_STATES };
