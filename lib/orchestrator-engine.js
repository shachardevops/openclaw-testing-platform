/**
 * Orchestrator Engine — deterministic decision engine that replaces
 * the AI orchestrator bridge. Handles known patterns (stale, orphaned,
 * duplicate, stuck) deterministically, and consults AI only for
 * unrecognized patterns, storing recommendations in a persistent
 * decision memory file.
 */

import fs from 'fs';
import path from 'path';
import sessionManager from './session-manager.js';
import { getProjectConfig } from './project-loader.js';
import { bridgeLogPath, resultsDir } from './config.js';
import { sendChat as gatewaySendChat } from './openclaw-gateway.js';
import { getControllerSessionId, spawnAgent, listSessionsSync } from './openclaw.js';
import appHealth from './app-health.js';
import learningLoop from './learning-loop.js';

// ---------------------------------------------------------------------------
// Autonomy Levels — inspired by ruflo's tiered autonomy and AutoForge's
// graduated control. Controls which orchestrator actions are auto-executed
// vs. requiring human confirmation.
//
//   Level 0 (manual):     All actions require confirmation
//   Level 1 (supervised): Auto-nudge only, confirm swaps/kills
//   Level 2 (guided):     Auto-nudge + auto-swap, confirm kills
//   Level 3 (autonomous): Full auto (nudge/swap/kill/recover), AI consultation
//   Level 4 (adaptive):   Full auto + act on AI recommendations without review
// ---------------------------------------------------------------------------

export const AUTONOMY_LEVELS = {
  0: { name: 'manual',     autoNudge: false, autoSwap: false, autoKill: false, autoRecover: false, autoApproveAI: false },
  1: { name: 'supervised', autoNudge: true,  autoSwap: false, autoKill: false, autoRecover: false, autoApproveAI: false },
  2: { name: 'guided',     autoNudge: true,  autoSwap: true,  autoKill: false, autoRecover: false, autoApproveAI: false },
  3: { name: 'autonomous', autoNudge: true,  autoSwap: true,  autoKill: true,  autoRecover: true,  autoApproveAI: false },
  4: { name: 'adaptive',   autoNudge: true,  autoSwap: true,  autoKill: true,  autoRecover: true,  autoApproveAI: true  },
};

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

