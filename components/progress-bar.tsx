'use client';

interface ProgressBarProps {
  progress?: number;
  label?: string;
  status?: string;
}

export default function ProgressBar({ progress = 0, label, status }: ProgressBarProps) {
  const barColor = status === 'passed'
    ? 'bg-green-400'
    : status === 'failed'
      ? 'bg-red-400'
      : 'bg-gradient-to-r from-accent to-purple-400';

  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Progress</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label || `${progress}%`}</span>
      </div>
      <div className="h-1 bg-bg rounded-sm overflow-hidden">
        <div
          className={`h-full rounded-sm transition-[width] duration-500 ease-out ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
