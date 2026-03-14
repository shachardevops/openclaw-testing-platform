'use client';

import { useCallback, useRef, useEffect } from 'react';
import type { DashboardState, DashboardAction, ActivePipeline, CustomPipeline } from '@/types/state';
import type { TaskDefinition, PipelineDefinition } from '@/types/config';
import type { ResultsMap } from '@/types/results';

interface PipelineRunnerOptions {
  state: DashboardState;
  dispatch: React.Dispatch<DashboardAction>;
  addLog: (agent: string, msg: string, type?: string) => void;
  runTask: (taskId: string) => Promise<void>;
  tasks: TaskDefinition[];
  pipelines: PipelineDefinition[];
}

/**
 * Pipeline orchestration: sequential task execution with auto-advance.
 * Uses a ref to avoid stale closure issues with activePipeline state.
 */
export function usePipelineRunner({ state, dispatch, addLog, runTask, tasks: TASKS, pipelines: PIPELINES }: PipelineRunnerOptions) {
  const allPipelines: (PipelineDefinition | CustomPipeline)[] = [...PIPELINES, ...state.customPipelines];
  const TASK_IDS = TASKS.map(t => t.id);
  const prevResultsRef = useRef<ResultsMap>({});

  // Keep a fresh ref of activePipeline to avoid stale closures in setTimeout callbacks
  const activePipelineRef = useRef<ActivePipeline>(state.activePipeline);
  useEffect(() => {
    activePipelineRef.current = state.activePipeline;
  }, [state.activePipeline]);

  // Queue next task in the active pipeline
  const queueNext = useCallback(async () => {
    const ap = activePipelineRef.current as ActivePipeline & { taskIds?: string[] };
    if (!ap.pipelineId || ap.currentTaskId || !ap.taskIds) return;

    // Target app health gate: pause pipeline if app is down
    try {
      const healthRes = await fetch('/api/app-health');
      const healthData = await healthRes.json();
      if (healthData.healthy === false) {
        addLog('PIPELINE', `Paused: ${healthData.name || 'Target app'} is not running (port ${healthData.port}). Will retry on next poll.`, 'error');
        return; // Don't advance — onPollResults will retry via queueNext
      }
    } catch (e: unknown) { /* allow if health check unavailable */ }

    const nextId = ap.taskIds.find((id: string) => !ap.finished.has(id));
    if (!nextId) {
      dispatch({ type: 'SET_ACTIVE_PIPELINE', data: { pipelineId: null, currentTaskId: null, taskIds: null, finished: new Set() } as unknown as Partial<ActivePipeline> });
      addLog('PIPELINE', 'Pipeline complete', 'success');
      return;
    }

    const t = TASKS.find(x => x.id === nextId);
    dispatch({ type: 'SET_ACTIVE_PIPELINE', data: { currentTaskId: nextId } });
    addLog('PIPELINE', `Running: S${t?.num ?? '?'} ${t?.title || nextId}`);

    // Await runTask so the result file is reset to "running" before any poll reads it.
    await runTask(nextId);

    // Only start watching for completion after the result file is confirmed reset
    prevResultsRef.current = { ...prevResultsRef.current, [nextId]: { status: 'running' } };
  }, [TASKS, dispatch, addLog, runTask]);

  // Start a pipeline directly from task IDs (no lookup needed)
  const runInlinePipeline = useCallback((name: string, taskIds: string[]) => {
    const pipelineId = `inline-${Date.now()}`;
    const newAp = { pipelineId, taskIds, currentTaskId: null, finished: new Set<string>() };
    activePipelineRef.current = { ...activePipelineRef.current, ...newAp };
    dispatch({ type: 'SET_ACTIVE_PIPELINE', data: newAp as unknown as Partial<ActivePipeline> });
    addLog('PIPELINE', `Started: ${name} (${taskIds.length} tasks)`);
    setTimeout(queueNext, 100);
  }, [dispatch, addLog, queueNext]);

  // Start a pipeline by ID
  const runPipeline = useCallback((pipelineId: string) => {
    const p = allPipelines.find(x => x.id === pipelineId);
    if (!p) return;
    const newAp = { pipelineId, taskIds: p.taskIds, currentTaskId: null, finished: new Set<string>() };
    activePipelineRef.current = { ...activePipelineRef.current, ...newAp };
    dispatch({ type: 'SET_ACTIVE_PIPELINE', data: newAp as unknown as Partial<ActivePipeline> });
    addLog('PIPELINE', `Started: ${p.name} (${p.taskIds.length} tasks)`);
    setTimeout(queueNext, 100);
  }, [allPipelines, dispatch, addLog, queueNext]);

  // Stop the active pipeline
  const stopPipeline = useCallback(() => {
    const newAp = { pipelineId: null, currentTaskId: null, taskIds: null, finished: new Set<string>() };
    activePipelineRef.current = { ...activePipelineRef.current, ...newAp };
    dispatch({ type: 'SET_ACTIVE_PIPELINE', data: newAp as unknown as Partial<ActivePipeline> });
    addLog('PIPELINE', 'Stopped');
  }, [dispatch, addLog]);

  // Called on each poll — detects task completion and advances pipeline
  const onPollResults = useCallback((results: ResultsMap) => {
    // Log status transitions
    for (const id of TASK_IDS) {
      const cur = results[id];
      const prev = prevResultsRef.current[id];
      if (cur?.lastLog && cur.lastLog !== prev?.lastLog) {
        addLog(id.toUpperCase(), cur.lastLog, cur.status === 'failed' ? 'error' : cur.status === 'passed' ? 'success' : '');
      }
    }

    // Advance pipeline on task completion (with quality gate check)
    const ap = activePipelineRef.current;
    if (ap.pipelineId && ap.currentTaskId) {
      const prevSt = prevResultsRef.current[ap.currentTaskId]?.status;
      const nextSt = results[ap.currentTaskId]?.status;
      if (nextSt && (nextSt === 'passed' || nextSt === 'failed') && nextSt !== prevSt) {
        const t = TASKS.find(x => x.id === ap.currentTaskId);
        addLog('PIPELINE', `Done S${t?.num ?? '?'}: ${nextSt.toUpperCase()}`, nextSt === 'failed' ? 'error' : 'success');

        // Quality gate check via API (non-blocking — warn-only by default)
        fetch('/api/quality-gates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'evaluate', taskId: ap.currentTaskId, result: results[ap.currentTaskId] }),
        }).then(r => r.json()).then(data => {
          if (data?.ok && !data.passed && data.violations?.length > 0) {
            const vMsgs = data.violations.map((v: { rule: string; message: string }) => `[${v.rule}] ${v.message}`).join('; ');
            addLog('GATE', `Quality gate ${data.action === 'blocked' ? 'BLOCKED' : 'WARNING'}: ${vMsgs}`, data.action === 'blocked' ? 'error' : '');
          }
        }).catch(() => { /* quality gate API unavailable — continue */ });

        // Notify learning loop of task completion
        fetch('/api/learning-loop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'learn-result', taskId: ap.currentTaskId, result: results[ap.currentTaskId] }),
        }).catch(() => { /* learning loop unavailable — continue */ });

        const fin = new Set(ap.finished);
        fin.add(ap.currentTaskId);
        const newAp = { currentTaskId: null, finished: fin };
        activePipelineRef.current = { ...activePipelineRef.current, ...newAp };
        dispatch({ type: 'SET_ACTIVE_PIPELINE', data: newAp });
        setTimeout(queueNext, 100);
      }
    }

    prevResultsRef.current = results;
  }, [TASK_IDS, TASKS, dispatch, addLog, queueNext]);

  return { allPipelines, runPipeline, runInlinePipeline, stopPipeline, queueNext, onPollResults };
}
