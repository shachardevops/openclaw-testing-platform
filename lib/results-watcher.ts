/**
 * File-system watcher for the results directory.
 * Uses fs.watch for push-based SSE events instead of relying solely on poll requests.
 *
 * Singleton — starts lazily on first SSE connection via `ensureWatching()`.
 */

import fs from 'fs';
import path from 'path';
import { resultsDir } from '@/lib/config';
import eventBus from '@/lib/event-bus';

class ResultsWatcher {
  private _watcher: fs.FSWatcher | null = null;
  private _started = false;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingFiles = new Set<string>();
  private _dir: string | null = null;

  /** Debounce window in ms — multiple rapid changes produce one event */
  private readonly DEBOUNCE_MS = 100;

  /**
   * Start watching if not already started. Safe to call multiple times.
   */
  ensureWatching(): void {
    if (this._started) return;
    this._started = true;
    this._tryWatch();
  }

  /**
   * Stop watching and clean up resources.
   */
  stop(): void {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._pendingFiles.clear();
    this._started = false;
  }

  get watching(): boolean {
    return this._watcher !== null;
  }

  // -------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------

  private _tryWatch(): void {
    const dir = resultsDir();
    this._dir = dir;

    if (fs.existsSync(dir)) {
      this._attachWatcher(dir);
      return;
    }

    // Directory doesn't exist yet — watch the parent so we know when it appears
    const parent = path.dirname(dir);
    if (!fs.existsSync(parent)) {
      // Parent also missing — create it (resultsDir setup in config.ts may not have run yet)
      try {
        fs.mkdirSync(parent, { recursive: true });
      } catch {
        // If we can't create it, retry on a timer
        this._retryLater();
        return;
      }
    }

    let parentWatcher: fs.FSWatcher | null = null;
    try {
      parentWatcher = fs.watch(parent, (eventType, filename) => {
        if (filename === path.basename(dir) && fs.existsSync(dir)) {
          // Results directory just appeared — switch to watching it
          if (parentWatcher) {
            parentWatcher.close();
            parentWatcher = null;
          }
          this._attachWatcher(dir);
        }
      });
      parentWatcher.on('error', () => {
        if (parentWatcher) {
          parentWatcher.close();
          parentWatcher = null;
        }
        this._retryLater();
      });
    } catch {
      this._retryLater();
    }
  }

  private _attachWatcher(dir: string): void {
    // Clean up any existing watcher
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }

    try {
      this._watcher = fs.watch(dir, (eventType, filename) => {
        if (!filename || !filename.endsWith('.json') || filename === 'system.json') return;
        this._scheduleEmit(filename);
      });

      this._watcher.on('error', (err) => {
        console.error('[results-watcher] fs.watch error:', err.message);
        if (this._watcher) {
          this._watcher.close();
          this._watcher = null;
        }
        // Retry after a delay — directory may have been deleted and recreated
        this._retryLater();
      });
    } catch (err) {
      console.error('[results-watcher] Failed to attach watcher:', (err as Error).message);
      this._retryLater();
    }
  }

  /**
   * Debounce: accumulate changed filenames, then emit once after DEBOUNCE_MS of quiet.
   */
  private _scheduleEmit(filename: string): void {
    this._pendingFiles.add(filename);

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._flush();
    }, this.DEBOUNCE_MS);
  }

  private _flush(): void {
    if (this._pendingFiles.size === 0) return;
    if (eventBus.listenerCount === 0) {
      // No SSE clients — skip the disk reads
      this._pendingFiles.clear();
      return;
    }

    const dir = this._dir || resultsDir();
    const changed: Record<string, unknown> = {};

    for (const filename of this._pendingFiles) {
      const fullPath = path.join(dir, filename);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const taskId = filename.replace('.json', '');
        changed[taskId] = JSON.parse(content);
      } catch {
        // File may have been deleted between the watch event and now — skip
      }
    }

    this._pendingFiles.clear();

    if (Object.keys(changed).length > 0) {
      eventBus.emit('results:changed', changed);
    }
  }

  /**
   * Retry watching after a short delay (e.g. directory was deleted).
   */
  private _retryLater(): void {
    setTimeout(() => {
      if (this._started && !this._watcher) {
        this._tryWatch();
      }
    }, 2000);
  }
}

const resultsWatcher = new ResultsWatcher();
export default resultsWatcher;
