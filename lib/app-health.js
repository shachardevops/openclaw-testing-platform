/**
 * Target App Health Monitor — server-side singleton.
 *
 * Pings the target app's port on a configurable interval.
 * Other modules (session-manager, orchestrator-engine, API routes)
 * call isHealthy() to gate actions when the app is down.
 */

import http from 'http';
import { getProjectConfig } from './project-loader.js';

const CHECK_INTERVAL_MS = 10000; // 10s
const TIMEOUT_MS = 3000;

class AppHealthMonitor {
  constructor() {
    this._healthy = null; // null = unknown, true/false after first check
    this._lastCheckAt = null;
    this._consecutiveFailures = 0;
    this._lastError = null;
    this._timer = null;
    this._started = false;
  }

  start() {
    if (this._started) return;
    this._started = true;
    this._check();
    this._timer = setInterval(() => this._check(), CHECK_INTERVAL_MS);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._started = false;
  }

  /** Returns true if the target app is reachable, false if down, null if unknown */
  isHealthy() {
    return this._healthy;
  }

  /** Full status snapshot */
  getStatus() {
    const config = this._getConfig();
    return {
      healthy: this._healthy,
      lastCheckAt: this._lastCheckAt,
      consecutiveFailures: this._consecutiveFailures,
      lastError: this._lastError,
      port: config?.port || null,
      name: config?.name || null,
    };
  }

  _getConfig() {
    try {
      const { project } = getProjectConfig();
      return project.targetApp || null;
    } catch {
      return null;
    }
  }

  _check() {
    const config = this._getConfig();
    if (!config || !config.port) {
      this._healthy = null; // no target app configured
      return;
    }

    const url = `http://localhost:${config.port}`;
    const req = http.get(url, { timeout: TIMEOUT_MS }, (res) => {
      // Any response (even 500) means the server is up
      this._healthy = true;
      this._consecutiveFailures = 0;
      this._lastError = null;
      this._lastCheckAt = Date.now();
      res.resume(); // drain
    });

    req.on('error', (err) => {
      this._healthy = false;
      this._consecutiveFailures++;
      this._lastError = err.message;
      this._lastCheckAt = Date.now();
    });

    req.on('timeout', () => {
      req.destroy();
      this._healthy = false;
      this._consecutiveFailures++;
      this._lastError = 'timeout';
      this._lastCheckAt = Date.now();
    });
  }
}

const appHealth = new AppHealthMonitor();
export default appHealth;
