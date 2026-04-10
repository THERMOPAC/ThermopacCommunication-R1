export interface AutomationContext {
  runId: string;
  projectId: number;
  triggerUserId: number;
  actorType: 'system';
  actorRef: 'full_auto_orchestrator';
  startedAt: Date;
  currentPhase: number;
  currentStep: string;
}

export interface StepResult {
  step: string;
  phase: number;
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  entityId?: number;
  entityType?: string;
  docNumber?: string;
  error?: string;
  timestamp: string;
}

export interface PipelineResult {
  success: boolean;
  runId: string;
  projectId: number;
  phasesCompleted: number;
  stepResults: StepResult[];
  failedStep?: string;
  failedError?: string;
  duration: number;
}

export const STALE_THRESHOLD_MS = 10 * 60 * 1000;
