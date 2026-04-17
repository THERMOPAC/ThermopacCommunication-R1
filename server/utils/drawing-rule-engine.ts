// ─────────────────────────────────────────────────────────────────────────────
// Drawing Rule Engine — Layer 1 (DDS vs Drawing) + Layer 2 (20-Checklist)
// Equipment Configuration governs section applicability.
// ─────────────────────────────────────────────────────────────────────────────

import type { MechanicalData, GeneralData, ColumnHazardData, DesignDataSheet } from '@shared/schema';
import type { DrawingExtraction, ExtractedField } from './drawing-ai-extractor';
import { CONFIDENCE_FAIL_THRESHOLD, CONFIDENCE_WARN_THRESHOLD } from './drawing-ai-extractor';
import { compareNumeric, compareString } from './drawing-unit-normalizer';

export type RuleStatus = 'pass' | 'fail' | 'warn' | 'skipped';
export type RuleSeverity = 'critical' | 'high' | 'medium' | 'low' | null;
export type ApplicableSection = 'Shell' | 'Tube' | 'Jacket' | 'General' | 'Identity';

export type RuleResult = {
  layer: 1 | 2;
  checklistSection: number;
  checklistItem: string;
  task: string;
  equipmentConfig: string;
  applicableSection: ApplicableSection;
  status: RuleStatus;
  severity: RuleSeverity;
  expected: string | null;
  actual: string | null;
  evidence: string;
};

export type ApplicableSections = {
  shell: boolean;
  tube: boolean;
  jacket: boolean;
};

