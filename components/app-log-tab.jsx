'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppLog } from '@/hooks/use-app-log';

const ERROR_PATTERNS = /error|Error|ERR!|ECONNREFUSED|ENOTFOUND|EACCES|EADDRINUSE|TypeError|ReferenceError|SyntaxError|failed|FATAL|panic|Unhandled/;
const WARN_PATTERNS = /warn|Warning|WARN|deprecated|⚠/;
const SUCCESS_PATTERNS = /ready|Ready|compiled|started|listening|✓|✔/;

function classifyLine(line) {
  if (ERROR_PATTERNS.test(line)) return 'error';
  if (WARN_PATTERNS.test(line)) return 'warn';
  if (SUCCESS_PATTERNS.test(line)) return 'success';
  return 'normal';
}

export default function AppLogTab({ onLoadingChange }) {
  const { lines, status, healthy, serverInfo, loading, truncated, loadingEarlier, loadEarlier, clearLog, sendAction } = useAppLog();
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('all'); // all | errors | warnings
  const [copied, setCopied] = useState(false);

  const copyLogs = useCallback(() => {
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [lines]);

  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  useEffect(() => {
    onLoadingChangeRef.current?.(loading);
  }, [loading]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
  };

  const filteredLines = lines.filter(line => {
    if (filter === 'all') return true;
    const cls = classifyLine(line);
    if (filter === 'errors') return cls === 'error';
    if (filter === 'warnings') return cls === 'error' || cls === 'warn';
    return true;
  });

  const errorCount = lines.filter(l => classifyLine(l) === 'error').length;
  const warnCount = lines.filter(l => classifyLine(l) === 'warn').length;

  const statusColor =
    status === 'running' ? 'bg-green-400' :
    status === 'starting' ? 'bg-amber-400 animate-pulse' :
    status === 'errored' ? 'bg-red-400' :
    'bg-zinc-600';

  const statusLabel =
    status === 'running' ? 'Running' :
    status === 'starting' ? 'Starting...' :
    status === 'errored' ? 'Error' :
    'Stopped';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card/20 flex items-center gap-2 shrink-0">
        {/* Status indicator */}
        <span className={`w-2 h-2 rounded-full ${statusColor} shrink-0`} />
        <span className="font-mono text-[10px] text-zinc-400 mr-1">
          {serverInfo?.name || 'App'}: {statusLabel}
        </span>

        {serverInfo?.port && status === 'running' && (
          <span className="font-mono text-[9px] text-zinc-600">:{serverInfo.port}</span>
        )}

        {serverInfo?.pid && (
          <span className="font-mono text-[9px] text-zinc-600">pid:{serverInfo.pid}</span>
        )}

        <div className="flex-1" />

        {/* Error/warning counts */}
        {errorCount > 0 && (
          <button
            onClick={() => setFilter(filter === 'errors' ? 'all' : 'errors')}
            className={`font-mono text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              filter === 'errors' ? 'bg-red-400/20 text-red-400' : 'text-red-400/70 hover:text-red-400'
            }`}
          >
            {errorCount} error{errorCount !== 1 ? 's' : ''}
          </button>
        )}
        {warnCount > 0 && (
          <button
            onClick={() => setFilter(filter === 'warnings' ? 'all' : 'warnings')}
            className={`font-mono text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              filter === 'warnings' ? 'bg-amber-400/20 text-amber-400' : 'text-amber-400/70 hover:text-amber-400'
            }`}
          >
            {warnCount} warn{warnCount !== 1 ? 's' : ''}
          </button>
        )}

        {/* Actions */}
        {(status === 'stopped' || status === 'errored') && (
          <button
            onClick={() => sendAction('start')}
            className="font-mono text-[9px] text-green-400 hover:text-green-300 bg-green-400/10 hover:bg-green-400/15 px-2 py-1 rounded transition-colors"
          >
            Start
          </button>
        )}
        {(status === 'running' || status === 'starting') && (
          <>
            <button
              onClick={() => sendAction('restart')}
              className="font-mono text-[9px] text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/15 px-2 py-1 rounded transition-colors"
            >
              Restart
            </button>
            <button
              onClick={() => sendAction('stop')}
              className="font-mono text-[9px] text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/15 px-2 py-1 rounded transition-colors"
            >
              Stop
            </button>
          </>
        )}

        <button
          onClick={copyLogs}
          className={`font-mono text-[9px] transition-colors ${
            copied ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>

        <button
          onClick={clearLog}
          className="font-mono text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Health banner */}
      {healthy === false && (
        <div className="px-3 py-2 bg-red-400/10 border-b border-red-400/20 flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="font-mono text-[11px] text-red-400">
            {serverInfo?.name || 'App'} is unreachable on port {serverInfo?.port || '?'} — pipelines and escalation are paused
          </span>
        </div>
      )}

      {/* Log output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-[1.7] bg-[#0a0a12]"
      >
        {truncated && (
          <div className="text-center pb-3">
            <button
              onClick={loadEarlier}
              disabled={loadingEarlier}
              className="font-mono text-[10px] text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
            >
              {loadingEarlier ? 'Loading older logs...' : '\u2191 Load earlier logs'}
            </button>
          </div>
        )}

        {loading && lines.length === 0 && (
          <div className="text-center py-12 text-zinc-600 text-sm">
            Loading app log...
          </div>
        )}

        {!loading && filteredLines.length === 0 && (
          <div className="text-center py-12 text-zinc-600 text-sm">
            {status === 'stopped' ? (
              <div>
                <div className="mb-2">App server not running</div>
                <button
                  onClick={() => sendAction('start')}
                  className="text-accent hover:text-accent/80 text-xs transition-colors"
                >
                  Start {serverInfo?.name || 'app'}
                </button>
              </div>
            ) : (
              'Waiting for output...'
            )}
          </div>
        )}

        {filteredLines.map((line, i) => {
          const cls = classifyLine(line);
          const color =
            cls === 'error' ? 'text-red-400 bg-red-400/5' :
            cls === 'warn' ? 'text-amber-400' :
            cls === 'success' ? 'text-green-400' :
            'text-zinc-400';

          return (
            <div key={i} className={`px-2 py-0.5 rounded hover:bg-white/[0.02] whitespace-pre-wrap break-all ${color}`}>
              {line}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Scroll indicator */}
      {!autoScroll && lines.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-16 right-6 bg-accent/90 text-white text-[10px] font-mono px-3 py-1.5 rounded-full shadow-lg hover:bg-accent transition-colors"
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
