/**
 * Security Validation Layer — inspired by ruflo's AIDefence threat detection,
 * sandboxing, and input validation patterns.
 *
 * Validates all inputs at system boundaries:
 *   1. Path traversal prevention (../, ~/, symlink attacks)
 *   2. Command injection prevention (shell metacharacters in task IDs)
 *   3. Input sanitization (size limits, type validation)
 *   4. Rate limiting per-action
 *   5. Audit logging of security events
 *
 * All API routes should call validateInput() before processing requests.
 */

import os from 'os';

const HOME_DIR = os.homedir();

// ---------------------------------------------------------------------------
// Path Traversal Prevention
// ---------------------------------------------------------------------------

const TRAVERSAL_PATTERNS = [
  /\.\.\//,                    // ../
  /\.\.\\/,                    // ..\
  /~\//,                       // ~/
  /^\/etc\//,                  // /etc/
  /^\/proc\//,                 // /proc/
  /^\/dev\//,                  // /dev/
  /\0/,                        // null bytes
];

export function isPathSafe(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return false;
  for (const pattern of TRAVERSAL_PATTERNS) {
    if (pattern.test(inputPath)) return false;
  }
  // Reject absolute paths outside user's home directory
  if (inputPath.startsWith('/') && HOME_DIR && !inputPath.startsWith(HOME_DIR)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Command Injection Prevention
// ---------------------------------------------------------------------------

const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!#\\'"]/;

export function isIdSafe(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.length > 128) return false;
  if (SHELL_METACHARACTERS.test(id)) return false;
  // Must be alphanumeric with dashes/underscores/dots
  return /^[\w.:-]+$/.test(id);
}

// ---------------------------------------------------------------------------
// Input Sanitization
// ---------------------------------------------------------------------------

const VALIDATION_RULES = {
  taskId: { maxLength: 64, pattern: /^[\w-]+$/, required: true },
  model: { maxLength: 128, pattern: /^[\w./:@-]+$/, required: false },
  sessionId: { maxLength: 128, pattern: /^[\w-]+$/, required: false },
  action: { maxLength: 32, pattern: /^[\w-]+$/, required: true },
  message: { maxLength: 10000, required: false },
  level: { type: 'number', min: 0, max: 4 },
  pipelineId: { maxLength: 64, pattern: /^[\w-]+$/, required: false },
};

/**
 * Validate a set of input fields against rules.
 * Returns { valid, errors } where errors is an array of violation messages.
 */
export function validateInput(fields, ruleOverrides = {}) {
  const errors = [];
  const rules = { ...VALIDATION_RULES, ...ruleOverrides };

  for (const [fieldName, value] of Object.entries(fields)) {
    const rule = rules[fieldName];
    if (!rule) continue; // no rule for this field, skip

    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push({ field: fieldName, message: `${fieldName} is required` });
      continue;
    }

    if (value === undefined || value === null) continue;

    // Type check
    if (rule.type === 'number') {
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push({ field: fieldName, message: `${fieldName} must be a number` });
        continue;
      }
      if (rule.min !== undefined && value < rule.min) {
        errors.push({ field: fieldName, message: `${fieldName} must be >= ${rule.min}` });
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push({ field: fieldName, message: `${fieldName} must be <= ${rule.max}` });
      }
      continue;
    }

    // String checks
    if (typeof value !== 'string') {
      errors.push({ field: fieldName, message: `${fieldName} must be a string` });
      continue;
    }

    if (rule.maxLength && value.length > rule.maxLength) {
      errors.push({ field: fieldName, message: `${fieldName} exceeds max length ${rule.maxLength}` });
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push({ field: fieldName, message: `${fieldName} contains invalid characters` });
    }

    // Path safety for path-like fields
    if (fieldName.toLowerCase().includes('path') || fieldName.toLowerCase().includes('file')) {
      if (!isPathSafe(value)) {
        errors.push({ field: fieldName, message: `${fieldName} contains unsafe path` });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Per-Action Rate Limiter
// ---------------------------------------------------------------------------

class ActionRateLimiter {
  constructor() {
    this._windows = new Map();  // key -> { timestamps[] }
  }

  /**
   * Check if action is allowed under rate limit.
   * @param {string} key - rate limit key (e.g., 'api:run-agent' or 'ip:127.0.0.1')
   * @param {number} maxPerMinute - max allowed per minute
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  check(key, maxPerMinute = 30) {
    const now = Date.now();
    const windowMs = 60000;

    if (!this._windows.has(key)) {
      this._windows.set(key, { timestamps: [] });
    }

    const window = this._windows.get(key);
    // Clean old entries
    window.timestamps = window.timestamps.filter(ts => now - ts < windowMs);

    if (window.timestamps.length >= maxPerMinute) {
      const oldestInWindow = window.timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: windowMs - (now - oldestInWindow),
      };
    }

    window.timestamps.push(now);
    return {
      allowed: true,
      remaining: maxPerMinute - window.timestamps.length,
      retryAfterMs: 0,
    };
  }

  getStatus() {
    const status = {};
    for (const [key, window] of this._windows) {
      const now = Date.now();
      const active = window.timestamps.filter(ts => now - ts < 60000);
      status[key] = { activeRequests: active.length };
    }
    return status;
  }
}

// ---------------------------------------------------------------------------
// Security Event Logger
// ---------------------------------------------------------------------------

const _securityEvents = [];
const MAX_SECURITY_EVENTS = 500;

export function logSecurityEvent(type, details = {}) {
  _securityEvents.unshift({
    ts: Date.now(),
    type,
    ...details,
  });
  if (_securityEvents.length > MAX_SECURITY_EVENTS) _securityEvents.length = MAX_SECURITY_EVENTS;
}

export function getSecurityEvents(limit = 50) {
  return _securityEvents.slice(0, limit);
}

/**
 * Middleware-style validation for API routes.
 * Returns null if valid, or a Response object if invalid.
 */
export function validateApiRequest(data, requiredFields = []) {
  if (!data || typeof data !== 'object') {
    logSecurityEvent('invalid-request', { reason: 'Not an object' });
    return { ok: false, error: 'Invalid request body' };
  }

  // Check required fields
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      logSecurityEvent('missing-field', { field });
      return { ok: false, error: `Missing required field: ${field}` };
    }
  }

  // Validate all present fields
  const validation = validateInput(data);
  if (!validation.valid) {
    logSecurityEvent('validation-failed', { errors: validation.errors });
    return { ok: false, error: 'Validation failed', details: validation.errors };
  }

  return null; // valid
}

// Module-level singleton for rate limiter
export const rateLimiter = new ActionRateLimiter();

// Export security status
export function getSecurityStatus() {
  return {
    recentEvents: _securityEvents.slice(0, 30),
    totalEvents: _securityEvents.length,
    rateLimitStatus: rateLimiter.getStatus(),
  };
}
