'use client';

import { useDashboard } from '@/context/dashboard-context';

export default function EventLog() {
  const { logEntries, clearLog } = useDashboard();

  return (
    <>
      <div className="section-title">Event Log</div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">Live Activity Feed</h3>
          <button onClick={clearLog} className="btn py-1.5 px-3 text-[10px]">Clear</button>
        </div>
        <div className="p-3 max-h-[300px] overflow-y-auto font-mono text-[11px] leading-[1.8]">
          {logEntries.map((entry, i) => (
            <div
              key={i}
              className={`flex gap-3 px-2 py-0.5 rounded hover:bg-white/[0.02] transition-colors ${
                entry.type === 'error' ? '[&_.log-msg]:text-red-400' :
                entry.type === 'success' ? '[&_.log-msg]:text-green-400' : ''
              }`}
            >
              <span className="text-zinc-500 whitespace-nowrap">{entry.time}</span>
              <span className="text-accent min-w-[90px]">{entry.agent}</span>
              <span className="log-msg text-zinc-400">{entry.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
