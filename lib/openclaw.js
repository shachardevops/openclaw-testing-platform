import { execFileSync, execFile, spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { readPipelineConfig, updatePipelineControllerSession } from './config.js';

const SESSIONS_INDEX = path.join(os.homedir(), '.openclaw/agents/main/sessions/sessions.json');

// ── Controller session ──────────────────────────────────────────

// Cache controller session ID for 30s — it rarely changes and
// resolving it calls listSessionsSync() which blocks for up to 8s.
let _controllerCache = null;
let _controllerCacheAt = 0;
const CONTROLLER_CACHE_TTL = 30000;

export function getControllerSessionId() {
  const now = Date.now();
  if (_controllerCache !== null && now - _controllerCacheAt < CONTROLLER_CACHE_TTL) {
    return _controllerCache;
  }
  try {
    const cfg = readPipelineConfig();
    const raw = cfg.controllerSessionId || process.env.OPENCLAW_SESSION_ID || null;
    if (!raw) {
      _controllerCache = null;
      _controllerCacheAt = now;
      return null;
    }

    // Plain UUID — validate it exists before returning
    if (!String(raw).includes(':')) {
      const sessions = listSessionsSync();
      const exists = sessions.find(s => s.sessionId === raw || s.id === raw);
      if (exists) {
        _controllerCache = raw;
        _controllerCacheAt = now;
        return raw;
      }
      // UUID stale — resolve by key
      const match = sessions.find(s => s.key === 'agent:main:main');
      if (match) {
        const resolved = match.sessionId || match.id;
        console.log('[getControllerSessionId] Stale UUID', raw, '→ resolved by key to', resolved);
        updatePipelineControllerSession(resolved);
        _controllerCache = resolved;
        _controllerCacheAt = now;
        return resolved;
      }
      // No match by key either — return the configured UUID as-is
      _controllerCache = raw;
      _controllerCacheAt = now;
      return raw;
    }

    // Full key format — resolve via sessions list
    const sessions = listSessionsSync();
    const match = sessions.find(s => s.key === raw);
    const result = match?.sessionId || match?.id || null;
    _controllerCache = result;
    _controllerCacheAt = now;
    return result;
  } catch {
    const fallback = process.env.OPENCLAW_SESSION_ID || null;
    _controllerCache = fallback;
    _controllerCacheAt = now;
    return fallback;
  }
}

// ── Execute (waits for result) ──────────────────────────────────

export function execAgent(sessionId, message, opts = {}) {
  const timeoutSec = opts.timeout || 180;
  return new Promise((resolve, reject) => {
    execFile('openclaw', [
      'agent', '--session-id', sessionId,
      '--message', message,
      '--json', '--timeout', String(timeoutSec),
    ], { timeout: (timeoutSec + 10) * 1000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

// ── Spawn (detached, logs to file) ──────────────────────────────

export function spawnAgent(sessionId, message, logPath) {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const out = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn('openclaw', [
    'agent', '--session-id', sessionId,
    '--message', message, '--json',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.pipe(out);
  child.stderr.pipe(out);

  child.on('error', (err) => {
    out.end();
    console.error('[spawnAgent] spawn error:', err.message);
  });

  child.unref();
  return child;
}

// ── List sessions (shared cache) ────────────────────────────────

// Primary strategy: read ~/.openclaw/agents/main/sessions/sessions.json
// directly (sub-ms) instead of spawning `openclaw sessions --json` (10-140s).
// CLI fallback only if the file is missing or corrupt.

let _sessionsCache = null;
let _sessionsCacheAt = 0;
let _sessionsFetching = null; // in-flight promise dedup
const SESSIONS_CACHE_TTL = 15000; // 15s

/**
 * Read sessions.json index file and convert key-value object to array format.
 * Returns null if file missing/corrupt (caller should fall back to CLI).
 */
function readSessionsFromFile() {
  try {
    const raw = fs.readFileSync(SESSIONS_INDEX, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return Object.entries(data).map(([key, session]) => ({
      sessionId: session.sessionId || session.id || key,
      key,
      updatedAt: session.updatedAt || 0,
      model: session.model || '',
      label: session.label || '',
      kind: '',
      ...session,
    }));
  } catch {
    return null;
  }
}

export function listSessions() {
  const now = Date.now();

  // Return cached if fresh
  if (_sessionsCache !== null && now - _sessionsCacheAt < SESSIONS_CACHE_TTL) {
    return Promise.resolve(_sessionsCache);
  }

  // Try file read first (sub-ms)
  const fromFile = readSessionsFromFile();
  if (fromFile !== null) {
    _sessionsCache = fromFile;
    _sessionsCacheAt = Date.now();
    return Promise.resolve(fromFile);
  }

  // Dedup in-flight CLI requests
  if (_sessionsFetching) return _sessionsFetching;

  _sessionsFetching = new Promise((resolve) => {
    execFile('openclaw', ['sessions', '--json'], { timeout: 20_000 }, (err, stdout) => {
      _sessionsFetching = null;
      if (err) {
        if (_sessionsCache !== null) {
          console.warn('[listSessions] CLI failed, returning stale cache (' + _sessionsCache.length + ' sessions)');
          return resolve(_sessionsCache);
        }
        return resolve([]);
      }
      try {
        const parsed = JSON.parse(stdout || '{}');
        const result = Array.isArray(parsed.sessions) ? parsed.sessions : (Array.isArray(parsed) ? parsed : []);
        _sessionsCache = result;
        _sessionsCacheAt = Date.now();
        resolve(result);
      } catch {
        resolve(_sessionsCache || []);
      }
    });
  });

  return _sessionsFetching;
}

/** Invalidate the shared sessions cache so the next call re-reads the index. */
export function invalidateSessionsCache() {
  _sessionsCache = null;
  _sessionsCacheAt = 0;
}

export function listSessionsSync() {
  // Return cached if fresh
  if (_sessionsCache !== null && Date.now() - _sessionsCacheAt < SESSIONS_CACHE_TTL) {
    return _sessionsCache;
  }

  // Try file read first (sub-ms, non-blocking)
  const fromFile = readSessionsFromFile();
  if (fromFile !== null) {
    _sessionsCache = fromFile;
    _sessionsCacheAt = Date.now();
    return fromFile;
  }

  // Fall back to CLI only if file missing
  try {
    const out = execFileSync('openclaw', ['sessions', '--json'], { encoding: 'utf8', timeout: 8000 });
    const parsed = JSON.parse(out || '{}');
    const result = Array.isArray(parsed.sessions) ? parsed.sessions : (Array.isArray(parsed) ? parsed : []);
    _sessionsCache = result;
    _sessionsCacheAt = Date.now();
    return result;
  } catch {
    if (_sessionsCache !== null) return _sessionsCache;
    return [];
  }
}
