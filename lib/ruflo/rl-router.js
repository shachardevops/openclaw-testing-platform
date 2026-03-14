/**
 * Ruflo RL Router — UCB1 contextual bandit for model selection.
 *
 * Arms = models. Context = story complexity, actor type, historical performance.
 * Reward signal: +1.0 pass w/ bugs, +0.5 clean pass, +0.3 fail w/ findings, 0.0 fail nothing, -0.1*(duration/30min)
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';

function getQTablePath() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory', 'rl-q-table.json');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory', 'rl-q-table.json');
  }
}

class RLRouter {
  constructor() {
    this._qTable = {}; // contextKey -> { [modelId]: { totalReward, count, avgReward } }
    this._explorationRate = 0.2; // epsilon for epsilon-greedy
    this._totalObservations = 0;
    this._load();
  }

  _load() {
    try {
      const p = getQTablePath();
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        this._qTable = data.qTable || {};
        this._explorationRate = data.explorationRate ?? 0.2;
        this._totalObservations = data.totalObservations || 0;
      }
    } catch { /* start fresh */ }
  }

  _persist() {
    try {
      const p = getQTablePath();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify({
        qTable: this._qTable,
        explorationRate: this._explorationRate,
        totalObservations: this._totalObservations,
        updatedAt: new Date().toISOString(),
      }, null, 2));
    } catch { /* best-effort */ }
  }

  /**
   * Build a context key from task features.
   */
  _contextKey(context) {
    const parts = [
      context.complexity || 'medium',
      context.actor || 'all',
    ];
    return parts.join(':');
  }

  /**
   * UCB1 score for a model in a given context.
   */
  _ucb1Score(entry, totalTrials) {
    if (!entry || entry.count === 0) return Infinity; // Unexplored = max priority
    const exploitation = entry.avgReward;
    const exploration = Math.sqrt(2 * Math.log(totalTrials) / entry.count);
    return exploitation + exploration;
  }

  /**
   * Recommend a model for a task.
   * @param {string} taskId
   * @param {Object} context - { complexity, actor, models[] }
   * @returns {{ modelId, confidence, reason, alternatives[] }}
   */
  recommend(taskId, context = {}) {
    const { models } = getProjectConfig();
    const availableModels = context.models || models.map(m => m.id);
    const ctxKey = this._contextKey(context);
    const ctxEntry = this._qTable[ctxKey] || {};

    // Epsilon-greedy exploration
    if (Math.random() < this._explorationRate) {
      const randomModel = availableModels[Math.floor(Math.random() * availableModels.length)];
      return {
        modelId: randomModel,
        confidence: 0.3,
        reason: 'exploration (epsilon-greedy)',
        alternatives: availableModels.filter(m => m !== randomModel).map(m => ({
          modelId: m,
          score: this._ucb1Score(ctxEntry[m], this._totalObservations + 1),
        })),
      };
    }

    // UCB1 selection
    let bestModel = availableModels[0];
    let bestScore = -Infinity;
    const alternatives = [];

    for (const modelId of availableModels) {
      const score = this._ucb1Score(ctxEntry[modelId], this._totalObservations + 1);
      alternatives.push({ modelId, score: Math.round(score * 1000) / 1000 });
      if (score > bestScore) {
        bestScore = score;
        bestModel = modelId;
      }
    }

    const entry = ctxEntry[bestModel];
    const confidence = entry && entry.count > 5 ? Math.min(0.95, 0.5 + entry.avgReward * 0.4) : 0.4;

    return {
      modelId: bestModel,
      confidence,
      reason: entry ? `UCB1 (avg reward: ${entry.avgReward.toFixed(2)}, trials: ${entry.count})` : 'UCB1 (unexplored)',
      alternatives: alternatives.filter(a => a.modelId !== bestModel),
    };
  }

  /**
   * Observe a result and update Q-table.
   * @param {string} taskId
   * @param {string} modelId
   * @param {Object} outcome - { status, passed, failed, bugsFound, durationMs }
   */
  observe(taskId, modelId, outcome = {}) {
    const context = outcome.context || {};
    const ctxKey = this._contextKey(context);

    // Compute reward
    let reward = 0;
    const { status, passed, failed, bugsFound = 0, durationMs = 0 } = outcome;

    if (status === 'passed' && bugsFound > 0) reward = 1.0;
    else if (status === 'passed') reward = 0.5;
    else if (status === 'failed' && bugsFound > 0) reward = 0.3;
    else reward = 0.0;

    // Duration penalty
    if (durationMs > 0) {
      reward -= 0.1 * (durationMs / (30 * 60 * 1000));
    }

    // Update Q-table
    if (!this._qTable[ctxKey]) this._qTable[ctxKey] = {};
    const entry = this._qTable[ctxKey][modelId] || { totalReward: 0, count: 0, avgReward: 0 };
    entry.totalReward += reward;
    entry.count++;
    entry.avgReward = entry.totalReward / entry.count;
    entry.lastObservedAt = new Date().toISOString();
    this._qTable[ctxKey][modelId] = entry;

    this._totalObservations++;
    this._persist();

    return { reward, ctxKey, modelId, newAvg: entry.avgReward };
  }

  /**
   * Get stats for API.
   */
  getStats() {
    const contexts = Object.keys(this._qTable).length;
    const entries = Object.values(this._qTable).reduce((sum, ctx) => sum + Object.keys(ctx).length, 0);
    return {
      totalObservations: this._totalObservations,
      explorationRate: this._explorationRate,
      contexts,
      entries,
      qTable: this._qTable,
    };
  }

  /**
   * Set exploration rate.
   */
  setExplorationRate(rate) {
    this._explorationRate = Math.max(0, Math.min(1, rate));
    this._persist();
  }
}

const rlRouter = new RLRouter();
export default rlRouter;
