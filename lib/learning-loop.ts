import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader';
import { parseFindingsFromReport } from './report-parser';
import vectorMemory from './vector-memory';
import { registry } from './service-registry';

const DEFAULT_CONFIG = {
  enabled: false,
  learnFromResults: true,
  learnFromOrchestrator: true,
  trackModelPerformance: true,
  maxPatterns: 500,
  maxModelHistory: 1000,
  consolidationThreshold: 3,
};

function loadLearningConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.learningLoop || {}) };
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

interface PatternData {
  type?: string;
  category?: string;
  title?: string;
  taskId?: string;
  context?: Record<string, any>;
  resolution?: string;
  count?: number;
  status?: string;
  firstSeen?: string;
  lastSeen?: string;
  [key: string]: any;
}

class PatternStore {
  private _file: string;
  private _patterns: Map<string, PatternData> = new Map();

  constructor(filePath: string) {
    this._file = filePath;
    this._load();
  }

  private _load(): void {
    try {
      if (fs.existsSync(this._file)) {
        const data = JSON.parse(fs.readFileSync(this._file, 'utf8'));
        if (data.patterns) {
          for (const [key, val] of Object.entries(data.patterns)) {
            this._patterns.set(key, val as PatternData);
          }
        }
      }
    } catch { /* fresh start */ }
  }

  observe(key: string, data: PatternData): void {
    const existing = this._patterns.get(key);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = new Date().toISOString();
      if (existing.count >= (loadLearningConfig().consolidationThreshold || 3)) {
        existing.status = 'confirmed';
      }
      if (data.context) existing.context = data.context;
      if (data.resolution) existing.resolution = data.resolution;
    } else {
      this._patterns.set(key, {
        ...data,
        count: 1,
        status: 'observed',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    }

    const maxPatterns = loadLearningConfig().maxPatterns || 500;
    if (this._patterns.size > maxPatterns) {
      this._evict(maxPatterns);
    }

    this._persist();
  }

  retrieve(key: string): PatternData | null {
    return this._patterns.get(key) || null;
  }

  search(query: string): Array<{ key: string } & PatternData> {
    const results: Array<{ key: string } & PatternData> = [];
    for (const [key, val] of this._patterns) {
      if (key.includes(query) || val.type === query || val.category === query) {
        results.push({ key, ...val });
      }
    }
    return results.sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  getAll(): Array<{ key: string } & PatternData> {
    const all: Array<{ key: string } & PatternData> = [];
    for (const [key, val] of this._patterns) {
      all.push({ key, ...val });
    }
    return all;
  }

  get size(): number { return this._patterns.size; }

  private _evict(maxSize: number): void {
    const entries = [...this._patterns.entries()].sort(([, a], [, b]) => {
      if (a.status === 'confirmed' && b.status !== 'confirmed') return -1;
      if (b.status === 'confirmed' && a.status !== 'confirmed') return 1;
      return (b.count || 0) - (a.count || 0);
    });
    this._patterns = new Map(entries.slice(0, maxSize));
  }

  private _persist(): void {
    try {
      const dir = path.dirname(this._file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const patterns: Record<string, PatternData> = {};
      for (const [key, val] of this._patterns) {
        patterns[key] = val;
      }
      fs.writeFileSync(this._file, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        totalPatterns: this._patterns.size,
        confirmedPatterns: [...this._patterns.values()].filter(p => p.status === 'confirmed').length,
        patterns,
      }, null, 2) + '\n');
    } catch (e: unknown) {
      console.warn('[LearningLoop] Failed to persist patterns:', (e as Error).message);
    }
  }
}

interface ModelStats {
  runs: number;
  passed: number;
  failed: number;
  totalDurationMs: number;
  findings: { p1: number; p2: number; p3: number; warnings: number };
  lastUsed?: string;
  passRate?: number;
  avgDurationMs?: number;
}

class ModelStatsTracker {
  private _file: string;
  private _stats: Record<string, ModelStats> = {};

  constructor(filePath: string) {
    this._file = filePath;
    this._load();
  }

  private _load(): void {
    try {
      if (fs.existsSync(this._file)) {
        const data = JSON.parse(fs.readFileSync(this._file, 'utf8'));
        this._stats = data.models || {};
      }
    } catch { /* fresh start */ }
  }

