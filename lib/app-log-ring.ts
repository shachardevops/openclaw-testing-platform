import fs from 'fs';
import { appLogPath } from './config';

const MAX_LINES = 2000;
const POLL_INTERVAL = 2000;
const DEFAULT_WINDOW_MS = 30000;

interface LogLine {
  ts: number;
  text: string;
}

class AppLogRing {
  private _lines: LogLine[] = [];
  private _offset: number = 0;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _started: boolean = false;
  private _lastPath: string | null = null;

  start(): void {
    if (this._started) return;
    this._started = true;

    try {
      const logPath = appLogPath();
      this._lastPath = logPath;
      if (fs.existsSync(logPath)) {
        this._offset = fs.statSync(logPath).size;
      }
    } catch {}

    this._timer = setInterval(() => this._poll(), POLL_INTERVAL);
    setTimeout(() => this._poll(), 500);
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._started = false;
  }

  private _poll(): void {
    try {
      const logPath = appLogPath();

      if (logPath !== this._lastPath) {
        this._offset = 0;
        this._lastPath = logPath;
      }

      if (!fs.existsSync(logPath)) return;

      const stat = fs.statSync(logPath);
      const size = stat.size;

      if (size < this._offset) {
        this._offset = 0;
      }

      if (size <= this._offset) return;

      const length = Math.min(size - this._offset, 128 * 1024);
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

      if (this._lines.length > MAX_LINES) {
        this._lines = this._lines.slice(-MAX_LINES);
      }
    } catch {}
  }

  getSnapshot(windowMs: number = DEFAULT_WINDOW_MS, aroundTs: number | null = null): string {
    const center = aroundTs || Date.now();
    const halfWindow = Math.floor(windowMs / 2);
    const from = center - halfWindow;
    const to = center + halfWindow;

    const matched = this._lines.filter(l => l.ts >= from && l.ts <= to);
    return matched.map(l => l.text).join('\n');
  }

  getRecent(seconds: number = 30): string {
    const cutoff = Date.now() - (seconds * 1000);
    const matched = this._lines.filter(l => l.ts >= cutoff);
    return matched.map(l => l.text).join('\n');
  }

  getEntriesSince(sinceTs: number = 0): LogLine[] {
    return this._lines.filter((line) => line.ts > sinceTs);
  }

  get lineCount(): number {
    return this._lines.length;
  }
}

const appLogRing = new AppLogRing();
export default appLogRing;
