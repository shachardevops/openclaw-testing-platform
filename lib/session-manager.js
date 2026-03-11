/**
 * Session Manager — server-side singleton.
 *
 * 10-second scan loop that reads OpenClaw sessions, classifies health,
 * detects duplicates/orphans, and runs escalation (nudge → swap → kill).
 * Exposed to clients via /api/session-manager GET/POST.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getControllerSessionId, listSessions, spawnAgent, invalidateSessionsCache } from './openclaw.js';
import { bridgeLogPath, resultsDir } from './config.js';
import { getProjectConfig } from './project-loader.js';
import appHealth from './app-health.js';

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw/agents/main/sessions');
const SESSIONS_INDEX = path.join(SESSIONS_DIR, 'sessions.json');

// ---------------------------------------------------------------------------
// Default config — overridden by project.json sessionManager section
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  scanIntervalMs: 20000,
  maxActiveSessions: 4,
  escalation: {
    staleThresholdMs: 180000,    // 3 min
    nudgeCooldownMs: 300000,     // 5 min
    swapThresholdMs: 480000,     // 8 min
    killThresholdMs: 900000,     // 15 min
  },
  orphanMaxAgeMs: 1800000,       // 30 min
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    return { ...DEFAULT_CONFIG, workspace: process.cwd(), messageTemplates: {} };
  }
}

/** Load result files to resolve which sessions map to which tasks */
function loadResultsIndex() {
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

/** Read session health from JSONL file */
function readSessionHealth(sessionId) {
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    return { lastActivityTs: stat.mtimeMs, fileSize: stat.size };
  } catch {
    return null;
  }
}

/**
 * Scan session JSONL for task ID references (e.g. "[dashboard-run]...task: story-0").
 * Reads only the first 8KB to keep it fast. Results are cached by sessionId.
 */
const _sessionTaskCache = new Map(); // sessionId -> { taskId, checkedAt }
const SESSION_TASK_CACHE_TTL = 120000; // 2 min

