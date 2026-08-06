// ═══════════════════════════════════════════════════════════════════════════════
// LLX — Thermopac Preliminary Equipment Screening Defaults (Stage 7)
//
// Purpose: give the C4 (ECP) and C5 (ECR) engines COMPLETE preliminary input
// sets so a screening calculation can run, WITHOUT weakening engine validation
// and WITHOUT hiding defaults inside the engines.
//
// Governance:
//  • Every default is visible in the Stage 7 UI, editable by the engineer,
//    tagged Source Type: Assumed with an explicit Thermopac default reference,
//    entered in the assumptions register, and classified Pending Validation by
//    the engines until replaced by approved vendor/measured/project data.
//  • The packing records below are PRELIMINARY SCREENING RECORDS ONLY — not
//    vendor-certified rating records. No proprietary geometry, pressure-drop
//    curve, flooding curve, capacity curve, or vendor HETS is invented: those
//    fields are deliberately ABSENT so the C4 engine reports them as Pending
//    Validation / Not Calculable.
//  • The three mandatory registry fields (size, specific surface area, void
//    fraction) are populated with clearly-tagged Assumed generic
//    structured-packing literature values — NOT Sulzer-certified data.
// ═══════════════════════════════════════════════════════════════════════════════

import { registerPacking, type PackingRecord, type PackingValidationIssue } from './engine-framework/packing/database';

export const PRELIM_DEFAULT_REF = 'Thermopac Preliminary Equipment Screening Default v1.0';
export const PRELIM_HETS_REF = 'Thermopac Preliminary ECP Screening Default v1.0';

export const SMV_PRELIM_ID = 'sulzer-smv-preliminary-screening';
export const SMVP_PRELIM_ID = 'sulzer-smvp-preliminary-screening';

const LIT_REF = 'Rauber, Design Practice for Packed Liquid-Liquid Extraction Columns, AIChE 2006 — preliminary screening characteristics only';
const GENERIC_NOTE = 'Generic structured sheet-metal packing literature-typical value, Assumed — NOT Sulzer-certified vendor data';

function prelimRecord(id: string, productName: string, purposeNote: string): PackingRecord {
  return {
    id,
    manufacturer: 'Sulzer (preliminary screening record — not vendor-certified)',
    productFamily: 'Structured LLX packing',
    productName,
    packingType: 'structured sheet-metal',
    geometryClass: 'structured',
    material: 'Metal (stainless steel assumed for screening)',
    size: { value: 250, unit: 'mm', sourceType: 'Assumed', sourceReference: `${GENERIC_NOTE}; nominal element designation placeholder` },
    specificSurfaceArea: { value: 250, unit: 'm2/m3', sourceType: 'Assumed', sourceReference: `Mid-range of the published 200–500 m²/m³ SSA screening range (${LIT_REF})` },
    voidFraction: { value: 0.95, unit: '-', sourceType: 'Assumed', sourceReference: GENERIC_NOTE },
    // hydraulicCapacityData / pressureDropData deliberately ABSENT:
    // vendor capacity and pressure-drop curves are never invented. The C4
    // engine classifies the dependent sub-results Pending Validation.
    vendorNotes: `${purposeNote} Preliminary screening record — controlled literature characteristics (${LIT_REF}). Replace with a vendor-certified record before any rating use.`,
    source: LIT_REF,
    revision: 'Rev 0 (preliminary screening)',
  };
}

/** Register the SMV/SMVP preliminary screening records (idempotent). */
export function registerPreliminaryPackingRecords(): PackingValidationIssue[] {
  const issues = [
    ...registerPacking(prelimRecord(SMV_PRELIM_ID, 'SMV — Preliminary Screening Record', 'Capacity Preferred family (published screening throughput 50–90 m³/(m²·h), NTS ≤ 6, single bed).')),
    ...registerPacking(prelimRecord(SMVP_PRELIM_ID, 'SMVP — Preliminary Screening Record', 'Efficiency / Back-Mixing Preferred family (published screening throughput 35–60 m³/(m²·h), NTS ≤ 10, up to 3 beds).')),
  ];
  return issues;
}

