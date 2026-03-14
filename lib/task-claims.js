/**
 * Task Claims System — inspired by ruflo's claims/ownership mechanism.
 *
 * Prevents duplicate work by managing exclusive task ownership:
 *   - claim(taskId, owner): acquire exclusive lock on a task
 *   - release(taskId, owner): release lock
 *   - handoff(taskId, fromOwner, toOwner): transfer ownership
 *   - isClaimedBy(taskId): check current owner
 *
 * Claims auto-expire after a configurable TTL to prevent deadlocks
 * when an agent crashes without releasing its claim.
 *
 * Used by:
 *   - Pipeline runner (before starting a task)
 *   - Orchestrator (before respawning)
 *   - Manual task runs (before dispatching)
 */

import { getProjectConfig } from './project-loader.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  enabled: true,
  defaultTtlMs: 1800000,       // 30 min claim lifetime
  maxClaims: 100,
  allowForceClaim: true,        // allow override with force flag
};

function loadClaimsConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.taskClaims || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---------------------------------------------------------------------------
// Claims Manager — singleton
// ---------------------------------------------------------------------------

class TaskClaimsManager {
  constructor() {
    this._claims = new Map();    // taskId -> { owner, claimedAt, expiresAt, metadata }
    this._history = [];          // ring buffer of claim events
  }

  /**
   * Acquire a claim on a task.
   * Returns { ok, claim } on success, { ok: false, error, currentOwner } on conflict.
   */
  claim(taskId, owner, { ttlMs, force = false, metadata = {} } = {}) {
    const config = loadClaimsConfig();
    if (!config.enabled) return { ok: true, claim: { taskId, owner, bypassed: true } };

    const now = Date.now();

    // Clean expired claims first
    this._cleanExpired();

    const existing = this._claims.get(taskId);

    if (existing) {
      // Same owner reclaiming — extend
      if (existing.owner === owner) {
        existing.expiresAt = now + (ttlMs || config.defaultTtlMs);
        existing.renewedAt = now;
        this._addHistory('renewed', taskId, owner);
        return { ok: true, claim: { ...existing } };
      }

      // Different owner — conflict
      if (!force && !config.allowForceClaim) {
        return {
          ok: false,
          error: `Task ${taskId} is claimed by ${existing.owner}`,
          currentOwner: existing.owner,
          claimedAt: new Date(existing.claimedAt).toISOString(),
          expiresAt: new Date(existing.expiresAt).toISOString(),
        };
      }

      if (force) {
        // Force claim — evict previous owner
        this._addHistory('force-released', taskId, existing.owner, { forcedBy: owner });
      }
    }

    const claim = {
      taskId,
      owner,
      claimedAt: now,
      expiresAt: now + (ttlMs || config.defaultTtlMs),
      metadata,
    };

    this._claims.set(taskId, claim);
    this._addHistory('claimed', taskId, owner, metadata);

    // Enforce max claims
    if (this._claims.size > config.maxClaims) {
      this._evictOldest();
    }

    return { ok: true, claim: { ...claim } };
  }

  /**
   * Release a claim.
   */
  release(taskId, owner) {
    const existing = this._claims.get(taskId);
    if (!existing) return { ok: true, message: 'No claim to release' };

    if (existing.owner !== owner) {
      return { ok: false, error: `Claim owned by ${existing.owner}, not ${owner}` };
    }

    this._claims.delete(taskId);
    this._addHistory('released', taskId, owner);
    return { ok: true };
  }

  /**
   * Transfer ownership from one agent to another.
   */
  handoff(taskId, fromOwner, toOwner, metadata = {}) {
    const existing = this._claims.get(taskId);
    if (!existing) {
      return { ok: false, error: `No claim on task ${taskId}` };
    }

    if (existing.owner !== fromOwner) {
      return { ok: false, error: `Claim owned by ${existing.owner}, not ${fromOwner}` };
    }

    existing.owner = toOwner;
    existing.handoffAt = Date.now();
    existing.metadata = { ...existing.metadata, ...metadata, handoffFrom: fromOwner };

    this._addHistory('handoff', taskId, toOwner, { from: fromOwner });
    return { ok: true, claim: { ...existing } };
  }

  /**
   * Check if a task is currently claimed.
   */
  isClaimedBy(taskId) {
    this._cleanExpired();
    const claim = this._claims.get(taskId);
    return claim ? claim.owner : null;
  }

  /**
   * Get claim details for a task.
   */
  getClaim(taskId) {
    this._cleanExpired();
    const claim = this._claims.get(taskId);
    if (!claim) return null;
    return {
      ...claim,
      claimedAt: new Date(claim.claimedAt).toISOString(),
      expiresAt: new Date(claim.expiresAt).toISOString(),
      remainingMs: claim.expiresAt - Date.now(),
    };
  }

  /**
   * Get all active claims.
   */
  getAllClaims() {
    this._cleanExpired();
    const claims = [];
    for (const [taskId, claim] of this._claims) {
      claims.push({
        taskId,
        owner: claim.owner,
        claimedAt: new Date(claim.claimedAt).toISOString(),
        expiresAt: new Date(claim.expiresAt).toISOString(),
        remainingMs: claim.expiresAt - Date.now(),
      });
    }
    return claims;
  }

  /**
   * Get full status for API.
   */
  getStatus() {
    const config = loadClaimsConfig();
    this._cleanExpired();
    return {
      enabled: config.enabled,
      activeClaims: this.getAllClaims(),
      totalActive: this._claims.size,
      recentHistory: this._history.slice(0, 30),
      config: {
        defaultTtlMs: config.defaultTtlMs,
        allowForceClaim: config.allowForceClaim,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  _cleanExpired() {
    const now = Date.now();
    for (const [taskId, claim] of this._claims) {
      if (claim.expiresAt <= now) {
        this._claims.delete(taskId);
        this._addHistory('expired', taskId, claim.owner);
      }
    }
  }

  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [taskId, claim] of this._claims) {
      if (claim.claimedAt < oldestTime) {
        oldestTime = claim.claimedAt;
        oldestKey = taskId;
      }
    }
    if (oldestKey) {
      const evicted = this._claims.get(oldestKey);
      this._claims.delete(oldestKey);
      this._addHistory('evicted', oldestKey, evicted?.owner || 'unknown');
    }
  }

  _addHistory(action, taskId, owner, metadata = {}) {
    this._history.unshift({
      ts: Date.now(),
      action,
      taskId,
      owner,
      ...metadata,
    });
    if (this._history.length > 200) this._history.length = 200;
  }
}

// Module-level singleton
const taskClaims = new TaskClaimsManager();
export default taskClaims;
