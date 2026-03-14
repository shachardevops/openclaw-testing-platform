import fs from 'fs';
import path from 'path';
import type { MessageTemplates } from '@/types/config';
import sessionManager from './session-manager';
import { getProjectConfig } from './project-loader';
import { bridgeLogPath, resultsDir } from './config';
import { askWithGatewayFallback } from './direct-ai';
import { getControllerSessionId, spawnAgent, listSessionsSync } from './openclaw';
import appHealth from './app-health';
import learningLoop from './learning-loop';
import driftDetector from './drift-detector';
import auditTrail from './audit-trail';
import consensusValidator from './consensus-validator';
import selfHealing from './self-healing';
import taskClaims from './task-claims';
import tokenTracker from './token-tracker';
import memoryManager from './memory-tiers';
import { registry } from './service-registry';

const AUTONOMY_LEVELS: Record<number, { name: string; autoNudge: boolean; autoSwap: boolean; autoKill: boolean; autoRecover: boolean; aiConsult: boolean }> = {
  0: { name: 'manual', autoNudge: false, autoSwap: false, autoKill: false, autoRecover: false, aiConsult: false },
  1: { name: 'supervised', autoNudge: true, autoSwap: false, autoKill: false, autoRecover: false, aiConsult: false },
  2: { name: 'guided', autoNudge: true, autoSwap: true, autoKill: false, autoRecover: false, aiConsult: true },
  3: { name: 'autonomous', autoNudge: true, autoSwap: true, autoKill: true, autoRecover: true, aiConsult: true },
  4: { name: 'adaptive', autoNudge: true, autoSwap: true, autoKill: true, autoRecover: true, aiConsult: true },
};

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
      messageTemplates: project.messageTemplates || ({} as MessageTemplates),
      staleThresholdMs: esc.staleThresholdMs ?? 180000,
      swapThresholdMs: esc.swapThresholdMs ?? 480000,
      killThresholdMs: esc.killThresholdMs ?? 900000,
      orphanMaxAgeMs: project.sessionManager?.orphanMaxAgeMs ?? 1800000,
      recoveryTimeoutMs: orch.recoveryTimeoutMs ?? 180000,
      maxRecoveryAttempts: orch.maxRecoveryAttempts ?? 3,
    };
  } catch {
    return {
      enabled: true, autonomyLevel: 3, recoveryCooldownMs: 120000,
      taskStartGracePeriodMs: 300000, maxControllerMessagesPerMinute: 6,
      aiConsultationEnabled: true, decisionMemoryFile: 'memory/decision-memory.json',
      workspace: process.cwd(), messageTemplates: {} as MessageTemplates,
      staleThresholdMs: 180000, swapThresholdMs: 480000, killThresholdMs: 900000,
      orphanMaxAgeMs: 1800000, recoveryTimeoutMs: 180000, maxRecoveryAttempts: 3,
    };
  }
}

const COOLDOWN_DIR = path.join(resultsDir(), '.orchestrator-cooldowns');