// ── Workspace-section default field sets ─────────────────────────────────────
// Keys are Stage 7 workspace input keys (visible + editable in the UI).
// `<key>_source_reference` companions carry the Thermopac default reference
// into the calculation snapshot via the input mapper.

export interface DefaultField { key: string; value: string; label: string; unit: string; ref: string }

export function ecpDefaultFields(): DefaultField[] {
  const R = PRELIM_DEFAULT_REF;
  return [
    { key: 'packing_id', value: SMVP_PRELIM_ID, label: 'Packing (Packing Database)', unit: '-', ref: R },
    { key: 'hets', value: '0.75', label: 'HETS (design)', unit: 'm/stage', ref: PRELIM_HETS_REF },
    { key: 'top_head_height', value: '0.50', label: 'Top Head Height', unit: 'm', ref: R },
    { key: 'top_disengagement_height', value: '1.00', label: 'Top Disengagement Height', unit: 'm', ref: R },
    { key: 'top_distributor_allowance', value: '0.50', label: 'Top Distributor Allowance', unit: 'm', ref: R },
    { key: 'packing_support_allowance', value: '0.20', label: 'Packing Support Allowance', unit: 'm', ref: R },
    { key: 'hold_down_allowance', value: '0.20', label: 'Hold-Down Allowance', unit: 'm', ref: R },
    { key: 'bottom_distributor_allowance', value: '0.50', label: 'Bottom Distributor Allowance', unit: 'm', ref: R },
    { key: 'bottom_disengagement_height', value: '1.00', label: 'Bottom Disengagement Height', unit: 'm', ref: R },
    { key: 'bottom_head_height', value: '0.50', label: 'Bottom Head Height', unit: 'm', ref: R },
  ];
}

export function ecrDefaultFields(stage5ColumnDiameter_m: number | null): DefaultField[] {
  const R = PRELIM_DEFAULT_REF;
  const fields: DefaultField[] = [
    { key: 'rotor_ratio', value: '0.50', label: 'Rotor / Column Diameter Ratio', unit: '-', ref: R },
    { key: 'rotor_speed', value: '60', label: 'Rotor Speed', unit: 'rpm', ref: R },
    { key: 'power_number', value: '1.0', label: 'Power Number', unit: '-', ref: R },
    { key: 'compartment_efficiency', value: '0.40', label: 'Compartment Efficiency', unit: 'fraction', ref: R },
    { key: 'compartment_height', value: '0.25', label: 'Compartment Height', unit: 'm', ref: R },
    { key: 'rotors_per_compartment', value: '1', label: 'Rotors per Compartment', unit: '-', ref: R },
    { key: 'shaft_efficiency', value: '0.90', label: 'Shaft Efficiency', unit: 'fraction', ref: R },
    { key: 'mechanical_design_margin', value: '1.25', label: 'Mechanical Design Margin', unit: '-', ref: R },
    { key: 'top_head_height', value: '0.50', label: 'Top Head Height', unit: 'm', ref: R },
    { key: 'top_disengagement_height', value: '1.00', label: 'Top Disengagement Height', unit: 'm', ref: R },
    { key: 'top_distributor_allowance', value: '0.50', label: 'Top Distributor Allowance', unit: 'm', ref: R },
    { key: 'bottom_distributor_allowance', value: '0.50', label: 'Bottom Distributor Allowance', unit: 'm', ref: R },
    { key: 'bottom_disengagement_height', value: '1.00', label: 'Bottom Disengagement Height', unit: 'm', ref: R },
    { key: 'bottom_head_height', value: '0.50', label: 'Bottom Head Height', unit: 'm', ref: R },
    { key: 'drive_seal_bearing_allowance', value: '1.00', label: 'Drive / Seal / Bearing Allowance', unit: 'm', ref: R },
  ];
  // Rotor diameter is intentionally NOT populated: the C5 engine derives it
  // per case as ratio × column diameter (Stage 5 basis) and enforces ±1 %
  // consistency when both are entered. Supplying only the ratio keeps the
  // rotor diameter a calculated value, never a duplicated manual entry.
  void stage5ColumnDiameter_m;
  return fields;
}
