import { pool } from "../db";
import { validateStage1Snapshot } from "./stage1";
import { getStage5Revisions, stage5Hash, Stage5Error, scoped } from "./stage5-geometry-service";
import { calculateEndSections, calculateAutomaticEndSections, AUTOMATIC_END_RULESET, END_SECTION_RULESET, type EndSelections, type Stage5EndProjection } from "../../shared/ecr-stage5-end-sections";
import { validatePersistedStage2HetsAuthority } from "./stage4-pre-pilot-sizing-service";
import { resolveStage5EndSystemAuthority, type EndSystemSourceResolver } from "./stage5-end-system-models";
import { validatePersistedAcceptedSevenComponentNtForStage4 } from "./predictive-nt-job-service";
import { bindNormalProductTrial } from "./stage5-normal-product-source";

/** Read only the Stage-2 identity carried by this frozen Stage-4 snapshot.
 * The persisted Stage-1 compatibility check remains mandatory. The accepted
 * seven-component validator then designates the unique accepted trial; this
 * service never searches for another job or chooses N4/N7 itself. */
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
  const frozenReference = { stage2JobId: reference.stage2JobId,
    stage2ResultHash: reference.stage2ResultHash, value: reference.value };
  try {
    // The worker's persisted contract establishes a normalized oil-feed mass
    // basis (100 mass units). Convert the current Stage-1 volumetric oil rate
    // to its physical mass rate before scaling both simultaneous products.
    const trusted = validatePersistedAcceptedSevenComponentNtForStage4(row);
    if (trusted.designId !== design) throw new Error("STAGE5_NORMAL_PRODUCT_DESIGN_IDENTITY_MISMATCH");
    const stage1OilKgH = snapshot.stage1.designFeedRateLph / 1000 * snapshot.stage1.rrboDensityKgM3;
    const bound = bindNormalProductTrial(trusted, frozenReference, stage1OilKgH);
    return { ...bound,
      reference: { jobId: reference.stage2JobId, resultHash: reference.stage2ResultHash,
        theoreticalStages: reference.value },
      stage1Compatibility: evidence.stage1Compatibility };
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : "STAGE5_NORMAL_PRODUCT_TRIAL_INVALID";
    return { status: "NORMAL_PRODUCT_TRIAL_NOT_ADMITTED",
      reference: { jobId: reference.stage2JobId, resultHash: reference.stage2ResultHash,
        theoreticalStages: reference.value },
      holds: ["NORMAL_PRODUCT_BOUND_TRIAL_INVALID", "NORMAL_PRODUCT_PHASE_DENSITIES_NOT_QUALIFIED"],
      detail: `The frozen accepted Stage 2 trial could not be bound to the current normal oil mass rate (${reason}). No product mass or volumetric flow was admitted.` };
  }
}

export async function getStage5EndSections(user: number, design: number, revisionId: string, selections: EndSelections) {
  return scoped(user, design, client => calculateCurrent(client, user, design, revisionId, selections), 'read');
}
export async function getAutomaticStage5EndSections(user: number, design: number, revisionId: string,
  resolveModels: EndSystemSourceResolver = resolveStage5EndSystemAuthority) {
  return scoped(user, design, client => calculateCurrent(client, user, design, revisionId, null, undefined, resolveModels), 'read');
}
/** One verified revision hydration and one consistent current-source transaction. */
export async function getStage5EngineeringReportSource(user: number, design: number, revisionId: string,
  resolveModels: EndSystemSourceResolver = resolveStage5EndSystemAuthority) {
  return scoped(user, design, async client => {
    const revision = (await getStage5Revisions(user, design, revisionId, client))[0];
    const ends = await calculateCurrent(client, user, design, revisionId, null, revision, resolveModels);
    return { revision, ends: ends as Stage5EndProjection };
  }, 'read');
}

async function calculateCurrent(client: { query: (...args: any[]) => Promise<any> }, user: number, design: number, revisionId: string, selections: EndSelections | null, verifiedRevision?: Awaited<ReturnType<typeof getStage5Revisions>>[number],
  resolveModels: EndSystemSourceResolver = resolveStage5EndSystemAuthority) {
  // Ownership and immutable snapshot integrity use the existing Stage 5 service.
  const active = verifiedRevision ?? (await getStage5Revisions(user, design, revisionId, client))[0];
  if (!active || active.currentness !== "CURRENT") throw new Stage5Error("STAGE5_END_CURRENT_FROZEN_REVISION_REQUIRED");
  const b = active.geometry?.basis;
  if (!b || !Number.isFinite(b.columnDiameterM) || b.columnDiameterM <= 0 || !Number.isSafeInteger(b.compartmentCount) || b.compartmentCount <= 0
    || !Number.isFinite(b.installedActiveHeightM) || b.installedActiveHeightM <= 0)
    throw new Stage5Error("STAGE5_END_FROZEN_ACTIVE_BASIS_REQUIRED");
  const row = await client.query("SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2", [design, user]);
  if (!row.rows[0]) throw new Stage5Error("ECR_PRE_PILOT_DESIGN_NOT_FOUND", 404);
  const snapshot = validateStage1Snapshot(row.rows[0].input_data);
  const s = snapshot.stage1;
  const normalProductAuthority = await inspectNormalProductAuthority(client, user, design, active, snapshot);
  const systemAuthority = selections ? {} : await resolveModels({
    designId: design, revisionId, activeSourceHash: active.sourceHash, stage1Hash: snapshot.immutableHash, normalProductAuthority,
  });
  // Bind to the verified active-section source; no replacement of its dimensions.
  const sourceHash = stage5Hash({ ruleset: selections ? END_SECTION_RULESET : AUTOMATIC_END_RULESET, stage1: snapshot.immutableHash, activeGeometry: stage5Hash(active.geometry), activeSource: active.sourceHash, revisionId, normalProductAuthority,
    ...(!selections ? { systemAuthority } : {}) });
  const feed = {
    designFeedRateLph: s.designFeedRateLph, rrboDensityKgM3: s.rrboDensityKgM3, nmpDensityKgM3: s.nmpDensityKgM3,
    solventOilRatio: s.solventOilRatio,
    oilComponentWt: [s.saturatesWt, s.monoAromaticsWt, s.diAromaticsWt, s.polyAromaticsWt, s.polarAromaticsWt, s.nmpInFeedWt],
    nmpPurityWt: s.nmpPurityWt, nmpWaterWt: s.nmpWaterWt,
  };
  const result = selections ? calculateEndSections(feed, selections) : calculateAutomaticEndSections(feed, null, b.columnDiameterM, systemAuthority);
  // Read-only calls use one consistent MVCC snapshot; save calls use source
  // locks. Immutable geometry and Stage 1 are verified in that same transaction.
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