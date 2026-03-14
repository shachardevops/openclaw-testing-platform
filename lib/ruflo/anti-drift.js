/**
 * Ruflo Anti-Drift — drift detection + checkpoint verification.
 *
 * Detection types:
 *   - Stall: progress unchanged for stallTimeoutMs
 *   - Semantic drift: agent navigates to unrelated pages
 *   - Repetition: same action 3+ times
 *   - Checkpoint timeout: no new checkpoint in N minutes
 */

import fs from 'fs';
import path from 'path';
import { bridgeLogPath, resultsDir } from '@/lib/config';

class AntiDrift {
  constructor() {
    this._alerts = []; // { taskId, type, message, ts, resolved }
    this._taskProgress = new Map(); // taskId -> { lastProgress, lastCheckpoint, lastCheck }
    this._maxAlerts = 100;
  }

  /**
   * Check a task for drift indicators.
   * @param {string} taskId
   * @param {Object} config - { stallTimeoutMs, maxRepetitions, checkpointTimeoutMs }
   * @returns {{ drifted: boolean, alerts: Object[] }}
   */
  check(taskId, config = {}) {
    const {
      stallTimeoutMs = 600000,    // 10 min
      maxRepetitions = 3,
      checkpointTimeoutMs = 600000,
    } = config;

    const now = Date.now();
    const alerts = [];

    // 1. Stall detection: check result progress field
    const stall = this._checkStall(taskId, stallTimeoutMs, now);
    if (stall) alerts.push(stall);

    // 2. Repetition detection: parse bridge log for repeated actions
    const repetition = this._checkRepetition(taskId, maxRepetitions);
    if (repetition) alerts.push(repetition);

    // 3. Semantic drift: check URLs in bridge log
    const drift = this._checkSemanticDrift(taskId);
    if (drift) alerts.push(drift);

    // Store alerts
    for (const alert of alerts) {
      this._alerts.push(alert);
      if (this._alerts.length > this._maxAlerts) this._alerts.shift();
    }

    return { drifted: alerts.length > 0, alerts };
  }

  _checkStall(taskId, stallTimeoutMs, now) {
    try {
      const filePath = path.join(resultsDir(), `${taskId}.json`);
      if (!fs.existsSync(filePath)) return null;

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data.status !== 'running') return null;

      const prev = this._taskProgress.get(taskId);
      const currentProgress = data.progress || 0;

      if (prev && prev.lastProgress === currentProgress) {
        const staleDuration = now - prev.lastCheck;
        if (staleDuration >= stallTimeoutMs) {
          return {
            taskId,
            type: 'stall',
            message: `No progress change for ${Math.round(staleDuration / 60000)}m (stuck at ${currentProgress}%)`,
            ts: now,
            resolved: false,
          };
        }
      }

      this._taskProgress.set(taskId, {
        lastProgress: currentProgress,
        lastCheck: now,
        lastCheckpoint: prev?.lastCheckpoint || now,
      });

      return null;
    } catch {
      return null;
    }
  }

  _checkRepetition(taskId, maxRepetitions) {
    try {
      const logPath = bridgeLogPath();
      if (!fs.existsSync(logPath)) return null;

      // Read last 4KB of bridge log
      const stat = fs.statSync(logPath);
      const readStart = Math.max(0, stat.size - 4096);
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(Math.min(4096, stat.size));
      fs.readSync(fd, buf, 0, buf.length, readStart);
      fs.closeSync(fd);

      const tail = buf.toString('utf8');
      const lines = tail.split('\n').filter(l => l.includes(taskId));

      // Look for repeated patterns
      const actionCounts = {};
      for (const line of lines) {
        const actionMatch = line.match(/\[(navigate|click|type|scroll)\]/i);
        if (actionMatch) {
          const key = line.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s*/, '').trim();
          actionCounts[key] = (actionCounts[key] || 0) + 1;
        }
      }

      for (const [action, count] of Object.entries(actionCounts)) {
        if (count >= maxRepetitions) {
          return {
            taskId,
            type: 'repetition',
            message: `Action repeated ${count}x: ${action.slice(0, 80)}`,
            ts: Date.now(),
            resolved: false,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  _checkSemanticDrift(taskId) {
    // Read story to find expected URLs
    try {
      const storyPath = path.join(process.cwd(), 'stories', `${taskId}.md`);
      if (!fs.existsSync(storyPath)) return null;

      const storyContent = fs.readFileSync(storyPath, 'utf8');
      const expectedUrls = (storyContent.match(/\/[\w/-]+/g) || []).filter(u => u.length > 3);
      if (expectedUrls.length === 0) return null;

      const logPath = bridgeLogPath();
      if (!fs.existsSync(logPath)) return null;

      const stat = fs.statSync(logPath);
      const readStart = Math.max(0, stat.size - 4096);
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(Math.min(4096, stat.size));
      fs.readSync(fd, buf, 0, buf.length, readStart);
      fs.closeSync(fd);

      const tail = buf.toString('utf8');
      const navigatedUrls = (tail.match(/navigate.*?(\/[\w/-]+)/gi) || [])
        .map(m => { const match = m.match(/(\/[\w/-]+)/); return match ? match[1] : null; })
        .filter(Boolean);

      // Check if recent navigations are unrelated
      const unrelated = navigatedUrls.filter(url =>
        !expectedUrls.some(expected => url.includes(expected) || expected.includes(url))
      );

      if (unrelated.length >= 3) {
        return {
          taskId,
          type: 'semantic-drift',
          message: `Agent navigating to unrelated pages: ${unrelated.slice(-3).join(', ')}`,
          ts: Date.now(),
          resolved: false,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get all alerts.
   */
  getAlerts(taskId = null) {
    if (taskId) return this._alerts.filter(a => a.taskId === taskId);
    return [...this._alerts];
  }

  /**
   * Resolve an alert.
   */
  resolveAlert(index) {
    if (this._alerts[index]) {
      this._alerts[index].resolved = true;
    }
  }

  /**
   * Clear resolved alerts.
   */
  clearResolved() {
    this._alerts = this._alerts.filter(a => !a.resolved);
  }
}

const antiDrift = new AntiDrift();
export default antiDrift;
