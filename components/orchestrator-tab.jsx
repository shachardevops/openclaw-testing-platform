'use client';

import { useState } from 'react';
import { useOrchestrator } from '@/hooks/use-orchestrator';

const SOURCE_COLORS = {
  deterministic: 'text-blue-400',
  'ai-consulted': 'text-purple-400',
  'memory-recall': 'text-cyan-400',
  manual: 'text-green-400',
  approved: 'text-emerald-400',
  rejected: 'text-red-400',
};

const SOURCE_BG = {
  deterministic: 'bg-blue-400/5',
  'ai-consulted': 'bg-purple-400/5',
  'memory-recall': 'bg-cyan-400/5',
  manual: 'bg-green-400/5',
  approved: 'bg-emerald-400/5',
  rejected: 'bg-red-400/5',
};

const STATUS_NODE_COLORS = {
  healthy: { border: 'border-green-500/40', bg: 'bg-green-500/5', text: 'text-green-400', bar: 'bg-green-500' },
  stale: { border: 'border-amber-500/40', bg: 'bg-amber-500/5', text: 'text-amber-400', bar: 'bg-amber-500' },
  orphaned: { border: 'border-zinc-500/40', bg: 'bg-zinc-500/5', text: 'text-zinc-400', bar: 'bg-zinc-500' },
  duplicate: { border: 'border-purple-500/40', bg: 'bg-purple-500/5', text: 'text-purple-400', bar: 'bg-purple-500' },
  stuck: { border: 'border-red-500/40', bg: 'bg-red-500/5', text: 'text-red-400', bar: 'bg-red-500' },
};

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatAge(ms) {
  if (!ms || ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

function formatMs(ms) {
  if (!ms) return '?';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function StatusBadge({ started, paused }) {
  if (!started) {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wide text-zinc-500">
        <span className="w-2 h-2 rounded-full bg-zinc-600" />
        offline
      </span>
    );
  }
  if (paused) {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wide text-amber-400">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        paused
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wide text-green-400">
      <span className="w-2 h-2 rounded-full bg-green-400" />
      active
    </span>
  );
}

function StatPill({ label, value, color }) {
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${value > 0 ? color : 'text-zinc-600 bg-zinc-800/30'}`}>
      {value} {label}
    </span>
  );
}

export default function OrchestratorTab() {
  const {
    started, paused, stats, recentDecisions, activeConditions,
    pendingReview, memorySize, rateLimit, decisionTree, loading,
    pause, resume, sendNudge, sendSwap, sendKill, sendRecover,
    approveRecommendation, rejectRecommendation,
  } = useOrchestrator();

  const [panel, setPanel] = useState('tree'); // tree | decisions | conditions | manual
  const [expandedDecisions, setExpandedDecisions] = useState(new Set());
  const [manualAction, setManualAction] = useState('nudge');
  const [manualTarget, setManualTarget] = useState('');
  const [manualModel, setManualModel] = useState('');

  const handleManualExecute = async () => {
    if (!manualTarget.trim()) return;
    const target = manualTarget.trim();
    switch (manualAction) {
      case 'nudge': await sendNudge(target); break;
      case 'swap': await sendSwap(target, manualModel || 'anthropic/claude-sonnet-4-6'); break;
      case 'kill': await sendKill(target); break;
      case 'recover': await sendRecover(target); break;
    }
    setManualTarget('');
  };

  if (loading && !started) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Connecting to engine...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header bar */}
      <div className="px-4 py-2 border-b border-border bg-card/20 flex items-center gap-3 shrink-0">
        <span className="font-mono text-[11px] text-zinc-200 font-medium">Decision Engine</span>
        <StatusBadge started={started} paused={paused} />

        <span className="font-mono text-[9px] text-zinc-600">
          {rateLimit.remaining}/{rateLimit.maxPerMinute} msgs/min
        </span>

        {memorySize > 0 && (
          <span className="font-mono text-[9px] text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">
            {memorySize} learned
          </span>
        )}

        <div className="ml-auto flex gap-2">
          {paused ? (
            <button
              onClick={resume}
              className="font-mono text-[9px] text-green-400 hover:text-green-300 transition-colors bg-green-400/5 border border-green-400/20 rounded px-2 py-1"
            >
              Resume
            </button>
          ) : started ? (
            <button
              onClick={pause}
              className="font-mono text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors bg-white/[0.03] border border-border rounded px-2 py-1"
            >
              Pause
            </button>
          ) : null}
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-4 py-1.5 border-b border-border flex items-center gap-2 flex-wrap shrink-0">
        <StatPill label="nudges" value={stats.nudges} color="text-amber-400 bg-amber-400/10" />
        <StatPill label="swaps" value={stats.swaps} color="text-purple-400 bg-purple-400/10" />
        <StatPill label="kills" value={stats.kills} color="text-red-400 bg-red-400/10" />
        <StatPill label="recoveries" value={stats.recoveries} color="text-green-400 bg-green-400/10" />
        <StatPill label="purges" value={stats.purges} color="text-zinc-400 bg-zinc-400/10" />
        <StatPill label="AI consults" value={stats.aiConsultations} color="text-cyan-400 bg-cyan-400/10" />
      </div>

      {/* Pending review panel */}
      {pendingReview.length > 0 && (
        <div className="px-4 py-2 border-b border-purple-900/30 bg-purple-950/20 shrink-0">
          <div className="font-mono text-[10px] text-purple-300 mb-1.5 uppercase tracking-wide">
            Pending Review ({pendingReview.length})
          </div>
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
            {pendingReview.map(rec => (
              <div key={rec.id} className="flex items-center gap-2 font-mono text-[10px]">
                <span className="text-purple-400 shrink-0">{rec.action}</span>
                <span className="text-zinc-400 truncate flex-1" title={rec.description}>
                  {rec.patternKey}: {rec.reason}
                </span>
                <button
                  onClick={() => approveRecommendation(rec.id)}
                  className="text-[9px] text-green-400 hover:text-green-200 bg-green-950/40 border border-green-900/30 rounded px-1.5 py-0.5"
                >
                  Approve
                </button>
                <button
                  onClick={() => rejectRecommendation(rec.id)}
                  className="text-[9px] text-red-400 hover:text-red-200 bg-red-950/40 border border-red-900/30 rounded px-1.5 py-0.5"
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border font-mono text-[10px] shrink-0">
        <TabBtn active={panel === 'tree'} onClick={() => setPanel('tree')}>
          Tree ({decisionTree.nodes?.length || 0})
        </TabBtn>
        <TabBtn active={panel === 'decisions'} onClick={() => setPanel('decisions')}>
          Log ({recentDecisions.length})
        </TabBtn>
        <TabBtn active={panel === 'conditions'} onClick={() => setPanel('conditions')}>
          Conditions ({activeConditions.length})
        </TabBtn>
        <TabBtn active={panel === 'manual'} onClick={() => setPanel('manual')}>
          Manual
        </TabBtn>
      </div>

      {/* Decision Tree — real-time visual tree */}
      {panel === 'tree' && (
        <div className="flex-1 min-h-0 overflow-auto">
          {(!decisionTree.nodes || decisionTree.nodes.length === 0) ? (
            <div className="px-4 py-8 text-center text-zinc-600 font-mono text-[11px]">
              No active sessions — tree is empty
            </div>
          ) : (
            <DecisionTreeView nodes={decisionTree.nodes} thresholds={decisionTree.thresholds} />
          )}
        </div>
      )}

      {/* Decision log */}
      {panel === 'decisions' && (
        <div className="flex-1 min-h-0 overflow-auto font-mono text-[10px]">
          {recentDecisions.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-600">
              No decisions yet — engine is monitoring...
            </div>
          ) : (
            recentDecisions.map((d, i) => {
              const key = `${d.ts}-${i}`;
              const isExpanded = expandedDecisions.has(key);
              const hasMessage = !!d.message;
              const toggleExpand = hasMessage ? () => {
                setExpandedDecisions(prev => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              } : undefined;

              return (
                <div key={key}>
                  <div
                    className={`px-3 py-1.5 flex gap-2 border-b border-zinc-900/30 items-start hover:bg-zinc-800/20 ${SOURCE_BG[d.source] || ''} ${hasMessage ? 'cursor-pointer' : ''}`}
                    onClick={toggleExpand}
                  >
                    <span className="text-zinc-600 shrink-0 w-16">{formatTime(d.ts)}</span>
                    <span className={`shrink-0 w-20 uppercase tracking-wide ${SOURCE_COLORS[d.source] || 'text-zinc-400'}`}>
                      {d.source}
                    </span>
                    <span className="shrink-0 w-14 text-zinc-500 uppercase">{d.action}</span>
                    <span className="text-zinc-400 truncate flex-1" title={d.reason}>{d.reason}</span>
                    <span className="text-zinc-600 shrink-0 truncate max-w-[100px]" title={d.target}>
                      {typeof d.target === 'string' ? d.target.slice(0, 12) : ''}
                    </span>
                    {hasMessage && (
                      <span className="text-zinc-600 shrink-0 text-[9px]">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                    )}
                  </div>
                  {isExpanded && d.message && (
                    <div className="px-3 py-2 border-b border-zinc-900/30 bg-zinc-900/40">
                      <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">{d.message}</pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Active conditions */}
      {panel === 'conditions' && (
        <div className="flex-1 min-h-0 overflow-auto font-mono text-[10px]">
          {activeConditions.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-600">
              No active conditions — all clear
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[100px_120px_80px_80px_1fr] gap-1 px-3 py-1.5 border-b border-zinc-800 text-zinc-500 text-[9px] uppercase tracking-wider sticky top-0 bg-[#0a0a0f] z-10">
                <span>Type</span>
                <span>Target</span>
                <span>Count</span>
                <span>Age</span>
                <span>Action Taken</span>
              </div>
              {activeConditions.map((c, i) => (
                <div key={`${c.type}-${c.id}-${i}`} className="grid grid-cols-[100px_120px_80px_80px_1fr] gap-1 px-3 py-1.5 border-b border-zinc-900/30 items-center hover:bg-zinc-800/20">
                  <span className="text-amber-400 uppercase">{c.type}</span>
                  <span className="text-zinc-300 truncate" title={c.id}>{c.id?.slice(0, 16)}</span>
                  <span className="text-zinc-500">{c.count}x</span>
                  <span className="text-zinc-500">
                    {c.firstSeen ? `${Math.round((Date.now() - c.firstSeen) / 1000)}s` : '?'}
                  </span>
                  <span className="text-zinc-400">{c.actionTaken || '\u2014'}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Manual actions */}
      {panel === 'manual' && (
        <div className="flex-1 min-h-0 overflow-auto px-4 py-4 space-y-4">
          <div className="font-mono text-[11px] text-zinc-300 mb-2">
            Execute manual actions on sessions or tasks:
          </div>
          <div className="flex gap-2 items-end">
            <div className="space-y-1">
              <label className="font-mono text-[9px] text-zinc-500 uppercase">Action</label>
              <select
                value={manualAction}
                onChange={(e) => setManualAction(e.target.value)}
                className="bg-[#0a0a12] border border-border rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono"
              >
                <option value="nudge">Nudge</option>
                <option value="swap">Swap Model</option>
                <option value="kill">Kill</option>
                <option value="recover">Recover Task</option>
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="font-mono text-[9px] text-zinc-500 uppercase">
                {manualAction === 'recover' ? 'Task ID' : 'Session ID'}
              </label>
              <input
                value={manualTarget}
                onChange={(e) => setManualTarget(e.target.value)}
                placeholder={manualAction === 'recover' ? 'task-id...' : 'session-id...'}
                className="w-full bg-[#0a0a12] border border-border rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono placeholder:text-zinc-600"
              />
            </div>
            {manualAction === 'swap' && (
              <div className="space-y-1">
                <label className="font-mono text-[9px] text-zinc-500 uppercase">Target Model</label>
                <input
                  value={manualModel}
                  onChange={(e) => setManualModel(e.target.value)}
                  placeholder="anthropic/claude-sonnet-4-6"
                  className="bg-[#0a0a12] border border-border rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono placeholder:text-zinc-600 w-60"
                />
              </div>
            )}
            <button
              onClick={handleManualExecute}
              disabled={!manualTarget.trim()}
              className="btn-primary px-3 py-1.5 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              Execute
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Decision Tree View — proper tree with branches ──────────

function DecisionTreeView({ nodes, thresholds }) {
  // Group nodes by status category
  const healthy = nodes.filter(n => n.status === 'healthy');
  const stale = nodes.filter(n => n.status === 'stale');
  const stuck = nodes.filter(n => n.status === 'stuck');
  const orphaned = nodes.filter(n => n.status === 'orphaned');
  const duplicate = nodes.filter(n => n.status === 'duplicate');

  const branches = [
    { key: 'healthy', label: 'Healthy', nodes: healthy, color: 'green', icon: '\u25CF', action: `Monitor \u2192 Nudge @ ${formatMs(thresholds?.staleMs)}` },
    { key: 'stale', label: 'Stale', nodes: stale, color: 'amber', icon: '\u25CF', action: `Nudge \u2192 Swap @ ${formatMs(thresholds?.swapMs)} \u2192 Kill @ ${formatMs(thresholds?.killMs)}` },
    { key: 'stuck', label: 'Stuck (no session)', nodes: stuck, color: 'red', icon: '\u25CF', action: `Respawn (cooldown ${formatMs(thresholds?.recoveryCooldownMs)})` },
    { key: 'orphaned', label: 'Orphaned', nodes: orphaned, color: 'zinc', icon: '\u25CF', action: `Purge @ ${formatMs(thresholds?.orphanMs)}` },
    { key: 'duplicate', label: 'Duplicate', nodes: duplicate, color: 'purple', icon: '\u25CF', action: 'Auto-kill older' },
  ].filter(b => b.nodes.length > 0);

  return (
    <div className="px-5 py-4 font-mono text-[11px]">
      {/* Root node */}
      <div className="flex items-center gap-2 mb-1">
        <span className="w-3 h-3 rounded bg-cyan-500/30 border border-cyan-500/50 flex items-center justify-center text-[8px] text-cyan-400">{'\u25C6'}</span>
        <span className="text-cyan-400 font-medium">Decision Engine</span>
        <span className="text-zinc-600 text-[9px]">{nodes.length} sessions</span>
      </div>

      {/* Branches */}
      {branches.map((branch, bi) => {
        const isLast = bi === branches.length - 1;
        const colorMap = {
          green: { line: 'border-green-500/40', dot: 'bg-green-400', text: 'text-green-400', labelBg: 'bg-green-500/10', nodeBg: 'bg-green-500/5', nodeBorder: 'border-green-500/20' },
          amber: { line: 'border-amber-500/40', dot: 'bg-amber-400', text: 'text-amber-400', labelBg: 'bg-amber-500/10', nodeBg: 'bg-amber-500/5', nodeBorder: 'border-amber-500/20' },
          red: { line: 'border-red-500/40', dot: 'bg-red-400', text: 'text-red-400', labelBg: 'bg-red-500/10', nodeBg: 'bg-red-500/5', nodeBorder: 'border-red-500/20' },
          zinc: { line: 'border-zinc-500/40', dot: 'bg-zinc-400', text: 'text-zinc-400', labelBg: 'bg-zinc-500/10', nodeBg: 'bg-zinc-500/5', nodeBorder: 'border-zinc-500/20' },
          purple: { line: 'border-purple-500/40', dot: 'bg-purple-400', text: 'text-purple-400', labelBg: 'bg-purple-500/10', nodeBg: 'bg-purple-500/5', nodeBorder: 'border-purple-500/20' },
        };
        const c = colorMap[branch.color] || colorMap.zinc;

        return (
          <div key={branch.key} className="ml-1.5">
            {/* Vertical connector from root */}
            <div className={`ml-[5px] h-3 border-l-2 ${c.line}`} />

            {/* Branch label row */}
            <div className="flex items-stretch">
              {/* Horizontal connector */}
              <div className={`w-5 border-b-2 border-l-2 rounded-bl-lg ${c.line} shrink-0`} />

              {/* Branch label */}
              <div className={`flex items-center gap-2 px-2 py-1 rounded ${c.labelBg} -mt-px`}>
                <span className={`w-2 h-2 rounded-full ${c.dot} ${branch.key === 'stale' || branch.key === 'stuck' ? 'animate-pulse' : ''}`} />
                <span className={`${c.text} font-medium`}>{branch.label}</span>
                <span className="text-zinc-600 text-[9px]">({branch.nodes.length})</span>
                <span className="text-zinc-600 text-[9px] ml-1">{branch.action}</span>
              </div>
            </div>

            {/* Leaf nodes */}
            {branch.nodes.map((node, ni) => {
              const isLastNode = ni === branch.nodes.length - 1;
              return (
                <TreeLeafNode
                  key={node.sessionId || node.taskId || ni}
                  node={node}
                  thresholds={thresholds}
                  colors={c}
                  isLast={isLastNode}
                  hasSiblingBelow={!isLast}
                  parentIsLast={isLast}
                />
              );
            })}

            {/* Trailing vertical line to next branch */}
            {!isLast && <div className={`ml-[5px] h-1 border-l-2 ${c.line}`} />}
          </div>
        );
      })}
    </div>
  );
}

function TreeLeafNode({ node, thresholds, colors, isLast }) {
  const shortKey = node.key
    ? (node.key.length > 28 ? node.key.slice(0, 28) + '...' : node.key)
    : (node.sessionId ? node.sessionId.slice(0, 12) + '...' : 'no session');

  // Build escalation step indicators for stale sessions
  const escalationSteps = [];
  if (node.status === 'stale' || node.status === 'healthy') {
    const steps = [
      { label: 'L0', name: 'Monitor', done: node.level > 0, active: node.level === 0 },
      { label: 'L1', name: 'Nudge', done: node.level > 1, active: node.level === 1 },
      { label: 'L2', name: 'Swap', done: node.level > 2, active: node.level === 2 },
      { label: 'L3', name: 'Kill', done: false, active: node.level >= 3 },
    ];
    for (const s of steps) {
      escalationSteps.push(s);
    }
  }

  return (
    <div className="flex items-stretch ml-[26px]">
      {/* Vertical + horizontal connector */}
      <div className="flex items-stretch shrink-0">
        <div className={`w-px ${isLast ? '' : ''}`}>
          <div className={`w-full h-full ${isLast ? 'border-l-2 border-dashed' : 'border-l-2'} ${colors.line}`}
               style={isLast ? { height: '50%' } : {}} />
        </div>
        <div className="flex items-center">
          <div className={`w-4 border-b-2 border-dashed ${colors.line}`} />
        </div>
      </div>

      {/* Node content */}
      <div className={`flex-1 my-1 border ${colors.nodeBorder} ${colors.nodeBg} rounded-md px-2.5 py-1.5`}>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Session identifier */}
          <span className="text-zinc-300 text-[10px] truncate max-w-[200px]" title={node.key || node.sessionId}>
            {shortKey}
          </span>

          {/* Task */}
          {node.taskId && (
            <>
              <span className="text-zinc-700">{'\u2192'}</span>
              <span className="text-zinc-400 text-[10px]">{node.taskId}</span>
            </>
          )}

          {/* Age */}
          <span className="text-zinc-600 text-[9px]">{formatAge(node.ageMs)}</span>

          {/* Model */}
          {node.model && (
            <span className="text-zinc-600 text-[9px] ml-auto">
              {node.model.split('/').pop()?.slice(0, 16)}
            </span>
          )}
        </div>

        {/* Escalation level visualization */}
        {escalationSteps.length > 0 && (
          <div className="flex items-center gap-0.5 mt-1">
            {escalationSteps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-0.5">
                {i > 0 && <div className={`w-2 h-px ${step.done || step.active ? 'bg-zinc-500' : 'bg-zinc-800'}`} />}
                <span className={`text-[8px] px-1 py-px rounded ${
                  step.active
                    ? 'bg-white/10 text-white border border-white/20'
                    : step.done
                    ? 'bg-zinc-700/50 text-zinc-500 line-through'
                    : 'text-zinc-700'
                }`} title={step.name}>
                  {step.label}
                </span>
              </div>
            ))}
            {node.nudgeCount > 0 && (
              <span className="text-[8px] text-zinc-600 ml-1">{node.nudgeCount}N {node.swapCount}S</span>
            )}
          </div>
        )}

        {/* Progress bar */}
        {node.progress > 0 && node.nextAction && node.nextAction !== 'monitoring' && node.nextAction !== 'killed' && (
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex-1 h-[3px] bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${colors.dot}`}
                style={{ width: `${Math.min(100, node.progress)}%` }}
              />
            </div>
            <span className="text-[8px] text-zinc-600 shrink-0">{node.nextAction}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-component ──────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 font-mono text-[10px] border-b-2 transition-colors ${
        active
          ? 'border-cyan-400 text-cyan-400'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}
