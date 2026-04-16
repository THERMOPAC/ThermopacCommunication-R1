import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, FileSpreadsheet, AlertTriangle, CheckCircle2, Edit3, Shield, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type MechanicalColumn = {
  internalDesignPressureMawp: string | null;
  externalDesignPressureMawp: string | null;
  workingPressure: string | null;
  hydroTestPressure: string | null;
  mdmt: string | null;
  hydroTestTempMinMax: string | null;
  operatingTempMinMax: string | null;
  designTempMinMax: string | null;
  physicalState: string | null;
  grossVolumeLiters: string | null;
  serviceFluid: string | null;
  hazardLevel: string | null;
  specificGravity: string | null;
  internalCorrosionAllowanceMm: string | null;
  externalCorrosionAllowanceMm: string | null;
  radiography: string | null;
  jointEfficiency: string | null;
  testingGroup: string | null;
  fabricationToleranceClass: string | null;
  postWeldHeatTreatment: string | null;
  typeOfHeads: string | null;
  insulation: string | null;
  insulationTypeThkDensity: string | null;
};

type MechanicalData = {
  shell: MechanicalColumn;
  tube: MechanicalColumn | null;
  jacket: MechanicalColumn | null;
};

type GeneralData = {
  hydroTestPosition: string | null;
  vesselOrientation: string | null;
  designServiceLife: string | null;
  windData: string | null;
  windDesignVelocity: string | null;
  seismicDesignCode: string | null;
  hazardFactorZ: string | null;
  seismicCoefficientHorizontal: string | null;
  seismicCoefficientVertical: string | null;
  weightEmptyOperatingHydro: string | null;
  location: string | null;
  qty: string | null;
};

type DesignDataSheet = {
  id: number;
  dwg_control_id: number;
  design_code: string;
  material_code: string | null;
  equipment_description: string | null;
  tag_no: string | null;
  equipment_type: string | null;
  manufacture_serial_no: string | null;
  inspection_by: string;
  equipment_config: string;
  mechanical_data: MechanicalData;
  general_data: GeneralData;
  applied_code: string | null;
  hazard_data: ColumnHazardData | null;
  status: string;
};

type HazardData = {
  appliedCode: string | null;
  isLethalService: 'Yes' | 'No' | null;
  fluidServiceCategory: string | null;
  fluidGroup: string | null;
  pedCategory: string | null;
  fluidState: string;
  toxicInhalationRisk: boolean;
  isFlammable: boolean;
  isCorrosive: boolean;
  isEnvironmentallyHazardous: boolean;
  as4343EquipmentType: 'Vessel' | 'Piping' | null;
  as4343NominalBoreDN: number | null;
  as4343FluidGroup: 'A' | 'B' | 'C' | null;
  codeNativeClassification: string | null;
  internalHazardLevel: string | null;
  hazardBasisNote: string | null;
};

