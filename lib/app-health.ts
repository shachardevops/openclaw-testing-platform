import http from 'http';
import { getProjectConfig } from './project-loader';
import { registry } from './service-registry';

import type { TargetAppConfig } from '@/types/config';

const CHECK_INTERVAL_MS = 10000;
const TIMEOUT_MS = 3000;

class AppHealthMonitor {
  private _healthy: boolean | null = null;
  private _lastCheckAt: number | null = null;
  private _consecutiveFailures: number = 0;
  private _lastError: string | null = null;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _started: boolean = false;

  start(): void {
    if (this._started) return;
    this._started = true;
    this._check();
    this._timer = setInterval(() => this._check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._started = false;
  }

  isHealthy(): boolean | null {
    return this._healthy;
  }

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

  private _getConfig(): TargetAppConfig | null {
    try {
      const { project } = getProjectConfig();
      return project.targetApp || null;
    } catch {
      return null;
    }
  }

  private _check(): void {
    const config = this._getConfig();
    if (!config || !config.port) {
      this._healthy = null;
      return;
    }

    const url = `http://localhost:${config.port}`;
    const req = http.get(url, { timeout: TIMEOUT_MS }, (res) => {
      this._healthy = true;
      this._consecutiveFailures = 0;
      this._lastError = null;
      this._lastCheckAt = Date.now();
      res.resume();
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
registry.register('appHealth', () => appHealth);
export default appHealth;
