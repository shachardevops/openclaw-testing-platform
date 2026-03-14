import fs from 'fs';
import path from 'path';
import os from 'os';
import type { MessageTemplates } from '@/types/config';
import { getControllerSessionId, listSessions, spawnAgent, invalidateSessionsCache } from './openclaw';
import { bridgeLogPath, resultsDir } from './config';
import { getProjectConfig } from './project-loader';
import appHealth from './app-health';
import { registry } from './service-registry';

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw/agents/main/sessions');
const SESSIONS_INDEX = path.join(SESSIONS_DIR, 'sessions.json');

const DEFAULT_CONFIG = {
  scanIntervalMs: 20000,
  maxActiveSessions: 4,
  escalation: {
    staleThresholdMs: 180000,
    nudgeCooldownMs: 300000,
    swapThresholdMs: 480000,
    killThresholdMs: 900000,
  },
  orphanMaxAgeMs: 1800000,
};

function loadManagerConfig() {
  try {
    const { project } = getProjectConfig();
    const sm = project.sessionManager || {};
    return {
      ...DEFAULT_CONFIG,
      ...sm,
      escalation: { ...DEFAULT_CONFIG.escalation, ...(sm.escalation || {}) },
      workspace: project.workspace || process.cwd(),
      messageTemplates: project.messageTemplates || {},
    };
  } catch {
    return { ...DEFAULT_CONFIG, workspace: process.cwd(), messageTemplates: {} as MessageTemplates };
  }
}

interface ResultsIndexEntry {
  status: string;
  runSessionKey: string | null;
  model: string | null;
  startedAt: number | null;
  updatedAt: number | null;
  isAutoFail: boolean;
}

function loadResultsIndex(): Record<string, ResultsIndexEntry> {
  const dir = resultsDir();
  const index: Record<string, ResultsIndexEntry> = {};
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
          isAutoFail: !!(data.findings || []).find((f: any) => f.id === 'stale-timeout'),
        };
      } catch { /* skip corrupt files */ }
    }
  } catch { /* results dir may not exist */ }
  return index;
}

function readSessionHealth(sessionId: string): { lastActivityTs: number; fileSize: number } | null {
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    return { lastActivityTs: stat.mtimeMs, fileSize: stat.size };
  } catch {
    return null;
  }
}

const _sessionTaskCache = new Map<string, { taskId: string | null; checkedAt: number }>();
const SESSION_TASK_CACHE_TTL = 120000;

function resolveTaskFromSessionContent(sessionId: string, taskIds: string[]): string | null {
  const now = Date.now();
  const cached = _sessionTaskCache.get(sessionId);
  if (cached && (now - cached.checkedAt) < SESSION_TASK_CACHE_TTL) {
    return cached.taskId;
  }
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return null;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    const head = buf.toString('utf8', 0, bytesRead);
    for (const tid of taskIds) {
      if (head.includes(`task: ${tid}`) || head.includes(`task:${tid}`) || head.includes(`"${tid}"`)) {
        _sessionTaskCache.set(sessionId, { taskId: tid, checkedAt: now });
        return tid;
      }
    }
    _sessionTaskCache.set(sessionId, { taskId: null, checkedAt: now });
  } catch { /* ignore */ }
  return null;
}

function getModelFamily(model: string | null): string {
  if (!model) return 'unknown';
  if (/anthropic|claude/i.test(model)) return 'anthropic';
  if (/openai|gpt|codex/i.test(model)) return 'openai';
  return 'unknown';
}

function resolveFallbackModel(currentModel: string | null): string {
  const family = getModelFamily(currentModel);
  if (family === 'anthropic') return 'openai-codex/gpt-5.3-codex';
  return 'anthropic/claude-sonnet-4-6';
}

