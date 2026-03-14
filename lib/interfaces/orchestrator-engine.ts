export interface IOrchestratorEngine {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setAutonomyLevel(level: number): Record<string, any>;
  confirmAction(confirmationId: string): Record<string, any>;
  denyAction(confirmationId: string): Record<string, any>;
  consultAI(patternKey: string, description: string, availableActions?: string[]): Promise<Record<string, any> | null>;
  approveRecommendation(id: string): Record<string, any>;
  rejectRecommendation(id: string): Record<string, any>;
  manualNudge(sessionId: string): Record<string, any>;
  manualSwap(sessionId: string, targetModel: string): Record<string, any>;
  manualKill(sessionId: string): Record<string, any>;
  manualRecover(taskId: string): Record<string, any>;
  getStatus(): Record<string, any>;
  readonly autonomyLevel: number;
}
