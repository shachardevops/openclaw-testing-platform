'use client';

import { useState } from 'react';
import { useOrphanedSessions } from '@/hooks/use-orphaned-sessions';

export default function SessionMonitor() {
  const [maxAgeMin, setMaxAgeMin] = useState(30);
  const { sessions, status } = useOrphanedSessions(maxAgeMin);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>🩺</span> Orphaned Sessions Monitor
        </h3>
        <div className="flex gap-2 items-center">
          <label className="text-[10px] text-zinc-500">
            Stale &gt;{' '}
            <select
              value={maxAgeMin}
              onChange={(e) => setMaxAgeMin(Number(e.target.value))}
              className="btn-mini ml-1"
            >
              <option value={15}>15m</option>
              <option value={30}>30m</option>
              <option value={60}>60m</option>
              <option value={120}>120m</option>
            </select>
          </label>
          <span className="font-mono text-[10px] text-zinc-500">{status}</span>
        </div>
      </div>
      <div className="p-3 font-mono text-[11px] text-zinc-400">
        {sessions.length === 0 ? (
          <span className="text-green-400">✅ No orphaned sessions detected.</span>
        ) : (
          sessions.map((s, i) => (
            <div key={i} className="py-1.5 border-b border-border last:border-b-0">
              <div className="font-semibold">{s.key || s.sessionId}</div>
              <div className="text-zinc-500">age: {s.ageMin}m · model: {s.model || 'n/a'} · kind: {s.kind || 'n/a'}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
