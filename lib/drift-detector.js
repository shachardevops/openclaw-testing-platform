/**
 * Anti-Drift Detection Engine — inspired by ruflo's anti-drift safeguards.
 *
 * Prevents multi-agent goal drift by:
 *   1. Checkpoint verification — agents must report progress at expected intervals
 *   2. Output validation — checks agent outputs against expected task boundaries
 *   3. Divergence scoring — detects when an agent strays from its assigned scope
 *   4. Hierarchical review — escalates suspicious drift to the orchestrator
 *
 * Integration:
 *   - Called by the orchestrator engine during tick evaluations
 *   - Uses bridge log analysis to detect topic drift
 *   - Compares actual vs expected task outputs
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  enabled: true,
  checkpointIntervalMs: 120000,    // expect progress every 2 min
  maxSilenceMs: 300000,            // 5 min silence = potential drift
  scopeKeywords: true,             // enable keyword-based scope checking
  divergenceThreshold: 0.6,        // 0-1, above this = flagged
  maxDriftEvents: 200,
};

function loadDriftConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.driftDetection || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---------------------------------------------------------------------------
// Drift Event Types
// ---------------------------------------------------------------------------

const DRIFT_TYPES = {
  SILENCE: 'silence',              // no output for extended period
  SCOPE_VIOLATION: 'scope_violation',  // working outside assigned task
  REGRESSION: 'regression',        // progress decreased
  LOOP_DETECTED: 'loop_detected',  // repeating same actions
  CHECKPOINT_MISSED: 'checkpoint_missed',
};

// ---------------------------------------------------------------------------
// Drift Detector — singleton
// ---------------------------------------------------------------------------

class DriftDetector {
  constructor() {
    this._taskCheckpoints = new Map();  // taskId -> { lastProgress, lastActivityAt, checkpoints[] }
    this._driftEvents = [];             // ring buffer of detected drift events
    this._loopDetector = new Map();     // taskId -> { recentOutputHashes: Set }
  }

  /**
   * Record a checkpoint for a task (called when results are updated).
   */
  recordCheckpoint(taskId, result) {
    const config = loadDriftConfig();
    if (!config.enabled) return;

    const now = Date.now();
    const existing = this._taskCheckpoints.get(taskId) || {
      lastProgress: 0,
      lastActivityAt: now,
      startedAt: now,
      checkpoints: [],
      model: null,
    };

    const progress = result.progress || 0;
    const checkpoint = {
      ts: now,
      progress,
      status: result.status,
      passed: result.passed || 0,
      failed: result.failed || 0,
    };

    // Detect regression (progress went backwards)
    if (progress < existing.lastProgress && existing.lastProgress > 0) {
      this._addDriftEvent(taskId, DRIFT_TYPES.REGRESSION, {
        previousProgress: existing.lastProgress,
        currentProgress: progress,
        message: `Progress regressed from ${existing.lastProgress}% to ${progress}%`,
      });
    }

    existing.lastProgress = progress;
    existing.lastActivityAt = now;
    existing.model = result.model || existing.model;
    existing.checkpoints.push(checkpoint);
    if (existing.checkpoints.length > 50) existing.checkpoints = existing.checkpoints.slice(-50);

    this._taskCheckpoints.set(taskId, existing);
  }

  /**
   * Check for output loops — agent repeating same actions.
   * Pass recent bridge log lines for the task.
   */
  checkForLoops(taskId, recentOutput) {
    const config = loadDriftConfig();
    if (!config.enabled) return null;

    if (!recentOutput || recentOutput.length < 10) return null;

    // Simple loop detection: hash recent chunks and look for repeats
    const chunks = [];
    const chunkSize = 5;
    for (let i = 0; i <= recentOutput.length - chunkSize; i += chunkSize) {
      const chunk = recentOutput.slice(i, i + chunkSize).join('').trim();
      if (chunk.length > 20) {
        chunks.push(this._simpleHash(chunk));
      }
    }

    if (!this._loopDetector.has(taskId)) {
      this._loopDetector.set(taskId, { hashes: new Set(), repeatCount: 0 });
    }
    const detector = this._loopDetector.get(taskId);

    let repeats = 0;
    for (const hash of chunks) {
      if (detector.hashes.has(hash)) {
        repeats++;
      }
      detector.hashes.add(hash);
    }

    // Keep hash set bounded
    if (detector.hashes.size > 500) {
      const arr = [...detector.hashes];
      detector.hashes = new Set(arr.slice(-250));
    }

    const repeatRatio = chunks.length > 0 ? repeats / chunks.length : 0;
    if (repeatRatio > config.divergenceThreshold) {
      detector.repeatCount++;
      if (detector.repeatCount >= 2) {
        this._addDriftEvent(taskId, DRIFT_TYPES.LOOP_DETECTED, {
          repeatRatio: Math.round(repeatRatio * 100),
          message: `Agent appears to be looping — ${Math.round(repeatRatio * 100)}% output repetition`,
        });
        detector.repeatCount = 0; // reset after flagging
        return { drifting: true, type: DRIFT_TYPES.LOOP_DETECTED, repeatRatio };
      }
    } else {
      detector.repeatCount = Math.max(0, detector.repeatCount - 1);
    }

    return null;
  }

  /**
   * Evaluate all active tasks for checkpoint misses and silence.
   * Called periodically by the orchestrator tick.
   */
  evaluateAll(activeTaskIds) {
    const config = loadDriftConfig();
    if (!config.enabled) return [];

    const now = Date.now();
    const driftAlerts = [];

    for (const taskId of activeTaskIds) {
      const cp = this._taskCheckpoints.get(taskId);
      if (!cp) continue;

      const silenceDuration = now - cp.lastActivityAt;

      // Silence detection
      if (silenceDuration > config.maxSilenceMs) {
        const evt = this._addDriftEvent(taskId, DRIFT_TYPES.SILENCE, {
          silenceMs: silenceDuration,
          lastActivity: new Date(cp.lastActivityAt).toISOString(),
          message: `No activity for ${Math.round(silenceDuration / 60000)}min`,
        });
        if (evt) driftAlerts.push(evt);
      }

      // Checkpoint interval check
      if (silenceDuration > config.checkpointIntervalMs && cp.lastProgress < 100) {
        const lastCheckpoint = cp.checkpoints[cp.checkpoints.length - 1];
        if (lastCheckpoint) {
          const timeSinceCheckpoint = now - lastCheckpoint.ts;
          if (timeSinceCheckpoint > config.checkpointIntervalMs * 2) {
            const evt = this._addDriftEvent(taskId, DRIFT_TYPES.CHECKPOINT_MISSED, {
              expectedIntervalMs: config.checkpointIntervalMs,
              actualGapMs: timeSinceCheckpoint,
              message: `Checkpoint missed — ${Math.round(timeSinceCheckpoint / 60000)}min since last`,
            });
            if (evt) driftAlerts.push(evt);
          }
        }
      }
    }

    return driftAlerts;
  }

  /**
   * Check if a task's output mentions topics outside its scope.
   * Takes task metadata (with expected scope keywords) and recent output.
   */
  checkScope(taskId, taskMeta, recentOutput) {
    const config = loadDriftConfig();
    if (!config.enabled || !config.scopeKeywords) return null;

    if (!taskMeta?.scopeKeywords || !recentOutput) return null;

    const outputText = Array.isArray(recentOutput) ? recentOutput.join(' ') : recentOutput;
    const outOfScope = [];

    // Check for mentions of other tasks' IDs (suggests agent confusion)
    if (taskMeta.otherTaskIds) {
      for (const otherId of taskMeta.otherTaskIds) {
        if (outputText.includes(otherId) && otherId !== taskId) {
          outOfScope.push(`References other task: ${otherId}`);
        }
      }
    }

    if (outOfScope.length > 0) {
      this._addDriftEvent(taskId, DRIFT_TYPES.SCOPE_VIOLATION, {
        violations: outOfScope,
        message: `Possible scope drift: ${outOfScope.join('; ')}`,
      });
      return { drifting: true, type: DRIFT_TYPES.SCOPE_VIOLATION, violations: outOfScope };
    }

    return null;
  }

  /**
   * Clear tracking for a completed/cancelled task.
   */
  clearTask(taskId) {
    this._taskCheckpoints.delete(taskId);
    this._loopDetector.delete(taskId);
  }

  /**
   * Get drift status for API.
   */
  getStatus() {
    const config = loadDriftConfig();
    const activeTracking = [];
    for (const [taskId, cp] of this._taskCheckpoints) {
      activeTracking.push({
        taskId,
        lastProgress: cp.lastProgress,
        lastActivityAt: new Date(cp.lastActivityAt).toISOString(),
        checkpointCount: cp.checkpoints.length,
        model: cp.model,
      });
    }

    return {
      enabled: config.enabled,
      config: {
        checkpointIntervalMs: config.checkpointIntervalMs,
        maxSilenceMs: config.maxSilenceMs,
        divergenceThreshold: config.divergenceThreshold,
      },
      activeTracking,
      recentDriftEvents: this._driftEvents.slice(0, 30),
      totalDriftEvents: this._driftEvents.length,
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  _addDriftEvent(taskId, type, data) {
    // Dedup: don't fire the same type for the same task within 60s
    const recent = this._driftEvents.find(e =>
      e.taskId === taskId && e.type === type && Date.now() - e.ts < 60000
    );
    if (recent) return null;

    const event = {
      id: `drift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      taskId,
      type,
      ...data,
    };

    this._driftEvents.unshift(event);
    const maxEvents = loadDriftConfig().maxDriftEvents || 200;
    if (this._driftEvents.length > maxEvents) this._driftEvents.length = maxEvents;

    return event;
  }

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
}

// Module-level singleton
const driftDetector = new DriftDetector();
export default driftDetector;
export { DRIFT_TYPES };
