/**
 * Ruflo Checkpoint Store — per-task checkpoint persistence.
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';

function getCheckpointsDir() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory', 'checkpoints');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory', 'checkpoints');
  }
}

/**
 * Record a checkpoint for a task.
 */
export function recordCheckpoint(taskId, checkpoint) {
  const dir = getCheckpointsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${taskId}.json`);
  let data = { checkpoints: [] };
  try {
    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch { /* fresh */ }

  data.checkpoints.push({
    ...checkpoint,
    ts: Date.now(),
  });
  data.lastCheckpoint = checkpoint.name || checkpoint.id;
  data.updatedAt = new Date().toISOString();

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Get checkpoint progress for a task.
 */
export function getProgress(taskId) {
  const filePath = path.join(getCheckpointsDir(), `${taskId}.json`);
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Verify that required checkpoints have been reached.
 */
export function verifyCheckpoints(taskId, requiredCheckpoints = []) {
  const progress = getProgress(taskId);
  if (!progress || !progress.checkpoints) return { complete: false, missing: requiredCheckpoints };

  const reached = new Set(progress.checkpoints.map(c => c.name || c.id));
  const missing = requiredCheckpoints.filter(c => !reached.has(c));

  return {
    complete: missing.length === 0,
    reached: [...reached],
    missing,
    total: requiredCheckpoints.length,
    completed: requiredCheckpoints.length - missing.length,
  };
}

/**
 * Clear checkpoints for a task (on reset/restart).
 */
export function clearCheckpoints(taskId) {
  const filePath = path.join(getCheckpointsDir(), `${taskId}.json`);
  try {
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  } catch { /* best-effort */ }
}
