import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader';
import { registry } from './service-registry';

const DEFAULT_CONFIG = {
  enabled: true,
  trackPerTask: true,
  trackPerModel: true,
  costAlerts: {
    warnThresholdTokens: 100000,
    criticalThresholdTokens: 500000,
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

const MODEL_COSTS: Record<string, number> = {
  'claude-opus-4-6': 0.015,
  'claude-sonnet-4-6': 0.003,
  'claude-haiku-4-5': 0.00025,
  'gpt-5.3-codex': 0.006,
  'gpt-4.1': 0.01,
  default: 0.005,
};

interface TaskUsageEntry {
  totalTokens: number;
  runs: Array<{ ts: number; model: string; tokens: number; status: string; durationMs: number }>;
}

interface ModelUsageEntry {
  totalTokens: number;
  taskCount: number;
  totalCost: number;
  passed: number;
  failed: number;
}

interface TokenAlert {
  ts: number;
  severity: string;
  taskId: string;
  model: string;
  tokens: number;
  message: string;
}

interface TokenHistoryEntry {
  ts: number;
  type: string;
  taskId: string;
  [key: string]: any;
}

class TokenTracker {
  private _taskUsage: Map<string, TaskUsageEntry> = new Map();
  private _modelUsage: Map<string, ModelUsageEntry> = new Map();
  private _history: TokenHistoryEntry[] = [];
  private _alerts: TokenAlert[] = [];
  private _sessionTotal: number = 0;

  recordTaskCompletion(taskId: string, result: Record<string, any>): void {
    const config = loadTokenConfig();
    if (!config.enabled) return;

    const model = result.model || 'unknown';
    const estimatedTokens = this._estimateTokens(result);

    if (config.trackPerTask) {
      if (!this._taskUsage.has(taskId)) {
        this._taskUsage.set(taskId, { totalTokens: 0, runs: [] });
      }
      const taskEntry = this._taskUsage.get(taskId)!;
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

    if (config.trackPerModel) {
      if (!this._modelUsage.has(model)) {
        this._modelUsage.set(model, { totalTokens: 0, taskCount: 0, totalCost: 0, passed: 0, failed: 0 });
      }
      const modelEntry = this._modelUsage.get(model)!;
      modelEntry.totalTokens += estimatedTokens;
      modelEntry.taskCount++;
      modelEntry.totalCost += this._estimateCost(model, estimatedTokens);
      if (result.status === 'passed') modelEntry.passed++;
      if (result.status === 'failed') modelEntry.failed++;
    }

    this._sessionTotal += estimatedTokens;

    if (estimatedTokens > config.costAlerts.criticalThresholdTokens) {
      this._addAlert('critical', taskId, model, estimatedTokens);
    } else if (estimatedTokens > config.costAlerts.warnThresholdTokens) {
      this._addAlert('warn', taskId, model, estimatedTokens);
    }

    this._addHistory('task-complete', taskId, { model, tokens: estimatedTokens, status: result.status });
  }

  getMostEfficientModel(): Record<string, any> | null {
    let best: Record<string, any> | null = null;
    let bestRatio = -1;

    for (const [modelId, stats] of this._modelUsage) {
      if (stats.taskCount < 3) continue;
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

  suggestModel(taskComplexity: string = 'medium'): Record<string, any> {
    const tiers: Record<string, string[]> = {
      simple: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
      medium: ['claude-sonnet-4-6', 'gpt-5.3-codex'],
      complex: ['claude-opus-4-6', 'gpt-5.3-codex'],
    };

    const suggestions = tiers[taskComplexity] || tiers.medium;

    const efficient = this.getMostEfficientModel();
    if (efficient && suggestions.includes(efficient.modelId)) {
      return { suggested: efficient.modelId, reason: 'best-efficiency', alternatives: suggestions };
    }

    return { suggested: suggestions[0], reason: 'tier-default', alternatives: suggestions };
  }

  getStatus() {
    const config = loadTokenConfig();
    const modelStats: Record<string, any> = {};
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
      sessionEstimatedCost: Math.round(this._sessionTotal * (MODEL_COSTS['default'] || 0.005) / 1000 * 10000) / 10000,
      modelStats,
      mostEfficient: this.getMostEfficientModel(),
      taskCount: this._taskUsage.size,
      recentAlerts: this._alerts.slice(0, 10),
      recentHistory: this._history.slice(0, 20),
    };
  }

  private _estimateTokens(result: Record<string, any>): number {
    if (result.tokensUsed) return result.tokensUsed;

    const baseTokens = 5000;
    const findingsTokens = (result.findings?.length || 0) * 500;
    const testTokens = ((result.passed || 0) + (result.failed || 0)) * 200;
    const durationTokens = this._estimateDuration(result) / 1000 * 50;

    return Math.round(baseTokens + findingsTokens + testTokens + durationTokens);
  }

  private _estimateDuration(result: Record<string, any>): number {
    if (result.startedAt && result.finishedAt) {
      return Math.max(0, Date.parse(result.finishedAt) - Date.parse(result.startedAt));
    }
    return 60000;
  }

  private _estimateCost(model: string, tokens: number): number {
    const rate = MODEL_COSTS[model] || MODEL_COSTS.default;
    return (tokens / 1000) * rate;
  }

  private _addAlert(severity: string, taskId: string, model: string, tokens: number): void {
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

  private _addHistory(type: string, taskId: string, data: Record<string, any> = {}): void {
    this._history.unshift({ ts: Date.now(), type, taskId, ...data });
    const config = loadTokenConfig();
    if (this._history.length > (config.maxHistory || 500)) this._history.length = config.maxHistory || 500;
  }
}

const tokenTracker = new TokenTracker();
registry.register('tokenTracker', () => tokenTracker);
export default tokenTracker;
