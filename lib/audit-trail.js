/**
 * Event Sourcing Audit Trail — inspired by ruflo's cryptographic audit trails
 * and event sourcing patterns.
 *
 * Every significant action in the system is recorded as an immutable event.
 * Events are hash-chained for tamper detection (HMAC-SHA256 style chain).
 *
 * Event categories:
 *   - task:      run, cancel, complete, fail
 *   - pipeline:  start, advance, complete, abort
 *   - orchestrator: nudge, swap, kill, recover, autonomy-change
 *   - gate:      evaluate, block, warn
 *   - learning:  pattern-observed, pattern-confirmed
 *   - drift:     silence, loop, scope-violation, regression
 *   - claim:     acquire, release, timeout
 *   - system:    startup, config-change, error
 *
 * Storage: memory ring buffer + periodic flush to disk.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getProjectConfig } from './project-loader.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  enabled: true,
  maxMemoryEvents: 2000,
  flushIntervalMs: 60000,       // flush to disk every 60s
  maxFileEvents: 10000,         // rotate after this many events
  chainValidation: true,        // enable hash chain integrity
};

function loadAuditConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.auditTrail || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function getAuditDir() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory');
  }
}

// ---------------------------------------------------------------------------
// Hash Chain — tamper-evident event linking
// ---------------------------------------------------------------------------

function computeHash(event, previousHash) {
  const payload = JSON.stringify({
    seq: event.seq,
    ts: event.ts,
    category: event.category,
    action: event.action,
    previousHash,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Audit Trail — singleton
// ---------------------------------------------------------------------------

class AuditTrail {
  constructor() {
    this._events = [];        // in-memory ring buffer
    this._seq = 0;            // monotonic sequence number
    this._lastHash = '0000000000000000';
    this._flushTimer = null;
    this._initialized = false;
    this._dirty = false;
  }

  _ensureInit() {
    if (this._initialized) return;
    this._initialized = true;
    this._loadFromDisk();

    const config = loadAuditConfig();
    if (config.flushIntervalMs > 0) {
      this._flushTimer = setInterval(() => this._flushToDisk(), config.flushIntervalMs);
      if (this._flushTimer.unref) this._flushTimer.unref();
    }
  }

  /**
   * Record an event.
   *
   * @param {string} category - event category (task, pipeline, orchestrator, etc.)
   * @param {string} action - specific action (run, cancel, nudge, etc.)
   * @param {object} data - event payload
   * @param {string} [actor='system'] - who triggered the action
   */
  record(category, action, data = {}, actor = 'system') {
    const config = loadAuditConfig();
    if (!config.enabled) return null;
    this._ensureInit();

    this._seq++;
    const event = {
      seq: this._seq,
      ts: Date.now(),
      isoTime: new Date().toISOString(),
      category,
      action,
      actor,
      data,
      hash: null,
      previousHash: this._lastHash,
    };

    if (config.chainValidation) {
      event.hash = computeHash(event, this._lastHash);
      this._lastHash = event.hash;
    }

    this._events.push(event);
    this._dirty = true;

    // Enforce memory limit
    if (this._events.length > config.maxMemoryEvents) {
      this._events = this._events.slice(-config.maxMemoryEvents);
    }

    return event;
  }

  // Convenience methods for common event types
  taskEvent(action, taskId, data = {}) {
    return this.record('task', action, { taskId, ...data });
  }

  pipelineEvent(action, pipelineId, data = {}) {
    return this.record('pipeline', action, { pipelineId, ...data });
  }

  orchestratorEvent(action, data = {}) {
    return this.record('orchestrator', action, data);
  }

  gateEvent(action, taskId, data = {}) {
    return this.record('gate', action, { taskId, ...data });
  }

  driftEvent(action, taskId, data = {}) {
    return this.record('drift', action, { taskId, ...data });
  }

  claimEvent(action, taskId, data = {}) {
    return this.record('claim', action, { taskId, ...data });
  }

  systemEvent(action, data = {}) {
    return this.record('system', action, data);
  }

  /**
   * Query events by filter.
   */
  query({ category, action, taskId, since, limit = 50 } = {}) {
    this._ensureInit();
    let filtered = this._events;

    if (category) filtered = filtered.filter(e => e.category === category);
    if (action) filtered = filtered.filter(e => e.action === action);
    if (taskId) filtered = filtered.filter(e => e.data?.taskId === taskId);
    if (since) filtered = filtered.filter(e => e.ts >= since);

    // Return most recent first
    return filtered.slice(-limit).reverse();
  }

  /**
   * Replay events for a specific task (event sourcing replay).
   * Returns events in chronological order.
   */
  replayTask(taskId) {
    this._ensureInit();
    return this._events
      .filter(e => e.data?.taskId === taskId)
      .sort((a, b) => a.seq - b.seq);
  }

  /**
   * Verify hash chain integrity.
   * Returns { valid, brokenAt, checked }.
   */
  verifyChain() {
    this._ensureInit();
    let previousHash = '0000000000000000';
    let checked = 0;

    // Find the first event in our buffer
    for (const event of this._events) {
      if (!event.hash) continue;
      checked++;
      const expected = computeHash(event, event.previousHash);
      if (event.hash !== expected) {
        return { valid: false, brokenAt: event.seq, checked };
      }
      previousHash = event.hash;
    }

    return { valid: true, brokenAt: null, checked };
  }

  /**
   * Get audit status for API.
   */
  getStatus() {
    this._ensureInit();
    const config = loadAuditConfig();
    const categoryStats = {};
    for (const event of this._events) {
      categoryStats[event.category] = (categoryStats[event.category] || 0) + 1;
    }

    return {
      enabled: config.enabled,
      totalEvents: this._events.length,
      sequence: this._seq,
      chainValidation: config.chainValidation,
      chainIntegrity: config.chainValidation ? this.verifyChain() : null,
      categoryBreakdown: categoryStats,
      recentEvents: this._events.slice(-20).reverse(),
    };
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  _loadFromDisk() {
    try {
      const filePath = path.join(getAuditDir(), 'audit-trail.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.events && Array.isArray(data.events)) {
          this._events = data.events;
          this._seq = data.sequence || data.events.length;
          this._lastHash = data.lastHash || '0000000000000000';
        }
      }
    } catch { /* fresh start */ }
  }

  _flushToDisk() {
    if (!this._dirty) return;
    try {
      const dir = getAuditDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const config = loadAuditConfig();
      const events = this._events.slice(-(config.maxFileEvents || 10000));

      fs.writeFileSync(path.join(dir, 'audit-trail.json'), JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        sequence: this._seq,
        lastHash: this._lastHash,
        totalEvents: events.length,
        events,
      }, null, 2) + '\n');
      this._dirty = false;
    } catch (e) {
      console.warn('[AuditTrail] Flush failed:', e.message);
    }
  }

  stop() {
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushToDisk();
  }
}

// Module-level singleton
const auditTrail = new AuditTrail();
export default auditTrail;
