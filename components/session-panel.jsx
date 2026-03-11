'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useDashboard } from '@/context/dashboard-context';
import { useProjectConfig } from '@/context/project-config-context';
import { useSessionHistory } from '@/hooks/use-session-history';
import { useSessionManager } from '@/hooks/use-session-manager';
import { useScreencast } from '@/hooks/use-screencast';
import { normalizeStatus } from '@/lib/normalize-status';
import SessionManagerTab from '@/components/session-manager-tab';
import OrchestratorTab from '@/components/orchestrator-tab';
import { useOrchestrator } from '@/hooks/use-orchestrator';
import AppLogTab from '@/components/app-log-tab';
import RecordingPlayer from '@/components/recording-player';

/** Shared markdown components for consistent rendering */
const mdComponents = {
  h1: ({ children }) => <h1 className="text-base font-bold text-zinc-100 mt-3 mb-1.5">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold text-zinc-100 mt-2.5 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[13px] font-semibold text-zinc-200 mt-2 mb-1">{children}</h3>,
  p: ({ children }) => <div className="text-[13px] text-zinc-300 leading-relaxed mb-1.5">{children}</div>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
  em: ({ children }) => <em className="text-zinc-400">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-1.5 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="text-[13px] text-zinc-300 leading-relaxed">{children}</li>,
  pre: ({ children }) => (
    <pre className="bg-[#0a0a14] border border-border rounded-lg px-3 py-2 overflow-x-auto my-1.5">{children}</pre>
  ),
  code: ({ className, children }) => {
    if (className?.startsWith('language-')) {
      return <code className="text-[11px] text-zinc-300 font-mono leading-snug">{children}</code>;
    }
    return <code className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded text-[12px] font-mono">{children}</code>;
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-zinc-600 pl-3 text-zinc-400 italic my-1.5">{children}</blockquote>
  ),
  a: ({ children }) => <span className="text-accent underline">{children}</span>,
  hr: () => <hr className="border-border my-2" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-[12px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  th: ({ children }) => <th className="text-left px-2 py-1.5 text-zinc-400 font-medium text-[11px]">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1 text-zinc-300 border-t border-border/50">{children}</td>,
};

/** Keep visited tabs mounted but hidden for instant switching */
function TabPane({ active, visited, children }) {
  if (!visited) return null;
  return (
    <div className={`${active ? 'flex-1 flex flex-col min-h-0' : 'hidden'}`}>
      {children}
    </div>
  );
}

function TabLoadingOverlay({ loading }) {
  if (!loading) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/82 backdrop-blur-[2px]">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 font-mono text-[10px] text-zinc-300">
        <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        Loading tab...
      </div>
    </div>
  );
}

/** System-generated finding IDs that are not real bugs */
const SYSTEM_FINDING_IDS = new Set(['stale-timeout', 'cancelled-by-user', 'agent-crash', 'orchestrator-recovery']);
const MOBILE_VIEWPORT_PATTERNS = /\bmobile\b|\bphone\b|\biphone\b|\bandroid\b|\bsmall screen\b/i;
const DESKTOP_VIEWPORT_PATTERNS = /\bdesktop\b|\blarge screen\b|\bwide screen\b/i;

function isSystemFinding(f) {
  return SYSTEM_FINDING_IDS.has(f.id) || f.system === true;
}

function normalizeViewportBucket(value) {
  const raw = String(value || '').toLowerCase();
  if (!raw) return 'shared';
  if (raw.includes('mobile') || raw.includes('phone')) return 'mobile';
  if (raw.includes('desktop')) return 'desktop';
  return 'shared';
}

function inferFindingViewport(finding) {
  const explicit = normalizeViewportBucket(finding?.viewport);
  if (explicit !== 'shared') return explicit;

  const text = [
    finding?.title,
    finding?.description,
    finding?.steps,
    finding?.expected,
    finding?.actual,
    finding?.page,
  ].filter(Boolean).join(' ');

  const hasMobile = MOBILE_VIEWPORT_PATTERNS.test(text);
  const hasDesktop = DESKTOP_VIEWPORT_PATTERNS.test(text);

  if (hasMobile && !hasDesktop) return 'mobile';
  if (hasDesktop && !hasMobile) return 'desktop';
  return 'shared';
}

function viewportLabel(bucket) {
  return bucket === 'mobile' ? 'Mobile' : bucket === 'desktop' ? 'Desktop' : 'Shared';
}

function groupFindingsByViewport(findings) {
  return findings.reduce((acc, finding) => {
    acc[inferFindingViewport(finding)].push(finding);
    return acc;
  }, { desktop: [], mobile: [], shared: [] });
}

