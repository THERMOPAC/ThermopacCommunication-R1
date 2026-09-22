import { describe, expect, it } from "vitest";
import { calculateEndSections, endGeometry, endNozzle, residenceHeight, type EndFeedBasis } from "../shared/ecr-stage5-end-sections";
import { renderEndSchematic } from "../shared/ecr-stage5-end-schematic";

const feed: EndFeedBasis = { designFeedRateLph: 4000, rrboDensityKgM3: 869, nmpDensityKgM3: 1015, solventOilRatio: .6,
  oilComponentWt: [60, 15, 10, 8, 6, 1], nmpPurityWt: 98, nmpWaterWt: 2 };
const selection = { topDiameterM: .9, bottomDiameterM: 1.2 };
describe("independent end framework", () => {
  it("preserves NORMAL Stage 1 mass S/O and confines the 1.5 override to nozzle sizing", () => {
    const before = JSON.stringify(feed);
    const r = calculateEndSections(feed, selection);
    expect(r.feed.oilKgH).toBe(3476);
    expect(r.feed.wetSolventKgH).toBeCloseTo(2085.6);
    expect(r.feed.wetSolventM3H).toBeCloseTo(2085.6 / 1015);
    expect(r.materialContract.componentFeedKgH.reduce((a, b) => a + b)).toBeCloseTo(5561.6);
    expect(r.nozzleSizingBasis.wetSolventKgH).toBe(5214);
    expect(r.nozzles.wetSolventFeed.nozzleBasisM3H).toBeCloseTo(5214 / 1015);
    expect(r.feed.solventOilMassRatio).toBe(.6);
    expect(JSON.stringify(feed)).toBe(before);
    expect(calculateEndSections({ ...feed, designFeedRateLph: 1250, rrboDensityKgM3: 900 }, selection).feed.oilKgH).toBe(1125);
  });
  it("does not admit product flows from injected feed flags or N4/N7 extrapolations", () => {
    const r = calculateEndSections({ ...feed, qualified: true, topProductM3H: 999, n4: {} } as any, selection);
    expect(r.assemblies.top.residenceHeightM).toBeNull();
    expect(r.assemblies.bottom.normalProductM3H).toBeNull();
    expect(r.materialContract.componentResidualKgH).toBeNull();
    expect(r.nozzles.raffinate).toBeNull();
    expect(r.nozzles.extract).toBeNull();
    expect(r.assemblies.top.totalAssemblyLengthM).toBeNull();
  });
  it("Stage 1 S/O changes normal material feeds but never changes fixed 1.5 nozzle sizing", () => {
    const a = calculateEndSections(feed, selection);
    const b = calculateEndSections({ ...feed, solventOilRatio: .8 }, selection);
    expect(b.feed.wetSolventKgH).toBeCloseTo(3476 * .8);
    expect(b.materialContract.totalFeedKgH).not.toBe(a.materialContract.totalFeedKgH);
    expect(b.materialContract.componentFeedKgH).not.toEqual(a.materialContract.componentFeedKgH);
    expect(b.nozzleSizingBasis).toEqual(a.nozzleSizingBasis);
    expect(b.nozzles).toEqual(a.nozzles);
    expect(b.assemblies).toEqual(a.assemblies); // unknown NORMAL duty stays unknown
  });
  it("source-qualified NORMAL product evidence calculates residence independently of nozzle sizing", () => {
    const inlet = calculateEndSections(feed, selection).materialContract.componentFeedKgH;
    // Synthetic numerical closure fixture, not a production qualification source.
    const duty = { sourceIdentity: "test-only-normal-duty", raffinateComponentKgH: inlet.map(m => .5 * m),
      extractComponentKgH: inlet.map(m => .5 * m), raffinateDensityKgM3: 900, extractDensityKgM3: 1000 };
    const a = calculateEndSections(feed, selection, duty);
    // Alter a nozzle-volumetric property while retaining the same normal mass
    // inputs and qualified PRODUCT densities: residence must be identical.
    const b = calculateEndSections({ ...feed, nmpDensityKgM3: 1100 }, selection, duty);
    expect(a.nozzles.wetSolventFeed).not.toEqual(b.nozzles.wetSolventFeed);
    expect(a.assemblies).toEqual(b.assemblies);
    expect(a.comparisons).toEqual(b.comparisons);
    expect(a.materialContract).toEqual(b.materialContract);
    expect(a.assemblies.top.normalProductM3H).toBeCloseTo(2780.8 / 900);
    expect(a.assemblies.top.residenceHeightM).toBeCloseTo(residenceHeight(2780.8 / 900, .9));
    expect(a.assemblies.top.productOpeningNearEdgeM).toBeCloseTo(.15 + residenceHeight(2780.8 / 900, .9));
    expect(a.nozzles.raffinate).toBeNull(); // separate product nozzle envelope hold
    expect(a.nozzles.extract).toBeNull();
    expect(() => calculateEndSections({ ...feed, solventOilRatio: .8 }, selection, duty)).toThrow("NORMAL_COMPONENT_BALANCE");
    expect(() => calculateEndSections(feed, selection, { ...duty, raffinateDensityKgM3: NaN })).toThrow("NORMAL_PRODUCT_CONTRACT");
    expect(renderEndSchematic(a)).toContain("Normal Q");
    expect(renderEndSchematic(a)).not.toContain("PENDING NORMAL PRODUCT AUTHORITY");
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
      expect(() => calculateEndSections({ ...feed, solventOilRatio: value }, selection)).toThrow();
    }
    expect(() => calculateEndSections({ ...feed, oilComponentWt: [100] }, selection)).toThrow();
    expect(() => calculateEndSections({ ...feed, nmpPurityWt: 90 }, selection)).toThrow();
    expect(() => endGeometry(.6, "bottom")).toThrow();
    expect(() => residenceHeight(-1, 1)).toThrow();
  });
  it("exports complete conditional sequence without inventing mechanical dimensions", () => {
    const svg = renderEndSchematic(calculateEndSections(feed, selection));
    expect(svg).toContain("NOT TO SCALE");
    expect(svg).toContain("PENDING NORMAL PRODUCT AUTHORITY");
    expect(svg).toContain("S/O=1.5 MASS FOR NOZZLES ONLY");
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