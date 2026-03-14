/**
 * Ruflo Swarm Worker — wraps individual task execution with health reporting.
 */

import { createEvent } from './stream-chain.js';
import { pushChainEvent } from '@/lib/ruflo/chain-bus';

export class SwarmWorker {
  constructor(taskId, model, opts = {}) {
    this.taskId = taskId;
    this.model = model;
    this.chainId = opts.chainId || `swarm-${Date.now()}`;
    this.status = 'idle';
    this.checkpoints = [];
    this.startedAt = null;
    this.completedAt = null;
  }

  /**
   * Start the worker — emits stream events.
   */
  start() {
    this.status = 'running';
    this.startedAt = Date.now();
    this._emit('worker-start', { taskId: this.taskId, model: this.model });
  }

  /**
   * Record a checkpoint.
   */
  checkpoint(name, data = {}) {
    const cp = {
      name,
      ts: Date.now(),
      ...data,
    };
    this.checkpoints.push(cp);
    this._emit('checkpoint', { taskId: this.taskId, checkpoint: cp });
  }

  /**
   * Report progress.
   */
  progress(pct, message) {
    this._emit('progress', { taskId: this.taskId, progress: pct, message });
  }

  /**
   * Complete the worker.
   */
  complete(status, result = {}) {
    this.status = status;
    this.completedAt = Date.now();
    this._emit('worker-complete', {
      taskId: this.taskId,
      status,
      duration: this.completedAt - this.startedAt,
      checkpoints: this.checkpoints.length,
      ...result,
    });
  }

  _emit(type, data) {
    try {
      pushChainEvent(this.chainId, createEvent(type, data));
    } catch { /* stream may not be active */ }
  }
}
