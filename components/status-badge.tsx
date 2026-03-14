'use client';

interface StatusBadgeProps {
  status?: string;
}

const styles: Record<string, string> = {
  idle: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  queueing: 'bg-accent/10 text-accent border-accent/25',
  running: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  passed: 'bg-green-400/10 text-green-400 border-green-400/20',
  failed: 'bg-red-400/10 text-red-400 border-red-400/20',
};

export default function StatusBadge({ status = 'idle' }: StatusBadgeProps) {
  const cls = styles[status] || styles.idle;
  const animate = status === 'running' || status === 'queueing';

  return (
    <div className={`font-mono text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${cls}`}>
      <div className={`w-1.5 h-1.5 rounded-full bg-current ${animate ? 'animate-pulse' : ''}`} />
      <span>{status}</span>
    </div>
  );
}
