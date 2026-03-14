// Pure reducer — no side effects, fully testable.

import type { DashboardState, DashboardAction, LogEntry } from '@/types/state';

export const INITIAL_STATE: DashboardState = {
  results: {},
  pendingRuns: {},
  taskSkills: {},
  taskModels: {},
  customPipelines: [],
  activePipeline: { pipelineId: null, currentTaskId: null, finished: new Set() },
  logEntries: [{ time: '--:--:--', agent: 'SYSTEM', msg: 'Command Center initialized.', type: '' }],
  pollStatus: 'Polling...',
  // Gateway + streaming state
  gatewayStatus: 'unknown',
  streamingText: {},
  sessions: [],
};

export function dashboardReducer(state: DashboardState, a: DashboardAction): DashboardState {
  switch (a.type) {
    case 'SET_RESULTS':
      return { ...state, results: a.results, pollStatus: `Live \u00b7 ${new Date().toLocaleTimeString('en-GB')}` };

    case 'SET_POLL_OFFLINE':
      return { ...state, pollStatus: 'Offline' };

    case 'ADD_LOG': {
      const entry: LogEntry = { time: new Date().toLocaleTimeString('en-GB'), agent: a.agent, msg: a.msg, type: a.logType || '' };
      return { ...state, logEntries: [entry, ...state.logEntries.slice(0, 199)] };
    }
    case 'CLEAR_LOG':
      return { ...state, logEntries: [] };

    case 'SET_PENDING':
      return { ...state, pendingRuns: { ...state.pendingRuns, [a.id]: a.data } };
    case 'CLEAR_PENDING': {
      const next = { ...state.pendingRuns };
      delete next[a.id];
      return { ...state, pendingRuns: next };
    }

    case 'SET_TASK_MODEL':
      return { ...state, taskModels: { ...state.taskModels, [a.taskId]: a.modelId } };
    case 'BULK_TASK_MODELS':
      return { ...state, taskModels: a.taskModels };

    case 'ATTACH_SKILL': {
      const cur = state.taskSkills[a.taskId] || [];
      if (cur.includes(a.skillId)) return state;
      return { ...state, taskSkills: { ...state.taskSkills, [a.taskId]: [...cur, a.skillId] } };
    }
    case 'DETACH_SKILL': {
      const cur = state.taskSkills[a.taskId] || [];
      return { ...state, taskSkills: { ...state.taskSkills, [a.taskId]: cur.filter(s => s !== a.skillId) } };
    }
    case 'BULK_TASK_SKILLS':
      return { ...state, taskSkills: a.taskSkills };

    case 'SET_CUSTOM_PIPELINES':
      return { ...state, customPipelines: a.list };
    case 'ADD_PIPELINE':
      return { ...state, customPipelines: [...state.customPipelines, a.pipeline] };
    case 'UPDATE_PIPELINE':
      return { ...state, customPipelines: state.customPipelines.map(p => p.id === a.id ? { ...p, ...a.updates } : p) };
    case 'DELETE_PIPELINE':
      return { ...state, customPipelines: state.customPipelines.filter(p => p.id !== a.id) };

    case 'SET_ACTIVE_PIPELINE':
      return { ...state, activePipeline: { ...state.activePipeline, ...a.data } };

    // Gateway + streaming
    case 'SET_GATEWAY_STATUS':
      return { ...state, gatewayStatus: a.status };

    case 'SET_STREAMING_TEXT':
      return { ...state, streamingText: { ...state.streamingText, [a.taskId]: a.text } };

    case 'APPEND_STREAMING_TEXT': {
      const prev = state.streamingText[a.taskId] || '';
      return { ...state, streamingText: { ...state.streamingText, [a.taskId]: prev + a.text } };
    }

    case 'CLEAR_STREAMING_TEXT': {
      const next = { ...state.streamingText };
      delete next[a.taskId];
      return { ...state, streamingText: next };
    }

    // Sessions
    case 'SET_SESSIONS':
      return { ...state, sessions: a.sessions };

    default:
      return state;
  }
}
