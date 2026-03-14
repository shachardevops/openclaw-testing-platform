/**
 * Ruflo RuVector Store — integration layer for RuVector vector DB.
 *
 * Uses RuVector's VectorDB with ONNX embeddings (all-MiniLM-L6-v2, 384d).
 * Collections: bugs, module-notes, run-history, agent-issues, decisions
 * Each collection is a separate VectorDB instance persisted to disk.
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';

const COLLECTION_NAMES = ['bugs', 'module-notes', 'run-history', 'agent-issues', 'decisions'];

/** @type {RuVectorStore | null} */
let _instance = null;
let _initialized = false;

function getStoragePath() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory', 'ruvector');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory', 'ruvector');
  }
}

/**
 * Wrapper around RuVector VectorDB with per-collection instances
 * and ONNX-powered embeddings.
 */
class RuVectorStore {
  constructor(storagePath, rv) {
    this._storagePath = storagePath;
    this._rv = rv;
    this._collections = new Map(); // name → VectorDB instance
    this._metadata = new Map();    // name → { entries: [{ id, ...entry }] } for metadata lookup
    this._dimension = 384;
    this._ready = false;
  }

  async init() {
    if (!fs.existsSync(this._storagePath)) {
      fs.mkdirSync(this._storagePath, { recursive: true });
    }

    // Initialize ONNX embedder
    await this._rv.initOnnxEmbedder();
    this._dimension = this._rv.getDimension();
    this._ready = true;

    // Load existing collections from disk
    for (const name of COLLECTION_NAMES) {
      this._loadCollection(name);
    }
  }

  _metadataPath(name) {
    return path.join(this._storagePath, `${name}.meta.json`);
  }

