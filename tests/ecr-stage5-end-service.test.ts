import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn(), revisions: vi.fn(), source: "stage1-a", active: {} as any }));
vi.mock("../server/db", () => ({ pool: { query: state.query } }));
vi.mock("../server/ecr-pre-pilot/stage1", () => ({ validateStage1Snapshot: (v: any) => v }));
vi.mock("../server/ecr-pre-pilot/stage5-geometry-service", () => ({
  getStage5Revisions: state.revisions,
  scoped: async (_u: number, _d: number, fn: any) => fn({ query: state.query }),
  stage5Hash: (v: any) => JSON.stringify(v),
  Stage5Error: class extends Error { constructor(message: string, public status = 409) { super(message); } },
}));
import { getStage5EndSections, saveEndSelections, readEndSelections } from "../server/ecr-pre-pilot/stage5-end-sections-service";
const selections = { topDiameterM: .9, bottomDiameterM: 1 };
beforeEach(() => {
  vi.clearAllMocks(); state.source = "stage1-a";
  state.active = { currentness: "CURRENT", sourceHash: "active-a", geometry: {
    basis: { columnDiameterM: .7, compartmentCount: 20, installedActiveHeightM: 4.2 } } };
  state.revisions.mockImplementation(async () => [state.active]);
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT input_data")) return { rows: [{ input_data: { immutableHash: state.source, stage1: {
      designFeedRateLph: 2500, rrboDensityKgM3: 880, nmpDensityKgM3: 1020,
      saturatesWt: 60, monoAromaticsWt: 15, diAromaticsWt: 10, polyAromaticsWt: 8,
      polarAromaticsWt: 6, nmpInFeedWt: 1, nmpPurityWt: 98, nmpWaterWt: 2,
    } } }] };
    return { rows: [{ id: 23 }] };
  });
});
describe("end service source and persistence gate", () => {
  it("uses current authoritative feeds and passes the same scoped transaction for frozen verification", async () => {
    const r = await getStage5EndSections(12, 23, "1", selections);
    expect(r.feed.oilKgH).toBe(2200);
    expect(r.feed.wetSolventKgH).toBe(3300);
    expect(state.revisions.mock.calls[0][3].query).toBe(state.query);
    expect(r.assemblies.top.residenceHeightM).toBeNull();
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