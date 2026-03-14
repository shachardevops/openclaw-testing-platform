/**
 * Ruflo Agent Booster — skip LLM for simple, pattern-matched operations.
 * Each registered fast-path handles a specific operation type without
 * spawning a full CLI process.
 */

import fs from 'fs';
import path from 'path';
import { resultsDir } from '@/lib/config';

const _stats = {
  hits: 0,
  misses: 0,
  operations: {},
  startedAt: Date.now(),
};

/**
 * Registry of fast-path handlers.
 * Each entry: { name, match: (operation, context) => boolean, handler: async (context) => result }
 */
const FAST_PATHS = [
  {
    name: 'result-status-update',
    match: (op) => op === 'update-result-status',
    handler: async ({ taskId, status, updates }) => {
      const filePath = path.join(resultsDir(), `${taskId}.json`);
      let data = {};
      try {
        if (fs.existsSync(filePath)) {
          data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      } catch { /* start fresh */ }
      data.status = status;
      data.updatedAt = new Date().toISOString();
      if (updates) Object.assign(data, updates);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return { updated: true, taskId, status };
    },
  },
  {
    name: 'auto-fail-task',
    match: (op) => op === 'auto-fail-task',
    handler: async ({ taskId, reason, attemptCount }) => {
      const filePath = path.join(resultsDir(), `${taskId}.json`);
      let data = {};
      try {
        if (fs.existsSync(filePath)) {
          data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      } catch { /* start fresh */ }
      data.status = 'failed';
      data.lastLog = reason || `Auto-failed after ${attemptCount || 0} attempts`;
      data.updatedAt = new Date().toISOString();
      const findings = data.findings || [];
      if (!findings.find(f => f.id === 'orchestrator-recovery')) {
        findings.push({
          id: 'orchestrator-recovery',
          severity: 'error',
          title: 'Orchestrator recovery exhausted',
          description: reason || `Task auto-failed after ${attemptCount || 0} recovery attempts.`,
          createdAt: new Date().toISOString(),
        });
      }
      data.findings = findings;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return { failed: true, taskId };
    },
  },
  {
    name: 'config-reload',
    match: (op) => op === 'config-reload',
    handler: async ({ projectId }) => {
      // Just clear the cache — next getProjectConfig() call re-reads
      const { clearConfigCache } = await import('@/lib/project-loader');
      clearConfigCache();
      return { reloaded: true, projectId };
    },
  },
  {
    name: 'read-result',
    match: (op) => op === 'read-result',
    handler: async ({ taskId }) => {
      const filePath = path.join(resultsDir(), `${taskId}.json`);
      try {
        if (!fs.existsSync(filePath)) return { found: false, taskId };
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return { found: true, taskId, data };
      } catch {
        return { found: false, taskId, error: 'parse-error' };
      }
    },
  },
];

/**
 * Try to handle an operation via fast-path.
 * @param {string} operation - Operation type
 * @param {Object} context - Operation-specific context
 * @returns {{ handled: boolean, result?: any }}
 */
export function tryFastPath(operation, context = {}) {
  for (const fp of FAST_PATHS) {
    if (fp.match(operation, context)) {
      _stats.hits++;
      _stats.operations[fp.name] = (_stats.operations[fp.name] || 0) + 1;
      try {
        const result = fp.handler(context);
        return { handled: true, result, fastPath: fp.name };
      } catch (e) {
        // Fast-path failed — fall through to normal processing
        _stats.misses++;
        return { handled: false, error: e.message };
      }
    }
  }
  _stats.misses++;
  return { handled: false };
}

/**
 * Get booster statistics.
 */
export function getBoosterStats() {
  const total = _stats.hits + _stats.misses;
  return {
    hits: _stats.hits,
    misses: _stats.misses,
    total,
    hitRate: total > 0 ? (_stats.hits / total * 100).toFixed(1) + '%' : '0%',
    operations: { ..._stats.operations },
    uptimeMs: Date.now() - _stats.startedAt,
  };
}

/**
 * Register a custom fast-path handler.
 */
export function registerFastPath(name, matchFn, handlerFn) {
  FAST_PATHS.push({ name, match: matchFn, handler: handlerFn });
}
