// Task result and finding types

export interface Finding {
  id: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | string;
  title: string;
  type?: 'BUG' | 'WARNING' | string;
  description?: string;
  steps?: string;
  expected?: string;
  actual?: string;
}

export interface TaskResult {
  status: 'running' | 'passed' | 'failed' | 'cancelled' | 'idle' | string;
  progress?: number;
  passed?: number;
  failed?: number;
  warnings?: number;
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  findings?: Finding[];
  lastLog?: string;
  model?: string;
  skills?: string[];
  runSessionKey?: string;
}

export type ResultsMap = Record<string, TaskResult>;

export interface QaSummary {
  passed: number;
  failed: number;
  warnings: number;
}
