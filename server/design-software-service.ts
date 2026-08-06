// ═══════════════════════════════════════════════════════════════════════════════
// Design Software Service Layer
//
// All business logic for designs, revisions, inputs, results, assumptions,
// calculation runs, and lifecycle transitions lives here.
// Routes are thin wrappers; this service owns all enforcement rules.
// ═══════════════════════════════════════════════════════════════════════════════

import { pool } from './db';
import { engineRegistry } from './engine-framework/registry';
import { CalculationContext } from './engine-framework/types';
import { mapWorkspaceProcessDesignInputs } from './llx-process-design-input-mapper';
import { mapWorkspaceMechanicalInputs } from './llx-mechanical-design-input-mapper';
import { generateNozzleSchedule as generateNozzles } from './llx-nozzle-master-data';

// ── Lifecycle transition table ────────────────────────────────────────────────
// action → { requiredStatus, nextStatus, setsFrozen, setsField }
const LIFECYCLE_TRANSITIONS: Record<
  string,
  {
    requiredStatus: string[];
    nextStatus: string;
    setsFrozen?: boolean;
    setsField?: string; // column name on design_software_revisions to set to userId
  }
> = {
  submit_for_review: {
    requiredStatus: ['draft'],
    nextStatus: 'under_review',
  },
  return_to_draft: {
    requiredStatus: ['under_review'],
    nextStatus: 'draft',
  },
  check: {
    requiredStatus: ['under_review'],
    nextStatus: 'checked',
    setsFrozen: true,
    setsField: 'checked_by_id',
  },
  approve: {
    requiredStatus: ['checked'],
    nextStatus: 'approved',
    setsField: 'approved_by_id',
  },
  issue: {
    requiredStatus: ['approved'],
    nextStatus: 'issued_for_enquiry',
  },
  issue_for_construction: {
    requiredStatus: ['issued_for_enquiry'],
    nextStatus: 'issued_for_construction',
  },
  supersede: {
    requiredStatus: ['issued_for_enquiry', 'issued_for_construction'],
    nextStatus: 'superseded',
  },
  archive: {
    requiredStatus: ['draft', 'under_review', 'checked', 'approved', 'issued_for_enquiry', 'issued_for_construction'],
    nextStatus: 'archived',
  },
};

// ── Design number allocation ───────────────────────────────────────────────────
async function allocateDesignNumber(
  moduleType: string,
  scopeKey: string,
): Promise<number> {
  const result = await pool.query<{ last_seq: number }>(
    `INSERT INTO design_software_number_sequences(module_type, scope_key, last_seq)
     VALUES ($1, $2, 1)
     ON CONFLICT (module_type, scope_key)
     DO UPDATE SET last_seq = design_software_number_sequences.last_seq + 1
     RETURNING last_seq`,
    [moduleType, scopeKey],
  );
  return result.rows[0].last_seq;
}

function formatDesignNumber(
  moduleType: string,
  designType: string,
  scopeKey: string,
  seq: number,
): string {
  const prefix = moduleType.toUpperCase();
  const seqStr = String(seq).padStart(4, '0');
  if (designType === 'rnd') {
    return `${prefix}-RND-${scopeKey}-${seqStr}`;
  }
  return `${prefix}-${scopeKey}-${seqStr}`;
}

// ── Design CRUD ───────────────────────────────────────────────────────────────

