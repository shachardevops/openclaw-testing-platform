import path from 'path';
import fs from 'fs';
import os from 'os';
import { getProjectConfig } from './project-loader';

import type { TargetAppConfig } from '@/types/config';
import type { PipelineConfig } from '@/types/config';

export const BASE_DIR = process.cwd();

/** Resolve ~ to os.homedir() for cross-platform path support */
export function resolvePath(p: string | undefined | null): string | undefined | null {
  if (!p || typeof p !== 'string') return p;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (p === '~') return os.homedir();
  return p;
}

// Workspace: where OpenClaw reads/writes results.
let _workspace: string | null = null;
function getWorkspace(): string {
  if (_workspace) return _workspace;
  const { project } = getProjectConfig();
  _workspace = (resolvePath(project.workspace) as string) || BASE_DIR;
  return _workspace;
}

export function resultsDir(): string { return path.join(getWorkspace(), 'results'); }
export function reportsDir(): string { return path.join(getWorkspace(), 'reports-md'); }
export function bridgeLogPath(): string { return path.join(resultsDir(), 'bridge.log'); }
export function statePath(): string { return path.join(getWorkspace(), 'dashboard-state.json'); }

export function appLogPath(): string {
  const { project } = getProjectConfig();
  return (resolvePath(project.targetApp?.logFile) as string) || path.join(getWorkspace(), 'app-server.log');
}

export function targetAppConfig(): (TargetAppConfig & { path?: string; logFile?: string }) | null {
  const { project } = getProjectConfig();
  const cfg = project.targetApp || null;
  if (cfg) {
    return { ...cfg, path: resolvePath(cfg.path) as string | undefined, logFile: resolvePath(cfg.logFile) as string | undefined };
  }
  return cfg;
}

export function readPipelineConfig(): PipelineConfig {
  const { pipelineConfig } = getProjectConfig();
  if (pipelineConfig && Object.keys(pipelineConfig).length > 0) return pipelineConfig;
  // Fallback to root pipeline-config.json
  const PIPELINE_CONFIG_FILE = path.join(BASE_DIR, 'pipeline-config.json');
  try { return JSON.parse(fs.readFileSync(PIPELINE_CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

/**
 * Write a corrected controller session ID back to the project's pipeline-config.json.
 * Called when getControllerSessionId() detects a stale UUID and resolves by key.
 */
export function updatePipelineControllerSession(sessionId: string): void {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    const configPath = path.join(BASE_DIR, 'config', projectId, 'pipeline-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.controllerSessionId = sessionId;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      console.log('[config] Updated controllerSessionId in pipeline-config.json:', sessionId);
    }
  } catch (e: unknown) {
    console.error('[config] Failed to update controllerSessionId:', (e as Error).message);
  }
}

// Keep PIPELINE_CONFIG_FILE export for backwards compat
export const PIPELINE_CONFIG_FILE = path.join(BASE_DIR, 'pipeline-config.json');

// Ensure results dir on import
const rd = resultsDir();
if (!fs.existsSync(rd)) fs.mkdirSync(rd, { recursive: true });
