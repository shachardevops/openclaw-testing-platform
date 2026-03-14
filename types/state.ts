// Dashboard state and action types

import type { ResultsMap } from './results';

export interface LogEntry {
  time: string;
  agent: string;
  msg: string;
  type: string;
}

export interface PendingRun {
  requestedAt: number;
  model: string;
  modelShort: string;
}

export interface ActivePipeline {
  pipelineId: string | null;
  currentTaskId: string | null;
  finished: Set<string>;
}

export interface CustomPipeline {
  id: string;
  name: string;
  taskIds: string[];
}

export type GatewayStatus = 'connected' | 'unavailable' | 'needs_config' | 'recovering' | 'unknown';

export interface DashboardState {
  results: ResultsMap;
  pendingRuns: Record<string, PendingRun>;
  taskSkills: Record<string, string[]>;
  taskModels: Record<string, string>;
  customPipelines: CustomPipeline[];
  activePipeline: ActivePipeline;
  logEntries: LogEntry[];
  pollStatus: string;
  gatewayStatus: GatewayStatus;
  streamingText: Record<string, string>;
}

export type DashboardAction =
  | { type: 'SET_RESULTS'; results: ResultsMap }
  | { type: 'SET_POLL_OFFLINE' }
  | { type: 'ADD_LOG'; agent: string; msg: string; logType?: string }
  | { type: 'CLEAR_LOG' }
  | { type: 'SET_PENDING'; id: string; data: PendingRun }
  | { type: 'CLEAR_PENDING'; id: string }
  | { type: 'SET_TASK_MODEL'; taskId: string; modelId: string }
  | { type: 'BULK_TASK_MODELS'; taskModels: Record<string, string> }
  | { type: 'ATTACH_SKILL'; taskId: string; skillId: string }
  | { type: 'DETACH_SKILL'; taskId: string; skillId: string }
  | { type: 'BULK_TASK_SKILLS'; taskSkills: Record<string, string[]> }
  | { type: 'SET_CUSTOM_PIPELINES'; list: CustomPipeline[] }
  | { type: 'ADD_PIPELINE'; pipeline: CustomPipeline }
  | { type: 'UPDATE_PIPELINE'; id: string; updates: Partial<CustomPipeline> }
  | { type: 'DELETE_PIPELINE'; id: string }
  | { type: 'SET_ACTIVE_PIPELINE'; data: Partial<ActivePipeline> }
  | { type: 'SET_GATEWAY_STATUS'; status: GatewayStatus }
  | { type: 'SET_STREAMING_TEXT'; taskId: string; text: string }
  | { type: 'APPEND_STREAMING_TEXT'; taskId: string; text: string }
  | { type: 'CLEAR_STREAMING_TEXT'; taskId: string };

export interface DashboardContextValue extends DashboardState {
  allPipelines: CustomPipeline[];
  addLog: (agent: string, msg: string, logType?: string) => void;
  clearLog: () => void;
  getTaskModel: (taskId: string) => string;
  setTaskModel: (taskId: string, modelId: string) => void;
  getTaskSkills: (taskId: string) => string[];
  attachSkill: (taskId: string, skillId: string) => void;
  detachSkill: (taskId: string, skillId: string) => void;
  runTask: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  runPipeline: (pipelineId: string) => void;
  runInlinePipeline: (name: string, taskIds: string[]) => void;
  stopPipeline: () => void;
  createPipeline: (name: string, taskIds: string[]) => string;
  updatePipeline: (id: string, updates: Partial<CustomPipeline>) => void;
  deletePipeline: (id: string) => void;
  resetAll: () => Promise<void>;
  cleanAllTasks: () => Promise<void>;
}
