import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ values: [] as any[], index: 0, effects: [] as any[] }));
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    const i = hooks.index++;
    if (!(i in hooks.values)) hooks.values[i] = initial;
    return [hooks.values[i], (v: any) => { hooks.values[i] = typeof v === "function" ? v(hooks.values[i]) : v; }];
  },
  useEffect: (fn: any) => { hooks.effects.push(fn); },
}));
import { Stage5EndSectionsPanel } from "../client/src/components/ecr-pre-pilot/stage5-end-sections-panel";
import { calculateAutomaticEndSections } from "../shared/ecr-stage5-end-sections";
const result = { ...calculateAutomaticEndSections({ designFeedRateLph: 2300, rrboDensityKgM3: 880, nmpDensityKgM3: 1015, solventOilRatio: .6,
  oilComponentWt: [60, 15, 10, 8, 6, 1], nmpPurityWt: 98, nmpWaterWt: 2 }),
  sourceHash: "current-source", stage1Hash: "stage1-source",
  active: { revisionId: "1", diameterM: .7, compartmentCount: 20, installedActiveHeightM: 4.2 } };
const render = (publish = vi.fn(), revisionId: string | undefined = "1") => {
  hooks.index = 0; hooks.effects = [];
  return renderToStaticMarkup(React.createElement(Stage5EndSectionsPanel, { designId: 269, revisionId, onProjectionChange: publish }));
};
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
beforeEach(() => { hooks.values = []; hooks.index = 0; hooks.effects = []; vi.unstubAllGlobals(); });
describe("system end-section authority UI", () => {
  it("accepts and publishes calculated numeric top results independently of a bottom HOLD", async () => {
    const model = { status: "BUILTIN_MODEL_ELIGIBLE" as const, modelId: "TEST_ONLY_UI_SYSTEM_MODEL", version: "fixture", citation: "UI fixture only" };
    const numerical = { ...result, ...calculateAutomaticEndSections({
      designFeedRateLph: 2300, rrboDensityKgM3: 880, nmpDensityKgM3: 1015, solventOilRatio: .6,
      oilComponentWt: [60, 15, 10, 8, 6, 1], nmpPurityWt: 98, nmpWaterWt: 2,
    }, null, .7, { top: {
      normalFlow: { status: "SOURCE_QUALIFIED_NORMAL_FLOW", qM3H: 4, sourceIdentity: "fixture-normal", sourceRevision: "r1" },
      separation: { kind: "SYSTEM_UDESIGN_MODEL", model, uDesignMS: .001 },
      fabrication: { kind: "BUILTIN_INCREMENT", model, incrementM: .1 },
    } }) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => numerical }));
    const publish = vi.fn(); render(publish); hooks.effects[0](); await flush();
    expect(publish).toHaveBeenLastCalledWith(numerical, null);
    const html = render();
    expect(html).toContain("SYSTEM_CALCULATED_FROM_GOVERNED_MODELS");
    expect(html).toContain("TEST_ONLY_UI_SYSTEM_MODEL");
    expect(html).toContain("1.2 m");
    expect(html).toContain("DESIGN_CRITERION_REQUIRED");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<input");
  });
  it("shows pending system design without manual selectors, save actions or invented diameter", () => {
    hooks.values = [result, null, false, 0];
    const html = render();
    expect(html).toContain("Source ready");
    expect(html).toContain("independent system end calculations");
    expect(html).toContain("MODEL_UNAVAILABLE");
    expect(html).toContain("not a request for user sizing values");
    expect(html).toContain("<details");
    expect(html).toContain("Combined NORMAL feed: 3238.400");
    expect(html).toContain("NOZZLES ONLY");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Save end selections");
    expect(html).not.toContain("900 mm");
  });
  it("renders resolver pending evidence IDs and authority lineage without UI mapping changes", () => {
    const authority = { id: "ECR_END_QUALIFICATION_PROTOCOL", version: "2.0.0",
      status: "PROTOCOL_ISSUED_NO_MODELS_QUALIFIED_HOLD",
      source: "docs/stage5-end-qualification-protocol.md",
      evidenceReview: "docs/stage5-end-qualification-evidence-review.md",
      supersedes: "ECR_END_SOURCE_AUDIT / 1.0.0" };
    const pending = calculateAutomaticEndSections({
      designFeedRateLph: 2300, rrboDensityKgM3: 880, nmpDensityKgM3: 1015, solventOilRatio: .6,
      oilComponentWt: [60, 15, 10, 8, 6, 1], nmpPurityWt: 98, nmpWaterWt: 2,
    }, null, .7, { top: {
      modelAuthority: authority,
      modelDependencies: ["QUALIFICATION_EVIDENCE_REQUIRED:TOP-QP-DSD-001", "QUALIFICATION_EVIDENCE_REQUIRED:TOP-QP-FAB-001"],
    }, bottom: {
      modelAuthority: authority,
      modelDependencies: ["QUALIFICATION_EVIDENCE_REQUIRED:BOTTOM-QP-DSD-001", "QUALIFICATION_EVIDENCE_REQUIRED:BOTTOM-QP-FAB-001"],
    } });
    hooks.values = [{ ...pending, sourceHash: "qualification-source", stage1Hash: "stage1-source",
      active: result.active }, null, false, 0];
    const html = render();
    expect(html).toContain("QUALIFICATION_EVIDENCE_REQUIRED:TOP-QP-DSD-001");
    expect(html).toContain("QUALIFICATION_EVIDENCE_REQUIRED:BOTTOM-QP-FAB-001");
    expect(html).toContain("evidence review docs/stage5-end-qualification-evidence-review.md");
    expect(html).toContain("supersedes ECR_END_SOURCE_AUDIT / 1.0.0");
  });
  it("fetches no preferences, publishes the same authoritative result, and installs no poll/focus effect", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetcher);
    const publish = vi.fn(); render(publish);
    expect(hooks.effects).toHaveLength(1);
    const cleanup = hooks.effects[0]();
    expect(publish).toHaveBeenNthCalledWith(1, null, null);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/ecr-pre-pilot/designs/269/stage5/revisions/1/end-sections");
    expect(publish).toHaveBeenLastCalledWith(result, null);
    cleanup();
  });
  it("distinguishes server failure from ready-but-pending and revokes the GA", async () => {
    hooks.values = [result, null, false, 0];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "STAGE5_AUTHORITY_BUSY" }) }));
    const publish = vi.fn(); render(publish); hooks.effects[0]();
    expect(hooks.values[0]).toBeNull();
    expect(render()).toContain("Reading saved feed");
    await flush();
    expect(hooks.values[0]).toBeNull();
    expect(render()).toContain("not a geometry selection error");
    expect(render()).not.toContain("Source ready");
    expect(publish).toHaveBeenLastCalledWith(null, expect.stringContaining("HTTP 503"));
  });
  it("rejects legacy selected-diameter payloads and ignores an aborted late result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...result, ruleset: "legacy" }) }));
    render(); hooks.effects[0](); await flush();
    expect(hooks.values[0]).toBeNull();
    expect(hooks.values[1]).toContain("SYSTEM_AUTHORITY_RESPONSE_REQUIRED");
    let resolve: (v: any) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(r => { resolve = r; })));
    render(); const cleanup = hooks.effects[0](); cleanup();
    resolve({ ok: true, json: async () => result }); await flush();
    expect(hooks.values[0]).toBeNull();
  });
});