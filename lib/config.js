import path from 'path';
import fs from 'fs';
import { getProjectConfig } from './project-loader.js';

export const BASE_DIR = process.cwd();

// Workspace: where OpenClaw reads/writes results.
let _workspace = null;
function getWorkspace() {
  if (_workspace) return _workspace;
  const { project } = getProjectConfig();
  _workspace = project.workspace || BASE_DIR;
  return _workspace;
}

export function resultsDir() { return path.join(getWorkspace(), 'results'); }
export function reportsDir() { return path.join(getWorkspace(), 'reports-md'); }
export function bridgeLogPath() { return path.join(resultsDir(), 'bridge.log'); }
export function statePath() { return path.join(getWorkspace(), 'dashboard-state.json'); }

export function appLogPath() {
  const { project } = getProjectConfig();
  return project.targetApp?.logFile || path.join(getWorkspace(), 'app-server.log');
}

export function targetAppConfig() {
  const { project } = getProjectConfig();
  return project.targetApp || null;
}

export function readPipelineConfig() {
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
export function updatePipelineControllerSession(sessionId) {
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
  } catch (e) {
    console.error('[config] Failed to update controllerSessionId:', e.message);
  }
}

// Keep PIPELINE_CONFIG_FILE export for backwards compat
export const PIPELINE_CONFIG_FILE = path.join(BASE_DIR, 'pipeline-config.json');

// Ensure results dir on import
const rd = resultsDir();
if (!fs.existsSync(rd)) fs.mkdirSync(rd, { recursive: true });