  _loadCollection(name) {
    const db = new this._rv.VectorDB({ dimensions: this._dimension });
    this._collections.set(name, db);

    // Load metadata index
    const metaPath = this._metadataPath(name);
    let meta = { entries: [] };
    try {
      if (fs.existsSync(metaPath)) {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
    } catch { /* fresh */ }
    this._metadata.set(name, meta);

    // Re-insert vectors into VectorDB from metadata
    for (const entry of meta.entries) {
      if (entry._vector) {
        try {
          // Synchronous insert — VectorDB accepts this
          db.insert({ id: entry.id, vector: entry._vector, metadata: { text: entry.text || entry.title || '' } });
        } catch { /* skip broken entries */ }
      }
    }
  }

  _saveMetadata(name) {
    const metaPath = this._metadataPath(name);
    const meta = this._metadata.get(name);
    if (meta) {
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
  }

  async _embed(text) {
    const result = await this._rv.embed(text);
    return result.embedding;
  }

  async addEntry(collectionName, entry) {
    const db = this._collections.get(collectionName);
    const meta = this._metadata.get(collectionName);
    if (!db || !meta) return;

    const text = entry.text || entry.title || entry.description || JSON.stringify(entry);
    const vector = await this._embed(text);
    const id = entry.id || `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await db.insert({ id, vector, metadata: { text } });

    meta.entries.push({
      id,
      ...entry,
      _vector: vector,
      _indexedAt: new Date().toISOString(),
    });

    this._saveMetadata(collectionName);
  }

  async search(query, collectionName, limit = 5) {
    const db = this._collections.get(collectionName);
    const meta = this._metadata.get(collectionName);
    if (!db || !meta || meta.entries.length === 0) return [];

    const queryVec = await this._embed(query);
    let results;
    try {
      results = await db.search({ vector: queryVec, k: Math.min(limit, meta.entries.length) });
    } catch {
      return [];
    }

    // Enrich results with full metadata
    const resultsArray = Array.isArray(results) ? results : (results?.results || []);
    return resultsArray.map(r => {
      const entry = meta.entries.find(e => e.id === r.id);
      const { _vector, ...rest } = entry || {};
      return { ...rest, _score: r.score || 0 };
    });
  }

  async clearCollection(collectionName) {
    // Re-create empty collection
    const db = new this._rv.VectorDB({ dimensions: this._dimension });
    this._collections.set(collectionName, db);
    this._metadata.set(collectionName, { entries: [] });
    this._saveMetadata(collectionName);
  }

  async reindex(collectionName) {
    const meta = this._metadata.get(collectionName);
    if (!meta) return 0;

    // Re-create VectorDB and re-embed everything
    const db = new this._rv.VectorDB({ dimensions: this._dimension });
    this._collections.set(collectionName, db);

    for (const entry of meta.entries) {
      const text = entry.text || entry.title || entry.description || '';
      entry._vector = await this._embed(text);
      await db.insert({ id: entry.id, vector: entry._vector, metadata: { text } });
    }
    this._saveMetadata(collectionName);
    return meta.entries.length;
  }

  getCollectionStats() {
    const stats = {};
    for (const [name, meta] of this._metadata) {
      stats[name] = { count: meta.entries.length };
    }
    return stats;
  }

  isReady() {
    return this._ready;
  }
}

/**
 * Get or create the singleton RuVector store instance.
 */
export async function getVectorStore() {
  if (_instance && _initialized) return _instance;

  const storagePath = getStoragePath();

  const rv = await import(/* webpackIgnore: true */ 'ruvector');
  _instance = new RuVectorStore(storagePath, rv);
  await _instance.init();
  _initialized = true;
  return _instance;
}

/**
 * Index all memory files into vector collections.
 * Clears existing entries before re-indexing.
 */
export async function indexMemoryFiles(projectId) {
  const store = await getVectorStore();
  const memoryDir = path.join(process.cwd(), 'config', projectId || 'ordertu-qa', 'memory');

  let indexed = 0;

  // Clear collections before re-indexing
  await store.clearCollection('bugs');
  await store.clearCollection('module-notes');
  await store.clearCollection('run-history');

  // Index known-bugs.md
  try {
    const bugsPath = path.join(memoryDir, 'known-bugs.md');
    if (fs.existsSync(bugsPath)) {
      const content = fs.readFileSync(bugsPath, 'utf8');
      const bugBlocks = content.split(/(?=###\s)/);
      for (const block of bugBlocks) {
        const titleMatch = block.match(/###\s+(.+)/);
        if (!titleMatch) continue;
        const idMatch = block.match(/\b(S\d+-B\d+)\b/);
        await store.addEntry('bugs', {
          id: idMatch?.[1] || `bug-${indexed}`,
          title: titleMatch[1].trim(),
          text: block.trim(),
          source: 'known-bugs.md',
        });
        indexed++;
      }
    }
  } catch { /* skip */ }

  // Index module-notes.md
  try {
    const notesPath = path.join(memoryDir, 'module-notes.md');
    if (fs.existsSync(notesPath)) {
      const content = fs.readFileSync(notesPath, 'utf8');
      const sections = content.split(/(?=##\s)/);
      for (const section of sections) {
        const titleMatch = section.match(/##\s+(.+)/);
        if (!titleMatch) continue;
        await store.addEntry('module-notes', {
          id: `note-${titleMatch[1].trim().replace(/\s+/g, '-').toLowerCase()}`,
          title: titleMatch[1].trim(),
          text: section.trim(),
          source: 'module-notes.md',
        });
        indexed++;
      }
    }
  } catch { /* skip */ }

  // Index run-log.md
  try {
    const runLogPath = path.join(memoryDir, 'run-log.md');
    if (fs.existsSync(runLogPath)) {
      const content = fs.readFileSync(runLogPath, 'utf8');
      const entries = content.split(/(?=###\s)/);
      for (const entry of entries) {
        const titleMatch = entry.match(/###\s+(.+)/);
        if (!titleMatch) continue;
        await store.addEntry('run-history', {
          id: `run-${indexed}`,
          title: titleMatch[1].trim(),
          text: entry.trim(),
          source: 'run-log.md',
        });
        indexed++;
      }
    }
  } catch { /* skip */ }

  return indexed;
}
