import { createHash } from 'node:crypto';
import { pool } from '../db';
import { loadStage4PrePilotSizingAuthority } from './stage4-pre-pilot-sizing-service';
import { STAGE5_INPUT_FIELDS, type Stage5Basis, type Stage5Inputs } from '../../shared/ecr-stage5-geometry';
import { buildStage5R1Geometry, R1_RULES_MANIFEST, R2_RULES_MANIFEST, R2_RULESET } from '../../shared/ecr-stage5-r1';
import { renderStage5Svg, type Stage5DrawingView } from '../../shared/ecr-stage5-drawings';

export const STAGE5_VIEWS: Stage5DrawingView[] = ['ga', 'section', 'compartment', 'rotor', 'stator'];
export class Stage5Error extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
/** JSONB reorders object keys: integrity must be independent of insertion order. */
export function stage5Hash(value: unknown): string {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
/** Missing or malformed governing authority is an upstream error, never a
 * Stage-5 engineering TBD. Only optional engineering inputs may remain TBD. */
export function validateStage5Basis(basis: Stage5Basis): void {
  const positiveKeys = [
    'columnDiameterM', 'compartmentHeightM', 'rotorDiameterRatio', 'rotorDiameterM',
    'statorFreeAreaRatio', 'selectedRpm', 'rpmMin', 'rpmMax', 'compartmentCount',
    'requiredActiveHeightM', 'installedActiveHeightM', 'designNt',
  ] as const;
  const validId = (id: unknown) => (typeof id === 'string' && /^[1-9]\d*$/.test(id))
    || (typeof id === 'number' && Number.isSafeInteger(id) && id > 0);
  if (!basis || !positiveKeys.every(key => typeof basis[key] === 'number'
      && Number.isFinite(basis[key]) && basis[key]! > 0)
    || !validId(basis.stage3ResultId) || !validId(basis.stage4ResultId)
    || basis.sourcesCurrent !== true || basis.sourcesCompatible !== true
    || typeof basis.phaseConfiguration !== 'string' || !basis.phaseConfiguration.trim()
    || !Number.isSafeInteger(basis.compartmentCount)
    || basis.rotorDiameterRatio! >= 1 || basis.statorFreeAreaRatio! >= 1
    || basis.rpmMin! > basis.selectedRpm! || basis.rpmMax! < basis.selectedRpm!
    || basis.designNt !== 7)
    throw new Stage5Error('STAGE5_GOVERNING_BASIS_INVALID');
  const efficiencySizing = basis.sizingMethod === 'ADOPTED_COMPARTMENT_EFFICIENCY';
  if (efficiencySizing) {
    if (basis.designCompartmentEfficiency !== .4
      || typeof basis.impliedInstalledHetsMPerTheoreticalStage !== 'number'
      || !Number.isFinite(basis.impliedInstalledHetsMPerTheoreticalStage)
      || basis.impliedInstalledHetsMPerTheoreticalStage <= 0
      || basis.compartmentCount !== Math.ceil(basis.designNt! / basis.designCompartmentEfficiency)
      || Math.abs(basis.requiredActiveHeightM! - basis.installedActiveHeightM!) > 1e-9
      || Math.abs(basis.installedActiveHeightM! - basis.compartmentCount! * basis.compartmentHeightM!) > 1e-9
      || Math.abs(basis.impliedInstalledHetsMPerTheoreticalStage
        - basis.installedActiveHeightM! / basis.designNt!) > 1e-9)
      throw new Stage5Error('STAGE5_GOVERNING_BASIS_INVALID');
  } else if ((basis.sizingMethod != null && basis.sizingMethod !== 'LEGACY_HETS_SCREENING')
    || typeof basis.hetsM !== 'number' || !Number.isFinite(basis.hetsM) || basis.hetsM <= 0) {
    throw new Stage5Error('STAGE5_GOVERNING_BASIS_INVALID');
  }
}
export function validateStage5Inputs(input: any): Stage5Inputs {
  const fail = () => { throw new Stage5Error('STAGE5_INVALID_INPUTS', 400); };
  const text = (v: unknown) => typeof v === 'string' && v.length <= 10000;
  const number = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));
  const classification = (v: unknown) => v === 'Engineer-entered' || v === 'Assumed';
  if (!input || !input.values || !Array.isArray(input.nozzles) || input.nozzles.length > 100 || !text(input.notes)) fail();
  if (![null, undefined, 'flat-blade-turbine', 'flat-disc'].includes(input.rotorConstruction)
    || ![null, undefined, 'annular-single-opening'].includes(input.statorConstruction)) fail();
  if (![null, undefined, 'nmp-down-rrbo-up', 'nmp-up-rrbo-down'].includes(input.flowArrangement)
    || (input.flowClassification !== undefined && !classification(input.flowClassification))
    || (input.flowNote !== undefined && !text(input.flowNote))
    || ![null, undefined, 'elliptical-envelope', 'flat-envelope'].includes(input.topHeadProfile)
    || ![null, undefined, 'elliptical-envelope', 'flat-envelope'].includes(input.bottomHeadProfile)) fail();
  if (Object.keys(input).some(k => !['values', 'nozzles', 'notes', 'rotorConstruction', 'statorConstruction',
    'flowArrangement', 'flowClassification', 'flowNote', 'topHeadProfile', 'bottomHeadProfile'].includes(k))
    || Object.keys(input.values).some(k => !STAGE5_INPUT_FIELDS.some(f => f.key === k))) fail();
  for (const { key } of STAGE5_INPUT_FIELDS) {
    const v = input.values[key];
    if (!v || !number(v.value) || !classification(v.classification) || !text(v.note)) fail();
  }
  const ids = new Set();
  for (const n of input.nozzles) {
    if (!n || !text(n.id) || !n.id || ids.has(n.id) || !text(n.service)
      || !['bottom', 'active', 'top'].includes(n.region) || !number(n.elevationM)
      || !number(n.boreM) || !number(n.azimuthDeg) || !classification(n.classification) || !text(n.note)) fail();
    ids.add(n.id);
  }
  return JSON.parse(JSON.stringify(input));
}

