import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader';
import { registry } from './service-registry';

const DEFAULT_CONFIG = {
  enabled: true,
  working: { maxEntries: 100, ttlMs: 600000 },
  episodic: { maxEntries: 500, decayHalfLifeMs: 86400000 },
  semantic: { maxEntries: 200, minImportance: 0.7 },
  consolidationIntervalMs: 300000,
};

function loadMemoryConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.memoryTiers || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function getMemoryDir(): string {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory');
  }
}

interface WorkingEntry {
  value: any;
  ts: number;
  accessCount: number;
}

class WorkingMemory {
  private _maxEntries: number;
  private _ttlMs: number;
  private _entries: Map<string, WorkingEntry> = new Map();

  constructor(config: { maxEntries?: number; ttlMs?: number }) {
    this._maxEntries = config.maxEntries || 100;
    this._ttlMs = config.ttlMs || 600000;
  }

  set(key: string, value: any): void {
    this._evictExpired();
    this._entries.set(key, { value, ts: Date.now(), accessCount: 1 });
    if (this._entries.size > this._maxEntries) {
      const oldest = [...this._entries.entries()]
        .sort(([, a], [, b]) => a.ts - b.ts)[0];
      if (oldest) this._entries.delete(oldest[0]);
    }
  }

  get(key: string): any {
    const entry = this._entries.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this._ttlMs) {
      this._entries.delete(key);
      return null;
    }
    entry.accessCount++;
    entry.ts = Date.now();
    return entry.value;
  }

  getAll(): Array<{ key: string } & WorkingEntry> {
    this._evictExpired();
    const all: Array<{ key: string } & WorkingEntry> = [];
    for (const [key, entry] of this._entries) {
      all.push({ key, ...entry });
    }
    return all;
  }

  get size(): number { return this._entries.size; }

  private _evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this._entries) {
      if (now - entry.ts > this._ttlMs) this._entries.delete(key);
    }
  }
}

interface EpisodicEntry {
  value: any;
  createdAt: number;
  lastAccessed: number;
  importance: number;
  accessCount: number;
}

class EpisodicMemory {
  private _maxEntries: number;
  private _halfLife: number;
  private _entries: Map<string, EpisodicEntry> = new Map();

  constructor(config: { maxEntries?: number; decayHalfLifeMs?: number }) {
    this._maxEntries = config.maxEntries || 500;
    this._halfLife = config.decayHalfLifeMs || 86400000;
  }

