import { describe, it, expect } from 'vitest';
import { normalizeStatus, normalizeResult } from '@/lib/normalize-status';

// ─── normalizeStatus ────────────────────────────────────────────────────────

describe('normalizeStatus', () => {
  it('returns idle for null/undefined input', () => {
    expect(normalizeStatus(null)).toBe('idle');
    expect(normalizeStatus(undefined)).toBe('idle');
  });

  it('returns idle when status is missing', () => {
    expect(normalizeStatus({})).toBe('idle');
  });

  it('passes through non-completed statuses unchanged', () => {
    expect(normalizeStatus({ status: 'running' })).toBe('running');
    expect(normalizeStatus({ status: 'idle' })).toBe('idle');
    expect(normalizeStatus({ status: 'cancelled' })).toBe('cancelled');
    expect(normalizeStatus({ status: 'passed' })).toBe('passed');
    expect(normalizeStatus({ status: 'failed' })).toBe('failed');
  });

  it('maps "completed" to "passed" when no failures', () => {
    expect(normalizeStatus({ status: 'completed' })).toBe('passed');
  });

  it('maps "done" to "passed" when no failures', () => {
    expect(normalizeStatus({ status: 'done' })).toBe('passed');
  });

  it('maps "completed" to "failed" when failed count > 0', () => {
    expect(normalizeStatus({ status: 'completed', failed: 2 })).toBe('failed');
  });

  it('maps "done" to "failed" when bugs count > 0', () => {
    expect(normalizeStatus({ status: 'done', bugs: 1 })).toBe('failed');
  });

  it('counts failed array length', () => {
    expect(normalizeStatus({ status: 'completed', failed: ['a', 'b'] })).toBe('failed');
  });

  it('counts bugs array length', () => {
    expect(normalizeStatus({ status: 'completed', bugs: ['bug1'] })).toBe('failed');
  });

  it('checks summary.failed when top-level is absent', () => {
    expect(normalizeStatus({ status: 'completed', summary: { failed: 3 } })).toBe('failed');
  });

  it('checks summary.bugs when top-level is absent', () => {
    expect(normalizeStatus({ status: 'completed', summary: { bugs: ['b1'] } })).toBe('failed');
  });

  it('counts defects excluding warn/warning/info severity', () => {
    expect(
      normalizeStatus({
        status: 'completed',
        defects: [{ severity: 'critical' }],
      })
    ).toBe('failed');
  });

  it('does not count defects with warn/warning/info severity', () => {
    expect(
      normalizeStatus({
        status: 'completed',
        defects: [
          { severity: 'warn' },
          { severity: 'warning' },
          { severity: 'info' },
          { severity: 'WARNING' },
          { severity: 'Info' },
        ],
      })
    ).toBe('passed');
  });

  it('combines failed count and defect count', () => {
    expect(
      normalizeStatus({
        status: 'done',
        failed: 0,
        defects: [{ severity: 'high' }],
      })
    ).toBe('failed');
  });

  it('treats defects with no severity as non-warning (counted)', () => {
    expect(
      normalizeStatus({
        status: 'completed',
        defects: [{ severity: '' }],
      })
    ).toBe('failed');
  });

  it('handles missing defect severity field', () => {
    expect(
      normalizeStatus({
        status: 'completed',
        defects: [{}],
      })
    ).toBe('failed');
  });
});

// ─── normalizeResult ────────────────────────────────────────────────────────

