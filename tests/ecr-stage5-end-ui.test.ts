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
import { calculateEndSections } from "../shared/ecr-stage5-end-sections";
const result = { ...calculateEndSections({ designFeedRateLph: 2300, rrboDensityKgM3: 880, nmpDensityKgM3: 1015,
  oilComponentWt: [60, 15, 10, 8, 6, 1], nmpPurityWt: 98, nmpWaterWt: 2 }, { topDiameterM: .9, bottomDiameterM: .9 }),
  sourceHash: "current-source", stage1Hash: "stage1-source",
  active: { revisionId: "1", diameterM: .7, compartmentCount: 20, installedActiveHeightM: 4.2 } };
const render = (revisionId: string | undefined = "1") => {
  hooks.index = 0; hooks.effects = [];
  return renderToStaticMarkup(React.createElement(Stage5EndSectionsPanel, { designId: 269, revisionId }));
};
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
beforeEach(() => { hooks.values = []; hooks.index = 0; hooks.effects = []; vi.unstubAllGlobals(); });
describe("end-section UI states and authority requests", () => {
  it("renders honest empty and loading states with actions disabled", () => {
    expect(render()).toContain("Checking current");
    hooks.values = []; hooks.index = 0;
    const empty = renderToStaticMarkup(React.createElement(Stage5EndSectionsPanel, { designId: 269 }));
    expect(empty).toContain("Select a saved current Stage 5 revision");
    expect(empty).toContain("disabled");
  });
  it("renders full conditional top/bottom results and stale saved-source status without fake qualification", () => {
    hooks.values = [{ topDiameterM: .9, bottomDiameterM: .9 }, result, null, null, { sourceHash: "old", selection: { topDiameterM: .9, bottomDiameterM: .9 } }];
    const html = render();
    expect(html).toContain("SAVED SOURCE OUTDATED");
    expect(html).toContain("2300.000");
    expect(html).toContain("near edge");
    expect(html).toContain("far outer edge");
    expect(html).toContain("NOT TO SCALE");
    expect(html).toContain('data-end-profile="top"');
    expect(html).toContain('data-end-profile="bottom"');
    expect(html).toContain('data-part="symbolic-torispherical-head"');
    expect(html).toContain("Pending / pending");
    expect(html).toContain("Save end selections");
    expect(html).not.toContain('type="checkbox"');
  });
  it("clears previous results on a source fetch and does not reuse them after failure", async () => {
    hooks.values = [{ topDiameterM: .9, bottomDiameterM: .9 }, result, null, null, null, null, null, true, 0];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "STAGE5_END_SOURCE_CHANGED" }) }));
    render();
    const cleanup = hooks.effects[1]();
    expect(hooks.values[1]).toBeNull();
    await flush();
    expect(hooks.values[2]).toBe("STAGE5_END_SOURCE_CHANGED");
    expect(render()).toContain("No previous result is being reused");
    cleanup();
  });
  it("loads authenticated persisted choices without trusting their old source as current", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      sourceHash: "old", selection: { topDiameterM: 1, bottomDiameterM: 1.2 },
    }) }));
    render(); const cleanup = hooks.effects[0](); await flush();
    expect(hooks.values[0]).toEqual({ topDiameterM: 1, bottomDiameterM: 1.2 });
    expect(hooks.values[7]).toBe(true);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/end-sections/selections"), expect.objectContaining({ credentials: "include", cache: "no-store" }));
    cleanup();
  });
  it("aborts old requests so late responses cannot replace new selections", async () => {
    let resolve!: (v: any) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(r => { resolve = r; })));
    hooks.values = [{ topDiameterM: .9, bottomDiameterM: .9 }, result, null, null, null, null, null, true, 0];
    render(); const cleanup = hooks.effects[1](); cleanup();
    resolve({ ok: true, json: async () => result }); await flush();
    expect(hooks.values[1]).toBeNull();
  });
});