import express, { Request, Response } from 'express';
import { db } from './db';
import { sql, eq } from 'drizzle-orm';
import { designDataSheets, epcDrawingControls, projects, projectItems } from '@shared/schema';
import { checkProjectMembership } from './utils/permission-utils';
import type { MechanicalColumn, MechanicalData, GeneralData } from '@shared/schema';

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

  if (dwgControl.project_item_id) {
    // Tier 1 & 2: try exact match first, then item_code fuzzy match via project_item
    const projectItemResult = await db.execute(sql`
      SELECT pr.tag_no as product_tag_no, pr.product_code as matched_code
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
  }

  // Tier 3: fallback via drawing control's own item_code
  if (!productTagNo && dwgControl.item_code) {
    const fallbackResult = await db.execute(sql`
      SELECT product_code, tag_no
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
  return { equipmentDescription, tagNo, tagNoWarning, manufactureSerialNo, msnWarning, projectMdmt };
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

  const { designCode, equipmentConfig, inspectionBy, mechanicalData, generalData } = req.body;

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

  const materialCode = DESIGN_CODE_TO_MATERIAL_CODE[designCode] || null;
  const equipmentType = EQUIPMENT_CONFIG_TO_TYPE[equipmentConfig] || equipmentConfig.toUpperCase();
  const auto = await resolveAutoFields(dwg);

  const normalizedMechanical = normalizeMechanicalData(equipmentConfig, mechanicalData || {});
  const normalizedGeneral = normalizeGeneralData(generalData || {});

  const inserted = await db.execute(sql`
    INSERT INTO design_data_sheets (
      dwg_control_id, project_id, design_code, material_code,
      equipment_description, tag_no, equipment_type, manufacture_serial_no,
      inspection_by, equipment_config, mechanical_data, general_data,
      status, created_by, updated_by
    ) VALUES (
      ${dwgControlId}, ${dwg.project_id}, ${designCode}, ${materialCode},
      ${auto.equipmentDescription}, ${auto.tagNo}, ${equipmentType}, ${auto.manufactureSerialNo},
      ${inspectionBy}, ${equipmentConfig},
      ${JSON.stringify(normalizedMechanical)}::jsonb,
      ${JSON.stringify(normalizedGeneral)}::jsonb,
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

  const { designCode, equipmentConfig, inspectionBy, mechanicalData, generalData } = req.body;

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

  const materialCode = DESIGN_CODE_TO_MATERIAL_CODE[designCode] || null;
  const equipmentType = EQUIPMENT_CONFIG_TO_TYPE[equipmentConfig] || equipmentConfig.toUpperCase();
  const auto = await resolveAutoFields(dwg);

  const normalizedMechanical = normalizeMechanicalData(equipmentConfig, mechanicalData || {});
  const normalizedGeneral = normalizeGeneralData(generalData || {});

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
