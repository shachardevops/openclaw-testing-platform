// API request/response types

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
}

// Audit trail types
export interface AuditEvent {
  seq: number;
  ts: number;
  isoTime: string;
  category: string;
  action: string;
  actor: string;
  data: Record<string, unknown>;
  hash: string | null;
  previousHash: string;
}

export interface AuditChainResult {
  valid: boolean;
  brokenAt: number | null;
  checked: number;
}

// Vector search types
export interface VectorSearchResult {
  id: string;
  score: number;
  text?: string;
  metadata?: Record<string, unknown>;
  source?: string;
  collection?: string;
}

// Service status types
export interface ServiceStatus {
  available: boolean;
  url: string;
  lastCheck: number;
}
