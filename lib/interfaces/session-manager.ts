export interface ISessionManager {
  start(): void;
  stop(): void;
  scan(): Promise<void>;
  nudge(sessionId: string): Record<string, any>;
  swapModel(sessionId: string, targetModel: string): Record<string, any>;
  killSession(sessionId: string): Record<string, any>;
  killOrphans(): Record<string, any>;
  dedup(taskId: string): Record<string, any>;
  dedupAll(): Record<string, any>;
  canSpawnCheck(): Record<string, any>;
  getState(): Record<string, any>;
  registry: Map<string, any>;
  issues: any[];
  actionLog: any[];
  debugLog: any[];
  lastScanAt: number;
  scanCount: number;
  escalationPaused: boolean;
  _sendNudge(entry: any, cfg: any): string;
  _sendSwap(entry: any, model: string, cfg: any): string;
  _sendKill(entry: any, cfg: any): string;
  _purgeFromIndex(ids: string[]): void;
}
