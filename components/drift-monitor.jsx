'use client';

import { useState, useEffect, useCallback } from 'react';

const ALERT_COLORS = {
  stall: 'border-yellow-600 bg-yellow-900/20',
  repetition: 'border-orange-600 bg-orange-900/20',
  'semantic-drift': 'border-red-600 bg-red-900/20',
};

export default function DriftMonitor() {
  const [alerts, setAlerts] = useState([]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/ruflo/drift');
      const data = await res.json();
      if (data.ok) setAlerts(data.alerts || []);
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 15000);
    return () => clearInterval(timer);
  }, [fetchAlerts]);

  const activeAlerts = alerts.filter(a => !a.resolved);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Anti-Drift Monitor</h3>
        <span className="text-xs text-zinc-500">{activeAlerts.length} active alerts</span>
      </div>

      {activeAlerts.length === 0 ? (
        <div className="text-zinc-500 text-sm p-3 bg-zinc-800 rounded">No drift detected</div>
      ) : (
        <div className="space-y-2">
          {activeAlerts.map((alert, i) => (
            <div key={i}
              className={`p-3 rounded border ${ALERT_COLORS[alert.type] || 'border-zinc-600 bg-zinc-800'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-zinc-300 uppercase">{alert.type}</span>
                <span className="text-xs text-zinc-500">{alert.taskId}</span>
                <span className="text-xs text-zinc-600 ml-auto">
                  {alert.ts ? new Date(alert.ts).toLocaleTimeString() : ''}
                </span>
              </div>
              <div className="text-sm text-zinc-300">{alert.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