export async function createDesign(params: {
  moduleType: string;
  designType: string;
  title: string;
  projectId?: number | null;
  projectCode?: string | null;
  capacity?: string | null;
  rndReference?: string | null;
  rndCustomerName?: string | null;
  rndCapacity?: string | null;
  rndLocation?: string | null;
  rndNotes?: string | null;
  createdBy: number;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Determine scope key for number sequence
    const year = new Date().getFullYear().toString();
    const scopeKey =
      params.designType === 'project' && params.projectCode
        ? params.projectCode
        : year;

    const seq = await allocateDesignNumber(params.moduleType, scopeKey);
    const designNumber = formatDesignNumber(params.moduleType, params.designType, scopeKey, seq);

    // Insert design with current_revision_id = NULL (DEFERRABLE FK allows this)
    const dRow = await client.query(
      `INSERT INTO design_software_designs
         (design_number, design_sequence, module_type, design_type, title,
          project_id, capacity,
          rnd_reference, rnd_customer_name, rnd_capacity, rnd_location, rnd_notes,
          current_revision_id, current_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,'draft',$13)
       RETURNING *`,
      [
        designNumber, seq, params.moduleType, params.designType, params.title,
        params.projectId ?? null, params.capacity ?? null,
        params.rndReference ?? null, params.rndCustomerName ?? null,
        params.rndCapacity ?? null, params.rndLocation ?? null, params.rndNotes ?? null,
        params.createdBy,
      ],
    );
    const design = dRow.rows[0];

    // Insert initial revision (Rev 0)
    const rRow = await client.query(
      `INSERT INTO design_software_revisions
         (design_id, revision_number, status, is_current, is_frozen,
          prepared_by_id, design_date)
       VALUES ($1, 0, 'draft', true, false, $2, CURRENT_DATE)
       RETURNING *`,
      [design.id, params.createdBy],
    );
    const revision = rRow.rows[0];

    // Point design at revision (FK is DEFERRABLE — checked at COMMIT)
    await client.query(
      `UPDATE design_software_designs
       SET current_revision_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [revision.id, design.id],
    );

    await client.query('COMMIT');

    return { ...design, current_revision_id: revision.id, revision };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listDesigns(filters: {
  moduleType?: string;
  designType?: string;
  status?: string;
  projectId?: number;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filters.moduleType) {
    conditions.push(`d.module_type = $${idx++}`);
    values.push(filters.moduleType);
  }
  if (filters.designType) {
    conditions.push(`d.design_type = $${idx++}`);
    values.push(filters.designType);
  }
  if (filters.status) {
    conditions.push(`d.current_status = $${idx++}`);
    values.push(filters.status);
  }
  if (filters.projectId) {
    conditions.push(`d.project_id = $${idx++}`);
    values.push(filters.projectId);
  }
  if (filters.search) {
    conditions.push(`(d.design_number ILIKE $${idx} OR d.title ILIKE $${idx})`);
    values.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT d.*, r.revision_number, r.status AS revision_status, r.is_frozen,
              u.username AS created_by_name,
              p.code AS project_code
       FROM design_software_designs d
       LEFT JOIN design_software_revisions r ON r.id = d.current_revision_id
       LEFT JOIN users u ON u.id = d.created_by
       LEFT JOIN projects p ON p.id = d.project_id
       ${where}
       ORDER BY d.updated_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*) AS total FROM design_software_designs d ${where}`,
      values,
    ),
  ]);

  return {
    designs: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
    page,
    limit,
  };
}

