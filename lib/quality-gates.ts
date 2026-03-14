import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './project-loader';
import { parseQaSummaryFromReport, parseFindingsFromReport } from './report-parser';

interface QualityGatesConfig {
  enabled: boolean;
  enforceOnPipeline: boolean;
  enforceOnFinalize: boolean;
  rules: {
    minPassRate: number;
    maxP1Bugs: number;
    maxFailures: number;
    requireReport: boolean;
    customChecks?: Array<{ field: string; operator: string; value: any; severity?: string }>;
  };
  failAction: string;
}

const DEFAULT_GATES: QualityGatesConfig = {
  enabled: false,
  enforceOnPipeline: true,
  enforceOnFinalize: false,
  rules: {
    minPassRate: 0,
    maxP1Bugs: Infinity,
    maxFailures: Infinity,
    requireReport: false,
  },
  failAction: 'warn',
};

export function loadQualityGatesConfig(): QualityGatesConfig {
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

interface GateViolation {
  rule: string;
  message: string;
  severity: string;
}

interface GateEvaluation {
  passed: boolean;
  violations: GateViolation[];
}

export function evaluateGates(taskId: string, result: Record<string, any>, reportsDir: string): GateEvaluation {
  const config = loadQualityGatesConfig();
  if (!config.enabled) return { passed: true, violations: [] };

  const violations: GateViolation[] = [];
  const rules = config.rules;

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

  const failures = result.failed || 0;
  if (typeof rules.maxFailures === 'number' && failures > rules.maxFailures) {
    violations.push({
      rule: 'maxFailures',
      message: `${failures} failures exceeds max ${rules.maxFailures}`,
      severity: 'error',
    });
  }

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

interface GateResult {
  taskId: string;
  timestamp: number;
  passed: boolean;
  violations: GateViolation[];
  action: string;
}

const _gateResults: GateResult[] = [];
const MAX_GATE_RESULTS = 100;

export function recordGateResult(taskId: string, evaluation: GateEvaluation, action: string): void {
  _gateResults.unshift({
    taskId,
    timestamp: Date.now(),
    passed: evaluation.passed,
    violations: evaluation.violations,
    action,
  });
  if (_gateResults.length > MAX_GATE_RESULTS) _gateResults.length = MAX_GATE_RESULTS;
}

export function getGateResults(): GateResult[] {
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
