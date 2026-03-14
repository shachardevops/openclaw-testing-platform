import { getProjectConfig } from './project-loader';
import { registry } from './service-registry';

const DEFAULT_CONFIG = {
  enabled: true,
  quorumSize: 2,
  criticalActions: ['kill', 'recover', 'respawn'],
  votingTimeoutMs: 5000,
};

function loadConsensusConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.consensus || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

interface Vote {
  voter: string;
  approve: boolean;
  reason: string;
  confidence: number;
}

type VoterFn = (actionType: string, context: Record<string, any>) => { approve: boolean; reason?: string; confidence?: number };

interface ConsensusDecision {
  ts: number;
  actionType: string;
  context: Record<string, any>;
  approved: boolean;
  approvals: number;
  quorum: number;
  totalVoters: number;
  votes: Vote[];
  [key: string]: any;
}

class ConsensusValidator {
  private _voters: Map<string, VoterFn> = new Map();
  private _history: ConsensusDecision[] = [];

  registerVoter(name: string, fn: VoterFn): void {
    this._voters.set(name, fn);
  }

  evaluate(actionType: string, context: Record<string, any> = {}): ConsensusDecision & { bypassed?: boolean; nonCritical?: boolean } {
    const config = loadConsensusConfig();
    if (!config.enabled) return { approved: true, bypassed: true, votes: [], ts: 0, actionType, context, approvals: 0, quorum: 0, totalVoters: 0 };

    if (!config.criticalActions.includes(actionType)) {
      return { approved: true, nonCritical: true, votes: [], ts: 0, actionType, context, approvals: 0, quorum: 0, totalVoters: 0 };
    }

    const votes: Vote[] = [];
    for (const [name, voterFn] of this._voters) {
      try {
        const vote = voterFn(actionType, context);
        votes.push({
          voter: name,
          approve: !!vote.approve,
          reason: vote.reason || '',
          confidence: vote.confidence ?? 1,
        });
      } catch (e: unknown) {
        votes.push({
          voter: name,
          approve: false,
          reason: `Voter error: ${(e as Error).message}`,
          confidence: 0,
        });
      }
    }

    const approvals = votes.filter(v => v.approve).length;
    const quorum = Math.min(config.quorumSize, this._voters.size);
    const approved = approvals >= quorum;

    const decision: ConsensusDecision = {
      ts: Date.now(),
      actionType,
      context,
      approved,
      approvals,
      quorum,
      totalVoters: votes.length,
      votes,
    };

    this._history.unshift(decision);
    if (this._history.length > 100) this._history.length = 100;

    return decision;
  }

  getStatus() {
    const config = loadConsensusConfig();
    return {
      enabled: config.enabled,
      registeredVoters: [...this._voters.keys()],
      quorumSize: config.quorumSize,
      criticalActions: config.criticalActions,
      recentDecisions: this._history.slice(0, 20),
    };
  }
}

const consensusValidator = new ConsensusValidator();

registry.register('consensusValidator', () => consensusValidator);

export default consensusValidator;
