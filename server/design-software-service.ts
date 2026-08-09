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
import { mergeSectionData } from './section-merge';
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

/**
 * Rule-populated defaults persisted for every new LLX design at creation.
 * These are DATA, not UI placeholders — source-tagged, editable in Stage 2,
 * and read verbatim by the Design Basis Report.
 */
export const LLX_DESIGN_BASIS_SEED = {
  solvent: 'N-Methyl-2-Pyrrolidone (NMP)',
  solvent_status: 'Auto-Populated',
  solvent_source: 'Thermopac LLX Design Basis Master — standard extraction solvent for the LLX module',
} as const;

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

    // Seed rule-populated design-basis defaults so persisted data — not UI
    // placeholders — carries the standard values (source-tagged, editable).
    if (params.moduleType === 'llx') {
      await client.query(
        `INSERT INTO design_software_inputs (revision_id, section, data, engine_version, updated_by)
         VALUES ($1, 'design_basis', $2, 'seed-v1', $3)`,
        [revision.id, JSON.stringify(LLX_DESIGN_BASIS_SEED), params.createdBy],
      );
    }

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

  // Field-level merge semantics (see server/section-merge.ts): incoming keys
  // overwrite, absent keys are preserved, explicit null deletes a key. The
  // merge happens atomically inside the UPDATE statement (JSONB || / - on the
  // stored row) so concurrent partial saves cannot lose each other's fields.
  const removeKeys = Object.keys(data).filter((k) => data[k] === null);
  const setData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== null) setData[k] = v;

  const result = await pool.query(
    `INSERT INTO design_software_inputs (revision_id, section, data, engine_version, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (revision_id, section)
     DO UPDATE SET
       data = (COALESCE(design_software_inputs.data, '{}'::jsonb) || $3::jsonb) - $6::text[],
       engine_version = $4, updated_by = $5, updated_at = NOW()
     RETURNING *`,
    [revisionId, section, JSON.stringify(setData), engineVersion, userId, removeKeys],
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
  let dia = nnum(inputs['column_diameter_m'])
    ?? (await getEffectiveDesignDiameterM(revisionId))
    ?? nnum(inputs['column_diameter']);
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

/** Effective design diameter (m) from the active DS-SEL record — the governed
 *  user-selected diameter when present, otherwise the autonomous selection.
 *  Returns undefined when no active record carries a diameter. */
async function getEffectiveDesignDiameterM(revisionId: number): Promise<number | undefined> {
  const q = await pool.query(
    `SELECT COALESCE(effective_diameter_mm, selected_diameter_mm) AS d_mm
       FROM design_selection_records
      WHERE revision_id = $1 AND is_superseded = FALSE
      ORDER BY created_at DESC LIMIT 1`, [revisionId]);
  const dMm = Number(q.rows[0]?.d_mm);
  return Number.isFinite(dMm) && dMm > 0 ? dMm / 1000 : undefined;
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
    // Diameter precedence: Stage 9 explicit mechanical override → EFFECTIVE
    // design diameter from the active DS-SEL record (autonomous or governed
    // user selection, DS-SEL-006) → Stage 5 screening trial → sweep minimum.
    let dia = strictNum('column_diameter_m', 'Stage 9 column diameter override')
      ?? (await getEffectiveDesignDiameterM(revisionId))
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

  // Governing-geometry change detection (mechanical): capture the previous
  // accepted snapshot BEFORE the upsert so reports can be reconciled when an
  // ordinary Stage 9 re-run (e.g. an explicit diameter override) changes the
  // geometry outside the DS-SEL-006 workflow.
  let prevMechGeometry: any = null;
  if (calculationType === 'mechanical_vessel' && calcResult.status !== 'error') {
    const prevQ = await pool.query(`SELECT data FROM design_software_results WHERE revision_id = $1 AND section = 'mechanical_vessel'`, [revisionId]);
    prevMechGeometry = prevQ.rows[0]?.data?.mechanicalDatasheet?.geometry ?? prevQ.rows[0]?.data?.geometry ?? null;
  }

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

  // Report reconciliation on governing-geometry change (mechanical): an
  // ordinary Stage 9 re-run that changes the governing geometry (diameter,
  // heights, thickness) must reconcile existing reports exactly like the
  // DS-SEL-006 workflow does — otherwise a previously issued datasheet could
  // stay live with the old geometry. Non-fatal for the run itself, but every
  // failure is logged loudly; the DS-SEL orchestrator's own final
  // reconciliation is idempotent over whatever this pass already did.
  if (calculationType === 'mechanical_vessel' && calcResult.status !== 'error') {
    const mechData: any = calcResult.data ?? {};
    const newGeo = mechData.mechanicalDatasheet?.geometry ?? mechData.geometry ?? null;
    const geoKey = (g: any) => g ? JSON.stringify([g.insideDiameter_m, g.tangentToTangent_m, g.overallHeight_m, g.straightShell_m, g.headType]) : null;
    if (prevMechGeometry && newGeo && geoKey(prevMechGeometry) !== geoKey(newGeo)) {
      try {
        const { reconcileReportsAfterDesignChange } = await import('./design-reports/report-service');
        await reconcileReportsAfterDesignChange(
          revisionId, userId,
          `Superseded by an accepted mechanical re-run that changed the governing geometry (inside diameter ${prevMechGeometry.insideDiameter_m} m → ${newGeo.insideDiameter_m} m).`);
      } catch (e: any) {
        console.error('[REPORTS] Reconciliation after mechanical geometry change FAILED — existing reports may show superseded geometry:', e?.message ?? e);
      }
    }
  }

  // DS-SEL — regenerate the autonomous design selection record whenever an
  // equipment run (C4/C5) completes with an accepted status. Non-fatal: a
  // selector failure never blocks the engine run that was just persisted.
  if (['ecp', 'ecr'].includes(calculationType) && calcResult.status !== 'error') {
    try {
      const { generateSelectionRecord } = await import('./design-selection/design-selection-service');
      await generateSelectionRecord(revisionId, userId);
    } catch (e: any) {
      console.error('[DS-SEL] Selection record regeneration failed (non-fatal):', e?.message ?? e);
    }
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

// ── Reference Papers (Step 15 — controlled literature library) ────────────────
// GLOBAL library: the single governed source for every LLX equation,
// correlation, assumption and report citation. Papers are never deleted —
// status moves to 'superseded'/'withdrawn' so existing citations stay
// resolvable.

const REF_CODE_RE = /^REF-\d{3,}$/;

export async function listReferencePapers() {
  const result = await pool.query(
    `SELECT p.*, u.username AS created_by_name
     FROM design_software_reference_papers p
     LEFT JOIN users u ON u.id = p.created_by
     ORDER BY p.ref_code ASC`,
  );
  return result.rows;
}

export async function createReferencePaper(input: {
  refCode: string; authors: string; organization?: string | null;
  title: string; publication: string; year: number; usedFor: string;
  notes?: string | null;
}, userId: number) {
  const refCode = String(input.refCode ?? '').trim().toUpperCase();
  if (!REF_CODE_RE.test(refCode)) throw new Error('Reference code must be of the form REF-NNN (e.g. REF-001)');
  for (const [k, label] of [['authors', 'Author(s)'], ['title', 'Title'], ['publication', 'Publication / venue'], ['usedFor', 'Used-for statement']] as const) {
    if (!String((input as any)[k] ?? '').trim()) throw new Error(`${label} is required`);
  }
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 1800 || year > 2200) throw new Error('A valid publication year is required');
  const result = await pool.query(
    `INSERT INTO design_software_reference_papers
       (ref_code, authors, organization, title, publication, year, used_for, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [refCode, input.authors.trim(), (input.organization ?? '').trim() || null,
     input.title.trim(), input.publication.trim(), year, input.usedFor.trim(),
     (input.notes ?? '').trim() || null, userId],
  );
  return result.rows[0];
}

export async function setReferencePaperDocument(id: number, filePath: string, fileName: string) {
  const result = await pool.query(
    `UPDATE design_software_reference_papers
     SET file_path = $1, file_name = $2, file_uploaded_at = NOW(), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [filePath, fileName, id],
  );
  if (result.rows.length === 0) throw new Error('Reference paper not found');
  return result.rows[0];
}

export async function updateReferencePaper(id: number, patch: {
  authors?: string; organization?: string | null; title?: string;
  publication?: string; year?: number; usedFor?: string;
  notes?: string | null; status?: string;
}) {
  // ref_code is immutable — it is the citation key used across the software.
  const sets: string[] = [];
  const vals: any[] = [];
  const push = (col: string, v: any) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (patch.authors !== undefined) { if (!patch.authors.trim()) throw new Error('Author(s) cannot be blank'); push('authors', patch.authors.trim()); }
  if (patch.organization !== undefined) push('organization', (patch.organization ?? '').trim() || null);
  if (patch.title !== undefined) { if (!patch.title.trim()) throw new Error('Title cannot be blank'); push('title', patch.title.trim()); }
  if (patch.publication !== undefined) { if (!patch.publication.trim()) throw new Error('Publication cannot be blank'); push('publication', patch.publication.trim()); }
  if (patch.year !== undefined) {
    const y = Number(patch.year);
    if (!Number.isInteger(y) || y < 1800 || y > 2200) throw new Error('A valid publication year is required');
    push('year', y);
  }
  if (patch.usedFor !== undefined) { if (!patch.usedFor.trim()) throw new Error('Used-for statement cannot be blank'); push('used_for', patch.usedFor.trim()); }
  if (patch.notes !== undefined) push('notes', (patch.notes ?? '').trim() || null);
  if (patch.status !== undefined) {
    if (!['active', 'superseded', 'withdrawn'].includes(patch.status)) throw new Error('Status must be active, superseded or withdrawn');
    // Controlled transitions: active → superseded/withdrawn; superseded →
    // active/withdrawn; withdrawn is TERMINAL (a withdrawn paper must be
    // re-registered under a new reference code if it is ever needed again).
    const cur = await pool.query(`SELECT status FROM design_software_reference_papers WHERE id = $1`, [id]);
    if (cur.rows.length === 0) throw new Error('Reference paper not found');
    const from = cur.rows[0].status;
    if (from === 'withdrawn' && patch.status !== 'withdrawn') {
      throw new Error('Withdrawn is terminal — register the paper again under a new reference code if required');
    }
    push('status', patch.status);
  }
  if (sets.length === 0) throw new Error('No fields to update');
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  const result = await pool.query(
    `UPDATE design_software_reference_papers SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
    vals,
  );
  if (result.rows.length === 0) throw new Error('Reference paper not found');
  return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CPS Sizing Tool — Knowledge Engine (Phase 1)
// GLOBAL controlled source of all CPS engineering parameters. Single source of
// truth: future sizing calculations must retrieve constants by parameter_code —
// never hard-code them. parameter_code is IMMUTABLE. NULL value = not yet
// defined; the system never substitutes a placeholder engineering value.
// Superuser authorization is enforced at the route layer for all writes.
// ═══════════════════════════════════════════════════════════════════════════════

const CPS_CATEGORIES = ['media_column', 'material_properties', 'heating_cooling', 'process_cutoff', 'process_times', 'regeneration_recovery', 'standard_equipment', 'regen_offgas_tox', 'sulphur_breakthrough_model'];
const CPS_PARAM_TYPES = ['performance', 'physical_constant', 'process_threshold', 'process_time', 'equipment_standard', 'calibrated_model_constant'];
const CPS_CODE_RE = /^[A-Z][A-Z0-9_]{1,59}$/;

export async function listCpsParameters(category?: string) {
  if (category !== undefined && !CPS_CATEGORIES.includes(category)) throw new Error('Unknown CPS parameter category');
  const result = await pool.query(
    `SELECT p.*, u.username AS updated_by_name
     FROM cps_knowledge_parameters p
     LEFT JOIN users u ON u.id = p.updated_by
     ${category ? 'WHERE p.category = $1' : ''}
     ORDER BY p.category, p.display_order, p.parameter_name`,
    category ? [category] : [],
  );
  return result.rows;
}

function parseCpsValue(raw: any): string | null {
  // NULL/'' means "not yet defined" — stored as NULL, never a placeholder.
  // Values are kept as decimal STRINGS end-to-end (never JS floats) so
  // PostgreSQL NUMERIC precision is preserved exactly.
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
    throw new Error('Value must be a number, or blank for "not yet defined"');
  }
  return s;
}

export async function createCpsParameter(input: {
  category: string; parameterName: string; parameterCode: string; symbol?: string | null;
  parameterType: string; value?: number | string | null; unit?: string | null;
  description?: string | null; engineeringNotes?: string | null; displayOrder?: number;
}, userId: number) {
  if (!CPS_CATEGORIES.includes(input.category)) throw new Error('Unknown CPS parameter category');
  if (!CPS_PARAM_TYPES.includes(input.parameterType)) throw new Error('Unknown parameter type');
  const code = String(input.parameterCode ?? '').trim().toUpperCase();
  if (!CPS_CODE_RE.test(code)) throw new Error('Parameter code must be UPPER_SNAKE_CASE (letters, digits, underscores; starts with a letter)');
  if (!String(input.parameterName ?? '').trim()) throw new Error('Parameter name is required');
  const value = parseCpsValue(input.value);
  const result = await pool.query(
    `INSERT INTO cps_knowledge_parameters
       (category, parameter_name, parameter_code, symbol, parameter_type, value, unit, description, engineering_notes, display_order, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     RETURNING *`,
    [input.category, input.parameterName.trim(), code, (input.symbol ?? '').trim() || null,
     input.parameterType, value, (input.unit ?? '').trim() || null,
     (input.description ?? '').trim() || null, (input.engineeringNotes ?? '').trim() || null,
     Number(input.displayOrder) || 0, userId],
  );
  return result.rows[0];
}

// Manual source parameters that trigger derived-parameter recalculation.
// Tier-1 sources drive OIL_RETAINED_PER_COL.
// OIL_BURNED_REGEN drives the Tier-2 split only (not Tier 1).
const DERIVED_OIL_RETAINED_SOURCES = ['COL_INTERNAL_VOL', 'MEDIA_VOID_FRACTION', 'BASE_OIL_SG'];
const ALL_DERIVED_TRIGGER_SOURCES = [...DERIVED_OIL_RETAINED_SOURCES, 'OIL_BURNED_REGEN'];

// Helper: write a derived-param value + history entry if the value actually changed.
async function _writeDerivedIfChanged(
  client: any, userId: number,
  code: string, newValue: string,
) {
  const cur = await client.query(
    `SELECT id, value FROM cps_knowledge_parameters WHERE parameter_code = $1 FOR UPDATE`,
    [code],
  );
  if (cur.rows.length === 0) return;
  const { id, value: oldValue } = cur.rows[0];
  const chk = await client.query(
    `SELECT ($1::numeric IS DISTINCT FROM $2::numeric) AS changed`, [oldValue, newValue],
  );
  if (!chk.rows[0].changed) return;
  await client.query(
    `UPDATE cps_knowledge_parameters SET value = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3`,
    [newValue, userId, id],
  );
  await client.query(
    `INSERT INTO cps_knowledge_parameter_history (parameter_id, parameter_code, old_value, new_value, changed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, code, oldValue, newValue, userId],
  );
}

// Full two-tier derived-parameter recalculation. Runs within an open client
// transaction immediately after any manual-source value change.
//
// Tier 1 — OIL_RETAINED_PER_COL:
//   COL_INTERNAL_VOL × MEDIA_VOID_FRACTION × BASE_OIL_SG  (kg/column)
//   Skipped when recalcTier1 = false (e.g. only OIL_BURNED_REGEN changed).
//
// Tier 2 — Regeneration split (derived from Tier-1 result + OIL_BURNED_REGEN):
//   OIL_RECOVERED_VACUUM = (retained − burned) / 2
//   BLACK_OIL_PER_COL    = (retained − burned) / 2
//   OIL_RECOVERED_REGEN  = 0  (by design)
//
// Fails open: if any required source is NULL/undefined, the dependent derived
// value is left at its last good stored value rather than being zeroed.
async function recalculateDerivedParams(
  client: any, userId: number, recalcTier1 = true,
) {
  // ── Tier 1: OIL_RETAINED_PER_COL ─────────────────────────────────────────
  if (recalcTier1) {
    const src = await client.query(
      `SELECT parameter_code, value FROM cps_knowledge_parameters
       WHERE parameter_code = ANY($1::text[]) AND is_active = true`,
      [DERIVED_OIL_RETAINED_SOURCES],
    );
    const m: Record<string, string | null> = {};
    for (const r of src.rows) m[r.parameter_code] = r.value;
    const colVol  = m['COL_INTERNAL_VOL'];
    const voidFrac = m['MEDIA_VOID_FRACTION'];
    const sg       = m['BASE_OIL_SG'];
    if (colVol != null && voidFrac != null && sg != null) {
      const retained = String(parseFloat(colVol) * parseFloat(voidFrac) * parseFloat(sg));
      await _writeDerivedIfChanged(client, userId, 'OIL_RETAINED_PER_COL', retained);
    }
  }

  // ── Tier 2: Regeneration split ────────────────────────────────────────────
  // Read the (possibly just-updated) retained value and OIL_BURNED_REGEN.
  const t2src = await client.query(
    `SELECT parameter_code, value FROM cps_knowledge_parameters
     WHERE parameter_code IN ('OIL_RETAINED_PER_COL', 'OIL_BURNED_REGEN')`,
  );
  const t2: Record<string, string | null> = {};
  for (const r of t2src.rows) t2[r.parameter_code] = r.value;
  const retained = t2['OIL_RETAINED_PER_COL'];
  const burned   = t2['OIL_BURNED_REGEN'];
  if (retained != null && burned != null) {
    const remaining  = parseFloat(retained) - parseFloat(burned);
    const twoThirds  = String((remaining / 3) * 2);   // full JS precision — no rounding
    const oneThird   = String(remaining / 3);
    await _writeDerivedIfChanged(client, userId, 'OIL_RECOVERED_VACUUM', twoThirds);
    await _writeDerivedIfChanged(client, userId, 'BLACK_OIL_PER_COL',    oneThird);
    await _writeDerivedIfChanged(client, userId, 'OIL_RECOVERED_REGEN',  '0');
  }
}

export async function updateCpsParameter(id: number, patch: {
  category?: string; parameterName?: string; symbol?: string | null; parameterType?: string;
  value?: number | string | null; unit?: string | null; description?: string | null;
  engineeringNotes?: string | null; displayOrder?: number; isActive?: boolean;
  changeReason?: string;
}, userId: number) {
  // parameter_code is IMMUTABLE — future calculation code depends on it.
  if ('parameterCode' in patch) throw new Error('Parameter code is immutable after creation');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM cps_knowledge_parameters WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) throw new Error('Parameter not found');
    const existing = cur.rows[0];

    // Derived parameters: block all direct value writes (any user, any role).
    if (existing.is_derived && 'value' in patch) {
      throw new Error(
        `${existing.parameter_code} is auto-calculated from ${existing.derived_formula ?? 'source parameters'} and cannot be manually edited.`
      );
    }

    const sets: string[] = [];
    const vals: any[] = [];
    const push = (col: string, v: any) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };

    if (patch.category !== undefined) { if (!CPS_CATEGORIES.includes(patch.category)) throw new Error('Unknown CPS parameter category'); push('category', patch.category); }
    if (patch.parameterName !== undefined) { if (!patch.parameterName.trim()) throw new Error('Parameter name cannot be blank'); push('parameter_name', patch.parameterName.trim()); }
    if (patch.symbol !== undefined) push('symbol', (patch.symbol ?? '').trim() || null);
    if (patch.parameterType !== undefined) { if (!CPS_PARAM_TYPES.includes(patch.parameterType)) throw new Error('Unknown parameter type'); push('parameter_type', patch.parameterType); }
    if (patch.unit !== undefined) push('unit', (patch.unit ?? '').trim() || null);
    if (patch.description !== undefined) push('description', (patch.description ?? '').trim() || null);
    if (patch.engineeringNotes !== undefined) push('engineering_notes', (patch.engineeringNotes ?? '').trim() || null);
    if (patch.displayOrder !== undefined) push('display_order', Number(patch.displayOrder) || 0);
    if (patch.isActive !== undefined) push('is_active', !!patch.isActive);

    let valueChanged = false;
    let newValue: string | null = null;
    if ('value' in patch) {
      newValue = parseCpsValue(patch.value);
      // Exact-decimal comparison done by PostgreSQL NUMERIC — never JS floats,
      // so distinct high-precision decimals are never collapsed/missed.
      const cmp = await client.query(
        `SELECT ($1::numeric IS DISTINCT FROM $2::numeric) AS changed`,
        [existing.value, newValue],
      );
      valueChanged = cmp.rows[0].changed === true;
      if (valueChanged) push('value', newValue);
    }

    if (sets.length === 0) throw new Error('No fields to update');
    push('updated_by', userId);
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    const result = await client.query(
      `UPDATE cps_knowledge_parameters SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals,
    );

    // Change history: automatic, same transaction, whenever the value changes.
    if (valueChanged) {
      await client.query(
        `INSERT INTO cps_knowledge_parameter_history (parameter_id, parameter_code, old_value, new_value, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, existing.parameter_code, existing.value, newValue, userId],
      );
    }

    // If a source parameter changed, recalculate derived params in the same transaction.
    // Tier-1 sources (COL_INTERNAL_VOL, MEDIA_VOID_FRACTION, BASE_OIL_SG) trigger both tiers.
    // OIL_BURNED_REGEN triggers only Tier 2 (split calculation — retained value unchanged).
    if (valueChanged && ALL_DERIVED_TRIGGER_SOURCES.includes(existing.parameter_code)) {
      const recalcTier1 = DERIVED_OIL_RETAINED_SOURCES.includes(existing.parameter_code);
      await recalculateDerivedParams(client, userId, recalcTier1);
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function listCpsParameterHistory(parameterId: number) {
  const result = await pool.query(
    `SELECT h.*, u.username AS changed_by_name
     FROM cps_knowledge_parameter_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.parameter_id = $1
     ORDER BY h.changed_at DESC, h.id DESC`,
    [parameterId],
  );
  return result.rows;
}

// ── CPS Sizing Tool — Customer Input cases (definition approved; NO sizing logic) ──
// Server-side conditional validation is authoritative: colour-only cases must
// store NULL sulphur (never 0); sulphur cases require both sulphur fields.
const CPS_TREATMENT_SCOPES = ['COLOUR_ODOR', 'COLOUR_ODOR_SULPHUR'];

// Parse + require a FINITE number for validation comparisons. parseCpsValue
// already enforces decimal-string format; this additionally rejects values so
// large they lose finite semantics in JS (e.g. 1e400 → Infinity), which would
// defeat the ordering / positivity checks below.
function parseFiniteCpsValue(raw: any, label: string): string | null {
  const s = parseCpsValue(raw);
  if (s !== null && !isFinite(Number(s))) throw new Error(`${label} is out of the accepted numeric range`);
  return s;
}

function validateCpsSizingInput(input: {
  customerId?: number | null; customerName?: string; plantLocation?: string;
  cpsFeedCapacity?: number | string; rrboGrade?: string; feedOilVisc40c?: number | string;
  treatmentScope?: string; inletColour?: number | string; targetColour?: number | string;
  inletSulphur?: number | string | null; targetSulphur?: number | string | null;
}) {
  const customerName = (input.customerName ?? '').trim();
  if (!customerName) throw new Error('Customer name is required');
  const plantLocation = (input.plantLocation ?? '').trim();
  if (!plantLocation) throw new Error('Project / plant location is required');

  const capacity = parseFiniteCpsValue(input.cpsFeedCapacity, 'Required CPS capacity');
  if (capacity === null || Number(capacity) <= 0) throw new Error('Required CPS capacity (L/h) must be a positive number');

  const rrboGrade = (input.rrboGrade ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  const gradeMatch = rrboGrade.match(/^SN ?(\d{2,3})$/);
  if (!gradeMatch) throw new Error('RRBO grade must be in the form "SN <number>" (SN 80 – SN 500)');
  const gradeNum = Number(gradeMatch[1]);
  if (gradeNum < 80 || gradeNum > 500) throw new Error('RRBO grade must be between SN 80 and SN 500');
  const normalizedGrade = `SN ${gradeNum}`;

  const viscosity = parseFiniteCpsValue(input.feedOilVisc40c, 'Feed oil viscosity');
  if (viscosity === null || Number(viscosity) <= 0) throw new Error('Feed oil viscosity @ 40°C (cSt) must be a positive number');

  const scope = input.treatmentScope ?? '';
  if (!CPS_TREATMENT_SCOPES.includes(scope)) throw new Error('Required treatment must be Colour & Odor Improvement or Colour, Odor & Sulphur Improvement');

  const inletColour = parseFiniteCpsValue(input.inletColour, 'Inlet ASTM colour');
  if (inletColour === null || Number(inletColour) < 0) throw new Error('Inlet ASTM colour is required and cannot be negative');
  const targetColour = parseFiniteCpsValue(input.targetColour, 'Expected outlet ASTM colour');
  if (targetColour === null || Number(targetColour) < 0) throw new Error('Expected outlet ASTM colour is required and cannot be negative');
  if (Number(targetColour) >= Number(inletColour)) throw new Error('Expected outlet colour must be better (lower) than inlet colour');

  let inletSulphur: string | null = null;
  let targetSulphur: string | null = null;
  if (scope === 'COLOUR_ODOR_SULPHUR') {
    inletSulphur = parseFiniteCpsValue(input.inletSulphur, 'Inlet sulphur');
    if (inletSulphur === null || Number(inletSulphur) <= 0) throw new Error('Inlet sulphur (ppm) is required for sulphur treatment scope');
    targetSulphur = parseFiniteCpsValue(input.targetSulphur, 'Expected outlet sulphur');
    if (targetSulphur === null || Number(targetSulphur) < 0) throw new Error('Expected outlet sulphur (ppm) is required for sulphur treatment scope');
    if (Number(targetSulphur) >= Number(inletSulphur)) throw new Error('Expected outlet sulphur must be lower than inlet sulphur');
  } else if (input.inletSulphur != null || input.targetSulphur != null) {
    throw new Error('Sulphur inputs are not allowed for the Colour & Odor Improvement scope');
  }

  return {
    customerId: input.customerId ?? null, customerName, plantLocation,
    cpsFeedCapacity: capacity, rrboGrade: normalizedGrade, feedOilVisc40c: viscosity,
    treatmentScope: scope, inletColour, targetColour, inletSulphur, targetSulphur,
  };
}

export async function listCpsSizingCases() {
  const result = await pool.query(
    `SELECT c.*, u.username AS created_by_name, u2.username AS updated_by_name
     FROM cps_sizing_cases c
     LEFT JOIN users u ON u.id = c.created_by
     LEFT JOIN users u2 ON u2.id = c.updated_by
     ORDER BY c.updated_at DESC, c.id DESC`,
  );
  return result.rows;
}

export async function getCpsSizingCase(id: number) {
  const result = await pool.query(`SELECT * FROM cps_sizing_cases WHERE id = $1`, [id]);
  if (result.rows.length === 0) throw new Error('Sizing case not found');
  return result.rows[0];
}

export async function createCpsSizingCase(input: Parameters<typeof validateCpsSizingInput>[0], userId: number) {
  const v = validateCpsSizingInput(input);
  const result = await pool.query(
    `INSERT INTO cps_sizing_cases
       (customer_id, customer_name, plant_location, cps_feed_capacity, rrbo_grade, feed_oil_visc_40c,
        treatment_scope, inlet_colour, target_colour, inlet_sulphur, target_sulphur, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
    [v.customerId, v.customerName, v.plantLocation, v.cpsFeedCapacity, v.rrboGrade, v.feedOilVisc40c,
     v.treatmentScope, v.inletColour, v.targetColour, v.inletSulphur, v.targetSulphur, userId],
  );
  return result.rows[0];
}

export async function updateCpsSizingCase(id: number, input: Parameters<typeof validateCpsSizingInput>[0], userId: number) {
  // Whole-record validation (not field patching): the conditional sulphur rules
  // only make sense against the full submitted input set.
  // Sets calculation_stale = TRUE so the UI can warn that the saved result may
  // no longer reflect the current inputs.  ke_snapshot and calculated_output are
  // intentionally preserved — the previous successful result remains readable.
  const v = validateCpsSizingInput(input);
  const result = await pool.query(
    `UPDATE cps_sizing_cases SET
       customer_id = $1, customer_name = $2, plant_location = $3, cps_feed_capacity = $4,
       rrbo_grade = $5, feed_oil_visc_40c = $6, treatment_scope = $7, inlet_colour = $8,
       target_colour = $9, inlet_sulphur = $10, target_sulphur = $11,
       calculation_stale = TRUE, updated_by = $12, updated_at = NOW()
     WHERE id = $13 RETURNING *`,
    [v.customerId, v.customerName, v.plantLocation, v.cpsFeedCapacity, v.rrboGrade, v.feedOilVisc40c,
     v.treatmentScope, v.inletColour, v.targetColour, v.inletSulphur, v.targetSulphur, userId, id],
  );
  if (result.rows.length === 0) throw new Error('Sizing case not found');
  return result.rows[0];
}

export async function deleteCpsSizingCase(id: number) {
  const result = await pool.query(`DELETE FROM cps_sizing_cases WHERE id = $1 RETURNING id`, [id]);
  if (result.rows.length === 0) throw new Error('Sizing case not found');
  return { id: result.rows[0].id };
}

// ── CPS Sizing — KE snapshot + calculated output update ──────────────────────
// updateCpsSizingCaseKeSnapshot — called by the client after every successful
// Output Sizing recalculation.  Atomically replaces:
//   cps_sizing_cases.ke_snapshot      — branch-specific KE parameter set
//   cps_sizing_cases.calculated_output — serialised BuildRowsResult + inputs
//   cps_sizing_cases.calculation_stale — reset to FALSE
// Failed calculations must never call this — the client enforces this.
// Both columns are written in ONE UPDATE statement; they are committed together
// or not at all.
const VALID_CALC_SCOPES = ['COLOUR_ODOR', 'COLOUR_ODOR_SULPHUR'] as const;

export async function updateCpsSizingCaseKeSnapshot(
  sizingCaseId: number,
  treatmentScope: string,
  keSnapshot: object,
  calculatedOutput: object,
  userId: number,
): Promise<{ sizingCaseId: number }> {
  if (!VALID_CALC_SCOPES.includes(treatmentScope as any))
    throw new Error('Invalid treatment_scope for KE snapshot');

  const result = await pool.query(
    `UPDATE cps_sizing_cases
     SET ke_snapshot       = $1,
         calculated_output = $2,
         calculation_stale = FALSE,
         updated_at        = NOW(),
         updated_by        = $3
     WHERE id = $4 RETURNING id`,
    [JSON.stringify(keSnapshot), JSON.stringify(calculatedOutput), userId, sizingCaseId],
  );
  if (result.rows.length === 0) throw new Error('Sizing case not found');
  return { sizingCaseId };
}
