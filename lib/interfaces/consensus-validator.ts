export type VoterFn = (actionType: string, context?: Record<string, any>) => { approve: boolean; reason?: string };

export interface ConsensusDecision {
  approved: boolean;
  votes: Array<{ voter: string; approve: boolean; reason?: string }>;
  quorum: number;
  [key: string]: unknown;
}

export interface IConsensusValidator {
  registerVoter(name: string, fn: VoterFn): void;
  evaluate(actionType: string, context?: Record<string, any>): ConsensusDecision;
  getStatus(): Record<string, any>;
}