export async function getDesign(id: number) {
  const result = await pool.query(
    `SELECT d.*,
            r.id AS rev_id, r.revision_number, r.status AS revision_status,
            r.is_current, r.is_frozen, r.lock_version,
            r.prepared_by_id, r.checked_by_id, r.approved_by_id,
            r.design_date, r.change_description, r.frozen_at, r.frozen_by_id,
            r.created_at AS rev_created_at, r.updated_at AS rev_updated_at,
            u.username AS created_by_name,
            p.code AS project_code, p.name AS project_name
     FROM design_software_designs d
     LEFT JOIN design_software_revisions r ON r.id = d.current_revision_id
     LEFT JOIN users u ON u.id = d.created_by
     LEFT JOIN projects p ON p.id = d.project_id
     WHERE d.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateDesign(
  id: number,
  params: {
    title?: string;
    capacity?: string | null;
    rndReference?: string | null;
    rndCustomerName?: string | null;
    rndCapacity?: string | null;
    rndLocation?: string | null;
    rndNotes?: string | null;
    linkedProjectId?: number | null;
  },
  userId: number,
) {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let idx = 1;

  const allowed = ['title', 'capacity', 'rnd_reference', 'rnd_customer_name',
                   'rnd_capacity', 'rnd_location', 'rnd_notes', 'linked_project_id'];
  const paramMap: Record<string, string> = {
    title: 'title', capacity: 'capacity',
    rndReference: 'rnd_reference', rndCustomerName: 'rnd_customer_name',
    rndCapacity: 'rnd_capacity', rndLocation: 'rnd_location', rndNotes: 'rnd_notes',
    linkedProjectId: 'linked_project_id',
  };

  for (const [jsKey, dbCol] of Object.entries(paramMap)) {
    if (jsKey in params) {
      setClauses.push(`${dbCol} = $${idx++}`);
      values.push((params as any)[jsKey]);
    }
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE design_software_designs SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  if (!result.rows[0]) throw new Error('Design not found');
  return result.rows[0];
}

export async function deleteDesign(id: number) {
  // Cascade handled by FK ON DELETE CASCADE on revisions/inputs/results
  const result = await pool.query(
    `DELETE FROM design_software_designs WHERE id = $1 RETURNING id`,
    [id],
  );
  if (!result.rows[0]) throw new Error('Design not found');
  return result.rows[0];
}

// ── Revision management ───────────────────────────────────────────────────────

export async function listRevisions(designId: number) {
  const result = await pool.query(
    `SELECT r.*,
            pb.username AS prepared_by_name,
            cb.username AS checked_by_name,
            ab.username AS approved_by_name
     FROM design_software_revisions r
     LEFT JOIN users pb ON pb.id = r.prepared_by_id
     LEFT JOIN users cb ON cb.id = r.checked_by_id
     LEFT JOIN users ab ON ab.id = r.approved_by_id
     WHERE r.design_id = $1
     ORDER BY r.revision_number DESC`,
    [designId],
  );
  return result.rows;
}

export async function createRevision(
  designId: number,
  params: { changeDescription?: string; preparedById?: number },
  userId: number,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current revision
    const cur = await client.query(
      `SELECT r.*, d.current_status FROM design_software_revisions r
       JOIN design_software_designs d ON d.id = r.design_id
       WHERE r.design_id = $1 AND r.is_current = true`,
      [designId],
    );
    if (!cur.rows[0]) throw new Error('Design or current revision not found');
    const current = cur.rows[0];

    // Cannot create a new revision from an archived design
    if (current.current_status === 'archived') {
      throw new Error('Cannot create a revision from an archived design');
    }

    const nextRevNum = current.revision_number + 1;

    // Mark current revision as no longer current
    // If it was issued_for_enquiry, supersede it
    const prevNextStatus =
      current.status === 'issued_for_enquiry' ? 'superseded' : current.status;
    await client.query(
      `UPDATE design_software_revisions
       SET is_current = false, status = $1, updated_at = NOW()
       WHERE id = $2`,
      [prevNextStatus, current.id],
    );

    // Create new revision
    const newRev = await client.query(
      `INSERT INTO design_software_revisions
         (design_id, revision_number, status, is_current, is_frozen,
          prepared_by_id, change_description)
       VALUES ($1, $2, 'draft', true, false, $3, $4)
       RETURNING *`,
      [designId, nextRevNum, params.preparedById ?? userId, params.changeDescription ?? null],
    );
    const revision = newRev.rows[0];

    // Copy inputs from previous revision
    await client.query(
      `INSERT INTO design_software_inputs (revision_id, section, data, engine_version, updated_by)
       SELECT $1, section, data, engine_version, $2
       FROM design_software_inputs WHERE revision_id = $3`,
      [revision.id, userId, current.id],
    );

    // Copy assumptions from previous revision
    await client.query(
      `INSERT INTO design_software_assumptions
         (revision_id, section, parameter_key, parameter_label, assumed_value,
          unit, source_type, source_reference, engineering_basis, created_by)
       SELECT $1, section, parameter_key, parameter_label, assumed_value,
              unit, source_type, source_reference, engineering_basis, $2
       FROM design_software_assumptions WHERE revision_id = $3`,
      [revision.id, userId, current.id],
    );

    // Update design pointer
    await client.query(
      `UPDATE design_software_designs
       SET current_revision_id = $1, current_status = 'draft', updated_at = NOW()
       WHERE id = $2`,
      [revision.id, designId],
    );

    await client.query('COMMIT');
    return revision;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Inputs ────────────────────────────────────────────────────────────────────

async function assertRevisionNotFrozen(revisionId: number) {
  const r = await pool.query(
    'SELECT is_frozen, design_id FROM design_software_revisions WHERE id = $1',
    [revisionId],
  );
  if (!r.rows[0]) throw new Error('Revision not found');
  if (r.rows[0].is_frozen) {
    throw new Error(
      'This revision is frozen (status is checked or higher). Create a new revision to make changes.',
    );
  }
  return r.rows[0];
}

export async function listInputs(revisionId: number) {
  const result = await pool.query(
    'SELECT * FROM design_software_inputs WHERE revision_id = $1 ORDER BY section',
    [revisionId],
  );
  return result.rows;
}

export async function upsertInput(
  revisionId: number,
  section: string,
  data: Record<string, unknown>,
  engineVersion: string,
  userId: number,
) {
  await assertRevisionNotFrozen(revisionId);

  const result = await pool.query(
    `INSERT INTO design_software_inputs (revision_id, section, data, engine_version, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (revision_id, section)
     DO UPDATE SET data = $3, engine_version = $4, updated_by = $5, updated_at = NOW()
     RETURNING *`,
    [revisionId, section, JSON.stringify(data), engineVersion, userId],
  );

  // Bump lock_version on revision
  await pool.query(
    'UPDATE design_software_revisions SET lock_version = lock_version + 1, updated_at = NOW() WHERE id = $1',
    [revisionId],
  );

  return result.rows[0];
}

// ── Results ───────────────────────────────────────────────────────────────────

export async function listResults(revisionId: number) {
  const result = await pool.query(
    'SELECT * FROM design_software_results WHERE revision_id = $1 ORDER BY section',
    [revisionId],
  );
  return result.rows;
}

// ── Calculation runs ──────────────────────────────────────────────────────────

export async function listCalculationRuns(revisionId: number) {
  const result = await pool.query(
    `SELECT cr.*, u.username AS calculated_by_name
     FROM design_software_calculation_runs cr
     LEFT JOIN users u ON u.id = cr.calculated_by
     WHERE cr.revision_id = $1
     ORDER BY cr.calculated_at DESC`,
    [revisionId],
  );
  return result.rows;
}

/**
 * Stage 9 — fully automatic nozzle generation and preliminary sizing.
 * Reads the merged workspace inputs, the selected technology and adopted
 * geometry, and applies the controlled Thermopac nozzle master data
 * (velocity rules, DN series, instrument masters, access rules). Returns
 * the generated schedule + validation issues; the CLIENT saves the rows
 * into mechanical_design.nozzle_rows through the ordinary input-save path
 * (single write path, no server-side shadow writes).
 */
export async function generateNozzleSchedule(revisionId: number) {
  const revRow = await pool.query(
    `SELECT r.*, d.module_type FROM design_software_revisions r
     JOIN design_software_designs d ON d.id = r.design_id WHERE r.id = $1`,
    [revisionId],
  );
  if (!revRow.rows[0]) throw new Error('Revision not found');

  const inputRows = await pool.query(
    'SELECT section, data FROM design_software_inputs WHERE revision_id = $1',
    [revisionId],
  );
  const inputs: Record<string, unknown> = {};
  for (const row of inputRows.rows) Object.assign(inputs, row.data);

  const preferred = String(inputs['preferred'] ?? '').trim();
  if (preferred !== 'ecp' && preferred !== 'ecr') {
    throw new Error('Select the technology (ECP or ECR) in Stage 8 — Technology Comparison before generating the nozzle schedule.');
  }
  const techRunQ = await pool.query(
    `SELECT * FROM design_software_calculation_runs
     WHERE revision_id = $1 AND calculation_type = $2 AND calculation_status IN ('success','warning')
     ORDER BY calculated_at DESC LIMIT 1`,
    [revisionId, preferred],
  );
  const techRun = techRunQ.rows[0];
  if (!techRun) throw new Error(`No accepted ${preferred.toUpperCase()} run available — run the Stage 7 ${preferred.toUpperCase()} calculation first.`);
  const hb = techRun.result_snapshot?.heightBreakdown ?? {};

  const nnum = (v: unknown): number | null => {
    const n = Number(String(v ?? '').trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  let dia = nnum(inputs['column_diameter_m']) ?? nnum(inputs['column_diameter']);
  if (dia === null) {
    const hydQ = await pool.query(
      `SELECT data->'normalCase'->'summary'->>'minimumFeasibleDiameter_m' AS d
       FROM design_software_results WHERE revision_id = $1 AND section = 'hydraulics_common'`,
      [revisionId],
    );
    dia = nnum(hydQ.rows[0]?.d);
  }
  const tt = nnum(inputs['tt_height_m']) ?? nnum(hb.totalTangentToTangent?.result);
  if (dia === null || tt === null) {
    throw new Error('Nozzle generation requires the column diameter (Stage 5) and tangent-to-tangent height (Stage 7 run) — complete those stages first.');
  }

  const feedLph = nnum(inputs['design_capacity_lph']) ?? nnum(inputs['design_capacity']) ?? nnum(inputs['feed_flow']);
  const soRatio = nnum(inputs['so_ratio']);
  const feedFlow_m3h = feedLph !== null ? feedLph / 1000 : null;
  const solventFlow_m3h = feedFlow_m3h !== null && soRatio !== null ? feedFlow_m3h * soRatio : null;

  return generateNozzles({
    preferred,
    insideDiameter_m: dia,
    tangentToTangentHeight_m: tt,
    feedFlow_m3h,
    solventFlow_m3h,
    bottomDisengagement_m: nnum(inputs['bottom_disengagement_height']),
    topDisengagement_m: nnum(inputs['top_disengagement_height']),
    topDistributorAllowance_m: nnum(inputs['top_distributor_allowance']),
    designPressureBarg: nnum(inputs['llx_internal_design_pressure']) ?? nnum(inputs['design_pressure']) ?? undefined,
    designTempC: nnum(inputs['design_temperature']) ?? undefined,
  });
}

export async function runCalculation(
  revisionId: number,
  calculationType: string,
  userId: number,
) {
  // Get revision + design info
  const revRow = await pool.query(
    `SELECT r.*, d.module_type, d.id AS design_id
     FROM design_software_revisions r
     JOIN design_software_designs d ON d.id = r.design_id
     WHERE r.id = $1`,
    [revisionId],
  );
  if (!revRow.rows[0]) throw new Error('Revision not found');
  const rev = revRow.rows[0];

  // Get engine — common downstream engines (e.g. C6 mech-vessel) are registered
  // under moduleType 'common' and shared across modules.
  const engine = engineRegistry.get(rev.module_type, calculationType)
    ?? engineRegistry.getOrThrow('common', calculationType);

  // Load the relevant input section(s)
  const inputRows = await pool.query(
    'SELECT section, data FROM design_software_inputs WHERE revision_id = $1',
    [revisionId],
  );
  let inputs: Record<string, unknown> = {};
  for (const row of inputRows.rows) {
    Object.assign(inputs, row.data);
  }
  // Workspace → engine input adapter (structure + unit conversion only; the
  // C2 engine and its equations are untouched).
  if (rev.module_type === 'llx' && ['process_design', 'hydraulics_common', 'ecp', 'ecr'].includes(calculationType)) {
    inputs = mapWorkspaceProcessDesignInputs(inputs, calculationType);
  }

  // Stage 9 → C6 adapter: adopt geometry from the selected technology's latest
  // accepted C4/C5 run (never re-entered), then map the Mechanical Design Basis
  // into the mech-vessel input contract. Mapping only — no C6 equation changes.
  if (rev.module_type === 'llx' && calculationType === 'mechanical_vessel') {
    const preferred = String(inputs['preferred'] ?? '').trim();
    if (preferred !== 'ecp' && preferred !== 'ecr') {
      throw new Error('Select the technology (ECP or ECR) in Stage 8 — Technology Comparison before running the preliminary mechanical design. "Continue Both" requires a single selected technology for the mechanical basis.');
    }
    const techRunQ = await pool.query(
      `SELECT * FROM design_software_calculation_runs
       WHERE revision_id = $1 AND calculation_type = $2 AND calculation_status IN ('success','warning')
       ORDER BY calculated_at DESC LIMIT 1`,
      [revisionId, preferred],
    );
    const techRun = techRunQ.rows[0];
    if (!techRun) throw new Error(`No accepted ${preferred.toUpperCase()} run available — run the Stage 7 ${preferred.toUpperCase()} calculation first.`);
    const hb = techRun.result_snapshot?.heightBreakdown ?? {};

    // Selected diameter: Stage 9 override → Stage 5 engineer trial → sweep minimum feasible.
    // A present-but-invalid Stage 9 entry throws — engineer entries are never silently replaced.
    const strictNum = (key: string, label: string): number | undefined => {
      const raw = inputs[key];
      if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
      const v = Number(raw);
      if (!Number.isFinite(v) || v <= 0) throw new Error(`${label} ('${String(raw)}') is not a valid positive number — correct or clear the Stage 9 entry.`);
      return v;
    };
    let dia = strictNum('column_diameter_m', 'Stage 9 column diameter override')
      ?? strictNum('column_diameter', 'Stage 5 column diameter trial')
      ?? NaN;
    if (!Number.isFinite(dia) || dia <= 0) {
      const hydQ = await pool.query(
        `SELECT data->'normalCase'->'summary'->>'minimumFeasibleDiameter_m' AS d
         FROM design_software_results WHERE revision_id = $1 AND section = 'hydraulics_common'`,
        [revisionId],
      );
      dia = Number(hydQ.rows[0]?.d ?? NaN);
    }
    const tt = strictNum('tt_height_m', 'Stage 9 tangent-to-tangent height override') ?? Number(hb.totalTangentToTangent?.result ?? NaN);
    const oh = strictNum('overall_height_m', 'Stage 9 overall height override') ?? Number(hb.overallVesselHeight?.result ?? NaN);
    if (!Number.isFinite(dia) || !Number.isFinite(tt) || !Number.isFinite(oh)) {
      throw new Error('Mechanical geometry incomplete — column diameter (Stage 5), tangent-to-tangent and overall heights (Stage 7 run) are all required before the C6 screening can run.');
    }
    inputs = mapWorkspaceMechanicalInputs(inputs, {
      sourceEngine: { engineId: techRun.engine_name, engineVersion: techRun.engine_version, calculationType: preferred },
      sourceRunReference: `run #${techRun.id} (${techRun.calculated_at?.toISOString?.() ?? techRun.calculated_at})`,
      insideDiameter_m: dia,
      tangentToTangentHeight_m: tt,
      overallVesselHeight_m: oh,
    });
  }

  const context: CalculationContext = {
    revisionId,
    designId: rev.design_id,
    moduleType: rev.module_type,
    userId,
    calculationClass: 'Preliminary Screening',
  };

  // Validate
  const validation = engine.validate(inputs);

  let calcResult;
  if (validation.errors.some(e => e.severity === 'error')) {
    calcResult = {
      status: 'error' as const,
      data: {},
      warnings: [],
      validationIssues: validation.errors,
      calculationClass: 'Preliminary Screening',
      engineId: engine.getEngineId(),
      engineVersion: engine.getEngineVersion(),
      computedAt: new Date(),
    };
  } else {
    calcResult = await engine.calculate(inputs, context);
  }

  // Persist calculation run (always, even on error)
  const runRow = await pool.query(
    `INSERT INTO design_software_calculation_runs
       (revision_id, calculation_type, engine_name, engine_version, calculation_class,
        input_snapshot, result_snapshot, warnings, validation_issues,
        calculation_status, calculated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      revisionId, calculationType, engine.getEngineId(), engine.getEngineVersion(),
      calcResult.calculationClass,
      JSON.stringify(inputs), JSON.stringify(calcResult.data),
      JSON.stringify(calcResult.warnings), JSON.stringify(calcResult.validationIssues),
      calcResult.status, userId,
    ],
  );

  // If success/warning, upsert the accepted result
  if (calcResult.status !== 'error') {
    await pool.query(
      `INSERT INTO design_software_results
         (revision_id, section, data, engine_version, calculation_class, computed_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (revision_id, section)
       DO UPDATE SET data=$3, engine_version=$4, calculation_class=$5,
                     computed_by=$6, computed_at=NOW()`,
      [
        revisionId, calculationType, JSON.stringify(calcResult.data),
        engine.getEngineVersion(), calcResult.calculationClass, userId,
      ],
    );
  }

  return { run: runRow.rows[0], result: calcResult };
}

// ── Assumptions ───────────────────────────────────────────────────────────────

export async function listAssumptions(revisionId: number) {
  const result = await pool.query(
    `SELECT a.*, u.username AS created_by_name
     FROM design_software_assumptions a
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.revision_id = $1
     ORDER BY a.section, a.parameter_key`,
    [revisionId],
  );
  return result.rows;
}

export async function addAssumption(
  revisionId: number,
  params: {
    section: string;
    parameterKey: string;
    parameterLabel: string;
    assumedValue: unknown;
    unit?: string | null;
    sourceType: string;
    sourceReference?: string | null;
    engineeringBasis?: string | null;
  },
  userId: number,
) {
  const rev = await assertRevisionNotFrozen(revisionId);
  const result = await pool.query(
    `INSERT INTO design_software_assumptions
       (revision_id, section, parameter_key, parameter_label, assumed_value,
        unit, source_type, source_reference, engineering_basis, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      revisionId, params.section, params.parameterKey, params.parameterLabel,
      JSON.stringify(params.assumedValue), params.unit ?? null, params.sourceType,
      params.sourceReference ?? null, params.engineeringBasis ?? null, userId,
    ],
  );
  return result.rows[0];
}