function _readFsCooldown(taskId: string): { at?: number; attempts?: number } | null {
  try {
    const file = path.join(COOLDOWN_DIR, `${taskId}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}

function _writeFsCooldown(taskId: string, data: { at: number; attempts: number }): void {
  try {
    if (!fs.existsSync(COOLDOWN_DIR)) fs.mkdirSync(COOLDOWN_DIR, { recursive: true });
    fs.writeFileSync(path.join(COOLDOWN_DIR, `${taskId}.json`), JSON.stringify(data));
  } catch { /* best-effort */ }
}

function _clearFsCooldown(taskId: string): void {
  try {
    const file = path.join(COOLDOWN_DIR, `${taskId}.json`);
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  } catch { /* best-effort */ }
}

function formatAge(ms: number): string {
  if (!ms || ms <= 0) return '0s';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function getModelFamily(model: string | null): string {
  if (!model) return 'unknown';
  if (/anthropic|claude/i.test(model)) return 'anthropic';
  if (/openai|gpt|codex/i.test(model)) return 'openai';
  return 'unknown';
}

function resolveFallbackModel(currentModel: string): string {
  const family = getModelFamily(currentModel);
  if (family === 'anthropic') return 'openai-codex/gpt-5.3-codex';
  return 'anthropic/claude-sonnet-4-6';
}

interface ConditionEntry { type: string; id: string; firstSeen: number; lastSeen: number; count: number; actionTaken: string | null }

class ConditionTracker {
  private _conditions: Map<string, ConditionEntry> = new Map();
  private _key(type: string, id: string): string { return `${type}:${id}`; }
  track(type: string, id: string): boolean {
    const key = this._key(type, id);
    const existing = this._conditions.get(key);
    if (existing) { existing.lastSeen = Date.now(); existing.count++; return false; }
    this._conditions.set(key, { type, id, firstSeen: Date.now(), lastSeen: Date.now(), count: 1, actionTaken: null });
    return true;
  }
  markActioned(type: string, id: string, action: string): void { const e = this._conditions.get(this._key(type, id)); if (e) e.actionTaken = action; }
  resolve(type: string, id: string): void { this._conditions.delete(this._key(type, id)); }
  prune(activeIds: Set<string>): void { for (const [key, entry] of this._conditions) { if (!activeIds.has(entry.id)) this._conditions.delete(key); } }
  get(type: string, id: string): ConditionEntry | null { return this._conditions.get(this._key(type, id)) || null; }
  getAll(): ConditionEntry[] { return [...this._conditions.values()]; }
}

interface DecisionMemoryEntry { action: string; reason: string; learnedAt: string; usedCount: number }

class DecisionMemory {
  private _memoryFile: string;
  private _cache: Map<string, DecisionMemoryEntry> = new Map();
  constructor(memoryFilePath: string) { this._memoryFile = memoryFilePath; this._load(); }
  private _load(): void {
    try {
      if (fs.existsSync(this._memoryFile)) {
        const data = JSON.parse(fs.readFileSync(this._memoryFile, 'utf8'));
        if (data.patterns) { for (const [key, val] of Object.entries(data.patterns)) { this._cache.set(key, val as DecisionMemoryEntry); } }
      }
    } catch (e: unknown) { console.warn('[OrchestratorEngine] Failed to load decision memory:', (e as Error).message); }
  }
  lookup(patternKey: string): DecisionMemoryEntry | null { return this._cache.get(patternKey) || null; }
  store(patternKey: string, action: string, reason: string): void {
    this._cache.set(patternKey, { action, reason, learnedAt: new Date().toISOString(), usedCount: 0 });
    this._persist();
  }
  incrementUsage(patternKey: string): void { const e = this._cache.get(patternKey); if (e) { e.usedCount = (e.usedCount || 0) + 1; this._persist(); } }
  private _persist(): void {
    try {
      const dir = path.dirname(this._memoryFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const patterns: Record<string, DecisionMemoryEntry> = {};
      for (const [key, val] of this._cache) patterns[key] = val;
      fs.writeFileSync(this._memoryFile, JSON.stringify({ patterns }, null, 2) + '\n');
    } catch (e: unknown) { console.warn('[OrchestratorEngine] Failed to persist decision memory:', (e as Error).message); }
  }
  get size(): number { return this._cache.size; }
}

class RateLimiter {
  maxPerMinute: number;
  private _timestamps: number[] = [];
  constructor(maxPerMinute: number) { this.maxPerMinute = maxPerMinute; }
  canSend(): boolean { this._prune(); return this._timestamps.length < this.maxPerMinute; }
  record(): void { this._timestamps.push(Date.now()); }
  private _prune(): void { const cutoff = Date.now() - 60000; this._timestamps = this._timestamps.filter(t => t > cutoff); }
  get remaining(): number { this._prune(); return Math.max(0, this.maxPerMinute - this._timestamps.length); }
}

interface DecisionLogEntry { ts: number; source: string; conditionType: string; target: string; action: string; reason: string; message?: string }
interface PendingRecovery { attemptedAt: number; reason: string; manual: boolean; attempts: number }
interface PendingReview { id: string; patternKey: string; description: string; action: string; reason: string; createdAt: string; status: string }
interface PendingConfirmation { id: string; actionType: string; context: any; createdAt: string; status: string }

class OrchestratorEngine {
  private _started: boolean = false;
  private _paused: boolean = false;
  private _ticking: boolean = false;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _decisionLog: DecisionLogEntry[] = [];
  private _recoveryCooldowns: Map<string, number> = new Map();
  private _pendingTaskRecoveries: Map<string, PendingRecovery> = new Map();
  private _conditionTracker: ConditionTracker = new ConditionTracker();
  private _decisionMemory: DecisionMemory | null = null;
  private _stats = { nudges: 0, swaps: 0, kills: 0, recoveries: 0, purges: 0, aiConsultations: 0 };
  private _rateLimiter: RateLimiter | null = null;
  private _pendingReview: PendingReview[] = [];
  private _previousSessionIds: Set<string> = new Set();
  private _autonomyLevel: number = 3;
  private _pendingConfirmations: PendingConfirmation[] = [];

  get autonomyLevel(): number { return this._autonomyLevel; }

  setAutonomyLevel(level: number): Record<string, any> {
    const lvl = Math.max(0, Math.min(4, Math.floor(level)));
    this._autonomyLevel = lvl;
    this._logDecision('manual', 'autonomy', 'system', 'set-level', `Autonomy level set to ${lvl} (${AUTONOMY_LEVELS[lvl]?.name || 'unknown'})`);
    return { ok: true, level: lvl, name: AUTONOMY_LEVELS[lvl]?.name };
  }

  private _getAutonomyPerms() { return AUTONOMY_LEVELS[this._autonomyLevel] || AUTONOMY_LEVELS[3]; }

  private _canAutoExecute(actionType: string, context: any): boolean {
    const perms = this._getAutonomyPerms();
    const permMap: Record<string, string> = { nudge: 'autoNudge', swap: 'autoSwap', kill: 'autoKill', respawn: 'autoRecover', recover: 'autoRecover' };
    const permKey = permMap[actionType];
    const permKeyTyped = permKey as keyof typeof perms;
    if (!permKey || perms[permKeyTyped]) return true;
    const confirmation: PendingConfirmation = {
      id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actionType, context, createdAt: new Date().toISOString(), status: 'pending',
    };
    this._pendingConfirmations.push(confirmation);
    if (this._pendingConfirmations.length > 50) this._pendingConfirmations = this._pendingConfirmations.slice(-50);
    this._logDecision('autonomy-blocked', context.conditionType || 'unknown', context.target || 'unknown',
      `blocked:${actionType}`, `Autonomy level ${this._autonomyLevel} requires confirmation for ${actionType}`);
    return false;
  }

  confirmAction(confirmationId: string): Record<string, any> {
    const idx = this._pendingConfirmations.findIndex(c => c.id === confirmationId);
    if (idx === -1) return { ok: false, error: 'Confirmation not found' };
    const conf = this._pendingConfirmations.splice(idx, 1)[0];
    conf.status = 'confirmed';
    this._logDecision('manual', conf.context?.conditionType || 'unknown', conf.context?.target || 'unknown',
      conf.actionType, `Confirmed by operator (was autonomy-blocked)`);
    return this._executeConfirmedAction(conf);
  }

  denyAction(confirmationId: string): Record<string, any> {
    const idx = this._pendingConfirmations.findIndex(c => c.id === confirmationId);
    if (idx === -1) return { ok: false, error: 'Confirmation not found' };
    const conf = this._pendingConfirmations.splice(idx, 1)[0];
    conf.status = 'denied';
    this._logDecision('manual', conf.context?.conditionType || 'unknown', conf.context?.target || 'unknown',
      'denied', `Denied by operator: ${conf.actionType}`);
    return { ok: true };
  }

  private _executeConfirmedAction(conf: PendingConfirmation): Record<string, any> {
    switch (conf.actionType) {
      case 'nudge': return this.manualNudge(conf.context.sessionId);
      case 'swap': return this.manualSwap(conf.context.sessionId, conf.context.targetModel);
      case 'kill': return this.manualKill(conf.context.sessionId);
      case 'recover': return this.manualRecover(conf.context.taskId);
      default: return { ok: false, error: `Unknown action type: ${conf.actionType}` };
    }
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    const cfg = loadEngineConfig();
    if (!cfg.enabled) { console.log('[OrchestratorEngine] Disabled by config'); return; }
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    const memoryPath = path.join(process.cwd(), 'config', projectId, cfg.decisionMemoryFile);
    this._decisionMemory = new DecisionMemory(memoryPath);
    this._rateLimiter = new RateLimiter(cfg.maxControllerMessagesPerMinute);
    this._autonomyLevel = cfg.autonomyLevel ?? 3;
    this._timer = setInterval(() => this._tick(), 30000);
    setTimeout(() => this._tick(), 5000);
    consensusValidator.registerVoter('orchestrator', (_actionType: string, _ctx: any) => {
      return { approve: true, reason: 'deterministic-decision', confidence: 0.9 };
    });
    consensusValidator.registerVoter('drift-detector', (_actionType: string, ctx: any) => {
      const status = driftDetector.getStatus();
      const taskDrift = status.recentDriftEvents.find((e: any) => e.taskId === ctx.taskId);
      return { approve: !taskDrift, reason: taskDrift ? 'drift-detected' : 'no-drift', confidence: 0.7 };
    });
    consensusValidator.registerVoter('self-healing', (_actionType: string, ctx: any) => {
      const retry = selfHealing.shouldRetryTask(ctx.taskId || 'unknown', { error: _actionType });
      return { approve: true, reason: retry.shouldRetry ? 'retry-available' : 'no-retry', confidence: 0.6 };
    });
    auditTrail.systemEvent('engine-start', { autonomyLevel: this._autonomyLevel });
    console.log('[OrchestratorEngine] Started (deterministic decision engine)');
  }

  stop(): void {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._started = false;
    console.log('[OrchestratorEngine] Stopped');
  }

  pause(): void { this._paused = true; }
  resume(): void { this._paused = false; }

  async _tick(): Promise<void> {
    if (this._paused || this._ticking) return;
    this._ticking = true;
    try {
      await this._evaluate();
      this._runDriftCheck();
    } catch (e: unknown) {
      console.error('[OrchestratorEngine] tick error:', (e as Error).message);
    } finally {
      this._ticking = false;
    }
  }

  private _runDriftCheck(): void {
    try {
      const resultsIndex = this._loadResultsIndex();
      const activeTasks = Object.keys(resultsIndex).filter(id => resultsIndex[id]?.status === 'running');
      if (activeTasks.length === 0) return;
      for (const taskId of activeTasks) { driftDetector.recordCheckpoint(taskId, resultsIndex[taskId]); }
      const alerts = driftDetector.evaluateAll(activeTasks);
      for (const alert of alerts) {
        auditTrail.driftEvent(alert.type, alert.taskId, { message: alert.message });
        memoryManager.setWorking(`drift:${alert.taskId}`, alert);
      }
    } catch { /* best-effort drift check */ }
  }

  async _evaluate(): Promise<void> {
    const cfg = loadEngineConfig();
    const now = Date.now();
    if (appHealth.isHealthy() === false) return;
    const registry = sessionManager.registry;
    const resultsIndex = this._loadResultsIndex();

    for (const [taskId] of this._pendingTaskRecoveries) {
      const info = resultsIndex[taskId];
      if (!info || info.status !== 'running') {
        this._pendingTaskRecoveries.delete(taskId);
        this._conditionTracker.resolve('task_stuck', taskId);
        _clearFsCooldown(taskId);
      }
    }

    const activeIds = new Set<string>();
    for (const entry of registry.values()) { activeIds.add(entry.sessionId); if (entry.taskId) activeIds.add(entry.taskId); }
    for (const [taskId, info] of Object.entries(resultsIndex)) { if (info.status === 'running') activeIds.add(taskId); }

    const seenIds = new Set(registry.keys());
    for (const id of this._previousSessionIds) {
      if (!seenIds.has(id)) {
        for (const [taskId, info] of Object.entries(resultsIndex)) {
          if (info.runSessionKey && info.runSessionKey.includes(id) && info.status === 'running') {
            const isNew = this._conditionTracker.track('session_disappeared', taskId);
            if (isNew) { this._logDecision('deterministic', 'session_disappeared', taskId, 'recover', `Session disappeared for running task ${taskId}`); }
          }
        }
      }
    }
    this._previousSessionIds = seenIds;

    for (const entry of registry.values()) {
      if (entry.isController) continue;
      const age = entry.ageMs;

      if (entry.status === 'healthy' && entry.escalation.level > 0) {
        this._conditionTracker.resolve('stale', entry.sessionId);
        entry.escalation.level = 0;
        this._logDecision('deterministic', 'recovery', entry.sessionId, 'reset', `Session recovered, reset escalation from L${entry.escalation.level}`);
        continue;
      }

      if (entry.status === 'stale') {
        const identified = !!entry.taskId;
        if (identified && resultsIndex[entry.taskId!]?.startedAt) {
          if ((now - resultsIndex[entry.taskId!].startedAt!) < cfg.taskStartGracePeriodMs) continue;
        }
        if (identified && resultsIndex[entry.taskId!]) {
          const taskStatus = resultsIndex[entry.taskId!].status;
          if (taskStatus === 'passed' || taskStatus === 'failed' || taskStatus === 'done' || taskStatus === 'completed') {
            if (entry.escalation.level > 0) {
              entry.escalation.level = 0;
              this._logDecision('deterministic', 'stale', entry.sessionId, 'skip', `Task ${entry.taskId} already ${taskStatus} — skipping escalation`);
            }
            this._conditionTracker.resolve('stale', entry.sessionId);
            continue;
          }
        }
        if (!identified) { this._conditionTracker.track('stale_unidentified', entry.sessionId); continue; }
        this._conditionTracker.track('stale', entry.sessionId);

        if (age >= cfg.killThresholdMs && entry.escalation.level < 3 && entry.escalation.swapCount > 0) {
          if (this._rateLimiter!.canSend() && this._canAutoExecute('kill', { conditionType: 'stale', target: entry.sessionId, sessionId: entry.sessionId, taskId: entry.taskId })) {
            entry.escalation.level = 3; entry.escalation.lastKillAt = now; this._stats.kills++;
            const killMsg = sessionManager._sendKill(entry, cfg);
            this._logDecision('deterministic', 'stale', entry.sessionId, 'kill', `L3: kill after ${formatAge(age)} stale (task: ${entry.taskId || 'unidentified'}, key: ${entry.key})`, killMsg);
            this._rateLimiter!.record(); this._conditionTracker.markActioned('stale', entry.sessionId, 'kill');
            learningLoop.learnFromOrchestratorDecision({ conditionType: 'stale', action: 'kill', source: 'deterministic', target: entry.sessionId, reason: `L3 kill after ${formatAge(age)}` });
          }
          continue;
        }

        if (age >= cfg.swapThresholdMs && entry.escalation.level < 2 && entry.escalation.nudgeCount > 0) {
          const fallback = resolveFallbackModel(entry.model);
          if (this._rateLimiter!.canSend() && this._canAutoExecute('swap', { conditionType: 'stale', target: entry.sessionId, sessionId: entry.sessionId, targetModel: fallback })) {
            entry.escalation.level = 2; entry.escalation.lastSwapAt = now; entry.escalation.swapCount++; this._stats.swaps++;
            const swapMsg = sessionManager._sendSwap(entry, fallback, cfg);
            this._logDecision('deterministic', 'stale', entry.sessionId, 'swap', `L2: swap to ${fallback} after ${formatAge(age)} stale (task: ${entry.taskId || 'unidentified'})`, swapMsg);
            this._rateLimiter!.record(); this._conditionTracker.markActioned('stale', entry.sessionId, 'swap');
            learningLoop.learnFromOrchestratorDecision({ conditionType: 'stale', action: 'swap', source: 'deterministic', target: entry.sessionId, reason: `L2 swap after ${formatAge(age)}` });
          }
          continue;
        }

        if (age >= cfg.staleThresholdMs && entry.escalation.level < 1) {
          const lastNudge = entry.escalation.lastNudgeAt || 0;
          const nudgeCooldown = cfg.messageTemplates?.nudgeCooldownMs || 300000;
          if (now - lastNudge >= nudgeCooldown && this._rateLimiter!.canSend() && this._canAutoExecute('nudge', { conditionType: 'stale', target: entry.sessionId, sessionId: entry.sessionId })) {
            entry.escalation.level = 1; entry.escalation.lastNudgeAt = now; entry.escalation.nudgeCount++; this._stats.nudges++;
            const nudgeMsg = sessionManager._sendNudge(entry, cfg);
            this._logDecision('deterministic', 'stale', entry.sessionId, 'nudge', `L1: nudge after ${formatAge(age)} stale (task: ${entry.taskId || 'unidentified'})`, nudgeMsg);
            this._rateLimiter!.record(); this._conditionTracker.markActioned('stale', entry.sessionId, 'nudge');
            learningLoop.learnFromOrchestratorDecision({ conditionType: 'stale', action: 'nudge', source: 'deterministic', target: entry.sessionId, reason: `L1 nudge after ${formatAge(age)}` });
          }
        }
      }

      if (entry.status === 'orphaned') {
        this._conditionTracker.track('orphaned', entry.sessionId);
        if (age >= cfg.orphanMaxAgeMs) {
          this._stats.purges++;
          this._logDecision('deterministic', 'orphaned', entry.sessionId, 'purge', `Purging orphaned session (age: ${formatAge(age)})`);
          sessionManager._purgeFromIndex([entry.sessionId]);
          registry.delete(entry.sessionId);
          this._conditionTracker.resolve('orphaned', entry.sessionId);
        }
      }

      if (entry.status === 'duplicate') {
        const isNew = this._conditionTracker.track('duplicate', entry.sessionId);
        if (isNew && this._rateLimiter!.canSend()) {
          this._stats.kills++;
          const dupKillMsg = sessionManager._sendKill(entry, cfg);
          this._logDecision('deterministic', 'duplicate', entry.sessionId, 'kill', `Killing duplicate session for task ${entry.taskId}`, dupKillMsg);
          this._rateLimiter!.record(); this._conditionTracker.markActioned('duplicate', entry.sessionId, 'kill');
        }
      }
    }

    for (const [taskId, info] of Object.entries(resultsIndex)) {
      if (info.status !== 'running') continue;
      const hasSession = [...registry.values()].some(e => e.taskId === taskId);
      if (hasSession) continue;
      if (info.startedAt && (now - info.startedAt) < cfg.taskStartGracePeriodMs) continue;
      this._conditionTracker.track('task_stuck', taskId);
      let recoveryAttemptsSoFar = _readFsCooldown(taskId)?.attempts || 0;
      const pendingRecovery = this._pendingTaskRecoveries.get(taskId);
      if (pendingRecovery) {
        const pendingAge = now - pendingRecovery.attemptedAt;
        if (pendingAge < cfg.recoveryTimeoutMs) {
          this._conditionTracker.markActioned('task_stuck', taskId, pendingRecovery.manual ? 'manual-recovery-pending' : 'recovery-pending');
          continue;
        }
        recoveryAttemptsSoFar = pendingRecovery.attempts || 1;
        this._pendingTaskRecoveries.delete(taskId);
        if (recoveryAttemptsSoFar >= cfg.maxRecoveryAttempts) {
          this._logDecision('deterministic', 'task_stuck', taskId, 'auto-fail', `Recovery failed after ${recoveryAttemptsSoFar} attempts — auto-failing task`);
          this._autoFailTask(taskId, info, recoveryAttemptsSoFar);
          this._conditionTracker.resolve('task_stuck', taskId);
          continue;
        }
        this._logDecision('deterministic', 'task_stuck', taskId, 'recovery-timeout', `Recovery attempt ${recoveryAttemptsSoFar} timed out after ${formatAge(cfg.recoveryTimeoutMs)} — retrying`);
      }
      const lastRecovery = this._recoveryCooldowns.get(taskId) || 0;
      const fsCooldown = _readFsCooldown(taskId);
      const lastRecoveryEffective = Math.max(lastRecovery, fsCooldown?.at || 0);
      const cooldownElapsed = now - lastRecoveryEffective >= cfg.recoveryCooldownMs;
      if (cooldownElapsed && this._rateLimiter!.canSend() && this._canAutoExecute('recover', { conditionType: 'task_stuck', target: taskId, taskId })) {
        this._recoveryCooldowns.set(taskId, now);
        const respawnMsg = this._respawnTask(taskId, info, cfg);
        if (respawnMsg) {
          this._stats.recoveries++;
          this._pendingTaskRecoveries.set(taskId, { attemptedAt: now, reason: 'auto-stuck-recovery', manual: false, attempts: recoveryAttemptsSoFar + 1 });
          this._logDecision('deterministic', 'task_stuck', taskId, 'respawn', `Respawning stuck task (attempt ${recoveryAttemptsSoFar + 1}/${cfg.maxRecoveryAttempts}, model: ${info.model})`, respawnMsg);
          this._rateLimiter!.record(); this._conditionTracker.markActioned('task_stuck', taskId, 'respawn');
          _writeFsCooldown(taskId, { at: now, attempts: recoveryAttemptsSoFar + 1 });
        } else {
          this._conditionTracker.resolve('task_stuck', taskId);
        }
      }
    }

    this._conditionTracker.prune(activeIds);
  }

  private _respawnTask(taskId: string, resultInfo: Record<string, any>, cfg: any): string | null {
    try {
      const sessions = listSessionsSync();
      const rsk = resultInfo.runSessionKey || '';
      const existing = sessions.find((s: any) => s.key?.includes(taskId) || s.taskId === taskId || (rsk && s.key === rsk) || (rsk && s.sessionId && rsk.includes(s.sessionId)));
      if (existing) {
        this._pendingTaskRecoveries.delete(taskId);
        this._conditionTracker.resolve('task_stuck', taskId);
        this._logDecision('deterministic', 'task_stuck', taskId, 'skip-respawn', `Session ${existing.key || existing.sessionId} already exists for task (invisible to dashboard registry). Skipping respawn.`);
        return null;
      }
    } catch (e: unknown) { console.warn('[OrchestratorEngine] listSessions check failed:', (e as Error).message); }
    const message = ['[dashboard-run]', `Resume task: ${taskId}`, `Model: ${resultInfo.model || 'anthropic/claude-sonnet-4-6'}`, '', 'IMPORTANT: This is a RESUME, not a fresh start.', `1. Read ${cfg.workspace}/results/${taskId}.json for current progress`, `2. Read ${cfg.workspace}/reports-md/${taskId}.md for partial report (if any)`, '3. Continue from where the previous session left off', '4. Do NOT restart testing from scratch'].join('\n');
    const controllerSessionId = getControllerSessionId();
    if (!controllerSessionId) { console.warn('[OrchestratorEngine] No controller session — cannot respawn task', taskId); return null; }
    try {
      const logPath = bridgeLogPath();
      fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] [engine] Respawning stuck task: ${taskId}\n`);
      spawnAgent(controllerSessionId, message, logPath);
      return message;
    } catch (e: unknown) { console.error('[OrchestratorEngine] Failed to respawn task:', taskId, (e as Error).message); return null; }
  }

  private _autoFailTask(taskId: string, resultInfo: Record<string, any>, attemptCount: number): void {
    const resultsFile = path.join(resultsDir(), `${taskId}.json`);
    try {
      let data: any = {};
      if (fs.existsSync(resultsFile)) { data = JSON.parse(fs.readFileSync(resultsFile, 'utf8')); }
      data.status = 'failed';
      data.lastLog = `Recovery failed: ${attemptCount} respawn attempts timed out`;
      data.updatedAt = new Date().toISOString();
      const findings = data.findings || [];
      if (!findings.find((f: any) => f.id === 'orchestrator-recovery')) {
        findings.push({
          id: 'orchestrator-recovery', severity: 'error', title: 'Orchestrator recovery exhausted',
          description: `Task was stuck with no active session. ${attemptCount} respawn attempts each timed out after ${Math.round((loadEngineConfig().recoveryTimeoutMs || 180000) / 1000)}s. Auto-failed by orchestrator engine.`,
          createdAt: new Date().toISOString(),
        });
      }
      data.findings = findings;
      fs.writeFileSync(resultsFile, JSON.stringify(data, null, 2) + '\n');
      try { const logPath = bridgeLogPath(); fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] [engine] Auto-failed task ${taskId} after ${attemptCount} recovery attempts\n`); } catch { /* best-effort */ }
    } catch (e: unknown) { console.error('[OrchestratorEngine] Failed to auto-fail task:', taskId, (e as Error).message); }
  }

  async consultAI(patternKey: string, description: string, availableActions?: string[]): Promise<Record<string, any> | null> {
    const cfg = loadEngineConfig();
    if (!cfg.aiConsultationEnabled) return null;
    const memorized = this._decisionMemory?.lookup(patternKey);
    if (memorized) {
      memorized.usedCount = (memorized.usedCount || 0) + 1;
      this._decisionMemory!.incrementUsage(patternKey);
      this._logDecision('memory-recall', 'unknown', patternKey, memorized.action, `From memory: ${memorized.reason} (used ${memorized.usedCount}x)`);
      return memorized;
    }
    try {
      const prompt = ['You are a QA platform orchestrator. An unrecognized condition occurred.', '', `Pattern: ${patternKey}`, `Description: ${description}`, `Available actions: ${(availableActions || ['nudge', 'swap', 'kill', 'respawn', 'purge', 'ignore']).join(', ')}`, '', 'Respond with ONLY: action_name | one-line reason'].join('\n');
      const response = await askWithGatewayFallback(null, prompt, { taskType: 'reasoning' });
      const text = response?.choices?.[0]?.message?.content?.trim();
      if (!text) return null;
      const parts = text.split('|').map((s: string) => s.trim());
      const action = parts[0]?.toLowerCase()?.replace(/\s+/g, '_') || 'ignore';
      const reason = parts[1] || 'AI recommended';
      this._stats.aiConsultations++;
      const recommendation: PendingReview = { id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, patternKey, description, action, reason: `AI recommended: ${reason}`, createdAt: new Date().toISOString(), status: 'pending' };
      this._pendingReview.push(recommendation);
      if (this._pendingReview.length > 50) this._pendingReview = this._pendingReview.slice(-50);
      this._logDecision('ai-consulted', 'unknown', patternKey, `pending:${action}`, `AI recommends: ${action} — ${reason} (awaiting approval)`);
      return recommendation;
    } catch (e: unknown) { console.error('[OrchestratorEngine] AI consultation failed:', (e as Error).message); return null; }
  }

  approveRecommendation(id: string): Record<string, any> {
    const idx = this._pendingReview.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: 'Recommendation not found' };
    const rec = this._pendingReview[idx]; rec.status = 'approved'; this._pendingReview.splice(idx, 1);
    if (this._decisionMemory) { this._decisionMemory.store(rec.patternKey, rec.action, rec.reason); }
    this._logDecision('approved', 'unknown', rec.patternKey, rec.action, `Approved: ${rec.reason}`);
    return { ok: true, action: rec.action, patternKey: rec.patternKey };
  }

  rejectRecommendation(id: string): Record<string, any> {
    const idx = this._pendingReview.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: 'Recommendation not found' };
    const rec = this._pendingReview[idx]; rec.status = 'rejected'; this._pendingReview.splice(idx, 1);
    if (this._decisionMemory) { this._decisionMemory.store(rec.patternKey, 'ignore', `Rejected by operator: ${rec.reason}`); }
    this._logDecision('rejected', 'unknown', rec.patternKey, 'ignore', `Rejected: ${rec.reason}`);
    return { ok: true };
  }

  manualNudge(sessionId: string): Record<string, any> {
    const result = sessionManager.nudge(sessionId);
    if (result.ok) { this._stats.nudges++; this._logDecision('manual', 'stale', sessionId, 'nudge', 'Manual nudge'); }
    return result;
  }

  manualSwap(sessionId: string, targetModel: string): Record<string, any> {
    const result = sessionManager.swapModel(sessionId, targetModel);
    if (result.ok) { this._stats.swaps++; this._logDecision('manual', 'stale', sessionId, 'swap', `Manual swap to ${targetModel}`); }
    return result;
  }

  manualKill(sessionId: string): Record<string, any> {
    const result = sessionManager.killSession(sessionId);
    if (result.ok) { this._stats.kills++; this._logDecision('manual', 'kill', sessionId, 'kill', 'Manual kill'); }
    return result;
  }

  manualRecover(taskId: string): Record<string, any> {
    const cfg = loadEngineConfig();
    const resultsIndex = this._loadResultsIndex();
    const info = resultsIndex[taskId];
    if (!info) return { ok: false, error: `Task ${taskId} not found in results` };
    this._stats.recoveries++;
    const now = Date.now();
    this._recoveryCooldowns.set(taskId, now);
    this._pendingTaskRecoveries.set(taskId, { attemptedAt: now, reason: 'manual-recovery', manual: true, attempts: 1 });
    this._logDecision('manual', 'task_stuck', taskId, 'respawn', 'Manual recovery');
    this._respawnTask(taskId, info, cfg);
    return { ok: true };
  }

  private _logDecision(source: string, conditionType: string, target: string, action: string, reason: string, message: string | null = null): void {
    const entry: DecisionLogEntry = { ts: Date.now(), source, conditionType, target, action, reason };
    if (message) entry.message = message;
    this._decisionLog.unshift(entry);
    if (this._decisionLog.length > 200) this._decisionLog.length = 200;
  }

  private _loadResultsIndex(): Record<string, any> {
    const dir = resultsDir();
    const index: Record<string, any> = {};
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'system.json');
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
          const taskId = file.replace('.json', '');
          index[taskId] = {
            status: data.status || 'idle', runSessionKey: data.runSessionKey || null,
            model: data.model || null, startedAt: data.startedAt ? Date.parse(data.startedAt) : null,
            updatedAt: data.updatedAt ? Date.parse(data.updatedAt) : null,
            isAutoFail: !!(data.findings || []).find((f: any) => f.id === 'stale-timeout'),
          };
        } catch { /* skip corrupt files */ }
      }
    } catch { /* results dir may not exist */ }
    return index;
  }

  getStatus() {
    const perms = this._getAutonomyPerms();
    return {
      started: this._started, paused: this._paused, stats: { ...this._stats },
      autonomy: { level: this._autonomyLevel, name: perms.name, permissions: perms },
      recentDecisions: this._decisionLog.slice(0, 50),
      activeConditions: this._conditionTracker.getAll(),
      pendingReview: [...this._pendingReview],
      pendingConfirmations: [...this._pendingConfirmations],
      memorySize: this._decisionMemory?.size || 0,
      rateLimit: { remaining: this._rateLimiter?.remaining ?? 0, maxPerMinute: this._rateLimiter?.maxPerMinute ?? 6 },
      decisionTree: this._buildDecisionTreeSnapshot(),
    };
  }

  private _buildDecisionTreeSnapshot() {
    const cfg = loadEngineConfig();
    const registry = sessionManager.registry;
    const resultsIndex = this._loadResultsIndex();
    const now = Date.now();
    const nodes: any[] = [];

    for (const entry of registry.values()) {
      if (entry.isController) continue;
      const age = entry.ageMs || 0;
      const level = entry.escalation?.level || 0;
      let nextAction: string | null = null; let nextThresholdMs: number | null = null; let progress = 0;
      if (entry.status === 'healthy') { nextAction = 'monitoring'; nextThresholdMs = cfg.staleThresholdMs; progress = Math.min(100, Math.round((age / cfg.staleThresholdMs) * 100)); }
      else if (entry.status === 'stale') {
        if (!entry.taskId) { nextAction = 'skipped (no taskId)'; progress = 0; }
        else if (level < 1) { nextAction = 'nudge'; nextThresholdMs = cfg.staleThresholdMs; progress = Math.min(100, Math.round((age / cfg.staleThresholdMs) * 100)); }
        else if (level < 2) { nextAction = 'swap'; nextThresholdMs = cfg.swapThresholdMs; progress = Math.min(100, Math.round((age / cfg.swapThresholdMs) * 100)); }
        else if (level < 3) { nextAction = 'kill'; nextThresholdMs = cfg.killThresholdMs; progress = Math.min(100, Math.round((age / cfg.killThresholdMs) * 100)); }
        else { nextAction = 'killed'; progress = 100; }
      } else if (entry.status === 'orphaned') { nextAction = 'purge'; nextThresholdMs = cfg.orphanMaxAgeMs; progress = Math.min(100, Math.round((age / cfg.orphanMaxAgeMs) * 100)); }
      else if (entry.status === 'duplicate') { nextAction = 'kill-duplicate'; progress = 100; }
      nodes.push({ sessionId: entry.sessionId, key: entry.key, taskId: entry.taskId, model: entry.model, status: entry.status, ageMs: age, level, nextAction, nextThresholdMs, progress, nudgeCount: entry.escalation?.nudgeCount || 0, swapCount: entry.escalation?.swapCount || 0 });
    }

    for (const [taskId, info] of Object.entries(resultsIndex)) {
      if (info.status !== 'running') continue;
      const hasSession = nodes.some((n: any) => n.taskId === taskId);
      if (!hasSession) {
        const lastRecovery = this._recoveryCooldowns.get(taskId) || 0;
        const cooldownRemaining = Math.max(0, cfg.recoveryCooldownMs - (now - lastRecovery));
        const pendingRecovery = this._pendingTaskRecoveries.get(taskId) || null;
        const pendingAttempts = pendingRecovery?.attempts || 0;
        let stuckNextAction: string; let stuckProgress: number;
        if (pendingRecovery) {
          const pendingAge = now - pendingRecovery.attemptedAt;
          const timeoutRemaining = Math.max(0, cfg.recoveryTimeoutMs - pendingAge);
          const timeoutPct = Math.min(100, Math.round((pendingAge / cfg.recoveryTimeoutMs) * 100));
          stuckNextAction = pendingRecovery.manual ? `awaiting manual recovery (attempt ${pendingAttempts}/${cfg.maxRecoveryAttempts}, timeout ${Math.ceil(timeoutRemaining / 1000)}s)` : `awaiting recovery (attempt ${pendingAttempts}/${cfg.maxRecoveryAttempts}, timeout ${Math.ceil(timeoutRemaining / 1000)}s)`;
          stuckProgress = timeoutPct;
        } else if (cooldownRemaining > 0) { stuckNextAction = `respawn (cooldown ${Math.ceil(cooldownRemaining / 1000)}s)`; stuckProgress = Math.round((1 - cooldownRemaining / cfg.recoveryCooldownMs) * 100); }
        else { stuckNextAction = 'respawn'; stuckProgress = 100; }
        nodes.push({ sessionId: null, key: null, taskId, model: info.model, status: 'stuck', ageMs: info.startedAt ? now - info.startedAt : 0, level: 0, nextAction: stuckNextAction, nextThresholdMs: null, progress: stuckProgress, nudgeCount: 0, swapCount: 0, recoveryAttempts: pendingAttempts, maxRecoveryAttempts: cfg.maxRecoveryAttempts });
      }
    }

    return { nodes, thresholds: { staleMs: cfg.staleThresholdMs, swapMs: cfg.swapThresholdMs, killMs: cfg.killThresholdMs, orphanMs: cfg.orphanMaxAgeMs, recoveryCooldownMs: cfg.recoveryCooldownMs, recoveryTimeoutMs: cfg.recoveryTimeoutMs, maxRecoveryAttempts: cfg.maxRecoveryAttempts } };
  }
}

const orchestratorEngine = new OrchestratorEngine();
registry.register('orchestratorEngine', () => orchestratorEngine);
export default orchestratorEngine;

// Exported for unit testing
export { ConditionTracker, DecisionMemory, RateLimiter, OrchestratorEngine, AUTONOMY_LEVELS };