describe('normalizeResult', () => {
  it('returns null for null input', () => {
    expect(normalizeResult(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeResult(undefined)).toBeUndefined();
  });

  it('returns the result object unchanged when no normalization needed', () => {
    const result = { status: 'running', passed: 5, failed: 1, warnings: 0 };
    expect(normalizeResult(result)).toBe(result);
  });

  // ── summary field promotion ──

  it('promotes summary.passed to top level when passed is missing', () => {
    const result = normalizeResult({ summary: { passed: 10 } })!;
    expect(result.passed).toBe(10);
  });

  it('promotes summary.failed to top level when failed is missing', () => {
    const result = normalizeResult({ summary: { failed: 3 } })!;
    expect(result.failed).toBe(3);
  });

  it('promotes summary.warnings to top level when warnings is missing', () => {
    const result = normalizeResult({ summary: { warnings: 2 } })!;
    expect(result.warnings).toBe(2);
  });

  it('promotes summary.bugs as failed when failed is missing', () => {
    const result = normalizeResult({ summary: { bugs: 4 } })!;
    expect(result.failed).toBe(4);
  });

  it('does not overwrite existing top-level fields with summary', () => {
    const result = normalizeResult({
      passed: 5,
      failed: 1,
      warnings: 0,
      summary: { passed: 99, failed: 99, warnings: 99 },
    })!;
    expect(result.passed).toBe(5);
    expect(result.failed).toBe(1);
    expect(result.warnings).toBe(0);
  });

  it('handles summary.passed=0 correctly (does not skip falsy 0)', () => {
    const result = normalizeResult({ summary: { passed: 0 } })!;
    expect(result.passed).toBe(0);
  });

  // ── defects → findings conversion ──

  it('converts defects to findings when findings is absent', () => {
    const result = normalizeResult({
      defects: [
        {
          id: 'D-1',
          severity: 'critical',
          title: 'Auth bypass',
          impact: 'Full access',
          module: 'auth',
          page: '/login',
          steps: 'Step 1',
          expected: 'Blocked',
          actual: 'Allowed',
        },
      ],
    })!;
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual({
      id: 'D-1',
      severity: 'P1',
      title: 'Auth bypass',
      description: 'Full access',
      module: 'auth',
      page: '/login',
      steps: 'Step 1',
      expected: 'Blocked',
      actual: 'Allowed',
    });
  });

  it('does not overwrite existing findings', () => {
    const existing = [{ id: 'F-1', severity: 'P2', title: 'Existing' }];
    const result = normalizeResult({
      findings: existing,
      defects: [{ id: 'D-1', severity: 'high', title: 'New' }],
    })!;
    expect(result.findings).toBe(existing);
    expect(result.findings).toHaveLength(1);
  });

  it('does not create findings for empty defects array', () => {
    const result = normalizeResult({ defects: [] })!;
    expect(result.findings).toBeUndefined();
  });

  it('normalizes severity values in defect conversion', () => {
    const cases: [string, string][] = [
      ['critical', 'P1'],
      ['blocker', 'P1'],
      ['high', 'P2'],
      ['major', 'P2'],
      ['medium', 'P3'],
      ['low', 'P4'],
      ['minor', 'P4'],
      ['warn', 'WARNING'],
      ['warning', 'WARNING'],
      ['info', 'INFO'],
    ];
    for (const [input, expected] of cases) {
      const result = normalizeResult({
        defects: [{ id: `D-${input}`, severity: input, title: 'Test' }],
      })!;
      expect(result.findings![0].severity).toBe(expected);
    }
  });

  it('defaults severity to P3 for null/undefined severity', () => {
    const result = normalizeResult({
      defects: [{ id: 'D-1', severity: null, title: 'No sev' }],
    })!;
    expect(result.findings![0].severity).toBe('P3');
  });

  it('uppercases unknown severity values', () => {
    const result = normalizeResult({
      defects: [{ id: 'D-1', severity: 'custom', title: 'Custom' }],
    })!;
    expect(result.findings![0].severity).toBe('CUSTOM');
  });

  it('uses description as fallback for title', () => {
    const result = normalizeResult({
      defects: [{ id: 'D-1', severity: 'medium', description: 'Desc text' }],
    })!;
    expect(result.findings![0].title).toBe('Desc text');
  });

  it('uses component as fallback for module', () => {
    const result = normalizeResult({
      defects: [{ id: 'D-1', severity: 'low', title: 'T', component: 'cart' }],
    })!;
    expect(result.findings![0].module).toBe('cart');
  });

  it('uses url as fallback for page', () => {
    const result = normalizeResult({
      defects: [{ id: 'D-1', severity: 'low', title: 'T', url: '/checkout' }],
    })!;
    expect(result.findings![0].page).toBe('/checkout');
  });

  // ── completedAt → finishedAt ──

  it('copies completedAt to finishedAt when finishedAt is absent', () => {
    const result = normalizeResult({ completedAt: '2025-06-01T12:00:00Z' })!;
    expect(result.finishedAt).toBe('2025-06-01T12:00:00Z');
  });

  it('does not overwrite existing finishedAt', () => {
    const result = normalizeResult({
      finishedAt: '2025-01-01T00:00:00Z',
      completedAt: '2025-06-01T12:00:00Z',
    })!;
    expect(result.finishedAt).toBe('2025-01-01T00:00:00Z');
  });

  // ── combined normalization ──

  it('applies all normalizations together', () => {
    const result = normalizeResult({
      summary: { passed: 5, failed: 2, warnings: 1 },
      defects: [
        { id: 'D-1', severity: 'high', title: 'Bug A', impact: 'Bad' },
      ],
      completedAt: '2025-03-14T10:00:00Z',
    })!;

    expect(result.passed).toBe(5);
    expect(result.failed).toBe(2);
    expect(result.warnings).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings![0].severity).toBe('P2');
    expect(result.finishedAt).toBe('2025-03-14T10:00:00Z');
  });
});