type QueryClient = { query: (...args: any[]) => Promise<any> };
async function owned(client: QueryClient, userId: number, designId: number) {
  const result = await client.query('SELECT id FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2 FOR UPDATE', [designId, userId]);
  if (!result.rows.length) throw new Stage5Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND', 404);
}
/** Existing upstream writers do not acquire a Stage-5 advisory lock. SHARE locks
 * therefore also prevent source inserts/updates during the authoritative handoff.
 * The owner row serializes revision allocation and protects Stage-1 edits.
 * No scientific calculation, optimizer creation or lifecycle GET is invoked. */
async function scoped<T>(userId: number, designId: number, fn: (client: QueryClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    await owned(client, userId, designId);
    await client.query(`LOCK TABLE ecr_pre_pilot_predictive_nt_jobs,
      ecr_pre_pilot_kuhni_geometry_resolver_runs,
      ecr_pre_pilot_stage4_physical_sizing_calculations IN SHARE MODE`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export async function loadStage5Basis(client: QueryClient, userId: number, designId: number) {
  const authority = await loadStage4PrePilotSizingAuthority(userId, designId, { ensureCurrentOptimizer: false });
  const rows = await client.query(`SELECT id::text,result_snapshot,stage3_run_id,stage3_immutable_hash,status
    FROM ecr_pre_pilot_stage4_physical_sizing_calculations
    WHERE design_id=$1 AND created_by=$2 AND lineage_hash=$3`, [designId, userId, authority.lineageHash]);
  const row = rows.rows[0];
  if (!row || row.status !== 'CALCULATED') throw new Stage5Error('STAGE5_SAVED_CURRENT_STAGE4_REQUIRED');
  const { calculationModel, ...savedProjection } = row.result_snapshot ?? {};
  if (!authority?.projection?.implementation || !authority?.solverInput)
    throw new Stage5Error('STAGE5_GOVERNING_BASIS_INVALID');
  if (stage5Hash(savedProjection) !== stage5Hash(authority.projection)
    || calculationModel !== authority.projection.implementation.version
    || String(row.stage3_run_id) !== authority.solverInput.stage3RunId
    || row.stage3_immutable_hash !== authority.solverInput.stage3ImmutableHash)
    throw new Stage5Error('STAGE5_SOURCE_INCOMPATIBLE');
  const stage3Rows = await client.query(`SELECT id::text,immutable_hash,result_snapshot
    FROM ecr_pre_pilot_kuhni_geometry_resolver_runs WHERE id=$1 AND design_id=$2 AND created_by=$3`,
  [row.stage3_run_id, designId, userId]);
  const stage3 = stage3Rows.rows[0];
  if (!stage3 || stage3.immutable_hash !== row.stage3_immutable_hash) throw new Stage5Error('STAGE5_SOURCE_INCOMPATIBLE');
  const sourceStage3 = { id: stage3.id, immutableHash: stage3.immutable_hash, result: stage3.result_snapshot };
  const sourceStage4 = { id: row.id, lineageHash: authority.lineageHash, result: row.result_snapshot };
  const sourceHash = stage5Hash({ sourceStage3, sourceStage4 });
  const h = row.result_snapshot.selectedStage3Hydraulics;
  const s = row.result_snapshot.hetsSizing;
  const w = stage3.result_snapshot?.selectedOperatingWindow;
  if (!h || typeof h !== 'object' || !s || typeof s !== 'object' || !w || typeof w !== 'object')
    throw new Stage5Error('STAGE5_GOVERNING_BASIS_INVALID');
  const efficiencySizing = s.sizingMethod === 'ADOPTED_COMPARTMENT_EFFICIENCY';
  const basis: Stage5Basis & { sourceHash: string } = {
    sourceHash, stage3ResultId: stage3.id, stage4ResultId: row.id, sourcesCurrent: true, sourcesCompatible: true,
    columnDiameterM: h.diameterM, compartmentHeightM: h.compartmentHeightM,
    rotorDiameterRatio: h.rotorToColumn, rotorDiameterM: h.rotorDiameterM,
    statorFreeAreaRatio: h.freeArea, selectedRpm: h.selectedRpm,
    rpmMin: w?.rpmMin ?? null, rpmMax: w?.rpmMax ?? null, phaseConfiguration: h.orientation,
    compartmentCount: s.requiredPhysicalCompartments, requiredActiveHeightM: s.requiredActiveHeightM,
    installedActiveHeightM: s.installedActiveHeightM, designNt: s.fixedDesignTheoreticalStages,
    ...(efficiencySizing ? {} : { hetsM: s.screeningHetsMPerTheoreticalStage }),
    sizingMethod: efficiencySizing ? 'ADOPTED_COMPARTMENT_EFFICIENCY' : 'LEGACY_HETS_SCREENING',
    designCompartmentEfficiency: efficiencySizing ? s.designCompartmentEfficiency : null,
    impliedInstalledHetsMPerTheoreticalStage: efficiencySizing
      ? s.impliedInstalledHetsMPerTheoreticalStage : null,
  };
  validateStage5Basis(basis);
  return { basis, sourceStage3, sourceStage4, sourceHash };
}
export const getStage5Basis = (u: number, d: number) => scoped(u, d, c => loadStage5Basis(c, u, d));
export function rejectStage5ConstructionOverrides(input: unknown) {
  if (input !== undefined) throw new Stage5Error('STAGE5_R1_CONSTRUCTION_OVERRIDES_FORBIDDEN', 400);
}
export const previewStage5 = (u: number, d: number, input?: unknown) => {
  rejectStage5ConstructionOverrides(input);
  return scoped(u, d, async c => buildStage5R1Geometry((await loadStage5Basis(c, u, d)).basis));
};

export function verifyStage5Snapshot(row: any) {
  if (stage5Hash(row.snapshot) !== row.immutable_hash || row.snapshot.sourceHash !== row.source_hash
    || stage5Hash({ sourceStage3: row.snapshot.sourceStage3, sourceStage4: row.snapshot.sourceStage4 }) !== row.source_hash)
    throw new Stage5Error('STAGE5_IMMUTABLE_SNAPSHOT_INTEGRITY_FAILURE');
  if (row.snapshot.ruleset || row.snapshot.geometry?.ruleset) {
    if (row.snapshot.ruleset !== row.snapshot.geometry?.ruleset
      || row.snapshot.geometryHash !== stage5Hash(row.snapshot.geometry)
      || !row.snapshot.rulesManifest || row.snapshot.rulesManifest.id !== row.snapshot.ruleset
      || row.snapshot.rulesManifestHash !== stage5Hash(row.snapshot.rulesManifest))
      throw new Stage5Error('STAGE5_R1_DATASET_MANIFEST_INTEGRITY_FAILURE');
  }
  return row.snapshot;
}
export function stage5Currentness(sourceHash: string, currentHash: string | null, revision: number, latest: number) {
  return sourceHash !== currentHash ? 'OUTDATED' : revision < latest ? 'SUPERSEDED' : 'CURRENT';
}
function record(row: any, currentHash: string | null, latest: number) {
  const snapshot = verifyStage5Snapshot(row);
  return { ...snapshot, id: String(row.id), revision: row.revision, createdAt: row.created_at,
    currentness: stage5Currentness(row.source_hash, currentHash, row.revision, latest) };
}
export async function saveStage5Revision(u: number, d: number, input: unknown, expectedSourceHash: unknown, notes = '') {
  if (typeof expectedSourceHash !== 'string' || !expectedSourceHash) throw new Stage5Error('STAGE5_EXPECTED_SOURCE_HASH_REQUIRED', 400);
  if (typeof notes !== 'string' || notes.length > 10000) throw new Stage5Error('STAGE5_INVALID_NOTES', 400);
  rejectStage5ConstructionOverrides(input);
  return scoped(u, d, async c => {
    const source = await loadStage5Basis(c, u, d);
    if (expectedSourceHash !== source.sourceHash) throw new Stage5Error('STAGE5_SOURCE_CHANGED');
    const geometry = buildStage5R1Geometry(source.basis);
    const rulesManifest = geometry.ruleset === R2_RULESET ? R2_RULES_MANIFEST : R1_RULES_MANIFEST;
    const snapshot = JSON.parse(JSON.stringify({ inputs: geometry.inputs, geometry, ruleset: geometry.ruleset,
      rulesManifest, rulesManifestHash: stage5Hash(rulesManifest),
      geometryHash: stage5Hash(geometry), sourceStage3: source.sourceStage3,
      sourceStage4: source.sourceStage4, sourceHash: source.sourceHash, notes,
      status: geometry.completionStatement,
      drawings: Object.fromEntries(STAGE5_VIEWS.map(view => [view, renderStage5Svg(geometry, view)])) }));
    const inserted = await c.query(`INSERT INTO ecr_pre_pilot_stage5_geometry_revisions
      (design_id,created_by,revision,source_hash,immutable_hash,snapshot)
      SELECT $1,$2,COALESCE(MAX(revision),0)+1,$3,$4,$5 FROM ecr_pre_pilot_stage5_geometry_revisions
      WHERE design_id=$1 AND created_by=$2 RETURNING *`,
    [d, u, source.sourceHash, stage5Hash(snapshot), snapshot]);
    return record(inserted.rows[0], source.sourceHash, inserted.rows[0].revision);
  });
}
export async function getStage5Revisions(u: number, d: number, id?: string) {
  return scoped(u, d, async c => {
    const rows = await c.query(`SELECT * FROM ecr_pre_pilot_stage5_geometry_revisions
      WHERE design_id=$1 AND created_by=$2 ORDER BY revision DESC`, [d, u]);
    if (id && !rows.rows.some((r: any) => String(r.id) === id)) throw new Stage5Error('STAGE5_REVISION_NOT_FOUND', 404);
    let currentHash: string | null = null;
    try { currentHash = (await loadStage5Basis(c, u, d)).sourceHash; }
    catch (error) {
      // Historical packages remain exportable if their source is no longer current.
      // Database/runtime failures must not be disguised as an outdated source.
      if (!(error instanceof Error) || !/^(STAGE4_|STAGE5_SOURCE_|STAGE5_SAVED_|STAGE5_GOVERNING_|STAGE1_|INVALID_STAGE1_|ECR_PRE_PILOT_STAGE1)/.test(error.message)) throw error;
    }
    const latest = rows.rows.find((r: any) => r.source_hash === currentHash)?.revision ?? 0;
    return rows.rows.filter((r: any) => !id || String(r.id) === id).map((r: any) => record(r, currentHash, latest));
  });
}