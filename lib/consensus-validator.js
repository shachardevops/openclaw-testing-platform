/**
 * Consensus Validator — inspired by ruflo's Byzantine Fault Tolerance
 * and consensus mechanisms for critical decision validation.
 *
 * For a QA platform, consensus means: critical actions (kill, recover, swap)
 * require agreement from multiple signals before execution.
 *
 * Signal sources (voters):
 *   1. Orchestrator engine decision tree (deterministic)
 *   2. Session manager health data
 *   3. Quality gate status
 *   4. Drift detector assessment
 *   5. Learning loop historical patterns
 *
 * A critical action proceeds only when quorum is met (configurable, default: 2/3).
 * This prevents false-positive escalations from a single faulty signal.
 */

import { getProjectConfig } from './project-loader.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  enabled: true,
  quorumSize: 2,               // minimum agreeing voters out of available voters
  criticalActions: ['kill', 'recover', 'respawn'],  // actions requiring consensus
  votingTimeoutMs: 5000,       // max time to collect votes
};

function loadConsensusConfig() {
  try {
    const { project } = getProjectConfig();
    return { ...DEFAULT_CONFIG, ...(project.consensus || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---------------------------------------------------------------------------
// Vote Result
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Vote
 * @property {string} voter - name of the voting component
 * @property {boolean} approve - whether this voter approves the action
 * @property {string} reason - explanation
 * @property {number} confidence - 0-1 confidence score
 */

// ---------------------------------------------------------------------------
// Consensus Validator — singleton
// ---------------------------------------------------------------------------

class ConsensusValidator {
  constructor() {
    this._voters = new Map();    // voterName -> voterFn(actionType, context) => Vote
    this._history = [];          // ring buffer of consensus decisions
  }

  /**
   * Register a voter function.
   * @param {string} name - voter name
   * @param {Function} fn - (actionType, context) => { approve, reason, confidence }
   */
  registerVoter(name, fn) {
    this._voters.set(name, fn);
  }

  /**
   * Request consensus on a critical action.
   * Returns { approved, votes, quorum } synchronously.
   */
  evaluate(actionType, context = {}) {
    const config = loadConsensusConfig();
    if (!config.enabled) return { approved: true, bypassed: true, votes: [] };

    // Only require consensus for critical actions
    if (!config.criticalActions.includes(actionType)) {
      return { approved: true, nonCritical: true, votes: [] };
    }

    const votes = [];
    for (const [name, voterFn] of this._voters) {
      try {
        const vote = voterFn(actionType, context);
        votes.push({
          voter: name,
          approve: !!vote.approve,
          reason: vote.reason || '',
          confidence: vote.confidence ?? 1,
        });
      } catch (e) {
        votes.push({
          voter: name,
          approve: false,
          reason: `Voter error: ${e.message}`,
          confidence: 0,
        });
      }
    }

    const approvals = votes.filter(v => v.approve).length;
    const quorum = Math.min(config.quorumSize, this._voters.size);
    const approved = approvals >= quorum;

    const decision = {
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

  /**
   * Get status for API.
   */
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

// Module-level singleton
const consensusValidator = new ConsensusValidator();
export default consensusValidator;
