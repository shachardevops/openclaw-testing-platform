'use client';

import { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { useProjectConfig } from '@/context/project-config-context';
import { usePolling } from '@/hooks/use-polling';
import { usePersistence } from '@/hooks/use-persistence';
import { usePipelineRunner } from '@/hooks/use-pipeline-runner';
import { useGateway } from '@/hooks/use-gateway';
import { dashboardReducer, INITIAL_STATE } from '@/context/dashboard-reducer';

const Ctx = createContext(null);

export function DashboardProvider({ children }) {
  const { tasks: TASKS, models: MODELS, skills: SKILLS, pipelines: PIPELINES } = useProjectConfig();
  const [state, dispatch] = useReducer(dashboardReducer, INITIAL_STATE);

  // ── Gateway health check ──────────────────────────────────────
  useGateway(dispatch);

  // ── Persistence ─────────────────────────────────────────────────
  const persistable = useMemo(
    () => ({ taskSkills: state.taskSkills, taskModels: state.taskModels, customPipelines: state.customPipelines }),
    [state.taskSkills, state.taskModels, state.customPipelines],
  );
  const allowedSkillIds = useMemo(() => SKILLS.map((skill) => skill.id), [SKILLS]);
  usePersistence(dispatch, persistable, allowedSkillIds);

  // ── Helpers ─────────────────────────────────────────────────────

  const addLog = useCallback((agent, msg, logType = '') => {
    dispatch({ type: 'ADD_LOG', agent, msg, logType });
  }, []);

  const getTaskModel = useCallback((taskId) => {
    return state.taskModels[taskId]
      || TASKS.find(t => t.id === taskId)?.defaultModel
      || MODELS[0]?.id;
  }, [state.taskModels, TASKS, MODELS]);

  const getTaskSkills = useCallback((taskId) => {
    const allowed = new Set(allowedSkillIds);
    const current = state.taskSkills[taskId] || TASKS.find(t => t.id === taskId)?.defaultSkills || [];
    return current.filter((skillId) => allowed.has(skillId));
  }, [state.taskSkills, TASKS, allowedSkillIds]);

  // ── Skill management ────────────────────────────────────────────

  const attachSkill = useCallback((taskId, skillId) => {
    dispatch({ type: 'ATTACH_SKILL', taskId, skillId });
    addLog('SYSTEM', `Attached ${skillId} to ${taskId}`);
  }, [addLog]);

  const detachSkill = useCallback((taskId, skillId) => {
    dispatch({ type: 'DETACH_SKILL', taskId, skillId });
    addLog('SYSTEM', `Detached ${skillId} from ${taskId}`);
  }, [addLog]);

  const setTaskModel = useCallback((taskId, modelId) => {
    dispatch({ type: 'SET_TASK_MODEL', taskId, modelId });
  }, []);

  // ── Run / Cancel ────────────────────────────────────────────────

  const runTask = useCallback(async (taskId) => {
    const task = TASKS.find(t => t.id === taskId);
    if (!task) return;

    // Target app health gate: don't start tasks if the app is down
    try {
      const healthRes = await fetch('/api/app-health');
      const healthData = await healthRes.json();
      if (healthData.healthy === false) {
        addLog('SYSTEM', `Blocked: ${healthData.name || 'Target app'} is not running (port ${healthData.port})`, 'error');
        return;
      }
    } catch { /* health check may not be available — allow spawn */ }

    // Spawn guard: check session manager capacity before starting
    try {
      const smRes = await fetch('/api/session-manager');
      const smData = await smRes.json();
      if (smData.ok && smData.canSpawn && !smData.canSpawn.canSpawn) {
        addLog('SYSTEM', `Spawn blocked: ${smData.canSpawn.warning || 'at capacity'}`, 'error');
        return;
      }
    } catch { /* session manager may not be running yet — allow spawn */ }

    const model = getTaskModel(taskId);
    const modelShort = (MODELS.find(m => m.id === model) || {}).short || 'default';
    const skillIds = getTaskSkills(taskId);
    const skillNames = skillIds.map(sid => SKILLS.find(s => s.id === sid)?.name).filter(Boolean);

    addLog('SYSTEM', `Run: S${task.num} ${task.title} [${modelShort}]${skillNames.length ? ` + ${skillNames.join(', ')}` : ''}`);
    dispatch({ type: 'SET_PENDING', id: taskId, data: { requestedAt: Date.now(), model, modelShort } });

    // Clear previous result so polling sees a fresh transition to "running"
    await fetch(`/api/results/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'running', startedAt: new Date().toISOString(), progress: 0 }),
    });

    try {
      const r = await fetch('/api/run-agent-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: taskId, profile: 'openclaw', model, skills: skillIds, timestamp: Date.now() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      dispatch({ type: 'CLEAR_PENDING', id: taskId });
      addLog(taskId.toUpperCase(), `Running (pid:${data.pid || '?'})`);

      // If gateway streaming is available, start streaming
      if (data.streaming) {
        dispatch({ type: 'SET_STREAMING_TEXT', taskId, text: '' });
      }
    } catch (e) {
      addLog('SYSTEM', `Start failed S${task.num}: ${e.message}`, 'error');
    }
  }, [TASKS, MODELS, SKILLS, addLog, getTaskModel, getTaskSkills]);

  const cancelTask = useCallback(async (taskId) => {
    addLog('SYSTEM', `Cancel: ${taskId.toUpperCase()}`);
    dispatch({ type: 'CLEAR_STREAMING_TEXT', taskId });
    try {
      const r = await fetch('/api/run-agent-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: taskId }),
      });
      const data = await r.json().catch(() => ({}));
      if (data?.ok) addLog(taskId.toUpperCase(), 'Cancelled', 'success');
      else addLog('SYSTEM', `Cancel failed: ${data?.error || '?'}`, 'error');
    } catch (e) {
      addLog('SYSTEM', `Cancel error: ${e.message}`, 'error');
    }
  }, [addLog]);

  // ── Pipeline orchestration ──────────────────────────────────────

  const { allPipelines, runPipeline, runInlinePipeline, stopPipeline, onPollResults } = usePipelineRunner({
    state, dispatch, addLog, runTask, tasks: TASKS, pipelines: PIPELINES,
  });

  // ── Pipeline CRUD ───────────────────────────────────────────────

  const createPipeline = useCallback((name, taskIds) => {
    const id = `custom-${Date.now()}`;
    const pipeline = { id, name, taskIds };
    dispatch({ type: 'ADD_PIPELINE', pipeline });
    addLog('SYSTEM', `Created pipeline: ${name}`);
    return id;
  }, [addLog]);

  const updatePipeline = useCallback((id, updates) => {
    dispatch({ type: 'UPDATE_PIPELINE', id, updates });
  }, []);

  const deletePipeline = useCallback((id) => {
    dispatch({ type: 'DELETE_PIPELINE', id });
  }, []);

  // ── Polling ─────────────────────────────────────────────────────

  const pollResults = useCallback(async () => {
    try {
      const res = await fetch('/api/results');
      const results = await res.json();
      const now = Date.now();

      // Clear pending runs that started or timed out
      const pending = { ...state.pendingRuns };
      let changed = false;
      for (const id of Object.keys(pending)) {
        if (results[id]?.status === 'running') { delete pending[id]; changed = true; }
        else if (now - pending[id].requestedAt > 240_000) {
          delete pending[id]; changed = true;
          addLog('SYSTEM', `Timeout waiting for ${id}`, 'error');
        }
      }
      if (changed) {
        for (const id of Object.keys(state.pendingRuns)) {
          if (!pending[id]) dispatch({ type: 'CLEAR_PENDING', id });
        }
      }

      // Pipeline advancement + log transitions
      onPollResults(results);

      // Clear streaming text for tasks that are no longer running
      for (const taskId of Object.keys(state.streamingText || {})) {
        const s = results[taskId]?.status;
        if (s && s !== 'running') {
          dispatch({ type: 'CLEAR_STREAMING_TEXT', taskId });
        }
      }

      dispatch({ type: 'SET_RESULTS', results });
    } catch {
      dispatch({ type: 'SET_POLL_OFFLINE' });
    }
  }, [state.pendingRuns, state.streamingText, addLog, onPollResults]);

  // Poll results: 5s normally, could be faster if tasks are running
  const hasRunning = useMemo(() => {
    return Object.values(state.results || {}).some(r => r?.status === 'running') ||
      Object.keys(state.pendingRuns || {}).length > 0;
  }, [state.results, state.pendingRuns]);
  usePolling(pollResults, hasRunning ? 3000 : 8000);

  // ── Global actions ──────────────────────────────────────────────

  const resetAll = useCallback(async () => {
    if (!window.confirm('Reset all results?')) return;
    await fetch('/api/results/system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', timestamp: Date.now() }),
    });
    addLog('SYSTEM', 'All results reset', 'success');
  }, [addLog]);

  const cleanAllTasks = useCallback(async () => {
    if (!window.confirm('Clean ALL task records?')) return;
    dispatch({ type: 'SET_ACTIVE_PIPELINE', data: { pipelineId: null, currentTaskId: null, finished: new Set() } });
    try {
      const r = await fetch('/api/results/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clean-all-tasks', timestamp: Date.now() }),
      });
      const data = await r.json();
      addLog('SYSTEM', data?.ok ? `Cleaned ${data.cleaned || 0} records` : `Failed: ${data?.error}`, data?.ok ? 'success' : 'error');
    } catch (e) {
      addLog('SYSTEM', `Clean failed: ${e.message}`, 'error');
    }
  }, [addLog]);

  const clearLog = useCallback(() => dispatch({ type: 'CLEAR_LOG' }), []);

  // ── Context value ───────────────────────────────────────────────

  return (
    <Ctx.Provider value={{
      ...state,
      allPipelines,
      addLog, clearLog,
      getTaskModel, setTaskModel,
      getTaskSkills, attachSkill, detachSkill,
      runTask, cancelTask,
      runPipeline, runInlinePipeline, stopPipeline,
      createPipeline, updatePipeline, deletePipeline,
      resetAll, cleanAllTasks,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDashboard must be inside DashboardProvider');
  return ctx;
}
