import { getProjectConfig } from './project-loader';
import { registry } from './service-registry';

const DEFAULT_CONFIG = {
  enabled: true,
  defaultTtlMs: 1800000,
  maxClaims: 100,
  allowForceClaim: true,
};

function loadClaimsConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.taskClaims || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

interface ClaimEntry {
  taskId: string;
  owner: string;
  claimedAt: number;
  expiresAt: number;
  metadata: Record<string, any>;
  renewedAt?: number;
  handoffAt?: number;
}

interface ClaimHistoryEntry {
  ts: number;
  action: string;
  taskId: string;
  owner: string;
  [key: string]: any;
}

class TaskClaimsManager {
  private _claims: Map<string, ClaimEntry> = new Map();
  private _history: ClaimHistoryEntry[] = [];

  claim(
    taskId: string,
    owner: string,
    { ttlMs, force = false, metadata = {} }: { ttlMs?: number; force?: boolean; metadata?: Record<string, any> } = {}
  ): Record<string, any> {
    const config = loadClaimsConfig();
    if (!config.enabled) return { ok: true, claim: { taskId, owner, bypassed: true } };

    const now = Date.now();
    this._cleanExpired();

    const existing = this._claims.get(taskId);

    if (existing) {
      if (existing.owner === owner) {
        existing.expiresAt = now + (ttlMs || config.defaultTtlMs);
        existing.renewedAt = now;
        this._addHistory('renewed', taskId, owner);
        return { ok: true, claim: { ...existing } };
      }

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
        this._addHistory('force-released', taskId, existing.owner, { forcedBy: owner });
      }
    }

    const claim: ClaimEntry = {
      taskId,
      owner,
      claimedAt: now,
      expiresAt: now + (ttlMs || config.defaultTtlMs),
      metadata,
    };

    this._claims.set(taskId, claim);
    this._addHistory('claimed', taskId, owner, metadata);

    if (this._claims.size > config.maxClaims) {
      this._evictOldest();
    }

    return { ok: true, claim: { ...claim } };
  }

  release(taskId: string, owner: string): Record<string, any> {
    const existing = this._claims.get(taskId);
    if (!existing) return { ok: true, message: 'No claim to release' };

    if (existing.owner !== owner) {
      return { ok: false, error: `Claim owned by ${existing.owner}, not ${owner}` };
    }

    this._claims.delete(taskId);
    this._addHistory('released', taskId, owner);
    return { ok: true };
  }

  handoff(taskId: string, fromOwner: string, toOwner: string, metadata: Record<string, any> = {}): Record<string, any> {
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

  isClaimedBy(taskId: string): string | null {
    this._cleanExpired();
    const claim = this._claims.get(taskId);
    return claim ? claim.owner : null;
  }

  getClaim(taskId: string): Record<string, any> | null {
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

  getAllClaims(): Record<string, any>[] {
    this._cleanExpired();
    const claims: Record<string, any>[] = [];
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

  private _cleanExpired(): void {
    const now = Date.now();
    for (const [taskId, claim] of this._claims) {
      if (claim.expiresAt <= now) {
        this._claims.delete(taskId);
        this._addHistory('expired', taskId, claim.owner);
      }
    }
  }

  private _evictOldest(): void {
    let oldestKey: string | null = null;
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

  private _addHistory(action: string, taskId: string, owner: string, metadata: Record<string, any> = {}): void {
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

const taskClaims = new TaskClaimsManager();

registry.register('taskClaims', () => taskClaims);

export default taskClaims;
