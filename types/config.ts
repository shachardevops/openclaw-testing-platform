// Project configuration types — derived from config/<projectId>/*.json shapes

export interface MessageTemplates {
  run: string;
  cancel: string;
  nudge?: string;
  chat?: string;
  kill?: string;
  modelSwap?: string;
  nudgeCooldownMs?: number;
}

export interface TargetAppConfig {
  name?: string;
  path?: string;
  command?: string;
  port?: number;
  logFile?: string;
  healthUrl?: string;
}

export interface ModelFallback {
  enabled?: boolean;
  errorPatterns?: string[];
  fallbackModel?: string;
}

export interface SessionManagerEscalation {
  staleThresholdMs?: number;
  nudgeCooldownMs?: number;
  swapThresholdMs?: number;
  killThresholdMs?: number;
}

export interface SessionManagerConfig {
  scanIntervalMs?: number;
  maxActiveSessions?: number;
  escalation?: SessionManagerEscalation;
  orphanMaxAgeMs?: number;
}

export interface DriftDetectionConfig {
  enabled?: boolean;
  silenceThresholdMs?: number;
  loopHashWindowSize?: number;
  maxCheckpoints?: number;
}

export interface AuditTrailConfig {
  enabled?: boolean;
  maxMemoryEvents?: number;
  flushIntervalMs?: number;
  maxFileEvents?: number;
  chainValidation?: boolean;
}

export interface TaskClaimsConfig {
  enabled?: boolean;
  defaultTtlMs?: number;
  maxClaims?: number;
}

export interface ConsensusConfig {
  enabled?: boolean;
  quorumRatio?: number;
  maxDecisionHistory?: number;
}

export interface SelfHealingCircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
}

export interface SelfHealingConfig {
  enabled?: boolean;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
  initialDelayMs?: number;
  circuitBreaker?: SelfHealingCircuitBreakerConfig;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

export interface VectorMemoryConfig {
  enabled?: boolean;
  dimensions?: number;
  collections?: Record<string, { maxVectors: number }>;
  similarityThreshold?: number;
  enableLearning?: boolean;
  fallbackToKeyword?: boolean;
  persistDir?: string | null;
}

export interface MemoryTiersConfig {
  enabled?: boolean;
  workingMemoryMax?: number;
  workingMemoryTtlMs?: number;
  episodicMax?: number;
  episodicHalfLifeMs?: number;
  semanticMax?: number;
  semanticMinImportance?: number;
  consolidationIntervalMs?: number;
}

export interface TokenTrackingConfig {
  enabled?: boolean;
  costPerToken?: Record<string, { input: number; output: number }>;
  budgetAlertThreshold?: number;
}

export interface QualityGatesConfig {
  enabled?: boolean;
  enforceOnPipeline?: boolean;
  enforceOnFinalize?: boolean;
  rules?: {
    minPassRate?: number;
    maxP1Bugs?: number;
    maxFailures?: number;
    requireReport?: boolean;
    customChecks?: Array<{ field: string; operator: string; value: any; severity?: string }>;
  };
  failAction?: string;
  gates?: QualityGate[];
}

export interface QualityGate {
  name?: string;
  minPassRate?: number;
  maxP1Bugs?: number;
  maxFailures?: number;
  requireReport?: boolean;
  failAction?: 'warn' | 'block';
  custom?: Array<{ check: string; threshold: number }>;
}

export interface LearningLoopConfig {
  enabled?: boolean;
  maxPatterns?: number;
  consolidationThreshold?: number;
}

export interface OrchestratorConfig {
  enabled?: boolean;
  autonomyLevel?: number;
  recoveryCooldownMs?: number;
  taskStartGracePeriodMs?: number;
  maxControllerMessagesPerMinute?: number;
  aiConsultationEnabled?: boolean;
  decisionMemoryFile?: string;
  recoveryTimeoutMs?: number;
  maxRecoveryAttempts?: number;
}

export interface ProjectConfig {
  id: string;
  name: string;
  subtitle?: string;
  icon?: string;
  workspace: string;
  messageTemplates: MessageTemplates;
  targetApp?: TargetAppConfig;
  modelFallback?: ModelFallback;
  orchestrator?: OrchestratorConfig;
  sessionManager?: SessionManagerConfig;
  driftDetection?: DriftDetectionConfig;
  auditTrail?: AuditTrailConfig;
  taskClaims?: TaskClaimsConfig;
  consensus?: ConsensusConfig;
  selfHealing?: SelfHealingConfig;
  vectorMemory?: VectorMemoryConfig;
  memoryTiers?: MemoryTiersConfig;
  tokenTracking?: TokenTrackingConfig;
  qualityGates?: QualityGatesConfig;
  learningLoop?: LearningLoopConfig;
}

export interface TaskDefinition {
  id: string;
  num: number;
  title: string;
  description?: string;
  story?: string;
  defaultModel?: string;
  defaultSkills?: string[];
  tags?: string[];
  icon?: string;
  actor?: string;
  desc?: string;
  deps?: string[];
}

export interface ModelDefinition {
  id: string;
  short: string;
  name: string;
  provider?: string;
  color?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  [key: string]: unknown;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  taskIds: string[];
}

export interface PipelineConfig {
  controllerSessionId?: string;
  [key: string]: unknown;
}

export interface FullProjectConfig {
  project: ProjectConfig;
  tasks: TaskDefinition[];
  models: ModelDefinition[];
  skills: SkillDefinition[];
  pipelines: PipelineDefinition[];
  pipelineConfig: PipelineConfig;
}
