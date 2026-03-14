export function normalizeStatus(result: Record<string, any> | null | undefined): string {
  if (!result) return 'idle';
  const raw = result.status || 'idle';

  const failCount = _countField(result, 'failed') + _countField(result, 'bugs');
  const defectCount = (result.defects || []).filter((d: any) => {
    const sev = (d.severity || '').toLowerCase();
    return sev !== 'warn' && sev !== 'warning' && sev !== 'info';
  }).length;
  const totalFails = failCount + defectCount;

  if (raw === 'completed' || raw === 'done') {
    return totalFails > 0 ? 'failed' : 'passed';
  }
  return raw;
}

function _countField(result: Record<string, any>, key: string): number {
  const v = result[key];
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.length;
  const sv = result.summary?.[key];
  if (typeof sv === 'number') return sv;
  if (Array.isArray(sv)) return sv.length;
  return 0;
}

export function normalizeResult(result: Record<string, any> | null | undefined): Record<string, any> | null | undefined {
  if (!result) return result;

  if (result.summary) {
    if (result.passed == null && result.summary.passed != null) result.passed = result.summary.passed;
    if (result.failed == null && result.summary.failed != null) result.failed = result.summary.failed;
    if (result.warnings == null && result.summary.warnings != null) result.warnings = result.summary.warnings;
    if (result.failed == null && result.summary.bugs != null) result.failed = result.summary.bugs;
  }

  if (!result.findings && result.defects && result.defects.length > 0) {
    result.findings = result.defects.map((d: any) => ({
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

  if (!result.finishedAt && result.completedAt) {
    result.finishedAt = result.completedAt;
  }

  return result;
}

function _normalizeSeverity(sev: string | null | undefined): string {
  if (!sev) return 'P3';
  const s = sev.toLowerCase();
  if (s === 'critical' || s === 'blocker') return 'P1';
  if (s === 'high' || s === 'major') return 'P2';
  if (s === 'medium') return 'P3';
  if (s === 'low' || s === 'minor') return 'P4';
  if (s === 'warn' || s === 'warning') return 'WARNING';
  if (s === 'info') return 'INFO';
  return sev.toUpperCase();
}
