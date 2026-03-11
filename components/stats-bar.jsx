'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/context/dashboard-context';
import { useProjectConfig } from '@/context/project-config-context';
import { normalizeStatus } from '@/lib/normalize-status';

const CARDS = [
  { key: 'total', label: 'Tasks', color: 'text-accent' },
  { key: 'running', label: 'Running', color: 'text-amber-400' },
  { key: 'passed', label: 'Passed', color: 'text-green-400' },
  { key: 'failed', label: 'Failed', color: 'text-red-400' },
  { key: 'findings', label: 'Findings', color: 'text-zinc-500' },
];

export default function StatsBar() {
  const { results } = useDashboard();
  const { tasks: TASKS } = useProjectConfig();

  const stats = useMemo(() => {
    let running = 0, passed = 0, failed = 0, findings = 0;
    for (const t of TASKS) {
      const d = results[t.id];
      if (!d) continue;
      const s = normalizeStatus(d);
      if (s === 'running') running++;
      else if (s === 'passed') passed++;
      else if (s === 'failed') failed++;
      findings += (d.findings || []).length;
    }
    return { total: TASKS.length, running, passed, failed, findings };
  }, [results, TASKS]);

  return (
    <div className="grid grid-cols-5 gap-3 mb-9 max-lg:grid-cols-3 max-sm:grid-cols-2">
      {CARDS.map(c => (
        <div key={c.key} className="bg-card border border-border rounded-xl px-5 py-4 hover:border-border-bright transition-all">
          <div className="font-mono text-[10px] uppercase tracking-[1.5px] text-zinc-500 mb-1.5">{c.label}</div>
          <div className={`text-[28px] font-bold tracking-tight ${c.color}`}>{stats[c.key]}</div>
        </div>
      ))}
    </div>
  );
}
