import express, { Request, Response } from 'express';
import { db } from './db';
import { sql, eq } from 'drizzle-orm';
import { z } from 'zod';
import { designDataSheets, epcDrawingControls, projects, projectItems } from '@shared/schema';
import { checkProjectMembership } from './utils/permission-utils';
import type { MechanicalColumn, MechanicalData, GeneralData, HazardData, ColumnHazardData } from '@shared/schema';
import { generateAndUploadDdsPdf, getDdsPdfSignedUrl } from './dds-pdf-service';
import { generateDdsExcel } from './dds-excel-service';

const router = express.Router();

function ensureAuthenticated(req: Request, res: Response, next: express.NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

const DESIGN_CODE_TO_MATERIAL_CODE: Record<string, string> = {
  'EN 13445-3:2021 + TEMA EDITION-10': 'ASME SEC II PART D 2023',
  'EN 13445-3:2021': 'ASME SEC II PART D 2023',
  'ASME SEC VIII DIV-1': 'ASME SEC II PART D 2023',
  'ASME SEC VIII DIV-2': 'ASME SEC II PART D 2023',
  'ASME B31.3': 'ASME SEC II PART D 2023',
  'PED 2014/68/EU': 'EN 10028 / EN 10216',
  'API 650': 'ASME SEC II PART D 2023',
  'IS 2825': 'IS 2002 / IS 1570',
  'AS 1210': 'AS 1548',
};

const EQUIPMENT_CONFIG_TO_TYPE: Record<string, string> = {
  'Vessel': 'PRESSURE VESSEL',
  'Jacketed Vessel': 'JACKETED PRESSURE VESSEL',
  'Heat Exchanger': 'SHELL & TUBE HEAT EXCHANGER',
  'Jacketed Vessel and Heat Exchanger': 'JACKETED SHELL & TUBE HEAT EXCHANGER',
};

function emptyMechanicalColumn(): MechanicalColumn {
  return {
    internalDesignPressureMawp: null,
    externalDesignPressureMawp: null,
    workingPressure: null,
    hydroTestPressure: null,
    mdmt: null,
    hydroTestTempMinMax: null,
    operatingTempMinMax: null,
    designTempMinMax: null,
    physicalState: null,
    grossVolumeLiters: null,
    serviceFluid: null,
    hazardLevel: null,
    specificGravity: null,
    internalCorrosionAllowanceMm: null,
    externalCorrosionAllowanceMm: null,
    radiography: null,
    jointEfficiency: null,
    testingGroup: null,
    fabricationToleranceClass: null,
    postWeldHeatTreatment: null,
    typeOfHeads: null,
    insulation: null,
    insulationTypeThkDensity: null,
  };
}

function emptyGeneralData(): GeneralData {
  return {
    hydroTestPosition: null,
    vesselOrientation: null,
    designServiceLife: null,
    windData: null,
    windDesignVelocity: null,
    seismicDesignCode: null,
    hazardFactorZ: null,
    seismicCoefficientHorizontal: null,
    seismicCoefficientVertical: null,
    weightEmptyOperatingHydro: null,
    location: null,
    qty: null,
  };
}

function normalizeMechanicalData(config: string, incoming: Partial<MechanicalData>): MechanicalData {
  const hasShell = true;
  const hasTube = config === 'Heat Exchanger' || config === 'Jacketed Vessel and Heat Exchanger';
  const hasJacket = config === 'Jacketed Vessel' || config === 'Jacketed Vessel and Heat Exchanger';

  return {
    shell: { ...emptyMechanicalColumn(), ...(incoming.shell || {}) },
    tube: hasTube ? { ...emptyMechanicalColumn(), ...(incoming.tube || {}) } : null,
    jacket: hasJacket ? { ...emptyMechanicalColumn(), ...(incoming.jacket || {}) } : null,
  };
}

function normalizeGeneralData(incoming: Partial<GeneralData>): GeneralData {
  return { ...emptyGeneralData(), ...incoming };
}

/**
 * AS 4343:2014 table lookup — mirrors frontend as4343Derive()
 * Vessels:  energyProduct = P(MPa) × V(litres)       → thresholds MPa·L
 * Piping:   energyProduct = P(MPa) × 1000 × DN(mm)   → thresholds kPa·mm
 * Two-phase: use Gas/Vapour table (conservative)
 */
function as4343TableLookup(
  equipType: 'Vessel' | 'Piping',
  fg: 'A' | 'B' | 'C',
  state: 'Gas/Vapour' | 'Liquid' | 'Gas/Vapour and Liquid',
  energy: number,
): string {
  const isGas = state === 'Gas/Vapour' || state === 'Gas/Vapour and Liquid';
  if (equipType === 'Vessel') {
    if (isGas) {
      if (energy > 10000) return fg === 'C' ? 'B' : 'A';
      if (energy > 1000)  return fg === 'A' ? 'A' : fg === 'B' ? 'B' : 'B';
      if (energy > 100)   return fg === 'A' ? 'A' : fg === 'B' ? 'B' : 'C';
      if (energy > 10)    return fg === 'A' ? 'B' : fg === 'B' ? 'C' : 'D';
      if (energy > 1)     return fg === 'A' ? 'C' : fg === 'B' ? 'D' : 'D';
      return fg === 'A' ? 'D' : 'E';
    } else {
      if (energy > 10000) return fg === 'C' ? 'C' : 'B';
      if (energy > 1000)  return fg === 'A' ? 'B' : fg === 'B' ? 'C' : 'C';
      if (energy > 100)   return fg === 'A' ? 'C' : fg === 'B' ? 'C' : 'D';
      if (energy > 10)    return fg === 'A' ? 'C' : fg === 'B' ? 'D' : 'E';
      if (energy > 1)     return fg === 'A' ? 'D' : 'E';
      return 'E';
    }
  } else {
    if (isGas) {
      if (energy > 350000) return fg === 'C' ? 'B' : 'A';
      if (energy > 100000) return fg === 'A' ? 'A' : fg === 'B' ? 'B' : 'B';
      if (energy > 35000)  return fg === 'A' ? 'A' : fg === 'B' ? 'B' : 'C';
      if (energy > 10000)  return fg === 'A' ? 'B' : fg === 'B' ? 'C' : 'D';
      if (energy > 3500)   return fg === 'A' ? 'C' : fg === 'B' ? 'D' : 'D';
      return fg === 'A' ? 'D' : 'E';
    } else {
      if (energy > 350000) return fg === 'C' ? 'C' : 'B';
      if (energy > 100000) return fg === 'A' ? 'B' : fg === 'B' ? 'C' : 'C';
      if (energy > 35000)  return fg === 'A' ? 'C' : fg === 'B' ? 'C' : 'D';
      if (energy > 10000)  return fg === 'A' ? 'C' : fg === 'B' ? 'D' : 'E';
      if (energy > 3500)   return fg === 'A' ? 'D' : 'E';
      return 'E';
    }
  }
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
    note = lethal
      ? 'Derived as Highly Hazardous because Lethal Service = Yes.'
      : 'Derived as Normal because Normal Service.';
  } else if (code === 'ASME B31.3') {
    const cat = data.fluidServiceCategory;
    classification = cat || null;
    if (cat === 'Category M') {
      level = 'Highly Hazardous';
      note = 'Derived as Highly Hazardous because Fluid Service Category = Category M.';
    } else if (cat === 'High Pressure Fluid Service') {
      level = 'Hazardous';
      note = 'Derived as Hazardous because High Pressure Fluid Service.';
    } else if (cat === 'Category D' || cat === 'Normal Fluid Service') {
      level = 'Normal';
      note = `Derived as Normal because ${cat} with no hazard flags.`;
    }
  } else if (code === 'EN 13445') {
    const grp = data.fluidGroup;
    classification = grp || null;
    if (grp === 'Group 1' && data.toxicInhalationRisk) {
      level = 'Highly Hazardous';
      note = 'Derived as Highly Hazardous because Group 1 with Toxic Inhalation Risk.';
    } else if (grp === 'Group 1') {
      level = 'Hazardous';
      note = 'Derived as Hazardous because Fluid Group = Group 1.';
    } else if (grp === 'Group 2') {
      level = 'Normal';
      note = 'Derived as Normal because Group 2 fluid.';
    }
  } else if (code === 'PED 2014/68/EU') {
    const grp = data.fluidGroup;
    classification = grp ? (grp === 'Group 1' ? 'Fluid Group 1' : 'Fluid Group 2') : null;
    if (grp === 'Group 1' && data.toxicInhalationRisk) {
      level = 'Highly Hazardous';
      note = 'Derived as Highly Hazardous because Fluid Group 1 with Toxic Inhalation Risk.';
    } else if (grp === 'Group 1') {
      level = 'Hazardous';
      note = 'Derived as Hazardous because Fluid Group 1.';
    } else if (grp === 'Group 2') {
      level = 'Normal';
      note = 'Derived as Normal because Fluid Group 2.';
    }
  } else if (code === 'API 650') {
    classification = 'Stored Product Review';
    if (data.toxicInhalationRisk) {
      level = 'Highly Hazardous';
      note = 'Derived as Highly Hazardous because Toxic Inhalation Risk is flagged.';
    } else if (data.isFlammable || data.isCorrosive || data.isEnvironmentallyHazardous) {
      level = 'Hazardous';
      const flags = [
        data.isFlammable && 'flammable',
        data.isCorrosive && 'corrosive',
        data.isEnvironmentallyHazardous && 'environmentally hazardous',
      ].filter(Boolean).join(', ');
      note = `Derived as Hazardous because stored product is flagged ${flags}.`;
    } else {
      level = 'Normal';
      note = 'Derived as Normal because no hazard flags on stored product.';
    }
  } else if (code === 'AS 4343:2014') {
    classification = 'AS 4343';
    level = null;
    note  = 'AS 4343:2014 — Hazard Level derived per column (Shell/Tube/Jacket) from each column\'s own design pressure, volume, physical state, and fluid group.';
  }

  console.log(`[HazardDerive] code=${code} level=${level} classification=${classification} note=${note}`);
  return { ...data, codeNativeClassification: classification, internalHazardLevel: level, hazardBasisNote: note };
}

