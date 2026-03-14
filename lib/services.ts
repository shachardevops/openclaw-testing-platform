/**
 * Centralized service access via the typed registry.
 *
 * Prefer importing from here instead of direct singleton imports:
 *   import { getAuditTrail, getDriftDetector } from '@/lib/services';
 *
 * This ensures services are accessed through the DI registry,
 * making them mockable in tests and replaceable at runtime.
 */

import { registry } from './service-registry';
import type { ServiceMap } from './service-registry';

// Lazy accessors — each triggers the factory on first call
export function getSessionManager(): ServiceMap['sessionManager'] { return registry.get('sessionManager'); }
export function getDriftDetector(): ServiceMap['driftDetector'] { return registry.get('driftDetector'); }
export function getConsensusValidator(): ServiceMap['consensusValidator'] { return registry.get('consensusValidator'); }
export function getSelfHealing(): ServiceMap['selfHealing'] { return registry.get('selfHealing'); }
export function getTaskClaims(): ServiceMap['taskClaims'] { return registry.get('taskClaims'); }
export function getTokenTracker(): ServiceMap['tokenTracker'] { return registry.get('tokenTracker'); }
export function getLearningLoop(): ServiceMap['learningLoop'] { return registry.get('learningLoop'); }
export function getMemoryManager(): ServiceMap['memoryManager'] { return registry.get('memoryManager'); }
export function getAppHealth(): ServiceMap['appHealth'] { return registry.get('appHealth'); }
export function getAuditTrail(): ServiceMap['auditTrail'] { return registry.get('auditTrail'); }
export function getOrchestratorEngine(): ServiceMap['orchestratorEngine'] { return registry.get('orchestratorEngine'); }