function resolveTaskFromSessionContent(sessionId, taskIds) {
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

function formatAge(ms) {
  if (!ms || ms <= 0) return '0s';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// ---------------------------------------------------------------------------
// Session Manager Singleton
// ---------------------------------------------------------------------------

class SessionManager {
  constructor() {
    this.registry = new Map();         // sessionId -> entry
    this.issues = [];                  // active issues
    this.actionLog = [];               // last 50 actions
    this.debugLog = [];                // last 100 debug entries
    this.lastScanAt = null;
    this.scanCount = 0;
    this.escalationPaused = false;
    this._timer = null;
    this._scanning = false;
    this._started = false;
    this._lastError = null;
    this._errorCount = 0;
    this._consecutiveEmptyScans = 0;

    this._previousSessionIds = new Set(); // track disappearances
  }

  _log(level, message) {
    const entry = { ts: Date.now(), level, message };
    this.debugLog.unshift(entry);
    if (this.debugLog.length > 100) this.debugLog.length = 100;
    if (level === 'error') {
      this._lastError = entry;
      this._errorCount++;
    }
  }

  start() {
    if (this._started) return;
    this._started = true;
    const cfg = loadManagerConfig();
    this._timer = setInterval(() => this.scan(), cfg.scanIntervalMs || 10000);
    // Initial scan after short delay
    setTimeout(() => this.scan(), 2000);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._started = false;
  }

  // -------------------------------------------------------------------------
  // Core scan
  // -------------------------------------------------------------------------
  async scan() {
    if (this._scanning) {
      this._log('debug', 'Scan skipped (already scanning)');
      return;
    }
    this._scanning = true;
    const t0 = Date.now();
    try {
      await this._doScan();
      this._log('debug', `Scan completed in ${Date.now() - t0}ms, ${this.registry.size} sessions`);
    } catch (e) {
      this._log('error', `Scan crashed after ${Date.now() - t0}ms: ${e.message}\n${e.stack}`);
      console.error('[SessionManager] scan error:', e.message, e.stack);
    } finally {
      this._scanning = false;
    }
  }

  async _doScan() {
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

    // Build reverse map: sessionKey -> taskId from results
    const keyToTask = {};
    for (const [taskId, info] of Object.entries(resultsIndex)) {
      if (info.runSessionKey) {
        keyToTask[info.runSessionKey] = taskId;
      }
    }

    // Track which sessionIds we see this scan
    const seenIds = new Set();

    for (const s of sessions) {
      if (!s || !s.sessionId) continue;
      seenIds.add(s.sessionId);

      const isController = s.sessionId === controllerSessionId || s.key === 'agent:main:main';
      const updatedAt = Number(s.updatedAt || 0);
      const ageMs = updatedAt > 0 ? Math.max(0, now - updatedAt) : Number.MAX_SAFE_INTEGER;

      // Resolve task by matching session key to result runSessionKey
      let taskId = null;
      if (s.key && keyToTask[s.key]) {
        taskId = keyToTask[s.key];
      } else {
        // Fuzzy: check if any result's runSessionKey contains this session's ID
        for (const [tid, info] of Object.entries(resultsIndex)) {
          if (info.runSessionKey && s.sessionId && info.runSessionKey.includes(s.sessionId)) {
            taskId = tid;
            break;
          }
        }
      }

      // Second fallback: check if session key contains a known task ID
      // OpenClaw child sessions often have keys like "agent:main:story-0:uuid"
      if (!taskId && !isController && s.key) {
        const keyLower = s.key.toLowerCase();
        for (const tid of Object.keys(resultsIndex)) {
          if (keyLower.includes(tid.toLowerCase())) {
            taskId = tid;
            break;
          }
        }
      }

      // Third fallback: scan session JSONL content for task ID references
      if (!taskId && !isController && s.sessionId) {
        const runningTaskIds = Object.entries(resultsIndex)
          .filter(([, info]) => info.status === 'running')
          .map(([tid]) => tid);
        if (runningTaskIds.length > 0) {
          taskId = resolveTaskFromSessionContent(s.sessionId, runningTaskIds);
        }
      }

      // Fourth fallback: if only one task is running and only one unmatched
      // non-controller session exists, they likely belong together
      if (!taskId && !isController) {
        const runningTasks = Object.entries(resultsIndex)
          .filter(([tid, info]) => info.status === 'running' && !Object.values(keyToTask).includes(tid));
        const unmatchedSessions = sessions.filter(sess =>
          sess.sessionId !== controllerSessionId &&
          sess.key !== 'agent:main:main' &&
          !keyToTask[sess.key] &&
          sess.sessionId === s.sessionId
        );
        if (runningTasks.length === 1 && unmatchedSessions.length > 0) {
          // Check if this session was created around when the task started
          const [tid, info] = runningTasks[0];
          if (info.startedAt) {
            const taskStartMs = typeof info.startedAt === 'number' ? info.startedAt : Date.parse(info.startedAt);
            const sessionCreatedMs = updatedAt || 0;
            // Session created within 2 minutes of task start
            if (Math.abs(sessionCreatedMs - taskStartMs) < 120000 || sessionCreatedMs > taskStartMs) {
              taskId = tid;
            }
          }
        }
      }

      // Persist the mapping: write runSessionKey back to result file so
      // future scans can use the fast keyToTask lookup (method 1).
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
        } catch { /* best-effort — don't crash scan */ }
      }

      // Also try reading session JSONL for more accurate last activity
      let lastActivityTs = updatedAt;
      const health = readSessionHealth(s.sessionId);
      if (health && health.lastActivityTs > lastActivityTs) {
        lastActivityTs = health.lastActivityTs;
      }
      const activityAge = lastActivityTs > 0 ? now - lastActivityTs : ageMs;

      // Determine status
      let status = 'healthy';
      const taskInfo = taskId ? resultsIndex[taskId] : null;

      if (isController) {
        status = 'healthy';
      } else if (!taskId && ageMs >= (cfg.orphanMaxAgeMs || 1800000)) {
        status = 'orphaned';
      } else if (taskInfo && (taskInfo.status === 'passed' || taskInfo.status === 'done' || taskInfo.status === 'completed')) {
        status = 'healthy'; // task finished
      } else if (taskInfo && taskInfo.status === 'failed') {
        // Only treat as finished if not an auto-fail (stale-timeout).
        // A stale-timeout failure means the result file was marked failed
        // but the session may still be alive and working.
        if (taskInfo.isAutoFail) {
          // Session still exists — check activity to determine stale vs healthy
          status = activityAge >= (cfg.escalation.staleThresholdMs || 180000) ? 'stale' : 'healthy';
        } else {
          status = 'healthy'; // genuinely finished
        }
      } else if (activityAge >= (cfg.escalation.staleThresholdMs || 180000)) {
        status = 'stale';
      }

      // Get or create registry entry (preserve escalation state)
      const existing = this.registry.get(s.sessionId);
      const entry = {
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

    // Remove sessions no longer present
    for (const id of this.registry.keys()) {
      if (!seenIds.has(id)) this.registry.delete(id);
    }

    // Post-scan reconciliation: match unmatched sessions to unmatched running tasks
    // by time proximity (session appeared around the same time the task started)
    const matchedTaskIds = new Set(
      [...this.registry.values()].filter(e => e.taskId).map(e => e.taskId)
    );
    const unmatchedRunning = Object.entries(resultsIndex)
      .filter(([tid, info]) => info.status === 'running' && !matchedTaskIds.has(tid));
    const unmatchedSessions = [...this.registry.values()]
      .filter(e => !e.taskId && !e.isController);

    if (unmatchedRunning.length > 0 && unmatchedSessions.length > 0) {
      for (const session of unmatchedSessions) {
        // Find the best running task match by start time proximity
        let bestMatch = null;
        let bestDelta = Infinity;
        for (const [tid, info] of unmatchedRunning) {
          if (matchedTaskIds.has(tid)) continue;
          if (info.startedAt) {
            const delta = Math.abs(session.updatedAt - info.startedAt);
            if (delta < bestDelta && delta < 600000) { // within 10 min
              bestDelta = delta;
              bestMatch = tid;
            }
          }
        }
        // If only one unmatched running task, assign directly
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

    // Detect duplicates: group by taskId
    const taskSessions = {};
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

    // Build issues
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

    // Escalation is handled by the orchestrator engine (deterministic decision tree).
    // The engine runs on its own 15s tick and reads the registry + results directly.
    const appIsDown = appHealth.isHealthy() === false;
    if (appIsDown) {
      this._log('info', 'Escalation skipped: target app is down');
    }

    this.lastScanAt = now;
    this.scanCount++;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  _logAction(action, sessionId, taskId, result) {
    this.actionLog.unshift({ action, sessionId, taskId, result, ts: Date.now() });
    if (this.actionLog.length > 50) this.actionLog.length = 50;
  }

  _sendToController(message, cfg) {
    const controllerSessionId = getControllerSessionId();
    if (!controllerSessionId) {
      this._log('warn', `_sendToController: no controller session ID, message dropped: ${message.split('\n')[0]}`);
      return null;
    }

    // Filesystem-backed throttle — survives HMR/dev server restarts
    const msgKey = message.split('\n')[0];
    const throttleFile = path.join(resultsDir(), '.last-controller-messages.json');
    const now = Date.now();
    let recent = [];
    try {
      if (fs.existsSync(throttleFile)) {
        recent = JSON.parse(fs.readFileSync(throttleFile, 'utf8'));
        if (!Array.isArray(recent)) recent = [];
      }
    } catch { recent = []; }

    // Global rate: max 2 messages per minute
    const recentCount = recent.filter(m => now - m.ts < 60000).length;
    if (recentCount >= 2) {
      this._log('debug', `_sendToController throttled (global ${recentCount}/2 per min): ${msgKey}`);
      return null;
    }

    // Per-message dedup: same prefix within 5 minutes
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

      // Record in throttle file (keep last 20 entries)
      recent.push({ key: msgKey, ts: now });
      if (recent.length > 20) recent = recent.slice(-20);
      try {
        fs.writeFileSync(throttleFile, JSON.stringify(recent, null, 2));
      } catch { /* best-effort */ }

      return child.pid;
    } catch (e) {
      this._log('error', `_sendToController failed: ${e.message}`);
      console.error('[SessionManager] send to controller failed:', e.message);
      return null;
    }
  }

  /**
   * Directly remove sessions from the sessions.json index file.
   * Used for orphaned sessions where the process is already dead.
   * Returns the number of entries actually removed.
   */
  _purgeFromIndex(sessionIds) {
    const idsToRemove = new Set(sessionIds);
    let removed = 0;
    try {
      if (!fs.existsSync(SESSIONS_INDEX)) return 0;
      const index = JSON.parse(fs.readFileSync(SESSIONS_INDEX, 'utf8'));
      if (!index || typeof index !== 'object') return 0;

      for (const [key, val] of Object.entries(index)) {
        const sid = val?.sessionId || val?.id || key;
        if (idsToRemove.has(sid)) {
          delete index[key];
          removed++;
        }
      }

      if (removed > 0) {
        fs.writeFileSync(SESSIONS_INDEX, JSON.stringify(index, null, 2) + '\n');
        this._log('info', `_purgeFromIndex: removed ${removed} entries from sessions.json`);

        // Also delete the JSONL session files (optional cleanup)
        for (const id of sessionIds) {
          const jsonlPath = path.join(SESSIONS_DIR, `${id}.jsonl`);
          try {
            if (fs.existsSync(jsonlPath)) fs.rmSync(jsonlPath, { force: true });
          } catch { /* best-effort */ }
        }

        // Invalidate listSessions cache so next scan picks up the change
        invalidateSessionsCache();
      }

      return removed;
    } catch (e) {
      this._log('error', `_purgeFromIndex: ${e.message}`);
      return removed;
    }
  }

  /** Check if a task's result status is terminal (no more actions needed). */
  _isTaskTerminal(taskId) {
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

  _sendNudge(entry, cfg) {
    // Guard: skip unidentified sessions and terminal tasks
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

  _sendSwap(entry, targetModel, cfg) {
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

  _sendKill(entry, cfg) {
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

  // ---- Public actions ----

  nudge(sessionId) {
    const entry = this.registry.get(sessionId);
    if (!entry) return { ok: false, error: 'Session not found' };
    const cfg = loadManagerConfig();
    entry.escalation.lastNudgeAt = Date.now();
    entry.escalation.nudgeCount++;
    this._logAction('nudge', sessionId, entry.taskId, 'Manual nudge');
    this._sendNudge(entry, cfg);
    return { ok: true };
  }

  swapModel(sessionId, targetModel) {
    const entry = this.registry.get(sessionId);
    if (!entry) return { ok: false, error: 'Session not found' };
    const cfg = loadManagerConfig();
    entry.escalation.lastSwapAt = Date.now();
    entry.escalation.swapCount++;
    this._logAction('swap', sessionId, entry.taskId, `Manual swap → ${targetModel}`);
    this._sendSwap(entry, targetModel, cfg);
    return { ok: true };
  }

  killSession(sessionId) {
    const entry = this.registry.get(sessionId);
    if (!entry) return { ok: false, error: 'Session not found' };
    const cfg = loadManagerConfig();
    entry.escalation.lastKillAt = Date.now();

    // Orphaned sessions are dead processes — purge directly from index
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

  killOrphans() {
    const orphans = [...this.registry.values()].filter(e => e.status === 'orphaned');
    this._log('info', `killOrphans: found ${orphans.length} orphaned sessions in registry (total: ${this.registry.size})`);

    if (orphans.length === 0) {
      this._logAction('kill-orphans', null, null, 'No orphaned sessions to kill');
      return { ok: true, killed: 0 };
    }

    // Orphaned sessions are dead processes — purge directly from the sessions index
    // instead of sending kill messages to the controller (which can't kill dead processes).
    try {
      const sessionIds = orphans.map(e => e.sessionId);
      const purged = this._purgeFromIndex(sessionIds);

      // Remove from registry
      for (const id of sessionIds) {
        this.registry.delete(id);
      }

      this._log('info', `killOrphans: purged ${purged} entries from index, removed ${sessionIds.length} from registry`);
      this._logAction('kill-orphans', null, null, `Purged ${orphans.length} orphaned sessions (${purged} from index)`);
      return { ok: true, killed: orphans.length, purged };
    } catch (e) {
      this._log('error', `killOrphans: purge failed: ${e.message}`);
      this._logAction('kill-orphans', null, null, `Purge failed: ${e.message}`);
      return { ok: false, killed: 0, error: e.message };
    }
  }

  dedup(taskId) {
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

  dedupAll() {
    const taskSessions = {};
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

  canSpawnCheck() {
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

  // -------------------------------------------------------------------------
  // State snapshot (returned by GET /api/session-manager)
  // -------------------------------------------------------------------------
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

    // Sort: issues first, then by age desc
    const statusOrder = { stale: 0, orphaned: 1, duplicate: 2, healthy: 3 };
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

// Module-level singleton
const sessionManager = new SessionManager();

// Ensure app health monitor is running alongside session manager
appHealth.start();

export default sessionManager;