// ── Per-code Zod schemas (strip disallowed fields, enforce enums) ─────────────

const FLUID_STATE_ENUM = z.enum(['Fluid', 'Vapor', 'Mixture of Fluid and Vapor']).default('Fluid');
const LETHAL_ENUM      = z.enum(['Yes', 'No']).nullable().default(null);
const BOOL_FLAG        = z.boolean().default(false);

const FLUID_SERVICE_CATEGORY_ENUM = z.enum([
  'Category D', 'Category M', 'Normal Fluid Service', 'High Pressure Fluid Service',
]).nullable().default(null);

const FLUID_GROUP_ENUM  = z.enum(['Group 1', 'Group 2']).nullable().default(null);
const PED_CATEGORY_ENUM = z.enum(['SEP', 'Category I', 'Category II', 'Category III', 'Category IV']).nullable().default(null);

const EMPTY_CODE_FIELDS = {
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
};

const HAZARD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'ASME SEC VIII Div-1': z.object({
    fluidState: FLUID_STATE_ENUM,
    isLethalService: LETHAL_ENUM,
  }).strip(),

  'ASME B31.3': z.object({
    fluidState: FLUID_STATE_ENUM,
    fluidServiceCategory: FLUID_SERVICE_CATEGORY_ENUM,
  }).strip(),

  'EN 13445': z.object({
    fluidState: FLUID_STATE_ENUM,
    fluidGroup: FLUID_GROUP_ENUM,
    toxicInhalationRisk: BOOL_FLAG,
  }).strip(),

  'PED 2014/68/EU': z.object({
    fluidState: FLUID_STATE_ENUM,
    fluidGroup: FLUID_GROUP_ENUM,
    pedCategory: PED_CATEGORY_ENUM,
    toxicInhalationRisk: BOOL_FLAG,
  }).strip(),

  'API 650': z.object({
    fluidState: FLUID_STATE_ENUM,
    toxicInhalationRisk: BOOL_FLAG,
    isFlammable: BOOL_FLAG,
    isCorrosive: BOOL_FLAG,
    isEnvironmentallyHazardous: BOOL_FLAG,
  }).strip(),

  'AS 4343:2014': z.object({
    as4343EquipmentType: z.enum(['Vessel', 'Piping']).nullable().default(null),
    as4343NominalBoreDN: z.number().positive().nullable().default(null),
    as4343FluidGroup: z.enum(['A', 'B', 'C']).nullable().default(null),
  }).strip(),
};

