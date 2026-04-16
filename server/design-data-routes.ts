import express, { Request, Response } from 'express';
import { db } from './db';
import { sql, eq } from 'drizzle-orm';
import { z } from 'zod';
import { designDataSheets, epcDrawingControls, projects, projectItems } from '@shared/schema';
import { checkProjectMembership } from './utils/permission-utils';
import type { MechanicalColumn, MechanicalData, GeneralData, HazardData } from '@shared/schema';

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
  'Heat Exchanger': 'HEAT EXCHANGER',
  'Jacketed Vessel and Heat Exchanger': 'JACKETED HEAT EXCHANGER',
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
};

function processHazardData(raw: any, code: string | null, dwgStatus: string, mechanical: MechanicalData): { hazardData: HazardData | null; mechanical: MechanicalData } {
  if (!code || !raw) return { hazardData: null, mechanical };

  const schema = HAZARD_SCHEMAS[code];
  if (!schema) {
    console.warn(`[HazardProcess] Unknown applied_code="${code}" — skipping.`);
    return { hazardData: null, mechanical };
  }

  // Parse + strip: Zod removes unknown keys and coerces enums/defaults
  const parseResult = schema.safeParse(raw);
  if (!parseResult.success) {
    console.warn(`[HazardProcess] Zod validation failed for code="${code}":`, parseResult.error.flatten());
  }
  const parsed = parseResult.success ? parseResult.data : schema.parse({ fluidState: raw.fluidState ?? 'Fluid' });

  // Merge: start from empty to guarantee no disallowed fields survive
  const full: HazardData = {
    appliedCode: code,
    ...EMPTY_CODE_FIELDS,
    ...parsed,
    // Always recompute; ignore any frontend-supplied derived values
    codeNativeClassification: null,
    internalHazardLevel: null,
    hazardBasisNote: null,
  };

  // Server-side derivation (frontend values are ignored)
  const derived = deriveHazardFields(full);

  // hazardLevel overwrite: draft AND applied_code non-null AND level is resolved
  let updatedMech = mechanical;
  if (dwgStatus === 'draft' && code && derived.internalHazardLevel) {
    const lvl = derived.internalHazardLevel;
    console.log(`[HazardProcess] Overwriting mechanical hazardLevel → "${lvl}" (status=draft, code="${code}")`);
    updatedMech = {
      shell: { ...mechanical.shell, hazardLevel: lvl },
      tube: mechanical.tube ? { ...mechanical.tube, hazardLevel: lvl } : null,
      jacket: mechanical.jacket ? { ...mechanical.jacket, hazardLevel: lvl } : null,
    };
  }

  return { hazardData: derived, mechanical: updatedMech };
}

async function resolveAutoFields(dwgControl: any): Promise<{
  equipmentDescription: string | null;
  tagNo: string | null;
  tagNoWarning: string | null;
  manufactureSerialNo: string | null;
  msnWarning: string | null;
}> {
  const equipmentDescription = dwgControl.item_description || null;

  // Resolve tag_no: {product_tag_no}_{project_code}
  // e.g. RF/FE/E1_2627-013
  let tagNo: string | null = null;
  let tagNoWarning: string | null = null;

  const projectResult = await db.execute(sql`
    SELECT p.code, p.mdmt
    FROM projects p
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
    tagNo = `${productTagNo}_${projectCode}`;
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
  return { equipmentDescription, tagNo, tagNoWarning, manufactureSerialNo, msnWarning, projectMdmt, productEquipmentConfiguration };
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

  const { designCode, equipmentConfig, inspectionBy, mechanicalData, generalData, appliedCode, hazardData: rawHazardData } = req.body;

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

  if (appliedCode === 'PED 2014/68/EU') {
    if (!rawHazardData?.fluidGroup || !rawHazardData?.pedCategory) {
      return res.status(422).json({ error: 'PED 2014/68/EU requires fluidGroup and pedCategory.' });
    }
  }

  // Validate applied_code against known codes
  if (appliedCode && !HAZARD_SCHEMAS[appliedCode]) {
    return res.status(400).json({ error: `Unknown applied_code: "${appliedCode}"` });
  }

  const materialCode = DESIGN_CODE_TO_MATERIAL_CODE[designCode] || null;
  const equipmentType = EQUIPMENT_CONFIG_TO_TYPE[equipmentConfig] || equipmentConfig.toUpperCase();
  const auto = await resolveAutoFields(dwg);

  let normalizedMechanical = normalizeMechanicalData(equipmentConfig, mechanicalData || {});
  const normalizedGeneral = normalizeGeneralData(generalData || {});
  const { hazardData: processedHazard, mechanical: finalMechanical } = processHazardData(rawHazardData, appliedCode || null, 'draft', normalizedMechanical);
  normalizedMechanical = finalMechanical;

  const inserted = await db.execute(sql`
    INSERT INTO design_data_sheets (
      dwg_control_id, project_id, design_code, material_code,
      equipment_description, tag_no, equipment_type, manufacture_serial_no,
      inspection_by, equipment_config, mechanical_data, general_data,
      applied_code, hazard_data,
      status, created_by, updated_by
    ) VALUES (
      ${dwgControlId}, ${dwg.project_id}, ${designCode}, ${materialCode},
      ${auto.equipmentDescription}, ${auto.tagNo}, ${equipmentType}, ${auto.manufactureSerialNo},
      ${inspectionBy}, ${equipmentConfig},
      ${JSON.stringify(normalizedMechanical)}::jsonb,
      ${JSON.stringify(normalizedGeneral)}::jsonb,
      ${appliedCode || null},
      ${processedHazard ? JSON.stringify(processedHazard) : null}::jsonb,
      'draft', ${user.id}, ${user.id}
    )
    RETURNING *
  `);

  return res.status(201).json({
    sheet: inserted.rows[0],
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

  const { designCode, equipmentConfig, inspectionBy, mechanicalData, generalData, appliedCode, hazardData: rawHazardData } = req.body;

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

  if (appliedCode === 'PED 2014/68/EU') {
    if (!rawHazardData?.fluidGroup || !rawHazardData?.pedCategory) {
      return res.status(422).json({ error: 'PED 2014/68/EU requires fluidGroup and pedCategory.' });
    }
  }

  // Validate applied_code against known codes
  if (appliedCode && !HAZARD_SCHEMAS[appliedCode]) {
    return res.status(400).json({ error: `Unknown applied_code: "${appliedCode}"` });
  }

  const materialCode = DESIGN_CODE_TO_MATERIAL_CODE[designCode] || null;
  const equipmentType = EQUIPMENT_CONFIG_TO_TYPE[equipmentConfig] || equipmentConfig.toUpperCase();
  const auto = await resolveAutoFields(dwg);

  let normalizedMechanical = normalizeMechanicalData(equipmentConfig, mechanicalData || {});
  const normalizedGeneral = normalizeGeneralData(generalData || {});
  const { hazardData: processedHazard, mechanical: finalMechanical } = processHazardData(rawHazardData, appliedCode || null, dwg.status, normalizedMechanical);
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
      applied_code = ${appliedCode || null},
      hazard_data = ${processedHazard ? JSON.stringify(processedHazard) : null}::jsonb,
      updated_by = ${user.id},
      updated_at = NOW()
    WHERE dwg_control_id = ${dwgControlId}
    RETURNING *
  `);

  return res.json({
    sheet: updated.rows[0],
    warnings: {
      tagNo: auto.tagNoWarning,
      manufactureSerialNo: auto.msnWarning,
    },
  });
});

export default router;
