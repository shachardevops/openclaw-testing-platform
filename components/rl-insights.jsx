'use client';

import { useState, useEffect, useCallback } from 'react';

export default function RLInsights() {
  const [data, setData] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/ruflo/rl');
      const result = await res.json();
      if (result.ok) setData(result);
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  if (!data) return <div className="p-4 text-zinc-500 text-sm">Loading RL insights...</div>;

  const { rl, sona } = data;

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-zinc-300">RL Model Routing & SONA</h3>

      {/* SONA State */}
      {sona && (
        <div className="p-3 bg-zinc-800 rounded border border-zinc-700">
          <h4 className="text-xs font-medium text-zinc-400 mb-2">SONA Self-Optimizer</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-zinc-500">Mode:</span> <span className="text-blue-400">{sona.mode}</span></div>
            <div><span className="text-zinc-500">Epsilon:</span> <span className="text-yellow-400">{sona.adaptiveEpsilon?.toFixed(3)}</span></div>
            <div><span className="text-zinc-500">Recommendations:</span> <span className="text-zinc-300">{sona.totalRecommendations}</span></div>
            <div><span className="text-zinc-500">Overrides:</span> <span className="text-orange-400">{sona.userOverrideCount}</span></div>
            <div className="col-span-2">
              <span className="text-zinc-500">Degradation:</span>
              <span className={sona.degradationDetected ? 'text-red-400' : 'text-green-400'}>
                {sona.degradationDetected ? ' Detected' : ' None'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* RL Stats */}
      {rl && (
        <div className="p-3 bg-zinc-800 rounded border border-zinc-700">
          <h4 className="text-xs font-medium text-zinc-400 mb-2">Q-Learning Router</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-zinc-500">Observations:</span> <span className="text-zinc-300">{rl.totalObservations}</span></div>
            <div><span className="text-zinc-500">Contexts:</span> <span className="text-zinc-300">{rl.contexts}</span></div>
            <div><span className="text-zinc-500">Entries:</span> <span className="text-zinc-300">{rl.entries}</span></div>
            <div><span className="text-zinc-500">Explore rate:</span> <span className="text-yellow-400">{(rl.explorationRate * 100).toFixed(0)}%</span></div>
          </div>

          {/* Q-Table visualization */}
          {rl.qTable && Object.keys(rl.qTable).length > 0 && (
            <div className="mt-3">
              <h5 className="text-xs text-zinc-500 mb-1">Q-Table</h5>
              {Object.entries(rl.qTable).map(([ctx, models]) => (
                <div key={ctx} className="mb-2">
                  <div className="text-xs text-zinc-400 mb-0.5">{ctx}</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(models).map(([model, entry]) => (
                      <span key={model} className="px-2 py-0.5 bg-zinc-700 rounded text-xs">
                        <span className="text-zinc-300">{model.split('/').pop()}</span>
                        <span className="text-zinc-500 ml-1">
                          avg:{entry.avgReward?.toFixed(2)} n:{entry.count}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