/**
 * Process a single HazardData input (one column) through Zod validation and server-side derivation.
 * Returns the derived HazardData or null if code/raw missing.
 */
function processSingleHazard(raw: any, code: string | null): HazardData | null {
  if (!code || !raw) return null;

  const schema = HAZARD_SCHEMAS[code];
  if (!schema) {
    console.warn(`[HazardProcess] Unknown applied_code="${code}" — skipping.`);
    return null;
  }

  const parseResult = schema.safeParse(raw);
  if (!parseResult.success) {
    console.warn(`[HazardProcess] Zod validation failed for code="${code}":`, parseResult.error.flatten());
  }
  const parsed = parseResult.success ? parseResult.data : {};

  const full: HazardData = {
    appliedCode: code,
    ...EMPTY_CODE_FIELDS,
    fluidState: raw.fluidState ?? 'Fluid',
    ...parsed,
    codeNativeClassification: null,
    internalHazardLevel: null,
    hazardBasisNote: null,
  };

  return deriveHazardFields(full);
}

/**
 * Process columnHazardData (shell/tube/jacket) and propagate derived hazardLevel
 * into the matching mechanical columns.
 */
function processColumnHazardData(
  rawColHazard: any,
  dwgStatus: string,
  mechanical: MechanicalData,
): { columnHazardData: ColumnHazardData; mechanical: MechanicalData } {
  const rShell  = rawColHazard?.shell;
  const rTube   = rawColHazard?.tube;
  const rJacket = rawColHazard?.jacket;

  const shellH  = processSingleHazard(rShell,  rShell?.appliedCode  || null);
  const tubeH   = rTube   ? processSingleHazard(rTube,   rTube.appliedCode   || null) : null;
  const jacketH = rJacket ? processSingleHazard(rJacket, rJacket.appliedCode || null) : null;

  const colHazard: ColumnHazardData = { shell: shellH ?? {} as HazardData, tube: tubeH, jacket: jacketH };

  let updatedMech = mechanical;
  if (dwgStatus === 'draft') {
    function hazardLevelFor(hazard: HazardData | null, col: MechanicalColumn): MechanicalColumn {
      if (!hazard?.appliedCode) return col;
      if (hazard.appliedCode === 'AS 4343:2014') {
        return deriveColumnAS4343ForMech(col, hazard);
      }
      return hazard.internalHazardLevel ? { ...col, hazardLevel: hazard.internalHazardLevel } : col;
    }
    updatedMech = {
      shell:  hazardLevelFor(shellH, mechanical.shell),
      tube:   mechanical.tube   ? hazardLevelFor(tubeH, mechanical.tube)     : null,
      jacket: mechanical.jacket ? hazardLevelFor(jacketH, mechanical.jacket) : null,
    };
  }

  return { columnHazardData: colHazard, mechanical: updatedMech };
}

