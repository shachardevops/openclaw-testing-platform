/**
 * Error Hierarchy — consistent error shapes across all API routes.
 *
 * Base: DashboardError (code, statusCode, isRetryable)
 * Subtypes: ValidationError (400), GatewayError (502), ConfigError (500), ConsensusError (503)
 */

export class DashboardError extends Error {
  constructor(message, { code = 'DASHBOARD_ERROR', statusCode = 500, isRetryable = false } = {}) {
    super(message);
    this.name = 'DashboardError';
    this.code = code;
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

export class ValidationError extends DashboardError {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message, { code, statusCode: 400, isRetryable: false });
    this.name = 'ValidationError';
  }
}

export class GatewayError extends DashboardError {
  constructor(message, code = 'GATEWAY_ERROR') {
    super(message, { code, statusCode: 502, isRetryable: true });
    this.name = 'GatewayError';
  }
}

export class ConfigError extends DashboardError {
  constructor(message, code = 'CONFIG_ERROR') {
    super(message, { code, statusCode: 500, isRetryable: false });
    this.name = 'ConfigError';
  }
}

export class ConsensusError extends DashboardError {
  constructor(message, code = 'CONSENSUS_ERROR') {
    super(message, { code, statusCode: 503, isRetryable: true });
    this.name = 'ConsensusError';
  }
}

/**
 * Convert any error to a consistent { ok: false, error, code } Response.
 */
export function toErrorResponse(error) {
  if (error instanceof DashboardError) {
    return Response.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  // Unknown errors
  const message = error?.message || 'Internal server error';
  console.error('[DashboardError] Unhandled:', message);
  return Response.json(
    { ok: false, error: message, code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}
