import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DecisionMemory } from '@/lib/orchestrator-engine';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('DecisionMemory', () => {
  let tmpDir: string;
  let memoryFile: string;
  let memory: InstanceType<typeof DecisionMemory>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-memory-test-'));
    memoryFile = path.join(tmpDir, 'decision-memory.json');
    memory = new DecisionMemory(memoryFile);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for unknown patterns', () => {
    expect(memory.lookup('unknown:pattern')).toBeNull();
  });

  it('stores and retrieves a pattern', () => {
    memory.store('stale:session-1', 'nudge', 'Session was stale for 5min');
    const entry = memory.lookup('stale:session-1');
    expect(entry).not.toBeNull();
    expect(entry!.action).toBe('nudge');
    expect(entry!.reason).toBe('Session was stale for 5min');
    expect(entry!.usedCount).toBe(0);
  });

  it('increments usage count', () => {
    memory.store('stale:session-1', 'nudge', 'test');
    memory.incrementUsage('stale:session-1');
    memory.incrementUsage('stale:session-1');
    const entry = memory.lookup('stale:session-1');
    expect(entry!.usedCount).toBe(2);
  });

  it('persists to disk and reloads', async () => {
    memory.store('pattern:a', 'kill', 'reason-a');
    memory.store('pattern:b', 'swap', 'reason-b');

    // Wait for async persist to complete
    await new Promise(r => setTimeout(r, 50));

    // Create a new instance from the same file
    const reloaded = new DecisionMemory(memoryFile);
    // Wait for async load to complete
    await new Promise(r => setTimeout(r, 50));

    expect(reloaded.lookup('pattern:a')!.action).toBe('kill');
    expect(reloaded.lookup('pattern:b')!.action).toBe('swap');
  });

  it('tracks size correctly', () => {
    expect(memory.size).toBe(0);
    memory.store('a', 'nudge', 'r1');
    memory.store('b', 'swap', 'r2');
    expect(memory.size).toBe(2);
  });

  it('overwrites existing patterns on re-store', () => {
    memory.store('pattern:x', 'nudge', 'first');
    memory.store('pattern:x', 'kill', 'second');
    const entry = memory.lookup('pattern:x');
    expect(entry!.action).toBe('kill');
    expect(entry!.reason).toBe('second');
    expect(entry!.usedCount).toBe(0); // reset on overwrite
  });

  it('handles missing file gracefully', () => {
    const missing = new DecisionMemory(path.join(tmpDir, 'nonexistent', 'file.json'));
    expect(missing.lookup('anything')).toBeNull();
    expect(missing.size).toBe(0);
  });

  it('handles corrupt file gracefully', () => {
    fs.writeFileSync(memoryFile, 'not valid json!!!');
    const corrupt = new DecisionMemory(memoryFile);
    expect(corrupt.size).toBe(0);
  });
});
