/**
 * Token Optimization Tracker — inspired by ruflo's token optimization patterns
 * that reduce API costs by 30-50% through intelligent tracking and routing.
 *
 * Tracks:
 *   - Per-task token usage (estimated from result payloads)
 *   - Per-model cost efficiency
 *   - Context compression opportunities
 *   - Optimal model routing suggestions
 *
 * This module doesn't directly control tokens (that's the LLM provider's job),
 * but it tracks usage patterns to inform model selection and identify waste.
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  enabled: true,
  trackPerTask: true,
  trackPerModel: true,
  costAlerts: {
    warnThresholdTokens: 100000,    // warn if a single task uses > 100k tokens
    criticalThresholdTokens: 500000, // critical if > 500k tokens
  },
  maxHistory: 500,
};

function loadTokenConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.tokenTracking || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// Rough cost estimates per 1K tokens (input/output averaged)
// Use namespaced IDs to match what results files report
const MODEL_COSTS = {
  'anthropic/claude-opus-4-6': 0.015,
  'anthropic/claude-sonnet-4-6': 0.003,
  'anthropic/claude-haiku-4-5': 0.00025,
  'openai-codex/gpt-5.3-codex': 0.006,
  'openai/gpt-4.1': 0.01,
  // Also support bare names for backwards compat
  'claude-opus-4-6': 0.015,
  'claude-sonnet-4-6': 0.003,
  'claude-haiku-4-5': 0.00025,
  'gpt-5.3-codex': 0.006,
  'gpt-4.1': 0.01,
  default: 0.005,
};

// ---------------------------------------------------------------------------
// Token Tracker — singleton
// ---------------------------------------------------------------------------

class TokenTracker {
  constructor() {
    this._taskUsage = new Map();     // taskId -> { totalTokens, runs[] }
    this._modelUsage = new Map();    // modelId -> { totalTokens, taskCount, totalCost }
    this._history = [];              // ring buffer of tracking events
    this._alerts = [];               // cost alerts
    this._sessionTotal = 0;
  }

  /**
   * Record token usage for a completed task.
   * Estimates tokens from result metadata if not directly available.
   */
  recordTaskCompletion(taskId, result) {
    const config = loadTokenConfig();
    if (!config.enabled) return;

    const model = result.model || 'unknown';
    const estimatedTokens = this._estimateTokens(result);

    // Per-task tracking
    if (config.trackPerTask) {
      if (!this._taskUsage.has(taskId)) {
        this._taskUsage.set(taskId, { totalTokens: 0, runs: [] });
      }
      const taskEntry = this._taskUsage.get(taskId);
      taskEntry.totalTokens += estimatedTokens;
      taskEntry.runs.push({
        ts: Date.now(),
        model,
        tokens: estimatedTokens,
        status: result.status,
        durationMs: this._estimateDuration(result),
      });
      if (taskEntry.runs.length > 20) taskEntry.runs = taskEntry.runs.slice(-20);
    }

    // Per-model tracking
    if (config.trackPerModel) {
      if (!this._modelUsage.has(model)) {
        this._modelUsage.set(model, { totalTokens: 0, taskCount: 0, totalCost: 0, passed: 0, failed: 0 });
      }
      const modelEntry = this._modelUsage.get(model);
      modelEntry.totalTokens += estimatedTokens;
      modelEntry.taskCount++;
      modelEntry.totalCost += this._estimateCost(model, estimatedTokens);
      if (result.status === 'passed') modelEntry.passed++;
      if (result.status === 'failed') modelEntry.failed++;
    }

    this._sessionTotal += estimatedTokens;

    // Check alerts
    if (estimatedTokens > config.costAlerts.criticalThresholdTokens) {
      this._addAlert('critical', taskId, model, estimatedTokens);
    } else if (estimatedTokens > config.costAlerts.warnThresholdTokens) {
      this._addAlert('warn', taskId, model, estimatedTokens);
    }

    this._addHistory('task-complete', taskId, { model, tokens: estimatedTokens, status: result.status });
  }

  /**
   * Get the most cost-efficient model based on pass rate / cost ratio.
   */
  getMostEfficientModel() {
    let best = null;
    let bestRatio = -1;

    for (const [modelId, stats] of this._modelUsage) {
      if (stats.taskCount < 3) continue; // need enough data
      const passRate = stats.taskCount > 0 ? stats.passed / stats.taskCount : 0;
      const costPer = stats.totalCost / stats.taskCount;
      const ratio = costPer > 0 ? passRate / costPer : 0;

      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = {
          modelId,
          passRate: Math.round(passRate * 100),
          avgCost: Math.round(costPer * 10000) / 10000,
          efficiencyRatio: Math.round(ratio * 100),
          totalTasks: stats.taskCount,
        };
      }
    }

    return best;
  }

  /**
   * Suggest optimal model for a task based on complexity signal.
   * Implements ruflo's 3-tier routing concept:
   *   - Simple tasks → cheaper model
   *   - Complex tasks → capable model
   */
  suggestModel(taskComplexity = 'medium') {
    const tiers = {
      simple: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
      medium: ['claude-sonnet-4-6', 'gpt-5.3-codex'],
      complex: ['claude-opus-4-6', 'gpt-5.3-codex'],
    };

    const suggestions = tiers[taskComplexity] || tiers.medium;

    // If we have usage data, prefer the model with best efficiency
    const efficient = this.getMostEfficientModel();
    if (efficient && suggestions.includes(efficient.modelId)) {
      return { suggested: efficient.modelId, reason: 'best-efficiency', alternatives: suggestions };
    }

    return { suggested: suggestions[0], reason: 'tier-default', alternatives: suggestions };
  }

  /**
   * Get full status for API.
   */
  getStatus() {
    const config = loadTokenConfig();
    const modelStats = {};
    for (const [modelId, stats] of this._modelUsage) {
      modelStats[modelId] = {
        ...stats,
        passRate: stats.taskCount > 0 ? Math.round((stats.passed / stats.taskCount) * 100) : 0,
        avgTokensPerTask: stats.taskCount > 0 ? Math.round(stats.totalTokens / stats.taskCount) : 0,
        avgCostPerTask: stats.taskCount > 0 ? Math.round((stats.totalCost / stats.taskCount) * 10000) / 10000 : 0,
      };
    }

    return {
      enabled: config.enabled,
      sessionTotalTokens: this._sessionTotal,
      sessionEstimatedCost: Math.round(this._sessionTotal * 0.005 / 1000 * 10000) / 10000,
      modelStats,
      mostEfficient: this.getMostEfficientModel(),
      taskCount: this._taskUsage.size,
      recentAlerts: this._alerts.slice(0, 10),
      recentHistory: this._history.slice(0, 20),
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  _estimateTokens(result) {
    // If the result has explicit token count, use it
    if (result.tokensUsed) return result.tokensUsed;

    // Rough heuristic: estimate from findings count, pass/fail counts, and duration
    const baseTokens = 5000; // minimum overhead
    const findingsTokens = (result.findings?.length || 0) * 500;
    const testTokens = ((result.passed || 0) + (result.failed || 0)) * 200;
    const durationTokens = this._estimateDuration(result) / 1000 * 50; // ~50 tokens/sec

    return Math.round(baseTokens + findingsTokens + testTokens + durationTokens);
  }

  _estimateDuration(result) {
    if (result.startedAt && result.finishedAt) {
      return Math.max(0, Date.parse(result.finishedAt) - Date.parse(result.startedAt));
    }
    return 60000; // default 1 min
  }

  _estimateCost(model, tokens) {
    const rate = MODEL_COSTS[model] || MODEL_COSTS.default;
    return (tokens / 1000) * rate;
  }

  _addAlert(severity, taskId, model, tokens) {
    this._alerts.unshift({
      ts: Date.now(),
      severity,
      taskId,
      model,
      tokens,
      message: `${severity.toUpperCase()}: Task ${taskId} used ~${tokens} tokens (model: ${model})`,
    });
    if (this._alerts.length > 50) this._alerts.length = 50;
  }

  _addHistory(type, taskId, data = {}) {
    this._history.unshift({ ts: Date.now(), type, taskId, ...data });
    const config = loadTokenConfig();
    if (this._history.length > (config.maxHistory || 500)) this._history.length = config.maxHistory || 500;
  }
}

// Module-level singleton
const tokenTracker = new TokenTracker();
export default tokenTracker;
