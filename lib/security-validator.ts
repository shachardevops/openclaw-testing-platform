const TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /~\//,
  /^\/etc\//,
  /^\/proc\//,
  /^\/dev\//,
  /\0/,
];

export function isPathSafe(inputPath: string | null | undefined): boolean {
  if (!inputPath || typeof inputPath !== 'string') return false;
  for (const pattern of TRAVERSAL_PATTERNS) {
    if (pattern.test(inputPath)) return false;
  }
  if (inputPath.startsWith('/') && !inputPath.startsWith('/Users/') && !inputPath.startsWith('/home/')) {
    return false;
  }
  return true;
}

const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!#\\'"]/;

export function isIdSafe(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length > 128) return false;
  if (SHELL_METACHARACTERS.test(id)) return false;
  return /^[\w.:-]+$/.test(id);
}

interface ValidationRule {
  maxLength?: number;
  pattern?: RegExp;
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
}

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const VALIDATION_RULES: Record<string, ValidationRule> = {
  taskId: { maxLength: 64, pattern: /^[\w-]+$/, required: true },
  model: { maxLength: 128, pattern: /^[\w./:@-]+$/, required: false },
  sessionId: { maxLength: 128, pattern: /^[\w-]+$/, required: false },
  action: { maxLength: 32, pattern: /^[\w-]+$/, required: true },
  message: { maxLength: 10000, required: false },
  level: { type: 'number', min: 0, max: 4 },
  pipelineId: { maxLength: 64, pattern: /^[\w-]+$/, required: false },
};

export function validateInput(
  fields: Record<string, any>,
  ruleOverrides: Record<string, ValidationRule> = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const rules: Record<string, ValidationRule> = { ...VALIDATION_RULES, ...ruleOverrides };

  for (const [fieldName, value] of Object.entries(fields)) {
    const rule = rules[fieldName];
    if (!rule) continue;

    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push({ field: fieldName, message: `${fieldName} is required` });
      continue;
    }

    if (value === undefined || value === null) continue;

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

interface RateLimitWindow {
  timestamps: number[];
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

class ActionRateLimiter {
  private _windows: Map<string, RateLimitWindow> = new Map();

  check(key: string, maxPerMinute: number = 30): RateLimitResult {
    const now = Date.now();
    const windowMs = 60000;

    if (!this._windows.has(key)) {
      this._windows.set(key, { timestamps: [] });
    }

    const window = this._windows.get(key)!;
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

  getStatus(): Record<string, { activeRequests: number }> {
    const status: Record<string, { activeRequests: number }> = {};
    for (const [key, window] of this._windows) {
      const now = Date.now();
      const active = window.timestamps.filter(ts => now - ts < 60000);
      status[key] = { activeRequests: active.length };
    }
    return status;
  }
}

interface SecurityEvent {
  ts: number;
  type: string;
  [key: string]: any;
}

const _securityEvents: SecurityEvent[] = [];
const MAX_SECURITY_EVENTS = 500;

export function logSecurityEvent(type: string, details: Record<string, any> = {}): void {
  _securityEvents.unshift({
    ts: Date.now(),
    type,
    ...details,
  });
  if (_securityEvents.length > MAX_SECURITY_EVENTS) _securityEvents.length = MAX_SECURITY_EVENTS;
}

export function getSecurityEvents(limit: number = 50): SecurityEvent[] {
  return _securityEvents.slice(0, limit);
}

export function validateApiRequest(
  data: any,
  requiredFields: string[] = []
): { ok: false; error: string; details?: ValidationError[] } | null {
  if (!data || typeof data !== 'object') {
    logSecurityEvent('invalid-request', { reason: 'Not an object' });
    return { ok: false, error: 'Invalid request body' };
  }

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      logSecurityEvent('missing-field', { field });
      return { ok: false, error: `Missing required field: ${field}` };
    }
  }

  const validation = validateInput(data);
  if (!validation.valid) {
    logSecurityEvent('validation-failed', { errors: validation.errors });
    return { ok: false, error: 'Validation failed', details: validation.errors };
  }

  return null;
}

export const rateLimiter = new ActionRateLimiter();

export function getSecurityStatus() {
  return {
    recentEvents: _securityEvents.slice(0, 30),
    totalEvents: _securityEvents.length,
    rateLimitStatus: rateLimiter.getStatus(),
  };
}
