/** Independent end-design basis. Never changes the saved active section or Stage 1/2.
 * There is currently NO qualified S/O=1.5 product-balance producer. Consequently
 * this contract intentionally accepts no product flows, partition fractions or
 * user-set qualification flag. A future evidence-backed producer needs review. */
export const END_SECTION_RULESET = "ECR_END_SECTIONS_NORMAL10_SO15_V1";
export const END_DIAMETERS_M = [.7, .9, 1, 1.2] as const;
export interface EndFeedBasis {
  designFeedRateLph: number;
  rrboDensityKgM3: number;
  nmpDensityKgM3: number;
  oilComponentWt: number[];
  nmpPurityWt: number;
  nmpWaterWt: number;
}
export interface EndSelections { topDiameterM: number; bottomDiameterM: number }
const positive = (x: number) => Number.isFinite(x) && x > 0;
const area = (d: number) => Math.PI * d * d / 4;
export function residenceHeight(normalProductM3H: number, diameterM: number) {
  if (!positive(normalProductM3H) || !positive(diameterM)) throw new Error("STAGE5_END_INVALID_RESIDENCE_INPUT");
  return normalProductM3H / (6 * .9 * area(diameterM));
}
export function endNozzle(normalM3H: number) {
  if (!positive(normalM3H)) throw new Error("STAGE5_END_INVALID_NOZZLE_FLOW");
  const candidates = [[40, 48.3, 3.68], [50, 60.3, 3.91], [65, 73, 5.16], [80, 88.9, 5.49], [100, 114.3, 6.02]]
    .map(([dn, odMm, wallMm]) => {
      const boreMm = odMm - 2 * wallMm;
      const velocity120MS = 1.2 * normalM3H / 3600 / area(boreMm / 1000);
      return { dn, odMm, wallMm, boreMm, velocity120MS, passes: velocity120MS <= .5 };
    });
  return { normalM3H, hydraulic120M3H: 1.2 * normalM3H,
    requiredBoreMm: 1000 * Math.sqrt(4 * 1.2 * normalM3H / 3600 / (Math.PI * .5)),
    provisionalDn: candidates.find(c => c.passes)?.dn ?? null, candidates };
}
export function endGeometry(diameterM: number, end: "top" | "bottom") {
  if (!END_DIAMETERS_M.some(d => d === diameterM)) throw new Error("STAGE5_END_INVALID_DIAMETER");
  return { end, diameterM, direction: end === "top" ? "UP_FROM_ACTIVE" : "DOWN_FROM_ACTIVE",
    feedDistribution: { diameterM: .7, additionalOutsideActive: true, lengthM: null },
    transitionMinimumM: Math.max(.2, .4 * diameterM),
    sharpConeReferenceM: (diameterM - .7) / (2 * Math.tan(Math.PI / 6)),
    coneHalfAngleDeg: 30, transitionPhysicalLengthM: null,
    transitionStatus: diameterM === .7 ? "NO_EXPANSION_RULE_EXCEPTION_REQUIRED" : "KNUCKLES_AND_PHYSICAL_LENGTH_MECHANICAL_TBD",
    interfaceOffsetM: .15, residenceCoefficientMPerM3H: residenceHeight(1, diameterM),
    normalProductM3H: null, residenceHeightM: null, productOpeningNearEdgeM: null,
    productNozzleCentreM: null, productOpeningEnvelopeM: null,
    postOpeningExtensionM: Math.max(.2, .4 * diameterM),
    straightShellLengthM: null, totalAssemblyLengthM: null,
    head: "TORISPHERICAL", headResidenceCreditM3: 0, productNozzle: null };
}
export function calculateEndSections(feed: EndFeedBasis, selections: EndSelections) {
  if (![feed.designFeedRateLph, feed.rrboDensityKgM3, feed.nmpDensityKgM3].every(positive))
    throw new Error("STAGE5_END_FEED_AUTHORITY_INCOMPLETE");
  const percentages = [...feed.oilComponentWt, feed.nmpPurityWt, feed.nmpWaterWt];
  if (feed.oilComponentWt.length !== 6 || !percentages.every(x => Number.isFinite(x) && x >= 0 && x <= 100)
    || Math.abs(feed.oilComponentWt.reduce((a, b) => a + b, 0) - 100) > .01
    || Math.abs(feed.nmpPurityWt + feed.nmpWaterWt - 100) > .01)
    throw new Error("STAGE5_END_COMPOSITION_INVALID");
  const oilM3H = feed.designFeedRateLph / 1000;
  const oilKgH = oilM3H * feed.rrboDensityKgM3;
  const wetSolventKgH = 1.5 * oilKgH;
  const wetSolventM3H = wetSolventKgH / feed.nmpDensityKgM3;
  const componentFeedKgH = [...feed.oilComponentWt.map(w => oilKgH * w / 100), 0];
  componentFeedKgH[5] += wetSolventKgH * feed.nmpPurityWt / 100;
  componentFeedKgH[6] = wetSolventKgH * feed.nmpWaterWt / 100;
  return { ruleset: END_SECTION_RULESET, status: "PROVISIONAL_PRODUCT_BALANCE_PENDING",
    feed: { designFeedRateLph: feed.designFeedRateLph, rrboDensityKgM3: feed.rrboDensityKgM3,
      nmpDensityKgM3: feed.nmpDensityKgM3, oilComponentWt: [...feed.oilComponentWt],
      nmpPurityWt: feed.nmpPurityWt, nmpWaterWt: feed.nmpWaterWt,
      oilM3H, oilKgH, wetSolventKgH, wetSolventM3H, solventOilMassRatio: 1.5 },
    materialContract: {
      status: "NO_QUALIFIED_INDEPENDENT_SO15_BALANCE", componentNames: ["saturates", "monoAromatics", "diAromatics", "polyAromatics", "polarAromatics", "nmp", "water"],
      componentFeedKgH, totalFeedKgH: oilKgH + wetSolventKgH,
      raffinateComponentKgH: null, extractComponentKgH: null, componentResidualKgH: null,
      raffinateDensityKgM3: null, extractDensityKgM3: null,
      requiredEvidence: "Independent S/O=1.5 simultaneous component allocation, mass closure, operating-temperature phase densities and scientific qualification tied to this source. N4/N7 extrapolations are not admitted.",
    },
    nozzles: { oilFeed: endNozzle(oilM3H), wetSolventFeed: endNozzle(wetSolventM3H), raffinate: null, extract: null },
    assemblies: { top: endGeometry(selections.topDiameterM, "top"), bottom: endGeometry(selections.bottomDiameterM, "bottom") },
    comparisons: END_DIAMETERS_M.map(d => endGeometry(d, "top")),
  };
}
export type EndSectionResult = ReturnType<typeof calculateEndSections>;