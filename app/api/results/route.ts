import fs from 'fs';
import path from 'path';
import { resultsDir, reportsDir } from '@/lib/config';
import { getTaskIdSet, getProjectConfig } from '@/lib/project-loader';
import { tryFinalizeFromReport } from '@/lib/report-parser';
import { normalizeResult } from '@/lib/normalize-status';
import orchestratorEngine from '@/lib/orchestrator-engine';
import learningLoop from '@/lib/learning-loop';
import { stopRecording, getRecordingStatus, listActiveRecordings } from '@/lib/screencast-recorder';
import { listSessionsSync } from '@/lib/openclaw';
import appLogRing from '@/lib/app-log-ring';
import eventBus from '@/lib/event-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cache results in memory — only re-read files whose mtime changed.
// This avoids reading 20+ JSON files from disk every 3 seconds.
let _cache: Record<string, { mtime: number; payload: any }> = {};
let _lastFullScan = 0;
const DIR_SCAN_TTL = 3000; // Only re-list directory every 3s

// Track findings we've already captured log snapshots for
const _capturedFindings = new Set<string>(); // "taskId::findingId"

// Start the app log ring buffer so we can snapshot on demand
appLogRing.start();

/** System-generated finding IDs — don't capture logs for these */
const SYSTEM_FINDING_IDS = new Set(['stale-timeout', 'cancelled-by-user', 'agent-crash', 'orchestrator-recovery']);

function snapshotsDir() {
  try {
    const { project } = getProjectConfig();
    return path.join(project.workspace || process.cwd(), 'log-snapshots');
  } catch {
    return path.join(process.cwd(), 'log-snapshots');
  }
}

/**
 * Capture an app log snapshot for a new finding.
 * Writes to workspace/log-snapshots/{taskId}/{findingId}.txt
 */
