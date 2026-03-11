'use client';

import { useState, useRef, useCallback } from 'react';
import { useBridgeStream, useBridgePolling } from '@/hooks/use-bridge-stream';

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}

export default function BridgePanel() {
  const [status, setStatus] = useState('Connecting...');
  const [hasSSE] = useState(() => typeof EventSource !== 'undefined');
  const preRef = useRef(null);

  const handleChunk = useCallback((text) => {
    const el = preRef.current;
    if (!el || !text) return;
    const wasNearBottom = isNearBottom(el);
    el.textContent += text;
    if (el.textContent.length > 120000) {
      el.textContent = el.textContent.slice(-90000);
    }
    if (wasNearBottom) el.scrollTop = el.scrollHeight;
  }, []);

  const handleStatus = useCallback((s) => {
    if (s === 'live') setStatus(`Live stream · ${new Date().toLocaleTimeString('en-GB')}`);
    else if (s === 'offline') setStatus('Bridge offline');
    else if (s.startsWith('reconnecting')) setStatus(`Bridge reconnecting... (${s.split('-')[1]}/${8})`);
    else setStatus(`Bridge ${s}`);
  }, []);

  useBridgeStream({ onChunk: hasSSE ? handleChunk : undefined, onStatusChange: hasSSE ? handleStatus : undefined });
  useBridgePolling({ onChunk: handleChunk, onStatusChange: handleStatus, enabled: !hasSSE });

  const clear = () => { if (preRef.current) preRef.current.textContent = ''; };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>🧵</span> Controller Bridge (real-time)
        </h3>
        <div className="flex gap-2 items-center">
          <span className="font-mono text-[10px] text-zinc-500">{status}</span>
          <button onClick={clear} className="btn-mini">Clear</button>
        </div>
      </div>
      <pre
        ref={preRef}
        className="m-0 p-3 max-h-[220px] overflow-auto bg-[#0f0f16] text-zinc-400 border-t border-border font-mono text-[11px] leading-snug whitespace-pre-wrap"
      />
    </div>
  );
}
