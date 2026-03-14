/**
 * Ruflo Swarm Queen — coordinator for parallel task execution.
 *
 * Reads dependency DAG from tasks.json, topologically sorts,
 * distributes to workers respecting maxActiveSessions and model assignments.
 *
 * Queen modes: Strategic (planning), Tactical (execution), Adaptive (mid-pipeline adjustment)
 */

import { getProjectConfig } from '@/lib/project-loader';
import { selectModel } from './task-router.js';
import { SwarmScheduler } from './swarm-scheduler.js';

const MODES = {
  strategic: { planAhead: true, rebalance: false },
  tactical: { planAhead: false, rebalance: false },
  adaptive: { planAhead: true, rebalance: true },
};

class SwarmQueen {
  constructor() {
    this._mode = 'tactical';
    this._scheduler = null;
    this._active = false;
    this._pipelineId = null;
    this._workers = new Map(); // taskId -> worker state
    this._completedTasks = new Set();
    this._failedTasks = new Set();
    this._onTaskStart = null;
    this._onTaskComplete = null;
    this._listeners = [];
    this._stats = { started: 0, completed: 0, failed: 0, redistributed: 0 };
  }

  /**
   * Start a swarm pipeline.
   */
  start(pipelineId, taskIds, opts = {}) {
    if (this._active) this.stop();

    const { tasks, pipelineConfig } = getProjectConfig();
    const maxActiveSessions = pipelineConfig?.maxActiveSessions
      || getProjectConfig().project?.sessionManager?.maxActiveSessions || 4;

    this._mode = opts.mode || 'tactical';
    this._pipelineId = pipelineId;
    this._active = true;
    this._completedTasks.clear();
    this._failedTasks.clear();
    this._workers.clear();
    this._onTaskStart = opts.onTaskStart;
    this._onTaskComplete = opts.onTaskComplete;

    // Build DAG
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const dag = {};
    for (const id of taskIds) {
      const task = taskMap.get(id);
      dag[id] = {
        deps: (task?.deps || []).filter(d => taskIds.includes(d)),
        model: selectModel(id).modelId,
      };
    }

    this._scheduler = new SwarmScheduler(dag, maxActiveSessions);
    this._emit('started', { pipelineId, taskCount: taskIds.length, mode: this._mode });
    this._advance();
  }

  /**
   * Advance the pipeline — schedule ready tasks.
   */
  _advance() {
    if (!this._active || !this._scheduler) return;

    const ready = this._scheduler.getReadyTasks(this._completedTasks, this._failedTasks, this._workers);

    for (const taskId of ready) {
      if (this._workers.has(taskId)) continue;

      const model = selectModel(taskId);
      this._workers.set(taskId, {
        taskId,
        model: model.modelId,
        status: 'starting',
        startedAt: Date.now(),
      });

      this._stats.started++;
      this._emit('task-starting', { taskId, model: model.modelId });

      if (this._onTaskStart) {
        this._onTaskStart(taskId, model.modelId);
      }
    }

    // Check if pipeline is complete
    const allTasks = this._scheduler.allTaskIds();
    const done = allTasks.every(id => this._completedTasks.has(id) || this._failedTasks.has(id));
    if (done) {
      this._active = false;
      this._emit('completed', {
        pipelineId: this._pipelineId,
        completed: this._completedTasks.size,
        failed: this._failedTasks.size,
      });
    }
  }

  /**
   * Report task completion.
   */
  reportCompletion(taskId, status) {
    const worker = this._workers.get(taskId);
    if (worker) {
      worker.status = status;
      worker.completedAt = Date.now();
    }
    this._workers.delete(taskId);

    if (status === 'passed' || status === 'done' || status === 'completed') {
      this._completedTasks.add(taskId);
      this._stats.completed++;
    } else {
      this._failedTasks.add(taskId);
      this._stats.failed++;

      // Adaptive mode: redistribute with model swap
      if (MODES[this._mode]?.rebalance) {
        this._stats.redistributed++;
        this._emit('redistribute', { taskId, reason: 'task-failed' });
      }
    }

    if (this._onTaskComplete) {
      this._onTaskComplete(taskId, status);
    }

    this._emit('task-completed', { taskId, status });
    this._advance();
  }

  /**
   * Stop the swarm.
   */
  stop() {
    this._active = false;
    this._pipelineId = null;
    this._workers.clear();
    this._emit('stopped', {});
  }

  /**
   * Pause the swarm.
   */
  pause() {
    this._active = false;
    this._emit('paused', {});
  }

  /**
   * Resume the swarm.
   */
  resume() {
    this._active = true;
    this._advance();
    this._emit('resumed', {});
  }

  /**
   * Get status.
   */
  getStatus() {
    return {
      active: this._active,
      mode: this._mode,
      pipelineId: this._pipelineId,
      workers: [...this._workers.values()],
      completed: [...this._completedTasks],
      failed: [...this._failedTasks],
      stats: { ...this._stats },
      ready: this._scheduler?.getReadyTasks(this._completedTasks, this._failedTasks, this._workers) || [],
    };
  }

  /**
   * Subscribe to events.
   */
  on(listener) {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter(l => l !== listener); };
  }

  _emit(event, data) {
    for (const listener of this._listeners) {
      try { listener(event, data); } catch { /* skip */ }
    }
  }
}

const swarmQueen = new SwarmQueen();
export default swarmQueen;
