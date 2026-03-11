'use client';

import { useState } from 'react';
import { useDashboard } from '@/context/dashboard-context';
import { useProjectConfig } from '@/context/project-config-context';
import { normalizeStatus } from '@/lib/normalize-status';
import PipelineEditor from './pipeline-editor';

const SEG = { idle: 'bg-border', running: 'bg-amber-400', passed: 'bg-green-400', failed: 'bg-red-400' };

export default function PipelineBar() {
  const {
    results, allPipelines, customPipelines, activePipeline,
    runPipeline, stopPipeline, cleanAllTasks, deletePipeline,
  } = useDashboard();
  const { tasks: TASKS } = useProjectConfig();

  const [selectedId, setSelectedId] = useState(allPipelines[0]?.id);
  const [showEditor, setShowEditor] = useState(false);
  const [editPipeline, setEditPipeline] = useState(null);

  const effectiveId = allPipelines.some(p => p.id === selectedId) ? selectedId : allPipelines[0]?.id;
  const selected = allPipelines.find(p => p.id === effectiveId);
  const tasks = selected ? selected.taskIds.map(id => TASKS.find(t => t.id === id)).filter(Boolean) : [];
  const isCustom = customPipelines.some(p => p.id === effectiveId);
  const isActive = activePipeline.pipelineId != null;
  const completed = tasks.filter(t => {
    const s = normalizeStatus(results[t.id]);
    return s === 'passed' || s === 'failed';
  }).length;

  if (allPipelines.length === 0) return null;

  return (
    <>
      <div className="section-title">Pipeline</div>
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <select
              value={effectiveId || ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="btn normal-case tracking-normal py-2 px-2.5"
            >
              {allPipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
              {completed}/{tasks.length} complete
            </span>
          </div>
          <div className="flex gap-2">
            <button className="btn-mini" onClick={() => { setEditPipeline(null); setShowEditor(true); }}>+ New</button>
            {isCustom && (
              <>
                <button className="btn-mini" onClick={() => { setEditPipeline(selected); setShowEditor(true); }}>
                  {'\u270e'} Edit
                </button>
                <button
                  className="btn-mini border-red-400/35 text-red-400"
                  onClick={() => { deletePipeline(effectiveId); setSelectedId(allPipelines[0]?.id); }}
                >
                  {'\u2715'} Delete
                </button>
              </>
            )}
            {!isActive
              ? <button className="btn-mini" onClick={() => runPipeline(effectiveId)}>{'\u25b6'} Run Pipeline</button>
              : <button className="btn-mini border-red-400/35 text-red-400" onClick={stopPipeline}>{'\u23f9'} Stop</button>
            }
            <button className="btn-mini" onClick={cleanAllTasks}>{'\ud83e\uddf9'} Clean All</button>
          </div>
        </div>

        {/* Progress track */}
        <div className="flex gap-1 mb-1">
          {tasks.map(t => {
            const s = normalizeStatus(results[t.id]);
            return (
              <div
                key={t.id}
                className={`flex-1 h-1.5 rounded-sm ${SEG[s] || SEG.idle} transition-colors duration-300 relative`}
                title={`S${t.num}: ${t.title} (${s})`}
              >
                {s === 'running' && <div className="absolute inset-0 rounded-sm bg-amber-400 animate-pulse" />}
              </div>
            );
          })}
        </div>
      </div>
      {showEditor && <PipelineEditor pipeline={editPipeline} onClose={() => setShowEditor(false)} />}
    </>
  );
}
