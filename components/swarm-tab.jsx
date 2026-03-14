'use client';

import { useState, useMemo } from 'react';
import { useSwarm } from '@/hooks/use-swarm';

// Mirrored from lib/orchestrator-engine.js — cannot import server module in client component
const AUTONOMY_LEVELS = {
  0: { name: 'manual' },
  1: { name: 'supervised' },
  2: { name: 'autonomous' },
  3: { name: 'full-auto' },
  4: { name: 'adaptive' },
};

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS = {
  running: 'bg-green-500',
  idle: 'bg-zinc-500',
  stale: 'bg-yellow-500',
  failed: 'bg-red-500',
  passed: 'bg-blue-500',
  crashed: 'bg-red-700',
  unknown: 'bg-zinc-600',
};

function statusDot(status) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  const pulse = status === 'running' ? 'animate-pulse' : '';
  return <span className={`inline-block h-2 w-2 rounded-full ${color} ${pulse}`} />;
}

function timeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

// ─── Agent Card ──────────────────────────────────────────────────────────────

function AgentCard({ agent, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(agent.id)}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        selected
          ? 'border-accent bg-accent/10'
          : 'border-border bg-card hover:border-zinc-600'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {statusDot(agent.status)}
          <span className="text-xs font-medium text-zinc-100 truncate max-w-[140px]">
            {agent.taskId || agent.sessionId || agent.id}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">{agent.model || '—'}</span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>{agent.status}</span>
        <span>{timeAgo(agent.lastActivity)}</span>
      </div>
      {agent.lastLog && (
        <div className="mt-1 text-[10px] text-zinc-500 truncate">{agent.lastLog}</div>
      )}
    </button>
  );
}

// ─── Agent Detail Panel ──────────────────────────────────────────────────────

