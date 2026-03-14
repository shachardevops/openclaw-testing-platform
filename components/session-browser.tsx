'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDashboard } from '@/context/dashboard-context';

export default function SessionBrowser() {
  const { gatewayStatus, addLog } = useDashboard();
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.ok) setSessions(data.sessions || []);
    } catch (e: unknown) { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  // Poll sessions every 15s when expanded
  useEffect(() => {
    if (collapsed) return;
    fetchSessions();
    const iv = setInterval(fetchSessions, 15000);
    return () => clearInterval(iv);
  }, [collapsed, fetchSessions]);

  const sendMessage = async (sessionId: string) => {
    if (!messageInput.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        addLog('SESSION', `Sent to ${sessionId.slice(0, 8)}...`, 'success');
        setMessageInput('');
      } else {
        addLog('SESSION', `Send failed: ${data.error}`, 'error');
      }
    } catch (e: unknown) {
      addLog('SESSION', `Send error: ${(e as Error).message}`, 'error');
    }
    setSending(false);
  };

  const filtered = sessions.filter(s => {
    if (filter === 'agents') return !s.isController;
    if (filter === 'controller') return s.isController;
    return true;
  });

  const formatAge = (min: number | null | undefined) => {
    if (min == null) return '?';
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  return (
    <>
      <div className="section-title cursor-pointer" onClick={() => setCollapsed(!collapsed)}>
        <span>{collapsed ? '\u25b8' : '\u25be'} Sessions {sessions.length > 0 && `(${sessions.length})`}</span>
        {gatewayStatus === 'connected' && (
          <span className="ml-2 text-[10px] text-green-400 font-normal">Gateway</span>
        )}
      </div>
      {!collapsed && (
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          {/* Filter bar */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            {['all', 'agents', 'controller'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`font-mono text-[10px] px-2 py-1 rounded ${filter === f ? 'bg-accent/20 text-accent' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {f}
              </button>
            ))}
            <button onClick={fetchSessions} className="ml-auto btn-mini text-[10px]" disabled={loading}>
              {loading ? '...' : '\u21bb Refresh'}
            </button>
          </div>

          {/* Session list */}
          <div className="max-h-[400px] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-5 py-6 text-center text-zinc-500 font-mono text-xs">
                {loading ? 'Loading sessions...' : 'No sessions found'}
              </div>
            )}
            {filtered.map(s => {
              const sid = (s.sessionId as string) || (s.id as string);
              const isExpanded = expandedId === sid;
              return (
                <div key={sid} className="border-b border-border last:border-0">
                  <div
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-card-hover transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : sid)}
                  >
                    <span className="text-sm">{s.isController ? '\ud83c\udfae' : '\ud83e\udd16'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-200 truncate">
                        {(s.key as string) || (s.name as string) || sid.slice(0, 16)}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {sid.slice(0, 12)}... {s.model ? `\u00b7 ${s.model}` : ''} {s.ageMinutes != null ? `\u00b7 ${formatAge(s.ageMinutes as number)} ago` : ''}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-600">{isExpanded ? '\u25be' : '\u25b8'}</span>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-3">
                      <div className="text-[10px] text-zinc-500 font-mono mb-2 space-y-0.5">
                        <div>Session: {sid}</div>
                        {s.key && <div>Key: {s.key as string}</div>}
                        {s.model && <div>Model: {s.model as string}</div>}
                        {s.kind && <div>Kind: {s.kind as string}</div>}
                      </div>
                      {gatewayStatus === 'connected' && (
                        <div className="flex gap-2">
                          <input
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !sending && sendMessage(sid)}
                            placeholder="Send message..."
                            className="flex-1 bg-[#0a0a12] border border-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
                          />
                          <button
                            onClick={() => sendMessage(sid)}
                            disabled={sending || !messageInput.trim()}
                            className="btn-mini text-[10px]"
                          >
                            {sending ? '...' : 'Send'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
