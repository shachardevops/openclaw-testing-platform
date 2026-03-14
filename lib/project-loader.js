import fs from 'fs';
import path from 'path';

const BASE_DIR = process.cwd();
const CONFIG_DIR = path.join(BASE_DIR, 'config');

let _cache = null;
let _cacheAt = 0;
const DEV_CACHE_TTL = 1000; // 1s cache in dev mode to avoid 100+ reads/sec

/**
 * Resolve the active project ID using:
 * 1. OPENCLAW_PROJECT env var
 * 2. config/active-project.json
 * 3. Single folder under config/ (auto-detect)
 * 4. null (legacy fallback)
 */
function resolveProjectId() {
  // 1. Env var
  if (process.env.OPENCLAW_PROJECT) return process.env.OPENCLAW_PROJECT;

  // 2. active-project.json
  try {
    const ap = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'active-project.json'), 'utf8'));
    if (ap.projectId) return ap.projectId;
  } catch {}

  // 3. Auto-detect single project folder
  try {
    const dirs = fs.readdirSync(CONFIG_DIR)
      .filter(d => !d.startsWith('_') && d !== 'active-project.json')
      .filter(d => fs.statSync(path.join(CONFIG_DIR, d)).isDirectory());
    if (dirs.length === 1) return dirs[0];
  } catch {}

  return null;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonOptional(filePath, fallback) {
  try { return readJsonFile(filePath); } catch { return fallback; }
}

/**
 * Load project config from config/<projectId>/ folder.
 * Falls back to legacy data/project.config.js extraction.
 */
export function getProjectConfig() {
  // In production, cache forever. In dev mode, cache for 1s to avoid excessive disk reads.
  if (_cache && process.env.NODE_ENV !== 'development') return _cache;
  if (_cache && process.env.NODE_ENV === 'development' && Date.now() - _cacheAt < DEV_CACHE_TTL) return _cache;

  const projectId = resolveProjectId();

  if (projectId) {
    const projectDir = path.join(CONFIG_DIR, projectId);
    if (fs.existsSync(path.join(projectDir, 'project.json'))) {
      const defaultsDir = path.join(CONFIG_DIR, '_defaults');
      const project = readJsonFile(path.join(projectDir, 'project.json'));
      const tasks = readJsonFile(path.join(projectDir, 'tasks.json'));
      const models = readJsonOptional(
        path.join(projectDir, 'models.json'),
        readJsonOptional(path.join(defaultsDir, 'models.json'), [])
      );
      const skills = readJsonOptional(
        path.join(projectDir, 'skills.json'),
        readJsonOptional(path.join(defaultsDir, 'skills.json'), [])
      );
      const pipelines = readJsonOptional(path.join(projectDir, 'pipelines.json'), []);
      const pipelineConfig = readJsonOptional(path.join(projectDir, 'pipeline-config.json'), {});

      _cache = { project, tasks, models, skills, pipelines, pipelineConfig };
      _cacheAt = Date.now();
      return _cache;
    }
  }

  // Legacy fallback: parse data/project.config.js
  _cache = loadLegacyConfig();
  _cacheAt = Date.now();
  return _cache;
}

function loadLegacyConfig() {
  try {
    const cfgPath = path.join(BASE_DIR, 'data', 'project.config.js');
    const raw = fs.readFileSync(cfgPath, 'utf8');

    const wsMatch = raw.match(/workspace:\s*['"]([^'"]+)['"]/);
    const nameMatch = raw.match(/name:\s*['"]([^'"]+)['"]/);
    const subtitleMatch = raw.match(/subtitle:\s*['"]([^'"]+)['"]/);
    const iconMatch = raw.match(/icon:\s*['"]([^'"]+)['"]/);

    const project = {
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
      project: { id: 'default', name: 'Dashboard', subtitle: '', icon: '\u26a1', workspace: BASE_DIR, messageTemplates: {} },
      tasks: [], models: [], skills: [], pipelines: [],
      pipelineConfig: {},
    };
  }
}

/** Clear cached config (useful for tests or hot reload). */
export function clearConfigCache() {
  _cache = null;
  _cacheAt = 0;
}

/** Get task ID set for validation. */
export function getTaskIdSet() {
  const { tasks } = getProjectConfig();
  return new Set(tasks.map(t => t.id));
}