/**
 * Derive AS 4343 hazard level for one column using that column's own data +
 * hazard-level inputs stored in HazardData.
 * Physical state mapping:  Fluid → Liquid | Vapor → Gas/Vapour | Mixture → Gas/Vapour and Liquid
 * Pressure: internalDesignPressureMawp in Barg → × 0.1 → MPa
 */
function deriveColumnAS4343ForMech(
  col: MechanicalColumn,
  hazard: HazardData,
): MechanicalColumn {
  const eqType = hazard.as4343EquipmentType as 'Vessel' | 'Piping' | null;
  const dn     = hazard.as4343NominalBoreDN as number | null;
  const fg     = hazard.as4343FluidGroup   as 'A' | 'B' | 'C' | null;
  const rawState = col.physicalState;
  const stateMap: Record<string, 'Gas/Vapour' | 'Liquid' | 'Gas/Vapour and Liquid'> = {
    'Fluid': 'Liquid',
    'Vapor': 'Gas/Vapour',
    'Mixture of Fluid and Vapor': 'Gas/Vapour and Liquid',
  };
  const ps = rawState ? (stateMap[rawState] ?? null) : null;
  const pMPa = col.internalDesignPressureMawp ? parseFloat(col.internalDesignPressureMawp) * 0.1 : null;
  const vol  = col.grossVolumeLiters ? parseFloat(col.grossVolumeLiters) : null;

  if (!eqType || !fg || !ps) {
    console.log(`[HazardProcess/AS4343] Column missing eqType/fg/ps — hazardLevel=null`);
    return { ...col, hazardLevel: null };
  }

  let level: string | null = null;
  if (eqType === 'Vessel') {
    if (pMPa && pMPa > 0 && vol && vol > 0) {
      level = as4343TableLookup(eqType, fg, ps, pMPa * vol);
    }
  } else {
    if (pMPa && pMPa > 0 && dn && dn > 0) {
      level = as4343TableLookup(eqType, fg, ps, pMPa * 1000 * dn);
    }
  }

  console.log(`[HazardProcess/AS4343] Column fg=${fg} ps=${ps} pMPa=${pMPa} vol=${vol} dn=${dn} → hazardLevel=${level}`);
  return { ...col, hazardLevel: level };
}

