import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn(), revisions: vi.fn(), source: "stage1-a", active: {} as any,
  stage2: null as any, validateReference: vi.fn(), normalSo: .6 }));
vi.mock("../server/db", () => ({ pool: { query: state.query } }));
vi.mock("../server/ecr-pre-pilot/stage1", () => ({ validateStage1Snapshot: (v: any) => v }));
vi.mock("../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service", () => ({
  validatePersistedStage2HetsAuthority: state.validateReference,
}));
vi.mock("../server/ecr-pre-pilot/stage5-geometry-service", () => ({
  getStage5Revisions: state.revisions,
  scoped: async (_u: number, _d: number, fn: any) => fn({ query: state.query }),
  stage5Hash: (v: any) => JSON.stringify(v),
  Stage5Error: class extends Error { constructor(message: string, public status = 409) { super(message); } },
}));
import { getStage5EndSections, saveEndSelections, readEndSelections } from "../server/ecr-pre-pilot/stage5-end-sections-service";
const selections = { topDiameterM: .9, bottomDiameterM: 1 };
beforeEach(() => {
  vi.clearAllMocks(); state.source = "stage1-a"; state.normalSo = .6; state.stage2 = null;
  state.validateReference.mockReset();
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
  it("reads only frozen bound Stage 2 reference and never promotes theoretical N4/N7 or feed-density proxies", async () => {
    state.active.sourceStage4 = { result: { actualStage2NtReference: {
      status: "AVAILABLE_REFERENCE_ONLY", stage2JobId: "normal-job", stage2ResultHash: "normal-result", value: 4,
    } } };
    state.stage2 = { id: "normal-job", status: "completed", result_snapshot: { predictiveNt: 4,
      trials: [{ stageCount: 4, boundaryStreams: {} }, { stageCount: 7, boundaryStreams: {} }] } };
    state.validateReference.mockReturnValue({ resultHash: "normal-result", theoreticalStages: 4 });
    const r = await getStage5EndSections(12, 23, "1", selections);
    expect(state.validateReference).toHaveBeenCalledWith(state.stage2, expect.objectContaining({ immutableHash: "stage1-a" }));
    const read = state.query.mock.calls.find(([sql]) => sql.includes("predictive_nt_jobs"));
    expect(read?.[1]).toEqual(["normal-job", 23, 12]);
    expect(read?.[0]).not.toContain("ORDER BY");
    expect(r.normalProductAuthority.status).toBe("NORMAL_STAGE2_THEORETICAL_REFERENCE_ONLY");
    expect(r.assemblies.top.normalProductM3H).toBeNull();
    expect(r.materialContract.raffinateDensityKgM3).toBeNull();
    expect(r.materialContract.requiredEvidence).not.toContain("Independent S/O=1.5");
    state.validateReference.mockReturnValue({ resultHash: "other", theoreticalStages: 7 });
    const mismatch = await getStage5EndSections(12, 23, "1", selections);
    expect(mismatch.normalProductAuthority.status).toBe("NORMAL_STAGE2_REFERENCE_IDENTITY_MISMATCH");
    expect(mismatch.sourceHash).not.toBe(r.sourceHash);
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
    await expect(getStage5EndSections(12, 23, "1", selections)).rejects.toThrow("700_20");
    await expect(saveEndSelections(12, 23, "1", selections, undefined)).rejects.toThrow("EXPECTED_SOURCE");
    state.query.mockResolvedValue({ rows: [] });
    await expect(readEndSelections(12, 23)).rejects.toThrow("NOT_FOUND");
  });
});