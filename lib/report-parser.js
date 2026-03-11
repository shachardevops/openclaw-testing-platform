import fs from 'fs';
import path from 'path';

// ── Parse QA summary from markdown report ───────────────────────

export function parseQaSummaryFromReport(markdown) {
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

// ── Extract individual findings (bugs + warnings) from markdown ──

export function parseFindingsFromReport(markdown) {
  if (!markdown) return [];
  const findings = [];

  // Match: 🐛 BUG (P1) — BUG-ID — Title  or  ⚠️ WARNING — WARN-ID — Title
  // Also handles: - **BUG** (P2) — ID — Title  and  - **WARNING** — ID — Title
  const pattern = /(?:🐛|[*]{2}BUG[*]{2}|\bBUG\b)\s*\(?(P[1-4])?\)?\s*—\s*([\w-]+)\s*—\s*(.+)|(?:⚠️|[*]{2}WARNING[*]{2}|\bWARNING\b)\s*—\s*([\w-]+)\s*—\s*(.+)/gm;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    if (match[2]) {
      // Bug match
      findings.push({
        id: match[2].trim(),
        severity: match[1] || 'BUG',
        title: match[3].trim(),
        type: 'bug',
      });
    } else if (match[4]) {
      // Warning match
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

// ── Check if a running task can be auto-finalized ───────────────
// Returns updated payload if report exists and is newer. Does NOT write.
// Caller decides whether to persist the change.
// Accepts any task ID — caller is responsible for filtering.

export function tryFinalizeFromReport(taskId, reportsDir, payload) {
  if (!taskId || !payload || payload.status !== 'running') return null;

  // Don't finalize from a partial report — the agent may still be writing it.
  // progress < 100 means the task hasn't self-reported completion yet.
  if (typeof payload.progress === 'number' && payload.progress < 100 && payload.progress > 0) return null;

  const reportPath = path.join(reportsDir, `${taskId}.md`);
  if (!fs.existsSync(reportPath)) return null;

  const reportStat = fs.statSync(reportPath);
  const startedMs = payload.startedAt ? Date.parse(payload.startedAt) : 0;
  if (startedMs && reportStat.mtimeMs < startedMs) return null;

  let markdown;
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
