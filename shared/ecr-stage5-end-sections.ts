/** Normal process basis governs residence and material balance.
 * S/O=1.5 MASS is a NOZZLE-ONLY override, never a product redistribution.
 * Normal product evidence can only be supplied by a server-owned source adapter,
 * not the selections API. No user-set qualification flag exists. */
export const END_SECTION_RULESET = "ECR_END_SECTIONS_NORMAL_PROCESS_NOZZLE_ONLY_SO15_V2";
export const END_DIAMETERS_M = [.7, .9, 1, 1.2] as const;
export interface EndFeedBasis {
  designFeedRateLph: number;
  rrboDensityKgM3: number;
  nmpDensityKgM3: number;
  solventOilRatio: number;
  oilComponentWt: number[];
  nmpPurityWt: number;
  nmpWaterWt: number;
}
export interface EndSelections { topDiameterM: number; bottomDiameterM: number }
/** Already source-qualified normal duty, not a request-body input. Closure below
 * checks numerical consistency; it does not itself confer scientific authority. */
export interface NormalProductDuty {
  sourceIdentity: string;
  raffinateComponentKgH: number[];
  extractComponentKgH: number[];
  raffinateDensityKgM3: number;
  extractDensityKgM3: number;
}
const positive = (x: number) => Number.isFinite(x) && x > 0;
const area = (d: number) => Math.PI * d * d / 4;
export function residenceHeight(normalProductM3H: number, diameterM: number) {
  if (!positive(normalProductM3H) || !positive(diameterM)) throw new Error("STAGE5_END_INVALID_RESIDENCE_INPUT");
  return normalProductM3H / (6 * .9 * area(diameterM));
}
export function endNozzle(nozzleBasisM3H: number) {
  if (!positive(nozzleBasisM3H)) throw new Error("STAGE5_END_INVALID_NOZZLE_FLOW");
  const candidates = [[40, 48.3, 3.68], [50, 60.3, 3.91], [65, 73, 5.16], [80, 88.9, 5.49], [100, 114.3, 6.02]]
    .map(([dn, odMm, wallMm]) => {
      const boreMm = odMm - 2 * wallMm;
      const velocity120MS = 1.2 * nozzleBasisM3H / 3600 / area(boreMm / 1000);
      return { dn, odMm, wallMm, boreMm, velocity120MS, passes: velocity120MS <= .5 };
    });
  return { nozzleBasisM3H, hydraulic120M3H: 1.2 * nozzleBasisM3H,
    requiredBoreMm: 1000 * Math.sqrt(4 * 1.2 * nozzleBasisM3H / 3600 / (Math.PI * .5)),
    provisionalDn: candidates.find(c => c.passes)?.dn ?? null, candidates };
}
export function endGeometry(diameterM: number, end: "top" | "bottom", normalProductM3H: number | null = null) {
  if (!END_DIAMETERS_M.some(d => d === diameterM)) throw new Error("STAGE5_END_INVALID_DIAMETER");
  return { end, diameterM, direction: end === "top" ? "UP_FROM_ACTIVE" : "DOWN_FROM_ACTIVE",
    feedDistribution: { diameterM: .7, additionalOutsideActive: true, lengthM: null },
    transitionMinimumM: Math.max(.2, .4 * diameterM),
    sharpConeReferenceM: (diameterM - .7) / (2 * Math.tan(Math.PI / 6)),
    coneHalfAngleDeg: 30, transitionPhysicalLengthM: null,
    transitionStatus: diameterM === .7 ? "NO_EXPANSION_RULE_EXCEPTION_REQUIRED" : "KNUCKLES_AND_PHYSICAL_LENGTH_MECHANICAL_TBD",
    interfaceOffsetM: .15, residenceCoefficientMPerM3H: residenceHeight(1, diameterM),
    normalProductM3H, residenceHeightM: normalProductM3H === null ? null : residenceHeight(normalProductM3H, diameterM),
    productOpeningNearEdgeM: normalProductM3H === null ? null : .15 + residenceHeight(normalProductM3H, diameterM),
    productNozzleCentreM: null, productOpeningEnvelopeM: null,
    postOpeningExtensionM: Math.max(.2, .4 * diameterM),
    straightShellLengthM: null, totalAssemblyLengthM: null,
    head: "TORISPHERICAL", headResidenceCreditM3: 0, productNozzle: null };
}
function calculateEndProcessBasis(feed: EndFeedBasis, normalProducts: NormalProductDuty | null = null) {
  if (![feed.designFeedRateLph, feed.rrboDensityKgM3, feed.nmpDensityKgM3, feed.solventOilRatio].every(positive))
    throw new Error("STAGE5_END_FEED_AUTHORITY_INCOMPLETE");
  const percentages = [...feed.oilComponentWt, feed.nmpPurityWt, feed.nmpWaterWt];
  if (feed.oilComponentWt.length !== 6 || !percentages.every(x => Number.isFinite(x) && x >= 0 && x <= 100)
    || Math.abs(feed.oilComponentWt.reduce((a, b) => a + b, 0) - 100) > .01
    || Math.abs(feed.nmpPurityWt + feed.nmpWaterWt - 100) > .01)
    throw new Error("STAGE5_END_COMPOSITION_INVALID");
  const oilM3H = feed.designFeedRateLph / 1000;
  const oilKgH = oilM3H * feed.rrboDensityKgM3;
  const wetSolventKgH = feed.solventOilRatio * oilKgH;
  const wetSolventM3H = wetSolventKgH / feed.nmpDensityKgM3;
  const componentFeedKgH = [...feed.oilComponentWt.map(w => oilKgH * w / 100), 0];
  componentFeedKgH[5] += wetSolventKgH * feed.nmpPurityWt / 100;
  componentFeedKgH[6] = wetSolventKgH * feed.nmpWaterWt / 100;
  let componentResidualKgH: number[] | null = null;
  let topNormalM3H: number | null = null, bottomNormalM3H: number | null = null;
  if (normalProducts !== null) {
    const vectors = [normalProducts.raffinateComponentKgH, normalProducts.extractComponentKgH];
    if (typeof normalProducts.sourceIdentity !== "string" || !normalProducts.sourceIdentity.trim()
      || !vectors.every(v => Array.isArray(v) && v.length === 7 && v.every(x => Number.isFinite(x) && x >= 0))
      || ![normalProducts.raffinateDensityKgM3, normalProducts.extractDensityKgM3].every(positive))
      throw new Error("STAGE5_END_NORMAL_PRODUCT_CONTRACT_INVALID");
    componentResidualKgH = componentFeedKgH.map((m, i) =>
      m - normalProducts.raffinateComponentKgH[i] - normalProducts.extractComponentKgH[i]);
    if (componentResidualKgH.some((r, i) => Math.abs(r) > Math.max(1e-6, componentFeedKgH[i] * 1e-6)))
      throw new Error("STAGE5_END_NORMAL_COMPONENT_BALANCE_INVALID");
    topNormalM3H = normalProducts.raffinateComponentKgH.reduce((a, b) => a + b, 0) / normalProducts.raffinateDensityKgM3;
    bottomNormalM3H = normalProducts.extractComponentKgH.reduce((a, b) => a + b, 0) / normalProducts.extractDensityKgM3;
    if (![topNormalM3H, bottomNormalM3H].every(positive)) throw new Error("STAGE5_END_NORMAL_PRODUCT_FLOW_INVALID");
  }
  // Completely separate namespace: never feed nozzle override back into the
  // normal material contract, product volumes, H10 or shell geometry.
  const nozzleWetSolventKgH = 1.5 * oilKgH;
  return { ruleset: END_SECTION_RULESET, status: normalProducts ? "PROVISIONAL_NORMAL_RESIDENCE_CALCULATED" : "PROVISIONAL_NORMAL_PRODUCT_AUTHORITY_PENDING",
    feed: { designFeedRateLph: feed.designFeedRateLph, rrboDensityKgM3: feed.rrboDensityKgM3,
      nmpDensityKgM3: feed.nmpDensityKgM3, oilComponentWt: [...feed.oilComponentWt],
      nmpPurityWt: feed.nmpPurityWt, nmpWaterWt: feed.nmpWaterWt,
      oilM3H, oilKgH, wetSolventKgH, wetSolventM3H, solventOilMassRatio: feed.solventOilRatio },
    materialContract: {
      status: normalProducts ? "SOURCE_QUALIFIED_NORMAL_DUTY" : "NORMAL_PRODUCT_AUTHORITY_PENDING",
      normalProductSourceIdentity: normalProducts?.sourceIdentity ?? null,
      componentNames: ["saturates", "monoAromatics", "diAromatics", "polyAromatics", "polarAromatics", "nmp", "water"],
      componentFeedKgH, totalFeedKgH: oilKgH + wetSolventKgH,
      raffinateComponentKgH: normalProducts ? [...normalProducts.raffinateComponentKgH] : null,
      extractComponentKgH: normalProducts ? [...normalProducts.extractComponentKgH] : null, componentResidualKgH,
      raffinateDensityKgM3: normalProducts?.raffinateDensityKgM3 ?? null, extractDensityKgM3: normalProducts?.extractDensityKgM3 ?? null,
      requiredEvidence: normalProducts ? "Normal product duty is source-qualified; nozzle and mechanical holds remain separate."
        : "Source-qualified simultaneous NORMAL product allocation and operating-temperature product densities tied to saved Stage 1 and the frozen active duty are required. Stage 4 theoretical-stage references do not designate an end-duty product trial; N4/N7 must not be chosen automatically. No S/O 1.5 product balance is required.",
    },
    nozzleSizingBasis: { scope: "NOZZLES_ONLY_NOT_NORMAL_PROCESS", solventOilMassRatio: 1.5,
      oilKgH, oilM3H, wetSolventKgH: nozzleWetSolventKgH, wetSolventM3H: nozzleWetSolventKgH / feed.nmpDensityKgM3,
      hydraulicFactor: 1.2, productEnvelopeStatus: "DEFENSIBLE_PRODUCT_NOZZLE_ENVELOPE_UNAVAILABLE" },
    nozzles: { oilFeed: endNozzle(oilM3H), wetSolventFeed: endNozzle(nozzleWetSolventKgH / feed.nmpDensityKgM3), raffinate: null, extract: null },
    normalProductFlows: { topM3H: topNormalM3H, bottomM3H: bottomNormalM3H },
  };
}
/** Historical comparison calculator, not current system-owned design authority. */
export function calculateEndSections(feed: EndFeedBasis, selections: EndSelections, normalProducts: NormalProductDuty | null = null) {
  const basis = calculateEndProcessBasis(feed, normalProducts);
  const { topM3H, bottomM3H } = basis.normalProductFlows;
  return { ...basis,
    assemblies: { top: endGeometry(selections.topDiameterM, "top", topM3H), bottom: endGeometry(selections.bottomDiameterM, "bottom", bottomM3H) },
    comparisons: END_DIAMETERS_M.map(d => ({ ...endGeometry(d, "top", topM3H),
      bottomResidenceHeightM: bottomM3H === null ? null : residenceHeight(bottomM3H, d) })),
  };
}
export const AUTOMATIC_END_RULESET = "ECR_END_SECTIONS_SYSTEM_AUTHORITY_PENDING_V3";
export function calculateAutomaticEndSections(feed: EndFeedBasis, normalProducts: NormalProductDuty | null = null) {
  const basis = calculateEndProcessBasis(feed, normalProducts);
  const pending = () => ({ diameterM: null, residenceHeightM: null, straightShellHeightM: null,
    totalAssemblyHeightM: null, productOpeningNearEdgeM: null, productOpeningEnvelopeM: null });
  return { ...basis, ruleset: AUTOMATIC_END_RULESET, status: "SYSTEM_END_DESIGN_PENDING",
    selectionAuthority: "NO_ADMITTED_SYSTEM_DIAMETER_RULE" as const,
    pendingRequirements: [
      ...(!normalProducts ? ["Source-qualified NORMAL raffinate/extract flows and operating-temperature densities."] : []),
      "An approved independent system diameter-selection rule. Ten-minute residence relates diameter and height; it does not uniquely select either.",
      "Qualified opening envelopes and mechanical neck, transition and head geometry.",
    ],
    assemblies: { top: pending(), bottom: pending() },
  };
}
export type EndSectionResult = ReturnType<typeof calculateEndSections>;
export type AutomaticEndSectionResult = ReturnType<typeof calculateAutomaticEndSections>;
export type Stage5EndProjection = AutomaticEndSectionResult & {
  sourceHash: string; stage1Hash: string;
  normalProductAuthority?: { status: string; detail: string; holds: string[] };
  active: { revisionId: string; sourceHash?: string; diameterM: number; compartmentCount: number; installedActiveHeightM: number };
};