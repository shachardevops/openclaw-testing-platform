import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseQaSummaryFromReport,
  parseFindingsFromReport,
  tryFinalizeFromReport,
} from '@/lib/report-parser';
import fs from 'fs';
import path from 'path';

// ─── parseQaSummaryFromReport ───────────────────────────────────────────────

describe('parseQaSummaryFromReport', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(parseQaSummaryFromReport(null)).toBeNull();
    expect(parseQaSummaryFromReport(undefined)).toBeNull();
    expect(parseQaSummaryFromReport('')).toBeNull();
  });

  it('parses Format 1: SUMMARY line', () => {
    const md = 'SUMMARY: Passed: 10 | Failed: 3 | Warnings: 2';
    expect(parseQaSummaryFromReport(md)).toEqual({ passed: 10, failed: 3, warnings: 2 });
  });

  it('parses Format 1 case-insensitively', () => {
    const md = 'passed: 5 | failed: 1 | warning: 0';
    expect(parseQaSummaryFromReport(md)).toEqual({ passed: 5, failed: 1, warnings: 0 });
  });

  it('parses Format 2: count PASS | FAIL | WARN', () => {
    const md = '**Counts:** 8 PASS | 2 FAIL | 1 WARN';
    expect(parseQaSummaryFromReport(md)).toEqual({ passed: 8, failed: 2, warnings: 1 });
  });

  it('parses Format 2 case-insensitively', () => {
    const md = '12 pass | 0 fail | 4 warn';
    expect(parseQaSummaryFromReport(md)).toEqual({ passed: 12, failed: 0, warnings: 4 });
  });

  it('parses Format 3: table row | Total | X | Y | Z |', () => {
    const md = '| **Total** | **15** | **3** | **5** |';
    // Format 3 maps: passed=15, warnings=3, failed=5
    expect(parseQaSummaryFromReport(md)).toEqual({ passed: 15, warnings: 3, failed: 5 });
  });

  it('parses Format 3 without bold markers', () => {
    const md = '| Total | 20 | 1 | 2 |';
    expect(parseQaSummaryFromReport(md)).toEqual({ passed: 20, warnings: 1, failed: 2 });
  });

  it('returns null when no format matches', () => {
    expect(parseQaSummaryFromReport('Just some random text')).toBeNull();
    expect(parseQaSummaryFromReport('# Report\nNo numbers here')).toBeNull();
  });

  it('extracts summary from a larger markdown document (Format 1)', () => {
    const md = `# QA Report
Some preamble text.
SUMMARY: Passed: 7 | Failed: 2 | Warnings: 1
More text after.`;
    expect(parseQaSummaryFromReport(md)).toEqual({ passed: 7, failed: 2, warnings: 1 });
  });

  it('matches the first format found when multiple are present', () => {
    const md = `Passed: 5 | Failed: 1 | Warnings: 0
8 PASS | 2 FAIL | 1 WARN`;
    // Format 1 should match first
    expect(parseQaSummaryFromReport(md)).toEqual({ passed: 5, failed: 1, warnings: 0 });
  });
});

// ─── parseFindingsFromReport ────────────────────────────────────────────────

