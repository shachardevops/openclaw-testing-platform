// Rust microservice client types

export interface ServiceClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  healthCheckTtlMs?: number;
}

export interface ServiceHealthResponse {
  ok: boolean;
  service: string;
  uptime_seconds: number;
}

// Vector service types
export interface VectorInsertRequest {
  id: string;
  text: string;
  collection: string;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchRequest {
  query: string;
  collection?: string;
  limit?: number;
  min_similarity?: number;
}

export interface VectorHybridSearchRequest {
  query: string;
  collection: string;
  limit?: number;
}

export interface VectorSearchAllRequest {
  query: string;
  limit?: number;
}

export interface VectorCollectionStats {
  name: string;
  vectorCount: number;
  maxVectors: number;
  dimensions: number;
}

export interface VectorStatusResponse {
  ok: boolean;
  enabled: boolean;
  dimensions: number;
  collections: Record<string, VectorCollectionStats>;
}

// Audit service types
export interface AuditRecordRequest {
  category: string;
  action: string;
  data?: Record<string, unknown>;
  actor?: string;
}

export interface AuditQueryParams {
  category?: string;
  action?: string;
  taskId?: string;
  since?: number;
  limit?: number;
}

export interface AuditVerifyResponse {
  ok: boolean;
  valid: boolean;
  brokenAt: number | null;
  checked: number;
}

export interface AuditReplayRequest {
  taskId: string;
}
