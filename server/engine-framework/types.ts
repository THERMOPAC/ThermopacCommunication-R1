// ═══════════════════════════════════════════════════════════════════════════════
// Design Software — Calculation Engine Framework: Types
//
// IDesignEngine is the single interface every technology module must implement.
// No engine may duplicate calculations that exist in CommonEngineeringLibrary.
// ═══════════════════════════════════════════════════════════════════════════════

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface CalculationContext {
  revisionId: number;
  designId: number;
  moduleType: string;
  userId: number;
  /** Classification stamped on all results. Default: 'Preliminary Screening'. */
  calculationClass?: string;
}

export interface EngineWarning {
  code: string;
  message: string;
  field?: string;
}

export interface CalculationResult {
  status: 'success' | 'warning' | 'error';
  /** Structured output data — schema is engine-specific. */
  data: Record<string, unknown>;
  warnings: EngineWarning[];
  validationIssues: ValidationError[];
  calculationClass: string;
  engineId: string;
  engineVersion: string;
  computedAt: Date;
}

export interface OptimisationObjective {
  parameter: string;
  target: 'minimize' | 'maximize' | 'approach';
  /** Target value when target = 'approach'. */
  value?: number;
  weight?: number;
}

export interface OptimisationBound {
  parameter: string;
  min?: number;
  max?: number;
}

export interface OptimisationConstraints {
  objectives: OptimisationObjective[];
  bounds: OptimisationBound[];
  maxIterations?: number;
  tolerance?: number;
}

export interface OptimisationResult {
  converged: boolean;
  optimalInputs: Record<string, unknown>;
  optimalOutputs: Record<string, unknown>;
  iterations: number;
  finalObjectiveValue?: number;
}

export interface KeyResult {
  label: string;
  value: unknown;
  unit?: string;
  highlight?: boolean;
}

export interface DesignSummary {
  keyResults: KeyResult[];
  recommendations: string[];
  warnings: string[];
  calculationClass: string;
}

/**
 * IDesignEngine — the common contract for all Design Software technology engines.
 *
 * Every engine must implement:
 *   validate()        — check inputs before calculation
 *   calculate()       — run the calculation and return results
 *   generateSummary() — produce a human-readable summary from stored results
 *   getEngineVersion()
 *
 * optimise() is optional — implement only when the engine supports it.
 *
 * Engines MUST NOT duplicate calculations from CommonEngineeringLibrary.
 * Call library functions for unit conversion, dimensionless numbers, etc.
 */
export interface IDesignEngine {
  /** Stable, unique identifier: '{moduleType}-{calculationType}' e.g. 'llx-hydraulics' */
  getEngineId(): string;
  /** Semantic version string, e.g. '1.0.0' */
  getEngineVersion(): string;
  /** Module this engine belongs to, e.g. 'llx' */
  getModuleType(): string;
  /** Calculation type this engine handles, e.g. 'hydraulics_common' */
  getCalculationType(): string;

  /** Validate inputs synchronously. Called before calculate(). */
  validate(inputs: Record<string, unknown>): ValidationResult;

  /** Run the calculation. Must not throw — return status:'error' on failure. */
  calculate(
    inputs: Record<string, unknown>,
    context: CalculationContext,
  ): Promise<CalculationResult>;

  /** Optional: find optimal inputs given objectives and bounds. */
  optimise?(
    inputs: Record<string, unknown>,
    context: CalculationContext,
    constraints: OptimisationConstraints,
  ): Promise<OptimisationResult>;

  /** Produce a human-readable summary from previously stored result data. */
  generateSummary(results: Record<string, unknown>): DesignSummary;
}
