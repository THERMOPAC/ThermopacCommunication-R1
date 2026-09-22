import { pool } from "../db";
import { validateStage1Snapshot } from "./stage1";
import { getStage5Revisions, stage5Hash, Stage5Error, scoped } from "./stage5-geometry-service";
import { calculateEndSections, END_SECTION_RULESET, type EndSelections } from "../../shared/ecr-stage5-end-sections";
import { validatePersistedStage2HetsAuthority } from "./stage4-pre-pilot-sizing-service";

/** Read ONLY the Stage-2 identity carried by this frozen Stage-4 snapshot.
 * The existing contract is explicitly AVAILABLE_REFERENCE_ONLY and its streams
 * have component masses/moles, not qualified product volumetric rates/densities.
 * It supplies neither an end-duty trial selection nor product-density authority.
 * Never select latest job, N4 or N7, scale a partition, or use inlet density as
 * product density. There is currently no admitted normal-product source adapter. */
async function inspectNormalProductAuthority(client: { query: (...args: any[]) => Promise<any> }, user: number, design: number, active: any, snapshot: Parameters<typeof validatePersistedStage2HetsAuthority>[1]) {
  const reference = active.sourceStage4?.result?.actualStage2NtReference;
  const holds = ["NORMAL_END_DUTY_PRODUCT_TRIAL_NOT_DESIGNATED", "NORMAL_PRODUCT_PHASE_DENSITIES_NOT_QUALIFIED"];
  if (!reference?.stage2JobId) return { status: "NORMAL_PRODUCT_AUTHORITY_UNAVAILABLE",
    reference: null, holds, detail: "Frozen Stage 4 has no bound Stage 2 product reference. Normal product flows remain unknown; nozzle-only S/O does not resolve or cause this hold." };
  const rows = await client.query(`SELECT id::text,design_id,created_by,input_snapshot,model_hash,engine_hash,status,result_snapshot
    FROM ecr_pre_pilot_predictive_nt_jobs WHERE id=$1 AND design_id=$2 AND created_by=$3`,
  [reference.stage2JobId, design, user]);
  const row = rows.rows[0];
  let evidence: ReturnType<typeof validatePersistedStage2HetsAuthority>;
  if (!row || row.status !== "completed") return { status: "NORMAL_STAGE2_REFERENCE_UNAVAILABLE",
    reference: { jobId: reference.stage2JobId }, holds, detail: "The frozen Stage 2 reference is missing or incomplete; no alternate job is substituted." };
  try {
    evidence = validatePersistedStage2HetsAuthority(row, snapshot);
  } catch {
    return { status: "NORMAL_STAGE2_REFERENCE_NOT_ADMITTED", reference: { jobId: reference.stage2JobId },
      holds, detail: "Frozen Stage 2 reference failed persisted evidence or normal Stage 1 compatibility validation. No product flow was admitted." };
  }
  if (evidence.resultHash !== reference.stage2ResultHash || evidence.theoreticalStages !== reference.value)
    return { status: "NORMAL_STAGE2_REFERENCE_IDENTITY_MISMATCH", reference: { jobId: reference.stage2JobId },
      holds, detail: "Frozen Stage 4 and persisted Stage 2 identities differ; no product flow was admitted." };
  return { status: "NORMAL_STAGE2_THEORETICAL_REFERENCE_ONLY",
    reference: { jobId: reference.stage2JobId, resultHash: evidence.resultHash, theoreticalStages: evidence.theoreticalStages },
    holds, detail: "Verified normal-process Stage 2 theoretical reference, not a designated normal end-product duty. Persisted boundary streams do not provide qualified operating-temperature product densities. No N4/N7 selection or product-density proxy is made." };
}

export async function getStage5EndSections(user: number, design: number, revisionId: string, selections: EndSelections) {
  return scoped(user, design, client => calculateCurrent(client, user, design, revisionId, selections));
}

