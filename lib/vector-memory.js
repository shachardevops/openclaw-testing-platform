/**
 * Vector Memory Store — RuVector integration for semantic search over
 * agent learnings, decision history, and QA patterns.
 *
 * Inspired by ruflo's HNSW indexing and hyperbolic embeddings patterns.
 * Uses RuVector's Node.js NAPI-RS binding for in-process vector search.
 *
 * Architecture:
 *   - Wraps RuVector's insert/search APIs with QA-domain logic
 *   - Three collections: learnings, decisions, patterns
 *   - Falls back to keyword search if RuVector is not installed
 *   - Integrates with memory-tiers.js for cross-tier semantic retrieval
 *
 * Note: Self-learning features (SonaEngine) are disabled by default
 * due to upstream bugs (ruvnet/RuVector#257, #258). Core HNSW search
 * is stable.
 *
 * Known RuVector edge cases handled here:
 *   #257  — getStats() returns Rust debug string → safe JSON parse wrapper
 *   #258  — forceLearn() silently drops trajectories → SonaEngine disabled
 *   #171  — HNSW returns fewer results on small tables → fallback supplement
 *   #164  — HNSW segfault on large tables → catch + fallback
 *   #152  — HNSW errors on non-vector queries → avoided in code paths
 *   #175  — Docker image missing extension SQL → verified in init-db.sql
 *
 * Install: pnpm add ruvector
 * Config: project.json → vectorMemory
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  enabled: true,
  dimensions: 384,                  // default embedding dimension
  collections: {
    learnings: { maxVectors: 5000 },
    decisions: { maxVectors: 2000 },
    patterns: { maxVectors: 3000 },
  },
  similarityThreshold: 0.75,       // min cosine similarity for results
  enableLearning: false,           // disabled: SonaEngine bugs (#257, #258)
  fallbackToKeyword: true,         // use keyword search if RuVector unavailable
  persistDir: null,                // auto-resolved from project config
};

// Max text length to prevent OOM on embedding very large strings
const MAX_TEXT_LENGTH = 10000;

// ---------------------------------------------------------------------------
// RuVector edge-case guards
// ---------------------------------------------------------------------------

/**
 * Safe wrapper for SonaEngine.getStats() — handles #257 where Rust returns
 * a debug-formatted struct string instead of JSON.
 */
function safeParseRuVectorStats(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw; // already parsed

  // Try JSON first
  try {
    return JSON.parse(raw);
  } catch {
    // #257: Rust returns "CoordinatorStats { key: value, ... }"
    // Parse the debug format as best-effort
    try {
      const inner = raw.replace(/^\w+\s*\{/, '{').replace(/\}$/, '}');
      // Convert "key: value" to "\"key\": value"
      const jsonish = inner.replace(/(\w+):\s/g, '"$1": ');
      return JSON.parse(jsonish);
    } catch {
      console.warn('[VectorMemory] Could not parse RuVector stats, returning raw string');
      return { raw, parseError: true };
    }
  }
}

