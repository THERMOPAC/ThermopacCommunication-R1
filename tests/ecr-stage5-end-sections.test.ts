import { describe, expect, it } from "vitest";
import { calculateEndSections, endGeometry, endNozzle, residenceHeight, type EndFeedBasis } from "../shared/ecr-stage5-end-sections";
import { renderEndSchematic } from "../shared/ecr-stage5-end-schematic";

const feed: EndFeedBasis = { designFeedRateLph: 4000, rrboDensityKgM3: 869, nmpDensityKgM3: 1015,
  oilComponentWt: [60, 15, 10, 8, 6, 1], nmpPurityWt: 98, nmpWaterWt: 2 };
const selection = { topDiameterM: .9, bottomDiameterM: 1.2 };
describe("independent end framework", () => {
  it("converts actual Stage 1 units/densities, fixes mass S/O and closes inlet component totals", () => {
    const before = JSON.stringify(feed);
    const r = calculateEndSections(feed, selection);
    expect(r.feed.oilKgH).toBe(3476);
    expect(r.feed.wetSolventKgH).toBe(5214);
    expect(r.feed.wetSolventM3H).toBeCloseTo(5214 / 1015);
    expect(r.materialContract.componentFeedKgH.reduce((a, b) => a + b)).toBeCloseTo(8690);
    expect(JSON.stringify(feed)).toBe(before);
    expect(calculateEndSections({ ...feed, designFeedRateLph: 1250, rrboDensityKgM3: 900 }, selection).feed.oilKgH).toBe(1125);
  });
  it("has no product admission path, including injected flags and N4/N7 extrapolations", () => {
    const r = calculateEndSections({ ...feed, qualified: true, topProductM3H: 999, n4: {} } as any, selection);
    expect(r.assemblies.top.residenceHeightM).toBeNull();
    expect(r.assemblies.bottom.normalProductM3H).toBeNull();
    expect(r.materialContract.componentResidualKgH).toBeNull();
    expect(r.nozzles.raffinate).toBeNull();
    expect(r.nozzles.extract).toBeNull();
    expect(r.assemblies.top.totalAssemblyLengthM).toBeNull();
  });
  it("uses normal volume only with independent mirrored geometry and near/far opening holds", () => {
    expect(residenceHeight(4, .9)).toBeCloseTo(4 / (6 * .9 * Math.PI * .9 ** 2 / 4));
    const r = calculateEndSections(feed, selection);
    expect(r.assemblies.top.direction).toBe("UP_FROM_ACTIVE");
    expect(r.assemblies.bottom.direction).toBe("DOWN_FROM_ACTIVE");
    for (const g of Object.values(r.assemblies)) {
      expect(g.interfaceOffsetM).toBe(.15);
      expect(g.transitionMinimumM).toBe(.4 * g.diameterM);
      expect(g.postOpeningExtensionM).toBe(.4 * g.diameterM);
      expect(g.feedDistribution.lengthM).toBeNull();
      expect(g.feedDistribution.additionalOutsideActive).toBe(true);
      expect(g.transitionPhysicalLengthM).toBeNull();
      expect(g.headResidenceCreditM3).toBe(0);
      expect(g.productOpeningNearEdgeM).toBeNull();
    }
    expect(endGeometry(.7, "top").transitionStatus).toMatch(/EXCEPTION/);
  });
  it("uses actual bores, not DN, and limits 120% to nozzle checks", () => {
    const n = endNozzle(4);
    expect(n.hydraulic120M3H).toBe(4.8);
    expect(n.provisionalDn).toBe(65);
    expect(n.candidates.find(c => c.dn === 65)?.boreMm).toBeCloseTo(62.68);
    expect(n.candidates.find(c => c.dn === 50)?.passes).toBe(false);
    expect(endNozzle(10000).provisionalDn).toBeNull();
  });
  it("rejects missing, nonfinite, negative and malformed authority or geometry", () => {
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() => calculateEndSections({ ...feed, designFeedRateLph: value }, selection)).toThrow();
      expect(() => calculateEndSections({ ...feed, nmpDensityKgM3: value }, selection)).toThrow();
    }
    expect(() => calculateEndSections({ ...feed, oilComponentWt: [100] }, selection)).toThrow();
    expect(() => calculateEndSections({ ...feed, nmpPurityWt: 90 }, selection)).toThrow();
    expect(() => endGeometry(.6, "bottom")).toThrow();
    expect(() => residenceHeight(-1, 1)).toThrow();
  });
  it("exports complete conditional sequence without inventing mechanical dimensions", () => {
    const svg = renderEndSchematic(calculateEndSections(feed, selection));
    expect(svg).toContain("NOT TO SCALE");
    expect(svg).toContain("PENDING BALANCE");
    expect(svg).toContain("Additional Ø700");
    expect(svg).toContain("far edge");
    expect(svg).toContain("Torispherical");
    expect(svg).not.toMatch(/NaN|undefined/);
  });
  it("draws diameter-relative vessel profiles rather than changing labels alone", () => {
    const small = renderEndSchematic(calculateEndSections(feed, { topDiameterM: .9, bottomDiameterM: 1.2 }));
    const large = renderEndSchematic(calculateEndSections(feed, { topDiameterM: 1.2, bottomDiameterM: 1.2 }));
    const topProfile = (svg: string) => svg.split('data-end-profile="top"')[1].split('data-end-profile="bottom"')[0];
    expect(topProfile(small)).toContain('data-shell-width="189"');
    expect(topProfile(large)).toContain('data-shell-width="252"');
    expect(topProfile(small)).toContain('data-neck-width="147"');
    expect(topProfile(large)).toContain('data-neck-width="147"');
    // Actual shell/interface/path coordinates must move with the selected ID.
    expect(topProfile(small)).toContain('x1="95.5"');
    expect(topProfile(large)).toContain('x1="64"');
    const bottomProfile = (svg: string) => svg.split('data-end-profile="bottom"')[1];
    expect(bottomProfile(small)).toBe(bottomProfile(large));
    for (const part of ["frozen-active-reference", "additional-feed-neck", "symbolic-knuckled-transition",
      "normal-residence-region", "straight-shell", "symbolic-torispherical-head", "interface",
      "unknown-height-break", "feed-nozzle", "product-nozzle", "residence-dimension",
      "interface-offset-dimension", "post-opening-dimension"]) {
      expect(small.split(`data-part="${part}"`)).toHaveLength(3);
    }
    expect(small).toContain('data-edge="near"');
    expect(small).toContain('data-edge="far"');
    expect(small).toContain("<title>");
    expect(small).toContain("<desc>");
    expect(small).toContain("no dimensions may be measured");
    expect(small).toContain("H10 TBD");
    expect(topProfile(small)).toContain('y1="540"'); // top interface above active y=710
    expect(bottomProfile(small)).toContain('y1="340"'); // bottom interface below active y=170
  });
});