/**
 * Ruflo Swarm Scheduler — DAG-based task distribution.
 *
 * Topological sort → identifies parallelizable groups.
 * Respects maxActiveSessions and profile-aware scheduling.
 */

export class SwarmScheduler {
  constructor(dag, maxConcurrent = 4) {
    this._dag = dag; // { taskId: { deps: [], model } }
    this._maxConcurrent = maxConcurrent;
  }

  /**
   * Get all task IDs in the DAG.
   */
  allTaskIds() {
    return Object.keys(this._dag);
  }

  /**
   * Topological sort of the DAG.
   */
  topologicalSort() {
    const visited = new Set();
    const visiting = new Set();
    const sorted = [];

    const visit = (id) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) return; // cycle detected — skip
      visiting.add(id);
      for (const dep of (this._dag[id]?.deps || [])) {
        if (this._dag[dep]) visit(dep);
      }
      visiting.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    for (const id of Object.keys(this._dag)) {
      visit(id);
    }

    return sorted;
  }

  /**
   * Get tasks that are ready to execute.
   * A task is ready if all its deps are in `completed` and it's not already running.
   */
  getReadyTasks(completed, failed, running) {
    const ready = [];

    for (const [taskId, config] of Object.entries(this._dag)) {
      if (completed.has(taskId)) continue;
      if (failed.has(taskId)) continue;
      if (running.has(taskId)) continue;

      // Check all deps are satisfied
      const depsOk = (config.deps || []).every(dep => completed.has(dep));
      if (!depsOk) continue;

      ready.push(taskId);
    }

    // Respect concurrency limit
    const currentRunning = running.size;
    const slotsAvailable = Math.max(0, this._maxConcurrent - currentRunning);
    return ready.slice(0, slotsAvailable);
  }

  /**
   * Get dependency layers (for visualization).
   */
  getLayers() {
    const layers = [];
    const placed = new Set();

    while (placed.size < Object.keys(this._dag).length) {
      const layer = [];
      for (const [taskId, config] of Object.entries(this._dag)) {
        if (placed.has(taskId)) continue;
        const depsOk = (config.deps || []).every(dep => placed.has(dep));
        if (depsOk) layer.push(taskId);
      }
      if (layer.length === 0) break; // cycle protection
      for (const id of layer) placed.add(id);
      layers.push(layer);
    }

    return layers;
  }
}