async function resolveAutoFields(dwgControl: any): Promise<{
  equipmentDescription: string | null;
  tagNo: string | null;
  tagNoWarning: string | null;
  manufactureSerialNo: string | null;
  msnWarning: string | null;
  countryCode: string | null;
  locationAuto: string | null;
  qtyAuto: string | null;
}> {
  const equipmentDescription = dwgControl.item_description || null;

  // Resolve tag_no: {product_tag_no}_{project_code}
  // e.g. RF/FE/E1_2627-013
  let tagNo: string | null = null;
  let tagNoWarning: string | null = null;

  const projectResult = await db.execute(sql`
    SELECT p.code, p.mdmt, p.country_code,
           c.sap_mail_city, c.sap_mail_country, c.country_name
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.id = ${dwgControl.project_id}
    LIMIT 1
  `);
  const proj = projectResult.rows[0] as any;

  // Resolve product tag_no using a 3-tier lookup:
  // 1. Exact match via project_item.product_code
  // 2. Fuzzy match: product_code appears in project_item.item_code
  // 3. Fuzzy match: product_code appears in drawing control's item_code
  let productTagNo: string | null = null;
  let productCodeUsed: string | null = null;

  let productEquipmentConfiguration: string | null = null;

  if (dwgControl.project_item_id) {
    // Tier 1 & 2: try exact match first, then item_code fuzzy match via project_item
    const projectItemResult = await db.execute(sql`
      SELECT pr.tag_no as product_tag_no, pr.product_code as matched_code,
             pr.equipment_configuration as product_equipment_configuration
      FROM project_items pi
      JOIN products pr ON (
        (pi.product_code IS NOT NULL AND pi.product_code != '' AND pr.product_code = pi.product_code)
        OR
        (pi.item_code IS NOT NULL AND pr.tag_no IS NOT NULL AND pr.tag_no != '' AND pi.item_code LIKE '%' || pr.product_code || '%')
      )
      WHERE pi.id = ${dwgControl.project_item_id}
        AND pr.tag_no IS NOT NULL AND pr.tag_no != ''
      ORDER BY CASE WHEN pi.product_code = pr.product_code THEN 0 ELSE 1 END, length(pr.product_code) DESC
      LIMIT 1
    `);
    const pi = projectItemResult.rows[0] as any;
    if (pi?.product_tag_no) {
      productTagNo = pi.product_tag_no;
      productCodeUsed = pi.matched_code;
    }
    if (pi?.product_equipment_configuration) {
      productEquipmentConfiguration = pi.product_equipment_configuration;
    }
  }

  // Tier 3: fallback via drawing control's own item_code
  if (!productTagNo && dwgControl.item_code) {
    const fallbackResult = await db.execute(sql`
      SELECT product_code, tag_no, equipment_configuration
      FROM products
      WHERE tag_no IS NOT NULL AND tag_no != ''
        AND ${dwgControl.item_code} LIKE '%' || product_code || '%'
      ORDER BY length(product_code) DESC
      LIMIT 1
    `);
    const fallback = fallbackResult.rows[0] as any;
    if (fallback?.tag_no) {
      productTagNo = fallback.tag_no;
      productCodeUsed = fallback.product_code;
    }
    if (fallback?.equipment_configuration && !productEquipmentConfiguration) {
      productEquipmentConfiguration = fallback.equipment_configuration;
    }
  }

  const projectCode = proj?.code || null;

  if (!productTagNo && !projectCode) {
    tagNoWarning = `Tag No cannot be generated: no product with a Tag No could be found for this drawing. Please link a product with a Tag No in the Products catalog.`;
  } else if (!productTagNo) {
    tagNoWarning = `Tag No cannot be generated: no product with a Tag No could be matched. Please set a Tag No for the product in the Products catalog.`;
  } else if (!projectCode) {
    tagNoWarning = `Tag No cannot be generated: the project has no project code assigned.`;
  } else {
    tagNo = `${productTagNo}-${projectCode}`;
  }

  // Resolve manufacture_serial_no: item_code + tag_no
  let manufactureSerialNo: string | null = null;
  let msnWarning: string | null = null;

  const itemCode = dwgControl.item_code || null;
  if (itemCode && tagNo) {
    manufactureSerialNo = `${itemCode} / ${tagNo}`;
  } else {
    const msnMissing: string[] = [];
    if (!itemCode) msnMissing.push('item_code');
    if (!tagNo) msnMissing.push('tag_no');
    msnWarning = `manufacture_serial_no cannot be generated: missing ${msnMissing.join(', ')}`;
  }

  const projectMdmt = proj?.mdmt || null;
  const countryCode = proj?.country_code || null;

  // Resolve locationAuto: "City, Country" from customer SAP data or country name
  let locationAuto: string | null = null;
  const city = proj?.sap_mail_city || null;
  const country = proj?.sap_mail_country || proj?.country_name || null;
  if (city && country) locationAuto = `${city}, ${country}`;
  else if (country) locationAuto = country;

  // Resolve qtyAuto: from project_item linked to drawing
  let qtyAuto: string | null = null;
  if (dwgControl.project_item_id) {
    const qtyResult = await db.execute(sql`
      SELECT quantity FROM project_items WHERE id = ${dwgControl.project_item_id} LIMIT 1
    `);
    const qtyRow = qtyResult.rows[0] as any;
    if (qtyRow?.quantity != null) {
      const q = parseFloat(qtyRow.quantity);
      qtyAuto = !isNaN(q) ? (Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.00$/, '')) : String(qtyRow.quantity);
    }
  }

  return { equipmentDescription, tagNo, tagNoWarning, manufactureSerialNo, msnWarning, projectMdmt, productEquipmentConfiguration, countryCode, locationAuto, qtyAuto };
}

async function verifyProjectAccess(userId: number, userRole: string, projectId: number, res: Response): Promise<boolean> {
  const { isMember } = await checkProjectMembership(userId, userRole, projectId);
  if (!isMember) {
    res.status(403).json({ error: 'Project access denied', code: 'PROJECT_ACCESS_DENIED' });
    return false;
  }
  return true;
}