function formatAge(ms: number): string {
  if (!ms || ms <= 0) return '0s';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

interface EscalationState {
  level: number;
  lastNudgeAt: number | null;
  lastSwapAt: number | null;
  lastKillAt: number | null;
  nudgeCount: number;
  swapCount: number;
}

interface RegistryEntry {
  sessionId: string;
  key: string;
  kind: string;
  model: string;
  taskId: string | null;
  updatedAt: number;
  lastActivityTs: number;
  ageMs: number;
  status: string;
  isController: boolean;
  escalation: EscalationState;
}

interface Issue {
  type: string;
  sessionId: string;
  taskId: string | null;
  message: string;
  ts: number;
}

interface ActionLogEntry {
  action: string;
  sessionId: string | null;
  taskId: string | null;
  result: string;
  ts: number;
  target?: string;
  reason?: string;
}

interface DebugLogEntry {
  ts: number;
  level: string;
  message: string;
}

class SessionManager {
  registry: Map<string, RegistryEntry> = new Map();
  issues: Issue[] = [];
  actionLog: ActionLogEntry[] = [];
  debugLog: DebugLogEntry[] = [];
  lastScanAt: number | null = null;
  scanCount: number = 0;
  escalationPaused: boolean = false;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _scanning: boolean = false;
  private _started: boolean = false;
  private _lastError: DebugLogEntry | null = null;
  private _errorCount: number = 0;
  private _consecutiveEmptyScans: number = 0;
  private _previousSessionIds: Set<string> = new Set();

  _log(level: string, message: string): void {
    const entry: DebugLogEntry = { ts: Date.now(), level, message };
    this.debugLog.unshift(entry);
    if (this.debugLog.length > 100) this.debugLog.length = 100;
    if (level === 'error') {
      this._lastError = entry;
      this._errorCount++;
    }
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    const cfg = loadManagerConfig();
    this._timer = setInterval(() => this.scan(), cfg.scanIntervalMs || 10000);
    setTimeout(() => this.scan(), 2000);
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._started = false;
  }

  async scan(): Promise<void> {
    if (this._scanning) {
      this._log('debug', 'Scan skipped (already scanning)');
      return;
    }
    this._scanning = true;
    const t0 = Date.now();
    try {
      await this._doScan();
      this._log('debug', `Scan completed in ${Date.now() - t0}ms, ${this.registry.size} sessions`);
    } catch (e: unknown) {
      this._log('error', `Scan crashed after ${Date.now() - t0}ms: ${(e as Error).message}\n${(e as Error).stack}`);
      console.error('[SessionManager] scan error:', (e as Error).message, (e as Error).stack);
    } finally {
      this._scanning = false;
    }
  }

  async _doScan(): Promise<void> {
    const cfg = loadManagerConfig();
    const now = Date.now();

    let t1 = Date.now();
    const controllerSessionId = getControllerSessionId();
    this._log('debug', `getControllerSessionId: ${controllerSessionId || 'null'} (${Date.now() - t1}ms)`);

    t1 = Date.now();
    const sessions = await listSessions();
    const listDuration = Date.now() - t1;
    this._log('debug', `listSessions: ${sessions.length} sessions (${listDuration}ms)`);

    if (sessions.length === 0) {
      this._consecutiveEmptyScans++;
      if (this._consecutiveEmptyScans <= 3 || this._consecutiveEmptyScans % 10 === 0) {
        this._log('warn', `listSessions returned 0 sessions (${this._consecutiveEmptyScans} consecutive empty scans, took ${listDuration}ms)`);
      }
    } else {
      this._consecutiveEmptyScans = 0;
    }

    t1 = Date.now();
    const resultsIndex = loadResultsIndex();
    this._log('debug', `loadResultsIndex: ${Object.keys(resultsIndex).length} results (${Date.now() - t1}ms)`);

    const keyToTask: Record<string, string> = {};
    for (const [taskId, info] of Object.entries(resultsIndex)) {
      if (info.runSessionKey) {
        keyToTask[info.runSessionKey] = taskId;
      }
    }

    const seenIds = new Set<string>();

    for (const s of sessions) {
      if (!s || !s.sessionId) continue;
      seenIds.add(s.sessionId);

      const isController = s.sessionId === controllerSessionId || s.key === 'agent:main:main';
      const updatedAt = Number(s.updatedAt || 0);
      const ageMs = updatedAt > 0 ? Math.max(0, now - updatedAt) : Number.MAX_SAFE_INTEGER;

      let taskId: string | null = null;
      if (s.key && keyToTask[s.key]) {
        taskId = keyToTask[s.key];
      } else {
        for (const [tid, info] of Object.entries(resultsIndex)) {
          if (info.runSessionKey && s.sessionId && info.runSessionKey.includes(s.sessionId)) {
            taskId = tid;
            break;
          }
        }
      }

      if (!taskId && !isController && s.key) {
        const keyLower = s.key.toLowerCase();
        for (const tid of Object.keys(resultsIndex)) {
          if (keyLower.includes(tid.toLowerCase())) {
            taskId = tid;
            break;
          }
        }
      }

      if (!taskId && !isController && s.sessionId) {
        const runningTaskIds = Object.entries(resultsIndex)
          .filter(([, info]) => info.status === 'running')
          .map(([tid]) => tid);
        if (runningTaskIds.length > 0) {
          taskId = resolveTaskFromSessionContent(s.sessionId, runningTaskIds);
        }
      }

      if (!taskId && !isController) {
        const runningTasks = Object.entries(resultsIndex)
          .filter(([tid, info]) => info.status === 'running' && !Object.values(keyToTask).includes(tid));
        const unmatchedSessions = sessions.filter(sess =>
          sess.sessionId !== controllerSessionId &&
          sess.key !== 'agent:main:main' &&
          !keyToTask[sess.key || ''] &&
          sess.sessionId === s.sessionId
        );
        if (runningTasks.length === 1 && unmatchedSessions.length > 0) {
          const [tid, info] = runningTasks[0];
          if (info.startedAt) {
            const taskStartMs = typeof info.startedAt === 'number' ? info.startedAt : Date.parse(String(info.startedAt));
            const sessionCreatedMs = updatedAt || 0;
            if (Math.abs(sessionCreatedMs - taskStartMs) < 120000 || sessionCreatedMs > taskStartMs) {
              taskId = tid;
            }
          }
        }
      }

      if (taskId && s.key && !resultsIndex[taskId]?.runSessionKey) {
        try {
          const resultPath = path.join(resultsDir(), `${taskId}.json`);
          if (fs.existsSync(resultPath)) {
            const resultData = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
            if (!resultData.runSessionKey) {
              resultData.runSessionKey = s.key;
              fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2));
              this._log('info', `Wrote runSessionKey=${s.key} to ${taskId}.json`);
            }
          }
        } catch { /* best-effort */ }
      }

      let lastActivityTs = updatedAt;
      const health = readSessionHealth(s.sessionId);
      if (health && health.lastActivityTs > lastActivityTs) {
        lastActivityTs = health.lastActivityTs;
      }
      const activityAge = lastActivityTs > 0 ? now - lastActivityTs : ageMs;

      let status = 'healthy';
      const taskInfo = taskId ? resultsIndex[taskId] : null;

      if (isController) {
        status = 'healthy';
      } else if (!taskId && ageMs >= (cfg.orphanMaxAgeMs || 1800000)) {
        status = 'orphaned';
      } else if (taskInfo && (taskInfo.status === 'passed' || taskInfo.status === 'done' || taskInfo.status === 'completed')) {
        status = 'healthy';
      } else if (taskInfo && taskInfo.status === 'failed') {
        if (taskInfo.isAutoFail) {
          status = activityAge >= (cfg.escalation.staleThresholdMs || 180000) ? 'stale' : 'healthy';
        } else {
          status = 'healthy';
        }
      } else if (activityAge >= (cfg.escalation.staleThresholdMs || 180000)) {
        status = 'stale';
      }

      const existing = this.registry.get(s.sessionId);
      const entry: RegistryEntry = {
        sessionId: s.sessionId,
        key: s.key || '',
        kind: s.kind || '',
        model: s.model || '',
        taskId,
        updatedAt,
        lastActivityTs,
        ageMs,
        status,
        isController,
        escalation: existing?.escalation || {
          level: 0,
          lastNudgeAt: null,
          lastSwapAt: null,
          lastKillAt: null,
          nudgeCount: 0,
          swapCount: 0,
        },
      };

      this.registry.set(s.sessionId, entry);
    }

    for (const id of this.registry.keys()) {
      if (!seenIds.has(id)) this.registry.delete(id);
    }

    const matchedTaskIds = new Set(
      [...this.registry.values()].filter(e => e.taskId).map(e => e.taskId!)
    );
    const unmatchedRunning = Object.entries(resultsIndex)
      .filter(([tid, info]) => info.status === 'running' && !matchedTaskIds.has(tid));
    const unmatchedSessions = [...this.registry.values()]
      .filter(e => !e.taskId && !e.isController);

    if (unmatchedRunning.length > 0 && unmatchedSessions.length > 0) {
      for (const session of unmatchedSessions) {
        let bestMatch: string | null = null;
        let bestDelta = Infinity;
        for (const [tid, info] of unmatchedRunning) {
          if (matchedTaskIds.has(tid)) continue;
          if (info.startedAt) {
            const delta = Math.abs(session.updatedAt - info.startedAt);
            if (delta < bestDelta && delta < 600000) {
              bestDelta = delta;
              bestMatch = tid;
            }
          }
        }
        if (!bestMatch && unmatchedRunning.length === 1 && !matchedTaskIds.has(unmatchedRunning[0][0])) {
          bestMatch = unmatchedRunning[0][0];
        }
        if (bestMatch) {
          session.taskId = bestMatch;
          matchedTaskIds.add(bestMatch);
          this.registry.set(session.sessionId, session);
        }
      }
    }

    const taskSessions: Record<string, RegistryEntry[]> = {};
    for (const entry of this.registry.values()) {
      if (!entry.taskId || entry.isController) continue;
      if (!taskSessions[entry.taskId]) taskSessions[entry.taskId] = [];
      taskSessions[entry.taskId].push(entry);
    }
    for (const [, entries] of Object.entries(taskSessions)) {
      if (entries.length > 1) {
        entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        for (let i = 1; i < entries.length; i++) {
          entries[i].status = 'duplicate';
        }
      }
    }

    this.issues = [];
    for (const entry of this.registry.values()) {
      if (entry.status === 'stale') {
        this.issues.push({
          type: 'stale',
          sessionId: entry.sessionId,
          taskId: entry.taskId,
          message: `${entry.taskId || entry.key}: stale ${formatAge(entry.ageMs)}, escalation L${entry.escalation.level}`,
          ts: now,
        });
      }
      if (entry.status === 'orphaned') {
        this.issues.push({
          type: 'orphaned',
          sessionId: entry.sessionId,
          taskId: null,
          message: `${entry.key || entry.sessionId.slice(0, 12)}: orphaned, age ${formatAge(entry.ageMs)}`,
          ts: now,
        });
      }
      if (entry.status === 'duplicate') {
        this.issues.push({
          type: 'duplicate',
          sessionId: entry.sessionId,
          taskId: entry.taskId,
          message: `Duplicate session for ${entry.taskId}: ${entry.key || entry.sessionId.slice(0, 12)}`,
          ts: now,
        });
      }
    }

    this._previousSessionIds = seenIds;

    const appIsDown = appHealth.isHealthy() === false;
    if (appIsDown) {
      this._log('info', 'Escalation skipped: target app is down');
    }

    this.lastScanAt = now;
    this.scanCount++;
  }

  _logAction(action: string, sessionId: string | null, taskId: string | null, result: string): void {
    this.actionLog.unshift({ action, sessionId, taskId, result, ts: Date.now() });
    if (this.actionLog.length > 50) this.actionLog.length = 50;
  }

  _sendToController(message: string, cfg: any): number | null {
    const controllerSessionId = getControllerSessionId();
    if (!controllerSessionId) {
      this._log('warn', `_sendToController: no controller session ID, message dropped: ${message.split('\n')[0]}`);
      return null;
    }

    const msgKey = message.split('\n')[0];
    const throttleFile = path.join(resultsDir(), '.last-controller-messages.json');
    const now = Date.now();
    let recent: Array<{ key: string; ts: number }> = [];
    try {
      if (fs.existsSync(throttleFile)) {
        recent = JSON.parse(fs.readFileSync(throttleFile, 'utf8'));
        if (!Array.isArray(recent)) recent = [];
      }
    } catch { recent = []; }

    const recentCount = recent.filter(m => now - m.ts < 60000).length;
    if (recentCount >= 2) {
      this._log('debug', `_sendToController throttled (global ${recentCount}/2 per min): ${msgKey}`);
      return null;
    }

    const duplicate = recent.find(m => m.key === msgKey && now - m.ts < 300000);
    if (duplicate) {
      this._log('debug', `_sendToController throttled (dedup within 5min): ${msgKey}`);
      return null;
    }

    try {
      const logPath = bridgeLogPath();
      fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] [session-mgr] ${msgKey}\n`);
      const child = spawnAgent(controllerSessionId, message, logPath);
      this._log('info', `Sent to controller (pid ${child.pid}): ${msgKey}`);

      recent.push({ key: msgKey, ts: now });
      if (recent.length > 20) recent = recent.slice(-20);
      try {
        fs.writeFileSync(throttleFile, JSON.stringify(recent, null, 2));
      } catch { /* best-effort */ }

      return child.pid || null;
    } catch (e: unknown) {
      this._log('error', `_sendToController failed: ${(e as Error).message}`);
      console.error('[SessionManager] send to controller failed:', (e as Error).message);
      return null;
    }
  }

  _purgeFromIndex(sessionIds: string[]): number {
    const idsToRemove = new Set(sessionIds);
    let removed = 0;
    try {
      if (!fs.existsSync(SESSIONS_INDEX)) return 0;
      const index = JSON.parse(fs.readFileSync(SESSIONS_INDEX, 'utf8'));
      if (!index || typeof index !== 'object') return 0;

      for (const [key, val] of Object.entries(index) as [string, any][]) {
        const sid = val?.sessionId || val?.id || key;
        if (idsToRemove.has(sid)) {
          delete index[key];
          removed++;
        }
      }

      if (removed > 0) {
        fs.writeFileSync(SESSIONS_INDEX, JSON.stringify(index, null, 2) + '\n');
        this._log('info', `_purgeFromIndex: removed ${removed} entries from sessions.json`);

        for (const id of sessionIds) {
          const jsonlPath = path.join(SESSIONS_DIR, `${id}.jsonl`);
          try {
            if (fs.existsSync(jsonlPath)) fs.rmSync(jsonlPath, { force: true });
          } catch { /* best-effort */ }
        }

        invalidateSessionsCache();
      }

      return removed;
    } catch (e: unknown) {
      this._log('error', `_purgeFromIndex: ${(e as Error).message}`);
      return removed;
    }
  }

  _isTaskTerminal(taskId: string): boolean {
    try {
      const resultPath = path.join(resultsDir(), `${taskId}.json`);
      if (!fs.existsSync(resultPath)) return false;
      const data = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      const s = data.status;
      return s === 'passed' || s === 'failed' || s === 'done' || s === 'completed' || s === 'cancelled';
    } catch {
      return false;
    }
  }

  _sendNudge(entry: RegistryEntry, cfg: any): string | null {
    if (!entry.taskId) {
      this._log('debug', `_sendNudge skipped: no taskId for session ${entry.sessionId}`);
      return null;
    }
    if (this._isTaskTerminal(entry.taskId)) {
      this._log('debug', `_sendNudge skipped: task ${entry.taskId} is terminal`);
      return null;
    }
    const tpl = cfg.messageTemplates?.nudge || '[dashboard-nudge]\nTask {taskId} stuck. Continue from last checkpoint.';
    const msg = tpl
      .replace(/\{sessionId\}/g, entry.sessionId)
      .replace(/\{taskId\}/g, entry.taskId)
      .replace(/\{staleMinutes\}/g, String(Math.round((entry.ageMs || 0) / 60000)))
      .replace(/\{model\}/g, entry.model || 'unknown')
      .replace(/\{workspace\}/g, cfg.workspace || '');
    this._sendToController(msg, cfg);
    return msg;
  }

  _sendSwap(entry: RegistryEntry, targetModel: string, cfg: any): string | null {
    if (!entry.taskId) {
      this._log('debug', `_sendSwap skipped: no taskId for session ${entry.sessionId}`);
      return null;
    }
    if (this._isTaskTerminal(entry.taskId)) {
      this._log('debug', `_sendSwap skipped: task ${entry.taskId} is terminal`);
      return null;
    }
    const tpl = cfg.messageTemplates?.modelSwap || '[dashboard-swap]\nSwap model for task {taskId} to {fallbackModel}.';
    const msg = tpl
      .replace(/\{sessionId\}/g, entry.sessionId)
      .replace(/\{taskId\}/g, entry.taskId)
      .replace(/\{fallbackModel\}/g, targetModel)
      .replace(/\{errorReason\}/g, 'stale session')
      .replace(/\{workspace\}/g, cfg.workspace || '');
    this._sendToController(msg, cfg);
    return msg;
  }

  _sendKill(entry: RegistryEntry, cfg: any): string | null {
    if (!entry.taskId) {
      this._log('debug', `_sendKill skipped: no taskId for session ${entry.sessionId}`);
      return null;
    }
    if (this._isTaskTerminal(entry.taskId)) {
      this._log('debug', `_sendKill skipped: task ${entry.taskId} is terminal`);
      return null;
    }
    const tpl = cfg.messageTemplates?.kill ||
      '[dashboard-kill]\nKill session for task {taskId}. Session {sessionId}. Update results to failed.';
    const msg = tpl
      .replace(/\{sessionId\}/g, entry.sessionId)
      .replace(/\{taskId\}/g, entry.taskId)
      .replace(/\{workspace\}/g, cfg.workspace || '');
    this._sendToController(msg, cfg);
    return msg;
  }

  nudge(sessionId: string): Record<string, any> {
    const entry = this.registry.get(sessionId);
    if (!entry) return { ok: false, error: 'Session not found' };
    const cfg = loadManagerConfig();
    entry.escalation.lastNudgeAt = Date.now();
    entry.escalation.nudgeCount++;
    this._logAction('nudge', sessionId, entry.taskId, 'Manual nudge');
    this._sendNudge(entry, cfg);
    return { ok: true };
  }

  swapModel(sessionId: string, targetModel: string): Record<string, any> {
    const entry = this.registry.get(sessionId);
    if (!entry) return { ok: false, error: 'Session not found' };
    const cfg = loadManagerConfig();
    entry.escalation.lastSwapAt = Date.now();
    entry.escalation.swapCount++;
    this._logAction('swap', sessionId, entry.taskId, `Manual swap → ${targetModel}`);
    this._sendSwap(entry, targetModel, cfg);
    return { ok: true };
  }

  killSession(sessionId: string): Record<string, any> {
    const entry = this.registry.get(sessionId);
    if (!entry) return { ok: false, error: 'Session not found' };
    const cfg = loadManagerConfig();
    entry.escalation.lastKillAt = Date.now();

    if (entry.status === 'orphaned') {
      const purged = this._purgeFromIndex([sessionId]);
      this.registry.delete(sessionId);
      this._logAction('kill', sessionId, entry.taskId, `Purged orphaned session (removed ${purged} from index)`);
      return { ok: true, purged };
    }

    this._logAction('kill', sessionId, entry.taskId, 'Manual kill');
    this._sendKill(entry, cfg);
    return { ok: true };
  }

  killOrphans(): Record<string, any> {
    const orphans = [...this.registry.values()].filter(e => e.status === 'orphaned');
    this._log('info', `killOrphans: found ${orphans.length} orphaned sessions in registry (total: ${this.registry.size})`);

    if (orphans.length === 0) {
      this._logAction('kill-orphans', null, null, 'No orphaned sessions to kill');
      return { ok: true, killed: 0 };
    }

    try {
      const sessionIds = orphans.map(e => e.sessionId);
      const purged = this._purgeFromIndex(sessionIds);

      for (const id of sessionIds) {
        this.registry.delete(id);
      }

      this._log('info', `killOrphans: purged ${purged} entries from index, removed ${sessionIds.length} from registry`);
      this._logAction('kill-orphans', null, null, `Purged ${orphans.length} orphaned sessions (${purged} from index)`);
      return { ok: true, killed: orphans.length, purged };
    } catch (e: unknown) {
      this._log('error', `killOrphans: purge failed: ${(e as Error).message}`);
      this._logAction('kill-orphans', null, null, `Purge failed: ${(e as Error).message}`);
      return { ok: false, killed: 0, error: (e as Error).message };
    }
  }

  dedup(taskId: string): Record<string, any> {
    const entries = [...this.registry.values()].filter(e => e.taskId === taskId && !e.isController);
    if (entries.length <= 1) return { ok: true, killed: 0 };
    entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const cfg = loadManagerConfig();
    let killed = 0;
    for (let i = 1; i < entries.length; i++) {
      entries[i].escalation.lastKillAt = Date.now();
      this._sendKill(entries[i], cfg);
      killed++;
    }
    this._logAction('dedup', null, taskId, `Kept newest, killed ${killed}`);
    return { ok: true, killed, kept: entries[0].sessionId };
  }

  dedupAll(): Record<string, any> {
    const taskSessions: Record<string, RegistryEntry[]> = {};
    for (const entry of this.registry.values()) {
      if (!entry.taskId || entry.isController) continue;
      if (!taskSessions[entry.taskId]) taskSessions[entry.taskId] = [];
      taskSessions[entry.taskId].push(entry);
    }
    let totalKilled = 0;
    for (const [tid, entries] of Object.entries(taskSessions)) {
      if (entries.length > 1) {
        const result = this.dedup(tid);
        totalKilled += result.killed || 0;
      }
    }
    return { ok: true, killed: totalKilled };
  }

  canSpawnCheck(): Record<string, any> {
    const cfg = loadManagerConfig();
    const max = cfg.maxActiveSessions || 4;
    const active = [...this.registry.values()].filter(
      e => !e.isController && (e.status === 'healthy' || e.status === 'stale')
    ).length;
    return {
      canSpawn: active < max,
      count: active,
      max,
      warning: active >= max ? `At capacity: ${active}/${max} active sessions` : null,
    };
  }

  getState() {
    const sessions = [...this.registry.values()].map(e => ({
      sessionId: e.sessionId,
      key: e.key,
      kind: e.kind,
      model: e.model,
      taskId: e.taskId,
      updatedAt: e.updatedAt,
      lastActivityTs: e.lastActivityTs,
      ageMs: e.ageMs,
      status: e.status,
      isController: e.isController,
      escalation: { ...e.escalation },
    }));

    const statusOrder: Record<string, number> = { stale: 0, orphaned: 1, duplicate: 2, healthy: 3 };
    sessions.sort((a, b) => {
      const oa = statusOrder[a.status] ?? 4;
      const ob = statusOrder[b.status] ?? 4;
      if (oa !== ob) return oa - ob;
      return (b.ageMs || 0) - (a.ageMs || 0);
    });

    const summary = { total: 0, healthy: 0, stale: 0, errored: 0, orphaned: 0, duplicates: 0 };
    for (const s of sessions) {
      summary.total++;
      if (s.status === 'healthy') summary.healthy++;
      else if (s.status === 'stale') summary.stale++;
      else if (s.status === 'errored') summary.errored++;
      else if (s.status === 'orphaned') summary.orphaned++;
      else if (s.status === 'duplicate') summary.duplicates++;
    }

    return {
      lastScanAt: this.lastScanAt,
      scanCount: this.scanCount,
      summary,
      sessions,
      issues: this.issues,
      actionLog: this.actionLog,
      debugLog: this.debugLog.slice(0, 50),
      lastError: this._lastError,
      errorCount: this._errorCount,
      consecutiveEmptyScans: this._consecutiveEmptyScans,
      escalationPaused: this.escalationPaused,
      canSpawn: this.canSpawnCheck(),
    };
  }
}

const sessionManager = new SessionManager();

appHealth.start();

registry.register('sessionManager', () => sessionManager);

export default sessionManager;
