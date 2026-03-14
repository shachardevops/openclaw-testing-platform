export interface DriftResult {
  drifting: boolean;
  type: string;
  [key: string]: any;
}

export interface DriftEvent {
  id: string;
  ts: number;
  taskId: string;
  type: string;
  [key: string]: any;
}

export interface IDriftDetector {
  recordCheckpoint(taskId: string, result: Record<string, any>): void;
  checkForLoops(taskId: string, recentOutput: string[]): DriftResult | null;
  evaluateAll(activeTaskIds: string[]): DriftEvent[];
  checkScope(taskId: string, taskMeta: Record<string, any> | null, recentOutput: string | string[] | null): DriftResult | null;
  clearTask(taskId: string): void;
  getStatus(): Record<string, any>;
}
