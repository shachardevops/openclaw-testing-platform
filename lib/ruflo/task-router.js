/**
 * Ruflo Task Router — unified model routing with resolution chain.
 *
 * Resolution order:
 *   User override → Role pipeline → Specialist pipeline → SONA/RL →
 *   Complexity heuristic → Load balancing → Task default
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';
import rlRouter from './rl-router.js';

let _sona = null;

/**
 * Set the SONA optimizer reference (called by sona.js on init).
 */
export function setSonaOptimizer(sona) {
  _sona = sona;
}

/**
 * Load task complexity hints.
 */
function loadComplexityHints() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    const p = path.join(process.cwd(), 'config', projectId, 'task-complexity.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { /* no hints */ }
  return {};
}

/**
 * Select the best model for a task.
 * @param {string} taskId
 * @param {Object} opts - { userOverride, actor, complexity }
 * @returns {{ modelId, confidence, reason, source }}
 */
export function selectModel(taskId, opts = {}) {
  const { pipelineConfig, models, tasks } = getProjectConfig();
  const task = tasks.find(t => t.id === taskId);
  const availableModels = models.map(m => m.id);

  // 1. User override
  if (opts.userOverride && availableModels.includes(opts.userOverride)) {
    return { modelId: opts.userOverride, confidence: 1.0, reason: 'User override', source: 'user' };
  }

  // 2. Role pipeline match
  if (pipelineConfig?.rolePipeline && task?.actor) {
    const actor = task.actor.toLowerCase().split(/[+,]/)[0].trim();
    for (const [role, cfg] of Object.entries(pipelineConfig.rolePipeline)) {
      if (role.toLowerCase() === actor && cfg.model && availableModels.includes(cfg.model)) {
        return { modelId: cfg.model, confidence: 0.8, reason: `Role pipeline: ${role}`, source: 'role-pipeline' };
      }
    }
  }

  // 3. Specialist pipeline match
  if (pipelineConfig?.specialistPipeline) {
    for (const [group, cfg] of Object.entries(pipelineConfig.specialistPipeline)) {
      if (cfg.tasks?.includes(taskId) && cfg.model && availableModels.includes(cfg.model)) {
        return { modelId: cfg.model, confidence: 0.8, reason: `Specialist: ${group}`, source: 'specialist-pipeline' };
      }
    }
  }

  // 4. SONA / RL recommendation
  const complexity = opts.complexity || loadComplexityHints()[taskId] || 'medium';
  const context = { complexity, actor: task?.actor || 'all', models: availableModels };

  if (_sona) {
    try {
      const sonaResult = _sona.recommend(taskId, context);
      if (sonaResult && sonaResult.modelId) {
        return { ...sonaResult, source: 'sona' };
      }
    } catch { /* fall through */ }
  }

  const rlResult = rlRouter.recommend(taskId, context);
  if (rlResult && rlResult.confidence > 0.3) {
    return { ...rlResult, source: 'rl-router' };
  }

  // 5. Complexity heuristic
  const complexityMap = {
    simple: models.find(m => /haiku/i.test(m.id))?.id,
    complex: models.find(m => /opus/i.test(m.id))?.id,
  };
  if (complexityMap[complexity]) {
    return {
      modelId: complexityMap[complexity],
      confidence: 0.5,
      reason: `Complexity heuristic: ${complexity}`,
      source: 'complexity-heuristic',
    };
  }

  // 6. Load balancing (round-robin)
  if (pipelineConfig?.loadBalancing?.enabled && availableModels.length > 1) {
    const idx = Math.floor(Math.random() * availableModels.length);
    return {
      modelId: availableModels[idx],
      confidence: 0.3,
      reason: 'Load balancing (random)',
      source: 'load-balancing',
    };
  }

  // 7. Task default
  const defaultModel = task?.defaultModel || availableModels[0];
  return {
    modelId: defaultModel,
    confidence: 0.2,
    reason: 'Task default',
    source: 'default',
  };
}
