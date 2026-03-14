'use client';

import { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS = {
  starting: 'text-yellow-400',
  running: 'text-blue-400',
  passed: 'text-green-400',
  failed: 'text-red-400',
  completed: 'text-green-400',
};

export default function SwarmPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ruflo/swarm');
      const data = await res.json();
      if (data.ok) setStatus(data);
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const startSwarm = async () => {
    setLoading(true);
    try {
      const configRes = await fetch('/api/project-config');
      const config = await configRes.json();
      const taskIds = (config.tasks || []).map(t => t.id);
      await fetch('/api/ruflo/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', taskIds, mode: 'tactical' }),
      });
      fetchStatus();
    } catch { /* skip */ }
    setLoading(false);
  };

  const stopSwarm = async () => {
    await fetch('/api/ruflo/swarm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    fetchStatus();
  };

  if (!status) return <div className="p-4 text-zinc-500 text-sm">Loading swarm status...</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">
          Swarm {status.active ? '(Active)' : '(Idle)'}
        </h3>
        <div className="flex gap-2">
          {!status.active ? (
            <button onClick={startSwarm} disabled={loading}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs text-white">
              Start Swarm
            </button>
          ) : (
            <button onClick={stopSwarm}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-xs text-white">
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 text-xs">
        <span className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">
          Started: {status.stats?.started || 0}
        </span>
        <span className="px-2 py-0.5 bg-zinc-800 rounded text-green-400">
          Completed: {status.stats?.completed || 0}
        </span>
        <span className="px-2 py-0.5 bg-zinc-800 rounded text-red-400">
          Failed: {status.stats?.failed || 0}
        </span>
        {status.mode && (
          <span className="px-2 py-0.5 bg-zinc-800 rounded text-blue-400">
            Mode: {status.mode}
          </span>
        )}
      </div>

      {/* Workers */}
      {status.workers?.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 mb-1">Active Workers</h4>
          <div className="space-y-1">
            {status.workers.map(w => (
              <div key={w.taskId} className="flex items-center gap-2 p-2 bg-zinc-800 rounded text-sm">
                <span className={`${STATUS_COLORS[w.status] || 'text-zinc-400'}`}>{w.taskId}</span>
                <span className="text-zinc-500">{w.model}</span>
                <span className="text-zinc-600 text-xs ml-auto">{w.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ready queue */}
      {status.ready?.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 mb-1">Ready ({status.ready.length})</h4>
          <div className="flex flex-wrap gap-1">
            {status.ready.map(id => (
              <span key={id} className="px-2 py-0.5 bg-zinc-700 rounded text-xs text-zinc-300">{id}</span>
            ))}
          </div>
        </div>
      )}

      {/* Completed/Failed */}
      <div className="flex gap-4 text-xs">
        {status.completed?.length > 0 && (
          <div>
            <span className="text-zinc-500">Done: </span>
            <span className="text-green-400">{status.completed.join(', ')}</span>
          </div>
        )}
        {status.failed?.length > 0 && (
          <div>
            <span className="text-zinc-500">Failed: </span>
            <span className="text-red-400">{status.failed.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
