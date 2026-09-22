import { pool } from "../db";
import { validateStage1Snapshot } from "./stage1";
import { getStage5Revisions, stage5Hash, Stage5Error, scoped } from "./stage5-geometry-service";
import { calculateEndSections, END_SECTION_RULESET, type EndSelections } from "../../shared/ecr-stage5-end-sections";

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
  // Bind to the verified active-section source; no replacement of its dimensions.
  const sourceHash = stage5Hash({ ruleset: END_SECTION_RULESET, stage1: snapshot.immutableHash, activeGeometry: stage5Hash(active.geometry), activeSource: active.sourceHash, revisionId });
  const result = calculateEndSections({
    designFeedRateLph: s.designFeedRateLph, rrboDensityKgM3: s.rrboDensityKgM3, nmpDensityKgM3: s.nmpDensityKgM3,
    oilComponentWt: [s.saturatesWt, s.monoAromaticsWt, s.diAromaticsWt, s.polyAromaticsWt, s.polarAromaticsWt, s.nmpInFeedWt],
    nmpPurityWt: s.nmpPurityWt, nmpWaterWt: s.nmpWaterWt,
  }, selections);
  // Existing Stage 5 scope locks protect Stage 1 and upstream inserts through
  // this handoff. The immutable geometry is verified in that same transaction.
  return { ...result, sourceHash, stage1Hash: snapshot.immutableHash,
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