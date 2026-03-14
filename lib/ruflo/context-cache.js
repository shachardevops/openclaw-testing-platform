/**
 * Ruflo Context Cache — per-story context cache with LRU eviction.
 *
 * Invalidates when: memory file mtimes change, new run completes.
 * LRU capacity: 16 stories.
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';

const MAX_CACHE_SIZE = 16;

const _cache = new Map(); // storyId -> { context, cachedAt, memoryMtimes }
const _accessOrder = []; // LRU tracking

function getMemoryDir() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory');
  }
}

function getMemoryMtimes() {
  const memoryDir = getMemoryDir();
  const mtimes = {};
  const files = ['known-bugs.md', 'module-notes.md', 'run-log.md', 'agent-issues.md'];

  for (const file of files) {
    try {
      const p = path.join(memoryDir, file);
      if (fs.existsSync(p)) {
        mtimes[file] = fs.statSync(p).mtimeMs;
      }
    } catch { /* skip */ }
  }

  return mtimes;
}

function mtimesMatch(a, b) {
  const keysA = Object.keys(a || {});
  const keysB = Object.keys(b || {});
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Get cached context for a story.
 * Returns null if not cached or invalidated.
 */
export function getContextCache(storyId) {
  const entry = _cache.get(storyId);
  if (!entry) return null;

  // Check if memory files have changed
  const currentMtimes = getMemoryMtimes();
  if (!mtimesMatch(entry.memoryMtimes, currentMtimes)) {
    _cache.delete(storyId);
    return null;
  }

  // Update LRU access
  const idx = _accessOrder.indexOf(storyId);
  if (idx >= 0) _accessOrder.splice(idx, 1);
  _accessOrder.push(storyId);

  return entry.context;
}

/**
 * Set cached context for a story.
 */
export function setContextCache(storyId, context) {
  // LRU eviction
  if (_cache.size >= MAX_CACHE_SIZE && !_cache.has(storyId)) {
    const oldest = _accessOrder.shift();
    if (oldest) _cache.delete(oldest);
  }

  _cache.set(storyId, {
    context,
    cachedAt: Date.now(),
    memoryMtimes: getMemoryMtimes(),
  });

  // Update LRU
  const idx = _accessOrder.indexOf(storyId);
  if (idx >= 0) _accessOrder.splice(idx, 1);
  _accessOrder.push(storyId);
}

/**
 * Invalidate all cached contexts (e.g., after a run completes).
 */
export function invalidateContextCache() {
  _cache.clear();
  _accessOrder.length = 0;
}

/**
 * Get cache stats.
 */
export function getContextCacheStats() {
  return {
    size: _cache.size,
    maxSize: MAX_CACHE_SIZE,
    stories: [..._cache.keys()],
  };
}
