// ─────────────────────────────────────────────────────────────────────────────
// Fluid Properties Master Data — Thermopac LLX Design Basis (Step 3) defaults.
//
// Governance (Thermopac, Aug 2026): properties without an approved value are
// NOT invented — they stay manual and are clearly marked (Pending Validation
// or Manual/Measured) instead of showing unexplained blanks.
//
// This file is the single source of truth for Fluid Properties defaults; the
// React workspace must import from here and must not hard-code values.
// ─────────────────────────────────────────────────────────────────────────────

/** RRBO feed-grade densities @ 15 °C (kg/m³) — Thermopac Feed Master. */
export const RRBO_FEED_DENSITY_MASTER: Record<string, string> = {
  "Re-Refined Base Oil SN150": "860",
  "Re-Refined Base Oil SN200": "870",
  "Re-Refined Base Oil SN300": "880",
  "Re-Refined Base Oil SN500": "890",
};
export const RRBO_FEED_DENSITY_REF_TEMP = "15";
export const RRBO_FEED_MASTER_SOURCE = "Thermopac Feed Master";

/**
 * RRBO feed-grade viscosities @ 40 °C — Thermopac Master Data (Default).
 * Reasonable starting values until laboratory measurements are available;
 * dynamic values are internally consistent with the density master via
 * μ (mPa·s) = ν (cSt) × ρ@15 °C (kg/m³) / 1000. Engineer may override.
 */
export const RRBO_FEED_VISCOSITY_MASTER: Record<string, { kinematic_cst: string; dynamic_mpas: string }> = {
  "Re-Refined Base Oil SN150": { kinematic_cst: "32", dynamic_mpas: "27.5" },
  "Re-Refined Base Oil SN200": { kinematic_cst: "46", dynamic_mpas: "40.0" },
  "Re-Refined Base Oil SN300": { kinematic_cst: "68", dynamic_mpas: "59.8" },
  "Re-Refined Base Oil SN500": { kinematic_cst: "95", dynamic_mpas: "84.6" },
};
export const RRBO_FEED_VISCOSITY_REF_TEMP = "40";
export const RRBO_VISCOSITY_MASTER_SOURCE = "Thermopac Master Data (Default)";

/** NMP Master Data — approved solvent specification limits. */
export const NMP_MASTER = {
  purity:  { value: "99.5", unit: "wt.% min", source: "NMP Master Data" },
  water:   { value: "0.05", unit: "wt.% max", source: "NMP Master Data" },
};

/** Default text for emulsion behaviour until laboratory data exists. */
export const EMULSION_BEHAVIOUR_DEFAULT =
  "To be confirmed by laboratory phase-separation test";

/** Marker text for two-phase properties without approved data. */
export const PENDING_VALIDATION = "Pending Validation";

/** Provenance notes displayed under auto-populated rows. */
export const FLUID_PROPERTY_PROVENANCE: Record<string, string> = {
  rrbo_density: "Thermopac Feed Master — density of selected feed grade @ 15 °C",
  rrbo_viscosity_dynamic: "Thermopac Master Data (Default) @ 40 °C — starting value until laboratory measurement; engineer may override",
  rrbo_viscosity_kinematic: "Thermopac Master Data (Default) @ 40 °C — starting value until laboratory measurement; engineer may override",
  rrbo_temperature: "Design Basis — Operating Temperature",
  rrbo_water: "Product Requirements — Water target (max)",
  rrbo_colour: "Product Requirements — Product Colour target (max, ASTM D1500)",
  rrbo_sulphur: "Product Requirements — Sulphur target (max)",
  rrbo_asphaltenes: "No approved Thermopac default — Manual/Measured entry required",
  nmp_density: "EPD — source-tagged tabular value at Operating Temperature",
  nmp_viscosity_dynamic: "EPD — source-tagged tabular value at Operating Temperature",
  nmp_temperature: "Design Basis — Operating Temperature",
  nmp_purity: "NMP Master Data",
  nmp_water: "NMP Master Data",
  interfacial_tension: "NMP/RRBO two-phase data required — Pending Validation until laboratory/vendor data entered",
  mutual_solubility: "Laboratory/vendor data required — Pending Validation until entered",
  phase_separation_time: "Thermopac test data — manual entry",
  emulsion_behaviour: "Default text until confirmed by laboratory phase-separation test",
};
