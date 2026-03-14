/**
 * Ruflo Config Validator — advisory validation for project configuration.
 * Returns { valid, warnings[] } — never blocks startup.
 */

/**
 * Validate the full project config structure.
 */
export function validateProjectConfig(config) {
  const warnings = [];

  if (!config.project) {
    warnings.push('Missing project section');
    return { valid: false, warnings };
  }

  const { project, tasks, models } = config;

  // Required project fields
  for (const field of ['id', 'name', 'workspace']) {
    if (!project[field]) {
      warnings.push(`project.${field} is missing`);
    }
  }

  // Escalation threshold ordering
  const esc = project.sessionManager?.escalation;
  if (esc) {
    if (esc.staleThresholdMs && esc.swapThresholdMs && esc.staleThresholdMs >= esc.swapThresholdMs) {
      warnings.push(`Escalation: staleThresholdMs (${esc.staleThresholdMs}) >= swapThresholdMs (${esc.swapThresholdMs})`);
    }
    if (esc.swapThresholdMs && esc.killThresholdMs && esc.swapThresholdMs >= esc.killThresholdMs) {
      warnings.push(`Escalation: swapThresholdMs (${esc.swapThresholdMs}) >= killThresholdMs (${esc.killThresholdMs})`);
    }
  }

  // Message templates
  const requiredTemplates = ['run', 'cancel'];
  for (const tpl of requiredTemplates) {
    if (!project.messageTemplates?.[tpl]) {
      warnings.push(`messageTemplates.${tpl} is missing`);
    }
  }

  // Validate tasks reference valid models
  if (tasks?.length && models?.length) {
    const modelIds = new Set(models.map(m => m.id));
    for (const task of tasks) {
      if (task.defaultModel && !modelIds.has(task.defaultModel)) {
        warnings.push(`Task ${task.id}: defaultModel "${task.defaultModel}" not found in models.json`);
      }
    }
  }

  // Validate task dependencies reference real tasks
  if (tasks?.length) {
    const taskIds = new Set(tasks.map(t => t.id));
    for (const task of tasks) {
      for (const dep of (task.deps || [])) {
        if (!taskIds.has(dep)) {
          warnings.push(`Task ${task.id}: dependency "${dep}" not found in tasks.json`);
        }
      }
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Validate task routing configuration against available models.
 */
export function validateTaskRouting(pipelineConfig, models) {
  const warnings = [];

  if (!pipelineConfig) return { valid: true, warnings };

  const modelIds = new Set((models || []).map(m => m.id));

  // Check rolePipeline model references
  if (pipelineConfig.rolePipeline) {
    for (const [role, cfg] of Object.entries(pipelineConfig.rolePipeline)) {
      if (cfg.model && !modelIds.has(cfg.model)) {
        warnings.push(`rolePipeline.${role}: model "${cfg.model}" not in models.json`);
      }
    }
  }

  // Check specialistPipeline
  if (pipelineConfig.specialistPipeline) {
    for (const [group, cfg] of Object.entries(pipelineConfig.specialistPipeline)) {
      if (cfg.model && !modelIds.has(cfg.model)) {
        warnings.push(`specialistPipeline.${group}: model "${cfg.model}" not in models.json`);
      }
    }
  }

  return { valid: warnings.length === 0, warnings };
}
