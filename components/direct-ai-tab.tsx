'use client';

import { useState, useMemo } from 'react';
import { useDirectAI } from '@/hooks/use-direct-ai';

interface ProviderColorSet {
  text: string;
  bg: string;
  border: string;
  dot: string;
}

interface HistoryEntry {
  type: string;
  provider?: string;
  complexity?: string;
  model?: string;
  similarity?: number;
  timestamp?: string;
  prompt?: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  reason?: string;
}

interface AIStats {
  totalCalls: number;
  cacheHits: number;
  claudeCalls: number;
  codexCalls: number;
  gatewayFallbacks: number;
  errors: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostSaved: number;
}

interface Providers {
  claude: boolean;
  codex: boolean;
  defaultClaudeModel?: string;
  defaultCodexModel?: string;
}

const PROVIDER_COLORS: Record<string, ProviderColorSet> = {
  claude: { text: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-500/30', dot: 'bg-orange-400' },
  codex:  { text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  cache:  { text: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-500/30', dot: 'bg-cyan-400' },
  gateway:{ text: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-500/30', dot: 'bg-purple-400' },
  error:  { text: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-500/30', dot: 'bg-red-400' },
};

const COMPLEXITY_COLORS: Record<string, string> = {
  simple:  'text-green-400 bg-green-400/10',
  medium:  'text-amber-400 bg-amber-400/10',
  complex: 'text-red-400 bg-red-400/10',
};

function formatTime(ts: string | undefined) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ProviderDot({ available, label }: { available: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${available ? 'bg-green-400' : 'bg-zinc-600'}`} />
      <span className={`font-mono text-[10px] ${available ? 'text-zinc-300' : 'text-zinc-600'}`}>
        {label}
      </span>
    </div>
  );
}

function StatCard({ label, value, sublabel, color = 'text-zinc-100' }: { label: string; value: string | number; sublabel?: string; color?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-zinc-800/30 border border-border/50 min-w-[90px]">
      <span className={`font-mono text-lg font-bold leading-none ${color}`}>{value}</span>
      <span className="font-mono text-[9px] text-zinc-500 mt-1 uppercase tracking-wide">{label}</span>
      {sublabel && <span className="font-mono text-[9px] text-zinc-600 mt-0.5">{sublabel}</span>}
    </div>
  );
}

function CostBar({ stats }: { stats: AIStats | null }) {
  if (!stats || stats.totalCalls === 0) return null;
  const cacheRate = stats.totalCalls > 0 ? ((stats.cacheHits / stats.totalCalls) * 100).toFixed(0) : '0';
  const claudeRate = stats.totalCalls > 0 ? ((stats.claudeCalls / stats.totalCalls) * 100).toFixed(0) : '0';
  const codexRate = stats.totalCalls > 0 ? ((stats.codexCalls / stats.totalCalls) * 100).toFixed(0) : '0';
  const gatewayRate = stats.totalCalls > 0 ? ((stats.gatewayFallbacks / stats.totalCalls) * 100).toFixed(0) : '0';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden bg-zinc-800">
        {stats.cacheHits > 0 && (
          <div className="h-full bg-cyan-500/80 transition-all" style={{ width: `${cacheRate}%` }} title={`Cache: ${cacheRate}%`} />
        )}
        {stats.claudeCalls > 0 && (
          <div className="h-full bg-orange-500/80 transition-all" style={{ width: `${claudeRate}%` }} title={`Claude: ${claudeRate}%`} />
        )}
        {stats.codexCalls > 0 && (
          <div className="h-full bg-emerald-500/80 transition-all" style={{ width: `${codexRate}%` }} title={`Codex: ${codexRate}%`} />
        )}
        {stats.gatewayFallbacks > 0 && (
          <div className="h-full bg-purple-500/80 transition-all" style={{ width: `${gatewayRate}%` }} title={`Gateway: ${gatewayRate}%`} />
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {stats.cacheHits > 0 && <CostLegend color="bg-cyan-500" label={`Cache ${cacheRate}%`} />}
        {stats.claudeCalls > 0 && <CostLegend color="bg-orange-500" label={`Claude ${claudeRate}%`} />}
        {stats.codexCalls > 0 && <CostLegend color="bg-emerald-500" label={`Codex ${codexRate}%`} />}
        {stats.gatewayFallbacks > 0 && <CostLegend color="bg-purple-500" label={`Gateway ${gatewayRate}%`} />}
      </div>
    </div>
  );
}

function CostLegend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-sm ${color}`} />
      <span className="font-mono text-[9px] text-zinc-500">{label}</span>
    </span>
  );
}

function DecisionRow({ entry }: { entry: HistoryEntry }) {
  const colors = PROVIDER_COLORS[entry.provider || ''] || PROVIDER_COLORS[entry.type === 'error' ? 'error' : 'gateway'];
  const complexityColor = COMPLEXITY_COLORS[entry.complexity || ''] || '';

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${colors.border} ${colors.bg} hover:brightness-110 transition-all`}>
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${colors.dot}`} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-wide ${colors.text}`}>
            {entry.type}
          </span>
          {entry.complexity && (
            <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${complexityColor}`}>
              {entry.complexity}
            </span>
          )}
          {entry.model && (
            <span className="font-mono text-[9px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">
              {entry.model}
            </span>
          )}
          {entry.similarity && (
            <span className="font-mono text-[9px] text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">
              sim:{entry.similarity.toFixed(3)}
            </span>
          )}
          <span className="font-mono text-[9px] text-zinc-600 ml-auto">{formatTime(entry.timestamp)}</span>
        </div>
        <div className="font-mono text-[11px] text-zinc-400 truncate" title={entry.prompt}>
          {entry.prompt}
        </div>
        {((entry.inputTokens ?? 0) > 0 || (entry.outputTokens ?? 0) > 0) && (
          <div className="font-mono text-[9px] text-zinc-600">
            tokens: {entry.inputTokens || 0} in / {entry.outputTokens || 0} out
          </div>
        )}
        {entry.error && (
          <div className="font-mono text-[10px] text-red-400">{entry.error}</div>
        )}
        {entry.reason && (
          <div className="font-mono text-[10px] text-zinc-500">{entry.reason}</div>
        )}
      </div>
    </div>
  );
}