function captureLogSnapshot(taskId: string, findingId: string) {
  const key = `${taskId}::${findingId}`;
  if (_capturedFindings.has(key)) return;
  _capturedFindings.add(key);

  const snapshot = appLogRing.getRecent(30);
  if (!snapshot || snapshot.length < 5) return; // no meaningful log data

  try {
    const dir = path.join(snapshotsDir(), taskId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeFinding = findingId.replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(path.join(dir, `${safeFinding}.txt`), snapshot);
  } catch {}
}

export async function GET() {
  const rDir = resultsDir();
  const rpDir = reportsDir();
  const results: Record<string, any> = {};
  const taskIds = getTaskIdSet();
  const now = Date.now();
  let _sessions: any[] | null = null; // lazily loaded, cached for this request
  const getSessions = () => {
    if (_sessions === null) {
      try { _sessions = listSessionsSync(); } catch { _sessions = []; }
    }
    return _sessions!;
  };
  const isSessionAlive = (runSessionKey: string) => {
    if (!runSessionKey) return false;
    const sessions = getSessions();
    return sessions.some((s: any) =>
      s.key === runSessionKey ||
      (s.sessionId && runSessionKey.includes(s.sessionId))
    );
  };

  try {
    if (!fs.existsSync(rDir)) return Response.json(results);

    let suppressBefore = 0;
    try {
      const sys = JSON.parse(fs.readFileSync(path.join(rDir, 'system.json'), 'utf8'));
      suppressBefore = Number(sys?.suppressStoriesBeforeMs || 0);
    } catch {}

    // Only re-scan directory listing if TTL elapsed
    let files: string[];
    if (now - _lastFullScan < DIR_SCAN_TTL && Object.keys(_cache).length > 0) {
      // Use cached file list — just check mtimes of known files
      files = Object.keys(_cache).map(k => `${k}.json`);
      // Also check for new files periodically
    } else {
      files = fs.readdirSync(rDir).filter(f => f.endsWith('.json') && f !== 'system.json');
      _lastFullScan = now;
    }

    for (const file of files) {
      const key = file.replace('.json', '');
      const fullPath = path.join(rDir, file);

      // Check if file still exists
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        delete _cache[key];
        continue;
      }

      const mtime = stat.mtimeMs;
      const cached = _cache[key];

      let payload: any;
      if (cached && cached.mtime === mtime) {
        // File unchanged — use cached payload
        payload = cached.payload;
      } else {
        // File changed or new — read and cache
        try {
          payload = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        } catch {
          continue;
        }

        // Auto-finalize: check report
        const finalized = tryFinalizeFromReport(key, rpDir, payload);
        if (finalized) {
          fs.writeFileSync(fullPath, JSON.stringify(finalized, null, 2));
          // Feed finalized result to learning loop for pattern extraction
          try { learningLoop.learnFromResult(key, finalized, rpDir); } catch { /* best-effort */ }
          payload = finalized;
        }

        // Detect stale "running" tasks — auto-fail only as last resort.
        // When the orchestrator is active, defer to its escalation ladder
        // (nudge → swap → kill → respawn). Only auto-fail here if:
        //   - Orchestrator is NOT started, OR
        //   - Stale time exceeds 30 min (orchestrator had plenty of time)
        // IMPORTANT: Before auto-failing, check if the agent session is still
        // alive. If so, the task is genuinely running — just touch updatedAt.
        if (payload?.status === 'running' && taskIds.has(key)) {
          const startMs = payload.startedAt ? Date.parse(payload.startedAt) : 0;
          const updatedMs = payload.updatedAt ? Date.parse(payload.updatedAt) : startMs;
          const lastActivity = Math.max(updatedMs || 0, mtime || 0);
          const staleMs = now - lastActivity;
          const orchStatus = orchestratorEngine.getStatus();
          const orchActive = orchStatus.started && !orchStatus.paused;
          const autoFailThreshold = orchActive ? 30 * 60 * 1000 : 15 * 60 * 1000;

          if (staleMs > autoFailThreshold) {
            if (isSessionAlive(payload.runSessionKey)) {
              // Session still exists — task is running, refresh updatedAt
              payload = { ...payload, updatedAt: new Date().toISOString() };
              fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2));
            } else {
              payload = {
                ...payload,
                status: 'failed',
                finishedAt: new Date(lastActivity).toISOString(),
                lastLog: `Stale: no activity for ${Math.round(staleMs / 60000)}m — marked failed`,
                findings: [...(payload.findings || []), {
                  id: 'stale-timeout',
                  title: 'Run timed out',
                  description: `No activity detected for ${Math.round(staleMs / 60000)} minutes.${orchActive ? ' Orchestrator recovery was attempted but failed.' : ' The agent process likely crashed or was killed.'}`,
                }],
              };
              fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2));
            }
          }
        }

        _cache[key] = { mtime: fs.statSync(fullPath).mtimeMs, payload };

        // Auto-stop recording when task finishes
        if ((payload?.status === 'passed' || payload?.status === 'failed') && getRecordingStatus(key)) {
          try { stopRecording(key); } catch {}
        }
      }

      // Recover tasks that were auto-failed (stale-timeout) but whose session
      // is actually still alive. This handles the page-refresh scenario where
      // the auto-fail fired prematurely.
      if (payload?.status === 'failed' && taskIds.has(key) && payload.runSessionKey) {
        const hasStaleTimeout = (payload.findings || []).some((f: any) => f.id === 'stale-timeout');
        if (hasStaleTimeout) {
          try {
            if (isSessionAlive(payload.runSessionKey)) {
              // Remove stale-timeout finding and restore running status
              payload = {
                ...payload,
                status: 'running',
                finishedAt: undefined,
                updatedAt: new Date().toISOString(),
                lastLog: payload.lastLog?.startsWith('Stale:') ? undefined : payload.lastLog,
                findings: (payload.findings || []).filter((f: any) => f.id !== 'stale-timeout'),
              };
              fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2));
              _cache[key] = { mtime: fs.statSync(fullPath).mtimeMs, payload };
            }
          } catch {}
        }
      }

      // Suppress old results after a reset
      if (taskIds.has(key) && suppressBefore > 0) {
        const startMs = payload?.startedAt ? Date.parse(payload.startedAt) : NaN;
        const fallback = mtime || 0;
        if ((Number.isFinite(startMs) ? startMs : fallback) <= suppressBefore) continue;
      }

      // Auto-capture app log snapshots for new findings
      if (payload?.findings?.length > 0 && taskIds.has(key)) {
        for (const f of payload.findings) {
          const fid = f.id;
          if (!fid || SYSTEM_FINDING_IDS.has(fid)) continue;
          if (!_capturedFindings.has(`${key}::${fid}`)) {
            captureLogSnapshot(key, fid);
          }
        }
      }

      results[key] = normalizeResult(payload);
    }

    const activeRecordings = listActiveRecordings();
    for (const recording of activeRecordings) {
      const payload = results[recording.taskId];
      const isRunning = payload?.status === 'running';
      const sessionMissing = payload?.runSessionKey && !isSessionAlive(payload.runSessionKey);
      if (!isRunning || sessionMissing) {
        try { stopRecording(recording.taskId); } catch {}
      }
    }
  } catch {}

  // Emit SSE event if any results changed since last poll
  if (eventBus.listenerCount > 0) {
    eventBus.emit('results', results);
  }

  return Response.json(results);
}