describe('parseFindingsFromReport', () => {
  it('returns empty array for null/undefined/empty', () => {
    expect(parseFindingsFromReport(null)).toEqual([]);
    expect(parseFindingsFromReport(undefined)).toEqual([]);
    expect(parseFindingsFromReport('')).toEqual([]);
  });

  it('parses BUG with severity and emoji', () => {
    const md = '\u{1F41B} (P1) \u2014 BUG-001 \u2014 Login fails with empty password';
    const findings = parseFindingsFromReport(md);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      id: 'BUG-001',
      severity: 'P1',
      title: 'Login fails with empty password',
      type: 'bug',
    });
  });

  it('parses BUG keyword without emoji', () => {
    const md = 'BUG (P2) \u2014 BUG-042 \u2014 Cart total miscalculated';
    const findings = parseFindingsFromReport(md);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      id: 'BUG-042',
      severity: 'P2',
      title: 'Cart total miscalculated',
      type: 'bug',
    });
  });

  it('parses bold **BUG** keyword', () => {
    const md = '**BUG** (P3) \u2014 BUG-100 \u2014 Minor styling issue';
    const findings = parseFindingsFromReport(md);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      id: 'BUG-100',
      severity: 'P3',
      title: 'Minor styling issue',
      type: 'bug',
    });
  });

  it('defaults severity to BUG when no P-level given', () => {
    const md = 'BUG \u2014 BUG-999 \u2014 No severity specified';
    const findings = parseFindingsFromReport(md);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('BUG');
  });

  it('parses WARNING with emoji', () => {
    const md = '\u26A0\uFE0F \u2014 WARN-001 \u2014 Slow page load time';
    const findings = parseFindingsFromReport(md);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      id: 'WARN-001',
      severity: 'WARNING',
      title: 'Slow page load time',
      type: 'warning',
    });
  });

  it('parses WARNING keyword without emoji', () => {
    const md = 'WARNING \u2014 WARN-002 \u2014 Deprecated API usage';
    const findings = parseFindingsFromReport(md);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      id: 'WARN-002',
      severity: 'WARNING',
      title: 'Deprecated API usage',
      type: 'warning',
    });
  });

  it('parses bold **WARNING** keyword', () => {
    const md = '**WARNING** \u2014 WARN-003 \u2014 Missing alt text';
    const findings = parseFindingsFromReport(md);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      id: 'WARN-003',
      severity: 'WARNING',
      title: 'Missing alt text',
      type: 'warning',
    });
  });

  it('parses multiple findings of mixed severities', () => {
    const md = `# Findings
\u{1F41B} (P1) \u2014 BUG-001 \u2014 Critical auth bypass
BUG (P2) \u2014 BUG-002 \u2014 Data validation missing
**BUG** (P3) \u2014 BUG-003 \u2014 UI alignment off
\u26A0\uFE0F \u2014 WARN-001 \u2014 Performance concern
WARNING \u2014 WARN-002 \u2014 Hardcoded values`;
    const findings = parseFindingsFromReport(md);
    expect(findings).toHaveLength(5);
    expect(findings[0].severity).toBe('P1');
    expect(findings[0].type).toBe('bug');
    expect(findings[1].severity).toBe('P2');
    expect(findings[2].severity).toBe('P3');
    expect(findings[3].severity).toBe('WARNING');
    expect(findings[3].type).toBe('warning');
    expect(findings[4].severity).toBe('WARNING');
    expect(findings[4].type).toBe('warning');
  });

  it('returns empty array for markdown with no findings', () => {
    const md = `# QA Report
All tests passed. No bugs found.
SUMMARY: Passed: 10 | Failed: 0 | Warnings: 0`;
    expect(parseFindingsFromReport(md)).toEqual([]);
  });

  it('handles malformed lines that almost match but do not', () => {
    const md = `BUG without dashes
WARNING: no em-dash here
Something BUG (P1) missing rest`;
    expect(parseFindingsFromReport(md)).toEqual([]);
  });

  it('parses P4 severity', () => {
    const md = 'BUG (P4) \u2014 BUG-050 \u2014 Cosmetic issue in footer';
    const findings = parseFindingsFromReport(md);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('P4');
  });
});

// ─── tryFinalizeFromReport ──────────────────────────────────────────────────

