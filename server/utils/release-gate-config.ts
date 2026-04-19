// ─────────────────────────────────────────────────────────────────────────────
// Release Gate Configuration
//
// Single adjustment point for all drawing release gate rules.
// After real SolidWorks validation, only edit this file — no engine or
// endpoint changes required.
//
// Role strings must exactly match shared/roles.ts values (case-insensitive
// comparison is applied in endpoints).
// ─────────────────────────────────────────────────────────────────────────────

export const RELEASE_GATE_CONFIG = {

  // Roles allowed to approve a drawing (Phase 2 gate)
  approveAllowedRoles: ['Superuser', 'General Manager', 'Senior Manager'],

  // Roles allowed to release a drawing for manufacturing (Phase 3 gate)
  manufacturingReleaseAllowedRoles: ['Superuser', 'General Manager', 'Senior Manager'],

  // If true: manufacturing release requires DDS status = 'pass' exactly.
  // If false: 'warn' (already approved with acknowledgement) is accepted.
  // Adjust after real SolidWorks validation data is available.
  requirePassForManufacturing: false,

  // If true: Material check mismatch is enforced in the comparison.
  // Currently false — MechanicalColumn has no shell material field.
  // Flip to true once schema gap is resolved.
  enforceMaterialCheck: false,

  // Per-field severity overrides. Empty = use FIELD_MAP defaults.
  // Example: { insulation: 'warning' } to downgrade insulation to advisory.
  // Adjust after real SolidWorks extraction data confirms field reliability.
  fieldSeverityOverrides: {} as Record<string, 'critical' | 'warning'>,
};