async function calculateCurrent(client: { query: (...args: any[]) => Promise<any> }, user: number, design: number, revisionId: string, selections: EndSelections) {
  // Ownership and immutable snapshot integrity use the existing Stage 5 service.
  const active = (await getStage5Revisions(user, design, revisionId, client))[0];
  if (!active || active.currentness !== "CURRENT") throw new Stage5Error("STAGE5_END_CURRENT_FROZEN_REVISION_REQUIRED");
  const b = active.geometry?.basis;
  if (!b || !Number.isFinite(b.columnDiameterM) || Math.abs(b.columnDiameterM - .7) > 1e-9 || b.compartmentCount !== 20
    || !Number.isFinite(b.installedActiveHeightM) || b.installedActiveHeightM <= 0)
    throw new Stage5Error("STAGE5_END_APPROVED_700_20_STAGE_BASIS_REQUIRED");
  const row = await client.query("SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2", [design, user]);
  if (!row.rows[0]) throw new Stage5Error("ECR_PRE_PILOT_DESIGN_NOT_FOUND", 404);
  const snapshot = validateStage1Snapshot(row.rows[0].input_data);
  const s = snapshot.stage1;
  const normalProductAuthority = await inspectNormalProductAuthority(client, user, design, active, snapshot);
  // Bind to the verified active-section source; no replacement of its dimensions.
  const sourceHash = stage5Hash({ ruleset: END_SECTION_RULESET, stage1: snapshot.immutableHash, activeGeometry: stage5Hash(active.geometry), activeSource: active.sourceHash, revisionId, normalProductAuthority });
  const result = calculateEndSections({
    designFeedRateLph: s.designFeedRateLph, rrboDensityKgM3: s.rrboDensityKgM3, nmpDensityKgM3: s.nmpDensityKgM3,
    solventOilRatio: s.solventOilRatio,
    oilComponentWt: [s.saturatesWt, s.monoAromaticsWt, s.diAromaticsWt, s.polyAromaticsWt, s.polarAromaticsWt, s.nmpInFeedWt],
    nmpPurityWt: s.nmpPurityWt, nmpWaterWt: s.nmpWaterWt,
  }, selections);
  // Existing Stage 5 scope locks protect Stage 1 and upstream inserts through
  // this handoff. The immutable geometry is verified in that same transaction.
  return { ...result, normalProductAuthority, sourceHash, stage1Hash: snapshot.immutableHash,
    active: { revisionId, sourceHash: active.sourceHash, diameterM: b.columnDiameterM,
      compartmentCount: b.compartmentCount, installedActiveHeightM: b.installedActiveHeightM } };
}

export async function readEndSelections(user: number, design: number) {
  const owner = await pool.query("SELECT id FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2", [design, user]);
  if (!owner.rows[0]) throw new Stage5Error("ECR_PRE_PILOT_DESIGN_NOT_FOUND", 404);
  const saved = await pool.query("SELECT selection, source_hash AS \"sourceHash\", updated_at AS \"updatedAt\" FROM ecr_pre_pilot_stage5_end_sections WHERE design_id=$1 AND created_by=$2", [design, user]);
  return saved.rows[0] ?? null;
}

export async function saveEndSelections(user: number, design: number, revisionId: string, selections: EndSelections, expectedSourceHash: unknown) {
  if (typeof expectedSourceHash !== "string" || !expectedSourceHash)
    throw new Stage5Error("STAGE5_END_EXPECTED_SOURCE_HASH_REQUIRED", 400);
  return scoped(user, design, async client => {
    const result = await calculateCurrent(client, user, design, revisionId, selections);
    if (result.sourceHash !== expectedSourceHash) throw new Stage5Error("STAGE5_END_SOURCE_CHANGED");
    const selection = { topDiameterM: selections.topDiameterM, bottomDiameterM: selections.bottomDiameterM, revisionId, ruleset: result.ruleset };
    await client.query(`INSERT INTO ecr_pre_pilot_stage5_end_sections(design_id,created_by,selection,source_hash)
      VALUES($1,$2,$3,$4) ON CONFLICT(design_id,created_by)
      DO UPDATE SET selection=EXCLUDED.selection,source_hash=EXCLUDED.source_hash,updated_at=now()`,
    [design, user, selection, result.sourceHash]);
    return { selection, sourceHash: result.sourceHash, status: "SAVED_PROVISIONAL_SELECTIONS_ONLY" };
  });
}