import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn(), revisions: vi.fn(), source: "stage1-a", active: {} as any,
  stage2: null as any, validateReference: vi.fn(), validateAccepted: vi.fn(), normalSo: .6 }));
vi.mock("../server/db", () => ({ pool: { query: state.query } }));
vi.mock("../server/ecr-pre-pilot/stage1", () => ({ validateStage1Snapshot: (v: any) => v }));
vi.mock("../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service", () => ({
  validatePersistedStage2HetsAuthority: state.validateReference,
}));
vi.mock("../server/ecr-pre-pilot/predictive-nt-job-service", () => ({
  validatePersistedAcceptedSevenComponentNtForStage4: state.validateAccepted,
}));
vi.mock("../server/ecr-pre-pilot/stage5-geometry-service", () => ({
  getStage5Revisions: state.revisions,
  scoped: async (_u: number, _d: number, fn: any) => fn({ query: state.query }),
  stage5Hash: (v: any) => JSON.stringify(v),
  Stage5Error: class extends Error { constructor(message: string, public status = 409) { super(message); } },
}));
import { getStage5EndSections, getAutomaticStage5EndSections, getStage5EngineeringReportSource, saveEndSelections, readEndSelections } from "../server/ecr-pre-pilot/stage5-end-sections-service";
const selections = { topDiameterM: .9, bottomDiameterM: 1 };
const stream = (componentMass: number[]) => ({
  componentMass, mass: componentMass.reduce((sum, value) => sum + value, 0),
});
const acceptedTrial = () => ({
  jobId: "normal-job", designId: 23, engineHash: "e".repeat(64),
  stage4AdapterScienceEngineHash: "f".repeat(64), theoreticalStages: 4,
  resultSnapshotHash: "normal-result",
  selectedTrial: { accepted: true, stageCount: 4, boundaryStreams: {
    oilFeed: stream([60, 15, 10, 8, 6, 1, 0]),
    freshWetSolvent: stream([0, 0, 0, 0, 0, 58.8, 1.2]),
    finalRaffinate: stream([58, 10, 5, 2, 1, 4, .2]),
    finalExtract: stream([2, 5, 5, 6, 5, 55.8, 1]),
  } },
});
beforeEach(() => {
  vi.clearAllMocks(); state.source = "stage1-a"; state.normalSo = .6; state.stage2 = null;
  state.validateReference.mockReset(); state.validateAccepted.mockReset();
  state.validateAccepted.mockImplementation(() => acceptedTrial());
  state.active = { currentness: "CURRENT", sourceHash: "active-a", geometry: {
    basis: { columnDiameterM: .7, compartmentCount: 20, installedActiveHeightM: 4.2 } } };
  state.revisions.mockImplementation(async () => [state.active]);
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT input_data")) return { rows: [{ input_data: { immutableHash: state.source, stage1: {
      designFeedRateLph: 2500, rrboDensityKgM3: 880, nmpDensityKgM3: 1020, solventOilRatio: state.normalSo,
      saturatesWt: 60, monoAromaticsWt: 15, diAromaticsWt: 10, polyAromaticsWt: 8,
      polarAromaticsWt: 6, nmpInFeedWt: 1, nmpPurityWt: 98, nmpWaterWt: 2,
    } } }] };
    if (sql.includes("FROM ecr_pre_pilot_predictive_nt_jobs")) return { rows: state.stage2 ? [state.stage2] : [] };
    return { rows: [{ id: 23 }] };
  });
});
describe("end service source and persistence gate", () => {
  it("executes a server-owned model resolver bound to the verified source, without snapshot or preference writes", async () => {
    const before = JSON.stringify(state.active);
    const model = { status: "BUILTIN_MODEL_ELIGIBLE" as const, modelId: "TEST_ONLY_DIRECT_SYSTEM_MODEL", version: "fixture-1", citation: "Numerical test only" };
    const resolver = vi.fn(async () => ({ top: {
      normalFlow: { status: "SOURCE_QUALIFIED_NORMAL_FLOW" as const, qM3H: 4, sourceIdentity: "fixture-duty", sourceRevision: "r1" },
      separation: { kind: "SYSTEM_UDESIGN_MODEL" as const, model, uDesignMS: .001 },
      fabrication: { kind: "BUILTIN_INCREMENT" as const, model, incrementM: .1 },
    } }));
    const result = await getAutomaticStage5EndSections(12, 23, "1", resolver);
    expect(result.assemblies.top.diameterM).toBeGreaterThan(.7);
    expect(result.assemblies.bottom.diameterM).toBeNull();
    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ designId: 23, revisionId: "1", activeSourceHash: "active-a", stage1Hash: "stage1-a" }));
    expect(JSON.stringify(state.active)).toBe(before);
    expect(state.revisions).toHaveBeenCalledTimes(1);
    expect(state.query.mock.calls.some(([sql]) => /INSERT|UPDATE|stage5_end_sections/.test(sql))).toBe(false);
  });
  it("hydrates the current report revision only once and shares the read transaction", async () => {
    const { revision, ends } = await getStage5EngineeringReportSource(12, 23, "1");
    expect(revision).toBe(state.active);
    expect(state.revisions).toHaveBeenCalledTimes(1);
    expect(state.revisions.mock.calls[0][3].query).toBe(state.query);
    expect(ends.active.sourceHash).toBe(revision.sourceHash);
    expect(state.query.mock.calls.some(([sql]) => /INSERT|UPDATE/.test(sql))).toBe(false);
  });
  it("produces system-pending authority without reading or rewriting historical preferences", async () => {
    const before = JSON.stringify(state.active);
    const r = await getAutomaticStage5EndSections(12, 23, "1");
    expect(r.assemblies.top.diameterM).toBeNull();
    expect(r.assemblies.bottom.residenceHeightM).toBeNull();
    expect(r.ruleset).toContain("INDEPENDENT_DIAMETER_HEIGHT");
    expect(r.feed.wetSolventKgH).toBe(1320);
    expect(r.nozzleSizingBasis.wetSolventKgH).toBe(3300);
    expect(state.query.mock.calls.some(([sql]) => /INSERT|UPDATE|stage5_end_sections/.test(sql))).toBe(false);
    expect(JSON.stringify(state.active)).toBe(before);
  });
  it("uses current authoritative feeds and passes the same scoped transaction for frozen verification", async () => {
    const r = await getStage5EndSections(12, 23, "1", selections);
    expect(r.feed.oilKgH).toBe(2200);
    expect(r.feed.wetSolventKgH).toBe(1320);
    expect(r.materialContract.totalFeedKgH).toBe(3520);
    expect(r.nozzleSizingBasis.wetSolventKgH).toBe(3300);
    expect(r.normalProductAuthority.status).toBe("NORMAL_PRODUCT_AUTHORITY_UNAVAILABLE");
    expect(state.query.mock.calls.some(([sql]) => sql.includes("predictive_nt_jobs"))).toBe(false);
    expect(state.revisions.mock.calls[0][3].query).toBe(state.query);
    expect(r.assemblies.top.residenceHeightM).toBeNull();
  });
  it("binds only the frozen validator-selected trial to the normal oil mass rate without inventing product volumes", async () => {
    state.active.sourceStage4 = { result: { actualStage2NtReference: {
      status: "AVAILABLE_REFERENCE_ONLY", stage2JobId: "normal-job", stage2ResultHash: "normal-result", value: 4,
    } } };
    state.stage2 = { id: "normal-job", status: "completed", result_snapshot: { predictiveNt: 4,
      trials: [{ stageCount: 4, boundaryStreams: {} }, { stageCount: 7, boundaryStreams: {} }] } };
    state.validateReference.mockReturnValue({ resultHash: "normal-result", theoreticalStages: 4,
      stage1Compatibility: { status: "EXACT_STAGE1_SNAPSHOT_MATCH" } });
    const r = await getStage5EndSections(12, 23, "1", selections);
    expect(state.validateReference).toHaveBeenCalledWith(state.stage2, expect.objectContaining({ immutableHash: "stage1-a" }));
    expect(state.validateAccepted).toHaveBeenCalledWith(state.stage2);
    const read = state.query.mock.calls.find(([sql]) => sql.includes("predictive_nt_jobs"));
    expect(read?.[1]).toEqual(["normal-job", 23, 12]);
    expect(read?.[0]).not.toContain("ORDER BY");
    expect(r.normalProductAuthority.status).toBe("NORMAL_PRODUCT_TRIAL_BOUND_DENSITIES_REQUIRED");
    expect(r.normalProductAuthority.reference).toEqual({
      jobId: "normal-job", resultHash: "normal-result", theoreticalStages: 4,
    });
    // 2500 L/h / 1000 * 880 kg/m3 = 2200 kg/h, the same physical oil basis
    // used by the end-process calculator, scaling the worker's 100-mass basis.
    expect(r.feed.oilKgH).toBe(2200);
    expect(r.normalProductAuthority.raffinateComponentKgH).toEqual([1276, 220, 110, 44, 22, 88, 4.4]);
    expect(r.normalProductAuthority.extractComponentKgH).toEqual([44, 110, 110, 132, 110, 1227.6, 22]);
    expect(r.normalProductAuthority.raffinateDensityKgM3).toBeNull();
    expect(r.normalProductAuthority.extractDensityKgM3).toBeNull();
    expect(r.normalProductAuthority).not.toHaveProperty("topNormalM3H");
    expect(r.normalProductAuthority).not.toHaveProperty("bottomNormalM3H");
    expect(r.assemblies.top.normalProductM3H).toBeNull();
    expect(r.materialContract.raffinateDensityKgM3).toBeNull();
    expect(r.materialContract.requiredEvidence).not.toContain("Independent S/O=1.5");
    state.validateReference.mockReturnValue({ resultHash: "other", theoreticalStages: 7 });
    const mismatch = await getStage5EndSections(12, 23, "1", selections);
    expect(mismatch.normalProductAuthority.status).toBe("NORMAL_STAGE2_REFERENCE_IDENTITY_MISMATCH");
    expect(mismatch.sourceHash).not.toBe(r.sourceHash);
  });
  it("reports rejected persisted or malformed accepted trials without failing the end page", async () => {
    state.active.sourceStage4 = { result: { actualStage2NtReference: {
      status: "AVAILABLE_REFERENCE_ONLY", stage2JobId: "normal-job", stage2ResultHash: "normal-result", value: 4,
    } } };
    state.stage2 = { id: "normal-job", status: "completed", result_snapshot: {} };
    state.validateReference.mockReturnValue({ resultHash: "normal-result", theoreticalStages: 4,
      stage1Compatibility: { status: "EXACT_STAGE1_SNAPSHOT_MATCH" } });
    state.validateAccepted.mockImplementationOnce(() => { throw new Error("STAGE4_STAGE2_SELECTED_TRIAL_INCONSISTENT"); });
    const rejected = await getStage5EndSections(12, 23, "1", selections);
    expect(rejected.normalProductAuthority.status).toBe("NORMAL_PRODUCT_TRIAL_NOT_ADMITTED");
    expect(rejected.normalProductAuthority.detail).toContain("STAGE4_STAGE2_SELECTED_TRIAL_INCONSISTENT");
    expect(rejected.assemblies.top.normalProductM3H).toBeNull();

    const malformed = acceptedTrial() as any;
    malformed.selectedTrial.boundaryStreams.finalExtract.componentMass[0] += 1;
    malformed.selectedTrial.boundaryStreams.finalExtract.mass += 1;
    state.validateAccepted.mockReturnValue(malformed);
    const unbalanced = await getStage5EndSections(12, 23, "1", selections);
    expect(unbalanced.normalProductAuthority.status).toBe("NORMAL_PRODUCT_TRIAL_NOT_ADMITTED");
    expect(unbalanced.normalProductAuthority.detail).toContain("STAGE5_NORMAL_PRODUCT_COMPONENT_BALANCE_INVALID");
    expect(unbalanced.materialContract.raffinateComponentKgH).toBeNull();
  });
  it("rejects legacy nozzle-as-process source hashes while retaining safe diameter choices", async () => {
    const r = await getStage5EndSections(12, 23, "1", selections);
    expect(r.ruleset).toBe("ECR_END_SECTIONS_NORMAL_PROCESS_NOZZLE_ONLY_SO15_V2");
    expect(r.sourceHash).toContain(r.ruleset);
    await expect(saveEndSelections(12, 23, "1", selections, "ECR_END_SECTIONS_NORMAL10_SO15_V1")).rejects.toThrow("SOURCE_CHANGED");
    expect(r.assemblies.top.diameterM).toBe(.9);
    state.normalSo = .8; state.source = "stage1-b";
    const changed = await getStage5EndSections(12, 23, "1", selections);
    expect(changed.feed.wetSolventKgH).toBe(1760);
    expect(changed.nozzleSizingBasis).toEqual(r.nozzleSizingBasis);
    expect(changed.sourceHash).not.toBe(r.sourceHash);
  });
  it("changes identity for Stage 1 and active geometry and rejects stale saves", async () => {
    const first = await getStage5EndSections(12, 23, "1", selections);
    state.source = "stage1-b";
    expect((await getStage5EndSections(12, 23, "1", selections)).sourceHash).not.toBe(first.sourceHash);
    await expect(saveEndSelections(12, 23, "1", selections, first.sourceHash)).rejects.toThrow("SOURCE_CHANGED");
    expect(state.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
    state.source = "stage1-a"; state.active.geometry.basis.installedActiveHeightM = 5;
    expect((await getStage5EndSections(12, 23, "1", selections)).sourceHash).not.toBe(first.sourceHash);
  });
  it("persists only independent selections and never writes Stage 1/2 or active snapshots", async () => {
    const r = await getStage5EndSections(12, 23, "1", selections);
    const saved = await saveEndSelections(12, 23, "1", selections, r.sourceHash);
    expect(saved.status).toBe("SAVED_PROVISIONAL_SELECTIONS_ONLY");
    const writes = state.query.mock.calls.filter(([sql]) => /INSERT|UPDATE/.test(sql));
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain("INSERT INTO ecr_pre_pilot_stage5_end_sections");
    expect(writes[0][1][2]).not.toHaveProperty("geometry");
    expect(writes[0][1].slice(0, 2)).toEqual([23, 12]);
  });
  it("blocks outdated active, incompatible active, absent owner and missing expected hash", async () => {
    state.active.currentness = "OUTDATED";
    await expect(getStage5EndSections(12, 23, "1", selections)).rejects.toThrow("CURRENT_FROZEN");
    state.active.currentness = "CURRENT"; state.active.geometry.basis.columnDiameterM = .6;
    state.active.geometry.basis.compartmentCount = 13;
    const general = await getAutomaticStage5EndSections(12, 23, "1");
    expect(general.active).toMatchObject({ diameterM: .6, compartmentCount: 13 });
    expect(general.assemblies.top.feedDistribution.diameterM).toBe(.6);
    state.active.geometry.basis.columnDiameterM = 0;
    await expect(getAutomaticStage5EndSections(12, 23, "1")).rejects.toThrow("FROZEN_ACTIVE_BASIS");
    await expect(saveEndSelections(12, 23, "1", selections, undefined)).rejects.toThrow("EXPECTED_SOURCE");
    state.query.mockResolvedValue({ rows: [] });
    await expect(readEndSelections(12, 23)).rejects.toThrow("NOT_FOUND");
  });
});