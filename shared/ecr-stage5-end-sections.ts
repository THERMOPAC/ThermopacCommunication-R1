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
  sourceRevision?: string;
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
export function endNozzle(nozzleBasisM3H: number, hydraulicFactor = 1.2) {
  if (!positive(nozzleBasisM3H) || !positive(hydraulicFactor)) throw new Error("STAGE5_END_INVALID_NOZZLE_FLOW");
  const candidates = [[40, 48.3, 3.68], [50, 60.3, 3.91], [65, 73, 5.16], [80, 88.9, 5.49], [100, 114.3, 6.02]]
    .map(([dn, odMm, wallMm]) => {
      const boreMm = odMm - 2 * wallMm;
      const velocity120MS = hydraulicFactor * nozzleBasisM3H / 3600 / area(boreMm / 1000);
      return { dn, odMm, wallMm, boreMm, velocity120MS, passes: velocity120MS <= .5 };
    });
  return { nozzleBasisM3H, hydraulic120M3H: hydraulicFactor * nozzleBasisM3H,
    requiredBoreMm: 1000 * Math.sqrt(4 * hydraulicFactor * nozzleBasisM3H / 3600 / (Math.PI * .5)),
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
/** Only trusted server source adapters supply these records. These types are
 * not request schemas and do not confer approval on client-supplied objects. */
export interface SystemModelEvidence {
  status: "BUILTIN_MODEL_ELIGIBLE"; modelId: string; version: string; citation: string;
}
export interface QualifiedNormalEndFlow {
  status: "SOURCE_QUALIFIED_NORMAL_FLOW"; qM3H: number;
  sourceIdentity: string; sourceRevision: string;
}
export type SeparationCriterion =
  | { kind: "SYSTEM_UDESIGN_MODEL"; model: SystemModelEvidence; uDesignMS: number }
  | { kind: "SYSTEM_TERMINAL_MODEL"; model: SystemModelEvidence;
      terminalModel: string; governingDropletCriterion: string; propertiesReference: string;
      governingDropletDiameterM: number; dropletModel: SystemModelEvidence; marginModel: SystemModelEvidence;
      terminalVelocityMS: number; safetyFactor: number; factorConvention: "MULTIPLY_VT" | "DIVIDE_VT" };
export type FabricationDiameterRule =
  | { kind: "BUILTIN_SERIES"; model: SystemModelEvidence; diametersM: number[] }
  | { kind: "BUILTIN_INCREMENT"; model: SystemModelEvidence; incrementM: number };
export interface QualifiedOpeningEnvelope {
  model: SystemModelEvidence; sourceIdentity: string;
  nearHalfExtentM: number; farHalfExtentM: number;
}
export interface EndEngineeringEvidence {
  normalFlow?: QualifiedNormalEndFlow;
  separation?: SeparationCriterion;
  fabrication?: FabricationDiameterRule;
  opening?: QualifiedOpeningEnvelope;
  modelDependencies?: string[];
  modelChainStatus?: "ELIGIBLE_AWAITING_SOURCE" | "MODEL_UNAVAILABLE" | "EVALUATED";
  propertyDependencies?: string[];
  modelAudit?: { modelId: string; citation: string; eligibility: string; reason: string }[];
}
export interface EndEngineeringAuthority { top?: EndEngineeringEvidence; bottom?: EndEngineeringEvidence }
const nonempty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const eligible = (a: SystemModelEvidence | undefined) => a?.status === "BUILTIN_MODEL_ELIGIBLE"
  && nonempty(a.modelId) && nonempty(a.version) && nonempty(a.citation);
const modelText = (a: SystemModelEvidence) => `${a.modelId} / ${a.version}; ${a.citation}`;

function calculateGovernedEnd(end: "top" | "bottom", activeDiameterM: number | undefined, evidence: EndEngineeringEvidence = {}) {
  const missingCriteria: string[] = [...(evidence.modelDependencies ?? [])], processDependencies: string[] = [];
  const propertyDependencies = [...(evidence.propertyDependencies ?? [])];
  const flow = evidence.normalFlow;
  const flowReady = flow?.status === "SOURCE_QUALIFIED_NORMAL_FLOW" && positive(flow.qM3H)
    && nonempty(flow.sourceIdentity) && nonempty(flow.sourceRevision);
  if (!flowReady) processDependencies.push("SOURCE_QUALIFIED_NORMAL_PRODUCT_FLOW_AND_SOURCE_REVISION_REQUIRED");
  const q = flowReady ? flow.qM3H : null;
  let u: number | null = null;
  const criterion = evidence.separation;
  if ((!criterion && evidence.modelChainStatus !== "ELIGIBLE_AWAITING_SOURCE")
    || (criterion && !eligible(criterion.model))) missingCriteria.push("MODEL_UNAVAILABLE:END_SEPARATION_CRITERION");
  if (criterion?.kind === "SYSTEM_UDESIGN_MODEL") {
    if (!positive(criterion.uDesignMS)) missingCriteria.push("MODEL_UNAVAILABLE:FINITE_POSITIVE_SYSTEM_UDESIGN");
    else if (eligible(criterion.model) && !propertyDependencies.length) u = criterion.uDesignMS;
  } else if (criterion?.kind === "SYSTEM_TERMINAL_MODEL") {
    const before = missingCriteria.length;
    if (!nonempty(criterion.terminalModel)) missingCriteria.push("MODEL_UNAVAILABLE:TERMINAL_VELOCITY_MODEL");
    if (!nonempty(criterion.governingDropletCriterion) || !eligible(criterion.dropletModel)
      || !positive(criterion.governingDropletDiameterM)) missingCriteria.push("MODEL_UNAVAILABLE:GOVERNING_OUTLET_DROPLET_MODEL");
    if (!nonempty(criterion.propertiesReference)) propertyDependencies.push("PROPERTY_SOURCE_REQUIRED:OPERATING_PRODUCT_PHASE_PROPERTIES");
    if (!positive(criterion.terminalVelocityMS)) missingCriteria.push("MODEL_UNAVAILABLE:VALID_TERMINAL_VELOCITY_RESULT");
    if (!eligible(criterion.marginModel) || !positive(criterion.safetyFactor)) missingCriteria.push("MODEL_UNAVAILABLE:DEFINED_DESIGN_MARGIN");
    if (!["MULTIPLY_VT", "DIVIDE_VT"].includes(criterion.factorConvention))
      missingCriteria.push("MODEL_UNAVAILABLE:MARGIN_MULTIPLY_OR_DIVIDE_CONVENTION");
    if (missingCriteria.length === before && eligible(criterion.model) && !propertyDependencies.length) u = criterion.factorConvention === "MULTIPLY_VT"
      ? criterion.terminalVelocityMS * criterion.safetyFactor : criterion.terminalVelocityMS / criterion.safetyFactor;
    if (u !== null && u > criterion.terminalVelocityMS) {
      missingCriteria.push("MODEL_UNAVAILABLE:ALLOWABLE_VELOCITY_EXCEEDS_TERMINAL_VELOCITY");
      u = null;
    }
  } else if (evidence.modelChainStatus !== "ELIGIBLE_AWAITING_SOURCE") {
    missingCriteria.push("MODEL_UNAVAILABLE:SYSTEM_DROPLET_TERMINAL_VELOCITY_AND_MARGIN_CHAIN");
  }
  if (u !== null && !positive(u)) { missingCriteria.push("FINITE_POSITIVE_UDESIGN_REQUIRED"); u = null; }
  const criterionReady = u !== null;
  let dCalc = q !== null && u !== null ? Math.sqrt(4 * (q / 3600) / (Math.PI * u)) : null;
  if (dCalc !== null && !positive(dCalc)) { missingCriteria.push("MODEL_UNAVAILABLE:FINITE_POSITIVE_DCALC"); dCalc = null; }
  const rule = evidence.fabrication;
  let roundingDescription: string | null = null, diameterM: number | null = null;
  if (!rule || !eligible(rule.model)) missingCriteria.push("MODEL_UNAVAILABLE:FABRICATION_DIAMETER_ROUNDING_RULE");
  else if (rule.kind === "BUILTIN_SERIES" && rule.diametersM.length && rule.diametersM.every(positive)) {
    const series = [...new Set(rule.diametersM)].sort((a, b) => a - b);
    roundingDescription = `Built-in series [${series.join(", ")}] m; upward only; ${modelText(rule.model)}`;
    if (dCalc !== null) {
      diameterM = series.find(d => d >= dCalc) ?? null;
      if (diameterM === null) missingCriteria.push("MODEL_UNAVAILABLE:FABRICATION_SERIES_NO_DIAMETER_AT_OR_ABOVE_DCALC");
    }
  } else if (rule.kind === "BUILTIN_INCREMENT" && positive(rule.incrementM)) {
    roundingDescription = `Built-in ${rule.incrementM} m increment from zero; upward only; ${modelText(rule.model)}`;
    if (dCalc !== null) {
      diameterM = Math.ceil(dCalc / rule.incrementM) * rule.incrementM;
      if (diameterM < dCalc) diameterM += rule.incrementM;
      if (!positive(diameterM)) {
        diameterM = null;
        missingCriteria.push("MODEL_UNAVAILABLE:FINITE_POSITIVE_FABRICATION_DIAMETER");
      }
    }
  } else missingCriteria.push("MODEL_UNAVAILABLE:VALID_FABRICATION_DIAMETER_RULE");
  const activeReady = typeof activeDiameterM === "number" && positive(activeDiameterM);
  const transitionRequired = diameterM !== null && activeReady && diameterM <= activeDiameterM;
  let residenceHeightM = q !== null && diameterM !== null ? residenceHeight(q, diameterM) : null;
  if (residenceHeightM !== null && !positive(residenceHeightM)) {
    residenceHeightM = null;
    missingCriteria.push("MODEL_UNAVAILABLE:FINITE_POSITIVE_H10");
  }
  const postOpeningExtensionM = diameterM === null ? null : Math.max(.2, .4 * diameterM);
  const envelope = evidence.opening;
  const envelopeReady = envelope && eligible(envelope.model) && nonempty(envelope.sourceIdentity)
    && positive(envelope.nearHalfExtentM) && positive(envelope.farHalfExtentM);
  const near = envelopeReady ? envelope.nearHalfExtentM : null, far = envelopeReady ? envelope.farHalfExtentM : null;
  const nearEdge = residenceHeightM === null ? null : .15 + residenceHeightM;
  const centre = nearEdge !== null && near !== null ? nearEdge + near : null;
  const farEdge = centre !== null && far !== null ? centre + far : null;
  const straight = farEdge !== null && postOpeningExtensionM !== null ? farEdge + postOpeningExtensionM : null;
  const holds = [
    ...(!activeReady ? ["FROZEN_ACTIVE_DIAMETER_AUTHORITY_REQUIRED"] : []),
    ...(missingCriteria.length ? ["MODEL_UNAVAILABLE", "DESIGN_CRITERION_REQUIRED"] : []),
    ...(propertyDependencies.length ? ["PROPERTY_SOURCE_REQUIRED"] : []),
    ...(processDependencies.length ? ["PROCESS_SOURCE_REQUIRED"] : []),
    ...(transitionRequired ? ["TRANSITION_RULE_REQUIRED"] : []),
  ];
  return {
    end, status: holds.length ? "HOLD" : "CALCULATED_CONDITIONAL",
    overallEngineeringStatus: holds.length ? `HOLD / ${holds.join(" / ")}` : "CALCULATED / CONDITIONAL_MECHANICAL_CLOSURE",
    holds, missingCriteria, processDependencies, propertyDependencies, modelAudit: evidence.modelAudit ?? [],
    separationDuty: end === "top" ? "NMP droplets settling/returning against upward RRBO-rich raffinate"
      : "RRBO droplets rising/returning against downward NMP-rich extract",
    normalProductM3H: q, flowSource: flowReady ? { identity: flow.sourceIdentity, revision: flow.sourceRevision } : null,
    separationCriterionStatus: criterionReady ? "BUILTIN_MODEL_ELIGIBLE"
      : evidence.modelChainStatus === "ELIGIBLE_AWAITING_SOURCE" ? "BUILTIN_MODEL_ELIGIBLE_AWAITING_PROCESS_OR_PROPERTIES"
        : "MODEL_UNAVAILABLE / DESIGN_CRITERION_REQUIRED",
    criterionBasis: criterionReady ? criterion! : null, uDesignMS: u, calculatedDiameterM: dCalc,
    fabricationRoundingRule: roundingDescription, diameterM,
    diameterStatus: diameterM === null ? "HOLD" : transitionRequired ? "CALCULATED_HOLD_TRANSITION_RULE" : "SYSTEM_CALCULATED_FROM_GOVERNED_MODELS",
    residenceHeightM, residenceTimeMinutes: 10, usableVolumeFactor: .90,
    feedDistribution: { diameterM: activeReady ? activeDiameterM : null, additionalOutsideActive: true, lengthM: null },
    transition: {
      status: transitionRequired ? "TRANSITION_RULE_REQUIRED" : diameterM === null || !activeReady ? "DIAMETER_PENDING"
        : "NOMINAL_30_DEG_REFERENCE_ONLY_FORMED_JUNCTION_AND_ANGLE_CONVENTION_UNQUALIFIED",
      inheritedActiveDiameterM: activeReady ? activeDiameterM : null, endDiameterM: diameterM,
      conicalAngleReferenceDeg: 30, angleConvention: "HALF_ANGLE_ASSUMED_FOR_REFERENCE_ONLY_NOT_FABRICATION_APPROVAL",
      nominalSharpConeReferenceM: diameterM !== null && activeReady && !transitionRequired
        ? (diameterM - activeDiameterM) / (2 * Math.tan(Math.PI / 6)) : null,
      minimumLengthM: diameterM !== null && !transitionRequired ? Math.max(.2, .4 * diameterM) : null,
      physicalLengthM: null, formedJunctionStatus: "ENGINEERING_QUALIFICATION_REQUIRED", residenceCreditM3: 0,
    },
    interfaceAllowanceM: .150, interfaceDirection: end === "top" ? "UP_FROM_TRANSITION" : "DOWN_FROM_TRANSITION",
    interfaceResidenceCreditM3: 0,
    productOpeningNearEdgeM: nearEdge, productNozzleCentreM: centre, productOpeningFarEdgeM: farEdge,
    productNozzlePositionStatus: centre === null ? "PENDING_QUALIFIED_OPENING_ENVELOPE_OR_H10" : "CALCULATED_RELATIVE_TO_TRANSITION_ONLY",
    productOpeningEnvelopeM: near !== null && far !== null ? { eNearM: near, eFarM: far } : null,
    nozzleEnvelopeStatus: envelopeReady ? "QUALIFIED_SOURCE_ENVELOPE" : "QUALIFIED_NOZZLE_OPENING_ENVELOPE_REQUIRED",
    nozzleEnvelopeSource: envelopeReady ? `${envelope.sourceIdentity}; ${modelText(envelope.model)}` : null,
    postOpeningExtensionM, straightShellHeightM: straight,
    straightShellStatus: straight === null ? "CONDITIONAL_PENDING_H10_OR_NOZZLE_ENVELOPE" : "CALCULATED_RELATIVE_SHELL_ONLY",
    head: { type: "TORISPHERICAL", status: "SPECIFIED_PROFILE_MECHANICAL_DIMENSIONS_PENDING", residenceCreditM3: 0 },
    totalAssemblyHeightM: null, overallElevationStatus: "PENDING_NECK_TRANSITION_HEAD_AND_GLOBAL_DATUM",
  };
}
export const AUTOMATIC_END_RULESET = "ECR_END_SECTIONS_INDEPENDENT_DIAMETER_HEIGHT_V4";
export function calculateAutomaticEndSections(feed: EndFeedBasis, normalProducts: NormalProductDuty | null = null,
  activeDiameterM?: number, authority: EndEngineeringAuthority = {}) {
  const basis = calculateEndProcessBasis(feed, normalProducts);
  const evidence = (end: "top" | "bottom"): EndEngineeringEvidence => ({
    ...(normalProducts && nonempty(normalProducts.sourceRevision) ? { normalFlow: {
      status: "SOURCE_QUALIFIED_NORMAL_FLOW" as const,
      qM3H: basis.normalProductFlows[end === "top" ? "topM3H" : "bottomM3H"]!,
      sourceIdentity: normalProducts.sourceIdentity, sourceRevision: normalProducts.sourceRevision,
    } } : {}),
    ...authority[end],
  });
  const assemblies = { top: calculateGovernedEnd("top", activeDiameterM, evidence("top")),
    bottom: calculateGovernedEnd("bottom", activeDiameterM, evidence("bottom")) };
  return { ...basis, ruleset: AUTOMATIC_END_RULESET,
    status: Object.values(assemblies).every(a => a.status === "HOLD") ? "SYSTEM_END_DESIGN_PENDING" : "SYSTEM_END_DESIGN_CALCULATED_CONDITIONAL",
    selectionAuthority: "SERVER_BUILTIN_PER_END_MODELS" as const,
    pendingRequirements: Object.values(assemblies).flatMap(a => [...a.missingCriteria, ...a.processDependencies, ...a.propertyDependencies,
      ...a.holds.filter(h => h === "TRANSITION_RULE_REQUIRED" || h === "FROZEN_ACTIVE_DIAMETER_AUTHORITY_REQUIRED"),
      ...(a.nozzleEnvelopeStatus === "QUALIFIED_SOURCE_ENVELOPE" ? [] : [a.nozzleEnvelopeStatus]), a.transition.formedJunctionStatus]
      .map(s => `${a.end.toUpperCase()}: ${s}`)),
    normalProductFlows: { topM3H: assemblies.top.normalProductM3H, bottomM3H: assemblies.bottom.normalProductM3H },
    assemblies,
  };
}
export type EndSectionResult = ReturnType<typeof calculateEndSections>;
export type AutomaticEndSectionResult = ReturnType<typeof calculateAutomaticEndSections>;
/** One display contract for the UI and current Engineering Report. */
export function endEngineeringRows(a: AutomaticEndSectionResult["assemblies"]["top"]): [string, string][] {
  const value = (v: number | null | undefined, unit = "m") => v == null ? "Pending" : `${Number(v.toPrecision(6))} ${unit}`;
  const basis = a.criterionBasis;
  return [
    ["Overall engineering status", a.overallEngineeringStatus],
    ["Normal product flow Qnormal", value(a.normalProductM3H, "m³/h")],
    ["Flow source / revision", a.flowSource ? `${a.flowSource.identity} / ${a.flowSource.revision}` : "PROCESS_SOURCE_REQUIRED"],
    ["Separation duty", a.separationDuty],
    ["System separation model status", a.separationCriterionStatus],
    ["System separation model / version / citation", basis ? modelText(basis.model) : a.separationCriterionStatus],
    ["Governing droplet diameter / model", basis?.kind === "SYSTEM_TERMINAL_MODEL"
      ? `${value(basis.governingDropletDiameterM)}; ${basis.governingDropletCriterion}; ${modelText(basis.dropletModel)}` : "MODEL_UNAVAILABLE or system Udesign model"],
    ["Terminal velocity / model", basis?.kind === "SYSTEM_TERMINAL_MODEL"
      ? `${value(basis.terminalVelocityMS, "m/s")}; ${modelText(basis.model)}` : "No qualified terminal result"],
    ["Product-property source", basis?.kind === "SYSTEM_TERMINAL_MODEL" ? basis.propertiesReference
      : a.propertyDependencies.join("; ") || "See system model basis"],
    ["System margin / convention", basis?.kind === "SYSTEM_TERMINAL_MODEL"
      ? `${basis.safetyFactor}; ${basis.factorConvention}; ${modelText(basis.marginModel)}` : "MODEL_UNAVAILABLE or included in system Udesign model"],
    ["System allowable velocity Udesign", value(a.uDesignMS, "m/s")],
    ["Calculated minimum diameter Dcalc", value(a.calculatedDiameterM)],
    ["Fabrication rounding rule", a.fabricationRoundingRule ?? "MODEL_UNAVAILABLE: fabrication rule"],
    ["Selected physical shell ID Dshell", `${value(a.diameterM)}; ${a.diameterStatus}`],
    ["Ten-minute residence height H10", `${value(a.residenceHeightM)}; NORMAL flow, 10 min, usable fraction 0.90`],
    ["Transition status", a.transition.status],
    ["Transition nominal / minimum / physical", `${value(a.transition.nominalSharpConeReferenceM)} / ${value(a.transition.minimumLengthM)} / ${value(a.transition.physicalLengthM)}; 30° half-angle reference only; formed junction unqualified; zero residence credit`],
    ["Interface allowance", `0.150 m; ${a.interfaceDirection}; zero residence credit`],
    ["Product opening near edge / centre / far edge", `${value(a.productOpeningNearEdgeM)} / ${value(a.productNozzleCentreM)} / ${value(a.productOpeningFarEdgeM)}; relative outward from transition`],
    ["Product-nozzle position status", a.productNozzlePositionStatus],
    ["Opening envelope eNear / eFar", `${value(a.productOpeningEnvelopeM?.eNearM)} / ${value(a.productOpeningEnvelopeM?.eFarM)}; ${a.nozzleEnvelopeStatus}`],
    ["Opening envelope source", a.nozzleEnvelopeSource ?? "Qualified physical envelope unavailable"],
    ["Post-opening extension", `${value(a.postOpeningExtensionM)}; max(0.200 m, 0.40 Dshell), from far edge`],
    ["Total straight-shell height", `${value(a.straightShellHeightM)}; ${a.straightShellStatus}`],
    ["Torispherical dish", `${a.head.status}; zero residence credit`],
    ["Overall assembly / elevation", `${value(a.totalAssemblyHeightM)}; ${a.overallElevationStatus}`],
    ["Specific system-model gaps", a.missingCriteria.join("; ") || "None for diameter model chain"],
    ["Process dependencies", a.processDependencies.join("; ") || "Qualified normal end flow available"],
    ["Property dependencies", a.propertyDependencies.join("; ") || "See source/model trace"],
  ];
}
export type Stage5EndProjection = AutomaticEndSectionResult & {
  sourceHash: string; stage1Hash: string;
  normalProductAuthority?: { status: string; detail: string; holds: string[] };
  active: { revisionId: string; sourceHash?: string; diameterM: number; compartmentCount: number; installedActiveHeightM: number };
};