export interface IMemoryManager {
  setWorking(key: string, value: any): void;
  getWorking(key: string): any;
  storeEpisodic(key: string, value: any, importance?: number): void;
  retrieveEpisodic(key: string): Record<string, any> | null;
  searchEpisodic(query: string, limit?: number): Array<Record<string, any>>;
  storeSemantic(key: string, value: any, importance: number): boolean;
  searchSemantic(query: string, limit?: number): Array<Record<string, any>>;
  recall(query: string, limit?: number): Array<Record<string, any>>;
  getStatus(): Record<string, any>;
  stop(): void;
}
