'use client';

import React, { useState, useMemo } from 'react';
import { useDashboard } from '@/context/dashboard-context';
import { useProjectConfig } from '@/context/project-config-context';
import { normalizeStatus } from '@/lib/normalize-status';

interface Task {
  id: string;
  num: number;
  title: string;
  icon: string;
  actor: string;
  desc: string;
  defaultModel?: string;
  deps?: string[];
}

interface Model {
  id: string;
  short: string;
}

interface Skill {
  id: string;
  name: string;
  icon: string;
  description?: string;
}

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-zinc-600',
  queueing: 'bg-amber-400 animate-pulse',
  running: 'bg-amber-400 animate-pulse',
  passed: 'bg-green-400',
  failed: 'bg-red-400',
};

export default function PipelineBuilder() {
  const {
    results, pendingRuns, activePipeline,
    runTask, cancelTask,
    runInlinePipeline, stopPipeline,
    cleanAllTasks,
    getTaskModel, setTaskModel,
    getTaskSkills, attachSkill, detachSkill,
  } = useDashboard();
  const { tasks: TASKS, models: MODELS, skills: SKILLS, project } = useProjectConfig();

  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(() => new Set(TASKS.map((t: Task) => t.id)));
  const [globalModel, setGlobalModel] = useState(
    () => MODELS.find((m: Model) => /sonnet/i.test(m.short))?.id || MODELS[0]?.id || ''
  );
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());

  // TASKS loads async — default to all selected once available
  const taskIdsKey = TASKS.map((t: Task) => t.id).join(',');
  const [prevTaskIdsKey, setPrevTaskIdsKey] = useState(taskIdsKey);
  if (taskIdsKey !== prevTaskIdsKey) {
    setPrevTaskIdsKey(taskIdsKey);
    if (selectedTasks.size === 0 && TASKS.length > 0) {
      setSelectedTasks(new Set(TASKS.map((t: Task) => t.id)));
    }
  }

  const toggleTask = (id: string) => {
    const next = new Set(selectedTasks);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedTasks(next);
  };

  const toggleSkill = (id: string) => {
    const next = new Set(selectedSkills);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSkills(next);
  };

  const selectAll = () => setSelectedTasks(new Set(TASKS.map((t: Task) => t.id)));
  const selectNone = () => setSelectedTasks(new Set());

  // Stats
  const stats = useMemo(() => {
    let running = 0, passed = 0, failed = 0;
    for (const t of TASKS) {
      if (!selectedTasks.has(t.id)) continue;
      const s = normalizeStatus(results[t.id] || {});
      if (s === 'running') running++;
      else if (s === 'passed') passed++;
      else if (s === 'failed') failed++;
    }
    return { total: selectedTasks.size, running, passed, failed };
  }, [TASKS, selectedTasks, results]);

  const isRunning = activePipeline.pipelineId != null;

  const handleRunPipeline = () => {
    if (selectedTasks.size === 0) return;
    const taskIds = TASKS.filter((t: Task) => selectedTasks.has(t.id)).map((t: Task) => t.id);

    for (const tid of taskIds) {
      if (globalModel) setTaskModel(tid, globalModel);
      const current = getTaskSkills(tid);
      for (const sid of selectedSkills) {
        if (!current.includes(sid)) attachSkill(tid, sid);
      }
    }

    runInlinePipeline(`Run ${taskIds.length} tasks`, taskIds);
  };

  const handleRunSingle = (taskId: string) => {
    if (globalModel) setTaskModel(taskId, globalModel);
    const current = getTaskSkills(taskId);
    for (const sid of selectedSkills) {
      if (!current.includes(sid)) attachSkill(taskId, sid);
    }
    runTask(taskId);
  };

  return (
    <aside className="w-[340px] shrink-0 border-r border-border bg-card/30 flex flex-col overflow-hidden">
      {/* Config source + stats */}
      <div className="px-4 pt-3 pb-2.5 border-b border-border">
        <div className="font-mono text-[8px] text-zinc-600 truncate mb-1.5" title={project.workspace}>
          {'\ud83d\udcc1'} {project.workspace?.replace(/.*\//, '.../')}
        </div>
        <div className="flex gap-3 font-mono text-[10px]">
          <span className="text-zinc-500">{stats.total} selected</span>
          {stats.running > 0 && <span className="text-amber-400">{stats.running} running</span>}
          {stats.passed > 0 && <span className="text-green-400">{stats.passed} passed</span>}
          {stats.failed > 0 && <span className="text-red-400">{stats.failed} failed</span>}
        </div>
      </div>

      {/* Stories */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-[1.5px]">Stories</span>
            <div className="flex gap-1.5">
              <button onClick={selectAll} className="font-mono text-[9px] text-zinc-500 hover:text-accent transition-colors">All</button>
              <span className="text-zinc-600">|</span>
              <button onClick={selectNone} className="font-mono text-[9px] text-zinc-500 hover:text-accent transition-colors">None</button>
            </div>
          </div>
        </div>

        <div className="px-2">
          {TASKS.map((t: Task) => {
            const d = results[t.id] || {};
            const isPending = !!pendingRuns[t.id];
            const status = isPending ? 'queueing' : normalizeStatus(d);
            const isSelected = selectedTasks.has(t.id);

            return (
              <div
                key={t.id}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all group ${
                  isSelected ? 'bg-white/[0.03]' : 'opacity-40 hover:opacity-70'
                }`}
                onClick={() => toggleTask(t.id)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  className="accent-accent shrink-0"
                />
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status] || STATUS_DOT.idle}`} />
                <span className="text-base shrink-0">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-200 font-medium truncate">S{t.num}: {t.title}</div>
                  <div className="text-[9px] text-zinc-500 truncate">{t.actor}</div>
                </div>
                {status !== 'idle' && (
                  <span className={`font-mono text-[8px] uppercase shrink-0 ${
                    status === 'passed' ? 'text-green-400' : status === 'failed' ? 'text-red-400' : status === 'running' ? 'text-amber-400' : 'text-zinc-500'
                  }`}>{status}</span>
                )}

                {isSelected && status === 'idle' && (
                  <button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleRunSingle(t.id); }}
                    className="opacity-0 group-hover:opacity-100 font-mono text-[9px] text-accent hover:text-white transition-all shrink-0"
                    title="Run this task"
                  >{'\u25b6'}</button>
                )}
                {isSelected && status === 'running' && (
                  <button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); cancelTask(t.id); }}
                    className="font-mono text-[9px] text-red-400 hover:text-red-300 transition-all shrink-0"
                    title="Cancel"
                  >{'\u25a0'}</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Model */}
        <div className="px-4 pt-4 pb-2">
          <label className="block font-mono text-[9px] text-zinc-500 uppercase tracking-[1.5px] mb-1.5">Model</label>
          <select
            value={globalModel}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setGlobalModel(e.target.value)}
            className="w-full bg-elevated border border-border rounded-lg px-2.5 py-2 text-xs text-zinc-200 font-mono"
          >
            {MODELS.map((m: Model) => (
              <option key={m.id} value={m.id}>{m.short}</option>
            ))}
          </select>
        </div>

        {/* Add-ons / Skills */}
        <div className="px-4 pt-2 pb-4">
          <label className="block font-mono text-[9px] text-zinc-500 uppercase tracking-[1.5px] mb-1.5">Add-ons</label>
          <div className="space-y-1">
            {SKILLS.map((s: Skill) => (
              <label
                key={s.id}
                className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/[0.03] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedSkills.has(s.id)}
                  onChange={() => toggleSkill(s.id)}
                  className="mt-0.5 accent-accent"
                />
                <span className="pt-0.5 text-sm">{s.icon}</span>
                <span className="min-w-0">
                  <span className="block text-xs text-zinc-300">{s.name}</span>
                  {s.description && (
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-zinc-500">
                      {s.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Run actions */}
      <div className="px-4 py-3 border-t border-border space-y-2">
        {!isRunning ? (
          <button
            onClick={handleRunPipeline}
            disabled={selectedTasks.size === 0}
            className="btn-primary w-full justify-center py-2.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {'\u25b6'} Run {selectedTasks.size} Task{selectedTasks.size !== 1 ? 's' : ''} (sequential)
          </button>
        ) : (
          <button
            onClick={stopPipeline}
            className="w-full justify-center py-2.5 text-xs font-mono uppercase tracking-wider rounded-lg border border-red-400/40 text-red-400 bg-red-400/5 hover:bg-red-400/10 transition-colors cursor-pointer"
          >
            {'\u25a0'} Stop Pipeline
          </button>
        )}
        <button onClick={cleanAllTasks} className="btn-mini w-full justify-center text-[9px]">{'\ud83e\uddf9'} Clean All Results</button>
      </div>
    </aside>
  );
}
