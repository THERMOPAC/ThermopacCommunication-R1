// ─────────────────────────────────────────────────────────────────────────────
// LLX — Governed Common Hydraulic Design Criteria (Single Source of Truth)
//
// Engineering design criteria for the LLX extraction column screening suite.
// ALL three engines (C3 Generic Hydraulic, C4 ECP, C5 ECR) consume these
// constants — they must NEVER be duplicated in individual engine files.
//
// Governance:
//   • GOVERNED_UTILIZATION_BAND — applied as the default screening criterion
//     when the workspace engineer has not explicitly overridden it.
//     "40–80 % of vendor-rated capacity" is the agreed project screening basis.
//     This is an engineering criterion, not a numerical solver tolerance.
//
//   • GOVERNED_HOLDUP_BOUNDS — lower and upper dispersed-phase holdup limits
//     within which the generic slip model root is sought. Roots outside these
//     bounds are physically implausible or outside the model's applicability.
//     0.005: minimum meaningful holdup (avoids near-zero root artefacts).
//     0.60:  moderate-holdup applicability limit of the Godfrey slip model.
//
//   • GOVERNED_SCREENING_BAND — C3 generic hydraulic screening band (same
//     40–80 % values as the utilization band; independent constant so C3 can
//     evolve separately from C4/C5 if the project changes its basis).
//
// Numerical solver tolerances (NOT engineering criteria — NOT in this file):
//   RATIO_TOLERANCE = 0.001       (0.1 % solvent-basis consistency check)
//   DEFAULT_ROOT_ISOLATION_TOL = 0.02  (holdup branch isolation, bisection)
//   These live as local constants in the engine files that use them and have
//   no design output effect; they govern solver acceptance only.
// ─────────────────────────────────────────────────────────────────────────────

/** Agreed project screening band: 40–80 % of vendor-rated capacity (C4/C5). */
export const GOVERNED_UTILIZATION_BAND = { min: 40, max: 80 } as const;

/**
 * Holdup search bounds for the generic C3 slip-model root solver.
 * min = 0.005: avoids near-zero root artefacts.
 * max = 0.60:  moderate-holdup applicability limit of the Godfrey slip model.
 */
export const GOVERNED_HOLDUP_BOUNDS = { min: 0.005, max: 0.60 } as const;

/**
 * C3 generic hydraulic screening band (40–80 % of generic maximum).
 * Same agreed values as GOVERNED_UTILIZATION_BAND but a separate constant so
 * the C3 generic basis can be updated independently of C4/C5 if needed.
 *
 * SUSPENDED — no governed engineering source has been established for the
 * 40–80 % criterion in the context of the C3 generic Godfrey slip model.
 * The C3 engine currently reports ONLY:
 *   'hydraulically_feasible'   — holdup solution exists and % of maximum < 100 %
 *   'hydraulically_infeasible' — no holdup solution, or % of maximum ≥ 100 %
 * Band-derived classifications ('within_screening_band', 'above_screening_band',
 * 'below_minimum_loading_band') are withdrawn until a governed literature or
 * project-approved source is documented and cited here.
 */
export const GOVERNED_SCREENING_BAND = { min: 40, max: 80 } as const;