function AgentDetailPanel({ agent, detail, onNudge, onSwap, onKill }) {
  const [subTab, setSubTab] = useState('thinking');

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">
        Select an agent to view details
      </div>
    );
  }

  const thinking = detail?.thinkingHistory || detail?.recentLogs || [];
  const routing = detail?.routingDecisions || [];
  const timeline = detail?.timeline || [];

  return (
    <div className="flex-1 flex flex-col min-h-0 border-l border-border">
      {/* Agent header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {statusDot(agent.status)}
            <span className="text-sm font-medium text-zinc-100">
              {agent.taskId || agent.id}
            </span>
          </div>
          <div className="flex gap-1">
            {agent.status === 'running' && (
              <>
                <button
                  onClick={() => onNudge(agent.sessionId)}
                  className="px-2 py-0.5 text-[10px] rounded bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60"
                >
                  Nudge
                </button>
                <button
                  onClick={() => onSwap(agent.sessionId)}
                  className="px-2 py-0.5 text-[10px] rounded bg-blue-900/40 text-blue-400 hover:bg-blue-900/60"
                >
                  Swap
                </button>
                <button
                  onClick={() => onKill(agent.sessionId)}
                  className="px-2 py-0.5 text-[10px] rounded bg-red-900/40 text-red-400 hover:bg-red-900/60"
                >
                  Kill
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-1 text-[10px] text-zinc-500">
          <span>Model: {agent.model || '—'}</span>
          <span>Session: {agent.sessionId ? agent.sessionId.slice(0, 8) + '...' : '—'}</span>
          <span>Last: {timeAgo(agent.lastActivity)}</span>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex border-b border-border">
        {['thinking', 'routing', 'timeline'].map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-3 py-1.5 text-[10px] font-medium capitalize ${
              subTab === t ? 'text-accent border-b border-accent' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {subTab === 'thinking' && (
          thinking.length > 0 ? (
            thinking.map((entry, i) => (
              <div key={i} className="text-[11px] font-mono text-zinc-400 bg-zinc-900/50 rounded p-2">
                {typeof entry === 'string' ? entry : (
                  <>
                    <span className="text-zinc-600">{entry.timestamp || ''}</span>{' '}
                    {entry.text || entry.message || JSON.stringify(entry)}
                  </>
                )}
              </div>
            ))
          ) : (
            <div className="text-xs text-zinc-600">No thinking history available</div>
          )
        )}

        {subTab === 'routing' && (
          routing.length > 0 ? (
            routing.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] bg-zinc-900/50 rounded p-2">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  r.provider === 'claude' ? 'bg-purple-900/50 text-purple-300' : 'bg-emerald-900/50 text-emerald-300'
                }`}>
                  {r.provider || '?'}
                </span>
                <span className="text-zinc-400">{r.model || '—'}</span>
                <span className="text-zinc-600 ml-auto">{r.complexity || '—'}</span>
                {r.cached && <span className="text-amber-500 text-[9px]">cached</span>}
              </div>
            ))
          ) : (
            <div className="text-xs text-zinc-600">No routing decisions recorded</div>
          )
        )}

        {subTab === 'timeline' && (
          timeline.length > 0 ? (
            <div className="space-y-1">
              {timeline.map((ev, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className="text-zinc-600 font-mono whitespace-nowrap">{ev.time || timeAgo(ev.timestamp)}</span>
                  <span className={`px-1 rounded text-[9px] ${
                    ev.type === 'error' ? 'bg-red-900/50 text-red-400' :
                    ev.type === 'action' ? 'bg-blue-900/50 text-blue-400' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>{ev.type || 'event'}</span>
                  <span className="text-zinc-300">{ev.message || ev.text || JSON.stringify(ev)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-zinc-600">No timeline events</div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Global Timeline ─────────────────────────────────────────────────────────

function TimelinePanel({ timeline }) {
  if (!timeline || timeline.length === 0) {
    return <div className="text-xs text-zinc-600 p-3">No events yet</div>;
  }

  return (
    <div className="space-y-1 p-3 max-h-48 overflow-y-auto">
      {timeline.slice(-30).reverse().map((ev, i) => (
        <div key={i} className="flex items-start gap-2 text-[10px]">
          <span className="text-zinc-600 font-mono whitespace-nowrap">
            {ev.time || (ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '—')}
          </span>
          <span className={`px-1 rounded text-[9px] shrink-0 ${
            ev.severity === 'error' ? 'bg-red-900/50 text-red-400' :
            ev.severity === 'warn' ? 'bg-yellow-900/50 text-yellow-400' :
            'bg-zinc-800 text-zinc-400'
          }`}>{ev.type || 'event'}</span>
          <span className="text-zinc-400 truncate">{ev.message || ev.summary || ''}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Controls Panel ──────────────────────────────────────────────────────────

function ControlsPanel({ engine, autonomyLevel, onSetLevel, pendingConfirmations, onConfirm, onDeny, onPause, onResume }) {
  const levels = Object.entries(AUTONOMY_LEVELS || {});

  return (
    <div className="p-3 border-t border-border space-y-3">
      {/* Autonomy selector */}
      <div>
        <div className="text-[10px] text-zinc-500 mb-1 font-medium uppercase tracking-wider">Autonomy Level</div>
        <div className="flex gap-1">
          {levels.map(([lvl, cfg]) => (
            <button
              key={lvl}
              onClick={() => onSetLevel(Number(lvl))}
              className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition ${
                String(autonomyLevel) === String(lvl)
                  ? 'bg-accent text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
              title={cfg.name}
            >
              {lvl}
            </button>
          ))}
        </div>
        <div className="text-[9px] text-zinc-600 mt-0.5">
          {AUTONOMY_LEVELS?.[autonomyLevel]?.name || 'unknown'}
          {' — '}
          {autonomyLevel === 0 && 'All actions require confirmation'}
          {autonomyLevel === 1 && 'Auto-nudge only'}
          {autonomyLevel === 2 && 'Auto-nudge + swap'}
          {autonomyLevel === 3 && 'Full auto, human review for AI decisions'}
          {autonomyLevel === 4 && 'Adaptive — AI controls escalation'}
        </div>
      </div>

      {/* Engine controls */}
      <div className="flex gap-2">
        {engine?.paused ? (
          <button onClick={onResume} className="px-3 py-1 rounded text-[10px] bg-green-900/40 text-green-400 hover:bg-green-900/60">
            Resume Engine
          </button>
        ) : (
          <button onClick={onPause} className="px-3 py-1 rounded text-[10px] bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60">
            Pause Engine
          </button>
        )}
      </div>

      {/* Pending confirmations */}
      {pendingConfirmations && pendingConfirmations.length > 0 && (
        <div>
          <div className="text-[10px] text-zinc-500 mb-1 font-medium uppercase tracking-wider">
            Pending Confirmations ({pendingConfirmations.length})
          </div>
          <div className="space-y-1">
            {pendingConfirmations.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-zinc-900/50 rounded p-2">
                <div className="text-[11px] text-zinc-300">
                  <span className="text-zinc-500">{c.action}</span> on {c.taskId || c.sessionId || '—'}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onConfirm(c.id)}
                    className="px-2 py-0.5 rounded text-[9px] bg-green-900/50 text-green-400"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onDeny(c.id)}
                    className="px-2 py-0.5 rounded text-[9px] bg-red-900/50 text-red-400"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subsystem Health Bar ────────────────────────────────────────────────────

function SubsystemBar({ subsystems }) {
  if (!subsystems || Object.keys(subsystems).length === 0) return null;

  return (
    <div className="flex gap-2 p-2 border-t border-border">
      {Object.entries(subsystems).map(([name, status]) => (
        <div
          key={name}
          className="flex items-center gap-1 text-[9px] text-zinc-500"
          title={`${name}: ${status}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${
            status === 'healthy' || status === 'ok' ? 'bg-green-500' :
            status === 'degraded' ? 'bg-yellow-500' :
            status === 'down' ? 'bg-red-500' : 'bg-zinc-600'
          }`} />
          {name}
        </div>
      ))}
    </div>
  );
}

// ─── Main Swarm Tab ──────────────────────────────────────────────────────────

export default function SwarmTab() {
  const {
    agents, topology, timeline, stats, engine,
    pendingConfirmations, subsystems,
    selectedAgentId, agentDetail, selectAgent,
    sendNudge, sendSwap, sendKill,
    setAutonomyLevel, confirmAction, denyAction,
    pause, resume, loading,
  } = useSwarm(true, 5000);

  const [showTimeline, setShowTimeline] = useState(false);

  const selectedAgent = useMemo(
    () => agents.find(a => a.id === selectedAgentId),
    [agents, selectedAgentId]
  );

  const statusCounts = useMemo(() => {
    const counts = { running: 0, idle: 0, stale: 0, failed: 0, passed: 0, total: agents.length };
    for (const a of agents) {
      if (counts[a.status] !== undefined) counts[a.status]++;
    }
    return counts;
  }, [agents]);

  if (loading && agents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">
        Loading swarm state...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border text-[10px]">
        <span className="text-zinc-500">Agents: <span className="text-zinc-200 font-medium">{statusCounts.total}</span></span>
        {statusCounts.running > 0 && (
          <span className="text-green-400">{statusCounts.running} running</span>
        )}
        {statusCounts.stale > 0 && (
          <span className="text-yellow-400">{statusCounts.stale} stale</span>
        )}
        {statusCounts.failed > 0 && (
          <span className="text-red-400">{statusCounts.failed} failed</span>
        )}
        {stats.totalDecisions > 0 && (
          <span className="text-zinc-500">Decisions: {stats.totalDecisions}</span>
        )}
        <button
          onClick={() => setShowTimeline(!showTimeline)}
          className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          {showTimeline ? 'Hide' : 'Show'} Timeline
        </button>
      </div>

      {/* Timeline (collapsible) */}
      {showTimeline && <TimelinePanel timeline={timeline} />}

      {/* Main content: agent grid + detail */}
      <div className="flex-1 flex min-h-0">
        {/* Agent list */}
        <div className="w-64 shrink-0 overflow-y-auto p-2 space-y-1.5 border-r border-border">
          {agents.length === 0 ? (
            <div className="text-xs text-zinc-600 p-3">No agents detected</div>
          ) : (
            agents.map(a => (
              <AgentCard
                key={a.id}
                agent={a}
                selected={a.id === selectedAgentId}
                onSelect={selectAgent}
              />
            ))
          )}
        </div>

        {/* Detail panel */}
        <AgentDetailPanel
          agent={selectedAgent}
          detail={agentDetail}
          onNudge={sendNudge}
          onSwap={sendSwap}
          onKill={sendKill}
        />
      </div>

      {/* Subsystem health */}
      <SubsystemBar subsystems={subsystems} />

      {/* Controls */}
      <ControlsPanel
        engine={engine}
        autonomyLevel={engine?.autonomyLevel ?? 3}
        onSetLevel={setAutonomyLevel}
        pendingConfirmations={pendingConfirmations}
        onConfirm={confirmAction}
        onDeny={denyAction}
        onPause={pause}
        onResume={resume}
      />
    </div>
  );
}
