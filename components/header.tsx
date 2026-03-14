'use client';

import { useDashboard } from '@/context/dashboard-context';
import { useProjectConfig } from '@/context/project-config-context';

export default function Header() {
  const { pollStatus, gatewayStatus } = useDashboard();
  const { project } = useProjectConfig();
  const isLive = pollStatus.startsWith('Live');

  const gwDot = gatewayStatus === 'connected' ? 'bg-green-400'
    : gatewayStatus === 'needs_config' ? 'bg-amber-400'
    : gatewayStatus === 'recovering' ? 'bg-blue-400 animate-pulse'
    : 'bg-zinc-600';

  const gwLabel = gatewayStatus === 'recovering' ? 'Gateway (restarting...)' : 'Gateway';

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-accent to-purple-400 rounded-lg flex items-center justify-center text-lg">
          {project.icon}
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-zinc-100">{project.name}</h1>
          <div className="font-mono text-[9px] text-zinc-500 uppercase tracking-[1.5px]">{project.subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
          <div className={`w-1.5 h-1.5 rounded-full ${gwDot}`} />
          <span>{gwLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
          <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-green-400' : 'bg-red-400'}`} />
          <span>{pollStatus}</span>
        </div>
      </div>
    </header>
  );
}
