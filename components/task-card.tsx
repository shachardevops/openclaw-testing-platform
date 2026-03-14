'use client';

import { useState, useRef, useEffect } from 'react';
import { useDashboard } from '@/context/dashboard-context';
import { useProjectConfig } from '@/context/project-config-context';
import { normalizeStatus } from '@/lib/normalize-status';
import StatusBadge from './status-badge';
import ProgressBar from './progress-bar';
import ModelSelector from './model-selector';
import SkillBadge from './skill-badge';
import SkillPicker from './skill-picker';

import type { TaskDefinition } from '@/types/config';

const BAR_COLOR: Record<string, string> = { running: 'bg-amber-400', passed: 'bg-green-400', failed: 'bg-red-400' };
const FINDING_ICON: Record<string, string> = { bug: '\ud83d\udc1b', fail: '\ud83d\udc1b', warning: '\u26a0\ufe0f', warn: '\u26a0\ufe0f', pass: '\u2705' };

interface TaskCardProps {
  task: TaskDefinition & Record<string, unknown>;
}

export default function TaskCard({ task }: TaskCardProps) {
  const {
    results, pendingRuns, streamingText,
    getTaskModel, setTaskModel,
    getTaskSkills, attachSkill, detachSkill,
    runTask, cancelTask,
  } = useDashboard();
  const { models: MODELS, skills: SKILLS } = useProjectConfig();

  const [showFindings, setShowFindings] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  const d = results[task.id] || {};
  const isPending = !!pendingRuns[task.id];
  const status = isPending ? 'queueing' : normalizeStatus(d);
  const model = getTaskModel(task.id);
  const modelInfo = MODELS.find(m => m.id === model) || {} as Record<string, unknown>;
  const skillIds = getTaskSkills(task.id);
  const skills = skillIds.map(sid => SKILLS.find(s => s.id === sid)).filter(Boolean);
  const findings = d.findings || [];
  const hasStats = d.passed || d.failed || d.warnings;
  const liveText = streamingText?.[task.id];

  // Auto-scroll streaming text
  useEffect(() => {
    if (streamRef.current && liveText) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [liveText]);

  const copyOutput = async () => {
    try {
      const r = await fetch(`/api/report-md?agentId=${encodeURIComponent(task.id)}`);
      const data = await r.json();
      await navigator.clipboard.writeText(data?.ok ? data.content : `No report for ${task.id}`);
    } catch (e: unknown) { /* ignore */ }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-border-bright transition-all">
      {/* Status bar */}
      <div className={`h-1 ${BAR_COLOR[status] || 'bg-border'} ${status === 'running' ? 'animate-pulse' : ''}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{task.icon as string}</span>
            <div>
              <div className="text-sm font-semibold">S{task.num}: {task.title}</div>
              <div className="text-[10px] text-zinc-500">
                {task.actor as string} &middot; <span style={{ color: (modelInfo as Record<string, unknown>).color as string || '#888' }}>{(modelInfo as Record<string, unknown>).short as string || '?'}</span>
              </div>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="text-[11px] text-zinc-400 mb-3">{task.desc as string}</div>

        {/* Progress */}
        {(status === 'running' || status === 'passed' || status === 'failed') && (
          <ProgressBar progress={d.progress || (status !== 'running' ? 100 : 0)} label={d.progressLabel as string} status={status} />
        )}

        {/* Inline streaming output */}
        {liveText != null && status === 'running' && (
          <div
            ref={streamRef}
            className="mb-3 bg-[#0a0a12] border border-border rounded-lg p-2 font-mono text-[10px] text-zinc-300 max-h-[120px] overflow-y-auto whitespace-pre-wrap leading-relaxed"
          >
            {liveText || '\u2588'}
          </div>
        )}

        {/* Test counts */}
        {hasStats && (
          <div className="flex gap-3 mb-3 font-mono text-[11px]">
            <span className="text-green-400">{'\u2713'}{d.passed || 0}</span>
            <span className="text-red-400">{'\u2717'}{d.failed || 0}</span>
            <span className="text-amber-400">{'\u26a0'}{d.warnings || 0}</span>
          </div>
        )}

        {/* Skills */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {skills.map(s => (
            s && <SkillBadge key={s.id} skill={s as { icon?: string; name: string }} onRemove={() => detachSkill(task.id, s!.id)} />
          ))}
          <SkillPicker
            attachedIds={skillIds}
            onToggle={(sid) => skillIds.includes(sid) ? detachSkill(task.id, sid) : attachSkill(task.id, sid)}
          />
        </div>

        {/* Model selector */}
        <div className="mb-3" onClick={(e) => e.stopPropagation()}>
          <label className="block text-[9px] text-zinc-500 mb-0.5 font-mono uppercase tracking-wider">Model</label>
          <ModelSelector value={model} onChange={(v) => setTaskModel(task.id, v)} />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5">
          {(status === 'idle' || status === 'queueing') && (
            <button onClick={() => runTask(task.id)} disabled={isPending} className="btn-mini w-full">
              {isPending ? '\u23f3 Queued...' : `\u25b6 Run Task ${task.num}`}
            </button>
          )}
          {status === 'running' && (
            <button onClick={() => cancelTask(task.id)} className="btn-mini w-full border-red-400/35 text-red-400">
              {'\u25a0'} Cancel
            </button>
          )}
          {(status === 'passed' || status === 'failed') && (
            <>
              <button onClick={() => runTask(task.id)} className="btn-mini w-full">{'\u21bb'} Re-run</button>
              <button onClick={copyOutput} className="btn-mini w-full text-[9px]">{'\u29c9'} Copy Output</button>
            </>
          )}
        </div>

        {/* Findings */}
        {findings.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setShowFindings(!showFindings)} className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
              {showFindings ? '\u25be' : '\u25b8'} {findings.length} finding{findings.length !== 1 ? 's' : ''}
            </button>
            {showFindings && (
              <div className="mt-1.5 space-y-1 max-h-[200px] overflow-y-auto">
                {findings.map((f: Record<string, unknown>, i: number) => (
                  <div key={i} className="text-[10px] text-zinc-400 flex gap-1.5 items-start">
                    <span className="shrink-0">{FINDING_ICON[f.type as string] || '\u2139\ufe0f'}</span>
                    <span>{(f.text as string) || (f.message as string) || JSON.stringify(f)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