// ── Applicability matrix ──────────────────────────────────────────────────────
export function getApplicableSections(equipmentConfig: string): ApplicableSections {
  const c = equipmentConfig.toLowerCase();
  if (c.includes('jacketed vessel and heat exchanger') || c.includes('jv and hx') || c.includes('jv+hx')) {
    return { shell: true, tube: true, jacket: true };
  }
  if (c.includes('heat exchanger') || c.includes('hx')) {
    return { shell: true, tube: true, jacket: false };
  }
  if (c.includes('jacketed')) {
    return { shell: true, tube: false, jacket: true };
  }
  return { shell: true, tube: false, jacket: false }; // Vessel
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function skipped(
  layer: 1 | 2,
  section: number,
  item: string,
  task: string,
  applicableSection: ApplicableSection,
  equipmentConfig: string,
  reason: string,
): RuleResult {
  return {
    layer, checklistSection: section, checklistItem: item, task,
    equipmentConfig, applicableSection,
    status: 'skipped', severity: null, expected: 'n/a', actual: 'n/a',
    evidence: reason,
  };
}

function confidenceAwareStatus(
  fieldStatus: 'pass' | 'fail' | 'warn',
  confidence: number,
  severity: RuleSeverity,
): { status: RuleStatus; severity: RuleSeverity; evidence: string } {
  if (confidence < CONFIDENCE_WARN_THRESHOLD) {
    return {
      status: 'warn',
      severity: 'medium',
      evidence: `Low extraction confidence (${(confidence * 100).toFixed(0)}%) — value may be inaccurate. Manual verification required.`,
    };
  }
  if (confidence < CONFIDENCE_FAIL_THRESHOLD && fieldStatus === 'fail') {
    return {
      status: 'warn',
      severity: 'medium',
      evidence: `Extraction confidence below threshold (${(confidence * 100).toFixed(0)}%) — mismatch downgraded to warning. Manual verification required.`,
    };
  }
  return { status: fieldStatus, severity: fieldStatus === 'pass' ? null : severity, evidence: '' };
}

function compareField(
  layer: 1 | 2,
  section: number,
  item: string,
  task: string,
  applicableSection: ApplicableSection,
  equipmentConfig: string,
  ddsValue: string | null | undefined,
  extracted: ExtractedField,
  severity: RuleSeverity,
  tolerancePct = 2,
  isNumeric = false,
): RuleResult {
  const dds = ddsValue ?? null;

  if (extracted.value === null || extracted.confidence === 0) {
    const conf = confidenceAwareStatus('fail', extracted.confidence, severity);
    return {
      layer, checklistSection: section, checklistItem: item, task,
      equipmentConfig, applicableSection,
      status: conf.status,
      severity: conf.severity ?? severity,
      expected: dds ?? 'Required',
      actual: 'Not found in drawing',
      evidence: conf.evidence || 'Field not found in drawing. Manual verification required.',
    };
  }

  if (!dds) {
    return {
      layer, checklistSection: section, checklistItem: item, task,
      equipmentConfig, applicableSection,
      status: 'warn', severity: 'medium',
      expected: 'Not set in DDS',
      actual: extracted.value,
      evidence: 'Field is not set in DDS — cannot compare. Review DDS completeness.',
    };
  }

  let match: boolean | null;
  let evidence = '';

  if (isNumeric) {
    const result = compareNumeric(dds, extracted.value, tolerancePct);
    match = result.match;
    if (match === null) {
      evidence = `Cannot parse numeric values for comparison. DDS: "${dds}", Drawing: "${extracted.value}"`;
    } else if (!match) {
      evidence = `Mismatch: DDS=${result.normalizedA.normalizedNumeric?.toFixed(3)} ${result.normalizedA.normalizedUnit}, Drawing=${result.normalizedB.normalizedNumeric?.toFixed(3)} ${result.normalizedB.normalizedUnit} (diff=${result.percentDiff?.toFixed(1)}%)`;
    }
  } else {
    match = compareString(dds, extracted.value);
    if (match === null) evidence = 'Cannot compare values.';
    else if (!match) evidence = `Mismatch: DDS="${dds}", Drawing="${extracted.value}"`;
  }

  if (match === null) {
    return { layer, checklistSection: section, checklistItem: item, task, equipmentConfig, applicableSection, status: 'warn', severity: 'medium', expected: dds, actual: extracted.value, evidence };
  }

  if (match) {
    return { layer, checklistSection: section, checklistItem: item, task, equipmentConfig, applicableSection, status: 'pass', severity: null, expected: dds, actual: extracted.value, evidence: 'Values match.' };
  }

  const conf = confidenceAwareStatus('fail', extracted.confidence, severity);
  return {
    layer, checklistSection: section, checklistItem: item, task,
    equipmentConfig, applicableSection,
    status: conf.status,
    severity: conf.severity ?? severity,
    expected: dds,
    actual: extracted.value,
    evidence: conf.evidence || evidence,
  };
}

function presence(
  layer: 1 | 2,
  section: number,
  item: string,
  task: string,
  applicableSection: ApplicableSection,
  equipmentConfig: string,
  extracted: ExtractedField,
  severity: RuleSeverity,
  passNote = 'Present',
): RuleResult {
  if (!extracted.value) {
    const conf = confidenceAwareStatus('fail', extracted.confidence, severity);
    return { layer, checklistSection: section, checklistItem: item, task, equipmentConfig, applicableSection, status: conf.status, severity: conf.severity ?? severity, expected: 'Present', actual: 'Not found', evidence: conf.evidence || 'Not found in drawing.' };
  }
  const conf = confidenceAwareStatus('pass', extracted.confidence, null);
  if (conf.status === 'warn') {
    return { layer, checklistSection: section, checklistItem: item, task, equipmentConfig, applicableSection, status: 'warn', severity: 'medium', expected: 'Present', actual: extracted.value, evidence: conf.evidence };
  }
  return { layer, checklistSection: section, checklistItem: item, task, equipmentConfig, applicableSection, status: 'pass', severity: null, expected: '-', actual: extracted.value, evidence: passNote };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — DDS vs Drawing Validation (PRIMARY)
// ─────────────────────────────────────────────────────────────────────────────

function runLayer1(
  dds: DesignDataSheet,
  ext: DrawingExtraction,
  ap: ApplicableSections,
  equipmentConfig: string,
): RuleResult[] {
  const results: RuleResult[] = [];
  const mech = dds.mechanicalData as MechanicalData;
  const gen  = dds.generalData   as GeneralData;
  const haz  = dds.hazardData    as ColumnHazardData | null;
  const EQ   = equipmentConfig;

  // ── Identity (all configs) ──────────────────────────────────────────────────
  results.push(compareField(1, 1, '1.5', 'Project code match', 'Identity', EQ, dds.dwgControlId?.toString(), ext.projectCode, 'high', 0, false));
  results.push(compareField(1, 1, '1.6', 'Item code match', 'Identity', EQ, (dds as any).itemCode ?? null, ext.itemCode, 'high', 0, false));
  results.push(compareField(1, 1, '1.7', 'Tag number match', 'Identity', EQ, dds.tagNo ?? null, ext.tagNumber, 'high', 0, false));
  results.push(compareField(1, 2, '2.10', 'Design code match (DDS vs Drawing)', 'Identity', EQ, dds.designCode, ext.designCode, 'high', 0, false));

  function sectionLayer1(
    label: 'Shell' | 'Tube' | 'Jacket',
    col: typeof mech.shell | null,
    extSection: typeof ext.shell | null,
    hazCol: typeof haz?.shell | null,
  ) {
    if (!col || !extSection) return;
    const baseItem = label === 'Shell' ? 'L1.S' : label === 'Tube' ? 'L1.T' : 'L1.J';

    results.push(compareField(1, 4, `${baseItem}.1`, `${label}: Internal Design Pressure / MAWP`, label, EQ, col.internalDesignPressureMawp, extSection.internalDesignPressureMawp, 'critical', 2, true));
    results.push(compareField(1, 4, `${baseItem}.2`, `${label}: External Design Pressure / MAWP`, label, EQ, col.externalDesignPressureMawp, extSection.externalDesignPressureMawp, 'critical', 2, true));
    results.push(compareField(1, 4, `${baseItem}.3`, `${label}: Working Pressure`, label, EQ, col.workingPressure, extSection.workingPressure, 'high', 2, true));
    results.push(compareField(1, 4, `${baseItem}.4`, `${label}: Hydrotest Pressure`, label, EQ, col.hydroTestPressure, extSection.hydroTestPressure, 'high', 2, true));
    results.push(compareField(1, 5, `${baseItem}.5`, `${label}: MDMT`, label, EQ, col.mdmt, extSection.mdmt, 'high', 1, true));
    results.push(compareField(1, 5, `${baseItem}.6`, `${label}: Hydrotest Temperature`, label, EQ, col.hydroTestTempMinMax, extSection.hydroTestTempMinMax, 'medium', 2, true));
    results.push(compareField(1, 5, `${baseItem}.7`, `${label}: Operating Temperature`, label, EQ, col.operatingTempMinMax, extSection.operatingTempMinMax, 'high', 2, true));
    results.push(compareField(1, 5, `${baseItem}.8`, `${label}: Design Temperature`, label, EQ, col.designTempMinMax, extSection.designTempMinMax, 'critical', 1, true));
    results.push(compareField(1, 12, `${baseItem}.9`, `${label}: Physical State`, label, EQ, col.physicalState, extSection.physicalState, 'medium', 0, false));
    results.push(compareField(1, 12, `${baseItem}.10`, `${label}: Service Fluid`, label, EQ, col.serviceFluid, extSection.serviceFluid, 'medium', 0, false));
    results.push(compareField(1, 7, `${baseItem}.11`, `${label}: Hazard Level`, label, EQ, col.hazardLevel, extSection.hazardLevel, 'critical', 0, false));
    results.push(compareField(1, 12, `${baseItem}.12`, `${label}: Specific Gravity`, label, EQ, col.specificGravity, extSection.specificGravity, 'medium', 5, true));
    results.push(compareField(1, 6, `${baseItem}.13`, `${label}: Internal Corrosion Allowance (mm)`, label, EQ, col.internalCorrosionAllowanceMm, extSection.internalCorrosionAllowanceMm, 'high', 0, true));
    results.push(compareField(1, 6, `${baseItem}.14`, `${label}: External Corrosion Allowance (mm)`, label, EQ, col.externalCorrosionAllowanceMm, extSection.externalCorrosionAllowanceMm, 'high', 0, true));
    results.push(compareField(1, 9, `${baseItem}.15`, `${label}: Radiography`, label, EQ, col.radiography, extSection.radiography, 'high', 0, false));
    results.push(compareField(1, 9, `${baseItem}.16`, `${label}: Joint Efficiency`, label, EQ, col.jointEfficiency, extSection.jointEfficiency, 'high', 0, false));
    results.push(compareField(1, 9, `${baseItem}.17`, `${label}: PWHT`, label, EQ, col.postWeldHeatTreatment, extSection.postWeldHeatTreatment, 'high', 0, false));
    results.push(compareField(1, 8, `${baseItem}.18`, `${label}: Type of Heads`, label, EQ, col.typeOfHeads, extSection.typeOfHeads, 'medium', 0, false));
    results.push(compareField(1, 11, `${baseItem}.19`, `${label}: Insulation`, label, EQ, col.insulation, extSection.insulation, 'medium', 0, false));
    results.push(compareField(1, 11, `${baseItem}.20`, `${label}: Insulation Type/Thickness/Density`, label, EQ, col.insulationTypeThkDensity, extSection.insulationTypeThkDensity, 'medium', 0, false));
  }

  sectionLayer1('Shell', mech.shell, ext.shell, haz?.shell ?? null);
  if (ap.tube)   sectionLayer1('Tube',   mech.tube   ?? null, ext.tube   ?? null, haz?.tube   ?? null);
  if (ap.jacket) sectionLayer1('Jacket', mech.jacket ?? null, ext.jacket ?? null, haz?.jacket ?? null);

  // Non-applicable tube/jacket → SKIPPED
  if (!ap.tube)   results.push(skipped(1, 4, 'L1.T', 'Tube section validation', 'Tube', EQ, `Not applicable for ${EQ}`));
  if (!ap.jacket) results.push(skipped(1, 4, 'L1.J', 'Jacket section validation', 'Jacket', EQ, `Not applicable for ${EQ}`));

  // Pressure relationship cross-checks
  if (ap.jacket && ext.shell && ext.jacket) {
    const shellExt = ext.shell.externalDesignPressureMawp;
    const jacketInt = ext.jacket.internalDesignPressureMawp;
    if (shellExt.value && jacketInt.value) {
      const cmp = compareNumeric(shellExt.value, jacketInt.value, 2);
      results.push({
        layer: 1, checklistSection: 4, checklistItem: '4.3', task: 'Shell External = Jacket Internal pressure',
        equipmentConfig: EQ, applicableSection: 'Shell',
        status: cmp.match ? 'pass' : 'fail',
        severity: cmp.match ? null : 'critical',
        expected: shellExt.value, actual: jacketInt.value,
        evidence: cmp.match ? 'Pressure relationship correct.' : `Shell external (${shellExt.value}) ≠ Jacket internal (${jacketInt.value}).`,
      });
    }
  } else if (!ap.jacket) {
    results.push(skipped(1, 4, '4.3', 'Shell External = Jacket Internal pressure', 'Jacket', EQ, `Not applicable for ${EQ}`));
  }

  if (ap.tube && ext.shell && ext.tube) {
    const tubeExt = ext.tube.externalDesignPressureMawp;
    const shellInt = ext.shell.internalDesignPressureMawp;
    if (tubeExt.value && shellInt.value) {
      const cmp = compareNumeric(tubeExt.value, shellInt.value, 2);
      results.push({
        layer: 1, checklistSection: 4, checklistItem: '4.4', task: 'Tube External = Shell Internal pressure',
        equipmentConfig: EQ, applicableSection: 'Tube',
        status: cmp.match ? 'pass' : 'fail',
        severity: cmp.match ? null : 'critical',
        expected: shellInt.value, actual: tubeExt.value,
        evidence: cmp.match ? 'Pressure relationship correct.' : `Tube external (${tubeExt.value}) ≠ Shell internal (${shellInt.value}).`,
      });
    }
  } else if (!ap.tube) {
    results.push(skipped(1, 4, '4.4', 'Tube External = Shell Internal pressure', 'Tube', EQ, `Not applicable for ${EQ}`));
  }

  // General data
  results.push(compareField(1, 13, 'L1.G1', 'Vessel Orientation', 'General', EQ, gen.vesselOrientation, ext.general.vesselOrientation, 'medium', 0, false));
  results.push(compareField(1, 14, 'L1.G2', 'Location', 'General', EQ, gen.location, ext.general.location, 'medium', 0, false));
  results.push(compareField(1, 13, 'L1.G3', 'Weight (Empty/Operating/Hydro)', 'General', EQ, gen.weightEmptyOperatingHydro, ext.general.weightEmptyOperatingHydro, 'medium', 5, false));
  results.push(compareField(1, 13, 'L1.G4', 'Wind Design Velocity', 'General', EQ, gen.windDesignVelocity, ext.general.windDesignVelocity, 'medium', 5, true));
  results.push(compareField(1, 14, 'L1.G5', 'Seismic Design Code', 'General', EQ, gen.seismicDesignCode, ext.general.seismicDesignCode, 'medium', 0, false));
  results.push(compareField(1, 14, 'L1.G6', 'Hazard Factor Z', 'General', EQ, gen.hazardFactorZ, ext.general.hazardFactorZ, 'medium', 2, true));

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 — 20-Checklist
// ─────────────────────────────────────────────────────────────────────────────

function runLayer2(ext: DrawingExtraction, ap: ApplicableSections, equipmentConfig: string): RuleResult[] {
  const results: RuleResult[] = [];
  const EQ = equipmentConfig;

  function pres(section: number, item: string, task: string, appSec: ApplicableSection, field: ExtractedField, sev: RuleSeverity, note?: string) {
    results.push(presence(2, section, item, task, appSec, EQ, field, sev, note));
  }

  function skip(section: number, item: string, task: string, appSec: ApplicableSection, reason: string) {
    results.push(skipped(2, section, item, task, appSec, EQ, reason));
  }

  function warn(section: number, item: string, task: string, appSec: ApplicableSection, note: string): RuleResult {
    return { layer: 2, checklistSection: section, checklistItem: item, task, equipmentConfig: EQ, applicableSection: appSec, status: 'warn', severity: 'medium', expected: 'Present', actual: '-', evidence: note };
  }

  // ── 1. Document Control & Identity ────────────────────────────────────────
  pres(1, '1.1', 'Drawing Number format & correctness', 'Identity', ext.drawingNumber, 'high', 'Format present and readable in title block');
  pres(1, '1.2', 'Revision consistency', 'Identity', ext.revision, 'medium', 'Revision shown in title block');
  pres(1, '1.3', 'Sheet number (e.g. 1 of 2)', 'Identity', ext.sheetNumber, 'low', 'Sheet number present');
  pres(1, '1.4', 'Document title presence', 'Identity', ext.title, 'medium', 'Title block contains equipment title');
  pres(1, '1.5', 'Project code match', 'Identity', ext.projectCode, 'medium', 'Project reference present');
  pres(1, '1.6', 'Item code match', 'Identity', ext.itemCode, 'medium', 'Item code present');
  pres(1, '1.7', 'Tag number presence & correctness', 'Identity', ext.tagNumber, 'high', 'Tag present');
  pres(1, '1.8', 'Client name correctness', 'Identity', ext.clientName, 'medium', 'Client shown in title block');
  pres(1, '1.9', 'Vendor / company name correctness', 'Identity', ext.vendorName, 'medium', 'Thermopac shown');
  pres(1, '1.10', 'DDS reference present', 'Identity', ext.ddsReference, 'critical', 'DDS reference on drawing');
  results.push(warn(1, '1.11', 'Linked documents (P&ID / BOM / GA)', 'Identity', 'Requires manual check — cannot be verified from PDF text layer alone'));
  pres(1, '1.12', 'Revision history table present', 'Identity', ext.revision, 'medium', 'Revision block present');
  results.push(warn(1, '1.13', 'Approval / signature block present', 'Identity', 'Requires manual check — signature presence requires visual verification'));

  // ── 2. Title Block Completeness ───────────────────────────────────────────
  pres(2, '2.1', 'Drawing No', 'Identity', ext.drawingNumber, 'high', 'Present');
  pres(2, '2.2', 'Revision', 'Identity', ext.revision, 'high', 'Rev shown');
  pres(2, '2.3', 'Title / Description', 'Identity', ext.title, 'medium', 'Equipment description present');
  pres(2, '2.4', 'Scale', 'Identity', ext.scale, 'low', 'Scale shown');
  pres(2, '2.5', 'Units', 'Identity', ext.units, 'medium', 'Units defined');
  pres(2, '2.6', 'Date', 'Identity', ext.date, 'low', 'Dates in revision block');
  pres(2, '2.7', 'Drawn by / Checked / Approved', 'Identity', ext.drawnBy, 'medium', 'Approval fields present');
  pres(2, '2.8', 'Client', 'Identity', ext.clientName, 'medium', 'Client listed');
  pres(2, '2.9', 'Project', 'Identity', ext.projectCode, 'medium', 'Project reference present');
  results.push(warn(2, '2.10', 'Document type (GA / Fabrication / Assembly)', 'Identity', 'Requires manual verification of drawing type designation'));

  // ── 3. Dimension & Geometry Checks ───────────────────────────────────────
  results.push(warn(3, '3.1', 'All critical dimensions present', 'General', 'Requires manual review of drawing sheets'));
  results.push(warn(3, '3.2', 'No conflicting dimensions', 'General', 'Requires CAD-level validation'));
  results.push(warn(3, '3.3', 'Units consistent (mm / inch)', 'General', 'Requires manual check of all dimension callouts'));
  results.push(warn(3, '3.4', 'Tolerances defined', 'General', 'Requires manual check of tolerance callouts'));
  results.push(warn(3, '3.5', 'Overall dimensions match design basis', 'General', 'Requires manual comparison with design basis'));
  results.push(warn(3, '3.6', 'Fit-up clearances adequate', 'General', 'Requires CAD-level validation'));
  results.push(warn(3, '3.7', 'Interference checks (no clash)', 'General', 'Requires CAD-level validation'));

  // ── 4. Pressure System Checks ─────────────────────────────────────────────
  pres(4, '4.1', 'Internal pressure defined — Shell', 'Shell', ext.shell.internalDesignPressureMawp, 'critical');
  pres(4, '4.2', 'External pressure defined — Shell', 'Shell', ext.shell.externalDesignPressureMawp, 'critical');
  // 4.3 and 4.4 are handled in Layer 1 cross-checks; include as informational
  if (ap.jacket) {
    pres(4, '4.3', 'Shell External = Jacket Internal (see Layer 1)', 'Shell', ext.shell.externalDesignPressureMawp, 'critical');
  } else {
    skip(4, '4.3', 'Shell External = Jacket Internal', 'Jacket', `Not applicable for ${EQ}`);
  }
  if (ap.tube) {
    pres(4, '4.4', 'Tube External = Shell Internal (see Layer 1)', 'Tube', ext.shell.internalDesignPressureMawp, 'critical');
  } else {
    skip(4, '4.4', 'Tube External = Shell Internal', 'Tube', `Not applicable for ${EQ}`);
  }
  results.push(warn(4, '4.5', 'MAWP vs design pressure consistency', 'Shell', 'MAWP cross-check requires code calculation — manual review'));
  results.push(warn(4, '4.6', 'Hydrotest pressure correct (code-based)', 'Shell', 'Code-based hydrotest calculation requires manual verification'));
  pres(4, '4.7', 'Pressure units consistent', 'Shell', ext.shell.internalDesignPressureMawp, 'medium', 'Unit consistency checked during extraction');

  // ── 5. Temperature Checks ─────────────────────────────────────────────────
  pres(5, '5.1', 'Design temperature defined — Shell', 'Shell', ext.shell.designTempMinMax, 'critical');
  pres(5, '5.2', 'Operating temperature defined — Shell', 'Shell', ext.shell.operatingTempMinMax, 'high');
  pres(5, '5.3', 'MDMT defined — Shell', 'Shell', ext.shell.mdmt, 'high');
  pres(5, '5.4', 'Hydrotest temperature defined', 'Shell', ext.shell.hydroTestTempMinMax, 'medium');
  if (ap.jacket) {
    pres(5, '5.5', 'Jacket temperatures covered', 'Jacket', ext.jacket?.designTempMinMax ?? { value: null, unit: null, confidence: 0 }, 'critical');
  } else {
    skip(5, '5.5', 'Jacket temperatures covered', 'Jacket', `Not applicable for ${EQ}`);
  }
  if (ap.tube) {
    pres(5, '5.5b', 'Tube temperatures covered', 'Tube', ext.tube?.designTempMinMax ?? { value: null, unit: null, confidence: 0 }, 'critical');
  } else {
    skip(5, '5.5b', 'Tube temperatures covered', 'Tube', `Not applicable for ${EQ}`);
  }
  results.push(warn(5, '5.6', 'Material compatibility with temperature', 'Shell', 'Requires material code check vs temperature — manual review'));

  // ── 6. Material & Code Compliance ─────────────────────────────────────────
  pres(6, '6.1', 'Design code defined', 'General', ext.designCode, 'high', 'Design code present');
  pres(6, '6.2', 'Material code defined', 'Shell', ext.shell.material, 'high', 'Material specs listed');
  results.push(warn(6, '6.3', 'Material grade correct', 'Shell', 'Requires manual cross-check against DDS material spec'));
  pres(6, '6.4', 'Corrosion allowance defined', 'Shell', ext.shell.internalCorrosionAllowanceMm, 'high');
  results.push(warn(6, '6.5', 'Fabrication tolerance class defined', 'Shell', 'Not always explicit in drawing — manual check required'));
  pres(6, '6.6', 'PWHT requirement defined', 'Shell', ext.shell.postWeldHeatTreatment, 'high');

  // ── 7. Hazard & Safety Classification ────────────────────────────────────
  pres(7, '7.1', 'Hazard level defined', 'Shell', ext.shell.hazardLevel, 'critical');
  results.push(warn(7, '7.2', 'Fluid group defined', 'Shell', 'Fluid group classification requires manual check'));
  pres(7, '7.3', 'Service fluid defined', 'Shell', ext.shell.serviceFluid, 'medium');
  results.push(warn(7, '7.4', 'Pressure × Volume classification', 'General', 'PV product calculation — manual verification required'));
  results.push(warn(7, '7.5', 'Safety category assigned', 'General', 'Safety category requires code-based classification'));

  // ── 8. Mechanical Design Checks ───────────────────────────────────────────
  results.push(warn(8, '8.1', 'Thickness values defined', 'Shell', 'Plate thickness verification requires visual sheet review'));
  results.push(warn(8, '8.2', 'Minimum thickness verified', 'Shell', 'Minimum thickness requires code calculation proof'));
  results.push(warn(8, '8.3', 'Reinforcement pads defined (nozzles)', 'Shell', 'Nozzle detail sheets require visual verification'));
  results.push(warn(8, '8.4', 'Stiffeners present where required', 'Shell', 'Requires visual check of drawing sheets'));
  pres(8, '8.5', 'Head type defined', 'Shell', ext.shell.typeOfHeads, 'medium');
  results.push(warn(8, '8.6', 'Joint efficiency consistent with RT', 'Shell', 'Requires cross-check of RT level vs joint efficiency — manual'));

  // ── 9. Welding & NDT Checks ───────────────────────────────────────────────
  results.push(warn(9, '9.1', 'Weld types defined', 'Shell', 'Weld notes require visual sheet verification'));
  results.push(warn(9, '9.2', 'Weld symbols present', 'Shell', 'Weld symbols require visual verification'));
  pres(9, '9.3', 'Radiography defined (Full / Spot / %)', 'Shell', ext.shell.radiography, 'high');
  results.push(warn(9, '9.4', 'NDT methods defined', 'Shell', 'NDT method detail requires visual verification'));
  results.push(warn(9, '9.5', 'Weld joint categories (ASME UW)', 'Shell', 'UW categories require manual verification of weld joint table'));
  pres(9, '9.6', 'PWHT requirement correct', 'Shell', ext.shell.postWeldHeatTreatment, 'high');

  // ── 10. Nozzle & Connection Checks ───────────────────────────────────────
  results.push(warn(10, '10.1', 'Nozzle IDs (N1, N2…)', 'Shell', 'Nozzle IDs require visual sheet check'));
  results.push(warn(10, '10.2', 'Nozzle sizes', 'Shell', 'Nozzle sizes require nozzle schedule sheet'));
  results.push(warn(10, '10.3', 'Nozzle thickness defined', 'Shell', 'Thickness in nozzle schedule — manual check'));
  results.push(warn(10, '10.4', 'Rating / class defined', 'Shell', 'Class not always explicit everywhere — manual check'));
  results.push(warn(10, '10.5', 'Orientation defined', 'Shell', 'Orientations require visual sheet check'));
  results.push(warn(10, '10.6', 'Reinforcement provided', 'Shell', 'Pads indication requires visual check'));
  results.push(warn(10, '10.7', 'Nozzle schedule complete', 'Shell', 'Complete schedule requires full sheet review'));

  // ── 11. Insulation & Thermal Checks ──────────────────────────────────────
  pres(11, '11.1', 'Insulation Yes/No defined — Shell', 'Shell', ext.shell.insulation, 'medium');
  if (ap.jacket) {
    pres(11, '11.1b', 'Insulation Yes/No defined — Jacket', 'Jacket', ext.jacket?.insulation ?? nullF(), 'medium');
  } else {
    skip(11, '11.1b', 'Insulation — Jacket', 'Jacket', `Not applicable for ${EQ}`);
  }
  skip(11, '11.1c', 'Insulation — Tube (must not be required)', 'Tube', 'Tube insulation is never required — SKIPPED');
  pres(11, '11.2', 'Insulation type defined', 'Shell', ext.shell.insulationTypeThkDensity, 'medium');
  results.push(warn(11, '11.3', 'Insulation thickness defined', 'Shell', 'Requires explicit callout — check with insulation type field'));
  results.push(warn(11, '11.4', 'Insulation density defined', 'Shell', 'Requires explicit callout — check with insulation type field'));
  results.push(warn(11, '11.5', 'Justification if NO insulation (hot service)', 'Shell', 'Justification cannot be automatically verified from text layer'));

  // ── 12. Process Data Checks ───────────────────────────────────────────────
  pres(12, '12.1', 'Service fluid defined', 'Shell', ext.shell.serviceFluid, 'medium');
  pres(12, '12.2', 'Physical state defined', 'Shell', ext.shell.physicalState, 'medium');
  pres(12, '12.3', 'Specific gravity defined', 'Shell', ext.shell.specificGravity, 'medium');
  results.push(warn(12, '12.4', 'Flow direction clarity', 'Shell', 'Flow direction requires visual nozzle/piping review'));
  results.push(warn(12, '12.5', 'Operating conditions match design', 'Shell', 'Requires comparison of operating vs design parameters — see Layer 1'));

  // ── 13. Structural & Load Checks ─────────────────────────────────────────
  pres(13, '13.1', 'Wind load defined', 'General', ext.general.windData, 'medium');
  pres(13, '13.2', 'Seismic load defined', 'General', ext.general.seismicDesignCode, 'medium');
  results.push(warn(13, '13.3', 'Load cases defined', 'General', 'Load case enumeration requires manual sheet review'));
  results.push(warn(13, '13.4', 'Support design present', 'General', 'Support details require visual verification'));
  results.push(warn(13, '13.5', 'Lifting points defined', 'General', 'Lifting lugs require visual verification'));
  pres(13, '13.6', 'Weight (empty/operating/hydro)', 'General', ext.general.weightEmptyOperatingHydro, 'medium');

  // ── 14. Environmental & Site Data ─────────────────────────────────────────
  pres(14, '14.1', 'Location defined', 'General', ext.general.location, 'medium');
  pres(14, '14.2', 'Wind code defined', 'General', ext.general.windData, 'medium');
  pres(14, '14.3', 'Seismic code defined', 'General', ext.general.seismicDesignCode, 'medium');
  pres(14, '14.4', 'Hazard factor defined', 'General', ext.general.hazardFactorZ, 'medium');
  results.push(warn(14, '14.5', 'Design conditions match site', 'General', 'Site-specific conditions match requires manual comparison'));

  // ── 15. BOM Checks ────────────────────────────────────────────────────────
  results.push(warn(15, '15.1', 'All components listed', 'General', 'BOM completeness requires full BOM sheet review'));
  results.push(warn(15, '15.2', 'Material for each BOM item', 'General', 'Material per item requires BOM sheet review'));
  results.push(warn(15, '15.3', 'Quantity defined', 'General', 'Quantities in BOM require sheet review'));
  results.push(warn(15, '15.4', 'Weight defined', 'General', 'Weights per item require BOM sheet review'));
  results.push(warn(15, '15.5', 'Standard parts identified', 'General', 'Standard parts marking requires BOM review'));
  results.push(warn(15, '15.6', 'Consistency with drawing geometry', 'General', 'BOM vs geometry consistency requires manual cross-check'));

  // ── 16. Drawing Quality & Format ─────────────────────────────────────────
  results.push(warn(16, '16.1', 'Drawing readable (no overlaps)', 'General', 'Readability requires visual review'));
  results.push(warn(16, '16.2', 'Fonts consistent', 'General', 'Font consistency requires visual review'));
  results.push(warn(16, '16.3', 'Line types correct', 'General', 'Line types require visual review'));
  results.push(warn(16, '16.4', 'Layers properly used (if DWG)', 'General', 'Layer usage not verifiable from PDF text layer'));
  pres(16, '16.5', 'Scaling correct', 'General', ext.scale, 'low', 'Scale shown');
  results.push(warn(16, '16.6', 'No clutter', 'General', 'Drawing clarity requires visual review'));

  // ── 17. Revision Control ──────────────────────────────────────────────────
  pres(17, '17.1', 'Revision block present', 'Identity', ext.revision, 'medium', 'Revision block present');
  results.push(warn(17, '17.2', 'Revision description clear', 'Identity', 'Revision description requires manual check of revision block'));
  results.push(warn(17, '17.3', 'Revision dates correct', 'Identity', 'Date correctness requires manual verification'));
  results.push(warn(17, '17.4', 'Changes traceable', 'Identity', 'Traceability requires review of revision history block'));

  // ── 18. Inter-Document Consistency ───────────────────────────────────────
  results.push(warn(18, '18.1', 'Drawing vs DDS match (see Layer 1)', 'General', 'Detailed DDS comparison performed in Layer 1'));
  results.push(warn(18, '18.2', 'Drawing vs P&ID match', 'General', 'P&ID comparison requires P&ID document — manual'));
  results.push(warn(18, '18.3', 'Drawing vs BOM match', 'General', 'BOM match requires BOM document — manual'));
  results.push(warn(18, '18.4', 'Drawing vs ERP data match', 'General', 'ERP data match requires system cross-check — manual'));

  // ── 19. Code-Specific Checks ─────────────────────────────────────────────
  pres(19, '19.1', 'ASME VIII: Joint efficiency vs RT', 'Shell', ext.shell.jointEfficiency, 'high');
  results.push(warn(19, '19.2', 'ASME VIII: Hydrotest factor verification', 'Shell', 'Code-based hydrotest factor requires calculation proof'));
  pres(19, '19.3', 'ASME VIII: PWHT requirement', 'Shell', ext.shell.postWeldHeatTreatment, 'high');
  results.push(warn(19, '19.4', 'ASME VIII: Thickness calculations present', 'Shell', 'Thickness calculations require calc package — manual'));
  results.push(warn(19, '19.5', 'PED: Category classification', 'General', 'PED category requires fluid group + PV classification'));
  results.push(warn(19, '19.6', 'PED: Fluid group classification', 'General', 'Fluid group requires hazard classification review'));
  pres(19, '19.7', 'Hazard level classification', 'Shell', ext.shell.hazardLevel, 'critical');
  results.push(warn(19, '19.8', 'PV / P×DN calculation for PED/hazard', 'General', 'PV product calculation — manual'));

  // ── 20. Advanced Checks (Phase 1 limited) ────────────────────────────────
  const extractionQuality = ext.drawingNumber.confidence > 0.7 && ext.title.confidence > 0.7;
  results.push({
    layer: 2, checklistSection: 20, checklistItem: '20.1', task: 'OCR/title block extraction quality',
    equipmentConfig: EQ, applicableSection: 'Identity',
    status: extractionQuality ? 'pass' : 'warn', severity: extractionQuality ? null : 'medium',
    expected: 'Confidence ≥ 0.7', actual: `Drawing No: ${(ext.drawingNumber.confidence * 100).toFixed(0)}%, Title: ${(ext.title.confidence * 100).toFixed(0)}%`,
    evidence: extractionQuality ? 'Key title block fields extracted with adequate confidence.' : 'Low confidence on key fields — manual title block review required.',
  });
  results.push(warn(20, '20.2', 'Pattern recognition for missing required fields', 'General', 'Phase 1: Missing field detection based on confidence scores above'));
  results.push(warn(20, '20.3', 'AI-based anomaly detection', 'General', 'Phase 1 limited — advanced anomaly detection is Phase 2'));

  return results;
}

// Helper to avoid TypeScript error for null field in skip calls above
function nullF(): ExtractedField { return { value: null, unit: null, confidence: 0 }; }

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export type RuleEngineOutput = {
  layer1: RuleResult[];
  layer2: RuleResult[];
  applicableSections: ApplicableSections;
  overallStatus: 'pass' | 'fail';
  criticalFailures: number;
  highFailures: number;
  totalWarnings: number;
  totalSkipped: number;
};

export function runRuleEngine(
  dds: DesignDataSheet,
  ext: DrawingExtraction,
  equipmentConfig: string,
): RuleEngineOutput {
  const ap = getApplicableSections(equipmentConfig);
  const layer1 = runLayer1(dds, ext, ap, equipmentConfig);
  const layer2 = runLayer2(ext, ap, equipmentConfig);
  const all = [...layer1, ...layer2];

  const criticalFailures = all.filter(r => r.status === 'fail' && r.severity === 'critical').length;
  const highFailures     = all.filter(r => r.status === 'fail' && r.severity === 'high').length;
  const totalWarnings    = all.filter(r => r.status === 'warn').length;
  const totalSkipped     = all.filter(r => r.status === 'skipped').length;
  const anyFail          = all.some(r => r.status === 'fail');
  const anyLayer1Fail    = layer1.some(r => r.status === 'fail');

  return {
    layer1,
    layer2,
    applicableSections: ap,
    overallStatus: (anyFail || anyLayer1Fail) ? 'fail' : 'pass',
    criticalFailures,
    highFailures,
    totalWarnings,
    totalSkipped,
  };
}
