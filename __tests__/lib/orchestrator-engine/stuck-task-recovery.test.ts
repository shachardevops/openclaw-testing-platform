import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockRegistry, mockSpawnAgent } = vi.hoisted(() => ({
  mockRegistry: new Map(),
  mockSpawnAgent: vi.fn(),
}));

vi.mock('@/lib/session-manager', () => ({
  default: {
    get registry() { return mockRegistry; },
    nudge: vi.fn(() => ({ ok: true })),
    swapModel: vi.fn(() => ({ ok: true })),
    killSession: vi.fn(() => ({ ok: true })),
    _sendNudge: vi.fn(() => 'nudge-msg'),
    _sendSwap: vi.fn(() => 'swap-msg'),
    _sendKill: vi.fn(() => 'kill-msg'),
    _purgeFromIndex: vi.fn(),
  },
}));

import { OrchestratorEngine } from '@/lib/orchestrator-engine';

vi.mock('@/lib/project-loader', () => ({
  getProjectConfig: () => ({
    project: {
      id: 'test-project',
      workspace: '/tmp/test',
      messageTemplates: {},
      sessionManager: { escalation: {} },
    },
  }),
}));

vi.mock('@/lib/config', () => ({
  bridgeLogPath: () => '/tmp/test-bridge.log',
  resultsDir: () => '/tmp/test-results',
}));

vi.mock('@/lib/direct-ai', () => ({ askWithGatewayFallback: vi.fn() }));

vi.mock('@/lib/openclaw', () => ({
  getControllerSessionId: () => 'ctrl-1',
  spawnAgent: (...args: any[]) => mockSpawnAgent(...args),
  listSessionsSync: () => [],
}));

vi.mock('@/lib/app-health', () => ({ default: { isHealthy: () => true } }));
vi.mock('@/lib/learning-loop', () => ({ default: { learnFromOrchestratorDecision: vi.fn() } }));
vi.mock('@/lib/drift-detector', () => ({ default: { getStatus: () => ({ recentDriftEvents: [] }), recordCheckpoint: vi.fn(), evaluateAll: () => [] } }));
vi.mock('@/lib/audit-trail', () => ({ default: { systemEvent: vi.fn(), driftEvent: vi.fn() } }));
vi.mock('@/lib/consensus-validator', () => ({ default: { registerVoter: vi.fn() } }));
vi.mock('@/lib/self-healing', () => ({ default: { shouldRetryTask: () => ({ shouldRetry: false }) } }));
vi.mock('@/lib/task-claims', () => ({ default: {} }));
vi.mock('@/lib/token-tracker', () => ({ default: {} }));
vi.mock('@/lib/memory-tiers', () => ({ default: { setWorking: vi.fn() } }));
vi.mock('@/lib/service-registry', () => ({ registry: { register: vi.fn() } }));

// Mock fs — task is running but no session exists (stuck task scenario)
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const readFileMock = vi.fn(async (p: string) => {
    if (typeof p === 'string' && p.includes('stuck-task.json')) {
      return JSON.stringify({
        status: 'running',
        model: 'anthropic/claude-sonnet-4-6',
        startedAt: new Date(Date.now() - 600000).toISOString(),
      });
    }
    return '{}';
  });
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((p: string) => {
        if (typeof p === 'string' && p.includes('test-results')) return true;
        if (typeof p === 'string' && p.includes('cooldown')) return false;
        return false;
      }),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: vi.fn(),
      appendFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      promises: {
        readdir: vi.fn(async (p: string) => {
          if (typeof p === 'string' && p.includes('test-results')) return ['stuck-task.json'];
          return [];
        }),
        readFile: readFileMock,
        writeFile: vi.fn(async () => {}),
        appendFile: vi.fn(async () => {}),
        mkdir: vi.fn(async () => {}),
        access: vi.fn(async () => {}),
      },
    },
  };
});

describe('Stuck Task Recovery', () => {
  let engine: InstanceType<typeof OrchestratorEngine>;

  beforeEach(() => {
    mockRegistry.clear();
    mockSpawnAgent.mockClear();
    engine = new OrchestratorEngine();
    engine.setAutonomyLevel(3);
    (engine as any)._rateLimiter = { canSend: () => true, record: vi.fn(), remaining: 6, maxPerMinute: 6 };
  });

  it('detects stuck task (running status, no session) and respawns', async () => {
    // No sessions in registry — stuck-task is running but has no session
    await engine._evaluate();

    expect(mockSpawnAgent).toHaveBeenCalled();
    const call = mockSpawnAgent.mock.calls[0];
    expect(call[0]).toBe('ctrl-1'); // controller session
    expect(call[1]).toContain('[dashboard-run]');
    expect(call[1]).toContain('stuck-task');
  });

  it('tracks pending recovery and waits for timeout before retrying', async () => {
    await engine._evaluate();
    expect(mockSpawnAgent).toHaveBeenCalledTimes(1);

    // Second tick — recovery is pending, should not respawn again
    mockSpawnAgent.mockClear();
    await engine._evaluate();
    expect(mockSpawnAgent).not.toHaveBeenCalled();
  });

  it('skips recovery for tasks within grace period', async () => {
    const fs = await import('fs');
    (fs.default.promises.readFile as any).mockImplementation(async (p: string) => {
      if (typeof p === 'string' && p.includes('stuck-task.json')) {
        return JSON.stringify({
          status: 'running',
          model: 'anthropic/claude-sonnet-4-6',
          startedAt: new Date().toISOString(), // just started
        });
      }
      return '{}';
    });

    await engine._evaluate();
    expect(mockSpawnAgent).not.toHaveBeenCalled();
  });

  it('manualRecover triggers recovery for a task', async () => {
    const result = await engine.manualRecover('stuck-task');
    expect(result.ok).toBe(true);
  });
});