async function loadDrawingControl(dwgControlId: number) {
  const r = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${dwgControlId}`);
  return r.rows[0] as any || null;
}

// GET /api/drawing-design-data/:dwgControlId
router.get('/:dwgControlId', ensureAuthenticated, async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  const dwgControlId = parseInt(req.params.dwgControlId);
  if (isNaN(dwgControlId)) return res.status(400).json({ error: 'Invalid dwgControlId' });

  const user = req.user as any;
  const dwg = await loadDrawingControl(dwgControlId);
  if (!dwg) return res.status(404).json({ error: 'Drawing control not found' });

  if (!await verifyProjectAccess(user.id, user.role, dwg.project_id, res)) return;

  const auto = await resolveAutoFields(dwg);
  const autoFields = {
    equipmentDescription: auto.equipmentDescription,
    tagNo: auto.tagNo,
    manufactureSerialNo: auto.manufactureSerialNo,
    tagNoWarning: auto.tagNoWarning,
    msnWarning: auto.msnWarning,
    projectMdmt: auto.projectMdmt,
    productEquipmentConfiguration: auto.productEquipmentConfiguration,
    drawingNumber: dwg.drawing_number || null,
    itemCode: dwg.item_code || null,
    itemDescription: dwg.item_description || null,
    customerCountry: auto.countryCode || null,
    locationAuto: auto.locationAuto || null,
    qtyAuto: auto.qtyAuto || null,
  };

  const existing = await db.execute(sql`SELECT * FROM design_data_sheets WHERE dwg_control_id = ${dwgControlId}`);
  if (existing.rows.length === 0) return res.json({ sheet: null, autoFields, warnings: { tagNo: auto.tagNoWarning, manufactureSerialNo: auto.msnWarning } });

  const sheet = existing.rows[0] as any;

  return res.json({
    sheet: {
      ...sheet,
      equipmentDescription: auto.equipmentDescription,
      tagNo: auto.tagNo,
      manufactureSerialNo: auto.manufactureSerialNo,
    },
    autoFields,
    warnings: {
      tagNo: auto.tagNoWarning,
      manufactureSerialNo: auto.msnWarning,
    },
  });
});

// POST /api/drawing-design-data/:dwgControlId  (create)
router.post('/:dwgControlId', ensureAuthenticated, async (req: Request, res: Response) => {
  const dwgControlId = parseInt(req.params.dwgControlId);
  if (isNaN(dwgControlId)) return res.status(400).json({ error: 'Invalid dwgControlId' });

  const user = req.user as any;
  const dwg = await loadDrawingControl(dwgControlId);
  if (!dwg) return res.status(404).json({ error: 'Drawing control not found' });

  if (!await verifyProjectAccess(user.id, user.role, dwg.project_id, res)) return;

  // Enforce: drawing must be in editable state
  const editableStatuses = ['draft', 'under_review'];
  if (!editableStatuses.includes(dwg.status)) {
    return res.status(409).json({ error: `Cannot edit design data for a drawing in '${dwg.status}' state` });
  }

  // Check uniqueness
  const existing = await db.execute(sql`SELECT id FROM design_data_sheets WHERE dwg_control_id = ${dwgControlId}`);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'A design data sheet already exists for this drawing. Use PUT to update.' });
  }

  const { designCode, equipmentConfig, inspectionBy, mechanicalData, generalData, columnHazardData: rawColHazard,
    // backward compat: old format
    appliedCode: legacyAppliedCode, hazardData: legacyRawHazardData } = req.body;

  if (!designCode || !equipmentConfig || !inspectionBy) {
    return res.status(400).json({ error: 'designCode, equipmentConfig and inspectionBy are required' });
  }

  const validConfigs = ['Vessel', 'Jacketed Vessel', 'Heat Exchanger', 'Jacketed Vessel and Heat Exchanger'];
  if (!validConfigs.includes(equipmentConfig)) {
    return res.status(400).json({ error: 'Invalid equipmentConfig' });
  }

  const validInspectors = ['SGS India', 'TUV India', 'Thermopac'];
  if (!validInspectors.includes(inspectionBy)) {
    return res.status(400).json({ error: 'Invalid inspectionBy' });
  }

  // Normalise: if old format supplied, convert to column format
  const effectiveColHazard = rawColHazard ?? (legacyAppliedCode ? {
    shell: { appliedCode: legacyAppliedCode, ...(legacyRawHazardData || {}) },
    tube: null, jacket: null,
  } : null);

  const materialCode = DESIGN_CODE_TO_MATERIAL_CODE[designCode] || null;
  const equipmentType = EQUIPMENT_CONFIG_TO_TYPE[equipmentConfig] || equipmentConfig.toUpperCase();
  const auto = await resolveAutoFields(dwg);

  let normalizedMechanical = normalizeMechanicalData(equipmentConfig, mechanicalData || {});
  const normalizedGeneral = normalizeGeneralData(generalData || {});
  const { columnHazardData: processedColHazard, mechanical: finalMechanical } =
    processColumnHazardData(effectiveColHazard, 'draft', normalizedMechanical);
  normalizedMechanical = finalMechanical;

  const inserted = await db.execute(sql`
    INSERT INTO design_data_sheets (
      dwg_control_id, project_id, design_code, material_code,
      equipment_description, tag_no, equipment_type, manufacture_serial_no,
      inspection_by, equipment_config, mechanical_data, general_data,
      hazard_data,
      status, created_by, updated_by
    ) VALUES (
      ${dwgControlId}, ${dwg.project_id}, ${designCode}, ${materialCode},
      ${auto.equipmentDescription}, ${auto.tagNo}, ${equipmentType}, ${auto.manufactureSerialNo},
      ${inspectionBy}, ${equipmentConfig},
      ${JSON.stringify(normalizedMechanical)}::jsonb,
      ${JSON.stringify(normalizedGeneral)}::jsonb,
      ${JSON.stringify(processedColHazard)}::jsonb,
      'draft', ${user.id}, ${user.id}
    )
    RETURNING *
  `);

  const insertedSheet = inserted.rows[0] as any;
  const newSheetId = insertedSheet.id;

  void (async () => {
    try {
      const pdfResult = await generateAndUploadDdsPdf(newSheetId, dwg);
      if ('error' in pdfResult) {
        await db.execute(sql`UPDATE design_data_sheets SET dds_pdf_status = 'error' WHERE id = ${newSheetId}`);
        console.error(`[DDS PDF] Failed for sheet ${newSheetId}:`, pdfResult.error);
      } else {
        await db.execute(sql`UPDATE design_data_sheets SET dds_gcs_path = ${pdfResult.gcsPath}, dds_pdf_status = 'ready' WHERE id = ${newSheetId}`);
      }
    } catch (err) {
      console.error(`[DDS PDF] Unhandled error for sheet ${newSheetId}:`, err);
    }
  })();

  return res.status(201).json({
    sheet: insertedSheet,
    warnings: {
      tagNo: auto.tagNoWarning,
      manufactureSerialNo: auto.msnWarning,
    },
  });
});

// PUT /api/drawing-design-data/:dwgControlId  (update)
router.put('/:dwgControlId', ensureAuthenticated, async (req: Request, res: Response) => {
  const dwgControlId = parseInt(req.params.dwgControlId);
  if (isNaN(dwgControlId)) return res.status(400).json({ error: 'Invalid dwgControlId' });

  const user = req.user as any;
  const dwg = await loadDrawingControl(dwgControlId);
  if (!dwg) return res.status(404).json({ error: 'Drawing control not found' });

  if (!await verifyProjectAccess(user.id, user.role, dwg.project_id, res)) return;

  const editableStatuses = ['draft', 'under_review'];
  if (!editableStatuses.includes(dwg.status)) {
    return res.status(409).json({ error: `Cannot edit design data for a drawing in '${dwg.status}' state` });
  }

  const existing = await db.execute(sql`SELECT id FROM design_data_sheets WHERE dwg_control_id = ${dwgControlId}`);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'No design data sheet found. Use POST to create.' });
  }

  const { designCode, equipmentConfig, inspectionBy, mechanicalData, generalData, columnHazardData: rawColHazard,
    // backward compat
    appliedCode: legacyAppliedCode, hazardData: legacyRawHazardData } = req.body;

  if (!designCode || !equipmentConfig || !inspectionBy) {
    return res.status(400).json({ error: 'designCode, equipmentConfig and inspectionBy are required' });
  }

  const validConfigs = ['Vessel', 'Jacketed Vessel', 'Heat Exchanger', 'Jacketed Vessel and Heat Exchanger'];
  if (!validConfigs.includes(equipmentConfig)) {
    return res.status(400).json({ error: 'Invalid equipmentConfig' });
  }

  const validInspectors = ['SGS India', 'TUV India', 'Thermopac'];
  if (!validInspectors.includes(inspectionBy)) {
    return res.status(400).json({ error: 'Invalid inspectionBy' });
  }

  const effectiveColHazard = rawColHazard ?? (legacyAppliedCode ? {
    shell: { appliedCode: legacyAppliedCode, ...(legacyRawHazardData || {}) },
    tube: null, jacket: null,
  } : null);

  const materialCode = DESIGN_CODE_TO_MATERIAL_CODE[designCode] || null;
  const equipmentType = EQUIPMENT_CONFIG_TO_TYPE[equipmentConfig] || equipmentConfig.toUpperCase();
  const auto = await resolveAutoFields(dwg);

  let normalizedMechanical = normalizeMechanicalData(equipmentConfig, mechanicalData || {});
  const normalizedGeneral = normalizeGeneralData(generalData || {});
  const { columnHazardData: processedColHazard, mechanical: finalMechanical } =
    processColumnHazardData(effectiveColHazard, dwg.status, normalizedMechanical);
  normalizedMechanical = finalMechanical;

  const updated = await db.execute(sql`
    UPDATE design_data_sheets SET
      design_code = ${designCode},
      material_code = ${materialCode},
      equipment_description = ${auto.equipmentDescription},
      tag_no = ${auto.tagNo},
      equipment_type = ${equipmentType},
      manufacture_serial_no = ${auto.manufactureSerialNo},
      inspection_by = ${inspectionBy},
      equipment_config = ${equipmentConfig},
      mechanical_data = ${JSON.stringify(normalizedMechanical)}::jsonb,
      general_data = ${JSON.stringify(normalizedGeneral)}::jsonb,
      hazard_data = ${JSON.stringify(processedColHazard)}::jsonb,
      updated_by = ${user.id},
      updated_at = NOW()
    WHERE dwg_control_id = ${dwgControlId}
    RETURNING *
  `);

  const updatedSheet = updated.rows[0] as any;
  const updatedSheetId = updatedSheet.id;

  void (async () => {
    try {
      const pdfResult = await generateAndUploadDdsPdf(updatedSheetId, dwg);
      if ('error' in pdfResult) {
        await db.execute(sql`UPDATE design_data_sheets SET dds_pdf_status = 'error' WHERE id = ${updatedSheetId}`);
        console.error(`[DDS PDF] Failed for sheet ${updatedSheetId}:`, pdfResult.error);
      } else {
        await db.execute(sql`UPDATE design_data_sheets SET dds_gcs_path = ${pdfResult.gcsPath}, dds_pdf_status = 'ready' WHERE id = ${updatedSheetId}`);
      }
    } catch (err) {
      console.error(`[DDS PDF] Unhandled error for sheet ${updatedSheetId}:`, err);
    }
  })();

  return res.json({
    sheet: updatedSheet,
    warnings: {
      tagNo: auto.tagNoWarning,
      manufactureSerialNo: auto.msnWarning,
    },
  });
});

// GET /api/drawing-design-data/:dwgControlId/pdf-url
router.get('/:dwgControlId/pdf-url', ensureAuthenticated, async (req: Request, res: Response) => {
  const dwgControlId = parseInt(req.params.dwgControlId);
  if (isNaN(dwgControlId)) return res.status(400).json({ error: 'Invalid dwgControlId' });

  const user = req.user as any;
  const dwg = await loadDrawingControl(dwgControlId);
  if (!dwg) return res.status(404).json({ error: 'Drawing control not found' });

  if (!await verifyProjectAccess(user.id, user.role, dwg.project_id, res)) return;

  const sheetResult = await db.execute(
    sql`SELECT dds_gcs_path FROM design_data_sheets WHERE dwg_control_id = ${dwgControlId}`
  );
  const sheet = sheetResult.rows[0] as any;
  if (!sheet?.dds_gcs_path) return res.status(404).json({ error: 'No PDF available for this sheet' });

  try {
    const url = await getDdsPdfSignedUrl(sheet.dds_gcs_path);
    return res.json({ url });
  } catch (err) {
    console.error('[DDS PDF] Signed URL error:', err);
    return res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

// POST /api/drawing-design-data/:dwgControlId/regenerate-pdf
router.post('/:dwgControlId/regenerate-pdf', ensureAuthenticated, async (req: Request, res: Response) => {
  const dwgControlId = parseInt(req.params.dwgControlId);
  if (isNaN(dwgControlId)) return res.status(400).json({ error: 'Invalid dwgControlId' });

  const user = req.user as any;
  const dwg = await loadDrawingControl(dwgControlId);
  if (!dwg) return res.status(404).json({ error: 'Drawing control not found' });

  if (!await verifyProjectAccess(user.id, user.role, dwg.project_id, res)) return;

  const sheetResult = await db.execute(
    sql`SELECT id FROM design_data_sheets WHERE dwg_control_id = ${dwgControlId}`
  );
  const sheet = sheetResult.rows[0] as any;
  if (!sheet) return res.status(404).json({ error: 'No DDS sheet found for this drawing' });

  const result = await generateAndUploadDdsPdf(sheet.id, dwg);
  if ('error' in result) {
    await db.execute(sql`UPDATE design_data_sheets SET dds_pdf_status = 'error' WHERE id = ${sheet.id}`);
    return res.status(500).json({ error: result.error });
  }

  await db.execute(sql`
    UPDATE design_data_sheets
    SET dds_gcs_path = ${result.gcsPath}, dds_pdf_status = 'ready',
        updated_at = NOW(), updated_by = ${user.id}
    WHERE id = ${sheet.id}
  `);
  return res.json({ success: true, gcsPath: result.gcsPath });
});

// GET /api/drawing-design-data/:dwgControlId/excel
router.get('/:dwgControlId/excel', ensureAuthenticated, async (req: Request, res: Response) => {
  const dwgControlId = parseInt(req.params.dwgControlId);
  if (isNaN(dwgControlId)) return res.status(400).json({ error: 'Invalid dwgControlId' });

  const user = req.user as any;
  const dwg = await loadDrawingControl(dwgControlId);
  if (!dwg) return res.status(404).json({ error: 'Drawing control not found' });

  if (!await verifyProjectAccess(user.id, user.role, dwg.project_id, res)) return;

  const sheetResult = await db.execute(sql`
    SELECT dds.*
    FROM design_data_sheets dds
    WHERE dds.dwg_control_id = ${dwgControlId}
    LIMIT 1
  `);
  const sheetRow = sheetResult.rows[0] as any;
  if (!sheetRow) return res.status(404).json({ error: 'No DDS found for this drawing' });

  const projectResult = await db.execute(sql`
    SELECT p.code FROM projects p WHERE p.id = ${dwg.project_id} LIMIT 1
  `);
  const proj = projectResult.rows[0] as any;

  const drawingNumber = dwg.drawing_number || `DWG-${dwgControlId}`;
  const revision = (sheetRow.revision || dwg.revision || 'A').toString().toUpperCase();
  const filename = `${drawingNumber}_dds-rev-${revision}.xlsx`.replace(/\//g, '-').replace(/\s+/g, '_');

  const mechanicalData = (typeof sheetRow.mechanical_data === 'string'
    ? JSON.parse(sheetRow.mechanical_data)
    : sheetRow.mechanical_data) || {};
  const generalData = (typeof sheetRow.general_data === 'string'
    ? JSON.parse(sheetRow.general_data)
    : sheetRow.general_data) || {};

  try {
    const buffer = await generateDdsExcel({
      sheet: {
        id: sheetRow.id,
        design_code: sheetRow.design_code,
        material_code: sheetRow.material_code,
        equipment_type: sheetRow.equipment_type,
        equipment_config: sheetRow.equipment_config,
        tag_no: sheetRow.tag_no,
        equipment_description: sheetRow.equipment_description,
        manufacture_serial_no: sheetRow.manufacture_serial_no,
        inspection_by: sheetRow.inspection_by,
        mechanical_data: mechanicalData,
        general_data: generalData,
        hazard_data: null,
        revision,
        status: sheetRow.status,
        updated_at: sheetRow.updated_at,
      },
      drawingNumber,
      revision,
      generatedBy: user.username || user.email || 'System',
      projectCode: proj?.code || null,
    });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('[DDS Excel] Generation error:', err);
    return res.status(500).json({ error: 'Excel generation failed' });
  }
});

export default router;
