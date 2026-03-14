import fs from 'fs';
import path from 'path';

import type { QaSummary, TaskResult } from '@/types/results';

interface Finding {
  id: string;
  severity: string;
  title: string;
  type: string;
}

export function parseQaSummaryFromReport(markdown: string | null | undefined): QaSummary | null {
  if (!markdown) return null;

  // Format 1: SUMMARY: Passed: X | Failed: Y | Warnings: Z
  let m = markdown.match(/Passed:\s*(\d+)\s*\|\s*Failed:\s*(\d+)\s*\|\s*Warnings?:\s*(\d+)/i);
  if (m) return { passed: +m[1], failed: +m[2], warnings: +m[3] };

  // Format 2: **Counts:** X PASS | Y FAIL | Z WARN
  m = markdown.match(/(\d+)\s*PASS\s*\|\s*(\d+)\s*FAIL\s*\|\s*(\d+)\s*WARN/i);
  if (m) return { passed: +m[1], failed: +m[2], warnings: +m[3] };

  // Format 3: Table row | Total | X | Y | Z |
  m = markdown.match(/\|\s*\**\s*Total\s*\**\s*\|\s*\**\s*(\d+)\s*\**\s*\|\s*\**\s*(\d+)\s*\**\s*\|\s*\**\s*(\d+)\s*\**\s*\|/i);
  if (m) return { passed: +m[1], warnings: +m[2], failed: +m[3] };

  return null;
}

export function parseFindingsFromReport(markdown: string | null | undefined): Finding[] {
  if (!markdown) return [];
  const findings: Finding[] = [];

  const pattern = /(?:🐛|[*]{2}BUG[*]{2}|\bBUG\b)\s*\(?(P[1-4])?\)?\s*—\s*([\w-]+)\s*—\s*(.+)|(?:⚠️|[*]{2}WARNING[*]{2}|\bWARNING\b)\s*—\s*([\w-]+)\s*—\s*(.+)/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    if (match[2]) {
      findings.push({
        id: match[2].trim(),
        severity: match[1] || 'BUG',
        title: match[3].trim(),
        type: 'bug',
      });
    } else if (match[4]) {
      findings.push({
        id: match[4].trim(),
        severity: 'WARNING',
        title: match[5].trim(),
        type: 'warning',
      });
    }
  }

  return findings;
}

export function tryFinalizeFromReport(
  taskId: string,
  reportsDir: string,
  payload: TaskResult & Record<string, any>
): (TaskResult & Record<string, any>) | null {
  if (!taskId || !payload || payload.status !== 'running') return null;

  if (typeof payload.progress === 'number' && payload.progress < 100 && payload.progress > 0) return null;

  const reportPath = path.join(reportsDir, `${taskId}.md`);
  if (!fs.existsSync(reportPath)) return null;

  const reportStat = fs.statSync(reportPath);
  const startedMs = payload.startedAt ? Date.parse(payload.startedAt) : 0;
  if (Number.isFinite(startedMs) && startedMs > 0 && reportStat.mtimeMs < startedMs) return null;

  let markdown: string;
  try { markdown = fs.readFileSync(reportPath, 'utf8'); } catch { return null; }

  const summary = parseQaSummaryFromReport(markdown);
  if (!summary) return null;

  return {
    ...payload,
    status: summary.failed > 0 ? 'failed' : 'passed',
    passed: summary.passed,
    failed: summary.failed,
    warnings: summary.warnings,
    progress: 100,
    finishedAt: new Date(reportStat.mtimeMs).toISOString(),
  };
}
