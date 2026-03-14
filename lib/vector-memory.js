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
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
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
   */
  async _tryInitNative() {
    if (this._ruvector !== null) return this._useNative;
    try {
      const rv = await import('ruvector');
      this._ruvector = new rv.default({ dimensions: this._dimensions });
      this._useNative = true;
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
   */
  async insert(id, text, metadata = {}) {
    const vector = simpleEmbed(text, this._dimensions);

    await this._tryInitNative();

    if (this._useNative && this._ruvector) {
      try {
        await this._ruvector.insert(id, vector, metadata);
        return { ok: true, native: true };
      } catch { /* fall through to in-memory */ }
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
   */
  async search(queryText, limit = 10, minSimilarity = 0.5) {
    const queryVector = simpleEmbed(queryText, this._dimensions);

    await this._tryInitNative();

    if (this._useNative && this._ruvector) {
      try {
        const results = await this._ruvector.search(queryVector, limit);
        return results.map(r => ({
          id: r.id,
          score: r.score,
          metadata: r.metadata,
        }));
      } catch { /* fall through */ }
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
    return {
      name: this.name,
      vectorCount: this._vectors.length,
      maxVectors: this._maxVectors,
      dimensions: this._dimensions,
      nativeRuVector: this._useNative,
    };
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
    };
  }
}

// Module-level singleton
const vectorMemory = new VectorMemoryManager();
export default vectorMemory;
export { simpleEmbed, cosineSimilarity };
