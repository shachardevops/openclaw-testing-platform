export interface ITokenTracker {
  recordTaskCompletion(taskId: string, result: Record<string, any>): void;
  getMostEfficientModel(): Record<string, any> | null;
  suggestModel(taskComplexity?: string): Record<string, any>;
  getStatus(): Record<string, any>;
}
