import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader';

const DEFAULT_CONFIG = {
  enabled: true,
  checkpointIntervalMs: 120000,
  maxSilenceMs: 300000,
  scopeKeywords: true,
  divergenceThreshold: 0.6,
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

const DRIFT_TYPES = {
  SILENCE: 'silence',
  SCOPE_VIOLATION: 'scope_violation',
  REGRESSION: 'regression',
  LOOP_DETECTED: 'loop_detected',
  CHECKPOINT_MISSED: 'checkpoint_missed',
} as const;

interface TaskCheckpoint {
  lastProgress: number;
  lastActivityAt: number;
  startedAt: number;
  checkpoints: Array<{ ts: number; progress: number; status: string; passed: number; failed: number }>;
  model: string | null;
}

interface LoopState {
  hashes: Set<string>;
  repeatCount: number;
}

interface DriftEvent {
  id: string;
  ts: number;
  taskId: string;
  type: string;
  [key: string]: any;
}

interface DriftResult {
  drifting: boolean;
  type: string;
  [key: string]: any;
}

class DriftDetector {
  private _taskCheckpoints: Map<string, TaskCheckpoint> = new Map();
  private _driftEvents: DriftEvent[] = [];
  private _loopDetector: Map<string, LoopState> = new Map();

  recordCheckpoint(taskId: string, result: Record<string, any>): void {
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

  checkForLoops(taskId: string, recentOutput: string[]): DriftResult | null {
    const config = loadDriftConfig();
    if (!config.enabled) return null;

    if (!recentOutput || recentOutput.length < 10) return null;

    const chunks: string[] = [];
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
    const detector = this._loopDetector.get(taskId)!;

    let repeats = 0;
    for (const hash of chunks) {
      if (detector.hashes.has(hash)) {
        repeats++;
      }
      detector.hashes.add(hash);
    }

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
        detector.repeatCount = 0;
        return { drifting: true, type: DRIFT_TYPES.LOOP_DETECTED, repeatRatio };
      }
    } else {
      detector.repeatCount = Math.max(0, detector.repeatCount - 1);
    }

    return null;
  }

  evaluateAll(activeTaskIds: string[]): DriftEvent[] {
    const config = loadDriftConfig();
    if (!config.enabled) return [];

    const now = Date.now();
    const driftAlerts: DriftEvent[] = [];

    for (const taskId of activeTaskIds) {
      const cp = this._taskCheckpoints.get(taskId);
      if (!cp) continue;

      const silenceDuration = now - cp.lastActivityAt;

      if (silenceDuration > config.maxSilenceMs) {
        const evt = this._addDriftEvent(taskId, DRIFT_TYPES.SILENCE, {
          silenceMs: silenceDuration,
          lastActivity: new Date(cp.lastActivityAt).toISOString(),
          message: `No activity for ${Math.round(silenceDuration / 60000)}min`,
        });
        if (evt) driftAlerts.push(evt);
      }

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

  checkScope(
    taskId: string,
    taskMeta: { scopeKeywords?: string[]; otherTaskIds?: string[] } | null,
    recentOutput: string | string[] | null
  ): DriftResult | null {
    const config = loadDriftConfig();
    if (!config.enabled || !config.scopeKeywords) return null;

    if (!taskMeta?.scopeKeywords || !recentOutput) return null;

    const outputText = Array.isArray(recentOutput) ? recentOutput.join(' ') : recentOutput;
    const outOfScope: string[] = [];

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

  clearTask(taskId: string): void {
    this._taskCheckpoints.delete(taskId);
    this._loopDetector.delete(taskId);
  }

  getStatus() {
    const config = loadDriftConfig();
    const activeTracking: Record<string, any>[] = [];
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

  private _addDriftEvent(taskId: string, type: string, data: Record<string, any>): DriftEvent | null {
    const recent = this._driftEvents.find(e =>
      e.taskId === taskId && e.type === type && Date.now() - e.ts < 60000
    );
    if (recent) return null;

    const event: DriftEvent = {
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

  private _simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

const driftDetector = new DriftDetector();
export default driftDetector;
export { DRIFT_TYPES };