  store(key: string, value: any, importance: number = 0.5): void {
    const existing = this._entries.get(key);
    if (existing) {
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

  retrieve(key: string): (EpisodicEntry & { key: string; currentImportance: number }) | null {
    const entry = this._entries.get(key);
    if (!entry) return null;
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    return { key, ...entry, currentImportance: this._decayedImportance(entry) };
  }

  search(query: string, limit: number = 10): Array<{ key: string; currentImportance: number } & EpisodicEntry> {
    const results: Array<{ key: string; currentImportance: number } & EpisodicEntry> = [];
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

  getConsolidationCandidates(minImportance: number = 0.7): Array<{ key: string; currentImportance: number } & EpisodicEntry> {
    const candidates: Array<{ key: string; currentImportance: number } & EpisodicEntry> = [];
    for (const [key, entry] of this._entries) {
      const importance = this._decayedImportance(entry);
      if (importance >= minImportance && entry.accessCount >= 3) {
        candidates.push({ key, ...entry, currentImportance: importance });
      }
    }
    return candidates.sort((a, b) => b.currentImportance - a.currentImportance);
  }

  getAll(): Array<{ key: string; currentImportance: number } & EpisodicEntry> {
    const all: Array<{ key: string; currentImportance: number } & EpisodicEntry> = [];
    for (const [key, entry] of this._entries) {
      all.push({ key, ...entry, currentImportance: this._decayedImportance(entry) });
    }
    return all;
  }

  get size(): number { return this._entries.size; }

  private _decayedImportance(entry: EpisodicEntry): number {
    const age = Date.now() - entry.lastAccessed;
    const decay = Math.pow(0.5, age / this._halfLife);
    return entry.importance * decay;
  }

  private _evictLeastImportant(): void {
    const entries = [...this._entries.entries()]
      .map(([key, entry]) => ({ key, importance: this._decayedImportance(entry) }))
      .sort((a, b) => a.importance - b.importance);

    const toRemove = entries.slice(0, Math.floor(this._maxEntries * 0.1));
    for (const { key } of toRemove) {
      this._entries.delete(key);
    }
  }
}

interface SemanticEntry {
  value: any;
  importance: number;
  consolidatedAt: number;
  accessCount: number;
}

class SemanticMemory {
  private _maxEntries: number;
  private _minImportance: number;
  private _filePath: string;
  private _entries: Map<string, SemanticEntry> = new Map();

  constructor(config: { maxEntries?: number; minImportance?: number }, filePath: string) {
    this._maxEntries = config.maxEntries || 200;
    this._minImportance = config.minImportance || 0.7;
    this._filePath = filePath;
    this._load();
  }

  consolidate(key: string, value: any, importance: number): boolean {
    if (importance < this._minImportance) return false;

    this._entries.set(key, {
      value,
      importance,
      consolidatedAt: Date.now(),
      accessCount: 0,
    });

    if (this._entries.size > this._maxEntries) {
      const entries = [...this._entries.entries()]
        .sort(([, a], [, b]) => a.importance - b.importance);
      this._entries.delete(entries[0][0]);
    }

    this._persist();
    return true;
  }

  retrieve(key: string): ({ key: string } & SemanticEntry) | null {
    const entry = this._entries.get(key);
    if (!entry) return null;
    entry.accessCount++;
    return { key, ...entry };
  }

  search(query: string, limit: number = 10): Array<{ key: string } & SemanticEntry> {
    const results: Array<{ key: string } & SemanticEntry> = [];
    for (const [key, entry] of this._entries) {
      if (key.includes(query) || JSON.stringify(entry.value).includes(query)) {
        results.push({ key, ...entry });
      }
    }
    return results.sort((a, b) => b.importance - a.importance).slice(0, limit);
  }

  getAll(): Array<{ key: string } & SemanticEntry> {
    const all: Array<{ key: string } & SemanticEntry> = [];
    for (const [key, entry] of this._entries) {
      all.push({ key, ...entry });
    }
    return all.sort((a, b) => b.importance - a.importance);
  }

  get size(): number { return this._entries.size; }

  private _load(): void {
    try {
      if (this._filePath && fs.existsSync(this._filePath)) {
        const data = JSON.parse(fs.readFileSync(this._filePath, 'utf8'));
        if (data.entries) {
          for (const [key, val] of Object.entries(data.entries)) {
            this._entries.set(key, val as SemanticEntry);
          }
        }
      }
    } catch { /* fresh start */ }
  }

  private _persist(): void {
    try {
      const dir = path.dirname(this._filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const entries: Record<string, SemanticEntry> = {};
      for (const [key, val] of this._entries) entries[key] = val;
      fs.writeFileSync(this._filePath, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        totalEntries: this._entries.size,
        entries,
      }, null, 2) + '\n');
    } catch (e: unknown) {
      console.warn('[MemoryTiers] Failed to persist semantic memory:', (e as Error).message);
    }
  }
}

class MemoryManager {
  private _initialized: boolean = false;
  private _working: WorkingMemory | null = null;
  private _episodic: EpisodicMemory | null = null;
  private _semantic: SemanticMemory | null = null;
  private _consolidationTimer: ReturnType<typeof setInterval> | null = null;

  private _ensureInit(): void {
    if (this._initialized) return;
    this._initialized = true;
    const config = loadMemoryConfig();
    const memDir = getMemoryDir();

    this._working = new WorkingMemory(config.working);
    this._episodic = new EpisodicMemory(config.episodic);
    this._semantic = new SemanticMemory(config.semantic, path.join(memDir, 'semantic-memory.json'));

    if (config.consolidationIntervalMs > 0) {
      this._consolidationTimer = setInterval(() => this._consolidate(), config.consolidationIntervalMs);
      if (this._consolidationTimer.unref) this._consolidationTimer.unref();
    }
  }

  setWorking(key: string, value: any): void {
    this._ensureInit();
    this._working!.set(key, value);
  }

  getWorking(key: string): any {
    this._ensureInit();
    return this._working!.get(key);
  }

  storeEpisodic(key: string, value: any, importance: number = 0.5): void {
    this._ensureInit();
    this._episodic!.store(key, value, importance);
  }

  retrieveEpisodic(key: string) {
    this._ensureInit();
    return this._episodic!.retrieve(key);
  }

  searchEpisodic(query: string, limit: number = 10) {
    this._ensureInit();
    return this._episodic!.search(query, limit);
  }

  storeSemantic(key: string, value: any, importance: number): boolean {
    this._ensureInit();
    return this._semantic!.consolidate(key, value, importance);
  }

  searchSemantic(query: string, limit: number = 10) {
    this._ensureInit();
    return this._semantic!.search(query, limit);
  }

  recall(query: string, limit: number = 10): Array<Record<string, any>> {
    this._ensureInit();
    const results: Array<Record<string, any>> = [];

    const workingAll = this._working!.getAll();
    for (const entry of workingAll) {
      if (entry.key.includes(query) || JSON.stringify(entry.value).includes(query)) {
        results.push({ tier: 'working', priority: 3, ...entry });
      }
    }

    const episodicResults = this._episodic!.search(query, limit);
    for (const entry of episodicResults) {
      results.push({ tier: 'episodic', priority: 2, ...entry });
    }

    const semanticResults = this._semantic!.search(query, limit);
    for (const entry of semanticResults) {
      results.push({ tier: 'semantic', priority: 1, ...entry });
    }

    return results
      .sort((a, b) => b.priority - a.priority || (b.importance || 0) - (a.importance || 0))
      .slice(0, limit);
  }

  getStatus() {
    this._ensureInit();
    return {
      enabled: loadMemoryConfig().enabled,
      tiers: {
        working: { entries: this._working!.size },
        episodic: { entries: this._episodic!.size },
        semantic: { entries: this._semantic!.size },
      },
    };
  }

  private _consolidate(): void {
    const config = loadMemoryConfig();
    const candidates = this._episodic!.getConsolidationCandidates(config.semantic.minImportance);
    let consolidated = 0;

    for (const candidate of candidates) {
      if (this._semantic!.consolidate(candidate.key, candidate.value, candidate.currentImportance)) {
        consolidated++;
      }
    }

    if (consolidated > 0) {
      console.log(`[MemoryTiers] Consolidated ${consolidated} entries from episodic → semantic`);
    }
  }

  stop(): void {
    if (this._consolidationTimer) clearInterval(this._consolidationTimer);
  }
}

const memoryManager = new MemoryManager();
registry.register('memoryManager', () => memoryManager);
export default memoryManager;
