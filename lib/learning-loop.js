/**
 * Learning Loop Engine — inspired by ruflo's RETRIEVE→JUDGE→DISTILL→CONSOLIDATE→ROUTE
 * cycle and AutoForge's continuous learning from execution results.
 *
 * Automatically extracts patterns from completed task results and stores them
 * in the project memory directory for future agent improvements.
 *
 * Learning sources:
 *   - Task results (pass/fail patterns, recurring bugs)
 *   - Orchestrator decisions (which actions resolved issues)
 *   - Model performance (pass rates per model)
 *   - Skill effectiveness (impact of skills on outcomes)
 *
 * Output:
 *   - memory/learnings.json — structured pattern database
 *   - memory/model-stats.json — model performance tracking
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader.js';
import { parseFindingsFromReport } from './report-parser.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  enabled: false,
  learnFromResults: true,
  learnFromOrchestrator: true,
  trackModelPerformance: true,
  maxPatterns: 500,
  maxModelHistory: 1000,
  consolidationThreshold: 3,  // patterns seen this many times become "confirmed"
};

function loadLearningConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.learningLoop || {}) };
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
// Pattern Store — persistent learning database
// ---------------------------------------------------------------------------

class PatternStore {
  constructor(filePath) {
    this._file = filePath;
    this._patterns = new Map();  // patternKey -> { ...data }
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._file)) {
        const data = JSON.parse(fs.readFileSync(this._file, 'utf8'));
        if (data.patterns) {
          for (const [key, val] of Object.entries(data.patterns)) {
            this._patterns.set(key, val);
          }
        }
      }
    } catch { /* fresh start */ }
  }

  /**
   * Record a pattern observation. Increments count if exists, creates if new.
   */
  observe(key, data) {
    const existing = this._patterns.get(key);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = new Date().toISOString();
      if (existing.count >= (loadLearningConfig().consolidationThreshold || 3)) {
        existing.status = 'confirmed';
      }
      // Merge new data (keep existing fields, add new ones)
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

    // Enforce max patterns (evict oldest unconfirmed)
    const maxPatterns = loadLearningConfig().maxPatterns || 500;
    if (this._patterns.size > maxPatterns) {
      this._evict(maxPatterns);
    }

    this._persist();
  }

  retrieve(key) {
    return this._patterns.get(key) || null;
  }

  /**
   * Find patterns matching a query (simple substring/type match).
   */
  search(query) {
    const results = [];
    for (const [key, val] of this._patterns) {
      if (key.includes(query) || val.type === query || val.category === query) {
        results.push({ key, ...val });
      }
    }
    return results.sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  getAll() {
    const all = [];
    for (const [key, val] of this._patterns) {
      all.push({ key, ...val });
    }
    return all;
  }

  get size() { return this._patterns.size; }

  _evict(maxSize) {
    // Sort by: confirmed last, then by count desc, then by lastSeen desc
    const entries = [...this._patterns.entries()].sort(([, a], [, b]) => {
      if (a.status === 'confirmed' && b.status !== 'confirmed') return -1;
      if (b.status === 'confirmed' && a.status !== 'confirmed') return 1;
      return (b.count || 0) - (a.count || 0);
    });
    this._patterns = new Map(entries.slice(0, maxSize));
  }

  _persist() {
    try {
      const dir = path.dirname(this._file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const patterns = {};
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
    } catch (e) {
      console.warn('[LearningLoop] Failed to persist patterns:', e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Model Stats Tracker
// ---------------------------------------------------------------------------

class ModelStatsTracker {
  constructor(filePath) {
    this._file = filePath;
    this._stats = {};  // modelId -> { runs, passed, failed, avgDuration, ... }
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._file)) {
        const data = JSON.parse(fs.readFileSync(this._file, 'utf8'));
        this._stats = data.models || {};
      }
    } catch { /* fresh start */ }
  }

  record(modelId, result) {
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

    // Track finding severities
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

  getStats() {
    return { ...this._stats };
  }

  getBestModel() {
    let best = null;
    let bestRate = -1;
    for (const [modelId, stats] of Object.entries(this._stats)) {
      if (stats.runs >= 3 && stats.passRate > bestRate) {
        bestRate = stats.passRate;
        best = modelId;
      }
    }
    return best ? { modelId: best, ...this._stats[best] } : null;
  }

  _persist() {
    try {
      const dir = path.dirname(this._file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._file, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        models: this._stats,
      }, null, 2) + '\n');
    } catch (e) {
      console.warn('[LearningLoop] Failed to persist model stats:', e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Learning Loop Engine — singleton
// ---------------------------------------------------------------------------

class LearningLoop {
  constructor() {
    this._initialized = false;
    this._patterns = null;
    this._modelStats = null;
    this._recentLearnings = [];  // ring buffer for API
  }

  _ensureInit() {
    if (this._initialized) return;
    this._initialized = true;
    const memDir = getMemoryDir();
    this._patterns = new PatternStore(path.join(memDir, 'learnings.json'));
    this._modelStats = new ModelStatsTracker(path.join(memDir, 'model-stats.json'));
  }

  /**
   * Learn from a completed task result.
   * Called after a task finishes (passed or failed).
   */
  learnFromResult(taskId, result, reportsDir) {
    const config = loadLearningConfig();
    if (!config.enabled || !config.learnFromResults) return;
    this._ensureInit();

    // 1. Record model performance
    if (config.trackModelPerformance && result.model) {
      this._modelStats.record(result.model, result);
    }

    // 2. Extract bug patterns from report
    if (reportsDir) {
      try {
        const reportPath = path.join(reportsDir, `${taskId}.md`);
        if (fs.existsSync(reportPath)) {
          const md = fs.readFileSync(reportPath, 'utf8');
          const findings = parseFindingsFromReport(md);
          for (const finding of findings) {
            const patternKey = `bug:${finding.id}`;
            this._patterns.observe(patternKey, {
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

    // 3. Record task outcome pattern
    const outcomeKey = `outcome:${taskId}:${result.status}`;
    this._patterns.observe(outcomeKey, {
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

    // 4. Detect recurring failures
    if (result.status === 'failed') {
      const failKey = `recurring-fail:${taskId}`;
      const existing = this._patterns.retrieve(failKey);
      this._patterns.observe(failKey, {
        type: 'recurring-failure',
        category: 'task-health',
        taskId,
        context: { model: result.model, failCount: (existing?.count || 0) + 1 },
      });
    }

    this._addLearning('result', taskId, `Task ${result.status} (model: ${result.model || 'unknown'})`);
  }

  /**
   * Learn from an orchestrator decision outcome.
   * Called after an orchestrator action resolves.
   */
  learnFromOrchestratorDecision(decision) {
    const config = loadLearningConfig();
    if (!config.enabled || !config.learnFromOrchestrator) return;
    this._ensureInit();

    const patternKey = `orch:${decision.conditionType}:${decision.action}`;
    this._patterns.observe(patternKey, {
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
  }

  /**
   * Retrieve relevant learnings for a task (for agent context enrichment).
   */
  getTaskLearnings(taskId) {
    this._ensureInit();

    const relevant = [];

    // Known bugs for this task
    const bugPatterns = this._patterns.search(`bug:`);
    const confirmedBugs = bugPatterns.filter(p => p.status === 'confirmed');
    if (confirmedBugs.length > 0) {
      relevant.push({
        type: 'known-bugs',
        items: confirmedBugs.slice(0, 10).map(b => ({ id: b.key, title: b.title, count: b.count })),
      });
    }

    // Task-specific failure patterns
    const taskFailures = this._patterns.search(`recurring-fail:${taskId}`);
    if (taskFailures.length > 0) {
      relevant.push({
        type: 'recurring-failures',
        items: taskFailures.map(f => ({ count: f.count, model: f.context?.model })),
      });
    }

    // Best model recommendation
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

  /**
   * Get full status for API.
   */
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

  /**
   * Get all patterns (for export/review).
   */
  getAllPatterns() {
    this._ensureInit();
    return this._patterns?.getAll() || [];
  }

  _addLearning(source, target, message) {
    this._recentLearnings.unshift({
      ts: Date.now(),
      source,
      target,
      message,
    });
    if (this._recentLearnings.length > 100) this._recentLearnings.length = 100;
  }
}

// Module-level singleton
const learningLoop = new LearningLoop();
export default learningLoop;
