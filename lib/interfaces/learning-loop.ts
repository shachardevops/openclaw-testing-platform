export interface ILearningLoop {
  learnFromResult(taskId: string, result: Record<string, any>, reportsDir?: string): void | Promise<void>;
  learnFromOrchestratorDecision(decision: Record<string, any>): void;
  getTaskLearnings(taskId: string): Array<Record<string, any>>;
  getStatus(): Record<string, any>;
  getAllPatterns(): Array<Record<string, any>>;
}
