'use client';

import { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS = {
  healthy: 'bg-green-500',
  stale: 'bg-yellow-500',
  dead: 'bg-red-500',
  uncertain: 'bg-zinc-500',
  unknown: 'bg-zinc-600',
};

export default function ConsensusView() {
  const [sessions, setSessions] = useState({});

  const fetchConsensus = useCallback(async () => {
    try {
      const res = await fetch('/api/ruflo/consensus');
      const data = await res.json();
      if (data.ok) setSessions(data.sessions || {});
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    fetchConsensus();
    const timer = setInterval(fetchConsensus, 10000);
    return () => clearInterval(timer);
  }, [fetchConsensus]);

  const entries = Object.entries(sessions);
  if (entries.length === 0) {
    return <div className="p-4 text-zinc-500 text-sm">No consensus data available</div>;
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold text-zinc-300">Multi-Source Health Consensus</h3>
      {entries.map(([sessionId, state]) => (
        <div key={sessionId} className="p-3 bg-zinc-800 rounded border border-zinc-700">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[state.status] || 'bg-zinc-600'}`} />
            <span className="text-sm text-zinc-200 font-mono">{sessionId.slice(0, 12)}</span>
            <span className="text-xs text-zinc-400 ml-auto">
              {state.quorum ? 'Quorum reached' : 'No quorum'}
              {' '} ({(state.confidence * 100).toFixed(0)}% confidence)
            </span>
          </div>
          {state.votes && (
            <div className="flex flex-wrap gap-1">
              {state.votes.map((vote, i) => (
                <span key={i}
                  className={`px-2 py-0.5 rounded text-xs ${
                    vote.status === 'healthy' ? 'bg-green-900 text-green-300' :
                    vote.status === 'stale' ? 'bg-yellow-900 text-yellow-300' :
                    vote.status === 'dead' ? 'bg-red-900 text-red-300' :
                    'bg-zinc-700 text-zinc-400'
                  }`}>
                  {vote.source}: {vote.status} (w:{vote.weight})
                </span>
              ))}
            </div>
          )}
          {state.tallies && (
            <div className="text-xs text-zinc-500 mt-1">
              Tallies: {Object.entries(state.tallies).map(([k, v]) => `${k}:${v.toFixed(1)}`).join(' ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
