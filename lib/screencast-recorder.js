/**
 * Screencast Recorder — saves CDP screencast frames to disk during agent runs.
 *
 * Stores frames at ~1fps as JPEG files + a manifest that maps timestamps
 * to frames, page URLs, and session events (findings, tool calls, messages).
 *
 * Storage: workspace/recordings/{taskId}/
 *   ├── manifest.json    — frame index + events timeline
 *   ├── 000001.jpg       — frame files
 *   ├── 000002.jpg
 *   └── ...
 */

import fs from 'fs';
import path from 'path';
import { resultsDir, reportsDir } from './config.js';
import { getProjectConfig } from './project-loader.js';
import { parseFindingsFromReport } from './report-parser.js';
import {
  discoverTarget,
  startScreencast,
  DEFAULT_CDP_PORT,
} from './browser-screencast.js';
import appLogRing from './app-log-ring.js';

const APP_LOG_ERROR_PATTERNS = /error|err!|econnrefused|enotfound|eacces|eaddrinuse|typeerror|referenceerror|syntaxerror|failed|fatal|panic|unhandled/i;
const APP_LOG_WARN_PATTERNS = /warn|warning|deprecated|⚠/i;

function getWorkspace() {
  const { project } = getProjectConfig();
  return project.workspace || process.cwd();
}

function recordingsBaseDir() {
  return path.join(getWorkspace(), 'recordings');
}

function recordingDir(taskId) {
  return path.join(recordingsBaseDir(), taskId);
}

// ─── Active Recordings Registry ─────────────────────────────────

const activeRecordings = new Map(); // taskId → RecordingSession

class RecordingSession {
  constructor(taskId, opts = {}) {
    this.taskId = taskId;
    this.dir = recordingDir(taskId);
    this.frameInterval = opts.frameIntervalMs || 1000; // ~1fps
    this.quality = opts.quality || 45; // lower quality for storage
    this.maxWidth = opts.maxWidth || 1280;
    this.maxHeight = opts.maxHeight || 900;

    this.frameCount = 0;
    this.startedAt = null;
    this.stoppedAt = null;
    this.events = [];      // { ts, type, data }
    this.frames = [];      // { index, ts, pageUrl, file }
    this._screencast = null;
    this._lastFrameAt = 0;
    this._currentPageUrl = null;
    this._lastFrameSize = 0;     // byte size of last frame for change detection
    this._lastFrameHash = null;  // simple hash for dedup
    this._duplicateCount = 0;    // consecutive identical frames skipped
    this._maxStaleFrames = 30;   // skip after this many identical frames (~30s at 1fps)
    this._lastManifestSave = 0;  // periodic manifest saves for live viewing
    this._manifestSaveInterval = 5000; // save manifest every 5s
    this._lastSavedFrameAt = 0;        // for time-based keyframe guarantee
    this._keyframeIntervalMs = 15000;   // always save at least one frame every 15s
    this._lastAppLogTs = 0;
    this._appLogTimer = null;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._stopped = false;
  }

  async start() {
    appLogRing.start();
    this._stopped = false;

    // Create recording directory
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }

    this.startedAt = Date.now();
    this._lastAppLogTs = this.startedAt;
    this._lastSavedFrameAt = this.startedAt;

    this.addEvent('recording_started', {});
    this._appLogTimer = setInterval(() => this._captureAppLogEvents(), 2000);
    // Sync findings from result JSON periodically so they appear in the timeline
    // as the AI agent discovers them, not just when the recording stops.
    this._findingSyncTimer = setInterval(() => this.syncFindings(), 10000);

