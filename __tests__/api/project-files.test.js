import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

vi.mock('../../lib/project-loader', () => ({
  getProjectConfig: () => ({
    project: { workspace: '/tmp/test-workspace' },
  }),
}));

describe('project-files route', () => {
  it('requires folder param', async () => {
    const { GET } = await import('../../app/api/project-files/route.js');
    const req = new Request('http://localhost/api/project-files');
    const res = await GET(req);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/folder/i);
  });

  it('rejects unknown folder values', async () => {
    const { GET } = await import('../../app/api/project-files/route.js');
    const req = new Request('http://localhost/api/project-files?folder=secrets');
    const res = await GET(req);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Unknown folder/i);
  });

  it('handles file param with traversal attempt gracefully', async () => {
    const { GET } = await import('../../app/api/project-files/route.js');
    // Even if workspace dir doesn't exist, should not crash — returns exists: false
    const req = new Request('http://localhost/api/project-files?folder=memory&file=../../../etc/passwd');
    const res = await GET(req);
    const body = await res.json();
    // Should either reject traversal or return "not found" — never serve the file
    expect(body.error !== undefined || body.exists === false).toBe(true);
  });
});
