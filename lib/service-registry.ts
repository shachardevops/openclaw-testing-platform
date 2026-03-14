/**
 * Service Registry — typed dependency injection for singleton services.
 *
 * Usage:
 *   // Register (in each singleton file):
 *   registry.register('sessionManager', () => sessionManager);
 *
 *   // Consume (lazy resolution):
 *   const sm = registry.get('sessionManager');
 *
 *   // Test override:
 *   registry.override('sessionManager', mockSessionManager);
 *   registry.reset(); // clear all overrides
 */

import type { ISessionManager } from './interfaces/session-manager';
import type { IDriftDetector } from './interfaces/drift-detector';
import type { IConsensusValidator } from './interfaces/consensus-validator';
import type { ISelfHealing } from './interfaces/self-healing';
import type { ITaskClaims } from './interfaces/task-claims';
import type { ITokenTracker } from './interfaces/token-tracker';
import type { ILearningLoop } from './interfaces/learning-loop';
import type { IMemoryManager } from './interfaces/memory-manager';
import type { IAppHealth } from './interfaces/app-health';
import type { IAuditTrail } from './interfaces/audit-trail';
import type { IOrchestratorEngine } from './interfaces/orchestrator-engine';

export interface ServiceMap {
  sessionManager: ISessionManager;
  driftDetector: IDriftDetector;
  consensusValidator: IConsensusValidator;
  selfHealing: ISelfHealing;
  taskClaims: ITaskClaims;
  tokenTracker: ITokenTracker;
  learningLoop: ILearningLoop;
  memoryManager: IMemoryManager;
  appHealth: IAppHealth;
  auditTrail: IAuditTrail;
  orchestratorEngine: IOrchestratorEngine;
}

type Factory<T> = () => T;

class ServiceRegistry {
  private factories = new Map<string, Factory<unknown>>();
  private instances = new Map<string, unknown>();

  register<K extends keyof ServiceMap>(name: K, factory: Factory<ServiceMap[K]>): void {
    this.factories.set(name, factory);
    this.instances.delete(name);
  }

  get<K extends keyof ServiceMap>(name: K): ServiceMap[K] {
    let instance = this.instances.get(name);
    if (!instance) {
      const factory = this.factories.get(name);
      if (!factory) throw new Error(`Service '${name}' not registered`);
      instance = factory();
      this.instances.set(name, instance);
    }
    return instance as ServiceMap[K];
  }

  /** Replace a service with a mock (for testing) */
  override<K extends keyof ServiceMap>(name: K, instance: ServiceMap[K]): void {
    this.instances.set(name, instance);
  }

  /** Clear all cached instances (for testing) */
  reset(): void {
    this.instances.clear();
  }

  /** Check if a service is registered */
  has(name: keyof ServiceMap): boolean {
    return this.factories.has(name) || this.instances.has(name);
  }
}

export const registry = new ServiceRegistry();
export default registry;
