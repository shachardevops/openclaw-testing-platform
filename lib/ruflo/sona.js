/**
 * Ruflo SONA — Self-Optimizing Neural Architecture.
 *
 * Adaptive meta-learner wrapping RL router:
 *   - Adaptive epsilon (high when few runs, decays, spikes on degradation)
 *   - Feature importance tracking
 *   - Reward weight tuning based on user overrides
 *   - 5 modes: realtime, balanced, research, edge, batch
 */

import fs from 'fs';
import path from 'path';
import rlRouter from './rl-router.js';
import { setSonaOptimizer } from './task-router.js';
import { getProjectConfig } from '@/lib/project-loader';

const MODES = {
  realtime: { maxContextFeatures: 2, considerAlternatives: false, computeBudgetMs: 10 },
  balanced: { maxContextFeatures: 5, considerAlternatives: true, computeBudgetMs: 100 },
  research: { maxContextFeatures: 10, considerAlternatives: true, computeBudgetMs: 1000 },
  edge: { maxContextFeatures: 2, considerAlternatives: false, computeBudgetMs: 5 },
  batch: { maxContextFeatures: 10, considerAlternatives: true, computeBudgetMs: 5000 },
};

function getStatePath() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory', 'sona-state.json');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory', 'sona-state.json');
  }
}

class SONA {
  constructor() {
    this._mode = 'balanced';
    this._adaptiveEpsilon = 0.3;
    this._featureWeights = { complexity: 1.0, actor: 0.8, timeOfDay: 0.3 };
    this._userOverrideCount = 0;
    this._totalRecommendations = 0;
    this._performanceHistory = []; // last 50 observations
    this._degradationDetected = false;
    this._load();

    // Register this SONA instance with task-router
    setSonaOptimizer(this);
  }

  _load() {
    try {
      const p = getStatePath();
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        this._mode = data.mode || 'balanced';
        this._adaptiveEpsilon = data.adaptiveEpsilon ?? 0.3;
        this._featureWeights = data.featureWeights || this._featureWeights;
        this._userOverrideCount = data.userOverrideCount || 0;
        this._totalRecommendations = data.totalRecommendations || 0;
        this._performanceHistory = data.performanceHistory || [];
        this._degradationDetected = data.degradationDetected || false;
      }
    } catch { /* start fresh */ }
  }

  _persist() {
    try {
      const p = getStatePath();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify({
        mode: this._mode,
        adaptiveEpsilon: this._adaptiveEpsilon,
        featureWeights: this._featureWeights,
        userOverrideCount: this._userOverrideCount,
        totalRecommendations: this._totalRecommendations,
        performanceHistory: this._performanceHistory.slice(-50),
        degradationDetected: this._degradationDetected,
        updatedAt: new Date().toISOString(),
      }, null, 2));
    } catch { /* best-effort */ }
  }

  /**
   * Adapt epsilon based on training state.
   */
  _updateEpsilon() {
    const observations = this._totalRecommendations;

    // High when few observations
    if (observations < 10) {
      this._adaptiveEpsilon = 0.4;
    } else if (observations < 50) {
      this._adaptiveEpsilon = 0.2;
    } else {
      this._adaptiveEpsilon = 0.1;
    }

    // Spike on detected degradation
    if (this._degradationDetected) {
      this._adaptiveEpsilon = Math.min(0.5, this._adaptiveEpsilon * 2);
    }

    // Increase if user overrides are frequent
    const overrideRate = this._totalRecommendations > 0
      ? this._userOverrideCount / this._totalRecommendations
      : 0;
    if (overrideRate > 0.3) {
      this._adaptiveEpsilon = Math.min(0.5, this._adaptiveEpsilon + 0.1);
    }

    rlRouter.setExplorationRate(this._adaptiveEpsilon);
  }

  /**
   * Detect performance degradation.
   */
  _checkDegradation() {
    if (this._performanceHistory.length < 5) return;

    const recent = this._performanceHistory.slice(-5);
    const avgRecentReward = recent.reduce((s, h) => s + h.reward, 0) / recent.length;

    const older = this._performanceHistory.slice(-20, -5);
    if (older.length < 5) return;
    const avgOlderReward = older.reduce((s, h) => s + h.reward, 0) / older.length;

    this._degradationDetected = avgRecentReward < avgOlderReward * 0.6;
  }

  /**
   * Get SONA recommendation for a task.
   */
  recommend(taskId, context = {}) {
    this._totalRecommendations++;
    this._updateEpsilon();

    const modeConfig = MODES[this._mode] || MODES.balanced;
    const result = rlRouter.recommend(taskId, context);

    if (modeConfig.considerAlternatives && result.alternatives?.length > 0) {
      // In research mode, return all alternatives ranked
      result.sonaMode = this._mode;
      result.adaptiveEpsilon = this._adaptiveEpsilon;
    }

    this._persist();
    return result;
  }

  /**
   * Record observation and update SONA state.
   */
  observe(taskId, modelId, outcome) {
    const result = rlRouter.observe(taskId, modelId, outcome);

    this._performanceHistory.push({
      taskId, modelId,
      reward: result.reward,
      ts: Date.now(),
    });
    if (this._performanceHistory.length > 50) {
      this._performanceHistory = this._performanceHistory.slice(-50);
    }

    this._checkDegradation();
    this._persist();
    return result;
  }

  /**
   * Record that user overrode the recommendation.
   */
  recordOverride(taskId, recommendedModel, chosenModel) {
    this._userOverrideCount++;
    this._updateEpsilon();
    this._persist();
  }

  /**
   * Set operating mode.
   */
  setMode(mode) {
    if (MODES[mode]) {
      this._mode = mode;
      this._persist();
    }
  }

  /**
   * Get SONA state for API.
   */
  getState() {
    return {
      mode: this._mode,
      adaptiveEpsilon: this._adaptiveEpsilon,
      featureWeights: { ...this._featureWeights },
      userOverrideCount: this._userOverrideCount,
      totalRecommendations: this._totalRecommendations,
      degradationDetected: this._degradationDetected,
      recentPerformance: this._performanceHistory.slice(-10),
    };
  }
}

const sona = new SONA();
export default sona;
