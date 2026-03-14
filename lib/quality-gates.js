/**
 * Quality Gates Engine — inspired by AutoForge's enforcement gates
 * and ruflo's three-stage validation (pre/during/post-execution).
 *
 * Validates task results before the pipeline advances to the next task.
 * Gates are configurable per-project in project.json under "qualityGates".
 *
 * Gate types:
 *   - minPassRate: minimum % of tests that must pass
 *   - maxP1Bugs: maximum number of P1 (critical) bugs allowed
 *   - maxFailures: maximum number of failures allowed
 *   - requireReport: report markdown file must exist
 *   - customChecks: array of {field, operator, value} rules
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader.js';
import { parseQaSummaryFromReport, parseFindingsFromReport } from './report-parser.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_GATES = {
  enabled: false,
  enforceOnPipeline: true,     // block pipeline advancement on gate failure
  enforceOnFinalize: false,    // block auto-finalization on gate failure
  rules: {
    minPassRate: 0,            // 0 = disabled
    maxP1Bugs: Infinity,
    maxFailures: Infinity,
    requireReport: false,
  },
  // Action when gate fails: 'block' (pause pipeline) | 'warn' (log + continue)
  failAction: 'warn',
};

export function loadQualityGatesConfig() {
  try {
    const { project } = getProjectConfig();
    const qg = project.qualityGates || {};
    return {
      ...DEFAULT_GATES,
      ...qg,
      rules: { ...DEFAULT_GATES.rules, ...(qg.rules || {}) },
    };
  } catch {
    return { ...DEFAULT_GATES };
  }
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate quality gates for a completed task.
 *
 * @param {string} taskId
 * @param {object} result - the task result payload (status, passed, failed, etc.)
 * @param {string} reportsDir - path to reports-md directory
 * @returns {{ passed: boolean, violations: Array<{rule, message, severity}> }}
 */
export function evaluateGates(taskId, result, reportsDir) {
  const config = loadQualityGatesConfig();
  if (!config.enabled) return { passed: true, violations: [] };

  const violations = [];
  const rules = config.rules;

  // Rule: requireReport
  if (rules.requireReport && reportsDir) {
    const reportPath = path.join(reportsDir, `${taskId}.md`);
    if (!fs.existsSync(reportPath)) {
      violations.push({
        rule: 'requireReport',
        message: `Report file missing: ${taskId}.md`,
        severity: 'error',
      });
    }
  }

  // Rule: maxFailures
  const failures = result.failed || 0;
  if (typeof rules.maxFailures === 'number' && failures > rules.maxFailures) {
    violations.push({
      rule: 'maxFailures',
      message: `${failures} failures exceeds max ${rules.maxFailures}`,
      severity: 'error',
    });
  }

  // Rule: minPassRate
  if (rules.minPassRate > 0) {
    const passed = result.passed || 0;
    const total = passed + failures;
    const rate = total > 0 ? (passed / total) * 100 : 0;
    if (rate < rules.minPassRate) {
      violations.push({
        rule: 'minPassRate',
        message: `Pass rate ${rate.toFixed(1)}% below minimum ${rules.minPassRate}%`,
        severity: 'error',
      });
    }
  }

  // Rule: maxP1Bugs — check findings from report
  if (typeof rules.maxP1Bugs === 'number' && rules.maxP1Bugs !== Infinity && reportsDir) {
    const reportPath = path.join(reportsDir, `${taskId}.md`);
    try {
      if (fs.existsSync(reportPath)) {
        const md = fs.readFileSync(reportPath, 'utf8');
        const findings = parseFindingsFromReport(md);
        const p1Count = findings.filter(f => f.severity === 'P1').length;
        if (p1Count > rules.maxP1Bugs) {
          violations.push({
            rule: 'maxP1Bugs',
            message: `${p1Count} P1 bugs exceeds max ${rules.maxP1Bugs}`,
            severity: 'critical',
          });
        }
      }
    } catch { /* best-effort */ }
  }

  // Custom checks: [{field, operator, value}]
  if (Array.isArray(rules.customChecks)) {
    for (const check of rules.customChecks) {
      const actual = result[check.field];
      if (actual === undefined) continue;
      let failed = false;
      switch (check.operator) {
        case 'gt': failed = actual > check.value; break;
        case 'gte': failed = actual >= check.value; break;
        case 'lt': failed = actual < check.value; break;
        case 'lte': failed = actual <= check.value; break;
        case 'eq': failed = actual === check.value; break;
        case 'neq': failed = actual !== check.value; break;
      }
      if (failed) {
        violations.push({
          rule: `custom:${check.field}`,
          message: `${check.field} (${actual}) ${check.operator} ${check.value}`,
          severity: check.severity || 'warning',
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

// ---------------------------------------------------------------------------
// Gate result storage (in-memory ring buffer for API access)
// ---------------------------------------------------------------------------

const _gateResults = [];  // { taskId, timestamp, passed, violations, action }
const MAX_GATE_RESULTS = 100;

export function recordGateResult(taskId, evaluation, action) {
  _gateResults.unshift({
    taskId,
    timestamp: Date.now(),
    passed: evaluation.passed,
    violations: evaluation.violations,
    action, // 'blocked' | 'warned' | 'passed'
  });
  if (_gateResults.length > MAX_GATE_RESULTS) _gateResults.length = MAX_GATE_RESULTS;
}

export function getGateResults() {
  return [..._gateResults];
}

export function getGateStatus() {
  const config = loadQualityGatesConfig();
  return {
    enabled: config.enabled,
    failAction: config.failAction,
    enforceOnPipeline: config.enforceOnPipeline,
    rules: config.rules,
    recentResults: _gateResults.slice(0, 20),
    totalChecked: _gateResults.length,
    totalBlocked: _gateResults.filter(r => r.action === 'blocked').length,
    totalWarned: _gateResults.filter(r => r.action === 'warned').length,
  };
}
