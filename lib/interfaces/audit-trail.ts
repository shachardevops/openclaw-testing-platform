export interface IAuditTrail {
  record(category: string, action: string, data?: Record<string, any>, actor?: string): Record<string, any>;
  taskEvent(action: string, taskId: string, data?: Record<string, any>): Record<string, any>;
  pipelineEvent(action: string, pipelineId: string, data?: Record<string, any>): Record<string, any>;
  orchestratorEvent(action: string, data?: Record<string, any>): Record<string, any>;
  gateEvent(action: string, taskId: string, data?: Record<string, any>): Record<string, any>;
  driftEvent(action: string, taskId: string, data?: Record<string, any>): Record<string, any>;
  claimEvent(action: string, taskId: string, data?: Record<string, any>): Record<string, any>;
  systemEvent(action: string, data?: Record<string, any>): Record<string, any>;
  query(params?: Record<string, any>): any[];
  replayTask(taskId: string): any[];
  verifyChain(): Record<string, any>;
  getStatus(): Record<string, any>;
  stop(): void;
}
