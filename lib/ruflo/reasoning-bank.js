/**
 * Ruflo Reasoning Bank — structured run ledger with RETRIEVE → JUDGE → DISTILL pattern.
 *
 * Entry: { runId, storyId, model, result, passed, failed, warnings, bugsFound[], bugsFixed[],
 *          duration, notes, importance }
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';

const MAX_ENTRIES = 500;

function getBankPath() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory', 'reasoning-bank.json');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory', 'reasoning-bank.json');
  }
}

class ReasoningBank {
  constructor() {
    this._entries = [];
    this._load();
  }

  _load() {
    try {
      const p = getBankPath();
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        this._entries = data.entries || [];
      }
    } catch { /* start fresh */ }
  }

  _persist() {
    try {
      const p = getBankPath();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify({
        entries: this._entries,
        updatedAt: new Date().toISOString(),
        count: this._entries.length,
      }, null, 2));
    } catch { /* best-effort */ }
  }

  /**
   * Append a run entry.
   */
  append(entry) {
    const record = {
      runId: entry.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      storyId: entry.storyId,
      model: entry.model,
      result: entry.result || entry.status,
      passed: entry.passed || 0,
      failed: entry.failed || 0,
      warnings: entry.warnings || 0,
      bugsFound: entry.bugsFound || [],
      bugsFixed: entry.bugsFixed || [],
      duration: entry.duration || 0,
      notes: entry.notes || '',
      importance: this._computeImportance(entry),
      createdAt: new Date().toISOString(),
    };

    this._entries.push(record);

    // EWC++ pruning: preserve high-importance entries
    if (this._entries.length > MAX_ENTRIES) {
      this._prune();
    }

    this._persist();
    return record;
  }

  /**
   * Compute importance score for an entry.
   * Bugs found = high, clean pass = medium, fail with no findings = low.
   */
  _computeImportance(entry) {
    let score = 0.3; // base
    if ((entry.bugsFound || []).length > 0) score += 0.4;
    if ((entry.bugsFixed || []).length > 0) score += 0.2;
    if (entry.passed > 0) score += 0.1;
    return Math.min(1.0, score);
  }

  /**
   * EWC++ pruning: remove low-importance entries first.
   */
  _prune() {
    this._entries.sort((a, b) => b.importance - a.importance);
    this._entries = this._entries.slice(0, MAX_ENTRIES);
  }

  /**
   * RETRIEVE: Query entries by filters.
   */
  query({ storyId, model, since, limit = 10 } = {}) {
    let results = this._entries;

    if (storyId) results = results.filter(e => e.storyId === storyId);
    if (model) results = results.filter(e => e.model === model);
    if (since) results = results.filter(e => new Date(e.createdAt) >= new Date(since));

    // Most recent first
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return results.slice(0, limit);
  }

  /**
   * JUDGE: Score relevance of entries for a given context.
   */
  judgeRelevance(entries, context = {}) {
    const now = Date.now();
    return entries.map(entry => {
      let relevance = entry.importance;

      // Recency boost
      const ageMs = now - new Date(entry.createdAt).getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      relevance += Math.max(0, 0.3 - ageDays * 0.01);

      // Same actor boost
      if (context.actor && entry.notes?.includes(context.actor)) {
        relevance += 0.1;
      }

      return { ...entry, relevance: Math.min(1.0, relevance) };
    }).sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * DISTILL: Extract actionable summary for agent context.
   */
  distill(storyId, model, limit = 3) {
    const entries = this.query({ storyId, limit: 20 });
    if (entries.length === 0) return '';

    const ranked = this.judgeRelevance(entries);
    const top = ranked.slice(0, limit);

    const lines = [`Run history for ${storyId}:`];
    for (const entry of top) {
      const bugs = entry.bugsFound?.length || 0;
      lines.push(`- ${entry.model}: ${entry.result} (P:${entry.passed} F:${entry.failed} Bugs:${bugs})`);
    }

    return lines.join('\n');
  }

  /**
   * Model performance stats by story.
   */
  modelStats(storyId) {
    const entries = storyId ? this._entries.filter(e => e.storyId === storyId) : this._entries;
    const stats = {};

    for (const entry of entries) {
      if (!stats[entry.model]) {
        stats[entry.model] = { runs: 0, passed: 0, failed: 0, totalBugs: 0, avgDuration: 0, totalDuration: 0 };
      }
      const s = stats[entry.model];
      s.runs++;
      if (entry.result === 'passed') s.passed++;
      else s.failed++;
      s.totalBugs += (entry.bugsFound || []).length;
      s.totalDuration += entry.duration || 0;
      s.avgDuration = s.totalDuration / s.runs;
    }

    return stats;
  }

  /**
   * Overall stats.
   */
  stats() {
    return {
      totalEntries: this._entries.length,
      maxEntries: MAX_ENTRIES,
      models: this.modelStats(),
    };
  }

  /**
   * Increase importance of a bug's discovery run (for EWC++).
   */
  boostImportance(runId, amount = 0.2) {
    const entry = this._entries.find(e => e.runId === runId);
    if (entry) {
      entry.importance = Math.min(1.0, entry.importance + amount);
      this._persist();
    }
  }
}

const reasoningBank = new ReasoningBank();
export default reasoningBank;