type ColumnHazardData = {
  shell: HazardData;
  tube: HazardData | null;
  jacket: HazardData | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const APPLIED_CODE_OPTIONS = [
  'ASME SEC VIII Div-1',
  'ASME B31.3',
  'EN 13445',
  'PED 2014/68/EU',
  'API 650',
  'AS 4343:2014',
] as const;

const FLUID_SERVICE_CATEGORY_OPTIONS = [
  'Normal Fluid Service',
  'Category D',
  'Category M',
  'High Pressure Fluid Service',
];

const FLUID_STATE_HC_OPTIONS = ['Fluid', 'Vapor', 'Mixture of Fluid and Vapor'];
const FLUID_GROUP_OPTIONS = ['Group 1', 'Group 2'];
const PED_CATEGORY_OPTIONS = ['SEP', 'Category I', 'Category II', 'Category III', 'Category IV'];
const AS4343_EQUIPMENT_OPTIONS = ['Vessel', 'Piping'] as const;
const AS4343_FLUID_GROUP_OPTIONS = ['A', 'B', 'C'] as const;

const AS4343_FLUID_GROUP_LABELS: Record<string, string> = {
  A: 'A — Extremely hazardous (highly toxic, pyrophoric, reactive)',
  B: 'B — Hazardous (flammable, moderately toxic, harmful)',
  C: 'C — Low hazard (steam, air, water, non-flammable/non-toxic)',
};

/**
 * AS 4343:2014 Hazard Level Table Lookup
 * Vessels:  PV = P (MPa gauge) × V (litres)       → thresholds in MPa·L
 * Piping:   P×DN = P (MPa) × 1000 × DN (mm)       → thresholds in kPa·mm
 * Two-phase (Gas/Vapour and Liquid): use Gas/Vapour table (conservative)
 */
function as4343Derive(
  equipType: 'Vessel' | 'Piping',
  fluidGroup: 'A' | 'B' | 'C',
  state: 'Gas/Vapour' | 'Liquid' | 'Gas/Vapour and Liquid',
  energyProduct: number,
): string {
  // Two-phase → conservative: treat as Gas/Vapour
  const isGas = state === 'Gas/Vapour' || state === 'Gas/Vapour and Liquid';

  if (equipType === 'Vessel') {
    // PV in MPa·L
    const pv = energyProduct;
    if (isGas) {
      if (pv > 10000)       return fluidGroup === 'C' ? 'B' : 'A';
      if (pv > 1000)        return fluidGroup === 'A' ? 'A' : fluidGroup === 'B' ? 'B' : 'B';
      if (pv > 100)         return fluidGroup === 'A' ? 'A' : fluidGroup === 'B' ? 'B' : 'C';
      if (pv > 10)          return fluidGroup === 'A' ? 'B' : fluidGroup === 'B' ? 'C' : 'D';
      if (pv > 1)           return fluidGroup === 'A' ? 'C' : fluidGroup === 'B' ? 'D' : 'D';
      return                        fluidGroup === 'A' ? 'D' : 'E';
    } else {
      // Liquid
      if (pv > 10000)       return fluidGroup === 'C' ? 'C' : 'B';
      if (pv > 1000)        return fluidGroup === 'A' ? 'B' : fluidGroup === 'B' ? 'C' : 'C';
      if (pv > 100)         return fluidGroup === 'A' ? 'C' : fluidGroup === 'B' ? 'C' : 'D';
      if (pv > 10)          return fluidGroup === 'A' ? 'C' : fluidGroup === 'B' ? 'D' : 'E';
      if (pv > 1)           return fluidGroup === 'A' ? 'D' : 'E';
      return 'E';
    }
  } else {
    // Piping: P×DN in kPa·mm
    const pdn = energyProduct;
    if (isGas) {
      if (pdn > 350000)     return fluidGroup === 'C' ? 'B' : 'A';
      if (pdn > 100000)     return fluidGroup === 'A' ? 'A' : fluidGroup === 'B' ? 'B' : 'B';
      if (pdn > 35000)      return fluidGroup === 'A' ? 'A' : fluidGroup === 'B' ? 'B' : 'C';
      if (pdn > 10000)      return fluidGroup === 'A' ? 'B' : fluidGroup === 'B' ? 'C' : 'D';
      if (pdn > 3500)       return fluidGroup === 'A' ? 'C' : fluidGroup === 'B' ? 'D' : 'D';
      return                        fluidGroup === 'A' ? 'D' : 'E';
    } else {
      // Liquid
      if (pdn > 350000)     return fluidGroup === 'C' ? 'C' : 'B';
      if (pdn > 100000)     return fluidGroup === 'A' ? 'B' : fluidGroup === 'B' ? 'C' : 'C';
      if (pdn > 35000)      return fluidGroup === 'A' ? 'C' : fluidGroup === 'B' ? 'C' : 'D';
      if (pdn > 10000)      return fluidGroup === 'A' ? 'C' : fluidGroup === 'B' ? 'D' : 'E';
      if (pdn > 3500)       return fluidGroup === 'A' ? 'D' : 'E';
      return 'E';
    }
  }
}

function emptyHazardData(): HazardData {
  return {
    appliedCode: null,
    isLethalService: null,
    fluidServiceCategory: null,
    fluidGroup: null,
    pedCategory: null,
    fluidState: 'Fluid',
    toxicInhalationRisk: false,
    isFlammable: false,
    isCorrosive: false,
    isEnvironmentallyHazardous: false,
    as4343EquipmentType: null,
    as4343NominalBoreDN: null,
    as4343FluidGroup: null,
    codeNativeClassification: null,
    internalHazardLevel: null,
    hazardBasisNote: null,
  };
}

function emptyColumnHazardData(): ColumnHazardData {
  return { shell: emptyHazardData(), tube: null, jacket: null };
}

function deriveHazardFields(data: HazardData): HazardData {
  const code = data.appliedCode;
  if (!code) return { ...data, codeNativeClassification: null, internalHazardLevel: null, hazardBasisNote: null };

  let classification: string | null = null;
  let level: string | null = null;
  let note: string | null = null;

  if (code === 'ASME SEC VIII Div-1') {
    const lethal = data.isLethalService === 'Yes';
    classification = lethal ? 'Lethal Service' : 'Normal Service';
    level = lethal ? 'Highly Hazardous' : 'Normal';
    note = lethal ? 'Derived as Highly Hazardous because Lethal Service = Yes.' : 'Derived as Normal because Normal Service.';
  } else if (code === 'ASME B31.3') {
    const cat = data.fluidServiceCategory;
    classification = cat || null;
    if (cat === 'Category M') { level = 'Highly Hazardous'; note = 'Derived as Highly Hazardous because Fluid Service Category = Category M.'; }
    else if (cat === 'High Pressure Fluid Service') { level = 'Hazardous'; note = 'Derived as Hazardous because High Pressure Fluid Service.'; }
    else if (cat === 'Category D' || cat === 'Normal Fluid Service') { level = 'Normal'; note = `Derived as Normal because ${cat} with no hazard flags.`; }
  } else if (code === 'EN 13445') {
    const grp = data.fluidGroup;
    classification = grp || null;
    if (grp === 'Group 1' && data.toxicInhalationRisk) { level = 'Highly Hazardous'; note = 'Derived as Highly Hazardous because Group 1 with Toxic Inhalation Risk.'; }
    else if (grp === 'Group 1') { level = 'Hazardous'; note = 'Derived as Hazardous because Fluid Group = Group 1.'; }
    else if (grp === 'Group 2') { level = 'Normal'; note = 'Derived as Normal because Group 2 fluid.'; }
  } else if (code === 'PED 2014/68/EU') {
    const grp = data.fluidGroup;
    classification = grp ? (grp === 'Group 1' ? 'Fluid Group 1' : 'Fluid Group 2') : null;
    if (grp === 'Group 1' && data.toxicInhalationRisk) { level = 'Highly Hazardous'; note = 'Derived as Highly Hazardous because Fluid Group 1 with Toxic Inhalation Risk.'; }
    else if (grp === 'Group 1') { level = 'Hazardous'; note = 'Derived as Hazardous because Fluid Group 1.'; }
    else if (grp === 'Group 2') { level = 'Normal'; note = 'Derived as Normal because Fluid Group 2.'; }
  } else if (code === 'API 650') {
    classification = 'Stored Product Review';
    if (data.toxicInhalationRisk) {
      level = 'Highly Hazardous'; note = 'Derived as Highly Hazardous because Toxic Inhalation Risk is flagged.';
    } else if (data.isFlammable || data.isCorrosive || data.isEnvironmentallyHazardous) {
      level = 'Hazardous';
      const flags = [data.isFlammable && 'flammable', data.isCorrosive && 'corrosive', data.isEnvironmentallyHazardous && 'environmentally hazardous'].filter(Boolean).join(', ');
      note = `Derived as Hazardous because stored product is flagged ${flags}.`;
    } else {
      level = 'Normal'; note = 'Derived as Normal because no hazard flags on stored product.';
    }
  } else if (code === 'AS 4343:2014') {
    classification = 'AS 4343';
    level = null;
    note = 'AS 4343:2014 — Hazard Level derived per column (Shell/Tube/Jacket) from each column\'s own design pressure, volume, physical state, and fluid group.';
  }

  return { ...data, codeNativeClassification: classification, internalHazardLevel: level, hazardBasisNote: note };
}

const DESIGN_CODES = [
  'EN 13445-3:2021 + TEMA EDITION-10',
  'EN 13445-3:2021',
  'ASME SEC VIII DIV-1',
  'ASME SEC VIII DIV-2',
  'ASME B31.3',
  'PED 2014/68/EU',
  'API 650',
  'IS 2825',
  'AS 1210',
];

const DISCIPLINE_TO_DESIGN_CODE: Record<string, string> = {
  'ASME SEC VIII Div-1': 'ASME SEC VIII DIV-1',
  'ASME 31.3':           'ASME B31.3',
  'EN 13445':            'EN 13445-3:2021',
  'PED 2014/68/EU':      'PED 2014/68/EU',
  'API 650':             'API 650',
};

const EQUIPMENT_CONFIGS = [
  'Vessel',
  'Jacketed Vessel',
  'Heat Exchanger',
  'Jacketed Vessel and Heat Exchanger',
];

const INSPECTION_OPTIONS = ['SGS India', 'TUV India', 'Thermopac'];

const MECH_PARAM_LABELS: { key: keyof MechanicalColumn; label: string; group: string }[] = [
  { key: 'internalDesignPressureMawp', label: 'INTERNAL DESIGN PRESSURE / MAWP (Barg)', group: 'PRESSURE (Barg)' },
  { key: 'externalDesignPressureMawp', label: 'EXTERNAL DESIGN PRESSURE / MAWP (Barg)', group: 'PRESSURE (Barg)' },
  { key: 'workingPressure', label: 'WORKING PRESSURE (Barg)', group: 'PRESSURE (Barg)' },
  { key: 'hydroTestPressure', label: 'HYDRO TEST PRESSURE (Barg)', group: 'PRESSURE (Barg)' },
  { key: 'mdmt', label: 'MDMT (DEG. C)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'hydroTestTempMinMax', label: 'HYDRO TEST (MIN / MAX) (DEG. C)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'operatingTempMinMax', label: 'OPERATING (MIN / MAX) (DEG. C)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'designTempMinMax', label: 'DESIGN (MIN / MAX) (DEG. C)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'physicalState', label: 'PHYSICAL STATE', group: '' },
  { key: 'grossVolumeLiters', label: 'GROSS VOLUME (LITERS)', group: '' },
  { key: 'serviceFluid', label: 'SERVICE FLUID', group: '' },
  { key: 'hazardLevel', label: 'HAZARD LEVEL', group: '' },
  { key: 'specificGravity', label: 'SPECIFIC GRAVITY (LIQUID / GAS)', group: '' },
  { key: 'internalCorrosionAllowanceMm', label: 'INTERNAL CORROSION ALLOWANCE (SHELL / DISH / NOZZLE) MM', group: '' },
  { key: 'externalCorrosionAllowanceMm', label: 'EXTERNAL CORROSION ALLOWANCE (SHELL / DISH) MM', group: '' },
  { key: 'radiography', label: 'RADIOGRAPHY (FULL / SPOT)', group: '' },
  { key: 'jointEfficiency', label: 'JOINT EFFICIENCY (HEAD / SHELL L SEAM / HEAD TO SHELL)', group: '' },
  { key: 'testingGroup', label: 'TESTING GROUP', group: '' },
  { key: 'fabricationToleranceClass', label: 'FABRICATION TOLERANCE QUALITY CLASS', group: '' },
  { key: 'postWeldHeatTreatment', label: 'POST WELD HEAT TREATMENT', group: '' },
  { key: 'typeOfHeads', label: 'TYPE OF HEADS', group: '' },
  { key: 'insulation', label: 'INSULATION', group: '' },
  { key: 'insulationTypeThkDensity', label: 'INSULATION (TYPE / THK / DENSITY (KG/M3))', group: '' },
];

const GENERAL_PARAM_LABELS: { key: keyof GeneralData; label: string }[] = [
  { key: 'hydroTestPosition', label: 'HYDRO TEST POSITION' },
  { key: 'vesselOrientation', label: 'VESSEL ORIENTATION (HOR / VER)' },
  { key: 'designServiceLife', label: 'DESIGN SERVICE LIFE' },
  { key: 'windData', label: 'WIND DATA' },
  { key: 'windDesignVelocity', label: 'WIND DESIGN VELOCITY' },
  { key: 'seismicDesignCode', label: 'SEISMIC DESIGN CODE' },
  { key: 'hazardFactorZ', label: 'HAZARD FACTOR Z' },
  { key: 'seismicCoefficientHorizontal', label: 'SEISMICE COEFFICIENT HORIZONTAL WSD' },
  { key: 'seismicCoefficientVertical', label: 'SEISMICE COEFFICIENT VERTICAL WSD' },
  { key: 'weightEmptyOperatingHydro', label: 'WEIGHT (EMPTY / OPERATING / HYDRO TEST) KGS' },
  { key: 'location', label: 'LOCATION' },
  { key: 'qty', label: 'Qty' },
];

// ─── Smart computation helpers ────────────────────────────────────────────────

function calcHydroTestPressure(internalPressureBarg: number, disciplineCode: string | null | undefined): string {
  const dc = (disciplineCode || '').toLowerCase();
  if (dc.includes('api 650')) return 'N.A.';
  let multiplier = 1.3;
  if (dc.includes('b31.3') || (dc.includes('31.3') && !dc.includes('13445'))) multiplier = 1.5;
  else if (dc.includes('en 13445') || dc.includes('13445')) multiplier = 1.25;
  else if (dc.includes('ped') || dc.includes('2014/68')) multiplier = 1.43;
  return (internalPressureBarg * multiplier).toFixed(3);
}

function parseOperatingMax(operatingTempMinMax: string | null | undefined): number | null {
  if (!operatingTempMinMax) return null;
  const parts = operatingTempMinMax.split('/').map(s => s.trim());
  if (parts.length >= 2) {
    const max = parseFloat(parts[1]);
    return isNaN(max) ? null : max;
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Per-column AS 4343 derivation.
 * Physical state mapping: Fluid→Liquid | Vapor→Gas/Vapour | Mixture→Gas/Vapour and Liquid
 * Pressure: internalDesignPressureMawp in Barg → × 0.1 → MPa
 * eqType, dn, and fg come from the column's HazardData; physicalState/pressure/volume from MechanicalColumn.
 */
function deriveColumnAS4343(
  col: MechanicalColumn,
  hazard: HazardData,
): { level: string | null; note: string | null } {
  const eqType = hazard.as4343EquipmentType;
  const dn = hazard.as4343NominalBoreDN;
  const fg = hazard.as4343FluidGroup;
  const stateMap: Record<string, 'Gas/Vapour' | 'Liquid' | 'Gas/Vapour and Liquid'> = {
    'Fluid': 'Liquid',
    'Vapor': 'Gas/Vapour',
    'Mixture of Fluid and Vapor': 'Gas/Vapour and Liquid',
  };
  const ps = col.physicalState ? (stateMap[col.physicalState] ?? null) : null;
  const pBarg = col.internalDesignPressureMawp ? parseFloat(col.internalDesignPressureMawp) : null;
  const pMPa = (pBarg != null && !isNaN(pBarg)) ? pBarg * 0.1 : null;
  const vol  = col.grossVolumeLiters ? parseFloat(col.grossVolumeLiters) : null;

  if (!eqType) return { level: null, note: 'Insufficient data — select Equipment Type in the Hazard panel.' };
  if (!fg)     return { level: null, note: 'Insufficient data — set AS 4343 Fluid Group in the Hazard panel.' };
  if (!ps)     return { level: null, note: 'Insufficient data — set Physical State for this column.' };

  if (eqType === 'Vessel') {
    if (!pMPa || pMPa <= 0 || !vol || isNaN(vol) || vol <= 0) {
      return { level: null, note: 'Insufficient data — enter Design Pressure and Gross Volume for this vessel column.' };
    }
    const pv = pMPa * vol;
    const stateLabel = ps === 'Gas/Vapour and Liquid' ? 'Gas/Vapour (conservative — two-phase)' : ps;
    const level = as4343Derive('Vessel', fg, ps, pv);
    return {
      level,
      note: `Vessel, ${stateLabel}, Group ${fg} — PV = ${pv.toFixed(2)} MPa·L → Level ${level} per AS 4343:2014`,
    };
  } else {
    if (!pMPa || pMPa <= 0 || !dn || dn <= 0) {
      return { level: null, note: 'Insufficient data — enter Design Pressure and Nominal Bore DN for this piping column.' };
    }
    const pdn = pMPa * 1000 * dn;
    const stateLabel = ps === 'Gas/Vapour and Liquid' ? 'Gas/Vapour (conservative — two-phase)' : ps;
    const level = as4343Derive('Piping', fg, ps, pdn);
    return {
      level,
      note: `Piping, ${stateLabel}, Group ${fg} — P×DN = ${pdn.toFixed(0)} kPa·mm → Level ${level} per AS 4343:2014`,
    };
  }
}

function emptyMechanicalColumn(): MechanicalColumn {
  return {
    internalDesignPressureMawp: null, externalDesignPressureMawp: null,
    workingPressure: null, hydroTestPressure: null, mdmt: null,
    hydroTestTempMinMax: null, operatingTempMinMax: null, designTempMinMax: null,
    physicalState: null, grossVolumeLiters: null, serviceFluid: null,
    hazardLevel: null, specificGravity: null,
    internalCorrosionAllowanceMm: null, externalCorrosionAllowanceMm: null,
    radiography: null, jointEfficiency: null,
    testingGroup: null, fabricationToleranceClass: null, postWeldHeatTreatment: null,
    typeOfHeads: null, insulation: null, insulationTypeThkDensity: null,
  };
}

function emptyGeneralData(): GeneralData {
  return {
    hydroTestPosition: null, vesselOrientation: null, designServiceLife: null,
    windData: null, windDesignVelocity: null, seismicDesignCode: null,
    hazardFactorZ: null, seismicCoefficientHorizontal: null,
    seismicCoefficientVertical: null, weightEmptyOperatingHydro: null,
    location: null, qty: null,
  };
}

function getColumns(config: string): { shell: boolean; tube: boolean; jacket: boolean } {
  return {
    shell: true,
    tube: config === 'Heat Exchanger' || config === 'Jacketed Vessel and Heat Exchanger',
    jacket: config === 'Jacketed Vessel' || config === 'Jacketed Vessel and Heat Exchanger',
  };
}

function getColumnHeaders(config: string): string[] {
  const c = getColumns(config);
  const h: string[] = [];
  if (c.shell) h.push('SHELL');
  if (c.tube) h.push('TUBE');
  if (c.jacket) h.push('JACKET 1&2');
  return h;
}

// ─── Renderer (read-only tabular view) ───────────────────────────────────────

function DesignDataRenderer({ sheet }: { sheet: DesignDataSheet }) {
  const config = sheet.equipment_config;
  const cols = getColumns(config);
  const colHeaders = getColumnHeaders(config);
  const mechData = sheet.mechanical_data;
  const genData = sheet.general_data;

  const colData: (MechanicalColumn | null)[] = [
    cols.shell ? mechData.shell : null,
    cols.tube ? mechData.tube : null,
    cols.jacket ? mechData.jacket : null,
  ].filter(Boolean) as MechanicalColumn[];

  const isMultiCol = colHeaders.length > 1;

  // Group consecutive rows with same group label
  let lastGroup = '';

  return (
    <div className="font-mono text-[10px] border border-gray-400">
      {/* Title */}
      <div className="text-center font-bold text-sm py-2 border-b border-gray-400 bg-gray-50 tracking-wide">
        4.1 DESIGN DATA
      </div>

      {/* Header rows */}
      <table className="w-full border-collapse text-[10px]">
        <tbody>
          {[
            { label: 'DESIGN CODE', value: sheet.design_code },
            { label: 'MATERIAL CODE', value: sheet.material_code || '—' },
            { label: 'EQUIPMENT', value: sheet.equipment_description || '—' },
            { label: 'TAG NO', value: sheet.tag_no || <span className="text-amber-600 italic">Pending (see warnings)</span> },
            { label: 'TYPE', value: sheet.equipment_type || '—' },
            { label: 'MANUFACTURE SERIAL NO', value: sheet.manufacture_serial_no || <span className="text-amber-600 italic">Pending (see warnings)</span> },
            { label: 'INSPECTION BY', value: sheet.inspection_by },
          ].map((row) => (
            <tr key={row.label} className="border-b border-gray-300">
              <td className="border-r border-gray-300 bg-gray-50 font-semibold px-2 py-1 w-48 uppercase text-[9px] tracking-wide">
                {row.label}
              </td>
              <td className="px-2 py-1 text-[10px]">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mechanical Data */}
      <table className="w-full border-collapse text-[10px] border-t-2 border-gray-400">
        <thead>
          <tr className="border-b border-gray-400 bg-gray-100">
            <th className="border-r border-gray-300 px-2 py-1 text-left w-32 text-[9px]">GROUP</th>
            <th className="border-r border-gray-300 px-2 py-1 text-left text-[9px]">PARAMETER</th>
            {colHeaders.map((h) => (
              <th key={h} className="border-r border-gray-300 px-2 py-1 text-center text-[9px] font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MECH_PARAM_LABELS.map((p, idx) => {
            const showGroup = p.group && p.group !== lastGroup;
            if (showGroup) lastGroup = p.group;
            const isGroupRow = MECH_PARAM_LABELS.findIndex(x => x.group === p.group) === idx;

            return (
              <tr key={p.key} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="border-r border-gray-300 px-2 py-0.5 text-[8px] font-semibold bg-gray-50 uppercase align-top">
                  {isGroupRow && p.group ? p.group : ''}
                </td>
                <td className="border-r border-gray-300 px-2 py-0.5 text-[9px] uppercase">
                  {p.label}
                </td>
                {colData.map((col, ci) => (
                  <td key={ci} className="border-r border-gray-300 px-2 py-0.5 text-[10px] text-center">
                    {col ? (col[p.key] ?? 'N.A.') : 'N.A.'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* General Data */}
      <table className="w-full border-collapse text-[10px] border-t-2 border-gray-400">
        <tbody>
          {GENERAL_PARAM_LABELS.map((p) => (
            <tr key={p.key} className="border-b border-gray-200 hover:bg-gray-50">
              <td className="border-r border-gray-300 bg-gray-50 font-semibold px-2 py-0.5 uppercase text-[9px] tracking-wide w-72">
                {p.label}
              </td>
              <td className="px-2 py-0.5 text-[10px]">
                {genData[p.key] ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Smart Mechanical Column Form ─────────────────────────────────────────────

const AUTO_COMPUTED_KEYS: (keyof MechanicalColumn)[] = [
  'internalDesignPressureMawp',
  'hydroTestPressure',
  'designTempMinMax',
];

const FIELD_DEFAULTS: Partial<Record<keyof MechanicalColumn, string>> = {
  workingPressure: '0.5',
  externalDesignPressureMawp: '1.034',
  hydroTestTempMinMax: '17 / 48',
  physicalState: 'Fluid',
  serviceFluid: 'Hydrocarbon',
  internalCorrosionAllowanceMm: '1.5',
  externalCorrosionAllowanceMm: '1.5',
  radiography: 'FULL RADIOGRAPHY (100% RT)',
};

const PHYSICAL_STATE_OPTIONS = ['Fluid', 'Vapor', 'Mixture of Fluid and Vapor'];
const SERVICE_FLUID_OPTIONS = ['Water', 'Hydrocarbon', 'Caustic (NaOH)', 'Steam condensate', 'Thermic Fluid'];
const CORROSION_ALLOWANCE_OPTIONS = ['1', '1.5', '2', '2.5', '3'];
const RADIOGRAPHY_OPTIONS = ['FULL RADIOGRAPHY (100% RT)', 'SPOT RADIOGRAPHY 10%', 'SPOT RADIOGRAPHY 5%'];

function SmartMechanicalColumnForm({
  label, data, onChange, projectMdmt, disciplineCode, derivedHazardLevel,
}: {
  label: string;
  data: MechanicalColumn;
  onChange: (col: MechanicalColumn) => void;
  projectMdmt: string | null | undefined;
  disciplineCode: string | null | undefined;
  derivedHazardLevel?: string | null;
}) {
  function handleChange(key: keyof MechanicalColumn, rawValue: string) {
    const value = rawValue || null;
    const updated: MechanicalColumn = { ...data, [key]: value };

    if (key === 'workingPressure') {
      const wp = parseFloat(rawValue);
      if (!isNaN(wp)) {
        const idp = wp + 2;
        updated.internalDesignPressureMawp = idp.toFixed(3);
        updated.hydroTestPressure = calcHydroTestPressure(idp, disciplineCode);
      }
    }

    if (key === 'internalDesignPressureMawp') {
      const idp = parseFloat(rawValue);
      if (!isNaN(idp)) {
        updated.hydroTestPressure = calcHydroTestPressure(idp, disciplineCode);
      }
    }

    if (key === 'operatingTempMinMax') {
      const opMax = parseOperatingMax(rawValue);
      if (opMax !== null && projectMdmt) {
        updated.designTempMinMax = `${projectMdmt} / ${opMax + 30}`;
      }
    }

    onChange(updated);
  }

  const isApiDiscipline = (disciplineCode || '').toLowerCase().includes('api 650');

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold text-center uppercase bg-gray-100 py-0.5 rounded">{label}</div>
      {MECH_PARAM_LABELS.map((p) => {
        const val = data[p.key] ?? '';

        if (p.key === 'mdmt') {
          return (
            <div key={p.key} className="flex items-center gap-2">
              <Label className="text-[9px] w-48 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 35)}</Label>
              <div className="flex-1 flex items-center gap-1">
                <Input
                  className="h-6 text-[10px] px-1.5 bg-blue-50 text-blue-800"
                  value={projectMdmt ?? 'Not set on Project'}
                  readOnly
                />
                <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0 text-blue-600 border-blue-300 bg-blue-50">Project</Badge>
              </div>
            </div>
          );
        }

        if (p.key === 'hydroTestPressure' && isApiDiscipline) {
          return (
            <div key={p.key} className="flex items-center gap-2">
              <Label className="text-[9px] w-48 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 35)}</Label>
              <div className="flex-1 flex items-center gap-1">
                <Input className="h-6 text-[10px] px-1.5 bg-slate-100 text-slate-500" value="N.A." readOnly />
                <span className="text-[8px] text-slate-500 shrink-0">API 650</span>
              </div>
            </div>
          );
        }

        if (p.key === 'physicalState' || p.key === 'serviceFluid') {
          const options = p.key === 'physicalState' ? PHYSICAL_STATE_OPTIONS : SERVICE_FLUID_OPTIONS;
          const isAtDefault = val === FIELD_DEFAULTS[p.key];
          return (
            <div key={p.key} className="flex items-center gap-2">
              <Label className="text-[9px] w-48 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 35)}</Label>
              <div className="flex-1 flex items-center gap-1">
                <Select value={val || ''} onValueChange={(v) => handleChange(p.key, v)}>
                  <SelectTrigger className={`h-6 text-[10px] px-1.5 flex-1 ${isAtDefault ? 'bg-green-50' : ''}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(o => <SelectItem key={o} value={o} className="text-[10px]">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                {isAtDefault && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0 text-green-700 border-green-300 bg-green-50">Auto</Badge>
                )}
              </div>
            </div>
          );
        }

        if (p.key === 'hazardLevel') {
          const display = derivedHazardLevel || val || '';
          const fromHazardPanel = !!derivedHazardLevel;
          const isAs4343Level = fromHazardPanel && ['A','B','C','D','E'].includes(display);
          const levelClass = fromHazardPanel
            ? (isAs4343Level
                ? (AS4343_BADGE[display] || 'bg-slate-50 text-slate-600')
                : ({
                    'Normal': 'bg-green-50 text-green-800',
                    'Hazardous': 'bg-amber-50 text-amber-800',
                    'Highly Hazardous': 'bg-red-50 text-red-800',
                  }[display] || 'bg-slate-50'))
            : '';
          return (
            <div key={p.key} className="flex items-center gap-2">
              <Label className="text-[9px] w-48 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 35)}</Label>
              <div className="flex-1 flex items-center gap-1">
                <Input
                  className={`h-6 text-[10px] px-1.5 ${levelClass}`}
                  value={display}
                  readOnly={fromHazardPanel}
                  onChange={fromHazardPanel ? undefined : (e) => handleChange(p.key, e.target.value)}
                  placeholder="N.A."
                />
                {fromHazardPanel && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0 text-slate-500 border-slate-300 bg-slate-50">Panel</Badge>
                )}
              </div>
            </div>
          );
        }

        if (p.key === 'internalCorrosionAllowanceMm' || p.key === 'externalCorrosionAllowanceMm') {
          const defaultVal = FIELD_DEFAULTS[p.key]!;
          const isAtDefault = !val || val === defaultVal;
          const displayVal = val || defaultVal;
          return (
            <div key={p.key} className="flex items-center gap-2">
              <Label className="text-[9px] w-48 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 35)}</Label>
              <div className="flex-1 flex items-center gap-1">
                <Select value={displayVal} onValueChange={(v) => handleChange(p.key, v)}>
                  <SelectTrigger className={`h-6 text-[10px] px-1.5 flex-1 ${isAtDefault ? 'bg-green-50' : ''}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CORROSION_ALLOWANCE_OPTIONS.map(o => (
                      <SelectItem key={o} value={o} className="text-[10px]">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAtDefault && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0 text-green-700 border-green-300 bg-green-50">Auto</Badge>
                )}
              </div>
            </div>
          );
        }

        if (p.key === 'radiography') {
          const defaultVal = FIELD_DEFAULTS.radiography!;
          const isAtDefault = !val || val === defaultVal;
          const displayVal = val || defaultVal;
          return (
            <div key={p.key} className="flex items-center gap-2">
              <Label className="text-[9px] w-48 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 35)}</Label>
              <div className="flex-1 flex items-center gap-1">
                <Select value={displayVal} onValueChange={(v) => handleChange(p.key, v)}>
                  <SelectTrigger className={`h-6 text-[10px] px-1.5 flex-1 ${isAtDefault ? 'bg-green-50' : ''}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RADIOGRAPHY_OPTIONS.map(o => (
                      <SelectItem key={o} value={o} className="text-[10px]">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAtDefault && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0 text-green-700 border-green-300 bg-green-50">Auto</Badge>
                )}
              </div>
            </div>
          );
        }

        const isComputed = AUTO_COMPUTED_KEYS.includes(p.key);
        const isAtDefault = !isComputed && FIELD_DEFAULTS[p.key] !== undefined && val === FIELD_DEFAULTS[p.key];
        const showAutoBadge = isComputed || isAtDefault;

        return (
          <div key={p.key} className="flex items-center gap-2">
            <Label className="text-[9px] w-48 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 35)}</Label>
            <div className="flex-1 flex items-center gap-1">
              <Input
                className={`h-6 text-[10px] px-1.5 ${showAutoBadge ? 'bg-green-50' : ''}`}
                value={val}
                onChange={(e) => handleChange(p.key, e.target.value)}
                placeholder="N.A."
              />
              {showAutoBadge && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0 text-green-700 border-green-300 bg-green-50">Auto</Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GeneralDataForm({
  data, onChange,
}: {
  data: GeneralData;
  onChange: (g: GeneralData) => void;
}) {
  return (
    <div className="space-y-1">
      {GENERAL_PARAM_LABELS.map((p) => (
        <div key={p.key} className="flex items-center gap-2">
          <Label className="text-[9px] w-56 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 40)}</Label>
          <Input
            className="h-6 text-[10px] px-1.5"
            value={data[p.key] ?? ''}
            onChange={(e) => onChange({ ...data, [p.key]: e.target.value || null })}
            placeholder="—"
          />
        </div>
      ))}
    </div>
  );
}

// ─── Hazard Classification Sample Cases ───────────────────────────────────────

type HazardSample = {
  id: string;
  code: string;
  inputs: string;
  classification: string;
  level: string;
  basisNote: string;
};

const HAZARD_SAMPLES: HazardSample[] = [
  { id: 'A', code: 'ASME SEC VIII Div-1', inputs: 'isLethalService = Yes',
    classification: 'Lethal Service', level: 'Highly Hazardous',
    basisNote: 'Derived as Highly Hazardous because Lethal Service = Yes.' },
  { id: 'B', code: 'ASME SEC VIII Div-1', inputs: 'isLethalService = No',
    classification: 'Normal Service', level: 'Normal',
    basisNote: 'Derived as Normal because Normal Service.' },
  { id: 'C', code: 'ASME B31.3', inputs: 'fluidServiceCategory = Category M',
    classification: 'Category M', level: 'Highly Hazardous',
    basisNote: 'Derived as Highly Hazardous because Fluid Service Category = Category M.' },
  { id: 'D', code: 'ASME B31.3', inputs: 'fluidServiceCategory = High Pressure Fluid Service',
    classification: 'High Pressure Fluid Service', level: 'Hazardous',
    basisNote: 'Derived as Hazardous because High Pressure Fluid Service.' },
  { id: 'E', code: 'EN 13445', inputs: 'fluidGroup = Group 1 · toxicInhalationRisk = Yes',
    classification: 'Group 1', level: 'Highly Hazardous',
    basisNote: 'Derived as Highly Hazardous because Group 1 with Toxic Inhalation Risk.' },
  { id: 'F', code: 'EN 13445', inputs: 'fluidGroup = Group 2',
    classification: 'Group 2', level: 'Normal',
    basisNote: 'Derived as Normal because Group 2 fluid.' },
  { id: 'G', code: 'PED 2014/68/EU', inputs: 'fluidGroup = Group 1 · pedCategory = Category III · toxicInhalationRisk = No',
    classification: 'Fluid Group 1', level: 'Hazardous',
    basisNote: 'Derived as Hazardous because Fluid Group 1.' },
  { id: 'H', code: 'PED 2014/68/EU', inputs: 'fluidGroup = Group 2 · pedCategory = Category I',
    classification: 'Fluid Group 2', level: 'Normal',
    basisNote: 'Derived as Normal because Fluid Group 2.' },
  { id: 'I', code: 'API 650', inputs: 'toxicInhalationRisk = Yes · isFlammable = Yes',
    classification: 'Stored Product Review', level: 'Highly Hazardous',
    basisNote: 'Derived as Highly Hazardous because Toxic Inhalation Risk is flagged.' },
  { id: 'J', code: 'API 650', inputs: 'toxicInhalationRisk = No · isFlammable = Yes · isCorrosive = No · isEnvironmentallyHazardous = No',
    classification: 'Stored Product Review', level: 'Hazardous',
    basisNote: 'Derived as Hazardous because stored product is flagged flammable.' },
  { id: 'K', code: 'AS 4343:2014',
    inputs: 'Vessel · Gas/Vapour · Group A · P = 2.0 MPa · V = 10,000 L',
    classification: 'AS 4343', level: 'A',
    basisNote: 'Vessel, Gas/Vapour, Group A — PV = 20,000.00 MPa·L → Hazard Level A per AS 4343:2014 Table' },
  { id: 'L', code: 'AS 4343:2014',
    inputs: 'Vessel · Gas/Vapour · Group B · P = 1.5 MPa · V = 300 L',
    classification: 'AS 4343', level: 'B',
    basisNote: 'Vessel, Gas/Vapour, Group B — PV = 450.00 MPa·L → Hazard Level B per AS 4343:2014 Table' },
  { id: 'M', code: 'AS 4343:2014',
    inputs: 'Vessel · Liquid · Group A · P = 0.8 MPa · V = 50 L',
    classification: 'AS 4343', level: 'C',
    basisNote: 'Vessel, Liquid, Group A — PV = 40.00 MPa·L → Hazard Level C per AS 4343:2014 Table' },
  { id: 'N', code: 'AS 4343:2014',
    inputs: 'Piping · Gas/Vapour · Group B · P = 0.5 MPa · DN = 50 mm',
    classification: 'AS 4343', level: 'C',
    basisNote: 'Piping, Gas/Vapour, Group B — P×DN = 25,000 kPa·mm (10,000–35,000 band) → Hazard Level C per AS 4343:2014 Table' },
  { id: 'N2', code: 'AS 4343:2014',
    inputs: 'Piping · Gas/Vapour · Group B · P = 0.1 MPa · DN = 75 mm',
    classification: 'AS 4343', level: 'D',
    basisNote: 'Piping, Gas/Vapour, Group B — P×DN = 7,500 kPa·mm (3,500–10,000 band) → Hazard Level D per AS 4343:2014 Table' },
  { id: 'O', code: 'AS 4343:2014',
    inputs: 'Piping · Liquid · Group C · P = 0.3 MPa · DN = 25 mm',
    classification: 'AS 4343', level: 'E',
    basisNote: 'Piping, Liquid, Group C — P×DN = 7,500 kPa·mm → Hazard Level E per AS 4343:2014 Table' },
  { id: 'P', code: 'AS 4343:2014',
    inputs: 'Vessel · Gas/Vapour and Liquid (two-phase) · Group B · P = 1.0 MPa · V = 200 L',
    classification: 'AS 4343', level: 'B',
    basisNote: 'Vessel, Gas/Vapour (conservative — two-phase), Group B — PV = 200.00 MPa·L → Hazard Level B per AS 4343:2014 Table' },
];

const LEVEL_CHIP: Record<string, string> = {
  'Normal': 'bg-green-100 text-green-700 border border-green-300',
  'Hazardous': 'bg-amber-100 text-amber-700 border border-amber-300',
  'Highly Hazardous': 'bg-red-100 text-red-700 border border-red-300',
  'A': 'bg-red-100 text-red-800 border border-red-400',
  'B': 'bg-orange-100 text-orange-700 border border-orange-300',
  'C': 'bg-amber-100 text-amber-700 border border-amber-300',
  'D': 'bg-blue-100 text-blue-700 border border-blue-300',
  'E': 'bg-green-100 text-green-700 border border-green-300',
};

// ─── Hazard Classification Panel (per-column) ─────────────────────────────────

const AS4343_BADGE: Record<string, string> = {
  A: 'text-red-800 bg-red-50 border-red-400',
  B: 'text-orange-700 bg-orange-50 border-orange-300',
  C: 'text-amber-700 bg-amber-50 border-amber-300',
  D: 'text-blue-700 bg-blue-50 border-blue-300',
  E: 'text-green-700 bg-green-50 border-green-300',
};

/** Reset all code-specific input fields; preserve fluidState and column identity. */
function clearCodeSpecificFields(d: HazardData): HazardData {
  return {
    ...d,
    isLethalService: null,
    fluidServiceCategory: null,
    fluidGroup: null,
    pedCategory: null,
    toxicInhalationRisk: false,
    isFlammable: false,
    isCorrosive: false,
    isEnvironmentallyHazardous: false,
    as4343EquipmentType: null,
    as4343NominalBoreDN: null,
    as4343FluidGroup: null,
    codeNativeClassification: null,
    internalHazardLevel: null,
    hazardBasisNote: null,
  };
}

function HazardClassificationPanel({
  label,
  data,
  onChange,
  mechColumn,
  isFirstColumn,
  onAppliedCodeChange,
}: {
  label: string;
  data: HazardData;
  onChange: (d: HazardData) => void;
  mechColumn: MechanicalColumn;
  isFirstColumn: boolean;
  onAppliedCodeChange: (code: string | null) => void;
}) {
  const code = data.appliedCode;
  const [showExamples, setShowExamples] = useState(false);
  const filteredSamples = code ? HAZARD_SAMPLES.filter(s => s.code === code) : HAZARD_SAMPLES;

  const isAS4343 = code === 'AS 4343:2014';
  const as4343Result = isAS4343 ? deriveColumnAS4343(mechColumn, data) : null;

  function handleField(updates: Partial<HazardData>) {
    onChange(deriveHazardFields({ ...data, ...updates }));
  }

  const isVIII  = code === 'ASME SEC VIII Div-1';
  const isB31   = code === 'ASME B31.3';
  const isEN    = code === 'EN 13445';
  const isPED   = code === 'PED 2014/68/EU';
  const isAPI   = code === 'API 650';
  const showToxic = isEN || isPED || isAPI;

  const displayLevel = isAS4343 ? (as4343Result?.level ?? null) : data.internalHazardLevel;
  const levelBadgeClass = isAS4343
    ? (AS4343_BADGE[displayLevel || ''] || 'text-slate-500 bg-slate-50 border-slate-200')
    : ({
        'Normal': 'text-green-700 bg-green-50 border-green-300',
        'Hazardous': 'text-amber-700 bg-amber-50 border-amber-300',
        'Highly Hazardous': 'text-red-700 bg-red-50 border-red-300',
      }[displayLevel || ''] || 'text-slate-500 bg-slate-50 border-slate-200');

  const yesNo = (val: boolean, key: keyof HazardData) => (
    <Select value={val ? 'Yes' : 'No'} onValueChange={(v) => handleField({ [key]: v === 'Yes' } as any)}>
      <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="No" className="text-[10px]">No</SelectItem>
        <SelectItem value="Yes" className="text-[10px]">Yes</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="border rounded-md p-3 space-y-3 bg-slate-50/60 h-full">
      {/* Column label + level badge */}
      <div className="flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700">{label}</span>
        {displayLevel && (
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ml-auto ${levelBadgeClass}`}>{displayLevel}</Badge>
        )}
      </div>

      {/* Applied Code — editable only in Shell (first) column; read-only badge in others */}
      {isFirstColumn ? (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Applied Code</Label>
          <Select value={code || ''} onValueChange={(v) => onAppliedCodeChange(v || null)}>
            <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Select code…" /></SelectTrigger>
            <SelectContent>
              {APPLIED_CODE_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-[10px]">{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-0.5">
          <span className="text-[10px] text-muted-foreground shrink-0">Applied Code</span>
          {code
            ? <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">{code}</Badge>
            : <span className="text-[10px] text-slate-400 italic">Shared from Shell</span>
          }
        </div>
      )}

      {/* Code-specific inputs */}
      {code && (
        <div className="grid grid-cols-2 gap-2">
          {!isAS4343 && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Fluid State</Label>
              <Select value={data.fluidState || 'Fluid'} onValueChange={(v) => handleField({ fluidState: v })}>
                <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>{FLUID_STATE_HC_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-[10px]">{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {isVIII && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Lethal Service</Label>
              <Select value={data.isLethalService || 'No'} onValueChange={(v) => handleField({ isLethalService: v as 'Yes' | 'No' })}>
                <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="No" className="text-[10px]">No</SelectItem>
                  <SelectItem value="Yes" className="text-[10px]">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isB31 && (
            <div className="space-y-1 col-span-2">
              <Label className="text-[10px] text-muted-foreground">Fluid Service Category</Label>
              <Select value={data.fluidServiceCategory || ''} onValueChange={(v) => handleField({ fluidServiceCategory: v })}>
                <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{FLUID_SERVICE_CATEGORY_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-[10px]">{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {(isEN || isPED) && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Fluid Group {isPED && <span className="text-red-500">*</span>}</Label>
              <Select value={data.fluidGroup || ''} onValueChange={(v) => handleField({ fluidGroup: v })}>
                <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{FLUID_GROUP_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-[10px]">{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {isPED && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">PED Category <span className="text-red-500">*</span></Label>
              <Select value={data.pedCategory || ''} onValueChange={(v) => handleField({ pedCategory: v })}>
                <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{PED_CATEGORY_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-[10px]">{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {showToxic && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Toxic Inhalation Risk</Label>
              {yesNo(data.toxicInhalationRisk, 'toxicInhalationRisk')}
            </div>
          )}

          {isAPI && (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Flammable</Label>
                {yesNo(data.isFlammable, 'isFlammable')}
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Corrosive</Label>
                {yesNo(data.isCorrosive, 'isCorrosive')}
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px] text-muted-foreground">Environmentally Hazardous</Label>
                {yesNo(data.isEnvironmentallyHazardous, 'isEnvironmentallyHazardous')}
              </div>
            </>
          )}

          {isAS4343 && (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Equipment Type <span className="text-red-500">*</span></Label>
                <Select value={data.as4343EquipmentType || ''} onValueChange={(v) => handleField({ as4343EquipmentType: v as 'Vessel' | 'Piping', as4343NominalBoreDN: null })}>
                  <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {AS4343_EQUIPMENT_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-[10px]">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">AS 4343 Fluid Group <span className="text-red-500">*</span></Label>
                <Select value={data.as4343FluidGroup || ''} onValueChange={(v) => handleField({ as4343FluidGroup: v as 'A' | 'B' | 'C' })}>
                  <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="A / B / C…" /></SelectTrigger>
                  <SelectContent>
                    {AS4343_FLUID_GROUP_OPTIONS.map(g => (
                      <SelectItem key={g} value={g} className="text-[10px]">{AS4343_FLUID_GROUP_LABELS[g]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {data.as4343EquipmentType === 'Piping' && (
                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Nominal Bore DN (mm) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number" min="0" step="1"
                    className="h-7 text-[10px]"
                    placeholder="e.g. 150"
                    value={data.as4343NominalBoreDN ?? ''}
                    onChange={(e) => handleField({ as4343NominalBoreDN: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Derived outputs */}
      {code && (
        <div className="border-t border-slate-200 pt-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-32 shrink-0">Classification</span>
            <span className="text-[10px] text-slate-700 font-medium">{data.codeNativeClassification || '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-32 shrink-0">Hazard Level</span>
            {displayLevel
              ? <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${levelBadgeClass}`}>{displayLevel}</Badge>
              : <span className="text-[10px] text-muted-foreground italic">
                  {isAS4343 ? 'Set inputs above' : '—'}
                </span>}
          </div>
          {(isAS4343 ? as4343Result?.note : data.hazardBasisNote) && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-muted-foreground w-32 shrink-0 pt-0.5">Basis Note</span>
              <span className="text-[10px] text-slate-600 italic leading-snug">
                {isAS4343 ? as4343Result?.note : data.hazardBasisNote}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Collapsible reference examples */}
      {code && (
        <div className="border-t border-dashed border-slate-200 pt-2">
          <button
            type="button"
            onClick={() => setShowExamples(v => !v)}
            className="flex items-center gap-1.5 text-[9px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showExamples ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Reference examples for {code}
            <span className="ml-1 px-1 py-0 rounded bg-slate-100 text-slate-400 font-mono">{filteredSamples.length}</span>
          </button>

          {showExamples && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[9px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-500">
                    <th className="px-1.5 py-1 text-left font-medium w-5">#</th>
                    <th className="px-1.5 py-1 text-left font-medium">Inputs</th>
                    <th className="px-1.5 py-1 text-left font-medium">Classification</th>
                    <th className="px-1.5 py-1 text-left font-medium">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSamples.map((s, i) => (
                    <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-1.5 py-1 text-slate-400 font-mono">{s.id}</td>
                      <td className="px-1.5 py-1 text-slate-600">{s.inputs.split(' · ').map((part, pi) => (
                        <span key={pi} className="block">{part}</span>
                      ))}</td>
                      <td className="px-1.5 py-1 text-slate-700 font-medium whitespace-nowrap">{s.classification}</td>
                      <td className="px-1.5 py-1 whitespace-nowrap">
                        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[8px] font-semibold ${LEVEL_CHIP[s.level]}`}>{s.level}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  drawingControlId: number;
  drawingStatus: string;
  userRole: string;
  disciplineCode?: string | null;
}

export default function DesignDataGenerator({ drawingControlId, drawingStatus, userRole, disciplineCode }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [designCode, setDesignCode] = useState('');
  const [equipmentConfig, setEquipmentConfig] = useState('');
  const [inspectionBy, setInspectionBy] = useState('');
  const [mechShell, setMechShell] = useState<MechanicalColumn>(emptyMechanicalColumn());
  const [mechTube, setMechTube] = useState<MechanicalColumn>(emptyMechanicalColumn());
  const [mechJacket, setMechJacket] = useState<MechanicalColumn>(emptyMechanicalColumn());
  const [generalData, setGeneralData] = useState<GeneralData>(emptyGeneralData());
  const [colHazard, setColHazard] = useState<ColumnHazardData>(emptyColumnHazardData());

  const canEdit = ['draft', 'under_review'].includes(drawingStatus) &&
    ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Senior Executive'].includes(userRole);

  // ── Query ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<{ sheet: DesignDataSheet | null; autoFields?: any; warnings?: any }>({
    queryKey: ['/api/drawing-design-data', drawingControlId],
    queryFn: () => fetch(`/api/drawing-design-data/${drawingControlId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const sheet = data?.sheet || null;
  const autoFields = data?.autoFields || {};
  const warnings = data?.warnings || {};

  const projMdmt = autoFields.projectMdmt || null;

  function seedColumn(col: MechanicalColumn): MechanicalColumn {
    const wp = col.workingPressure ?? '0.5';
    const wpNum = parseFloat(wp);
    const idp = col.internalDesignPressureMawp ?? (!isNaN(wpNum) ? (wpNum + 2).toFixed(3) : null);
    const idpNum = parseFloat(idp || '');
    const isApi = (disciplineCode || '').toLowerCase().includes('api 650');
    const hydro = col.hydroTestPressure ?? (
      !isNaN(idpNum) ? (isApi ? 'N.A.' : calcHydroTestPressure(idpNum, disciplineCode)) : null
    );
    return {
      ...col,
      mdmt: projMdmt,
      workingPressure: wp,
      internalDesignPressureMawp: idp,
      externalDesignPressureMawp: col.externalDesignPressureMawp ?? '1.034',
      hydroTestPressure: hydro,
      hydroTestTempMinMax: col.hydroTestTempMinMax ?? '17 / 48',
      physicalState: col.physicalState ?? 'Fluid',
      serviceFluid: col.serviceFluid ?? 'Hydrocarbon',
      internalCorrosionAllowanceMm: col.internalCorrosionAllowanceMm ?? '1.5',
      externalCorrosionAllowanceMm: col.externalCorrosionAllowanceMm ?? '1.5',
      radiography: col.radiography ?? 'FULL RADIOGRAPHY (100% RT)',
    };
  }

  function loadColumnHazardFromSheet(raw: ColumnHazardData | null): ColumnHazardData {
    if (!raw) return emptyColumnHazardData();
    // New format: has 'shell' key with HazardData structure
    if (raw.shell && typeof raw.shell === 'object' && 'appliedCode' in raw.shell) {
      return {
        shell: deriveHazardFields({ ...emptyHazardData(), ...raw.shell }),
        tube:   raw.tube   ? deriveHazardFields({ ...emptyHazardData(), ...raw.tube })   : null,
        jacket: raw.jacket ? deriveHazardFields({ ...emptyHazardData(), ...raw.jacket }) : null,
      };
    }
    // Old format: raw itself is a HazardData (appliedCode at top level)
    if ('appliedCode' in raw) {
      const hd = deriveHazardFields({ ...emptyHazardData(), ...(raw as unknown as HazardData) });
      return { shell: hd, tube: null, jacket: null };
    }
    return emptyColumnHazardData();
  }

  function loadSheetIntoForm(s: DesignDataSheet) {
    setDesignCode(s.design_code);
    setEquipmentConfig(s.equipment_config);
    setInspectionBy(s.inspection_by);
    setMechShell(seedColumn(s.mechanical_data.shell || emptyMechanicalColumn()));
    setMechTube(seedColumn(s.mechanical_data.tube || emptyMechanicalColumn()));
    setMechJacket(seedColumn(s.mechanical_data.jacket || emptyMechanicalColumn()));
    setGeneralData(s.general_data || emptyGeneralData());
    setColHazard(loadColumnHazardFromSheet(s.hazard_data));
  }

  function handleStartEdit() {
    if (sheet) {
      loadSheetIntoForm(sheet);
    } else {
      const autoCode = (disciplineCode && DISCIPLINE_TO_DESIGN_CODE[disciplineCode]) || '';
      setDesignCode(autoCode);
      setEquipmentConfig(autoFields.productEquipmentConfiguration || 'Vessel');
      setInspectionBy('');
      setMechShell(seedColumn(emptyMechanicalColumn()));
      setMechTube(seedColumn(emptyMechanicalColumn()));
      setMechJacket(seedColumn(emptyMechanicalColumn()));
      setGeneralData(emptyGeneralData());
      setColHazard(emptyColumnHazardData());
    }
    setDialogOpen(true);
  }

  // ── Mutation ──────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const cols = getColumns(equipmentConfig);
      const mechanicalData: MechanicalData = {
        shell: mechShell,
        tube: cols.tube ? mechTube : null,
        jacket: cols.jacket ? mechJacket : null,
      };
      const method = sheet ? 'PUT' : 'POST';
      return apiRequest(method, `/api/drawing-design-data/${drawingControlId}`, {
        designCode, equipmentConfig, inspectionBy, mechanicalData, generalData,
        columnHazardData: (() => {
          const sharedCode = colHazard.shell.appliedCode;
          const sync = (h: HazardData | null) => h && sharedCode ? { ...h, appliedCode: sharedCode } : h;
          return {
            shell:  sharedCode ? colHazard.shell : null,
            tube:   cols.tube   ? (sharedCode ? sync(colHazard.tube ?? emptyHazardData()) : null) : null,
            jacket: cols.jacket ? (sharedCode ? sync(colHazard.jacket ?? emptyHazardData()) : null) : null,
          };
        })(),
      });
    },
    onSuccess: (json: any) => {
      if (json?.warnings?.tagNo) toast({ title: 'Warning', description: json.warnings.tagNo, variant: 'destructive' });
      if (json?.warnings?.manufactureSerialNo) toast({ title: 'Warning', description: json.warnings.manufactureSerialNo, variant: 'destructive' });
      toast({ title: 'Saved', description: 'Design data sheet saved.' });
      qc.invalidateQueries({ queryKey: ['/api/drawing-design-data', drawingControlId] });
      setDialogOpen(false);
    },
    onError: async (err: any) => {
      const msg = err?.message || 'Save failed';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const cols = getColumns(equipmentConfig);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Card (view only) ─────────────────────────────────────────────── */}
      <Card className="w-full">
        <CardHeader className="py-2 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
              Design Data Sheet
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {sheet && (
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1.5 py-0 ${sheet.status === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}
                >
                  {sheet.status}
                </Badge>
              )}
              {canEdit && (
                <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" onClick={handleStartEdit}>
                  <Edit3 className="h-3 w-3 mr-1" />
                  {sheet ? 'Edit' : 'Create'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-3 pb-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-4 justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : sheet ? (
            <div className="space-y-2">
              {(warnings.tagNo || warnings.manufactureSerialNo) && (
                <div className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <div>
                    {warnings.tagNo && <div>{warnings.tagNo}</div>}
                    {warnings.manufactureSerialNo && <div>{warnings.manufactureSerialNo}</div>}
                  </div>
                </div>
              )}
              <DesignDataRenderer sheet={sheet} />
            </div>
          ) : (
            <div className="text-center py-6 text-[11px] text-muted-foreground">
              <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No design data sheet yet.
              {canEdit && (
                <div className="mt-2">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={handleStartEdit}>
                    + Create Design Data Sheet
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog (form) ────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="max-w-[96vw] xl:max-w-[1400px] w-full p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-0 border-b">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold pb-3">
              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
              Design Data Sheet
            </DialogTitle>

            {/* ── Drawing Identification Block ──────────────────────────── */}
            <div className="grid grid-cols-3 gap-3 pb-3 pt-0.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Drawing No</span>
                <span className="text-[11px] font-mono font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 leading-tight truncate">
                  {autoFields.drawingNumber || <span className="text-slate-400 italic font-sans font-normal">—</span>}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Item Code</span>
                <span className="text-[11px] font-mono font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 leading-tight truncate">
                  {autoFields.itemCode || <span className="text-slate-400 italic font-sans font-normal">—</span>}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Item Description</span>
                <span className="text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 leading-tight truncate" title={autoFields.itemDescription || ''}>
                  {autoFields.itemDescription || <span className="text-slate-400 italic font-normal">—</span>}
                </span>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[75vh]">
            <div className="px-6 py-4 space-y-5">
              {/* Header fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    Design Code <span className="text-red-500">*</span>
                    {disciplineCode && DISCIPLINE_TO_DESIGN_CODE[disciplineCode] && (
                      <span className="text-[10px] text-blue-600 font-normal bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                        Auto from: {disciplineCode}
                      </span>
                    )}
                  </Label>
                  <Select value={designCode} onValueChange={setDesignCode}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select design code…" />
                    </SelectTrigger>
                    <SelectContent>
                      {DESIGN_CODES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Material Code <span className="text-muted-foreground text-[10px]">(auto)</span></Label>
                  <Input
                    className="h-8 text-xs bg-slate-50"
                    value={designCode ? (
                      {
                        'EN 13445-3:2021 + TEMA EDITION-10': 'ASME SEC II PART D 2023',
                        'EN 13445-3:2021': 'ASME SEC II PART D 2023',
                        'ASME SEC VIII DIV-1': 'ASME SEC II PART D 2023',
                        'ASME SEC VIII DIV-2': 'ASME SEC II PART D 2023',
                        'ASME B31.3': 'ASME SEC II PART D 2023',
                        'PED 2014/68/EU': 'EN 10028 / EN 10216',
                        'API 650': 'ASME SEC II PART D 2023',
                        'IS 2825': 'IS 2002 / IS 1570',
                        'AS 1210': 'AS 1548',
                      }[designCode] || '—'
                    ) : '—'}
                    readOnly disabled
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    Equipment Configuration <span className="text-red-500">*</span>
                    {!sheet && autoFields.productEquipmentConfiguration && (
                      <span className="text-[10px] text-emerald-700 font-normal bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                        Auto from product
                      </span>
                    )}
                  </Label>
                  <Select value={equipmentConfig} onValueChange={setEquipmentConfig}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select configuration…" />
                    </SelectTrigger>
                    <SelectContent>
                      {EQUIPMENT_CONFIGS.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Inspection By <span className="text-red-500">*</span></Label>
                  <Select value={inspectionBy} onValueChange={setInspectionBy}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select inspector…" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSPECTION_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Equipment Description — auto from project item */}
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    Equipment Description
                    <span className="text-[10px] text-emerald-700 font-normal bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">Auto</span>
                  </Label>
                  <Input
                    className="h-8 text-xs bg-slate-50 text-slate-600"
                    value={autoFields.equipmentDescription || '—'}
                    readOnly disabled
                  />
                </div>

                {/* Tag No — auto from product + project code */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    Tag No
                    <span className="text-[10px] text-emerald-700 font-normal bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">Auto</span>
                  </Label>
                  <Input
                    className={`h-8 text-xs ${autoFields.tagNo ? 'bg-slate-50 text-slate-600' : 'bg-amber-50 text-amber-700 border-amber-300'}`}
                    value={autoFields.tagNo || 'Pending — see note below'}
                    readOnly disabled
                  />
                </div>

                {/* Manufacture Serial No — auto from item_code + tag_no */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    Manufacture Serial No
                    <span className="text-[10px] text-emerald-700 font-normal bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">Auto</span>
                  </Label>
                  <Input
                    className={`h-8 text-xs ${autoFields.manufactureSerialNo ? 'bg-slate-50 text-slate-600' : 'bg-amber-50 text-amber-700 border-amber-300'}`}
                    value={autoFields.manufactureSerialNo || 'Pending — requires Tag No'}
                    readOnly disabled
                  />
                </div>

                {/* Tag No warning note */}
                {autoFields.tagNoWarning && (
                  <div className="col-span-2 text-[10px] text-amber-700 bg-amber-50 rounded px-3 py-1.5 border border-amber-200 flex items-start gap-1.5">
                    <span className="mt-0.5">⚠</span>
                    <span>{autoFields.tagNoWarning}</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Hazard Classification — per column, aligned with mechanical columns */}
              {equipmentConfig && (
                <div>
                  <div className="text-xs font-semibold mb-3 uppercase tracking-wide text-slate-600 flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-slate-400" />
                    Hazard Classification
                  </div>
                  {/* Applied Code is shared: changing Shell's code clears + re-derives all columns */}
                  {(() => {
                    const SG_BY_FLUID: Record<string, string> = {
                      'Fluid': '0.85',
                      'Vapor': '0.8',
                      'Mixture of Fluid and Vapor': '0.85',
                    };

                    function handleSharedCodeChange(newCode: string | null) {
                      setColHazard(prev => ({
                        shell:  deriveHazardFields({ ...clearCodeSpecificFields(prev.shell),  appliedCode: newCode }),
                        tube:   prev.tube   ? deriveHazardFields({ ...clearCodeSpecificFields(prev.tube),   appliedCode: newCode }) : null,
                        jacket: prev.jacket ? deriveHazardFields({ ...clearCodeSpecificFields(prev.jacket), appliedCode: newCode }) : null,
                      }));
                    }

                    function makeOnChange(
                      colKey: 'shell' | 'tube' | 'jacket',
                      prevData: HazardData,
                      setMech: (fn: (prev: MechanicalColumn) => MechanicalColumn) => void,
                    ) {
                      return (d: HazardData) => {
                        if (d.fluidState && d.fluidState !== prevData.fluidState) {
                          const sg = SG_BY_FLUID[d.fluidState];
                          if (sg) setMech(prev => ({ ...prev, specificGravity: sg }));
                        }
                        setColHazard(prev => ({ ...prev, [colKey]: d }));
                      };
                    }

                    return (
                      <div className={`grid gap-5 items-start ${cols.tube && cols.jacket ? 'grid-cols-3' : cols.tube || cols.jacket ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <HazardClassificationPanel
                          label="Shell"
                          data={colHazard.shell}
                          onChange={makeOnChange('shell', colHazard.shell, setMechShell)}
                          mechColumn={mechShell}
                          isFirstColumn={true}
                          onAppliedCodeChange={handleSharedCodeChange}
                        />
                        {cols.tube && (
                          <HazardClassificationPanel
                            label="Tube"
                            data={{ ...colHazard.tube || emptyHazardData(), appliedCode: colHazard.shell.appliedCode }}
                            onChange={makeOnChange('tube', colHazard.tube || emptyHazardData(), setMechTube)}
                            mechColumn={mechTube}
                            isFirstColumn={false}
                            onAppliedCodeChange={handleSharedCodeChange}
                          />
                        )}
                        {cols.jacket && (
                          <HazardClassificationPanel
                            label="Jacket 1&2"
                            data={{ ...colHazard.jacket || emptyHazardData(), appliedCode: colHazard.shell.appliedCode }}
                            onChange={makeOnChange('jacket', colHazard.jacket || emptyHazardData(), setMechJacket)}
                            mechColumn={mechJacket}
                            isFirstColumn={false}
                            onAppliedCodeChange={handleSharedCodeChange}
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <Separator />

              {/* Mechanical columns */}
              {equipmentConfig && (() => {
                // Compute per-column derived hazard level to display in mechanical form
                function colLevel(hazard: HazardData | null, mechCol: MechanicalColumn): string | null {
                  if (!hazard?.appliedCode) return null;
                  if (hazard.appliedCode === 'AS 4343:2014') {
                    return deriveColumnAS4343(mechCol, hazard).level;
                  }
                  return hazard.internalHazardLevel;
                }
                const shellLevel = colLevel(colHazard.shell, mechShell);
                const tubeLevel  = colLevel(colHazard.tube  || null, mechTube);
                const jacketLevel = colLevel(colHazard.jacket || null, mechJacket);
                return (
                  <div>
                    <div className="text-xs font-semibold mb-3 uppercase tracking-wide text-slate-600">Mechanical Design Data</div>
                    <div className={`grid gap-5 ${cols.tube && cols.jacket ? 'grid-cols-3' : cols.tube || cols.jacket ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      <SmartMechanicalColumnForm label="Shell" data={mechShell} onChange={setMechShell} projectMdmt={projMdmt} disciplineCode={disciplineCode} derivedHazardLevel={shellLevel} />
                      {cols.tube && <SmartMechanicalColumnForm label="Tube" data={mechTube} onChange={setMechTube} projectMdmt={projMdmt} disciplineCode={disciplineCode} derivedHazardLevel={tubeLevel} />}
                      {cols.jacket && <SmartMechanicalColumnForm label="Jacket 1&2" data={mechJacket} onChange={setMechJacket} projectMdmt={projMdmt} disciplineCode={disciplineCode} derivedHazardLevel={jacketLevel} />}
                    </div>
                  </div>
                );
              })()}

              <Separator />

              {/* General data */}
              <div>
                <div className="text-xs font-semibold mb-3 uppercase tracking-wide text-slate-600">General Data</div>
                <GeneralDataForm data={generalData} onChange={setGeneralData} />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="px-6 py-3 border-t bg-slate-50">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!designCode || !equipmentConfig || !inspectionBy || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Save Design Data Sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
