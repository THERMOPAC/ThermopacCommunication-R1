// ═══════════════════════════════════════════════════════════════════════════════
// Design Software — Common Engineering Library (CEL) — public facade
//
// Reusable, validated engineering functions shared across ALL technology engines.
// No engine may duplicate these; they must call CEL instead.
//
// STATUS: Stage C Level 1 — implemented modules live under ./cel and ./epd:
//   - Unit conversion, formatting, validation guards      (cel/unit-conversion, cel/utilities)
//   - Numerical solvers (bisection, Newton-Raphson, etc.) (cel/numerical)
//   - Dimensionless numbers (Re, We, Fr, Eo, Mo)          (cel/dimensionless)
//   - Hydraulic utilities (drag, terminal velocity,
//     interfacial area, Thornton flooding)                (cel/hydraulics)
//   - Engineering Property Database (water, NMP, RRBO)    (epd/*)
//
// Deferred (throw NotImplementedError until a future stage):
//   heat transfer, mass-transfer coefficients, diffusivity, friction factors.
// ═══════════════════════════════════════════════════════════════════════════════

export class NotImplementedError extends Error {
  constructor(fn: string) {
    super(`CEL function '${fn}' is deferred — not required for LLX Level 1 scope.`);
    this.name = 'NotImplementedError';
  }
}

// ── Implemented (Stage C Level 1) ─────────────────────────────────────────────

export * from './cel/index';
export * from './epd/index';

// ── Deferred stubs (explicit — no silent misuse) ──────────────────────────────

/** Schmidt number: Sc = μ / (ρ·D). [DEFERRED — mass transfer stage] */
export function schmidt(density: number, dynamicViscosity: number, diffusivity: number): number {
  throw new NotImplementedError('schmidt');
}

/** Sherwood number (mass transfer). [DEFERRED — mass transfer stage] */
export function sherwood(re: number, sc: number): number {
  throw new NotImplementedError('sherwood');
}

/** Lookup diffusivity of solute in solvent. [DEFERRED — mass transfer stage] */
export function lookupDiffusivity(
  solute: string,
  solvent: string,
  temperatureK: number,
  viscosityPas: number,
): number {
  throw new NotImplementedError('lookupDiffusivity');
}

/** Darcy-Weisbach pressure drop. [DEFERRED — piping hydraulics stage] */
export function pressureDropDarcyWeisbach(
  frictionFactor: number,
  length: number,
  diameter: number,
  density: number,
  velocity: number,
): number {
  throw new NotImplementedError('pressureDropDarcyWeisbach');
}

/** Moody friction factor (Colebrook-White). [DEFERRED — piping hydraulics stage] */
export function moodyFrictionFactor(reynoldsNumber: number, relativeRoughness: number): number {
  throw new NotImplementedError('moodyFrictionFactor');
}

/** Overall mass transfer coefficient. [DEFERRED — mass transfer stage] */
export function overallMassTransferCoefficient(
  aqueousFilmCoefficient: number,
  organicFilmCoefficient: number,
  distributionCoefficient: number,
): number {
  throw new NotImplementedError('overallMassTransferCoefficient');
}

/** Number of transfer units (NTU). [DEFERRED — mass transfer stage] */
export function numberOfTransferUnits(
  inletConcentration: number,
  outletConcentration: number,
  equilibriumConcentration: number,
): number {
  throw new NotImplementedError('numberOfTransferUnits');
}

/** Nusselt number (Dittus-Boelter). [DEFERRED — heat transfer stage] */
export function nusseltDittusBoelter(
  reynoldsNumber: number,
  prandtlNumber: number,
  heating: boolean,
): number {
  throw new NotImplementedError('nusseltDittusBoelter');
}
