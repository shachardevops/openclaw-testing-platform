export interface IAppHealth {
  start(): void;
  stop(): void;
  isHealthy(): boolean | null;
  getStatus(): Record<string, any>;
}
