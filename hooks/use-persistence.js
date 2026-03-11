'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Loads persisted state on mount, and debounce-saves on changes.
 * @param {Function} dispatch - reducer dispatch
 * @param {{ taskSkills, taskModels, customPipelines }} persistable - current persistable slices
 * @param {string[]} allowedSkillIds - active skill IDs from project config
 */
export function usePersistence(dispatch, persistable, allowedSkillIds = []) {
  const timerRef = useRef(null);
  const mountedRef = useRef(false);
  const allowedRef = useRef(allowedSkillIds);

  useEffect(() => {
    allowedRef.current = allowedSkillIds;
  }, [allowedSkillIds]);

  const sanitizeTaskSkills = useCallback((taskSkills) => {
    const allowed = new Set(allowedRef.current || []);
    const next = {};

    for (const [taskId, skillIds] of Object.entries(taskSkills || {})) {
      if (!Array.isArray(skillIds)) continue;

      const normalized = [];
      let shouldAddResponsive = false;
      let shouldAddMobile = false;

      for (const skillId of skillIds) {
        if (skillId === 'screenshot') {
          continue;
        }
        if (skillId === 'responsive-mobile') {
          shouldAddResponsive = allowed.has('responsive-checks');
          shouldAddMobile = allowed.has('mobile-checks');
          continue;
        }
        if (allowed.has(skillId) && !normalized.includes(skillId)) {
          normalized.push(skillId);
        }
      }

      if (shouldAddResponsive && !normalized.includes('responsive-checks')) {
        normalized.push('responsive-checks');
      }

      if (shouldAddMobile && !normalized.includes('mobile-checks')) {
        normalized.push('mobile-checks');
      }

      if (normalized.length > 0) {
        next[taskId] = normalized;
      }
    }

    return next;
  }, []);

  // Load on mount
  useEffect(() => {
    fetch('/api/dashboard-state')
      .then(r => r.json())
      .then(d => {
        if (d.taskSkills) dispatch({ type: 'BULK_TASK_SKILLS', taskSkills: sanitizeTaskSkills(d.taskSkills) });
        if (d.taskModels) dispatch({ type: 'BULK_TASK_MODELS', taskModels: d.taskModels });
        if (d.customPipelines) dispatch({ type: 'SET_CUSTOM_PIPELINES', list: d.customPipelines });
        mountedRef.current = true;
      })
      .catch(() => { mountedRef.current = true; });
  }, [dispatch, sanitizeTaskSkills]);

  // Debounced save on changes (skip first render / pre-load)
  const prevRef = useRef(null);
  useEffect(() => {
    if (!mountedRef.current) return;
    const key = JSON.stringify(persistable);
    if (prevRef.current === key) return;
    prevRef.current = key;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetch('/api/dashboard-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...persistable,
          taskSkills: sanitizeTaskSkills(persistable.taskSkills),
        }),
      }).catch(() => {});
    }, 500);
  }, [persistable, sanitizeTaskSkills]);

  // Cleanup
  useEffect(() => () => clearTimeout(timerRef.current), []);
}
