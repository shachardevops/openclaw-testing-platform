import fs from 'fs';
import path from 'path';
import os from 'os';
import { bridgeLogPath } from '@/lib/config';
import { getControllerSessionId, spawnAgent } from '@/lib/openclaw';
import { getProjectConfig } from '@/lib/project-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw/agents/main/sessions');
const SESSIONS_INDEX = path.join(SESSIONS_DIR, 'sessions.json');

// DEPRECATED: This route is superseded by lib/session-manager.js which provides
// centralized session monitoring. Kept for backwards compatibility.

// Per-task tracking to avoid spamming
const taskState = new Map();
const PRUNE_INTERVAL_MS = 30 * 60 * 1000; // 30 min

function pruneTaskState() {
  const cutoff = Date.now() - PRUNE_INTERVAL_MS;
  for (const [key, state] of taskState) {
    const lastTouch = Math.max(state.lastSwapAt || 0, state.lastNudgeAt || 0);
    if (lastTouch < cutoff) taskState.delete(key);
  }
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;   // 5 minutes no activity → nudge
const SWAP_COOLDOWN_MS = 2 * 60 * 1000;     // 2 min between model swaps
const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;    // 5 min between nudges
const MAX_RECENT_SUBAGENTS = 3;              // Don't nudge/swap if too many subagents active

/**
 * POST /api/session-monitor
 * Body: { taskId, currentModel }
 *
 * Monitors a running task's session for:
 * 1. API errors (overloaded, rate limit, etc.) → triggers model swap
 * 2. Stale session (no activity for 5 min) → sends nudge to controller
 *
 * Returns what action was taken (if any).
 */
export async function POST(request) {
  try {
    pruneTaskState();
    const { taskId, currentModel } = await request.json();
    if (!taskId) throw new Error('taskId required');

    const config = getProjectConfig();
    const existing = taskState.get(taskId) || { swapCount: 0, nudgeCount: 0 };

    // Find the session for this task
    const sessionId = resolveTaskSession(taskId);
    if (!sessionId) {
      return Response.json({ ok: true, action: 'none', reason: 'no session found' });
    }

    // Read session file to check health
    const sessionInfo = readSessionHealth(sessionId);
    if (!sessionInfo) {
      return Response.json({ ok: true, action: 'none', reason: 'cannot read session' });
    }

    const controllerSessionId = getControllerSessionId();
    if (!controllerSessionId) {
      return Response.json({ ok: true, action: 'none', reason: 'no controller session' });
    }

    const logPath = bridgeLogPath();

    // ── Guard: Don't create more sessions if too many are already active ──
    const recentSubagentCount = countRecentSubagents();
    if (recentSubagentCount >= MAX_RECENT_SUBAGENTS) {
      return Response.json({
        ok: true,
        action: 'none',
        reason: `too many active subagents (${recentSubagentCount})`,
        subagentCount: recentSubagentCount,
      });
    }

    // ── Check 1: API errors → model swap ──────────────────────────
    const fallbackConfig = config.project.modelFallback;
    if (fallbackConfig?.enabled && sessionInfo.recentError) {
      const canSwap = !existing.lastSwapAt || Date.now() - existing.lastSwapAt >= SWAP_COOLDOWN_MS;
      if (canSwap) {
        const modelFamily = getModelFamily(currentModel, config.models);
        const fallbackModel = resolveFallbackModel(modelFamily, fallbackConfig.rules);

        if (fallbackModel) {
          const template = config.project.messageTemplates?.modelSwap;
          const msg = template
            ? template
                .replace(/\{taskId\}/g, taskId)
                .replace(/\{errorReason\}/g, sessionInfo.recentError.pattern)
                .replace(/\{fallbackModel\}/g, fallbackModel)
                .replace(/\{workspace\}/g, config.project.workspace || '')
            : `[dashboard-model-swap] Swap model for ${taskId} to ${fallbackModel} due to: ${sessionInfo.recentError.pattern}`;

          const logEntry = `\n[${new Date().toISOString()}] model-swap ${taskId} ${currentModel} -> ${fallbackModel} reason="${sessionInfo.recentError.pattern}"\n`;
          fs.appendFileSync(logPath, logEntry);

          const child = spawnAgent(controllerSessionId, msg, logPath);

          existing.lastSwapAt = Date.now();
          existing.swapCount += 1;
          existing.lastAction = 'swap';
          taskState.set(taskId, existing);

          return Response.json({
            ok: true,
            action: 'model_swap',
            fromModel: currentModel,
            toModel: fallbackModel,
            reason: sessionInfo.recentError.pattern,
            pid: child.pid,
          });
        }
      }
    }

    // ── Check 2: Stale session → nudge ────────────────────────────
    const timeSinceLastActivity = Date.now() - sessionInfo.lastActivityTs;
    if (timeSinceLastActivity >= STALE_THRESHOLD_MS) {
      const canNudge = !existing.lastNudgeAt || Date.now() - existing.lastNudgeAt >= NUDGE_COOLDOWN_MS;
      if (canNudge) {
        const staleMinutes = Math.round(timeSinceLastActivity / 60_000);
        const template = config.project.messageTemplates?.nudge;
        const msg = template
          ? template
              .replace(/\{taskId\}/g, taskId)
              .replace(/\{staleMinutes\}/g, String(staleMinutes))
              .replace(/\{model\}/g, currentModel || 'unknown')
              .replace(/\{workspace\}/g, config.project.workspace || '')
          : [
              `[dashboard-nudge]`,
              `Task ${taskId} stuck for ${staleMinutes}m. Continue from last checkpoint.`,
              `Current model: ${currentModel || 'unknown'}.`,
            ].join('\n');

        const logEntry = `\n[${new Date().toISOString()}] session-nudge ${taskId} stale=${staleMinutes}m\n`;
        fs.appendFileSync(logPath, logEntry);

        const child = spawnAgent(controllerSessionId, msg, logPath);

        existing.lastNudgeAt = Date.now();
        existing.nudgeCount += 1;
        existing.lastAction = 'nudge';
        taskState.set(taskId, existing);

        return Response.json({
          ok: true,
          action: 'nudge',
          staleMinutes,
          nudgeCount: existing.nudgeCount,
          pid: child.pid,
        });
      } else {
        const nextNudge = NUDGE_COOLDOWN_MS - (Date.now() - existing.lastNudgeAt);
        return Response.json({
          ok: true,
          action: 'none',
          reason: 'nudge cooldown',
          staleMinutes: Math.round(timeSinceLastActivity / 60_000),
          nextNudgeIn: Math.round(nextNudge / 1000),
        });
      }
    }

    return Response.json({
      ok: true,
      action: 'none',
      sessionId,
      lastActivityAge: Math.round(timeSinceLastActivity / 1000),
      totalLines: sessionInfo.totalLines,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/session-monitor?taskId=xxx
 * Returns current monitor state for a task.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');
  if (!taskId) return Response.json({ ok: false, error: 'taskId required' });

  const state = taskState.get(taskId) || null;
  return Response.json({ ok: true, taskId, state });
}

// ── Helpers ───────────────────────────────────────────────────────

/** Read session JSONL and return health info */
function readSessionHealth(sessionId) {
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return null;

    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    // Find last activity timestamp from entries
    let lastActivityTs = stat.mtimeMs;
    const recentLines = lines.slice(-30);

    // Check for error patterns in recent lines
    const config = getProjectConfig();
    const errorPatterns = config.project.modelFallback?.errorPatterns || [];
    let recentError = null;

    for (const line of recentLines.reverse()) {
      try {
        const d = JSON.parse(line);

        // Track last activity
        if (d.timestamp) {
          const ts = new Date(d.timestamp).getTime();
          if (ts > lastActivityTs) lastActivityTs = ts;
          // For first valid timestamp we find (most recent), use it
          if (lastActivityTs === stat.mtimeMs && ts > 0) lastActivityTs = ts;
        }

        // Check for errors (only in last 5 min)
        if (!recentError && errorPatterns.length > 0) {
          const text = extractAllText(d);
          const lower = text.toLowerCase();
          const ts = d.timestamp ? new Date(d.timestamp).getTime() : 0;

          for (const pattern of errorPatterns) {
            if (lower.includes(pattern.toLowerCase())) {
              if (!ts || Date.now() - ts < STALE_THRESHOLD_MS) {
                recentError = { pattern, text: text.slice(0, 200), timestamp: d.timestamp };
              }
              break;
            }
          }
        }
      } catch { /* skip */ }
    }

    // Use file mtime as fallback for last activity
    if (stat.mtimeMs > lastActivityTs) lastActivityTs = stat.mtimeMs;

    return { lastActivityTs, totalLines: lines.length, recentError };
  } catch {
    return null;
  }
}

/** Extract all text content from a JSONL entry for pattern matching */
function extractAllText(d) {
  const parts = [];

  if (d.type === 'message') {
    const msg = d.message || {};
    const content = msg.content;
    if (typeof content === 'string') {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const c of content) {
        if (c.text) parts.push(c.text);
        if (c.content) parts.push(typeof c.content === 'string' ? c.content : JSON.stringify(c.content));
      }
    }
  }

  if (d.error) parts.push(typeof d.error === 'string' ? d.error : JSON.stringify(d.error));
  if (d.type === 'error') parts.push(d.message || d.reason || '');

  return parts.join(' ');
}

function getModelFamily(modelId, models) {
  if (!modelId) return 'unknown';
  const model = (models || []).find(m => m.id === modelId);
  if (model?.family) return model.family;
  const id = modelId.toLowerCase();
  if (id.includes('anthropic') || id.includes('claude')) return 'anthropic';
  if (id.includes('openai') || id.includes('gpt')) return 'openai';
  return 'unknown';
}

function resolveFallbackModel(currentFamily, rules) {
  if (!rules || !currentFamily) return null;
  const rule = rules.find(r => r.from === currentFamily);
  return rule?.to || null;
}

function resolveTaskSession(taskId) {
  try {
    if (!fs.existsSync(SESSIONS_INDEX)) return null;
    const data = JSON.parse(fs.readFileSync(SESSIONS_INDEX, 'utf8'));

    let bestMatch = null;
    let bestAge = Infinity;
    const now = Date.now();

    for (const [key, session] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      const label = (session.label || '').toLowerCase();
      const taskLower = taskId.toLowerCase();

      if (keyLower.includes(taskLower) || label.includes(taskLower)) {
        const age = now - (session.updatedAt || 0);
        if (age < bestAge) {
          bestAge = age;
          bestMatch = session.sessionId || session.id;
        }
      }
    }

    return bestMatch;
  } catch {
    return null;
  }
}

/** Count recent subagent sessions (updated within last hour) */
function countRecentSubagents() {
  try {
    if (!fs.existsSync(SESSIONS_INDEX)) return 0;
    const data = JSON.parse(fs.readFileSync(SESSIONS_INDEX, 'utf8'));
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    let count = 0;
    for (const [key, session] of Object.entries(data)) {
      if (key.includes('subagent') && (session.updatedAt || 0) > oneHourAgo) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}