  record(modelId: string, result: Record<string, any>): void {
    if (!modelId) return;
    if (!this._stats[modelId]) {
      this._stats[modelId] = { runs: 0, passed: 0, failed: 0, totalDurationMs: 0, findings: { p1: 0, p2: 0, p3: 0, warnings: 0 } };
    }

    const s = this._stats[modelId];
    s.runs++;
    if (result.status === 'passed') s.passed++;
    if (result.status === 'failed') s.failed++;

    if (result.startedAt && result.finishedAt) {
      const duration = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
      if (duration > 0) s.totalDurationMs += duration;
    }

    if (Array.isArray(result.findings)) {
      for (const f of result.findings) {
        if (f.severity === 'P1') s.findings.p1++;
        else if (f.severity === 'P2') s.findings.p2++;
        else if (f.severity === 'P3') s.findings.p3++;
        else if (f.severity === 'WARNING') s.findings.warnings++;
      }
    }

    s.lastUsed = new Date().toISOString();
    s.passRate = s.runs > 0 ? Math.round((s.passed / s.runs) * 100) : 0;
    s.avgDurationMs = s.runs > 0 ? Math.round(s.totalDurationMs / s.runs) : 0;

    this._persist();
  }

  getStats(): Record<string, ModelStats> {
    return { ...this._stats };
  }

  getBestModel(): ({ modelId: string } & ModelStats) | null {
    let best: string | null = null;
    let bestRate = -1;
    for (const [modelId, stats] of Object.entries(this._stats)) {
      if (stats.runs >= 3 && (stats.passRate || 0) > bestRate) {
        bestRate = stats.passRate || 0;
        best = modelId;
      }
    }
    return best ? { modelId: best, ...this._stats[best] } : null;
  }

  private _persist(): void {
    try {
      const dir = path.dirname(this._file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._file, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        models: this._stats,
      }, null, 2) + '\n');
    } catch (e: unknown) {
      console.warn('[LearningLoop] Failed to persist model stats:', (e as Error).message);
    }
  }
}

interface LearningEntry {
  ts: number;
  source: string;
  target: string;
  message: string;
}

class LearningLoop {
  private _initialized: boolean = false;
  private _patterns: PatternStore | null = null;
  private _modelStats: ModelStatsTracker | null = null;
  private _recentLearnings: LearningEntry[] = [];

  private _ensureInit(): void {
    if (this._initialized) return;
    this._initialized = true;
    const memDir = getMemoryDir();
    this._patterns = new PatternStore(path.join(memDir, 'learnings.json'));
    this._modelStats = new ModelStatsTracker(path.join(memDir, 'model-stats.json'));
  }

  learnFromResult(taskId: string, result: Record<string, any>, reportsDir?: string): void {
    const config = loadLearningConfig();
    if (!config.enabled || !config.learnFromResults) return;
    this._ensureInit();

    if (config.trackModelPerformance && result.model) {
      this._modelStats!.record(result.model, result);
    }

    if (reportsDir) {
      try {
        const reportPath = path.join(reportsDir, `${taskId}.md`);
        if (fs.existsSync(reportPath)) {
          const md = fs.readFileSync(reportPath, 'utf8');
          const findings = parseFindingsFromReport(md);
          for (const finding of findings) {
            const patternKey = `bug:${finding.id}`;
            this._patterns!.observe(patternKey, {
              type: 'bug',
              category: finding.severity,
              title: finding.title,
              taskId,
              context: { model: result.model, status: result.status },
            });
          }
        }
      } catch { /* best-effort */ }
    }

    const outcomeKey = `outcome:${taskId}:${result.status}`;
    this._patterns!.observe(outcomeKey, {
      type: 'outcome',
      category: result.status,
      taskId,
      context: {
        model: result.model,
        passed: result.passed,
        failed: result.failed,
        warnings: result.warnings,
      },
    });

    if (result.status === 'failed') {
      const failKey = `recurring-fail:${taskId}`;
      const existing = this._patterns!.retrieve(failKey);
      this._patterns!.observe(failKey, {
        type: 'recurring-failure',
        category: 'task-health',
        taskId,
        context: { model: result.model, failCount: (existing?.count || 0) + 1 },
      });
    }

    this._addLearning('result', taskId, `Task ${result.status} (model: ${result.model || 'unknown'})`);

    try {
      const text = `Task ${taskId} ${result.status}. Model: ${result.model || 'unknown'}. Passed: ${result.passed || 0}, Failed: ${result.failed || 0}, Warnings: ${result.warnings || 0}.`;
      vectorMemory.storeLearning(`result:${taskId}:${Date.now()}`, text, {
        taskId, status: result.status, model: result.model,
        passed: result.passed, failed: result.failed,
      }).catch(() => { /* best-effort */ });
    } catch { /* vector memory unavailable */ }
  }