function loadEngineConfig() {
  try {
    const { project } = getProjectConfig();
    const orch = project.orchestrator || {};
    const esc = project.sessionManager?.escalation || {};
    return {
      enabled: orch.enabled ?? true,
      autonomyLevel: orch.autonomyLevel ?? 3,
      recoveryCooldownMs: orch.recoveryCooldownMs ?? 120000,
      taskStartGracePeriodMs: orch.taskStartGracePeriodMs ?? 300000,
      maxControllerMessagesPerMinute: orch.maxControllerMessagesPerMinute ?? 6,
      aiConsultationEnabled: orch.aiConsultationEnabled ?? true,
      decisionMemoryFile: orch.decisionMemoryFile ?? 'memory/decision-memory.json',
      workspace: project.workspace || process.cwd(),
      messageTemplates: project.messageTemplates || {},
      // Escalation thresholds (from session manager config)
      staleThresholdMs: esc.staleThresholdMs ?? 180000,
      swapThresholdMs: esc.swapThresholdMs ?? 480000,
      killThresholdMs: esc.killThresholdMs ?? 900000,
      orphanMaxAgeMs: project.sessionManager?.orphanMaxAgeMs ?? 1800000,
      recoveryTimeoutMs: orch.recoveryTimeoutMs ?? 180000,
      maxRecoveryAttempts: orch.maxRecoveryAttempts ?? 3,
    };
  } catch {
    return {
      enabled: true,
      autonomyLevel: 3,
      recoveryCooldownMs: 120000,
      taskStartGracePeriodMs: 300000,
      maxControllerMessagesPerMinute: 6,
      aiConsultationEnabled: true,
      decisionMemoryFile: 'memory/decision-memory.json',
      workspace: process.cwd(),
      messageTemplates: {},
      staleThresholdMs: 180000,
      swapThresholdMs: 480000,
      killThresholdMs: 900000,
      orphanMaxAgeMs: 1800000,
      recoveryTimeoutMs: 180000,
      maxRecoveryAttempts: 3,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Filesystem-based cooldown that survives HMR/dev server restarts.
// Prevents the singleton being recreated (losing in-memory cooldowns)
// from causing immediate re-respawn storms.
const COOLDOWN_DIR = path.join(resultsDir(), '.orchestrator-cooldowns');

function _readFsCooldown(taskId) {
  try {
    const file = path.join(COOLDOWN_DIR, `${taskId}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}

function _writeFsCooldown(taskId, data) {
  try {
    if (!fs.existsSync(COOLDOWN_DIR)) fs.mkdirSync(COOLDOWN_DIR, { recursive: true });
    fs.writeFileSync(path.join(COOLDOWN_DIR, `${taskId}.json`), JSON.stringify(data));
  } catch { /* best-effort */ }
}

function _clearFsCooldown(taskId) {
  try {
    const file = path.join(COOLDOWN_DIR, `${taskId}.json`);
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  } catch { /* best-effort */ }
}

function formatAge(ms) {
  if (!ms || ms <= 0) return '0s';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function getModelFamily(model) {
  if (!model) return 'unknown';
  if (/anthropic|claude/i.test(model)) return 'anthropic';
  if (/openai|gpt|codex/i.test(model)) return 'openai';
  return 'unknown';
}

function resolveFallbackModel(currentModel) {
  const family = getModelFamily(currentModel);
  if (family === 'anthropic') return 'openai-codex/gpt-5.3-codex';
  return 'anthropic/claude-sonnet-4-6';
}

// ---------------------------------------------------------------------------
// Condition Tracker — deduplication layer
// ---------------------------------------------------------------------------

class ConditionTracker {
  constructor() {
    this._conditions = new Map(); // key -> {type, id, firstSeen, lastSeen, count, actionTaken}
  }

  _key(type, id) {
    return `${type}:${id}`;
  }

  /** Track a condition. Returns true if new, false if already tracked. */
  track(type, id) {
    const key = this._key(type, id);
    const existing = this._conditions.get(key);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.count++;
      return false;
    }
    this._conditions.set(key, {
      type, id,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      count: 1,
      actionTaken: null,
    });
    return true;
  }

  markActioned(type, id, action) {
    const entry = this._conditions.get(this._key(type, id));
    if (entry) entry.actionTaken = action;
  }

  resolve(type, id) {
    this._conditions.delete(this._key(type, id));
  }

  /** Remove entries for IDs no longer active. */
  prune(activeIds) {
    for (const [key, entry] of this._conditions) {
      if (!activeIds.has(entry.id)) {
        this._conditions.delete(key);
      }
    }
  }

  get(type, id) {
    return this._conditions.get(this._key(type, id)) || null;
  }

  getAll() {
    return [...this._conditions.values()];
  }
}

// ---------------------------------------------------------------------------
// Decision Memory — persistent pattern→action store
// ---------------------------------------------------------------------------

class DecisionMemory {
  constructor(memoryFilePath) {
    this._memoryFile = memoryFilePath;
    this._cache = new Map();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._memoryFile)) {
        const data = JSON.parse(fs.readFileSync(this._memoryFile, 'utf8'));
        if (data.patterns) {
          for (const [key, val] of Object.entries(data.patterns)) {
            this._cache.set(key, val);
          }
        }
      }
    } catch (e) {
      console.warn('[OrchestratorEngine] Failed to load decision memory:', e.message);
    }
  }

  lookup(patternKey) {
    return this._cache.get(patternKey) || null;
  }

  store(patternKey, action, reason) {
    const entry = {
      action,
      reason,
      learnedAt: new Date().toISOString(),
      usedCount: 0,
    };
    this._cache.set(patternKey, entry);
    this._persist();
  }

  incrementUsage(patternKey) {
    const entry = this._cache.get(patternKey);
    if (entry) {
      entry.usedCount = (entry.usedCount || 0) + 1;
      this._persist();
    }
  }

  _persist() {
    try {
      const dir = path.dirname(this._memoryFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const patterns = {};
      for (const [key, val] of this._cache) {
        patterns[key] = val;
      }
      fs.writeFileSync(this._memoryFile, JSON.stringify({ patterns }, null, 2) + '\n');
    } catch (e) {
      console.warn('[OrchestratorEngine] Failed to persist decision memory:', e.message);
    }
  }

  get size() {
    return this._cache.size;
  }
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

class RateLimiter {
  constructor(maxPerMinute) {
    this.maxPerMinute = maxPerMinute;
    this._timestamps = [];
  }

  canSend() {
    this._prune();
    return this._timestamps.length < this.maxPerMinute;
  }

  record() {
    this._timestamps.push(Date.now());
  }

  _prune() {
    const cutoff = Date.now() - 60000;
    this._timestamps = this._timestamps.filter(t => t > cutoff);
  }

  get remaining() {
    this._prune();
    return Math.max(0, this.maxPerMinute - this._timestamps.length);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator Engine — singleton
// ---------------------------------------------------------------------------

class OrchestratorEngine {
  constructor() {
    this._started = false;
    this._paused = false;
    this._ticking = false;
    this._timer = null;

    this._decisionLog = [];          // ring buffer, max 200
    this._recoveryCooldowns = new Map(); // taskId -> lastAttemptAt
    this._pendingTaskRecoveries = new Map(); // taskId -> { attemptedAt, reason, manual }
    this._conditionTracker = new ConditionTracker();
    this._decisionMemory = null;     // initialized on start()
    this._stats = {
      nudges: 0, swaps: 0, kills: 0,
      recoveries: 0, purges: 0, aiConsultations: 0,
    };
    this._rateLimiter = null;
    this._pendingReview = [];        // AI-recommended actions awaiting approval
    this._previousSessionIds = new Set();
    this._autonomyLevel = 3;         // default: autonomous
    this._pendingConfirmations = []; // actions waiting for human confirmation (autonomy < 3)
  }

  // -------------------------------------------------------------------------
  // Autonomy level management
  // -------------------------------------------------------------------------

  get autonomyLevel() { return this._autonomyLevel; }

  setAutonomyLevel(level) {
    const lvl = Math.max(0, Math.min(4, Math.floor(level)));
    this._autonomyLevel = lvl;
    this._logDecision('manual', 'autonomy', 'system',
      'set-level', `Autonomy level set to ${lvl} (${AUTONOMY_LEVELS[lvl]?.name || 'unknown'})`);
    return { ok: true, level: lvl, name: AUTONOMY_LEVELS[lvl]?.name };
  }

  _getAutonomyPerms() {
    return AUTONOMY_LEVELS[this._autonomyLevel] || AUTONOMY_LEVELS[3];
  }

  /**
   * Check if an action is allowed at current autonomy level.
   * If not, queue it for confirmation and return false.
   */
  _canAutoExecute(actionType, context) {
    const perms = this._getAutonomyPerms();
    const permMap = { nudge: 'autoNudge', swap: 'autoSwap', kill: 'autoKill', respawn: 'autoRecover', recover: 'autoRecover' };
    const permKey = permMap[actionType];
    if (!permKey || perms[permKey]) return true;

    // Queue for confirmation
    const confirmation = {
      id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actionType,
      context,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    this._pendingConfirmations.push(confirmation);
    if (this._pendingConfirmations.length > 50) this._pendingConfirmations = this._pendingConfirmations.slice(-50);

    this._logDecision('autonomy-blocked', context.conditionType || 'unknown', context.target || 'unknown',
      `blocked:${actionType}`, `Autonomy level ${this._autonomyLevel} requires confirmation for ${actionType}`);
    return false;
  }

  confirmAction(confirmationId) {
    const idx = this._pendingConfirmations.findIndex(c => c.id === confirmationId);
    if (idx === -1) return { ok: false, error: 'Confirmation not found' };
    const conf = this._pendingConfirmations.splice(idx, 1)[0];
    conf.status = 'confirmed';
    this._logDecision('manual', conf.context?.conditionType || 'unknown', conf.context?.target || 'unknown',
      conf.actionType, `Confirmed by operator (was autonomy-blocked)`);
    // Execute the confirmed action
    return this._executeConfirmedAction(conf);
  }

  denyAction(confirmationId) {
    const idx = this._pendingConfirmations.findIndex(c => c.id === confirmationId);
    if (idx === -1) return { ok: false, error: 'Confirmation not found' };
    const conf = this._pendingConfirmations.splice(idx, 1)[0];
    conf.status = 'denied';
    this._logDecision('manual', conf.context?.conditionType || 'unknown', conf.context?.target || 'unknown',
      'denied', `Denied by operator: ${conf.actionType}`);
    return { ok: true };
  }

  _executeConfirmedAction(conf) {
    switch (conf.actionType) {
      case 'nudge': return this.manualNudge(conf.context.sessionId);
      case 'swap': return this.manualSwap(conf.context.sessionId, conf.context.targetModel);
      case 'kill': return this.manualKill(conf.context.sessionId);
      case 'recover': return this.manualRecover(conf.context.taskId);
      default: return { ok: false, error: `Unknown action type: ${conf.actionType}` };
    }
  }

  start() {
    if (this._started) return;
    this._started = true;

    const cfg = loadEngineConfig();
    if (!cfg.enabled) {
      console.log('[OrchestratorEngine] Disabled by config');
      return;
    }

    // Initialize decision memory
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    const memoryPath = path.join(process.cwd(), 'config', projectId, cfg.decisionMemoryFile);
    this._decisionMemory = new DecisionMemory(memoryPath);

    // Initialize rate limiter
    this._rateLimiter = new RateLimiter(cfg.maxControllerMessagesPerMinute);

    // Initialize autonomy level from config
    this._autonomyLevel = cfg.autonomyLevel ?? 3;

    // Evaluate after each session manager scan — hook into scan completion
    // We use a timer that runs after each scan interval
    this._timer = setInterval(() => this._tick(), 30000);
    setTimeout(() => this._tick(), 5000);

    console.log('[OrchestratorEngine] Started (deterministic decision engine)');
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._started = false;
    console.log('[OrchestratorEngine] Stopped');
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  // -------------------------------------------------------------------------
  // Core tick
  // -------------------------------------------------------------------------

  async _tick() {
    if (this._paused || this._ticking) return;
    this._ticking = true;
    try {
      await this._evaluate();
    } catch (e) {
      console.error('[OrchestratorEngine] tick error:', e.message);
    } finally {
      this._ticking = false;
    }
  }

  async _evaluate() {
    const cfg = loadEngineConfig();
    const now = Date.now();

    // Skip if target app is down
    if (appHealth.isHealthy() === false) return;

    const registry = sessionManager.registry;
    const resultsIndex = this._loadResultsIndex();

    // Clear stuck-task recovery guards once the task exits running state.
    // NOTE: We intentionally do NOT clear pending based on hasSession here.
    // The session registry can flicker (session appears briefly then disappears),
    // which would clear the pending guard and allow the stuck block to re-spawn
    // on the very next tick — creating an infinite respawn loop. Instead, let the
    // stuck block's own `if (hasSession) continue` handle session reappearance,
    // and only clear pending when the task genuinely finishes or disappears.
    for (const [taskId] of this._pendingTaskRecoveries) {
      const info = resultsIndex[taskId];
      if (!info || info.status !== 'running') {
        this._pendingTaskRecoveries.delete(taskId);
        this._conditionTracker.resolve('task_stuck', taskId);
        _clearFsCooldown(taskId);
      }
    }

    // Track active IDs for pruning
    const activeIds = new Set();
    for (const entry of registry.values()) {
      activeIds.add(entry.sessionId);
      if (entry.taskId) activeIds.add(entry.taskId);
    }
    for (const [taskId, info] of Object.entries(resultsIndex)) {
      if (info.status === 'running') activeIds.add(taskId);
    }

    // Detect disappeared sessions
    const seenIds = new Set(registry.keys());
    for (const id of this._previousSessionIds) {
      if (!seenIds.has(id)) {
        // Check if it was running a task
        for (const [taskId, info] of Object.entries(resultsIndex)) {
          if (info.runSessionKey && info.runSessionKey.includes(id) && info.status === 'running') {
            const isNew = this._conditionTracker.track('session_disappeared', taskId);
            if (isNew) {
              this._logDecision('deterministic', 'session_disappeared', taskId,
                'recover', `Session disappeared for running task ${taskId}`);
            }
          }
        }
      }
    }
    this._previousSessionIds = seenIds;

    // Layer 2: Deterministic decision tree
    for (const entry of registry.values()) {
      if (entry.isController) continue;

      const age = entry.ageMs;

      // --- Healthy recovery: reset escalation ---
      if (entry.status === 'healthy' && entry.escalation.level > 0) {
        this._conditionTracker.resolve('stale', entry.sessionId);
        entry.escalation.level = 0;
        this._logDecision('deterministic', 'recovery', entry.sessionId,
          'reset', `Session recovered, reset escalation from L${entry.escalation.level}`);
        continue;
      }

      // --- Stale sessions: escalation ladder ---
      // Only identified sessions (taskId known) get escalated (nudge → swap → kill).
      // Unidentified sessions are skipped — orphan detection handles cleanup.
      if (entry.status === 'stale') {
        const identified = !!entry.taskId;

        // Grace period: don't escalate sessions for recently started tasks
        if (identified && resultsIndex[entry.taskId]?.startedAt) {
          if ((now - resultsIndex[entry.taskId].startedAt) < cfg.taskStartGracePeriodMs) continue;
        }

        // Skip escalation if the task is already finished (passed/failed/done/completed).
        // This prevents the endless nudge loop where a completed task's session
        // is still alive but idle, causing the engine to keep nudging it.
        if (identified && resultsIndex[entry.taskId]) {
          const taskStatus = resultsIndex[entry.taskId].status;
          if (taskStatus === 'passed' || taskStatus === 'failed' || taskStatus === 'done' || taskStatus === 'completed') {
            // Task is finished — don't escalate. Reset escalation level.
            if (entry.escalation.level > 0) {
              entry.escalation.level = 0;
              this._logDecision('deterministic', 'stale', entry.sessionId,
                'skip', `Task ${entry.taskId} already ${taskStatus} — skipping escalation`);
            }
            this._conditionTracker.resolve('stale', entry.sessionId);
            continue;
          }
        }

        if (!identified) {
          this._conditionTracker.track('stale_unidentified', entry.sessionId);
          // Unidentified sessions: no taskId means nudge/swap/kill messages render
          // "Task unknown" which is useless and wastes AI tokens. Skip escalation
          // entirely — orphan detection will handle cleanup after orphanMaxAgeMs.
          continue;
        }

        this._conditionTracker.track('stale', entry.sessionId);

        // Level 3: kill (after swap has been attempted)
        if (age >= cfg.killThresholdMs && entry.escalation.level < 3 && entry.escalation.swapCount > 0) {
          if (this._rateLimiter.canSend() && this._canAutoExecute('kill', { conditionType: 'stale', target: entry.sessionId, sessionId: entry.sessionId, taskId: entry.taskId })) {
            entry.escalation.level = 3;
            entry.escalation.lastKillAt = now;
            this._stats.kills++;
            const killMsg = sessionManager._sendKill(entry, cfg);
            this._logDecision('deterministic', 'stale', entry.sessionId,
              'kill', `L3: kill after ${formatAge(age)} stale (task: ${entry.taskId || 'unidentified'}, key: ${entry.key})`, killMsg);
            this._rateLimiter.record();
            this._conditionTracker.markActioned('stale', entry.sessionId, 'kill');
            learningLoop.learnFromOrchestratorDecision({ conditionType: 'stale', action: 'kill', source: 'deterministic', target: entry.sessionId, reason: `L3 kill after ${formatAge(age)}` });
          }
          continue;
        }

        // Level 2: swap (after nudge has been attempted)
        if (age >= cfg.swapThresholdMs && entry.escalation.level < 2 && entry.escalation.nudgeCount > 0) {
          const fallback = resolveFallbackModel(entry.model);
          if (this._rateLimiter.canSend() && this._canAutoExecute('swap', { conditionType: 'stale', target: entry.sessionId, sessionId: entry.sessionId, targetModel: fallback })) {
            entry.escalation.level = 2;
            entry.escalation.lastSwapAt = now;
            entry.escalation.swapCount++;
            this._stats.swaps++;
            const swapMsg = sessionManager._sendSwap(entry, fallback, cfg);
            this._logDecision('deterministic', 'stale', entry.sessionId,
              'swap', `L2: swap to ${fallback} after ${formatAge(age)} stale (task: ${entry.taskId || 'unidentified'})`, swapMsg);
            this._rateLimiter.record();
            this._conditionTracker.markActioned('stale', entry.sessionId, 'swap');
            learningLoop.learnFromOrchestratorDecision({ conditionType: 'stale', action: 'swap', source: 'deterministic', target: entry.sessionId, reason: `L2 swap after ${formatAge(age)}` });
          }
          continue;
        }

        // Level 1: nudge
        if (age >= cfg.staleThresholdMs && entry.escalation.level < 1) {
          const lastNudge = entry.escalation.lastNudgeAt || 0;
          const nudgeCooldown = cfg.messageTemplates?.nudgeCooldownMs || 300000;
          if (now - lastNudge >= nudgeCooldown && this._rateLimiter.canSend() && this._canAutoExecute('nudge', { conditionType: 'stale', target: entry.sessionId, sessionId: entry.sessionId })) {
            entry.escalation.level = 1;
            entry.escalation.lastNudgeAt = now;
            entry.escalation.nudgeCount++;
            this._stats.nudges++;
            const nudgeMsg = sessionManager._sendNudge(entry, cfg);
            this._logDecision('deterministic', 'stale', entry.sessionId,
              'nudge', `L1: nudge after ${formatAge(age)} stale (task: ${entry.taskId || 'unidentified'})`, nudgeMsg);
            this._rateLimiter.record();
            this._conditionTracker.markActioned('stale', entry.sessionId, 'nudge');
            learningLoop.learnFromOrchestratorDecision({ conditionType: 'stale', action: 'nudge', source: 'deterministic', target: entry.sessionId, reason: `L1 nudge after ${formatAge(age)}` });
          }
        }
      }

      // --- Orphaned sessions ---
      if (entry.status === 'orphaned') {
        this._conditionTracker.track('orphaned', entry.sessionId);
        if (age >= cfg.orphanMaxAgeMs) {
          this._stats.purges++;
          this._logDecision('deterministic', 'orphaned', entry.sessionId,
            'purge', `Purging orphaned session (age: ${formatAge(age)})`);
          sessionManager._purgeFromIndex([entry.sessionId]);
          registry.delete(entry.sessionId);
          this._conditionTracker.resolve('orphaned', entry.sessionId);
        }
      }

      // --- Duplicate sessions ---
      if (entry.status === 'duplicate') {
        const isNew = this._conditionTracker.track('duplicate', entry.sessionId);
        if (isNew && this._rateLimiter.canSend()) {
          this._stats.kills++;
          const dupKillMsg = sessionManager._sendKill(entry, cfg);
          this._logDecision('deterministic', 'duplicate', entry.sessionId,
            'kill', `Killing duplicate session for task ${entry.taskId}`, dupKillMsg);
          this._rateLimiter.record();
          this._conditionTracker.markActioned('duplicate', entry.sessionId, 'kill');
        }
      }
    }

    // --- Stuck tasks: result=running but no session ---
    for (const [taskId, info] of Object.entries(resultsIndex)) {
      if (info.status !== 'running') continue;
      const hasSession = [...registry.values()].some(e => e.taskId === taskId);
      if (hasSession) continue;

      // Secondary check (listSessionsSync) is deferred to _respawnTask()
      // to avoid calling it on every tick for every stuck task.

      // Grace period: task was just started, agent hasn't created session yet
      if (info.startedAt && (now - info.startedAt) < cfg.taskStartGracePeriodMs) {
        continue;
      }

      this._conditionTracker.track('task_stuck', taskId);

      // Restore attempt count from filesystem cooldown (survives HMR/restarts)
      let recoveryAttemptsSoFar = _readFsCooldown(taskId)?.attempts || 0;
      const pendingRecovery = this._pendingTaskRecoveries.get(taskId);
      if (pendingRecovery) {
        const pendingAge = now - pendingRecovery.attemptedAt;

        // Still within timeout window — keep waiting
        if (pendingAge < cfg.recoveryTimeoutMs) {
          this._conditionTracker.markActioned('task_stuck', taskId,
            pendingRecovery.manual ? 'manual-recovery-pending' : 'recovery-pending');
          continue;
        }

        // Timed out — clear pending
        recoveryAttemptsSoFar = pendingRecovery.attempts || 1;
        this._pendingTaskRecoveries.delete(taskId);

        // Max retries exceeded — auto-fail
        if (recoveryAttemptsSoFar >= cfg.maxRecoveryAttempts) {
          this._logDecision('deterministic', 'task_stuck', taskId,
            'auto-fail', `Recovery failed after ${recoveryAttemptsSoFar} attempts — auto-failing task`);
          this._autoFailTask(taskId, info, recoveryAttemptsSoFar);
          this._conditionTracker.resolve('task_stuck', taskId);
          continue;
        }

        // Timed out but retries remain — fall through to respawn
        this._logDecision('deterministic', 'task_stuck', taskId,
          'recovery-timeout', `Recovery attempt ${recoveryAttemptsSoFar} timed out after ${formatAge(cfg.recoveryTimeoutMs)} — retrying`);
      }

      const lastRecovery = this._recoveryCooldowns.get(taskId) || 0;
      // Also check filesystem cooldown (survives HMR/restarts)
      const fsCooldown = _readFsCooldown(taskId);
      const lastRecoveryEffective = Math.max(lastRecovery, fsCooldown?.at || 0);
      const cooldownElapsed = now - lastRecoveryEffective >= cfg.recoveryCooldownMs;

      if (cooldownElapsed && this._rateLimiter.canSend() && this._canAutoExecute('recover', { conditionType: 'task_stuck', target: taskId, taskId })) {
        this._recoveryCooldowns.set(taskId, now);
        const respawnMsg = this._respawnTask(taskId, info, cfg);
        if (respawnMsg) {
          // Respawn succeeded — track pending recovery
          this._stats.recoveries++;
          this._pendingTaskRecoveries.set(taskId, {
            attemptedAt: now,
            reason: 'auto-stuck-recovery',
            manual: false,
            attempts: recoveryAttemptsSoFar + 1,
          });
          this._logDecision('deterministic', 'task_stuck', taskId,
            'respawn', `Respawning stuck task (attempt ${recoveryAttemptsSoFar + 1}/${cfg.maxRecoveryAttempts}, model: ${info.model})`, respawnMsg);
          this._rateLimiter.record();
          this._conditionTracker.markActioned('task_stuck', taskId, 'respawn');
          // Persist cooldown to filesystem so it survives HMR/restarts
          _writeFsCooldown(taskId, { at: now, attempts: recoveryAttemptsSoFar + 1 });
        } else {
          // Respawn returned null (session already exists or no controller) — resolve condition
          this._conditionTracker.resolve('task_stuck', taskId);
        }
      }
    }

    // Prune stale conditions
    this._conditionTracker.prune(activeIds);
  }

  // -------------------------------------------------------------------------
  // Task respawn (stuck task recovery)
  // -------------------------------------------------------------------------

  _respawnTask(taskId, resultInfo, cfg) {
    // Pre-spawn check: verify no session exists from the CLI's perspective.
    // The dashboard's session registry may not see a session that the controller
    // considers "in flight". Spawning in that case just wastes a message and the
    // controller will refuse ("still in flight"). Check the CLI session list first.
    try {
      const sessions = listSessionsSync();
      const rsk = resultInfo.runSessionKey || '';
      const existing = sessions.find(s =>
        s.key?.includes(taskId) ||
        s.taskId === taskId ||
        (rsk && s.key === rsk) ||
        (rsk && s.sessionId && rsk.includes(s.sessionId))
      );
      if (existing) {
        // Session is live — clear pending recovery and resolve the condition
        this._pendingTaskRecoveries.delete(taskId);
        this._conditionTracker.resolve('task_stuck', taskId);
        this._logDecision('deterministic', 'task_stuck', taskId,
          'skip-respawn', `Session ${existing.key || existing.sessionId} already exists for task (invisible to dashboard registry). Skipping respawn.`);
        return null;
      }
    } catch (e) {
      // listSessions failure is non-fatal — proceed with spawn
      console.warn('[OrchestratorEngine] listSessions check failed:', e.message);
    }

    const message = [
      '[dashboard-run]',
      `Resume task: ${taskId}`,
      `Model: ${resultInfo.model || 'anthropic/claude-sonnet-4-6'}`,
      '',
      'IMPORTANT: This is a RESUME, not a fresh start.',
      `1. Read ${cfg.workspace}/results/${taskId}.json for current progress`,
      `2. Read ${cfg.workspace}/reports-md/${taskId}.md for partial report (if any)`,
      '3. Continue from where the previous session left off',
      '4. Do NOT restart testing from scratch',
    ].join('\n');

    const controllerSessionId = getControllerSessionId();
    if (!controllerSessionId) {
      console.warn('[OrchestratorEngine] No controller session — cannot respawn task', taskId);
      return null;
    }

    try {
      const logPath = bridgeLogPath();
      fs.appendFileSync(logPath,
        `\n[${new Date().toISOString()}] [engine] Respawning stuck task: ${taskId}\n`);
      spawnAgent(controllerSessionId, message, logPath);
      return message;
    } catch (e) {
      console.error('[OrchestratorEngine] Failed to respawn task:', taskId, e.message);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Auto-fail task (recovery exhausted)
  // -------------------------------------------------------------------------

  _autoFailTask(taskId, resultInfo, attemptCount) {
    const resultsFile = path.join(resultsDir(), `${taskId}.json`);
    try {
      let data = {};
      if (fs.existsSync(resultsFile)) {
        data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
      }
      data.status = 'failed';
      data.lastLog = `Recovery failed: ${attemptCount} respawn attempts timed out`;
      data.updatedAt = new Date().toISOString();
      // Add orchestrator-recovery finding
      const findings = data.findings || [];
      if (!findings.find(f => f.id === 'orchestrator-recovery')) {
        findings.push({
          id: 'orchestrator-recovery',
          severity: 'error',
          title: 'Orchestrator recovery exhausted',
          description: `Task was stuck with no active session. ${attemptCount} respawn attempts each timed out after ${Math.round((loadEngineConfig().recoveryTimeoutMs || 180000) / 1000)}s. Auto-failed by orchestrator engine.`,
          createdAt: new Date().toISOString(),
        });
      }
      data.findings = findings;
      fs.writeFileSync(resultsFile, JSON.stringify(data, null, 2) + '\n');

      // Log to bridge log
      try {
        const logPath = bridgeLogPath();
        fs.appendFileSync(logPath,
          `\n[${new Date().toISOString()}] [engine] Auto-failed task ${taskId} after ${attemptCount} recovery attempts\n`);
      } catch { /* bridge log write is best-effort */ }
    } catch (e) {
      console.error('[OrchestratorEngine] Failed to auto-fail task:', taskId, e.message);
    }
  }

  // -------------------------------------------------------------------------
  // AI Consultation (Layer 3)
  // -------------------------------------------------------------------------

  async consultAI(patternKey, description, availableActions) {
    const cfg = loadEngineConfig();
    if (!cfg.aiConsultationEnabled) return null;

    // Check decision memory first
    const memorized = this._decisionMemory?.lookup(patternKey);
    if (memorized) {
      memorized.usedCount = (memorized.usedCount || 0) + 1;
      this._decisionMemory.incrementUsage(patternKey);
      this._logDecision('memory-recall', 'unknown', patternKey,
        memorized.action, `From memory: ${memorized.reason} (used ${memorized.usedCount}x)`);
      return memorized;
    }

    // Send one-shot consultation via gateway
    try {
      const prompt = [
        'You are a QA platform orchestrator. An unrecognized condition occurred.',
        '',
        `Pattern: ${patternKey}`,
        `Description: ${description}`,
        `Available actions: ${(availableActions || ['nudge', 'swap', 'kill', 'respawn', 'purge', 'ignore']).join(', ')}`,
        '',
        'Respond with ONLY: action_name | one-line reason',
      ].join('\n');

      const response = await gatewaySendChat(null, prompt);
      const text = response?.choices?.[0]?.message?.content?.trim();
      if (!text) return null;

      // Parse response: "action_name | reason"
      const parts = text.split('|').map(s => s.trim());
      const action = parts[0]?.toLowerCase()?.replace(/\s+/g, '_') || 'ignore';
      const reason = parts[1] || 'AI recommended';

      this._stats.aiConsultations++;

      // Store in pending review — do NOT execute automatically
      const recommendation = {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        patternKey,
        description,
        action,
        reason: `AI recommended: ${reason}`,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      this._pendingReview.push(recommendation);
      if (this._pendingReview.length > 50) this._pendingReview = this._pendingReview.slice(-50);

      this._logDecision('ai-consulted', 'unknown', patternKey,
        `pending:${action}`, `AI recommends: ${action} — ${reason} (awaiting approval)`);

      return recommendation;
    } catch (e) {
      console.error('[OrchestratorEngine] AI consultation failed:', e.message);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Pending review management
  // -------------------------------------------------------------------------

  approveRecommendation(id) {
    const idx = this._pendingReview.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: 'Recommendation not found' };

    const rec = this._pendingReview[idx];
    rec.status = 'approved';
    this._pendingReview.splice(idx, 1);

    // Store in decision memory for future use
    if (this._decisionMemory) {
      this._decisionMemory.store(rec.patternKey, rec.action, rec.reason);
    }

    this._logDecision('approved', 'unknown', rec.patternKey,
      rec.action, `Approved: ${rec.reason}`);

    return { ok: true, action: rec.action, patternKey: rec.patternKey };
  }

  rejectRecommendation(id) {
    const idx = this._pendingReview.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: 'Recommendation not found' };

    const rec = this._pendingReview[idx];
    rec.status = 'rejected';
    this._pendingReview.splice(idx, 1);

    // Store "ignore" in memory so we don't ask again
    if (this._decisionMemory) {
      this._decisionMemory.store(rec.patternKey, 'ignore', `Rejected by operator: ${rec.reason}`);
    }

    this._logDecision('rejected', 'unknown', rec.patternKey,
      'ignore', `Rejected: ${rec.reason}`);

    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Manual overrides
  // -------------------------------------------------------------------------

  manualNudge(sessionId) {
    const result = sessionManager.nudge(sessionId);
    if (result.ok) {
      this._stats.nudges++;
      this._logDecision('manual', 'stale', sessionId, 'nudge', 'Manual nudge');
    }
    return result;
  }

  manualSwap(sessionId, targetModel) {
    const result = sessionManager.swapModel(sessionId, targetModel);
    if (result.ok) {
      this._stats.swaps++;
      this._logDecision('manual', 'stale', sessionId, 'swap', `Manual swap to ${targetModel}`);
    }
    return result;
  }

  manualKill(sessionId) {
    const result = sessionManager.killSession(sessionId);
    if (result.ok) {
      this._stats.kills++;
      this._logDecision('manual', 'kill', sessionId, 'kill', 'Manual kill');
    }
    return result;
  }

  manualRecover(taskId) {
    const cfg = loadEngineConfig();
    const resultsIndex = this._loadResultsIndex();
    const info = resultsIndex[taskId];
    if (!info) return { ok: false, error: `Task ${taskId} not found in results` };

    this._stats.recoveries++;
    const now = Date.now();
    this._recoveryCooldowns.set(taskId, now);
    this._pendingTaskRecoveries.set(taskId, {
      attemptedAt: now,
      reason: 'manual-recovery',
      manual: true,
      attempts: 1,
    });
    this._logDecision('manual', 'task_stuck', taskId, 'respawn', 'Manual recovery');
    this._respawnTask(taskId, info, cfg);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Decision log
  // -------------------------------------------------------------------------

  _logDecision(source, conditionType, target, action, reason, message = null) {
    const entry = {
      ts: Date.now(),
      source,       // 'deterministic' | 'ai-consulted' | 'memory-recall' | 'manual' | 'approved' | 'rejected'
      conditionType,
      target,
      action,
      reason,
    };
    if (message) entry.message = message;
    this._decisionLog.unshift(entry);
    if (this._decisionLog.length > 200) this._decisionLog.length = 200;
  }

  // -------------------------------------------------------------------------
  // Results index loader
  // -------------------------------------------------------------------------

  _loadResultsIndex() {
    const dir = resultsDir();
    const index = {};
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'system.json');
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
          const taskId = file.replace('.json', '');
          index[taskId] = {
            status: data.status || 'idle',
            runSessionKey: data.runSessionKey || null,
            model: data.model || null,
            startedAt: data.startedAt ? Date.parse(data.startedAt) : null,
            updatedAt: data.updatedAt ? Date.parse(data.updatedAt) : null,
            isAutoFail: !!(data.findings || []).find(f => f.id === 'stale-timeout'),
          };
        } catch { /* skip corrupt files */ }
      }
    } catch { /* results dir may not exist */ }
    return index;
  }

  // -------------------------------------------------------------------------
  // Status (returned by GET /api/orchestrator)
  // -------------------------------------------------------------------------

  getStatus() {
    const perms = this._getAutonomyPerms();
    return {
      started: this._started,
      paused: this._paused,
      stats: { ...this._stats },
      autonomy: {
        level: this._autonomyLevel,
        name: perms.name,
        permissions: perms,
      },
      recentDecisions: this._decisionLog.slice(0, 50),
      activeConditions: this._conditionTracker.getAll(),
      pendingReview: [...this._pendingReview],
      pendingConfirmations: [...this._pendingConfirmations],
      memorySize: this._decisionMemory?.size || 0,
      rateLimit: {
        remaining: this._rateLimiter?.remaining ?? 0,
        maxPerMinute: this._rateLimiter?.maxPerMinute ?? 6,
      },
      decisionTree: this._buildDecisionTreeSnapshot(),
    };
  }

  /**
   * Build a snapshot of the decision tree showing each session's current position
   * in the escalation ladder and what the next action will be.
   */
  _buildDecisionTreeSnapshot() {
    const cfg = loadEngineConfig();
    const registry = sessionManager.registry;
    const resultsIndex = this._loadResultsIndex();
    const now = Date.now();

    const nodes = [];

    for (const entry of registry.values()) {
      if (entry.isController) continue;

      const age = entry.ageMs || 0;
      const level = entry.escalation?.level || 0;
      let nextAction = null;
      let nextThresholdMs = null;
      let progress = 0; // 0-100% toward next threshold

      if (entry.status === 'healthy') {
        nextAction = 'monitoring';
        nextThresholdMs = cfg.staleThresholdMs;
        progress = Math.min(100, Math.round((age / cfg.staleThresholdMs) * 100));
      } else if (entry.status === 'stale') {
        if (!entry.taskId) {
          // Unidentified stale session — engine skips escalation
          nextAction = 'skipped (no taskId)';
          progress = 0;
        } else if (level < 1) {
          nextAction = 'nudge';
          nextThresholdMs = cfg.staleThresholdMs;
          progress = Math.min(100, Math.round((age / cfg.staleThresholdMs) * 100));
        } else if (level < 2) {
          nextAction = 'swap';
          nextThresholdMs = cfg.swapThresholdMs;
          progress = Math.min(100, Math.round((age / cfg.swapThresholdMs) * 100));
        } else if (level < 3) {
          nextAction = 'kill';
          nextThresholdMs = cfg.killThresholdMs;
          progress = Math.min(100, Math.round((age / cfg.killThresholdMs) * 100));
        } else {
          nextAction = 'killed';
          progress = 100;
        }
      } else if (entry.status === 'orphaned') {
        nextAction = 'purge';
        nextThresholdMs = cfg.orphanMaxAgeMs;
        progress = Math.min(100, Math.round((age / cfg.orphanMaxAgeMs) * 100));
      } else if (entry.status === 'duplicate') {
        nextAction = 'kill-duplicate';
        progress = 100;
      }

      nodes.push({
        sessionId: entry.sessionId,
        key: entry.key,
        taskId: entry.taskId,
        model: entry.model,
        status: entry.status,
        ageMs: age,
        level,
        nextAction,
        nextThresholdMs,
        progress,
        nudgeCount: entry.escalation?.nudgeCount || 0,
        swapCount: entry.escalation?.swapCount || 0,
      });
    }

    // Add stuck tasks (running but no session)
    for (const [taskId, info] of Object.entries(resultsIndex)) {
      if (info.status !== 'running') continue;
      const hasSession = nodes.some(n => n.taskId === taskId);
      if (!hasSession) {
        const lastRecovery = this._recoveryCooldowns.get(taskId) || 0;
        const cooldownRemaining = Math.max(0, cfg.recoveryCooldownMs - (now - lastRecovery));
        const pendingRecovery = this._pendingTaskRecoveries.get(taskId) || null;
        const pendingAttempts = pendingRecovery?.attempts || 0;
        let stuckNextAction;
        let stuckProgress;
        if (pendingRecovery) {
          const pendingAge = now - pendingRecovery.attemptedAt;
          const timeoutRemaining = Math.max(0, cfg.recoveryTimeoutMs - pendingAge);
          const timeoutPct = Math.min(100, Math.round((pendingAge / cfg.recoveryTimeoutMs) * 100));
          stuckNextAction = pendingRecovery.manual
            ? `awaiting manual recovery (attempt ${pendingAttempts}/${cfg.maxRecoveryAttempts}, timeout ${Math.ceil(timeoutRemaining / 1000)}s)`
            : `awaiting recovery (attempt ${pendingAttempts}/${cfg.maxRecoveryAttempts}, timeout ${Math.ceil(timeoutRemaining / 1000)}s)`;
          stuckProgress = timeoutPct;
        } else if (cooldownRemaining > 0) {
          stuckNextAction = `respawn (cooldown ${Math.ceil(cooldownRemaining / 1000)}s)`;
          stuckProgress = Math.round((1 - cooldownRemaining / cfg.recoveryCooldownMs) * 100);
        } else {
          stuckNextAction = 'respawn';
          stuckProgress = 100;
        }

        nodes.push({
          sessionId: null,
          key: null,
          taskId,
          model: info.model,
          status: 'stuck',
          ageMs: info.startedAt ? now - info.startedAt : 0,
          level: 0,
          nextAction: stuckNextAction,
          nextThresholdMs: null,
          progress: stuckProgress,
          nudgeCount: 0,
          swapCount: 0,
          recoveryAttempts: pendingAttempts,
          maxRecoveryAttempts: cfg.maxRecoveryAttempts,
        });
      }
    }

    return {
      nodes,
      thresholds: {
        staleMs: cfg.staleThresholdMs,
        swapMs: cfg.swapThresholdMs,
        killMs: cfg.killThresholdMs,
        orphanMs: cfg.orphanMaxAgeMs,
        recoveryCooldownMs: cfg.recoveryCooldownMs,
        recoveryTimeoutMs: cfg.recoveryTimeoutMs,
        maxRecoveryAttempts: cfg.maxRecoveryAttempts,
      },
    };
  }
}

// Module-level singleton
const orchestratorEngine = new OrchestratorEngine();
export default orchestratorEngine;
