/**
 * App Log Ring Buffer — keeps a rolling window of timestamped app log lines
 * in memory. Used to capture log snapshots when findings/bugs are detected.
 *
 * Reads the app server log file every 2s and stores lines with timestamps.
 * Can return all lines within a time window (e.g., last 30 seconds).
 */

import fs from 'fs';
import { appLogPath } from './config.js';

const MAX_LINES = 2000;        // keep last 2000 lines in memory
const POLL_INTERVAL = 2000;    // read new bytes every 2s
const DEFAULT_WINDOW_MS = 30000; // 30-second snapshot window

class AppLogRing {
  constructor() {
    this._lines = [];          // { ts: number, text: string }[]
    this._offset = 0;          // byte offset in the log file
    this._timer = null;
    this._started = false;
    this._lastPath = null;
  }

  start() {
    if (this._started) return;
    this._started = true;

    // Initialize offset to current end of file (only capture new lines)
    try {
      const logPath = appLogPath();
      this._lastPath = logPath;
      if (fs.existsSync(logPath)) {
        this._offset = fs.statSync(logPath).size;
      }
    } catch {}

    this._timer = setInterval(() => this._poll(), POLL_INTERVAL);
    // First poll after short delay
    setTimeout(() => this._poll(), 500);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._started = false;
  }

  _poll() {
    try {
      const logPath = appLogPath();

      // If log file changed (e.g., restart), reset offset
      if (logPath !== this._lastPath) {
        this._offset = 0;
        this._lastPath = logPath;
      }

      if (!fs.existsSync(logPath)) return;

      const stat = fs.statSync(logPath);
      const size = stat.size;

      // File was truncated/rotated — reset
      if (size < this._offset) {
        this._offset = 0;
      }

      if (size <= this._offset) return;

      // Read new bytes
      const length = Math.min(size - this._offset, 128 * 1024); // cap at 128KB per poll
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, this._offset);
      fs.closeSync(fd);
      this._offset += length;

      const now = Date.now();
      const text = buf.toString('utf8');
      const newLines = text.split('\n').filter(Boolean);

      for (const line of newLines) {
        this._lines.push({ ts: now, text: line });
      }

      // Trim to max size
      if (this._lines.length > MAX_LINES) {
        this._lines = this._lines.slice(-MAX_LINES);
      }
    } catch {}
  }

  /**
   * Get lines within a time window.
   * @param {number} [windowMs=30000] - How far back to look (in ms)
   * @param {number} [aroundTs] - Center the window around this timestamp (default: now)
   * @returns {string} - Joined log lines
   */
  getSnapshot(windowMs = DEFAULT_WINDOW_MS, aroundTs = null) {
    const center = aroundTs || Date.now();
    const halfWindow = Math.floor(windowMs / 2);
    const from = center - halfWindow;
    const to = center + halfWindow;

    const matched = this._lines.filter(l => l.ts >= from && l.ts <= to);
    return matched.map(l => l.text).join('\n');
  }

  /**
   * Get the last N seconds of log lines.
   */
  getRecent(seconds = 30) {
    const cutoff = Date.now() - (seconds * 1000);
    const matched = this._lines.filter(l => l.ts >= cutoff);
    return matched.map(l => l.text).join('\n');
  }

  getEntriesSince(sinceTs = 0) {
    return this._lines.filter((line) => line.ts > sinceTs);
  }

  get lineCount() {
    return this._lines.length;
  }
}

// Module-level singleton
const appLogRing = new AppLogRing();
export default appLogRing;