describe('tryFinalizeFromReport', () => {
  const tmpDir = path.join(__dirname, '__tmp_reports__');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeReport(taskId: string, content: string, mtime?: Date) {
    const p = path.join(tmpDir, `${taskId}.md`);
    fs.writeFileSync(p, content, 'utf8');
    if (mtime) {
      fs.utimesSync(p, mtime, mtime);
    }
  }

  it('returns null when taskId is empty', () => {
    expect(tryFinalizeFromReport('', tmpDir, { status: 'running' } as any)).toBeNull();
  });

  it('returns null when payload is null/undefined', () => {
    expect(tryFinalizeFromReport('task-1', tmpDir, null as any)).toBeNull();
    expect(tryFinalizeFromReport('task-1', tmpDir, undefined as any)).toBeNull();
  });

  it('returns null when status is not running', () => {
    expect(
      tryFinalizeFromReport('task-1', tmpDir, { status: 'passed' } as any)
    ).toBeNull();
    expect(
      tryFinalizeFromReport('task-1', tmpDir, { status: 'failed' } as any)
    ).toBeNull();
    expect(
      tryFinalizeFromReport('task-1', tmpDir, { status: 'idle' } as any)
    ).toBeNull();
  });

  it('returns null when progress is between 1 and 99', () => {
    writeReport('task-1', 'SUMMARY: Passed: 5 | Failed: 0 | Warnings: 0');
    expect(
      tryFinalizeFromReport('task-1', tmpDir, { status: 'running', progress: 50 } as any)
    ).toBeNull();
  });

  it('returns null when report file does not exist', () => {
    expect(
      tryFinalizeFromReport('nonexistent', tmpDir, { status: 'running' } as any)
    ).toBeNull();
  });

  it('returns null when report is older than startedAt', () => {
    const oldDate = new Date('2020-01-01T00:00:00Z');
    writeReport('task-1', 'SUMMARY: Passed: 5 | Failed: 0 | Warnings: 0', oldDate);
    expect(
      tryFinalizeFromReport('task-1', tmpDir, {
        status: 'running',
        startedAt: '2025-01-01T00:00:00Z',
      } as any)
    ).toBeNull();
  });

  it('returns null when report has no parseable summary', () => {
    writeReport('task-1', '# Report\nNo summary here.');
    expect(
      tryFinalizeFromReport('task-1', tmpDir, { status: 'running' } as any)
    ).toBeNull();
  });

  it('finalizes as passed when failed=0', () => {
    writeReport('task-1', 'SUMMARY: Passed: 10 | Failed: 0 | Warnings: 2');
    const result = tryFinalizeFromReport('task-1', tmpDir, { status: 'running' } as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('passed');
    expect(result!.passed).toBe(10);
    expect(result!.failed).toBe(0);
    expect(result!.warnings).toBe(2);
    expect(result!.progress).toBe(100);
    expect(result!.finishedAt).toBeDefined();
  });

  it('finalizes as failed when failed > 0', () => {
    writeReport('task-1', 'SUMMARY: Passed: 8 | Failed: 3 | Warnings: 1');
    const result = tryFinalizeFromReport('task-1', tmpDir, { status: 'running' } as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('failed');
    expect(result!.failed).toBe(3);
  });

  it('preserves extra payload fields', () => {
    writeReport('task-1', 'SUMMARY: Passed: 5 | Failed: 0 | Warnings: 0');
    const result = tryFinalizeFromReport('task-1', tmpDir, {
      status: 'running',
      model: 'claude-sonnet',
      skills: ['login-flow'],
    } as any);
    expect(result).not.toBeNull();
    expect(result!.model).toBe('claude-sonnet');
    expect(result!.skills).toEqual(['login-flow']);
  });

  it('allows finalization when progress is 0', () => {
    writeReport('task-1', 'SUMMARY: Passed: 3 | Failed: 1 | Warnings: 0');
    const result = tryFinalizeFromReport('task-1', tmpDir, {
      status: 'running',
      progress: 0,
    } as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('failed');
  });

  it('allows finalization when progress is 100', () => {
    writeReport('task-1', 'SUMMARY: Passed: 3 | Failed: 0 | Warnings: 0');
    const result = tryFinalizeFromReport('task-1', tmpDir, {
      status: 'running',
      progress: 100,
    } as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('passed');
  });

  it('allows finalization when progress is undefined', () => {
    writeReport('task-1', 'SUMMARY: Passed: 7 | Failed: 0 | Warnings: 1');
    const result = tryFinalizeFromReport('task-1', tmpDir, {
      status: 'running',
    } as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('passed');
  });

  it('allows finalization when startedAt is not set', () => {
    writeReport('task-1', 'SUMMARY: Passed: 1 | Failed: 0 | Warnings: 0');
    const result = tryFinalizeFromReport('task-1', tmpDir, { status: 'running' } as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('passed');
  });
});
