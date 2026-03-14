export interface ITaskClaims {
  claim(taskId: string, owner: string, opts?: Record<string, any>): Record<string, any>;
  release(taskId: string, owner: string): Record<string, any>;
  handoff(taskId: string, fromOwner: string, toOwner: string, metadata?: Record<string, any>): Record<string, any>;
  isClaimedBy(taskId: string): string | null;
  getClaim(taskId: string): Record<string, any> | null;
  getAllClaims(): Record<string, any>[];
  getStatus(): Record<string, any>;
}