function CopyButton({ getText }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(getText()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className={`font-mono text-[9px] transition-colors ${
        copied ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const TABS = [
  { id: 'output', label: 'Session' },
  { id: 'orchestrator', label: 'Orchestrator' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'stories', label: 'Stories' },
  { id: 'reports', label: 'Reports' },
  { id: 'memory', label: 'Memory' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'app', label: 'App' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'log', label: 'Log' },
  { id: 'tasks', label: 'Results' },
];

export default function SessionPanel() {
  const {
    results, activePipeline, logEntries, gatewayStatus,
    streamingText, addLog,
  } = useDashboard();
  const { tasks: TASKS } = useProjectConfig();

  const [tab, _setTab] = useState(() => {
    if (typeof window === 'undefined') return 'output';
    return localStorage.getItem('oc-active-tab') || 'output';
  });
  // Track visited tabs so they stay mounted (hidden) after first visit
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([
    typeof window === 'undefined' ? 'output' : (localStorage.getItem('oc-active-tab') || 'output')
  ]));
  const [tabLoading, setTabLoading] = useState({});
  const [tabTransitioning, setTabTransitioning] = useState(false);
  const setTab = useCallback((id) => {
    setTabTransitioning(true);
    _setTab(id);
    setVisitedTabs(prev => { const next = new Set(prev); next.add(id); return next; });
    localStorage.setItem('oc-active-tab', id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTabTransitioning(false));
    });
  }, []);
  const setTabBusy = useCallback((id, isLoading) => {
    setTabLoading((prev) => {
      if (prev[id] === isLoading) return prev;
      return { ...prev, [id]: isLoading };
    });
  }, []);
  const onOutputLoading = useCallback((v) => setTabBusy('output', v), [setTabBusy]);
  const onReportsLoading = useCallback((v) => setTabBusy('reports', v), [setTabBusy]);
  const onMemoryLoading = useCallback((v) => setTabBusy('memory', v), [setTabBusy]);
  const onRequirementsLoading = useCallback((v) => setTabBusy('requirements', v), [setTabBusy]);
  const onAppLoading = useCallback((v) => setTabBusy('app', v), [setTabBusy]);
  const onRecordingsLoading = useCallback((v) => setTabBusy('recordings', v), [setTabBusy]);
  const [chatMsg, setChatMsg] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const outputEndRef = useRef(null);

  // App health polling (for tab indicator)
  const [appHealthy, setAppHealthy] = useState(null);
  useEffect(() => {
    const poll = () => fetch('/api/app-health').then(r => r.json()).then(d => setAppHealthy(d.healthy)).catch(() => {});
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, []);

  // Track which task to show session output for
  const [selectedTaskId, setSelectedTaskId] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('oc-selected-task') || null;
  });

  const selectTask = useCallback((id) => {
    setSelectedTaskId(id);
    if (id) localStorage.setItem('oc-selected-task', id);
    else localStorage.removeItem('oc-selected-task');
  }, []);

  const runningTaskId = useMemo(() => {
    for (const t of TASKS) {
      const s = normalizeStatus(results[t.id] || {});
      if (s === 'running') return t.id;
    }
    return null;
  }, [TASKS, results]);

  useEffect(() => {
    if (runningTaskId) selectTask(runningTaskId);
  }, [runningTaskId, selectTask]);

  useEffect(() => {
    if (selectedTaskId) return;
    const withResults = TASKS.filter(t => normalizeStatus(results[t.id] || {}) !== 'idle');
    if (withResults.length > 0) selectTask(withResults[0].id);
  }, [TASKS, results, selectedTaskId, selectTask]);

  const activeTaskId = selectedTaskId || runningTaskId;

  // Session manager provides managed session info (resolved faster than session-history API)
  const { issues: smIssues, sessions: smSessions } = useSessionManager();
  const { started: orchStarted, paused: orchPaused, pendingReview: orchPending } = useOrchestrator();
  const orchestratorActive = orchStarted && !orchPaused;

  const managedSessionsByTask = useMemo(() => {
    const byTask = {};
    for (const session of smSessions) {
      if (!session.taskId || session.isController) continue;
      if (!['healthy', 'stale', 'duplicate'].includes(session.status)) continue;

      const current = byTask[session.taskId];
      const currentUpdatedAt = current ? Math.max(current.lastActivityTs || 0, current.updatedAt || 0) : -1;
      const sessionUpdatedAt = Math.max(session.lastActivityTs || 0, session.updatedAt || 0);

      if (!current || sessionUpdatedAt >= currentUpdatedAt) {
        byTask[session.taskId] = session;
      }
    }
    return byTask;
  }, [smSessions]);

  // Pass managed session ID as hint to speed up session resolution
  const managedSession = activeTaskId ? managedSessionsByTask[activeTaskId] || null : null;
  const { entries, sessionId, loading, truncated, loadingEarlier, clear: clearHistory, loadEarlier } = useSessionHistory(
    activeTaskId,
    { enabled: tab === 'output' && !!activeTaskId, interval: 2000, hintSessionId: managedSession?.sessionId || null }
  );

  useEffect(() => {
    if (tab === 'output' && outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries, tab]);

  const sendChat = async () => {
    if (!chatMsg.trim()) return;
    const msg = chatMsg.trim();
    setChatMsg('');
    setChatSending(true);
    try {
      // Try gateway first, fall back to CLI
      if (gatewayStatus === 'connected') {
        await fetch('/api/gateway/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: activeTaskId || 'controller', message: msg, stream: false }),
        });
      } else {
        const r = await fetch('/api/chat-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: activeTaskId, message: msg }),
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error);
      }
      addLog('CHAT', `Sent to ${activeTaskId || 'controller'}: ${msg.slice(0, 80)}`, 'success');
    } catch (e) {
      addLog('SYSTEM', `Send failed: ${e.message}`, 'error');
    }
    setChatSending(false);
  };

  const taskOptions = useMemo(() => {
    return TASKS.map(t => {
      const s = normalizeStatus(results[t.id] || {});
      return { id: t.id, label: `S${t.num}: ${t.title}`, status: s, icon: t.icon };
    });
  }, [TASKS, results]);

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-bg">
      {/* Progress bar */}
      <div className="px-4 py-2 border-b border-border bg-card/30 shrink-0">
        <div className="flex gap-1 h-1.5">
          {TASKS.map(t => {
            const s = normalizeStatus(results[t.id] || {});
            const color = s === 'passed' ? 'bg-green-400' : s === 'failed' ? 'bg-red-400' : s === 'running' ? 'bg-amber-400 animate-pulse' : 'bg-border';
            return (
              <div
                key={t.id}
                className={`flex-1 rounded-sm ${color} transition-colors duration-300 cursor-pointer hover:opacity-80`}
                title={`S${t.num}: ${t.title} (${s})`}
                onClick={() => { selectTask(t.id); setTab('output'); }}
              />
            );
          })}
        </div>
      </div>

      {/* Tab bar — scrollable */}
      <div className="flex items-center border-b border-border shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2.5 font-mono text-[9px] uppercase tracking-[1.5px] border-b-2 transition-colors whitespace-nowrap relative ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.id === 'orchestrator' && (
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${orchStarted && !orchPaused ? 'bg-green-400' : orchPaused ? 'bg-amber-400' : 'bg-zinc-600'}`} />
            )}
            {t.id === 'app' && (
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                appHealthy === true ? 'bg-green-400' :
                appHealthy === false ? 'bg-red-400 animate-pulse' :
                'bg-zinc-600'
              }`} />
            )}
            {t.label}
            {t.id === 'orchestrator' && orchPending.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-500 rounded-full text-[7px] text-white font-bold flex items-center justify-center leading-none">
                {orchPending.length > 9 ? '9+' : orchPending.length}
              </span>
            )}
            {t.id === 'sessions' && smIssues.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[7px] text-white font-bold flex items-center justify-center leading-none">
                {smIssues.length > 9 ? '9+' : smIssues.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content — visited tabs stay mounted but hidden for instant switching */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <TabLoadingOverlay loading={tabTransitioning || !!tabLoading[tab]} />
        <TabPane active={tab === 'output'} visited={visitedTabs.has('output')}>
          <SessionOutputTab
            activeTaskId={activeTaskId}
            results={results}
            taskOptions={taskOptions}
            sessionId={sessionId}
            orchestratorActive={orchestratorActive}
            managedSession={managedSession}
            gatewayStatus={gatewayStatus}
            loading={loading}
            entries={entries}
            truncated={truncated}
            loadingEarlier={loadingEarlier}
            loadEarlier={loadEarlier}
            clearHistory={clearHistory}
            selectTask={selectTask}
            onLoadingChange={onOutputLoading}
            chatMsg={chatMsg}
            setChatMsg={setChatMsg}
            chatSending={chatSending}
            sendChat={sendChat}
            outputEndRef={outputEndRef}
          />
        </TabPane>
        <TabPane active={tab === 'orchestrator'} visited={visitedTabs.has('orchestrator')}>
          <OrchestratorTab />
        </TabPane>
        <TabPane active={tab === 'sessions'} visited={visitedTabs.has('sessions')}>
          <SessionManagerTab />
        </TabPane>
        <TabPane active={tab === 'stories'} visited={visitedTabs.has('stories')}>
          <StoriesTab />
        </TabPane>
        <TabPane active={tab === 'reports'} visited={visitedTabs.has('reports')}>
          <FileViewerTab folder="reports" title="QA Reports" onLoadingChange={onReportsLoading} />
        </TabPane>
        <TabPane active={tab === 'memory'} visited={visitedTabs.has('memory')}>
          <FileViewerTab folder="memory" title="Agent Memory" onLoadingChange={onMemoryLoading} />
        </TabPane>
        <TabPane active={tab === 'requirements'} visited={visitedTabs.has('requirements')}>
          <FileViewerTab folder="requirements" title="Requirements" onLoadingChange={onRequirementsLoading} />
        </TabPane>
        <TabPane active={tab === 'app'} visited={visitedTabs.has('app')}>
          <AppLogTab onLoadingChange={onAppLoading} />
        </TabPane>
        <TabPane active={tab === 'recordings'} visited={visitedTabs.has('recordings')}>
          <RecordingsTab onLoadingChange={onRecordingsLoading} />
        </TabPane>
        <TabPane active={tab === 'log'} visited={visitedTabs.has('log')}>
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-border bg-card/20 flex items-center gap-2 shrink-0">
              <span className="font-mono text-[10px] text-zinc-400">{logEntries.length} entries</span>
              <div className="flex-1" />
              <CopyButton getText={() => logEntries.map(e => `${e.time}  ${e.agent}  ${e.msg}`).join('\n')} />
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-[1.8]">
              {logEntries.map((entry, i) => (
                <div
                  key={i}
                  className={`flex gap-3 px-2 py-0.5 rounded hover:bg-white/[0.02] transition-colors ${
                    entry.type === 'error' ? '[&_.log-msg]:text-red-400' :
                    entry.type === 'success' ? '[&_.log-msg]:text-green-400' : ''
                  }`}
                >
                  <span className="text-zinc-500 whitespace-nowrap">{entry.time}</span>
                  <span className="text-accent min-w-[80px]">{entry.agent}</span>
                  <span className="log-msg text-zinc-400">{entry.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </TabPane>
        <TabPane active={tab === 'tasks'} visited={visitedTabs.has('tasks')}>
          <TaskResultsList tasks={TASKS} results={results} addLog={addLog} />
        </TabPane>
      </div>
    </main>
  );
}

// ── Session Output Tab ──────────────────────────────────────────

function SessionOutputTab({
  activeTaskId, results, taskOptions, sessionId, orchestratorActive, managedSession, gatewayStatus, loading,
  entries, truncated, loadingEarlier, loadEarlier, clearHistory, selectTask,
  onLoadingChange, chatMsg, setChatMsg, chatSending, sendChat, outputEndRef,
}) {
  const { project } = useProjectConfig();

  const [splitView, setSplitView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('oc-split-view') === 'true';
  });

  const toggleSplit = useCallback(() => {
    setSplitView(prev => {
      const next = !prev;
      localStorage.setItem('oc-split-view', String(next));
      return next;
    });
  }, []);
  const taskResult = activeTaskId ? (results[activeTaskId] || {}) : {};
  const taskStatus = normalizeStatus(taskResult);
  // Show live browser for any running task — don't require orchestrator to be active
  const liveManagedTaskId = taskStatus === 'running' ? activeTaskId : null;
  const liveBrowserEnabled = splitView && !!liveManagedTaskId;

  // CDP screencast — only connect when split view is open
  const {
    imgRef: screencastImgRef,
    pageUrl: screencastPageUrl,
    pageTitle: screencastPageTitle,
    status: screencastStatus,
    frameCount: screencastFrameCount,
    reconnect: screencastReconnect,
  } = useScreencast({ enabled: liveBrowserEnabled, quality: 55, fps: 5, taskId: liveManagedTaskId });

  // Recording status (auto-managed — recording starts/stops with the task)
  const [recordingStatus, setRecordingStatus] = useState(null);

  useEffect(() => {
    if (!liveManagedTaskId) { setRecordingStatus(null); return; }
    const check = () => {
      fetch(`/api/recording?action=status&taskId=${encodeURIComponent(liveManagedTaskId)}`)
        .then(r => r.json())
        .then(d => setRecordingStatus(d.ok ? d : null))
        .catch(() => setRecordingStatus(null));
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, [liveManagedTaskId]);

  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  useEffect(() => {
    onLoadingChangeRef.current?.(loading);
  }, [loading]);

  const chatPanel = (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <div className="flex-1 overflow-y-auto">
        <div className={`mx-auto px-4 py-4 space-y-4 ${splitView ? '' : 'max-w-3xl'}`}>
          {!activeTaskId && <div className="text-center py-12 text-zinc-600 text-sm">Select a task or start a pipeline</div>}
          {activeTaskId && entries.length === 0 && !loading && (
            <div className="text-center py-12">
              <div className="text-zinc-600 text-sm mb-1">No session data yet</div>
              <div className="font-mono text-[10px] text-zinc-700">Waiting for {activeTaskId}...</div>
            </div>
          )}
          {truncated && (
            <div className="text-center py-2">
              <button
                onClick={loadEarlier}
                disabled={loadingEarlier}
                className="font-mono text-[10px] text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
              >
                {loadingEarlier ? 'Loading...' : '\u2191 Load earlier messages'}
              </button>
            </div>
          )}
          {entries.map((entry, i) => <SessionEntry key={`${entry.id || i}-${i}`} entry={entry} />)}
          <ThinkingIndicator entries={entries} taskId={activeTaskId} />
          <div ref={outputEndRef} />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0 bg-card/30">
        <input
          value={chatMsg}
          onChange={(e) => setChatMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !chatSending && sendChat()}
          placeholder={`Message ${activeTaskId || 'controller'}...${gatewayStatus === 'connected' ? '' : ' (via CLI)'}`}
          disabled={false}
          className="flex-1 bg-[#0a0a12] border border-border rounded-lg px-3 py-2.5 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 disabled:opacity-40"
        />
        <button
          onClick={sendChat}
          disabled={chatSending || !chatMsg.trim()}
          className="btn-primary px-4 py-2 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
        >{chatSending ? '...' : 'Send'}</button>
      </div>
    </div>
  );

  const screencastStatusColor =
    screencastStatus === 'streaming' ? 'bg-green-400' :
    screencastStatus === 'connecting' ? 'bg-amber-400 animate-pulse' :
    screencastStatus === 'error' ? 'bg-red-400' :
    'bg-zinc-600';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header bar */}
      <div className="px-4 py-2 border-b border-border bg-card/20 flex items-center gap-3 shrink-0">
        <select
          value={activeTaskId || ''}
          onChange={(e) => { selectTask(e.target.value || null); clearHistory(); }}
          className="bg-elevated border border-border rounded px-2 py-1 text-[11px] text-zinc-300 font-mono flex-1 max-w-[280px]"
        >
          <option value="">Select a task...</option>
          {taskOptions.map(t => (
            <option key={t.id} value={t.id}>{t.icon} {t.label} [{t.status}]</option>
          ))}
        </select>
        {sessionId && (
          <span className="font-mono text-[8px] text-zinc-600 truncate" title={sessionId}>{sessionId.slice(0, 8)}...</span>
        )}
        {managedSession?.sessionId && (
          <span className="font-mono text-[8px] text-zinc-600 truncate" title={managedSession.sessionId}>
            live:{managedSession.sessionId.slice(0, 8)}...
          </span>
        )}
        {gatewayStatus === 'connected' && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Gateway connected" />}
        {loading && <span className="font-mono text-[8px] text-zinc-600 animate-pulse">loading...</span>}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={toggleSplit}
            className={`font-mono text-[9px] px-2 py-1 rounded border transition-colors ${
              splitView
                ? 'text-accent border-accent/30 bg-accent/10'
                : 'text-zinc-500 border-border hover:text-zinc-300 hover:border-zinc-600'
            }`}
            title={splitView ? 'Close browser view' : 'Watch orchestrator-managed browser'}
          >
            {splitView ? '\u25e7 Browser' : '\u25a1 Browser'}
          </button>
          <button onClick={clearHistory} className="font-mono text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors">Clear</button>
        </div>
      </div>

      {/* Content — split or full */}
      {splitView ? (
        <div className="flex-1 flex min-h-0">
          {/* Browser screencast panel */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-border bg-[#0a0a0a]">
            <div className="px-3 py-1.5 border-b border-border bg-card/30 flex items-center gap-2 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${screencastStatusColor}`} />
              <span className="font-mono text-[9px] text-zinc-400">
                {liveBrowserEnabled && screencastStatus === 'streaming' ? 'Live' :
                 screencastStatus === 'connecting' ? 'Connecting...' :
                 liveManagedTaskId && screencastStatus === 'error' ? 'Disconnected' : 'Off'}
              </span>
              {liveManagedTaskId && (
                <span className="font-mono text-[8px] text-zinc-600">
                  {liveManagedTaskId}
                </span>
              )}
              {screencastPageUrl && (
                <span className="font-mono text-[8px] text-zinc-600 truncate flex-1" title={screencastPageUrl}>
                  {screencastPageUrl}
                </span>
              )}
              {screencastStatus === 'error' && (
                <button
                  onClick={screencastReconnect}
                  className="font-mono text-[8px] text-accent hover:text-accent/80 transition-colors"
                >Retry</button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {recordingStatus?.recording && (
                  <span className="font-mono text-[9px] text-red-400/70 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    REC {recordingStatus.frameCount}
                  </span>
                )}
                {screencastStatus === 'streaming' && (
                  <span className="font-mono text-[8px] text-zinc-700">{screencastFrameCount} frames</span>
                )}
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-hidden relative">
              {liveBrowserEnabled && (screencastStatus === 'streaming' || screencastFrameCount > 0) ? (
                <img
                  ref={screencastImgRef}
                  alt="Agent browser"
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
              ) : liveBrowserEnabled && screencastStatus === 'connecting' ? (
                <div className="text-center">
                  <div className="text-zinc-600 text-sm mb-1">Connecting to browser...</div>
                  <div className="font-mono text-[10px] text-zinc-700">CDP port 18800</div>
                </div>
              ) : liveManagedTaskId && screencastStatus === 'error' ? (
                <div className="text-center px-6">
                  <div className="text-zinc-500 text-sm mb-2">Browser not available</div>
                  <div className="font-mono text-[10px] text-zinc-600 mb-3 leading-relaxed">
                    The selected story has an active orchestrator-managed session,<br />
                    but its linked browser target is not currently available.
                  </div>
                  <button
                    onClick={screencastReconnect}
                    className="font-mono text-[10px] text-accent hover:text-accent/80 border border-accent/30 rounded px-3 py-1.5 transition-colors"
                  >Reconnect</button>
                </div>
              ) : liveManagedTaskId ? (
                <div className="text-center">
                  <div className="text-zinc-600 text-sm">Browser screencast</div>
                  <div className="font-mono text-[10px] text-zinc-700">Waiting for orchestrator-linked browser...</div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-zinc-600 text-sm">No live browser for this story</div>
                  <div className="font-mono text-[10px] text-zinc-700">
                    Browser frames only appear while the selected story has an orchestrator-managed running session.
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Chat panel */}
          <div className="w-[420px] shrink-0 flex flex-col min-h-0">
            {chatPanel}
          </div>
        </div>
      ) : (
        chatPanel
      )}
    </div>
  );
}

