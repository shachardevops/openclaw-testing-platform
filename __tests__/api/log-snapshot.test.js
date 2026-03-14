import { describe, it, expect } from 'vitest';

// Minimal mock so the module can import without side effects
import { vi } from 'vitest';
vi.mock('../../lib/config', () => ({ resultsDir: () => '/tmp/test-results' }));
vi.mock('../../lib/project-loader', () => ({
  getProjectConfig: () => ({ project: { workspace: '/tmp/test-workspace' } }),
}));

describe('log-snapshot route', () => {
  it('rejects taskId with path traversal characters', async () => {
    const { GET } = await import('../../app/api/log-snapshot/route.js');
    const req = new Request('http://localhost/api/log-snapshot?taskId=../../etc&findingId=test');
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Invalid taskId/i);
  });

  it('accepts valid taskId format', async () => {
    const { GET } = await import('../../app/api/log-snapshot/route.js');
    const req = new Request('http://localhost/api/log-snapshot?taskId=story-0&findingId=S0-B1');
    const res = await GET(req);
    const body = await res.json();
    // Should not fail on validation — may return null snapshot since files don't exist
    expect(body.ok).toBe(true);
  });
});
