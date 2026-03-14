import { execFileSync, execFile, spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { readPipelineConfig, updatePipelineControllerSession } from './config';

const SESSIONS_INDEX = path.join(os.homedir(), '.openclaw/agents/main/sessions/sessions.json');

let _controllerCache: string | null = null;
let _controllerCacheAt = 0;
const CONTROLLER_CACHE_TTL = 30000;

interface SessionEntry {
  sessionId: string;
  id?: string;
  key?: string;
  updatedAt?: number;
  model?: string;
  label?: string;
  kind?: string;
  taskId?: string;
  [key: string]: any;
}

export function getControllerSessionId(): string | null {
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

    if (!String(raw).includes(':')) {
      const sessions = listSessionsSync();
      const exists = sessions.find(s => s.sessionId === raw || s.id === raw);
      if (exists) {
        _controllerCache = raw as string;
        _controllerCacheAt = now;
        return raw as string;
      }
      const match = sessions.find(s => s.key === 'agent:main:main');
      if (match) {
        const resolved = match.sessionId || match.id;
        console.log('[getControllerSessionId] Stale UUID', raw, '→ resolved by key to', resolved);
        updatePipelineControllerSession(resolved!);
        _controllerCache = resolved!;
        _controllerCacheAt = now;
        return resolved!;
      }
      _controllerCache = raw as string;
      _controllerCacheAt = now;
      return raw as string;
    }

    const sessions = listSessionsSync();
    const match = sessions.find(s => s.key === raw);
    const result = match?.sessionId || match?.id || null;
    _controllerCache = result || null;
    _controllerCacheAt = now;
    return result || null;
  } catch {
    const fallback = process.env.OPENCLAW_SESSION_ID || null;
    _controllerCache = fallback;
    _controllerCacheAt = now;
    return fallback;
  }
}

export function execAgent(sessionId: string, message: string, opts: { timeout?: number } = {}): Promise<string> {
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

export function spawnAgent(sessionId: string, message: string, logPath: string): ChildProcess {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const out = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn('openclaw', [
    'agent', '--session-id', sessionId,
    '--message', message, '--json',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout!.pipe(out);
  child.stderr!.pipe(out);
  child.unref();
  return child;
}

let _sessionsCache: SessionEntry[] | null = null;
let _sessionsCacheAt = 0;
let _sessionsFetching: Promise<SessionEntry[]> | null = null;
const SESSIONS_CACHE_TTL = 15000;

function readSessionsFromFile(): SessionEntry[] | null {
  try {
    const raw = fs.readFileSync(SESSIONS_INDEX, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return Object.entries(data).map(([key, session]: [string, any]) => ({
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

export function listSessions(): Promise<SessionEntry[]> {
  const now = Date.now();

  if (_sessionsCache !== null && now - _sessionsCacheAt < SESSIONS_CACHE_TTL) {
    return Promise.resolve(_sessionsCache);
  }

  const fromFile = readSessionsFromFile();
  if (fromFile !== null) {
    _sessionsCache = fromFile;
    _sessionsCacheAt = Date.now();
    return Promise.resolve(fromFile);
  }

  if (_sessionsFetching) return _sessionsFetching;

  _sessionsFetching = new Promise<SessionEntry[]>((resolve) => {
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
        const result: SessionEntry[] = Array.isArray(parsed.sessions) ? parsed.sessions : (Array.isArray(parsed) ? parsed : []);
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

export function invalidateSessionsCache(): void {
  _sessionsCache = null;
  _sessionsCacheAt = 0;
}

export function listSessionsSync(): SessionEntry[] {
  if (_sessionsCache !== null && Date.now() - _sessionsCacheAt < SESSIONS_CACHE_TTL) {
    return _sessionsCache;
  }

  const fromFile = readSessionsFromFile();
  if (fromFile !== null) {
    _sessionsCache = fromFile;
    _sessionsCacheAt = Date.now();
    return fromFile;
  }

  try {
    const out = execFileSync('openclaw', ['sessions', '--json'], { encoding: 'utf8', timeout: 8000 });
    const parsed = JSON.parse(out || '{}');
    const result: SessionEntry[] = Array.isArray(parsed.sessions) ? parsed.sessions : (Array.isArray(parsed) ? parsed : []);
    _sessionsCache = result;
    _sessionsCacheAt = Date.now();
    return result;
  } catch {
    if (_sessionsCache !== null) return _sessionsCache;
    return [];
  }
}
