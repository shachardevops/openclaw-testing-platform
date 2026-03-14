export interface ISelfHealing {
  getCircuitBreaker(name: string): any;
  executeWithHealing(operationName: string, fn: () => Promise<any>, opts?: Record<string, any>): Promise<Record<string, any>>;
  shouldRetryTask(taskId: string, failureContext?: Record<string, any>): Record<string, any>;
  resetTask(taskId: string): void;
  getStatus(): Record<string, any>;
}
