/**
 * Ruflo Decision Audit — JSONL audit trail for orchestrator decisions.
 *
 * Appends to decision-audit.jsonl, rotates at 500KB.
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';

const MAX_FILE_SIZE = 500 * 1024; // 500KB

function getAuditPath() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory', 'decision-audit.jsonl');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory', 'decision-audit.jsonl');
  }
}

class DecisionAudit {
  constructor() {
    this._path = null;
  }

  _getPath() {
    if (!this._path) this._path = getAuditPath();
    return this._path;
  }

  /**
   * Log a decision to the audit trail.
   */
  log(entry) {
    try {
      const auditPath = this._getPath();
      const dir = path.dirname(auditPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const record = {
        ts: new Date().toISOString(),
        ...entry,
      };

      fs.appendFileSync(auditPath, JSON.stringify(record) + '\n');

      // Rotate if too large
      try {
        const stat = fs.statSync(auditPath);
        if (stat.size > MAX_FILE_SIZE) {
          const rotatedPath = auditPath.replace('.jsonl', `.${Date.now()}.jsonl`);
          fs.renameSync(auditPath, rotatedPath);
        }
      } catch { /* rotation is best-effort */ }
    } catch { /* audit is best-effort */ }
  }

  /**
   * Query the audit trail.
   */
  query({ source, conditionType, target, limit = 50, since } = {}) {
    try {
      const auditPath = this._getPath();
      if (!fs.existsSync(auditPath)) return [];

      const content = fs.readFileSync(auditPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);

      let entries = lines.map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);

      if (source) entries = entries.filter(e => e.source === source);
      if (conditionType) entries = entries.filter(e => e.conditionType === conditionType);
      if (target) entries = entries.filter(e => e.target === target);
      if (since) entries = entries.filter(e => new Date(e.ts) >= new Date(since));

      // Most recent first
      entries.reverse();
      return entries.slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Get audit stats.
   */
  getStats() {
    try {
      const auditPath = this._getPath();
      if (!fs.existsSync(auditPath)) return { entries: 0, sizeBytes: 0 };
      const stat = fs.statSync(auditPath);
      const content = fs.readFileSync(auditPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      return { entries: lines.length, sizeBytes: stat.size };
    } catch {
      return { entries: 0, sizeBytes: 0 };
    }
  }
}

const decisionAudit = new DecisionAudit();
export default decisionAudit;
