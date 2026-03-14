import { describe, it, expect, beforeEach } from 'vitest';
import { ConditionTracker } from '@/lib/orchestrator-engine';

describe('ConditionTracker', () => {
  let tracker: InstanceType<typeof ConditionTracker>;

  beforeEach(() => {
    tracker = new ConditionTracker();
  });

  it('returns true on first track of a new condition', () => {
    expect(tracker.track('stale', 'session-1')).toBe(true);
  });

  it('returns false on subsequent tracks of the same condition', () => {
    tracker.track('stale', 'session-1');
    expect(tracker.track('stale', 'session-1')).toBe(false);
  });

  it('increments count on repeated tracks', () => {
    tracker.track('stale', 'session-1');
    tracker.track('stale', 'session-1');
    tracker.track('stale', 'session-1');
    const entry = tracker.get('stale', 'session-1');
    expect(entry).not.toBeNull();
    expect(entry!.count).toBe(3);
  });

  it('tracks different types independently', () => {
    expect(tracker.track('stale', 'session-1')).toBe(true);
    expect(tracker.track('orphaned', 'session-1')).toBe(true);
    expect(tracker.getAll()).toHaveLength(2);
  });

  it('marks action taken on a condition', () => {
    tracker.track('stale', 'session-1');
    tracker.markActioned('stale', 'session-1', 'nudge');
    const entry = tracker.get('stale', 'session-1');
    expect(entry!.actionTaken).toBe('nudge');
  });

  it('resolves (removes) a condition', () => {
    tracker.track('stale', 'session-1');
    tracker.resolve('stale', 'session-1');
    expect(tracker.get('stale', 'session-1')).toBeNull();
  });

  it('prunes conditions whose IDs are not in the active set', () => {
    tracker.track('stale', 'session-1');
    tracker.track('stale', 'session-2');
    tracker.track('orphaned', 'session-3');

    const activeIds = new Set(['session-1']);
    tracker.prune(activeIds);

    expect(tracker.get('stale', 'session-1')).not.toBeNull();
    expect(tracker.get('stale', 'session-2')).toBeNull();
    expect(tracker.get('orphaned', 'session-3')).toBeNull();
  });

  it('returns null for non-existent conditions', () => {
    expect(tracker.get('stale', 'nonexistent')).toBeNull();
  });

  it('getAll returns all tracked conditions', () => {
    tracker.track('stale', 'a');
    tracker.track('orphaned', 'b');
    tracker.track('duplicate', 'c');
    expect(tracker.getAll()).toHaveLength(3);
  });
});
