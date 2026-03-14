/**
 * Hierarchical Memory Tiers — inspired by ruflo's three-tier memory architecture
 * (working → episodic → semantic) with importance scoring and consolidation.
 *
 * Tiers:
 *   Working Memory  — fast, volatile, current session data (LRU eviction)
 *   Episodic Memory  — recent patterns with importance scoring (time-decayed)
 *   Semantic Memory  — consolidated persistent knowledge (high-importance only)
 *
 * Knowledge flow: working → episodic (on task complete) → semantic (on consolidation)
 *
 * Integration:
 *   - Learning loop stores to episodic
 *   - Orchestrator queries working + episodic for decisions
 *   - Agent context enrichment reads semantic for high-value patterns
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  enabled: true,
  working: { maxEntries: 100, ttlMs: 600000 },       // 10 min
  episodic: { maxEntries: 500, decayHalfLifeMs: 86400000 },  // 24h half-life
  semantic: { maxEntries: 200, minImportance: 0.7 },
  consolidationIntervalMs: 300000,  // consolidate every 5 min
};

function loadMemoryConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.memoryTiers || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function getMemoryDir() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory');
  }
}

// ---------------------------------------------------------------------------
// Working Memory — fast, volatile, LRU
// ---------------------------------------------------------------------------

class WorkingMemory {
  constructor(config) {
    this._maxEntries = config.maxEntries || 100;
    this._ttlMs = config.ttlMs || 600000;
    this._entries = new Map(); // key -> { value, ts, accessCount }
  }

  set(key, value) {
    this._evictExpired();
    this._entries.set(key, { value, ts: Date.now(), accessCount: 1 });
    if (this._entries.size > this._maxEntries) {
      // Evict least recently used
      const oldest = [...this._entries.entries()]
        .sort(([, a], [, b]) => a.ts - b.ts)[0];
      if (oldest) this._entries.delete(oldest[0]);
    }
  }

  get(key) {
    const entry = this._entries.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this._ttlMs) {
      this._entries.delete(key);
      return null;
    }
    entry.accessCount++;
    entry.ts = Date.now(); // touch
    return entry.value;
  }

  getAll() {
    this._evictExpired();
    const all = [];
    for (const [key, entry] of this._entries) {
      all.push({ key, ...entry });
    }
    return all;
  }

  get size() { return this._entries.size; }

  _evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this._entries) {
      if (now - entry.ts > this._ttlMs) this._entries.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Episodic Memory — time-decayed importance
// ---------------------------------------------------------------------------

class EpisodicMemory {
  constructor(config) {
    this._maxEntries = config.maxEntries || 500;
    this._halfLife = config.decayHalfLifeMs || 86400000;
    this._entries = new Map(); // key -> { value, createdAt, importance, accessCount }
  }

  store(key, value, importance = 0.5) {
    const existing = this._entries.get(key);
    if (existing) {
      // Reinforce existing memory
      existing.importance = Math.min(1, existing.importance + 0.1);
      existing.accessCount++;
      existing.lastAccessed = Date.now();
      existing.value = value;
    } else {
      this._entries.set(key, {
        value,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        importance,
        accessCount: 1,
      });
    }

    if (this._entries.size > this._maxEntries) {
      this._evictLeastImportant();
    }
  }

  retrieve(key) {
    const entry = this._entries.get(key);
    if (!entry) return null;
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    return { key, ...entry, currentImportance: this._decayedImportance(entry) };
  }

  /**
   * Search for entries matching a query with importance decay.
   */
  search(query, limit = 10) {
    const results = [];
    for (const [key, entry] of this._entries) {
      if (key.includes(query) || JSON.stringify(entry.value).includes(query)) {
        results.push({
          key,
          ...entry,
          currentImportance: this._decayedImportance(entry),
        });
      }
    }
    return results
      .sort((a, b) => b.currentImportance - a.currentImportance)
      .slice(0, limit);
  }

  /**
   * Get entries ready for semantic consolidation.
   * Returns entries with high importance that have been seen multiple times.
   */
  getConsolidationCandidates(minImportance = 0.7) {
    const candidates = [];
    for (const [key, entry] of this._entries) {
      const importance = this._decayedImportance(entry);
      if (importance >= minImportance && entry.accessCount >= 3) {
        candidates.push({ key, ...entry, currentImportance: importance });
      }
    }
    return candidates.sort((a, b) => b.currentImportance - a.currentImportance);
  }

  getAll() {
    const all = [];
    for (const [key, entry] of this._entries) {
      all.push({ key, ...entry, currentImportance: this._decayedImportance(entry) });
    }
    return all;
  }

  get size() { return this._entries.size; }

  _decayedImportance(entry) {
    const age = Date.now() - entry.lastAccessed;
    const decay = Math.pow(0.5, age / this._halfLife);
    return entry.importance * decay;
  }

  _evictLeastImportant() {
    const entries = [...this._entries.entries()]
      .map(([key, entry]) => ({ key, importance: this._decayedImportance(entry) }))
      .sort((a, b) => a.importance - b.importance);

    const toRemove = entries.slice(0, Math.floor(this._maxEntries * 0.1));
    for (const { key } of toRemove) {
      this._entries.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Semantic Memory — consolidated persistent knowledge
// ---------------------------------------------------------------------------

class SemanticMemory {
  constructor(config, filePath) {
    this._maxEntries = config.maxEntries || 200;
    this._minImportance = config.minImportance || 0.7;
    this._filePath = filePath;
    this._entries = new Map();
    this._dirty = false;
    this._flushTimer = null;
    this._load();
  }

  consolidate(key, value, importance) {
    if (importance < this._minImportance) return false;

    this._entries.set(key, {
      value,
      importance,
      consolidatedAt: Date.now(),
      accessCount: 0,
    });

    if (this._entries.size > this._maxEntries) {
      // Evict lowest importance
      const entries = [...this._entries.entries()]
        .sort(([, a], [, b]) => a.importance - b.importance);
      this._entries.delete(entries[0][0]);
    }

    this._schedulePersist();
    return true;
  }

  retrieve(key) {
    const entry = this._entries.get(key);
    if (!entry) return null;
    entry.accessCount++;
    return { key, ...entry };
  }

  search(query, limit = 10) {
    const results = [];
    for (const [key, entry] of this._entries) {
      if (key.includes(query) || JSON.stringify(entry.value).includes(query)) {
        results.push({ key, ...entry });
      }
    }
    return results.sort((a, b) => b.importance - a.importance).slice(0, limit);
  }

  getAll() {
    const all = [];
    for (const [key, entry] of this._entries) {
      all.push({ key, ...entry });
    }
    return all.sort((a, b) => b.importance - a.importance);
  }

  get size() { return this._entries.size; }

  _load() {
    try {
      if (this._filePath && fs.existsSync(this._filePath)) {
        const data = JSON.parse(fs.readFileSync(this._filePath, 'utf8'));
        if (data.entries) {
          for (const [key, val] of Object.entries(data.entries)) {
            this._entries.set(key, val);
          }
        }
      }
    } catch { /* fresh start */ }
  }

  _schedulePersist() {
    this._dirty = true;
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      if (this._dirty) this._persist();
    }, 2000);
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  _persist() {
    this._dirty = false;
    try {
      const dir = path.dirname(this._filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const entries = {};
      for (const [key, val] of this._entries) entries[key] = val;
      fs.writeFileSync(this._filePath, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        totalEntries: this._entries.size,
        entries,
      }, null, 2) + '\n');
    } catch (e) {
      console.warn('[MemoryTiers] Failed to persist semantic memory:', e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Memory Manager — unified interface, singleton
// ---------------------------------------------------------------------------

class MemoryManager {
  constructor() {
    this._initialized = false;
    this._working = null;
    this._episodic = null;
    this._semantic = null;
    this._consolidationTimer = null;
  }

  _ensureInit() {
    if (this._initialized) return;
    this._initialized = true;
    const config = loadMemoryConfig();
    const memDir = getMemoryDir();

    this._working = new WorkingMemory(config.working);
    this._episodic = new EpisodicMemory(config.episodic);
    this._semantic = new SemanticMemory(config.semantic, path.join(memDir, 'semantic-memory.json'));

    // Periodic consolidation: episodic → semantic
    if (config.consolidationIntervalMs > 0) {
      this._consolidationTimer = setInterval(() => this._consolidate(), config.consolidationIntervalMs);
      if (this._consolidationTimer.unref) this._consolidationTimer.unref();
    }
  }

  // -- Working memory (fast, volatile) --

  setWorking(key, value) {
    this._ensureInit();
    this._working.set(key, value);
  }

  getWorking(key) {
    this._ensureInit();
    return this._working.get(key);
  }

  // -- Episodic memory (mid-term, decayed) --

  storeEpisodic(key, value, importance = 0.5) {
    this._ensureInit();
    this._episodic.store(key, value, importance);
  }

  retrieveEpisodic(key) {
    this._ensureInit();
    return this._episodic.retrieve(key);
  }

  searchEpisodic(query, limit = 10) {
    this._ensureInit();
    return this._episodic.search(query, limit);
  }

  // -- Semantic memory (long-term, persistent) --

  storeSemantic(key, value, importance) {
    this._ensureInit();
    return this._semantic.consolidate(key, value, importance);
  }

  searchSemantic(query, limit = 10) {
    this._ensureInit();
    return this._semantic.search(query, limit);
  }

  // -- Cross-tier retrieval --

  /**
   * Search across all tiers, returning merged results prioritized by tier.
   */
  recall(query, limit = 10) {
    this._ensureInit();
    const results = [];

    // Working memory (highest priority for current context)
    const workingAll = this._working.getAll();
    for (const entry of workingAll) {
      if (entry.key.includes(query) || JSON.stringify(entry.value).includes(query)) {
        results.push({ tier: 'working', priority: 3, ...entry });
      }
    }

    // Episodic
    const episodicResults = this._episodic.search(query, limit);
    for (const entry of episodicResults) {
      results.push({ tier: 'episodic', priority: 2, ...entry });
    }

    // Semantic
    const semanticResults = this._semantic.search(query, limit);
    for (const entry of semanticResults) {
      results.push({ tier: 'semantic', priority: 1, ...entry });
    }

    return results
      .sort((a, b) => b.priority - a.priority || (b.importance || 0) - (a.importance || 0))
      .slice(0, limit);
  }

  /**
   * Get status for API.
   */
  getStatus() {
    this._ensureInit();
    return {
      enabled: loadMemoryConfig().enabled,
      tiers: {
        working: { entries: this._working.size },
        episodic: { entries: this._episodic.size },
        semantic: { entries: this._semantic.size },
      },
    };
  }

  // -----------------------------------------------------------------------
  // Consolidation: episodic → semantic
  // -----------------------------------------------------------------------

  _consolidate() {
    const config = loadMemoryConfig();
    const candidates = this._episodic.getConsolidationCandidates(config.semantic.minImportance);
    let consolidated = 0;

    for (const candidate of candidates) {
      if (this._semantic.consolidate(candidate.key, candidate.value, candidate.currentImportance)) {
        consolidated++;
      }
    }

    if (consolidated > 0) {
      console.log(`[MemoryTiers] Consolidated ${consolidated} entries from episodic → semantic`);
    }
  }

  stop() {
    if (this._consolidationTimer) clearInterval(this._consolidationTimer);
  }
}

// Module-level singleton — use globalThis to survive HMR in dev mode
const memoryManager = globalThis.__memoryManager = globalThis.__memoryManager || new MemoryManager();
export default memoryManager;