export async function deleteAssumption(assumptionId: number, userId: number) {
  // Check that the parent revision is not frozen
  const a = await pool.query(
    'SELECT revision_id FROM design_software_assumptions WHERE id = $1',
    [assumptionId],
  );
  if (!a.rows[0]) throw new Error('Assumption not found');
  await assertRevisionNotFrozen(a.rows[0].revision_id);

  await pool.query('DELETE FROM design_software_assumptions WHERE id = $1', [assumptionId]);
}

// ── Lifecycle transitions ─────────────────────────────────────────────────────

export async function advanceLifecycle(
  revisionId: number,
  action: string,
  userId: number,
  comments?: string,
) {
  const transition = LIFECYCLE_TRANSITIONS[action];
  if (!transition) throw new Error(`Unknown lifecycle action: ${action}`);

  const revRow = await pool.query(
    'SELECT * FROM design_software_revisions WHERE id = $1',
    [revisionId],
  );
  if (!revRow.rows[0]) throw new Error('Revision not found');
  const rev = revRow.rows[0];

  if (!transition.requiredStatus.includes(rev.status)) {
    throw new Error(
      `Cannot perform '${action}' when revision status is '${rev.status}'. ` +
        `Required: ${transition.requiredStatus.join(' or ')}.`,
    );
  }

  const setClauses: string[] = [
    `status = '${transition.nextStatus}'`,
    'updated_at = NOW()',
  ];
  if (transition.setsFrozen) setClauses.push('is_frozen = true');
  if (transition.setsField) setClauses.push(`${transition.setsField} = ${userId}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = await client.query(
      `UPDATE design_software_revisions SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [revisionId],
    );

    // Record in approval audit trail
    await client.query(
      `INSERT INTO design_software_approvals (revision_id, action, performed_by, comments)
       VALUES ($1, $2, $3, $4)`,
      [revisionId, action, userId, comments ?? null],
    );

    // Mirror status to parent design
    await client.query(
      `UPDATE design_software_designs
       SET current_status = $1, updated_at = NOW()
       WHERE id = $2`,
      [transition.nextStatus, rev.design_id],
    );

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listApprovals(revisionId: number) {
  const result = await pool.query(
    `SELECT a.*, u.username AS performed_by_name
     FROM design_software_approvals a
     LEFT JOIN users u ON u.id = a.performed_by
     WHERE a.revision_id = $1
     ORDER BY a.performed_at ASC`,
    [revisionId],
  );
  return result.rows;
}

// ── Engine registry info ──────────────────────────────────────────────────────

export function listEngines() {
  return engineRegistry.listAll();
}
