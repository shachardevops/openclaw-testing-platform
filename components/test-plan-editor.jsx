'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/context/dashboard-context';
import { useProjectConfig } from '@/context/project-config-context';

export default function TestPlanEditor() {
  const { addLog } = useDashboard();
  const { tasks: TASKS } = useProjectConfig();
  const [taskId, setTaskId] = useState(TASKS[0]?.id || '');
  const [content, setContent] = useState('');
  const [planPath, setPlanPath] = useState('Path: \u2014');

  const load = async (id) => {
    const target = id || taskId;
    if (!target) return;
    try {
      const r = await fetch(`/api/test-plan?agentId=${encodeURIComponent(target)}`);
      const d = await r.json();
      if (!d.ok) { addLog('SYSTEM', `Load failed: ${d.error}`, 'error'); return; }
      setPlanPath(`Path: ${d.path}`);
      setContent(d.content || '');
    } catch (e) {
      addLog('SYSTEM', `Load error: ${e.message}`, 'error');
    }
  };

  const save = async () => {
    if (!taskId) return;
    try {
      const r = await fetch(`/api/test-plan?agentId=${encodeURIComponent(taskId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const d = await r.json();
      if (d.ok) { setPlanPath(`Path: ${d.path}`); addLog('SYSTEM', `Saved plan for ${taskId}`, 'success'); }
      else addLog('SYSTEM', `Save failed: ${d.error}`, 'error');
    } catch (e) {
      addLog('SYSTEM', `Save error: ${e.message}`, 'error');
    }
  };

  useEffect(() => { load(TASKS[0]?.id); }, []);

  return (
    <>
      <div className="section-title">Test Plan Editor</div>
      <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">{'\ud83d\udcdd'} Edit test markdown</h3>
          <div className="flex gap-2 items-center">
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="btn normal-case tracking-normal py-2 px-2.5">
              {TASKS.map(t => <option key={t.id} value={t.id}>S{t.num}: {t.title}</option>)}
            </select>
            <button className="btn" onClick={() => load()}>Load</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </div>
        </div>
        <div className="p-3">
          <div className="font-mono text-[11px] text-zinc-500 mb-2">{planPath}</div>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} className="w-full min-h-[220px] bg-[#0f0f16] text-zinc-200 border border-border rounded-lg p-2.5 font-mono text-xs leading-relaxed resize-y" />
        </div>
      </div>
    </>
  );
}