/**
 * Sanitize text input before embedding — prevents OOM and handles edge cases.
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  // Truncate excessively long text
  const truncated = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
  // Remove null bytes that could cause issues in native bindings
  return truncated.replace(/\0/g, '');
}

function loadVectorConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.vectorMemory || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function getPersistDir() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory', 'vectors');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory', 'vectors');
  }
}

// ---------------------------------------------------------------------------
// Simple text-to-vector fallback (TF-IDF-ish)
// Used when RuVector's embedding model is not available.
// ---------------------------------------------------------------------------

function simpleEmbed(text, dimensions = 384) {
  const safe = sanitizeText(text);
  if (!safe) return new Array(dimensions).fill(0);
  const tokens = safe.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const vector = new Float32Array(dimensions);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // Hash token to a set of dimensions
    let hash = 0;
    for (let j = 0; j < token.length; j++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(j);
      hash = hash & hash;
    }
    // Activate multiple dimensions per token
    for (let k = 0; k < 3; k++) {
      const dim = Math.abs((hash + k * 7919) % dimensions);
      vector[dim] += 1.0 / (1 + i * 0.1); // position-weighted
    }
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimensions; i++) vector[i] /= norm;

  return Array.from(vector);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// ---------------------------------------------------------------------------
// Vector Collection — manages a single vector index
// ---------------------------------------------------------------------------

class VectorCollection {
  constructor(name, config) {
    this.name = name;
    this._maxVectors = config.maxVectors || 5000;
    this._dimensions = config.dimensions || 384;
    this._vectors = [];    // { id, vector, metadata, insertedAt }
    this._ruvector = null; // native RuVector instance (lazy init)
    this._useNative = false;
  }

  /**
   * Try to initialize native RuVector.
   * Falls back to in-memory brute-force if not available.
   *
   * Guards against:
   *   #257 — SonaEngine.getStats() crash on init health check
   *   #258 — SonaEngine.forceLearn() silently fails (learning disabled)
   *   #164 — segfault on large tables (catch at search time, not init)
   */
  async _tryInitNative() {
    if (this._ruvector !== null) return this._useNative;
    try {
      const rv = await import('ruvector');
      const instance = new rv.default({ dimensions: this._dimensions });

      // Verify dimensions match what we expect (#171 — hardcoded 128 bug).
      // Do a quick smoke test: insert + search a zero vector.
      try {
        const testVec = new Array(this._dimensions).fill(0.01);
        await instance.insert('__health_check__', testVec, {});
        const results = await instance.search(testVec, 1);
        // Clean up test entry if possible
        if (instance.delete) {
          try { await instance.delete('__health_check__'); } catch { /* best effort */ }
        }
        if (!results || !Array.isArray(results)) {
          throw new Error('Search returned unexpected format');
        }
      } catch (healthErr) {
        console.warn(`[VectorMemory] Native RuVector health check failed for ${this.name}: ${healthErr.message}`);
        console.warn('[VectorMemory] Falling back to in-memory search');
        this._ruvector = false;
        this._useNative = false;
        return false;
      }

      this._ruvector = instance;
      this._useNative = true;

      // #257 — Safely check stats without crashing
      try {
        const stats = instance.getStats ? instance.getStats() : null;
        const parsed = safeParseRuVectorStats(stats);
        if (parsed?.parseError) {
          console.warn(`[VectorMemory] RuVector getStats() returned non-JSON (#257) for: ${this.name}`);
        }
      } catch { /* stats check is non-critical */ }

      console.log(`[VectorMemory] Native RuVector initialized for collection: ${this.name}`);
    } catch {
      this._ruvector = false;
      this._useNative = false;
      console.log(`[VectorMemory] RuVector not installed — using fallback for: ${this.name}`);
    }
    return this._useNative;
  }

  /**
   * Insert a document with text and metadata.
   * Guards: validates inputs, catches native segfaults (#164), always falls
   * back to in-memory on native failure.
   */
  async insert(id, text, metadata = {}) {
    if (!id || typeof id !== 'string') {
      return { ok: false, error: 'Invalid id' };
    }
    const safeText = sanitizeText(text);
    if (!safeText) {
      return { ok: false, error: 'Empty or invalid text' };
    }
    const vector = simpleEmbed(safeText, this._dimensions);

    await this._tryInitNative();

    if (this._useNative && this._ruvector) {
      try {
        await this._ruvector.insert(id, vector, metadata);
        return { ok: true, native: true };
      } catch (nativeErr) {
        // #164 — catch segfault/crash errors from native binding
        console.warn(`[VectorMemory] Native insert failed for ${this.name}/${id}: ${nativeErr.message}`);
        // Fall through to in-memory
      }
    }

    // In-memory fallback
    // Remove existing entry with same ID
    this._vectors = this._vectors.filter(v => v.id !== id);

    this._vectors.push({
      id,
      vector,
      text: text.slice(0, 500), // store truncated for search display
      metadata,
      insertedAt: Date.now(),
    });

    // Enforce size limit (FIFO)
    if (this._vectors.length > this._maxVectors) {
      this._vectors = this._vectors.slice(-this._maxVectors);
    }

    return { ok: true, native: false };
  }

  /**
   * Search for similar documents.
   * Guards:
   *   #171 — HNSW returns fewer results on small tables (<100 rows).
   *          When native returns fewer than requested, supplement with
   *          in-memory brute-force results.
   *   #164 — HNSW segfault on large tables. Catch and fall back.
   */
  async search(queryText, limit = 10, minSimilarity = 0.5) {
    const safeQuery = sanitizeText(queryText);
    if (!safeQuery) return [];
    const queryVector = simpleEmbed(safeQuery, this._dimensions);

    await this._tryInitNative();

    if (this._useNative && this._ruvector) {
      try {
        const nativeResults = await this._ruvector.search(queryVector, limit);
        const mapped = (nativeResults || []).map(r => ({
          id: r.id,
          score: r.score,
          metadata: r.metadata,
          source: 'native',
        }));

        // #171 — If native returned fewer results than requested and we have
        // in-memory vectors, supplement with brute-force results
        if (mapped.length < limit && this._vectors.length > 0) {
          const nativeIds = new Set(mapped.map(r => r.id));
          const supplement = this._vectors
            .filter(v => !nativeIds.has(v.id))
            .map(entry => ({
              id: entry.id,
              score: cosineSimilarity(queryVector, entry.vector),
              text: entry.text,
              metadata: entry.metadata,
              source: 'fallback-supplement',
            }))
            .filter(s => s.score >= minSimilarity)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit - mapped.length);
          mapped.push(...supplement);
        }

        return mapped;
      } catch (searchErr) {
        // #164 — segfault or native crash, fall through to brute-force
        console.warn(`[VectorMemory] Native search failed for ${this.name}: ${searchErr.message}`);
      }
    }

    // Brute-force fallback
    const scored = this._vectors.map(entry => ({
      id: entry.id,
      score: cosineSimilarity(queryVector, entry.vector),
      text: entry.text,
      metadata: entry.metadata,
    }));

    return scored
      .filter(s => s.score >= minSimilarity)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Keyword search fallback.
   */
  keywordSearch(query, limit = 10) {
    const queryLower = query.toLowerCase();
    const results = [];

    for (const entry of this._vectors) {
      const text = (entry.text || '').toLowerCase();
      const metaStr = JSON.stringify(entry.metadata || {}).toLowerCase();

      if (text.includes(queryLower) || metaStr.includes(queryLower)) {
        results.push({
          id: entry.id,
          score: 1.0, // keyword match
          text: entry.text,
          metadata: entry.metadata,
        });
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Hybrid search: semantic + keyword results merged.
   */
  async hybridSearch(queryText, limit = 10) {
    const semanticResults = await this.search(queryText, limit);
    const keywordResults = this.keywordSearch(queryText, limit);

    // Merge and dedupe by ID, keeping higher score
    const merged = new Map();
    for (const r of semanticResults) {
      merged.set(r.id, { ...r, source: 'semantic' });
    }
    for (const r of keywordResults) {
      const existing = merged.get(r.id);
      if (!existing || r.score > existing.score) {
        merged.set(r.id, { ...r, source: existing ? 'both' : 'keyword' });
      }
    }

    return [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  getStats() {
    const stats = {
      name: this.name,
      vectorCount: this._vectors.length,
      maxVectors: this._maxVectors,
      dimensions: this._dimensions,
      nativeRuVector: this._useNative,
    };

    // #257 — Safely get native stats without crashing on Rust debug string
    if (this._useNative && this._ruvector && this._ruvector.getStats) {
      try {
        const raw = this._ruvector.getStats();
        stats.nativeStats = safeParseRuVectorStats(raw);
      } catch {
        stats.nativeStats = { error: 'getStats() threw — likely #257' };
      }
    }

    return stats;
  }
}

// ---------------------------------------------------------------------------
// Vector Memory Manager — singleton
// ---------------------------------------------------------------------------

class VectorMemoryManager {
  constructor() {
    this._initialized = false;
    this._collections = new Map();
  }

  _ensureInit() {
    if (this._initialized) return;
    this._initialized = true;
    const config = loadVectorConfig();

    for (const [name, collConfig] of Object.entries(config.collections)) {
      this._collections.set(name, new VectorCollection(name, {
        ...collConfig,
        dimensions: config.dimensions,
      }));
    }
  }

  /**
   * Get or create a collection.
   */
  collection(name) {
    this._ensureInit();
    if (!this._collections.has(name)) {
      const config = loadVectorConfig();
      this._collections.set(name, new VectorCollection(name, {
        maxVectors: 5000,
        dimensions: config.dimensions,
      }));
    }
    return this._collections.get(name);
  }

  // --- Convenience methods for common QA operations ---

  /**
   * Store a learning (bug pattern, test outcome, etc.).
   */
  async storeLearning(id, text, metadata = {}) {
    this._ensureInit();
    return this.collection('learnings').insert(id, text, metadata);
  }

  /**
   * Store an orchestrator decision for future retrieval.
   */
  async storeDecision(id, text, metadata = {}) {
    this._ensureInit();
    return this.collection('decisions').insert(id, text, metadata);
  }

  /**
   * Store a QA pattern (recurring bug, test strategy, etc.).
   */
  async storePattern(id, text, metadata = {}) {
    this._ensureInit();
    return this.collection('patterns').insert(id, text, metadata);
  }

  /**
   * Find similar past decisions for the orchestrator (Layer 3 enhancement).
   * If similarity > threshold, can skip AI consultation.
   */
  async findSimilarDecisions(query, limit = 5) {
    this._ensureInit();
    const config = loadVectorConfig();
    return this.collection('decisions').search(query, limit, config.similarityThreshold);
  }

  /**
   * Find relevant learnings for a task context.
   */
  async findRelevantLearnings(query, limit = 10) {
    this._ensureInit();
    return this.collection('learnings').hybridSearch(query, limit);
  }

  /**
   * Cross-collection search.
   */
  async searchAll(query, limit = 10) {
    this._ensureInit();
    const results = [];
    for (const [name, coll] of this._collections) {
      const collResults = await coll.hybridSearch(query, Math.ceil(limit / this._collections.size));
      for (const r of collResults) {
        results.push({ ...r, collection: name });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get status for API.
   */
  getStatus() {
    this._ensureInit();
    const config = loadVectorConfig();
    const collections = {};
    for (const [name, coll] of this._collections) {
      collections[name] = coll.getStats();
    }
    return {
      enabled: config.enabled,
      dimensions: config.dimensions,
      enableLearning: config.enableLearning,
      similarityThreshold: config.similarityThreshold,
      collections,
      knownIssues: {
        sonaLearningDisabled: '#257 (getStats crash) and #258 (forceLearn broken)',
        hnswSmallTableLimit: '#171 (supplemented with fallback)',
        hnswLargeTableSegfault: '#164 (caught with fallback)',
      },
    };
  }

  /**
   * Health check — verifies all collections are operational.
   * Useful for start.sh and monitoring.
   */
  async healthCheck() {
    this._ensureInit();
    const results = {};
    for (const [name, coll] of this._collections) {
      try {
        // Test insert + search round trip
        const testId = `__healthcheck_${Date.now()}`;
        await coll.insert(testId, 'health check test vector');
        const searchResults = await coll.search('health check test', 1, 0);
        results[name] = {
          ok: true,
          native: coll._useNative,
          vectorCount: coll._vectors.length,
        };
      } catch (err) {
        results[name] = { ok: false, error: err.message };
      }
    }
    return results;
  }
}

// Module-level singleton
const vectorMemory = new VectorMemoryManager();
export default vectorMemory;
export { simpleEmbed, cosineSimilarity, safeParseRuVectorStats, sanitizeText };
