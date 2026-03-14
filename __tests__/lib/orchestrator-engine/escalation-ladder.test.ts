import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted so mock references are available when vi.mock factories run
const { mockRegistry, mockSendNudge, mockSendSwap, mockSendKill, mockPurge } = vi.hoisted(() => ({
  mockRegistry: new Map(),
  mockSendNudge: vi.fn(() => 'nudge-msg'),
  mockSendSwap: vi.fn(() => 'swap-msg'),
  mockSendKill: vi.fn(() => 'kill-msg'),
  mockPurge: vi.fn(),
}));

vi.mock('@/lib/session-manager', () => ({
  default: {
    get registry() { return mockRegistry; },
    nudge: vi.fn(() => ({ ok: true })),
    swapModel: vi.fn(() => ({ ok: true })),
    killSession: vi.fn(() => ({ ok: true })),
    _sendNudge: mockSendNudge,
    _sendSwap: mockSendSwap,
    _sendKill: mockSendKill,
    _purgeFromIndex: mockPurge,
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

vi.mock('@/lib/direct-ai', () => ({
  askWithGatewayFallback: vi.fn(),
}));

vi.mock('@/lib/openclaw', () => ({
  getControllerSessionId: () => 'ctrl-1',
  spawnAgent: vi.fn(),
  listSessionsSync: () => [],
}));

vi.mock('@/lib/app-health', () => ({
  default: { isHealthy: () => true },
}));

vi.mock('@/lib/learning-loop', () => ({
  default: { learnFromOrchestratorDecision: vi.fn() },
}));

vi.mock('@/lib/drift-detector', () => ({
  default: { getStatus: () => ({ recentDriftEvents: [] }), recordCheckpoint: vi.fn(), evaluateAll: () => [] },
}));

vi.mock('@/lib/audit-trail', () => ({
  default: { systemEvent: vi.fn(), driftEvent: vi.fn() },
}));

vi.mock('@/lib/consensus-validator', () => ({
  default: { registerVoter: vi.fn() },
}));

vi.mock('@/lib/self-healing', () => ({
  default: { shouldRetryTask: () => ({ shouldRetry: false }) },
}));

vi.mock('@/lib/task-claims', () => ({ default: {} }));
vi.mock('@/lib/token-tracker', () => ({ default: {} }));
vi.mock('@/lib/memory-tiers', () => ({ default: { setWorking: vi.fn() } }));
vi.mock('@/lib/service-registry', () => ({ registry: { register: vi.fn() } }));

// Mock fs to control results directory reads
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((p: string) => {
        if (typeof p === 'string' && p.includes('test-results')) return true;
        if (typeof p === 'string' && p.includes('decision-memory')) return false;
        if (typeof p === 'string' && p.includes('cooldown')) return false;
        return actual.existsSync(p);
      }),
      readdirSync: vi.fn((p: string) => {
        if (typeof p === 'string' && p.includes('test-results')) return ['task-1.json'];
        return actual.readdirSync(p);
      }),
      readFileSync: vi.fn((p: string, encoding?: string) => {
        if (typeof p === 'string' && p.includes('task-1.json')) {
          return JSON.stringify({ status: 'running', model: 'anthropic/claude-sonnet-4-6', startedAt: new Date(Date.now() - 600000).toISOString() });
        }
        if (typeof p === 'string' && p.includes('decision-memory')) return '{}';
        return actual.readFileSync(p, encoding as any);
      }),
      writeFileSync: vi.fn(),
      appendFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
  };
});

function createStaleEntry(sessionId: string, taskId: string, ageMs: number, escalationOverrides: Record<string, any> = {}) {
  return {
    sessionId,
    key: `session-key-${sessionId}`,
    taskId,
    model: 'anthropic/claude-sonnet-4-6',
    status: 'stale',
    ageMs,
    isController: false,
    escalation: {
      level: 0,
      nudgeCount: 0,
      swapCount: 0,
      lastNudgeAt: 0,
      lastSwapAt: 0,
      lastKillAt: 0,
      ...escalationOverrides,
    },
  };
}

describe('Escalation Ladder', () => {
  let engine: InstanceType<typeof OrchestratorEngine>;

  beforeEach(() => {
    mockRegistry.clear();
    mockSendNudge.mockClear();
    mockSendSwap.mockClear();
    mockSendKill.mockClear();
    engine = new OrchestratorEngine();
    // Set autonomy to 3 (autonomous) so all actions are auto-executed
    engine.setAutonomyLevel(3);
    // Initialize rate limiter manually
    (engine as any)._rateLimiter = { canSend: () => true, record: vi.fn(), remaining: 6, maxPerMinute: 6 };
  });

  it('L1: nudges stale session after staleThresholdMs (3min)', async () => {
    const entry = createStaleEntry('s1', 'task-1', 200000); // 200s > 180s default
    mockRegistry.set('s1', entry);

    await engine._evaluate();

    expect(mockSendNudge).toHaveBeenCalledWith(entry, expect.any(Object));
    expect(entry.escalation.level).toBe(1);
    expect(entry.escalation.nudgeCount).toBe(1);
  });

  it('L2: swaps model after swapThresholdMs when already nudged', async () => {
    const entry = createStaleEntry('s1', 'task-1', 500000, {
      level: 1,
      nudgeCount: 1,
      lastNudgeAt: Date.now() - 300000,
    }); // 500s > 480s swap threshold
    mockRegistry.set('s1', entry);

    await engine._evaluate();

    expect(mockSendSwap).toHaveBeenCalled();
    expect(entry.escalation.level).toBe(2);
    expect(entry.escalation.swapCount).toBe(1);
  });

  it('L3: kills session after killThresholdMs when already swapped', async () => {
    const entry = createStaleEntry('s1', 'task-1', 1000000, {
      level: 2,
      nudgeCount: 1,
      swapCount: 1,
      lastNudgeAt: Date.now() - 600000,
      lastSwapAt: Date.now() - 400000,
    }); // 1000s > 900s kill threshold
    mockRegistry.set('s1', entry);

    await engine._evaluate();

    expect(mockSendKill).toHaveBeenCalledWith(entry, expect.any(Object));
    expect(entry.escalation.level).toBe(3);
  });

  it('skips escalation for sessions within grace period', async () => {
    const entry = createStaleEntry('s1', 'task-1', 200000);
    mockRegistry.set('s1', entry);

    // Override the results to show task started recently (within grace period)
    const fs = await import('fs');
    (fs.default.readFileSync as any).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('task-1.json')) {
        return JSON.stringify({ status: 'running', model: 'anthropic/claude-sonnet-4-6', startedAt: new Date().toISOString() });
      }
      return '{}';
    });

    await engine._evaluate();

    expect(mockSendNudge).not.toHaveBeenCalled();
    expect(entry.escalation.level).toBe(0);
  });

  it('skips escalation for completed tasks', async () => {
    const entry = createStaleEntry('s1', 'task-1', 200000);
    entry.escalation.level = 1; // previously nudged
    mockRegistry.set('s1', entry);

    const fs = await import('fs');
    (fs.default.readFileSync as any).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('task-1.json')) {
        return JSON.stringify({ status: 'passed', model: 'anthropic/claude-sonnet-4-6' });
      }
      return '{}';
    });

    await engine._evaluate();

    expect(entry.escalation.level).toBe(0); // reset
    expect(mockSendNudge).not.toHaveBeenCalled();
  });

  it('resets escalation when session becomes healthy', async () => {
    const entry = createStaleEntry('s1', 'task-1', 200000);
    entry.status = 'healthy';
    entry.escalation.level = 2;
    mockRegistry.set('s1', entry);

    await engine._evaluate();

    expect(entry.escalation.level).toBe(0);
  });

  it('purges orphaned sessions after orphanMaxAgeMs', async () => {
    const entry = {
      sessionId: 's-orphan',
      key: 'key-orphan',
      taskId: null,
      model: 'unknown',
      status: 'orphaned',
      ageMs: 2000000, // 2000s > 1800s default orphan threshold
      isController: false,
      escalation: { level: 0, nudgeCount: 0, swapCount: 0 },
    };
    mockRegistry.set('s-orphan', entry);

    await engine._evaluate();

    expect(mockPurge).toHaveBeenCalledWith(['s-orphan']);
  });

  it('kills duplicate sessions immediately', async () => {
    const entry = {
      sessionId: 's-dup',
      key: 'key-dup',
      taskId: 'task-1',
      model: 'anthropic/claude-sonnet-4-6',
      status: 'duplicate',
      ageMs: 5000,
      isController: false,
      escalation: { level: 0, nudgeCount: 0, swapCount: 0 },
    };
    mockRegistry.set('s-dup', entry);

    await engine._evaluate();

    expect(mockSendKill).toHaveBeenCalledWith(entry, expect.any(Object));
  });
});
