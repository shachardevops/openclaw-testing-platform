// Project configuration types — derived from config/<projectId>/*.json shapes

export interface MessageTemplates {
  run: string;
  cancel: string;
  nudge?: string;
  chat?: string;
  kill?: string;
  modelSwap?: string;
}

export interface TargetAppConfig {
  name?: string;
  path?: string;
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
  swapThresholdMs?: number;
  killThresholdMs?: number;
}

export interface SessionManagerConfig {
  escalation?: SessionManagerEscalation;
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

export interface SelfHealingConfig {
  enabled?: boolean;
  maxRetries?: number;
  initialDelayMs?: number;
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

export interface ProjectConfig {
  id: string;
  name: string;
  subtitle?: string;
  icon?: string;
  workspace: string;
  messageTemplates: MessageTemplates;
  targetApp?: TargetAppConfig;
  modelFallback?: ModelFallback;
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
}

export interface ModelDefinition {
  id: string;
  short: string;
  name: string;
  provider?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description?: string;
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