  learnFromOrchestratorDecision(decision: Record<string, any>): void {
    const config = loadLearningConfig();
    if (!config.enabled || !config.learnFromOrchestrator) return;
    this._ensureInit();

    const patternKey = `orch:${decision.conditionType}:${decision.action}`;
    this._patterns!.observe(patternKey, {
      type: 'orchestrator-decision',
      category: decision.conditionType,
      context: {
        source: decision.source,
        target: decision.target,
        reason: decision.reason,
      },
      resolution: decision.action,
    });

    this._addLearning('orchestrator', decision.target, `${decision.conditionType} → ${decision.action}`);

    try {
      const text = `Orchestrator decision: ${decision.conditionType} condition on ${decision.target}. Action: ${decision.action}. Source: ${decision.source}. Reason: ${decision.reason || 'N/A'}.`;
      vectorMemory.storeDecision(`orch:${Date.now()}`, text, {
        conditionType: decision.conditionType, action: decision.action,
        target: decision.target, source: decision.source,
      }).catch(() => { /* best-effort */ });
    } catch { /* vector memory unavailable */ }
  }

  getTaskLearnings(taskId: string): Array<Record<string, any>> {
    this._ensureInit();

    const relevant: Array<Record<string, any>> = [];

    const bugPatterns = this._patterns!.search(`bug:`);
    const confirmedBugs = bugPatterns.filter(p => p.status === 'confirmed');
    if (confirmedBugs.length > 0) {
      relevant.push({
        type: 'known-bugs',
        items: confirmedBugs.slice(0, 10).map(b => ({ id: b.key, title: b.title, count: b.count })),
      });
    }

    const taskFailures = this._patterns!.search(`recurring-fail:${taskId}`);
    if (taskFailures.length > 0) {
      relevant.push({
        type: 'recurring-failures',
        items: taskFailures.map(f => ({ count: f.count, model: f.context?.model })),
      });
    }

    const bestModel = this._modelStats?.getBestModel();
    if (bestModel) {
      relevant.push({
        type: 'model-recommendation',
        model: bestModel.modelId,
        passRate: bestModel.passRate,
        runs: bestModel.runs,
      });
    }

    return relevant;
  }

  getStatus() {
    this._ensureInit();
    const config = loadLearningConfig();
    return {
      enabled: config.enabled,
      config: {
        learnFromResults: config.learnFromResults,
        learnFromOrchestrator: config.learnFromOrchestrator,
        trackModelPerformance: config.trackModelPerformance,
        consolidationThreshold: config.consolidationThreshold,
      },
      patterns: {
        total: this._patterns?.size || 0,
        confirmed: this._patterns?.getAll().filter(p => p.status === 'confirmed').length || 0,
      },
      modelStats: this._modelStats?.getStats() || {},
      bestModel: this._modelStats?.getBestModel() || null,
      recentLearnings: this._recentLearnings.slice(0, 20),
    };
  }

  getAllPatterns(): Array<{ key: string } & PatternData> {
    this._ensureInit();
    return this._patterns?.getAll() || [];
  }

  private _addLearning(source: string, target: string, message: string): void {
    this._recentLearnings.unshift({
      ts: Date.now(),
      source,
      target,
      message,
    });
    if (this._recentLearnings.length > 100) this._recentLearnings.length = 100;
  }
}

const learningLoop = new LearningLoop();
registry.register('learningLoop', () => learningLoop);
export default learningLoop;
