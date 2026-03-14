import { describe, it, expect } from 'vitest';

describe('run-agent-start route', () => {
  it('imports without throwing (catches TDZ bugs)', async () => {
    // This will throw at import time if learningsText is used before declaration
    await expect(
      import('../../app/api/run-agent-start/route.js')
    ).resolves.toBeDefined();
  });

  it('exports POST handler', async () => {
    const mod = await import('../../app/api/run-agent-start/route.js');
    expect(typeof mod.POST).toBe('function');
  });
});
