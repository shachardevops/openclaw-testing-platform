/**
 * Ruflo Consensus — multi-source health consensus with Byzantine Fault Tolerant voting.
 *
 * 5 signal sources with weights:
 *   Session registry (2.0), Bridge log mtime (1.5), Result file (1.0),
 *   Gateway/agent (1.0), Session JSONL (1.0)
 *
 * Status votes: healthy | stale | dead | unknown
 * Weighted quorum (>= 4.0) required for status determination.
 * No quorum → "uncertain" (escalation deferred).
 */

const STATUS_PRIORITY = { healthy: 0, stale: 1, dead: 2, unknown: 3 };

class ConsensusEngine {
  constructor() {
    this._sources = new Map();
    this._sessionStates = new Map(); // sessionId -> { status, votes[], lastUpdated }
    this._listeners = [];
  }

  /**
   * Register a signal source.
   */
  registerSource(name, weight, adapter) {
    this._sources.set(name, { name, weight, adapter });
  }

  /**
   * Collect votes from all sources for a session.
   */
  async collectVotes(sessionId, context = {}) {
    const votes = [];

    for (const [name, source] of this._sources) {
      try {
        const vote = await source.adapter(sessionId, context);
        votes.push({
          source: name,
          weight: source.weight,
          status: vote.status || 'unknown',
          confidence: vote.confidence || 1.0,
          detail: vote.detail || '',
          ts: Date.now(),
        });
      } catch {
        votes.push({
          source: name,
          weight: source.weight,
          status: 'unknown',
          confidence: 0,
          detail: 'source-error',
          ts: Date.now(),
        });
      }
    }

    return votes;
  }

  /**
   * Determine consensus status from votes using Byzantine quorum.
   */
  resolveStatus(votes) {
    const tallies = { healthy: 0, stale: 0, dead: 0, unknown: 0 };

    for (const vote of votes) {
      const effectiveWeight = vote.weight * vote.confidence;
      tallies[vote.status] = (tallies[vote.status] || 0) + effectiveWeight;
    }

    const totalWeight = Object.values(tallies).reduce((a, b) => a + b, 0);
    const quorumThreshold = 4.0;

    // Find the status with highest weighted votes
    let bestStatus = 'uncertain';
    let bestWeight = 0;

    for (const [status, weight] of Object.entries(tallies)) {
      if (status === 'unknown') continue;
      if (weight > bestWeight) {
        bestWeight = weight;
        bestStatus = status;
      }
    }

    // Check quorum
    const nonUnknownWeight = totalWeight - (tallies.unknown || 0);
    const hasQuorum = nonUnknownWeight >= quorumThreshold;

    if (!hasQuorum) {
      return {
        status: 'uncertain',
        confidence: nonUnknownWeight / quorumThreshold,
        tallies,
        quorum: false,
      };
    }

    return {
      status: bestStatus,
      confidence: bestWeight / nonUnknownWeight,
      tallies,
      quorum: true,
    };
  }

  /**
   * Get consensus status for a session.
   */
  async getStatus(sessionId, context = {}) {
    const votes = await this.collectVotes(sessionId, context);
    const result = this.resolveStatus(votes);

    // Cache state
    this._sessionStates.set(sessionId, {
      ...result,
      votes,
      lastUpdated: Date.now(),
    });

    // Emit to gossip listeners
    for (const listener of this._listeners) {
      try { listener(sessionId, result); } catch { /* skip */ }
    }

    return result;
  }

  /**
   * Get cached status (from last evaluation).
   */
  getCachedStatus(sessionId) {
    return this._sessionStates.get(sessionId) || null;
  }

  /**
   * Subscribe to status changes (gossip propagation).
   */
  onStatusChange(listener) {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  /**
   * Get all session states.
   */
  getAllStates() {
    const states = {};
    for (const [id, state] of this._sessionStates) {
      states[id] = state;
    }
    return states;
  }
}

// Module-level singleton
const consensusEngine = new ConsensusEngine();
export default consensusEngine;