// ── Stories Tab ──────────────────────────────────────────────────

function StoriesTab() {
  const { tasks: TASKS } = useProjectConfig();
  const { results } = useDashboard();
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="flex-1 overflow-y-auto">
      {TASKS.map(t => {
        const d = results[t.id] || {};
        const s = normalizeStatus(d);
        const isOpen = expanded === t.id;

        return (
          <div key={t.id} className="border-b border-border">
            <button
              onClick={() => setExpanded(isOpen ? null : t.id)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors text-left"
            >
              <span className="text-base">{t.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-200">S{t.num}: {t.title}</div>
                <div className="text-[10px] text-zinc-500">{t.actor} {t.deps?.length ? `\u2022 deps: ${t.deps.join(', ')}` : ''}</div>
              </div>
              <span className={`font-mono text-[9px] uppercase px-2 py-0.5 rounded ${
                s === 'passed' ? 'bg-green-400/10 text-green-400' :
                s === 'failed' ? 'bg-red-400/10 text-red-400' :
                s === 'running' ? 'bg-amber-400/10 text-amber-400' :
                'bg-zinc-800 text-zinc-500'
              }`}>{s}</span>
              <span className="text-zinc-600 text-[10px]">{isOpen ? '\u25bc' : '\u25b6'}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 bg-white/[0.01]">
                <div className="space-y-2 text-[12px]">
                  <div><span className="text-zinc-500">Description:</span> <span className="text-zinc-300">{t.desc}</span></div>
                  <div><span className="text-zinc-500">Default model:</span> <span className="text-zinc-300 font-mono">{t.defaultModel}</span></div>
                  <div><span className="text-zinc-500">Task ID:</span> <span className="text-zinc-300 font-mono">{t.id}</span></div>
                  {t.deps?.length > 0 && (
                    <div><span className="text-zinc-500">Dependencies:</span> <span className="text-zinc-300 font-mono">{t.deps.join(', ')}</span></div>
                  )}
                  {d.lastLog && (
                    <div><span className="text-zinc-500">Last log:</span> <span className="text-zinc-400">{d.lastLog}</span></div>
                  )}
                  {(d.passed || d.failed || d.warnings) && (
                    <div className="flex gap-3 font-mono text-[11px]">
                      <span className="text-green-400">{'\u2713'}{typeof d.passed === 'number' ? d.passed : Array.isArray(d.passed) ? d.passed.length : 0}</span>
                      <span className="text-red-400">{'\u2717'}{typeof d.failed === 'number' ? d.failed : Array.isArray(d.failed) ? d.failed.length : 0}</span>
                      <span className="text-amber-400">{'\u26a0'}{typeof d.warnings === 'number' ? d.warnings : Array.isArray(d.warnings) ? d.warnings.length : 0}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── File Viewer Tab (Memory / Requirements / Reports) ───────────

function FileViewerTab({ folder, title, onLoadingChange }) {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/project-files?folder=${folder}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setFiles(data.files || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [folder]);

  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  useEffect(() => {
    onLoadingChangeRef.current?.(loading);
  }, [loading]);

  // Auto-select first .md file
  useEffect(() => {
    if (!selectedFile && files.length > 0) {
      const firstMd = files.find(f => f.name.endsWith('.md'));
      if (firstMd) setSelectedFile(firstMd.name);
    }
  }, [files, selectedFile]);

  const activeFile = files.find(f => f.name === selectedFile);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">Loading {title}...</div>;
  }

  if (files.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">No files in {folder}/</div>;
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* File list sidebar */}
      <div className="w-[200px] shrink-0 border-r border-border overflow-y-auto bg-card/20">
        <div className="px-3 py-2 font-mono text-[9px] text-zinc-500 uppercase tracking-[1.5px]">{title}</div>
        {files.map(f => (
          <button
            key={f.name}
            onClick={() => setSelectedFile(f.name)}
            className={`w-full text-left px-3 py-2 text-[11px] font-mono transition-colors truncate ${
              selectedFile === f.name
                ? 'bg-accent/10 text-accent border-r-2 border-accent'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
            }`}
            title={f.name}
          >
            <span className="mr-1.5">{f.type === 'directory' ? '\ud83d\udcc1' : f.name.endsWith('.md') ? '\ud83d\udcc4' : '\ud83d\udcc3'}</span>
            {f.name}
            {f.type === 'directory' && <span className="text-zinc-600 ml-1">({f.fileCount})</span>}
          </button>
        ))}
      </div>

      {/* File content */}
      <div className="flex-1 overflow-y-auto">
        {activeFile ? (
          <div className="max-w-3xl mx-auto px-6 py-5">
            {/* File header */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
              <span className="font-mono text-[12px] text-zinc-200 font-medium">{activeFile.name}</span>
              {activeFile.modified && (
                <span className="font-mono text-[9px] text-zinc-600">
                  {new Date(activeFile.modified).toLocaleDateString('en-GB')} {new Date(activeFile.modified).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {activeFile.size && (
                <span className="font-mono text-[9px] text-zinc-700">{(activeFile.size / 1024).toFixed(1)}KB</span>
              )}
            </div>

            {/* Render markdown or raw content */}
            {activeFile.content ? (
              activeFile.name.endsWith('.md') ? (
                <ReactMarkdown components={mdComponents}>{activeFile.content}</ReactMarkdown>
              ) : activeFile.name.endsWith('.json') ? (
                <pre className="font-mono text-[11px] text-zinc-300 leading-snug whitespace-pre-wrap">{activeFile.content}</pre>
              ) : (
                <pre className="font-mono text-[11px] text-zinc-400 leading-snug whitespace-pre-wrap">{activeFile.content}</pre>
              )
            ) : activeFile.type === 'directory' ? (
              <div className="space-y-1">
                <div className="text-sm text-zinc-400 mb-3">{activeFile.fileCount} files</div>
                {activeFile.files?.map(name => (
                  <div key={name} className="font-mono text-[11px] text-zinc-400 px-2 py-1 bg-white/[0.02] rounded">{name}</div>
                ))}
              </div>
            ) : (
              <div className="text-zinc-600 text-sm">No preview available</div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  );
}

// ── Session Entry ───────────────────────────────────────────────

/**
 * Shows a pulsing indicator when the agent appears to be thinking/processing.
 * Visible when the last entry is a tool_call (awaiting result), an assistant
 * thinking part, or a tool_result (agent is formulating next response).
 */
function ThinkingIndicator({ entries, taskId }) {
  const { results } = useDashboard();
  const taskStatus = results[taskId]?.status;

  if (!taskId || entries.length === 0 || taskStatus !== 'running') return null;

  const last = entries[entries.length - 1];
  const isThinking =
    // Last entry is a tool call — waiting for result
    (last.kind === 'assistant_message' && last.parts?.some(p => p.type === 'tool_call')) ||
    // Last entry is a tool result — agent is processing
    last.kind === 'tool_result';

  if (!isThinking) return null;

  return (
    <div className="flex gap-3 items-start animate-pulse">
      <div className="font-mono text-[11px] text-purple-400/60 shrink-0 pt-0.5 w-14">thinking</div>
      <div className="flex-1 min-w-0 border-l-2 border-purple-400/40 pl-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-[pulse_1.5s_ease-in-out_infinite]" />
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400/40 animate-[pulse_1.5s_ease-in-out_0.3s_infinite]" />
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400/20 animate-[pulse_1.5s_ease-in-out_0.6s_infinite]" />
          <span className="font-mono text-[10px] text-zinc-600 ml-1">
            {last.kind === 'tool_result' ? 'Processing result...' : 'Executing...'}
          </span>
        </div>
      </div>
    </div>
  );
}

function ThinkingBlock({ part }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = part.fullText && part.fullText.length > part.text.length;

  return (
    <div className="border-l-2 border-purple-400/30 pl-3">
      <button
        onClick={() => hasMore && setExpanded(!expanded)}
        className={`flex items-center gap-2 font-mono text-[11px] text-purple-400/60 transition-colors ${hasMore ? 'hover:text-purple-400 cursor-pointer' : 'cursor-default'}`}
      >
        {hasMore && <span className="text-[9px]">{expanded ? '\u25bc' : '\u25b6'}</span>}
        <span className="italic">{expanded ? '' : part.text}{!expanded && hasMore ? '...' : ''}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 bg-[#0a0a14] border border-purple-400/10 rounded-lg px-3 py-2 max-h-[300px] overflow-y-auto">
          <pre className="font-mono text-[11px] text-zinc-400 italic leading-snug whitespace-pre-wrap break-words">
            {part.fullText}
          </pre>
        </div>
      )}
    </div>
  );
}

function SessionEntry({ entry }) {
  const [collapsed, setCollapsed] = useState(true);

  switch (entry.kind) {
    case 'user_message':
      return (
        <div className="flex gap-3 items-start">
          <div className="font-mono text-[11px] text-zinc-500 shrink-0 pt-0.5 w-14">user</div>
          <div className="flex-1 min-w-0 bg-white/[0.02] border border-border rounded-xl px-4 py-3">
            <ReactMarkdown components={mdComponents}>{entry.text}</ReactMarkdown>
            {entry.timestamp && (
              <div className="font-mono text-[8px] text-zinc-600 mt-2">{new Date(entry.timestamp).toLocaleTimeString('en-GB')}</div>
            )}
          </div>
        </div>
      );

    case 'assistant_message':
      return (
        <div className="flex gap-3 items-start">
          <div className="font-mono text-[11px] text-purple-400 shrink-0 pt-0.5 w-14">assistant</div>
          <div className="flex-1 min-w-0 space-y-2">
            {entry.parts.map((part, i) => {
              if (part.type === 'text') {
                return (
                  <div key={i} className="bg-elevated border border-border rounded-xl px-4 py-3">
                    <ReactMarkdown components={mdComponents}>{part.text}</ReactMarkdown>
                    {i === entry.parts.length - 1 && entry.timestamp && (
                      <div className="font-mono text-[8px] text-zinc-600 mt-2">{new Date(entry.timestamp).toLocaleTimeString('en-GB')}</div>
                    )}
                  </div>
                );
              }
              if (part.type === 'thinking') {
                return <ThinkingBlock key={i} part={part} />;
              }
              if (part.type === 'tool_call') {
                return (
                  <div key={i} className="flex items-center gap-2 bg-amber-400/5 border border-amber-400/15 rounded-lg px-3 py-2">
                    <span className="text-amber-400 text-xs font-mono">{'\u2192'}</span>
                    <span className="font-mono text-[12px] text-amber-300 font-medium">{part.name}</span>
                    {part.inputPreview && <span className="font-mono text-[11px] text-zinc-500 truncate flex-1">{part.inputPreview}</span>}
                    {entry.timestamp && (
                      <span className="font-mono text-[8px] text-zinc-600 ml-auto shrink-0">{new Date(entry.timestamp).toLocaleTimeString('en-GB')}</span>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      );

    case 'tool_result':
      return (
        <div className="flex gap-3 items-start">
          <div className="font-mono text-[11px] text-zinc-600 shrink-0 pt-0.5 w-14">tool</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center gap-2 font-mono text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <span className="text-[9px]">{collapsed ? '\u25b6' : '\u25bc'}</span>
                <span className="uppercase text-[10px]">{entry.toolName || 'result'}</span>
                {collapsed && entry.text && <span className="text-zinc-600 truncate max-w-[400px]">{entry.text.split('\n')[0]}</span>}
              </button>
              {entry.timestamp && (
                <span className="font-mono text-[8px] text-zinc-600 ml-auto shrink-0">{new Date(entry.timestamp).toLocaleTimeString('en-GB')}</span>
              )}
            </div>
            {!collapsed && (
              <div className="mt-1.5 bg-[#0a0a14] border border-border rounded-lg px-3 py-2 max-h-[200px] overflow-y-auto">
                <pre className="font-mono text-[11px] text-zinc-400 leading-snug whitespace-pre-wrap break-words">
                  {entry.text}
                  {entry.truncated && <span className="text-zinc-600"> ... (truncated)</span>}
                </pre>
              </div>
            )}
          </div>
        </div>
      );

    case 'model_change':
    case 'model_snapshot':
      return (
        <div className="flex items-center gap-2 py-1">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[9px] text-zinc-600">{entry.provider}/{entry.modelId}</span>
          {entry.timestamp && (
            <span className="font-mono text-[8px] text-zinc-700">{new Date(entry.timestamp).toLocaleTimeString('en-GB')}</span>
          )}
          <div className="h-px flex-1 bg-border" />
        </div>
      );

    case 'session':
      return null;

    case 'session_change':
      return (
        <div className="flex items-center gap-2 py-2 my-1">
          <div className="h-px flex-1 bg-amber-400/30" />
          <span className="font-mono text-[9px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
            Session changed: {entry.newSessionId?.slice(0, 12)}...
          </span>
          {entry.timestamp && (
            <span className="font-mono text-[8px] text-zinc-600">{new Date(entry.timestamp).toLocaleTimeString('en-GB')}</span>
          )}
          <div className="h-px flex-1 bg-amber-400/30" />
        </div>
      );

    default:
      return null;
  }
}

// ── Task Results Tab ────────────────────────────────────────────

/** Collapsible app log snippet for a finding */
function FindingLogSnippet({ taskId, findingId }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState(null); // null=not loaded, ''=no data
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (log !== null) { setOpen(o => !o); return; }
    setLoading(true);
    setOpen(true);
    const safeFinding = (findingId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    fetch(`/api/log-snapshot?taskId=${encodeURIComponent(taskId)}&findingId=${encodeURIComponent(safeFinding)}`)
      .then(r => r.json())
      .then(d => setLog(d.snapshot || ''))
      .catch(() => setLog(''))
      .finally(() => setLoading(false));
  }, [taskId, findingId, log]);

  return (
    <div className="mt-1.5">
      <button
        onClick={load}
        className="font-mono text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>{'\u25b6'}</span>
        App Logs
      </button>
      {open && (
        <div className="mt-1 bg-[#0a0a14] border border-border rounded-md overflow-hidden">
          {loading ? (
            <div className="px-3 py-2 font-mono text-[10px] text-zinc-600 animate-pulse">Loading...</div>
          ) : log ? (
            <pre className="px-3 py-2 font-mono text-[10px] text-zinc-400 leading-[1.6] overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">{log}</pre>
          ) : (
            <div className="px-3 py-2 font-mono text-[10px] text-zinc-600">No app logs captured for this finding</div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskResultsList({ tasks, results, addLog }) {
  const [copiedId, setCopiedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [resolvedFindings, setResolvedFindings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('openclaw-resolved-findings') || '{}'); } catch { return {}; }
  });
  const [playingTaskId, setPlayingTaskId] = useState(null);
  const [playingFindingId, setPlayingFindingId] = useState(null);
  const [recordingAvail, setRecordingAvail] = useState({});

  // Check recording existence when a task is expanded
  useEffect(() => {
    if (!expandedId || recordingAvail[expandedId] !== undefined) return;
    fetch(`/api/recording?action=exists&taskId=${encodeURIComponent(expandedId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setRecordingAvail(prev => ({ ...prev, [expandedId]: data.exists }));
      })
      .catch(() => {});
  }, [expandedId, recordingAvail]);

  const toggleResolved = (findingKey) => {
    setResolvedFindings(prev => {
      const next = { ...prev };
      if (next[findingKey]) delete next[findingKey];
      else next[findingKey] = Date.now();
      localStorage.setItem('openclaw-resolved-findings', JSON.stringify(next));
      return next;
    });
  };

  const copyOutput = async (taskId) => {
    try {
      const r = await fetch(`/api/report-md?agentId=${encodeURIComponent(taskId)}`);
      const data = await r.json();
      const text = data?.ok ? data.content : `No report for ${taskId}`;
      await navigator.clipboard.writeText(text);
      setCopiedId(taskId);
      setTimeout(() => setCopiedId(null), 2000);
      addLog('SYSTEM', `Copied output for ${taskId}`, 'success');
    } catch (e) {
      addLog('SYSTEM', `Copy failed: ${e.message}`, 'error');
    }
  };

  const copyResultPrompt = async (taskId, task) => {
    try {
      const d = results[taskId] || {};
      const reportRes = await fetch(`/api/report-md?agentId=${encodeURIComponent(taskId)}`);
      const reportData = await reportRes.json();
      const reportContent = reportData?.ok ? reportData.content : '';

      const allFindings = (d.findings || []).filter(f => {
        if (isSystemFinding(f)) return false;
        const sev = (f.severity || f.type || '').toLowerCase();
        return sev !== 'info' && sev !== 'pass';
      });
      const findings = allFindings.filter((f, i) => !resolvedFindings[`${taskId}::${f.id || i}`]);
      const findingsText = findings.map((f, i) => {
        const sev = f.severity || f.type || 'info';
        const viewport = inferFindingViewport(f);
        const mod = f.module ? ` [${f.module}]` : '';
        const viewportText = viewport !== 'shared' ? ` [${viewportLabel(viewport)}]` : '';
        const page = f.page ? ` — ${f.page}` : '';
        return `${i + 1}. [${sev.toUpperCase()}]${mod}${viewportText} ${f.title || f.description || f.id}${page}${f.steps ? '\n   Steps: ' + f.steps : ''}${f.expected ? '\n   Expected: ' + f.expected : ''}${f.actual ? '\n   Actual: ' + f.actual : ''}`;
      }).join('\n');

      const prompt = [
        `# QA Results for ${taskId}: ${task.title}`,
        '',
        `**Status:** ${d.status || 'unknown'}`,
        `**Passed:** ${typeof d.passed === 'number' ? d.passed : Array.isArray(d.passed) ? d.passed.length : 0}`,
        `**Failed:** ${typeof d.failed === 'number' ? d.failed : Array.isArray(d.failed) ? d.failed.length : 0}`,
        `**Warnings:** ${typeof d.warnings === 'number' ? d.warnings : Array.isArray(d.warnings) ? d.warnings.length : 0}`,
        '',
        findings.length > 0 ? `## Findings\n${findingsText}` : '',
        '',
        reportContent ? `## Full Report\n${reportContent}` : '',
        '',
        '---',
        'Please review these QA findings and fix the issues. Start with the highest severity bugs first.',
      ].filter(Boolean).join('\n');

      await navigator.clipboard.writeText(prompt);
      setCopiedId(`prompt-${taskId}`);
      setTimeout(() => setCopiedId(null), 2000);
      addLog('SYSTEM', `Copied result prompt for ${taskId}`, 'success');
    } catch (e) {
      addLog('SYSTEM', `Copy failed: ${e.message}`, 'error');
    }
  };

  const countVal = (v) => typeof v === 'number' ? v : Array.isArray(v) ? v.length : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      {tasks.map(t => {
        const d = results[t.id] || {};
        const s = normalizeStatus(d);
        const allFindings = d.findings || [];
        const findings = allFindings.filter(f => {
          if (isSystemFinding(f)) return false;
          const sev = (f.severity || f.type || '').toLowerCase();
          return sev !== 'info' && sev !== 'pass';
        });
        const systemFindings = allFindings.filter(f => isSystemFinding(f));
        const groupedFindings = groupFindingsByViewport(findings);
        const isExpanded = expandedId === t.id;

        return (
          <div key={t.id} className="border-b border-border">
            <div
              className="px-4 py-3 hover:bg-white/[0.01] transition-colors cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : t.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-[9px] text-zinc-500">{isExpanded ? '\u25bc' : '\u25b6'}</span>
                <span className="text-base">{t.icon}</span>
                <div className="flex-1">
                  <div className="text-xs font-medium text-zinc-200">S{t.num}: {t.title}</div>
                  <div className="text-[9px] text-zinc-500">{t.actor}</div>
                </div>
                <span className={`font-mono text-[9px] uppercase px-2 py-0.5 rounded ${
                  s === 'passed' ? 'bg-green-400/10 text-green-400' :
                  s === 'failed' ? 'bg-red-400/10 text-red-400' :
                  s === 'running' ? 'bg-amber-400/10 text-amber-400' :
                  'bg-zinc-800 text-zinc-500'
                }`}>{s}</span>
              </div>

              {(d.passed || d.failed || d.warnings) ? (
                <div className="flex gap-3 mt-1.5 ml-9 font-mono text-[10px]">
                  <span className="text-green-400">{'\u2713'}{countVal(d.passed)}</span>
                  <span className="text-red-400">{'\u2717'}{countVal(d.failed)}</span>
                  <span className="text-amber-400">{'\u26a0'}{countVal(d.warnings)}</span>
                  {findings.length > 0 && (() => {
                    const resolvedCount = findings.filter((f, i) => resolvedFindings[`${t.id}::${f.id || i}`]).length;
                    return <span className="text-zinc-500">
                      {findings.length} finding{findings.length !== 1 ? 's' : ''}
                      {resolvedCount > 0 && <span className="text-green-400/60"> ({resolvedCount} resolved)</span>}
                    </span>;
                  })()}
                </div>
              ) : null}

              {s === 'running' && d.progress > 0 && (
                <div className="mt-1.5 ml-9">
                  <div className="h-1 bg-border rounded-full overflow-hidden w-40">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${d.progress}%` }} />
                  </div>
                </div>
              )}
            </div>

            {isExpanded && (
              <div className="px-4 pb-3 ml-9 space-y-2">
                {/* Action buttons */}
                <div className="flex gap-2">
                  {(s === 'passed' || s === 'failed') && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyOutput(t.id); }}
                        className="font-mono text-[10px] text-zinc-400 hover:text-accent transition-colors bg-white/[0.03] border border-border rounded px-2.5 py-1"
                      >
                        {copiedId === t.id ? '\u2713 Copied' : '\u29c9 Copy Report'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyResultPrompt(t.id, t); }}
                        className="font-mono text-[10px] text-zinc-400 hover:text-purple-400 transition-colors bg-purple-400/5 border border-purple-400/15 rounded px-2.5 py-1"
                      >
                        {copiedId === `prompt-${t.id}` ? '\u2713 Copied' : '\u2728 Copy Fix Prompt'}
                      </button>
                    </>
                  )}
                  {recordingAvail[t.id] && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPlayingTaskId(t.id); setPlayingFindingId(null); }}
                      className="font-mono text-[10px] text-zinc-400 hover:text-blue-400 transition-colors bg-blue-400/5 border border-blue-400/15 rounded px-2.5 py-1"
                    >
                      {'\u25b6'} Watch Recording
                    </button>
                  )}
                </div>

                {/* Inline recording player */}
                {playingTaskId === t.id ? (
                  <div className="border border-border rounded-lg overflow-hidden h-[400px] flex flex-col">
                    <RecordingPlayer
                      taskId={t.id}
                      jumpToFindingId={playingFindingId}
                      onClose={() => { setPlayingTaskId(null); setPlayingFindingId(null); }}
                    />
                  </div>
                ) : (
                  <>
                    {/* Summary info */}
                    {d.startedAt && (
                      <div className="font-mono text-[10px] text-zinc-500">
                        Started: {new Date(d.startedAt).toLocaleString('en-GB')}
                        {d.finishedAt && <> &middot; Finished: {new Date(d.finishedAt).toLocaleString('en-GB')}</>}
                      </div>
                    )}

                    {d.lastLog && (
                      <div className="font-mono text-[10px] text-zinc-500 italic">{d.lastLog}</div>
                    )}

                    {/* Findings list */}
                    {findings.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-mono text-[10px] text-zinc-400 font-medium">Findings:</div>
                        {['desktop', 'mobile', 'shared'].map((bucket) => {
                          const bucketFindings = groupedFindings[bucket];
                          if (!bucketFindings || bucketFindings.length === 0) return null;

                          return (
                            <div key={bucket} className="space-y-1.5">
                              <div className="flex items-center gap-2 pt-1">
                                <span className={`h-2 w-2 rounded-full ${
                                  bucket === 'mobile' ? 'bg-amber-300' : bucket === 'desktop' ? 'bg-blue-400' : 'bg-zinc-500'
                                }`} />
                                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[1px]">
                                  {viewportLabel(bucket)} ({bucketFindings.length})
                                </span>
                              </div>
                              {bucketFindings.map((f, i) => {
                                const findingKey = `${t.id}::${f.id || `${bucket}-${i}`}`;
                                const isResolved = !!resolvedFindings[findingKey];
                                const sev = (f.severity || f.type || 'info').toUpperCase();
                                const sevColor = isResolved ? 'text-zinc-600' :
                                  sev === 'BUG' || sev === 'P1' || sev === 'P2' ? 'text-red-400' :
                                  sev === 'WARNING' || sev === 'P3' ? 'text-amber-400' :
                                  sev === 'PASS' ? 'text-green-400' : 'text-zinc-400';
                                return (
                                  <div key={f.id || `${bucket}-${i}`} className={`border border-border rounded-lg px-3 py-2 ${isResolved ? 'bg-white/[0.01] opacity-50' : 'bg-white/[0.02]'}`}>
                                    <div className="flex items-start gap-2">
                                      <span className={`font-mono text-[9px] font-bold ${sevColor} shrink-0 mt-0.5`}>[{sev}]</span>
                                      <div className="flex-1 min-w-0">
                                        <div className={`text-[11px] font-medium ${isResolved ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{f.id ? `${f.id}: ` : ''}{f.title || f.description}</div>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                          <span className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${
                                            bucket === 'mobile'
                                              ? 'bg-amber-400/10 text-amber-300'
                                              : bucket === 'desktop'
                                                ? 'bg-blue-400/10 text-blue-300'
                                                : 'bg-zinc-800 text-zinc-500'
                                          }`}>
                                            {viewportLabel(bucket)}
                                          </span>
                                          {f.module && <span className="font-mono text-[9px] text-zinc-500">Module: {f.module}{f.page ? ` \u2014 ${f.page}` : ''}</span>}
                                        </div>
                                        {!isResolved && f.description && f.title && <div className="text-[10px] text-zinc-400 mt-1">{f.description}</div>}
                                        {!isResolved && f.steps && <div className="text-[10px] text-zinc-500 mt-0.5">Steps: {f.steps}</div>}
                                        {!isResolved && f.expected && <div className="text-[10px] text-zinc-500 mt-0.5">Expected: {f.expected}</div>}
                                        {!isResolved && f.actual && <div className="text-[10px] text-zinc-500 mt-0.5">Actual: {f.actual}</div>}
                                        {!isResolved && f.id && <FindingLogSnippet taskId={t.id} findingId={f.id} />}
                                      </div>
                                      {recordingAvail[t.id] && f.id && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setPlayingTaskId(t.id); setPlayingFindingId(f.id); }}
                                          className="shrink-0 font-mono text-[9px] text-blue-400/60 hover:text-blue-400 transition-colors px-1 py-0.5"
                                          title="Watch recording at this finding"
                                        >
                                          {'\u25b6'}
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); toggleResolved(findingKey); }}
                                        className={`shrink-0 font-mono text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                                          isResolved
                                            ? 'text-green-400 bg-green-400/10 hover:bg-green-400/20'
                                            : 'text-zinc-500 hover:text-zinc-300 bg-white/[0.03] hover:bg-white/[0.06]'
                                        }`}
                                        title={isResolved ? 'Mark as unresolved' : 'Mark as resolved'}
                                      >
                                        {isResolved ? '\u2713 Resolved' : 'Resolve'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* System findings (not real bugs) */}
                    {systemFindings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {systemFindings.map((f, i) => (
                          <div key={`sys-${i}`} className="font-mono text-[9px] text-zinc-600 italic px-2 py-1 bg-white/[0.01] rounded">
                            {f.title || f.description}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Raw result JSON toggle */}
                    <ResultJsonToggle data={d} />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Recordings Tab ──────────────────────────────────────────────

function RecordingsTab({ onLoadingChange }) {
  const [recordings, setRecordings] = useState({ active: [], saved: [] });
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/recording?action=list')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setRecordings({ active: data.active || [], saved: data.saved || [] });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  useEffect(() => {
    onLoadingChangeRef.current?.(loading && !selectedTaskId);
  }, [loading, selectedTaskId]);

  // Refresh when coming back from player
  useEffect(() => {
    if (selectedTaskId) return;
    fetch('/api/recording?action=list')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setRecordings({ active: data.active || [], saved: data.saved || [] });
      })
      .catch(() => {});
  }, [selectedTaskId]);

  if (selectedTaskId) {
    return <RecordingPlayer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />;
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">Loading recordings...</div>;
  }

  const all = [
    ...recordings.active.map(r => ({ ...r, isActive: true })),
    ...recordings.saved.filter(r => !r.active).map(r => ({ ...r, isActive: false })),
  ];

  if (all.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <div className="text-zinc-600 text-sm">No recordings yet</div>
        <div className="font-mono text-[10px] text-zinc-700 text-center leading-relaxed max-w-sm">
          Recordings are captured automatically when tasks run.
          Each run records the agent&apos;s browser with a timeline of events and findings.
        </div>
      </div>
    );
  }

  const formatDuration = (ms) => {
    if (!ms) return '--';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {all.map(r => (
        <button
          key={r.taskId}
          onClick={() => setSelectedTaskId(r.taskId)}
          className="w-full text-left px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            {r.isActive && <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-zinc-200 font-mono">{r.taskId}</div>
              <div className="text-[9px] text-zinc-500 mt-0.5">
                {r.startedAt ? new Date(r.startedAt).toLocaleString('en-GB') : '--'}
                {' \u00b7 '}
                {formatDuration(r.durationMs)}
                {' \u00b7 '}
                {r.frameCount} frames
              </div>
            </div>
            {r.findingCount > 0 && (
              <span className="font-mono text-[9px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                {r.findingCount} finding{r.findingCount !== 1 ? 's' : ''}
              </span>
            )}
            {r.isActive ? (
              <span className="font-mono text-[9px] text-red-400">Recording...</span>
            ) : (
              <span className="font-mono text-[9px] text-zinc-600">{'\u25b6'}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function ResultJsonToggle({ data }) {
  const [show, setShow] = useState(false);
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div>
      <button
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
        className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        {show ? '\u25bc Raw JSON' : '\u25b6 Raw JSON'}
      </button>
      {show && (
        <pre className="mt-1 bg-[#0a0a14] border border-border rounded-lg px-3 py-2 font-mono text-[10px] text-zinc-500 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
