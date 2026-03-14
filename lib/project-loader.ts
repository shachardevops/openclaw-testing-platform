import fs from 'fs';
import path from 'path';

import type { FullProjectConfig, ProjectConfig } from '@/types/config';

const BASE_DIR = process.cwd();
const CONFIG_DIR = path.join(BASE_DIR, 'config');

let _cache: FullProjectConfig | null = null;

/**
 * Resolve the active project ID using:
 * 1. OPENCLAW_PROJECT env var
 * 2. config/active-project.json
 * 3. Single folder under config/ (auto-detect)
 * 4. null (legacy fallback)
 */
function resolveProjectId(): string | null {
  // 1. Env var
  if (process.env.OPENCLAW_PROJECT) return process.env.OPENCLAW_PROJECT;

  // 2. active-project.json
  try {
    const ap = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'active-project.json'), 'utf8'));
    if (ap.projectId) return ap.projectId;
  } catch { /* not found */ }

  // 3. Auto-detect single project folder
  try {
    const dirs = fs.readdirSync(CONFIG_DIR)
      .filter(d => !d.startsWith('_') && d !== 'active-project.json')
      .filter(d => fs.statSync(path.join(CONFIG_DIR, d)).isDirectory());
    if (dirs.length === 1) return dirs[0];
  } catch { /* config dir may not exist */ }

  return null;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonOptional<T>(filePath: string, fallback: T): T {
  try { return readJsonFile(filePath) as T; } catch { return fallback; }
}

/**
 * Load project config from config/<projectId>/ folder.
 * Falls back to legacy data/project.config.js extraction.
 */
export function getProjectConfig(): FullProjectConfig {
  // In dev mode, always re-read config files so changes are picked up without restart
  if (_cache && process.env.NODE_ENV !== 'development') return _cache;

  const projectId = resolveProjectId();

  if (projectId) {
    const projectDir = path.join(CONFIG_DIR, projectId);
    if (fs.existsSync(path.join(projectDir, 'project.json'))) {
      const defaultsDir = path.join(CONFIG_DIR, '_defaults');
      const project = readJsonFile(path.join(projectDir, 'project.json')) as ProjectConfig;
      const tasks = readJsonFile(path.join(projectDir, 'tasks.json')) as FullProjectConfig['tasks'];
      const models = readJsonOptional(
        path.join(projectDir, 'models.json'),
        readJsonOptional(path.join(defaultsDir, 'models.json'), [] as FullProjectConfig['models'])
      );
      const skills = readJsonOptional(
        path.join(projectDir, 'skills.json'),
        readJsonOptional(path.join(defaultsDir, 'skills.json'), [] as FullProjectConfig['skills'])
      );
      const pipelines = readJsonOptional(path.join(projectDir, 'pipelines.json'), [] as FullProjectConfig['pipelines']);
      const pipelineConfig = readJsonOptional(path.join(projectDir, 'pipeline-config.json'), {} as FullProjectConfig['pipelineConfig']);

      _cache = { project, tasks, models, skills, pipelines, pipelineConfig };
      return _cache;
    }
  }

  // Legacy fallback: parse data/project.config.js
  _cache = loadLegacyConfig();
  return _cache;
}

function loadLegacyConfig(): FullProjectConfig {
  try {
    const cfgPath = path.join(BASE_DIR, 'data', 'project.config.js');
    const raw = fs.readFileSync(cfgPath, 'utf8');

    const wsMatch = raw.match(/workspace:\s*['"]([^'"]+)['"]/);
    const nameMatch = raw.match(/name:\s*['"]([^'"]+)['"]/);
    const subtitleMatch = raw.match(/subtitle:\s*['"]([^'"]+)['"]/);
    const iconMatch = raw.match(/icon:\s*['"]([^'"]+)['"]/);

    const project: ProjectConfig = {
      id: 'legacy',
      name: nameMatch?.[1] || 'Dashboard',
      subtitle: subtitleMatch?.[1] || '',
      icon: iconMatch?.[1] || '\u26a1',
      workspace: wsMatch?.[1] || BASE_DIR,
      messageTemplates: {
        run: '[dashboard-run]\nStart agent run for task: {taskId}\nBrowser profile: {profile}\nModel: {model}\n{skills}\nUse sessions_spawn now with the specified model, then update {workspace}/results/{taskId}.json to running immediately.',
        cancel: '[dashboard-cancel]\nCancel agent run for task: {taskId}\nIf a spawned run/session is active for this agent, stop/kill it now.\nThen update {workspace}/results/{taskId}.json with status "failed" and a finding that it was cancelled by user.',
      },
    };

    return {
      project,
      tasks: [],
      models: [],
      skills: [],
      pipelines: [],
      pipelineConfig: readJsonOptional(path.join(BASE_DIR, 'pipeline-config.json'), {}),
    };
  } catch {
    return {
      project: { id: 'default', name: 'Dashboard', subtitle: '', icon: '\u26a1', workspace: BASE_DIR, messageTemplates: { run: '', cancel: '' } },
      tasks: [], models: [], skills: [], pipelines: [],
      pipelineConfig: {},
    };
  }
}

/** Clear cached config (useful for tests or hot reload). */
export function clearConfigCache(): void {
  _cache = null;
}

/** Get task ID set for validation. */
export function getTaskIdSet(): Set<string> {
  const { tasks } = getProjectConfig();
  return new Set(tasks.map(t => t.id));
}
