'use client';

import React, { useState } from 'react';
import { useSessionManager } from '@/hooks/use-session-manager';

interface ManagedSession {
  sessionId: string;
  status: string;
  key?: string;
  isController?: boolean;
  taskId?: string;
  model?: string;
  ageMs?: number;
  escalation?: { level: number };
}

interface Issue {
  sessionId?: string;
  taskId?: string;
  type: string;
  message: string;
}

interface ActionLogEntry {
  ts: string;
  action: string;
  result: string;
  sessionId?: string;
}

interface DebugLogEntry {
  ts: string;
  level: string;
  message: string;
}

interface ErrorEntry {
  ts: string;
  message: string;
}

const STATUS_COLORS: Record<string, { dot: string; text: string; row: string }> = {
  healthy:   { dot: '#22c55e', text: 'text-green-400',  row: '' },
  stale:     { dot: '#f59e0b', text: 'text-amber-400',  row: 'bg-amber-950/20' },
  errored:   { dot: '#ef4444', text: 'text-red-400',    row: 'bg-red-950/20' },
  orphaned:  { dot: '#71717a', text: 'text-zinc-400',   row: 'bg-zinc-800/20' },
  duplicate: { dot: '#a855f7', text: 'text-purple-400', row: 'bg-purple-950/20' },
};

const LOG_LEVEL_COLORS: Record<string, string> = {
  debug: 'text-zinc-500',
  info:  'text-blue-400',
  warn:  'text-amber-400',
  error: 'text-red-400',
};