export default function DirectAITab() {
  const { providers, stats, history, loading, error, refresh } = useDirectAI(true, 5000) as {
    providers: Providers;
    stats: AIStats | null;
    history: HistoryEntry[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
  };
  const [filter, setFilter] = useState('all');

  const filteredHistory = useMemo(() => {
    if (filter === 'all') return history;
    return history.filter(h => h.type === filter || h.provider === filter);
  }, [history, filter]);

  const filterCounts = useMemo(() => {
    const counts = { all: history.length, cache: 0, claude: 0, codex: 0, gateway: 0, error: 0 };
    for (const h of history) {
      if (h.type === 'cache-hit') counts.cache++;
      else if (h.provider === 'claude') counts.claude++;
      else if (h.provider === 'codex') counts.codex++;
      else if (h.type === 'gateway-fallback') counts.gateway++;
      else if (h.type === 'error') counts.error++;
    }
    return counts;
  }, [history]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card/20 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-mono text-[11px] font-bold text-zinc-200 uppercase tracking-wider">Direct AI Router</h3>
            <ProviderDot available={providers.claude} label="Claude" />
            <ProviderDot available={providers.codex} label="Codex" />
          </div>
          <button
            onClick={refresh}
            className="font-mono text-[9px] text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded border border-border/50 hover:border-border transition-colors"
          >
            refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <StatCard label="Total" value={stats?.totalCalls || 0} />
          <StatCard label="Cache Hits" value={stats?.cacheHits || 0} color="text-cyan-400" sublabel={stats && stats.totalCalls > 0 ? `${((stats.cacheHits / stats.totalCalls) * 100).toFixed(0)}% hit rate` : ''} />
          <StatCard label="Claude" value={stats?.claudeCalls || 0} color="text-orange-400" />
          <StatCard label="Codex" value={stats?.codexCalls || 0} color="text-emerald-400" />
          <StatCard label="Gateway" value={stats?.gatewayFallbacks || 0} color="text-purple-400" />
          <StatCard label="Errors" value={stats?.errors || 0} color="text-red-400" />
          <StatCard label="Input Tokens" value={stats?.totalInputTokens?.toLocaleString() || 0} color="text-zinc-300" />
          <StatCard label="Output Tokens" value={stats?.totalOutputTokens?.toLocaleString() || 0} color="text-zinc-300" />
          <StatCard label="Cost Saved" value={`$${(stats?.estimatedCostSaved || 0).toFixed(3)}`} color="text-green-400" sublabel="from cache" />
        </div>

        {/* Routing Distribution Bar */}
        <CostBar stats={stats} />
      </div>

      {/* Filter pills */}
      <div className="px-4 py-2 border-b border-border/50 bg-card/10 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { key: 'all', label: 'All' },
            { key: 'cache-hit', label: 'Cache' },
            { key: 'claude', label: 'Claude' },
            { key: 'codex', label: 'Codex' },
            { key: 'gateway-fallback', label: 'Gateway' },
            { key: 'error', label: 'Errors' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`font-mono text-[9px] px-2 py-1 rounded-full border transition-colors ${
                filter === f.key
                  ? 'border-accent/50 text-accent bg-accent/10'
                  : 'border-border/30 text-zinc-500 hover:text-zinc-300 hover:border-border/60'
              }`}
            >
              {f.label}
              <span className="ml-1 text-zinc-600">
                {f.key === 'all' ? filterCounts.all :
                 f.key === 'cache-hit' ? filterCounts.cache :
                 f.key === 'claude' ? filterCounts.claude :
                 f.key === 'codex' ? filterCounts.codex :
                 f.key === 'gateway-fallback' ? filterCounts.gateway :
                 filterCounts.error}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Decision History */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {loading && history.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="font-mono text-[10px] text-zinc-500">Loading...</span>
          </div>
        )}
        {error && (
          <div className="font-mono text-[10px] text-red-400 bg-red-400/5 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {!loading && filteredHistory.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <span className="font-mono text-[11px] text-zinc-500">No AI routing decisions yet</span>
            <span className="font-mono text-[10px] text-zinc-600 max-w-[300px]">
              Decisions appear here when the orchestrator, learning loop, or other subsystems make direct AI calls
            </span>
          </div>
        )}
        {filteredHistory.map((entry, i) => (
          <DecisionRow key={`${entry.timestamp}-${i}`} entry={entry} />
        ))}
      </div>

      {/* Model Routing Info */}
      <div className="px-4 py-2 border-t border-border/50 bg-card/10 shrink-0">
        <div className="flex items-center gap-4 flex-wrap font-mono text-[9px] text-zinc-600">
          <span>Models: {providers.defaultClaudeModel || 'n/a'} (Claude) | {providers.defaultCodexModel || 'n/a'} (Codex)</span>
          <span className="ml-auto">Decision tree: simple/medium/complex auto-routing</span>
        </div>
      </div>
    </div>
  );
}
