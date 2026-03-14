/**
 * Ruflo Consensus Sources — adapters for each health signal.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { resultsDir, bridgeLogPath } from '@/lib/config';
import { checkGatewayHealth } from '@/lib/openclaw-gateway';
import consensusEngine from './consensus.js';

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw/agents/main/sessions');

/**
 * Session Registry Source — reads from session manager registry.
 */
function sessionRegistryAdapter(sessionId, context) {
  const registry = context.registry;
  if (!registry) return { status: 'unknown', confidence: 0 };

  const entry = registry.get?.(sessionId);
  if (!entry) return { status: 'dead', confidence: 0.8, detail: 'not-in-registry' };

  return {
    status: entry.status === 'healthy' ? 'healthy' : entry.status === 'stale' ? 'stale' : 'dead',
    confidence: 1.0,
    detail: `registry:${entry.status}`,
  };
}

/**
 * Bridge Log Source — checks bridge.log mtime.
 */
function bridgeLogAdapter(sessionId, context) {
  try {
    const logPath = bridgeLogPath();
    if (!fs.existsSync(logPath)) return { status: 'unknown', confidence: 0 };

    const stat = fs.statSync(logPath);
    const ageMs = Date.now() - stat.mtimeMs;

    if (ageMs < 60000) return { status: 'healthy', confidence: 0.9, detail: `bridge-age:${Math.round(ageMs / 1000)}s` };
    if (ageMs < 300000) return { status: 'stale', confidence: 0.7, detail: `bridge-age:${Math.round(ageMs / 60000)}m` };
    return { status: 'dead', confidence: 0.5, detail: `bridge-age:${Math.round(ageMs / 60000)}m` };
  } catch {
    return { status: 'unknown', confidence: 0 };
  }
}

/**
 * Result File Source — checks result JSON updatedAt field.
 */
function resultFileAdapter(sessionId, context) {
  try {
    const taskId = context.taskId;
    if (!taskId) return { status: 'unknown', confidence: 0 };

    const filePath = path.join(resultsDir(), `${taskId}.json`);
    if (!fs.existsSync(filePath)) return { status: 'unknown', confidence: 0 };

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const updatedAt = data.updatedAt ? Date.parse(data.updatedAt) : 0;
    const stat = fs.statSync(filePath);
    const lastActivity = Math.max(updatedAt, stat.mtimeMs);
    const ageMs = Date.now() - lastActivity;

    if (data.status === 'passed' || data.status === 'failed') {
      return { status: 'healthy', confidence: 1.0, detail: `result:${data.status}` };
    }

    if (ageMs < 120000) return { status: 'healthy', confidence: 0.8 };
    if (ageMs < 600000) return { status: 'stale', confidence: 0.6 };
    return { status: 'dead', confidence: 0.4 };
  } catch {
    return { status: 'unknown', confidence: 0 };
  }
}

/**
 * Gateway Source — checks gateway health.
 */
async function gatewayAdapter(sessionId, context) {
  try {
    const health = await checkGatewayHealth();
    if (health.available && health.endpointsEnabled) {
      return { status: 'healthy', confidence: 0.7, detail: 'gateway-up' };
    }
    return { status: 'stale', confidence: 0.3, detail: 'gateway-down' };
  } catch {
    return { status: 'unknown', confidence: 0 };
  }
}

/**
 * Session JSONL Source — checks session JSONL file mtime.
 */
function sessionJsonlAdapter(sessionId, context) {
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return { status: 'dead', confidence: 0.6, detail: 'no-jsonl' };

    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;

    if (ageMs < 120000) return { status: 'healthy', confidence: 0.8 };
    if (ageMs < 600000) return { status: 'stale', confidence: 0.6 };
    return { status: 'dead', confidence: 0.4 };
  } catch {
    return { status: 'unknown', confidence: 0 };
  }
}

/**
 * Register all default sources with the consensus engine.
 */
export function registerDefaultSources() {
  consensusEngine.registerSource('session-registry', 2.0, sessionRegistryAdapter);
  consensusEngine.registerSource('bridge-log', 1.5, bridgeLogAdapter);
  consensusEngine.registerSource('result-file', 1.0, resultFileAdapter);
  consensusEngine.registerSource('gateway', 1.0, gatewayAdapter);
  consensusEngine.registerSource('session-jsonl', 1.0, sessionJsonlAdapter);
}

// Auto-register on import
registerDefaultSources();