function formatAge(ms: number | undefined) {
  if (!ms || ms <= 0) return '\u2014';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm > 0 ? `${rm}m` : ''}`;
}

function formatTime(ts: string | number | undefined) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortModel(model: string | undefined) {
  if (!model) return '\u2014';
  if (/opus/i.test(model)) return 'Opus';
  if (/sonnet/i.test(model)) return 'Sonnet';
  if (/haiku/i.test(model)) return 'Haiku';
  if (/gpt.*5.*3/i.test(model)) return 'GPT-5.3';
  if (/gpt/i.test(model)) return 'GPT';
  return model.split('/').pop()?.slice(0, 16) || model.slice(0, 16);
}

export default function SessionManagerTab() {
  const {
    sessions, summary, issues, actionLog, debugLog, lastError, errorCount,
    consecutiveEmptyScans, canSpawn, escalationPaused,
    lastScanAt, scanCount, loading,
    forceScan, nudge, swapModel, killSession, killOrphans, dedup, dedupAll, toggleEscalation,
  } = useSessionManager();

  const [panel, setPanel] = useState<'sessions' | 'actions' | 'debug'>('sessions');

  if (loading && sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 font-mono text-xs">
        Connecting to session manager...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0f]">
      {/* Header bar */}
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-3 font-mono text-[11px] flex-wrap">
        <StatusCount label="healthy" count={summary.healthy} color="#22c55e" />
        <StatusCount label="stale" count={summary.stale} color="#f59e0b" />
        <StatusCount label="errored" count={summary.errored} color="#ef4444" />
        <StatusCount label="orphaned" count={summary.orphaned} color="#71717a" />
        <StatusCount label="duplicate" count={summary.duplicates} color="#a855f7" />

        <span className="text-zinc-700">|</span>

        <span className={`${canSpawn.canSpawn ? 'text-zinc-500' : 'text-amber-400'}`}>
          {canSpawn.count}/{canSpawn.max} active
        </span>

        {consecutiveEmptyScans > 0 && (
          <>
            <span className="text-zinc-700">|</span>
            <span className="text-amber-500">{consecutiveEmptyScans} empty scans</span>
          </>
        )}

        {errorCount > 0 && (
          <>
            <span className="text-zinc-700">|</span>
            <span className="text-red-400">{errorCount} errors</span>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-zinc-600 text-[9px]">
            scan #{scanCount} {lastScanAt ? formatTime(lastScanAt) : ''}
          </span>
          <button
            onClick={forceScan}
            className="text-[10px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded px-2 py-0.5 transition-colors"
          >
            Scan
          </button>
          <button
            onClick={toggleEscalation}
            className={`text-[10px] border rounded px-2 py-0.5 transition-colors ${
              escalationPaused
                ? 'text-amber-400 border-amber-800 bg-amber-950/50 hover:bg-amber-950'
                : 'text-zinc-400 border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            {escalationPaused ? 'Resume Esc.' : 'Pause Esc.'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 font-mono text-[10px]">
        <TabBtn active={panel === 'sessions'} onClick={() => setPanel('sessions')}>
          Sessions ({sessions.length})
        </TabBtn>
        <TabBtn active={panel === 'actions'} onClick={() => setPanel('actions')}>
          Actions ({actionLog.length})
        </TabBtn>
        <TabBtn active={panel === 'debug'} onClick={() => setPanel('debug')} warn={errorCount > 0}>
          Debug Log ({debugLog.length}){errorCount > 0 ? ` [${errorCount} err]` : ''}
        </TabBtn>
      </div>

      {/* Sessions panel */}
      {panel === 'sessions' && (
        <div className="flex-1 min-h-0 overflow-auto">
          {issues.length > 0 && (
            <div className="border-b border-zinc-800/50 px-3 py-2 space-y-1 max-h-[140px] overflow-y-auto">
              {issues.slice(0, 8).map((issue: Issue, i: number) => (
                <div key={`${issue.sessionId}-${i}`} className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[issue.type]?.dot || '#71717a' }} />
                  <span className={`flex-1 ${STATUS_COLORS[issue.type]?.text || 'text-zinc-400'} truncate`}>
                    {issue.message}
                  </span>
                  {issue.type === 'orphaned' && issue.sessionId && (
                    <button
                      onClick={() => killSession(issue.sessionId!)}
                      className="text-[9px] text-red-500 hover:text-red-300 bg-red-950/30 border border-red-900/30 rounded px-1.5 py-0.5"
                    >
                      KILL
                    </button>
                  )}
                  {issue.type === 'stale' && issue.sessionId && (
                    <div className="flex gap-1">
                      <button onClick={() => nudge(issue.sessionId!)} className="text-[9px] text-amber-500 hover:text-amber-300 bg-amber-950/30 border border-amber-900/30 rounded px-1.5 py-0.5">NUDGE</button>
                      <button onClick={() => killSession(issue.sessionId!)} className="text-[9px] text-red-500 hover:text-red-300 bg-red-950/30 border border-red-900/30 rounded px-1.5 py-0.5">KILL</button>
                    </div>
                  )}
                  {issue.type === 'duplicate' && issue.taskId && (
                    <button onClick={() => dedup(issue.taskId!)} className="text-[9px] text-purple-500 hover:text-purple-300 bg-purple-950/30 border border-purple-900/30 rounded px-1.5 py-0.5">DEDUP</button>
                  )}
                </div>
              ))}
              {issues.length > 8 && (
                <div className="font-mono text-[9px] text-zinc-600">+ {issues.length - 8} more issues</div>
              )}
            </div>
          )}

          <div className="font-mono text-[11px]">
            <div className="grid grid-cols-[20px_80px_1fr_100px_80px_70px_50px_100px] gap-1 px-3 py-1.5 border-b border-zinc-800 text-zinc-500 text-[9px] uppercase tracking-wider sticky top-0 bg-[#0a0a0f] z-10">
              <span></span>
              <span>Status</span>
              <span>Session Key</span>
              <span>Task</span>
              <span>Model</span>
              <span>Age</span>
              <span>Esc</span>
              <span className="text-right">Actions</span>
            </div>

            {sessions.length === 0 && (
              <div className="px-3 py-6 text-center text-zinc-600 text-[11px]">
                No sessions detected{consecutiveEmptyScans > 2 ? ' \u2014 listSessions may be timing out' : ''}
              </div>
            )}

            {sessions.map((s: any) => {
              const colors = STATUS_COLORS[s.status] || STATUS_COLORS.healthy;
              return (
                <div
                  key={s.sessionId}
                  className={`grid grid-cols-[20px_80px_1fr_100px_80px_70px_50px_100px] gap-1 px-3 py-1.5 border-b border-zinc-900/50 items-center hover:bg-zinc-800/30 transition-colors ${colors.row}`}
                >
                  <span className="flex justify-center">
                    <span
                      className={`w-2 h-2 rounded-full ${s.status === 'stale' ? 'animate-pulse' : ''}`}
                      style={{ backgroundColor: colors.dot }}
                    />
                  </span>
                  <span className={`text-[10px] uppercase tracking-wide ${colors.text}`}>
                    {s.status}
                  </span>
                  <span className="text-zinc-300 truncate" title={s.key || s.sessionId}>
                    {s.isController ? (
                      <span className="text-green-400">main (controller)</span>
                    ) : (
                      s.key || <span className="text-zinc-600">{s.sessionId.slice(0, 16)}...</span>
                    )}
                  </span>
                  <span className="text-zinc-400 truncate" title={s.taskId || ''}>
                    {s.taskId || (s.isController ? 'ctrl' : '\u2014')}
                  </span>
                  <span className="text-zinc-500 text-[10px]">{shortModel(s.model)}</span>
                  <span className={`text-[10px] ${
                    (s.ageMs ?? 0) > 3600000 ? 'text-red-400' :
                    (s.ageMs ?? 0) > 600000 ? 'text-amber-400' :
                    'text-zinc-500'
                  }`}>
                    {formatAge(s.ageMs)}
                  </span>
                  <span className={`text-[10px] ${(s.escalation?.level ?? 0) > 0 ? 'text-amber-400' : 'text-zinc-700'}`}>
                    L{s.escalation?.level || 0}
                  </span>
                  <div className="flex gap-1 justify-end">
                    {!s.isController && (
                      <>
                        <button
                          onClick={() => nudge(s.sessionId)}
                          className="text-[9px] text-zinc-500 hover:text-zinc-200 bg-zinc-800/50 border border-zinc-700/50 rounded px-1.5 py-0.5 transition-colors"
                        >
                          NUDGE
                        </button>
                        <button
                          onClick={() => killSession(s.sessionId)}
                          className="text-[9px] text-red-500 hover:text-red-300 bg-red-950/30 border border-red-900/40 rounded px-1.5 py-0.5 transition-colors"
                        >
                          KILL
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-0 px-3 py-2 border-t border-zinc-800 bg-[#0a0a0f] flex items-center gap-2 font-mono text-[10px]">
            {summary.orphaned > 0 && (
              <button
                onClick={killOrphans}
                className="text-red-400 hover:text-red-200 bg-red-950/30 border border-red-900/30 rounded px-2.5 py-1 transition-colors"
              >
                Kill All Orphans ({summary.orphaned})
              </button>
            )}
            {summary.duplicates > 0 && (
              <button
                onClick={dedupAll}
                className="text-purple-400 hover:text-purple-200 bg-purple-950/30 border border-purple-900/30 rounded px-2.5 py-1 transition-colors"
              >
                Dedup All ({summary.duplicates})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Actions panel */}
      {panel === 'actions' && (
        <div className="flex-1 min-h-0 overflow-auto font-mono text-[10px]">
          {actionLog.length === 0 ? (
            <div className="px-3 py-6 text-center text-zinc-600">No actions recorded yet</div>
          ) : (
            actionLog.map((entry: ActionLogEntry, i: number) => (
              <div
                key={i}
                className="px-3 py-1.5 flex gap-3 border-b border-zinc-900/30 hover:bg-zinc-800/20 items-start"
              >
                <span className="text-zinc-600 shrink-0 w-16">{formatTime(entry.ts)}</span>
                <span className={`shrink-0 w-24 uppercase tracking-wide ${
                  entry.action.includes('kill') ? 'text-red-400' :
                  entry.action.includes('swap') ? 'text-purple-400' :
                  entry.action.includes('nudge') ? 'text-amber-400' :
                  entry.action.includes('dedup') ? 'text-blue-400' :
                  entry.action.includes('scan') ? 'text-green-400' :
                  'text-zinc-400'
                }`}>
                  {entry.action}
                </span>
                <span className="text-zinc-400 truncate flex-1">{entry.result}</span>
                {entry.sessionId && (
                  <span className="text-zinc-600 shrink-0">{entry.sessionId.slice(0, 8)}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Debug log panel */}
      {panel === 'debug' && (
        <div className="flex-1 min-h-0 overflow-auto font-mono text-[10px]">
          {lastError && (
            <div className="px-3 py-2 bg-red-950/30 border-b border-red-900/30 text-red-400">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="font-semibold">Last Error ({errorCount} total)</span>
                <span className="text-zinc-500 ml-auto">{formatTime(lastError.ts)}</span>
              </div>
              <div className="mt-1 text-[10px] text-red-300/80 whitespace-pre-wrap break-all">{lastError.message}</div>
            </div>
          )}

          {debugLog.length === 0 ? (
            <div className="px-3 py-6 text-center text-zinc-600">No debug entries yet — waiting for first scan</div>
          ) : (
            debugLog.map((entry: DebugLogEntry, i: number) => (
              <div
                key={i}
                className={`px-3 py-1 flex gap-2 border-b border-zinc-900/20 ${
                  entry.level === 'error' ? 'bg-red-950/10' :
                  entry.level === 'warn' ? 'bg-amber-950/10' : ''
                }`}
              >
                <span className="text-zinc-600 shrink-0 w-16">{formatTime(entry.ts)}</span>
                <span className={`shrink-0 w-10 uppercase ${LOG_LEVEL_COLORS[entry.level] || 'text-zinc-500'}`}>
                  {entry.level}
                </span>
                <span className={`flex-1 break-all ${
                  entry.level === 'error' ? 'text-red-300' :
                  entry.level === 'warn' ? 'text-amber-300' :
                  'text-zinc-400'
                }`}>
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function StatusCount({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className="flex items-center gap-1.5" style={{ color: count > 0 ? color : '#3f3f46' }}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: count > 0 ? color : '#27272a' }}
      />
      <span>{count} {label}</span>
    </span>
  );
}

function TabBtn({ active, onClick, children, warn }: { active: boolean; onClick: () => void; children: React.ReactNode; warn?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 font-mono text-[10px] border-b-2 transition-colors ${
        active
          ? 'border-cyan-400 text-cyan-400'
          : warn
          ? 'border-transparent text-red-400 hover:text-red-300'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}
