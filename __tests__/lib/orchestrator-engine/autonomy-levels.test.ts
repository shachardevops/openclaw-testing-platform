import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestratorEngine, AUTONOMY_LEVELS } from '@/lib/orchestrator-engine';

// Mock all heavy dependencies
vi.mock('@/lib/session-manager', () => ({
  default: {
    registry: new Map(),
    nudge: vi.fn(() => ({ ok: true })),
    swapModel: vi.fn(() => ({ ok: true })),
    killSession: vi.fn(() => ({ ok: true })),
    _sendNudge: vi.fn(() => 'nudge-msg'),
    _sendSwap: vi.fn(() => 'swap-msg'),
    _sendKill: vi.fn(() => 'kill-msg'),
    _purgeFromIndex: vi.fn(),
  },
}));

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

vi.mock('@/lib/task-claims', () => ({
  default: {},
}));

vi.mock('@/lib/token-tracker', () => ({
  default: {},
}));

vi.mock('@/lib/memory-tiers', () => ({
  default: { setWorking: vi.fn() },
}));

vi.mock('@/lib/service-registry', () => ({
  registry: { register: vi.fn() },
}));

describe('Autonomy Levels', () => {
  let engine: InstanceType<typeof OrchestratorEngine>;

  beforeEach(() => {
    engine = new OrchestratorEngine();
  });

  describe('AUTONOMY_LEVELS definition', () => {
    it('defines 5 levels (0-4)', () => {
      expect(Object.keys(AUTONOMY_LEVELS)).toHaveLength(5);
      expect(AUTONOMY_LEVELS[0]).toBeDefined();
      expect(AUTONOMY_LEVELS[4]).toBeDefined();
    });

    it('level 0 (manual) blocks all auto actions', () => {
      const l0 = AUTONOMY_LEVELS[0];
      expect(l0.name).toBe('manual');
      expect(l0.autoNudge).toBe(false);
      expect(l0.autoSwap).toBe(false);
      expect(l0.autoKill).toBe(false);
      expect(l0.autoRecover).toBe(false);
      expect(l0.aiConsult).toBe(false);
    });

    it('level 1 (supervised) allows only nudge', () => {
      const l1 = AUTONOMY_LEVELS[1];
      expect(l1.name).toBe('supervised');
      expect(l1.autoNudge).toBe(true);
      expect(l1.autoSwap).toBe(false);
      expect(l1.autoKill).toBe(false);
    });

    it('level 3 (autonomous) allows all actions', () => {
      const l3 = AUTONOMY_LEVELS[3];
      expect(l3.autoNudge).toBe(true);
      expect(l3.autoSwap).toBe(true);
      expect(l3.autoKill).toBe(true);
      expect(l3.autoRecover).toBe(true);
      expect(l3.aiConsult).toBe(true);
    });
  });

  describe('setAutonomyLevel', () => {
    it('sets level and returns result', () => {
      const result = engine.setAutonomyLevel(2);
      expect(result.ok).toBe(true);
      expect(result.level).toBe(2);
      expect(result.name).toBe('guided');
      expect(engine.autonomyLevel).toBe(2);
    });

    it('clamps level to 0-4 range', () => {
      engine.setAutonomyLevel(-1);
      expect(engine.autonomyLevel).toBe(0);

      engine.setAutonomyLevel(10);
      expect(engine.autonomyLevel).toBe(4);
    });

    it('floors fractional levels', () => {
      engine.setAutonomyLevel(2.7);
      expect(engine.autonomyLevel).toBe(2);
    });
  });

  describe('confirmAction / denyAction', () => {
    it('confirms a pending confirmation', () => {
      // Access internal _pendingConfirmations to set up a pending action
      const conf = {
        id: 'conf-test-1',
        actionType: 'nudge',
        context: { conditionType: 'stale', target: 'session-1', sessionId: 'session-1' },
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      (engine as any)._pendingConfirmations.push(conf);

      const result = engine.confirmAction('conf-test-1');
      expect(result.ok).toBe(true);
    });

    it('returns error for nonexistent confirmation', () => {
      const result = engine.confirmAction('nonexistent');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('denies a pending confirmation', () => {
      const conf = {
        id: 'conf-test-2',
        actionType: 'kill',
        context: { conditionType: 'stale', target: 'session-1', sessionId: 'session-1' },
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      (engine as any)._pendingConfirmations.push(conf);

      const result = engine.denyAction('conf-test-2');
      expect(result.ok).toBe(true);
      expect((engine as any)._pendingConfirmations).toHaveLength(0);
    });
  });
});
