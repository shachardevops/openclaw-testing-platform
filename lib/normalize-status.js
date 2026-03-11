// Single source of truth for status normalization.
// OpenClaw agents report status in various formats — we normalize to:
// idle | running | passed | failed

export function normalizeStatus(result) {
  if (!result) return 'idle';
  const raw = result.status || 'idle';

  // Count failures from any field shape the agent might use
  const failCount = _countField(result, 'failed') + _countField(result, 'bugs');
  const defectCount = (result.defects || []).filter(d => {
    const sev = (d.severity || '').toLowerCase();
    return sev !== 'warn' && sev !== 'warning' && sev !== 'info';
  }).length;
  const totalFails = failCount + defectCount;

  if (raw === 'completed' || raw === 'done') {
    return totalFails > 0 ? 'failed' : 'passed';
  }
  return raw;
}

function _countField(result, key) {
  const v = result[key];
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.length;
  // Check nested summary
  const sv = result.summary?.[key];
  if (typeof sv === 'number') return sv;
  if (Array.isArray(sv)) return sv.length;
  return 0;
}

/**
 * Normalize a result object's fields so the dashboard can read them uniformly.
 * Mutates and returns the same object.
 */
export function normalizeResult(result) {
  if (!result) return result;

  // Normalize pass/fail/warning counts from summary if top-level is missing
  if (result.summary) {
    if (result.passed == null && result.summary.passed != null) result.passed = result.summary.passed;
    if (result.failed == null && result.summary.failed != null) result.failed = result.summary.failed;
    if (result.warnings == null && result.summary.warnings != null) result.warnings = result.summary.warnings;
    // Some agents report "bugs" instead of "failed"
    if (result.failed == null && result.summary.bugs != null) result.failed = result.summary.bugs;
  }

  // Normalize defects → findings
  if (!result.findings && result.defects && result.defects.length > 0) {
    result.findings = result.defects.map(d => ({
      id: d.id,
      severity: _normalizeSeverity(d.severity),
      title: d.title || d.description,
      description: d.impact || d.description,
      module: d.module || d.component,
      page: d.page || d.url,
      steps: d.steps,
      expected: d.expected,
      actual: d.actual,
    }));
  }

  // Normalize finishedAt from completedAt
  if (!result.finishedAt && result.completedAt) {
    result.finishedAt = result.completedAt;
  }

  return result;
}

function _normalizeSeverity(sev) {
  if (!sev) return 'P3';
  const s = sev.toLowerCase();
  if (s === 'critical' || s === 'blocker') return 'P1';
  if (s === 'high' || s === 'major') return 'P2';
  if (s === 'medium') return 'P3';
  if (s === 'low' || s === 'minor') return 'P4';
  if (s === 'warn' || s === 'warning') return 'WARNING';
  if (s === 'info') return 'INFO';
  return sev.toUpperCase(); // already P1/P2/etc
}