    // Try to connect to browser — if not available yet, keep retrying in background
    try {
      await this._connectScreencast();
      console.log(`[recorder:${this.taskId}] Recording started (browser connected)`);
    } catch (e) {
      console.log(`[recorder:${this.taskId}] Recording started (browser not ready yet, will retry: ${e.message})`);
      this._attemptReconnect();
    }
  }

  async _connectScreencast() {
    // Connect to browser
    let target;
    try {
      target = await discoverTarget(DEFAULT_CDP_PORT);
    } catch (e) {
      throw new Error(`Cannot connect to browser: ${e.message}`);
    }

    this._currentPageUrl = target.pageUrl;
    this.cdpTargetId = target.targetId;

    // Store CDP target ID in result file so the dashboard can match browser tabs to tasks
    try {
      const resultFile = path.join(resultsDir(), `${this.taskId}.json`);
      if (fs.existsSync(resultFile)) {
        const data = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
        data.cdpTargetId = target.targetId;
        fs.writeFileSync(resultFile, JSON.stringify(data, null, 2));
      }
    } catch { /* best-effort */ }

    this._screencast = startScreencast({
      wsUrl: target.wsUrl,
      format: 'jpeg',
      quality: this.quality,
      maxWidth: this.maxWidth,
      maxHeight: this.maxHeight,
      everyNthFrame: 1,
      keepaliveMs: 10000,
      onFrame: ({ data, metadata }) => {
        this._handleFrame(data, metadata);
      },
      onError: (e) => {
        console.error(`[recorder:${this.taskId}] Screencast error:`, e.message);
        this.addEvent('error', { message: e.message });
      },
      onClose: () => {
        console.log(`[recorder:${this.taskId}] Screencast connection closed`);
        this.addEvent('disconnected', {});
        this._attemptReconnect();
      },
    });
  }

  _attemptReconnect() {
    if (this._stopped) return;
    this._reconnectAttempts++;
    // Backoff: 3s, 6s, 9s, ... capped at 30s — no max attempts, keeps trying until stopped
    const delay = Math.min(3000 * this._reconnectAttempts, 30000);
    if (this._reconnectAttempts <= 5 || this._reconnectAttempts % 10 === 0) {
      console.log(`[recorder:${this.taskId}] Reconnecting in ${delay / 1000}s (attempt ${this._reconnectAttempts})`);
    }
    this._reconnectTimer = setTimeout(async () => {
      if (this._stopped) return;
      try {
        await this._connectScreencast();
        this._reconnectAttempts = 0;
        this.addEvent('reconnected', {});
        console.log(`[recorder:${this.taskId}] Reconnected successfully`);
      } catch (e) {
        if (this._reconnectAttempts <= 5 || this._reconnectAttempts % 10 === 0) {
          console.warn(`[recorder:${this.taskId}] Reconnect failed:`, e.message);
        }
        this._attemptReconnect();
      }
    }, delay);
  }

  _captureAppLogEvents() {
    const entries = appLogRing.getEntriesSince(this._lastAppLogTs);
    if (entries.length === 0) return;

    for (const entry of entries) {
      this._lastAppLogTs = Math.max(this._lastAppLogTs, entry.ts);

      const severity = APP_LOG_ERROR_PATTERNS.test(entry.text)
        ? 'error'
        : APP_LOG_WARN_PATTERNS.test(entry.text)
          ? 'warn'
          : null;

      if (!severity) continue;

      const lastEvent = this.events[this.events.length - 1];
      if (lastEvent?.type === 'app_log' && lastEvent.data?.text === entry.text) continue;

      this.addEvent('app_log', {
        severity,
        text: entry.text.slice(0, 220),
      });
    }
  }

  _handleFrame(base64Data, metadata) {
    const now = Date.now();
    // Throttle to ~1fps
    if (now - this._lastFrameAt < this.frameInterval) return;
    this._lastFrameAt = now;

    // Simple change detection: compare byte size + sample bytes
    // This avoids storing hundreds of identical frames when the page is idle
    const buf = Buffer.from(base64Data, 'base64');
    const frameSize = buf.length;
    const sampleHash = buf.length > 100
      ? `${frameSize}-${buf[100]}-${buf[Math.floor(buf.length / 2)]}-${buf[buf.length - 100]}`
      : `${frameSize}`;

    const timeSinceLastSaved = now - this._lastSavedFrameAt;
    const keyframeDue = timeSinceLastSaved >= this._keyframeIntervalMs;

    if (sampleHash === this._lastFrameHash) {
      this._duplicateCount++;
      // Skip identical frame unless a time-based keyframe is due
      if (this._duplicateCount < this._maxStaleFrames && !keyframeDue) {
        return;
      }
      this._duplicateCount = 0; // Reset, save this keyframe
    } else {
      this._duplicateCount = 0;
    }
    this._lastFrameHash = sampleHash;
    this._lastFrameSize = frameSize;
    this._lastSavedFrameAt = now;

    this.frameCount++;
    const index = this.frameCount;
    const fileName = `${String(index).padStart(6, '0')}.jpg`;
    const filePath = path.join(this.dir, fileName);

    // Write frame to disk
    try {
      fs.writeFileSync(filePath, buf);
    } catch (e) {
      console.error(`[recorder:${this.taskId}] Failed to write frame:`, e.message);
      return;
    }

    // Track page URL from metadata if available
    const elapsed = now - this.startedAt;

    this.frames.push({
      index,
      ts: elapsed,
      absTs: now,
      pageUrl: this._currentPageUrl,
      file: fileName,
      w: metadata.deviceWidth,
      h: metadata.deviceHeight,
    });

    // Periodic manifest save for live viewing
    if (now - this._lastManifestSave >= this._manifestSaveInterval) {
      this._saveManifest();
      this._lastManifestSave = now;
    }
  }

  addEvent(type, data) {
    const ts = this.startedAt ? Date.now() - this.startedAt : 0;
    this.events.push({ ts, absTs: Date.now(), type, data });
  }

  /**
   * Add a finding from the task results to the timeline.
   * Uses createdAt timestamp to position the marker correctly in the timeline.
   */
  addFinding(finding) {
    const data = {
      id: finding.id,
      severity: finding.severity,
      title: finding.title,
      module: finding.module,
      viewport: finding.viewport || null,
    };

    // Use the finding's own timestamp if available, so the marker appears
    // at the correct position in the timeline (not when sync happened).
    const rawTs = finding.createdAt || finding.foundAt || finding.timestamp;
    const findingAbsTs = rawTs ? Date.parse(rawTs) : null;
    if (findingAbsTs && this.startedAt && findingAbsTs >= this.startedAt) {
      const ts = findingAbsTs - this.startedAt;
      this.events.push({ ts, absTs: findingAbsTs, type: 'finding', data });
    } else {
      this.addEvent('finding', data);
    }
  }

  /**
   * Add a page navigation event.
   */
  addNavigation(url) {
    this._currentPageUrl = url;
    this.addEvent('navigation', { url });
  }

  /**
   * Add a session message event (from session history).
   */
  addSessionEvent(kind, text) {
    this.addEvent('session', { kind, text: text?.slice(0, 200) });
  }

  stop() {
    this._stopped = true;
    this.stoppedAt = Date.now();

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._appLogTimer) {
      clearInterval(this._appLogTimer);
      this._appLogTimer = null;
    }

    if (this._findingSyncTimer) {
      clearInterval(this._findingSyncTimer);
      this._findingSyncTimer = null;
    }

    this._captureAppLogEvents();

    if (this._screencast) {
      this._screencast.stop();
      this._screencast = null;
    }

    this.addEvent('recording_stopped', {});
    this._saveManifest();

    console.log(`[recorder:${this.taskId}] Stopped. ${this.frameCount} frames, ${this.events.length} events`);
  }

  _saveManifest() {
    const manifest = {
      taskId: this.taskId,
      startedAt: new Date(this.startedAt).toISOString(),
      stoppedAt: this.stoppedAt ? new Date(this.stoppedAt).toISOString() : null,
      durationMs: this.stoppedAt ? this.stoppedAt - this.startedAt : Date.now() - this.startedAt,
      active: !this.stoppedAt,
      frameCount: this.frameCount,
      frameIntervalMs: this.frameInterval,
      frames: this.frames,
      events: this.events,
    };

    try {
      fs.writeFileSync(
        path.join(this.dir, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n'
      );
    } catch (e) {
      console.error(`[recorder:${this.taskId}] Failed to save manifest:`, e.message);
    }
  }

  /**
   * Sync findings from task results AND report markdown into the timeline.
   * Called every 10s during recording and once at stop.
   */
  syncFindings() {
    const existingIds = new Set(
      this.events.filter(e => e.type === 'finding').map(e => e.data.id)
    );

    // Source 1: result JSON findings (bugs written by the AI agent)
    try {
      const resultFile = path.join(resultsDir(), `${this.taskId}.json`);
      if (fs.existsSync(resultFile)) {
        const data = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
        for (const f of (data.findings || [])) {
          if (f.id && !existingIds.has(f.id)) {
            this.addFinding(f);
            existingIds.add(f.id);
          }
        }
      }
    } catch {}

    // Source 2: report markdown (warnings that the AI writes in the report
    // but doesn't add to the result JSON findings array)
    try {
      const reportFile = path.join(reportsDir(), `${this.taskId}.md`);
      if (fs.existsSync(reportFile)) {
        const markdown = fs.readFileSync(reportFile, 'utf8');
        const reportFindings = parseFindingsFromReport(markdown);
        for (const f of reportFindings) {
          if (f.id && !existingIds.has(f.id)) {
            this.addFinding(f);
            existingIds.add(f.id);
          }
        }
      }
    } catch {}
  }

  getStatus() {
    return {
      taskId: this.taskId,
      recording: !!this._screencast,
      frameCount: this.frameCount,
      eventCount: this.events.length,
      cdpTargetId: this.cdpTargetId || null,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      durationMs: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Start recording for a task.
 */
async function startRecording(taskId, opts = {}) {
  if (activeRecordings.has(taskId)) {
    return { ok: false, error: `Already recording ${taskId}` };
  }
  const session = new RecordingSession(taskId, opts);
  activeRecordings.set(taskId, session);
  // start() now handles browser-not-ready gracefully (retries in background)
  await session.start();
  return { ok: true, status: session.getStatus() };
}

/**
 * Stop recording for a task. Syncs findings before stopping.
 */
function stopRecording(taskId) {
  const session = activeRecordings.get(taskId);
  if (!session) return { ok: false, error: `No active recording for ${taskId}` };

  session.syncFindings();
  session.stop();
  activeRecordings.delete(taskId);
  return { ok: true, frameCount: session.frameCount, eventCount: session.events.length };
}

/**
 * Add an event to an active recording.
 */
function addRecordingEvent(taskId, type, data) {
  const session = activeRecordings.get(taskId);
  if (!session) return;
  session.addEvent(type, data);
}

/**
 * Sync findings for an active recording.
 */
function syncRecordingFindings(taskId) {
  const session = activeRecordings.get(taskId);
  if (!session) return;
  session.syncFindings();
}

/**
 * Get status of an active recording.
 */
function getRecordingStatus(taskId) {
  const session = activeRecordings.get(taskId);
  if (!session) return null;
  return session.getStatus();
}

function listActiveRecordings() {
  return [...activeRecordings.values()].map((session) => session.getStatus());
}

/**
 * List all recordings (active + saved).
 */
function listRecordings() {
  const active = [];
  for (const [taskId, session] of activeRecordings) {
    active.push({ ...session.getStatus(), active: true });
  }

  const saved = [];
  const baseDir = recordingsBaseDir();
  if (fs.existsSync(baseDir)) {
    for (const dir of fs.readdirSync(baseDir)) {
      const manifestPath = path.join(baseDir, dir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          saved.push({
            taskId: manifest.taskId,
            startedAt: manifest.startedAt,
            stoppedAt: manifest.stoppedAt,
            durationMs: manifest.durationMs,
            frameCount: manifest.frameCount,
            eventCount: manifest.events?.length || 0,
            findingCount: manifest.events?.filter(e => e.type === 'finding').length || 0,
            active: activeRecordings.has(manifest.taskId),
          });
        } catch {}
      }
    }
  }

  return { active, saved };
}

/**
 * Load a saved recording manifest.
 */
function loadManifest(taskId) {
  const manifestPath = path.join(recordingDir(taskId), 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Check if recording is still actively running
    manifest.active = activeRecordings.has(taskId);
    return manifest;
  } catch {
    return null;
  }
}

/**
 * Check if a recording manifest exists for a task (lightweight, no parsing).
 */
function recordingExists(taskId) {
  return fs.existsSync(path.join(recordingDir(taskId), 'manifest.json'));
}

/**
 * Get the file path for a recording frame.
 */
function getFramePath(taskId, fileName) {
  const framePath = path.join(recordingDir(taskId), fileName);
  if (!fs.existsSync(framePath)) return null;
  return framePath;
}

export {
  startRecording,
  stopRecording,
  addRecordingEvent,
  syncRecordingFindings,
  getRecordingStatus,
  listActiveRecordings,
  listRecordings,
  loadManifest,
  getFramePath,
  recordingExists,
};
