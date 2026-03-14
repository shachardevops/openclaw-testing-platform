/**
 * Ruflo Hook System — Pre/Post/Stop quality gates for task lifecycle.
 *
 * Hook types:
 *   - command: Shell script (exit 0=allow, 2=block)
 *   - validator: JS function
 *   - agent: Spawns subagent (deferred)
 *
 * Lifecycle points: pre-run, post-run, pre-finalize
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const HOOKS_DIR = path.join(process.cwd(), 'scripts', 'hooks');

/**
 * Load hook definitions from config or default.
 */
function loadHookConfig() {
  try {
    const configPath = path.join(process.cwd(), '.claude', 'hooks.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch { /* fall through */ }

  return {
    'pre-run': [],
    'post-run': [],
    'pre-finalize': [],
  };
}

/**
 * Run a single hook.
 * @returns {{ allowed: boolean, output?: string, error?: string }}
 */
function runHook(hook, context) {
  if (hook.type === 'command') {
    try {
      const scriptPath = path.resolve(HOOKS_DIR, hook.script);
      if (!fs.existsSync(scriptPath)) {
        return { allowed: true, output: `Hook script not found: ${hook.script} (skipped)` };
      }
      const env = {
        ...process.env,
        HOOK_TASK_ID: context.taskId || '',
        HOOK_STATUS: context.status || '',
        HOOK_FILE: context.file || '',
      };
      const output = execSync(`node "${scriptPath}"`, {
        env,
        timeout: 10000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { allowed: true, output: output.trim() };
    } catch (e) {
      if (e.status === 2) {
        return { allowed: false, error: e.stderr?.toString() || e.message };
      }
      // Non-blocking for other exit codes
      return { allowed: true, output: `Hook warning: ${e.message}` };
    }
  }

  if (hook.type === 'validator') {
    try {
      const validatorPath = path.resolve(HOOKS_DIR, hook.script);
      if (!fs.existsSync(validatorPath)) {
        return { allowed: true, output: `Validator not found: ${hook.script} (skipped)` };
      }
      // Read and evaluate validator — avoids dynamic require warning
      const code = fs.readFileSync(validatorPath, 'utf8');
      const modExports = {};
      const modRequire = (id) => {
        if (id === 'fs') return fs;
        if (id === 'path') return path;
        return {};
      };
      const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', code);
      const mod = { exports: modExports };
      fn(mod, modExports, modRequire, validatorPath, path.dirname(validatorPath));
      const validate = mod.exports.validate || modExports.validate;
      const result = validate ? validate(context) : { valid: true };
      return { allowed: result.valid !== false, output: result.message, error: result.error };
    } catch (e) {
      return { allowed: true, output: `Validator error: ${e.message}` };
    }
  }

  return { allowed: true };
}

/**
 * Run all hooks for a lifecycle point.
 * @param {'pre-run'|'post-run'|'pre-finalize'} lifecycle
 * @param {Object} context - { taskId, status, file, ... }
 * @returns {{ allowed: boolean, results: Array, blockedBy?: string }}
 */
export function runHooks(lifecycle, context = {}) {
  const config = loadHookConfig();
  const hooks = config[lifecycle] || [];

  if (hooks.length === 0) {
    return { allowed: true, results: [] };
  }

  const results = [];
  for (const hook of hooks) {
    const result = runHook(hook, context);
    results.push({ hook: hook.name || hook.script, ...result });
    if (!result.allowed) {
      return { allowed: false, results, blockedBy: hook.name || hook.script };
    }
  }

  return { allowed: true, results };
}

/**
 * Get list of configured hooks.
 */
export function listHooks() {
  return loadHookConfig();
}
