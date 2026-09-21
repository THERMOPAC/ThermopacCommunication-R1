import { kuhniRunHash } from './kuhni-hydrodynamics';
import { RRBO_HYDRAULIC_METHOD } from './rrbo-wetnmp-hydraulic-p1';
import { ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION } from './stage3-stage4-optimizer';

export const AUTOMATIC_SELECTION_VERSION = 'P1_AREA_LOADING_GLOBAL_CHORD_V1';
// Tie resolution only; never used to relax hydraulic acceptance.
export const KNEE_TIE_EPSILON = 32 * Number.EPSILON;
const policy = {
  version: AUTOMATIC_SELECTION_VERSION,
  representative: 'MINIMUM_WORST_SIX_SCENARIO_LOADING_THEN_RPM_HC_ROTOR_FREE',
  curve: 'SIZE_NONDOMINATED_CROSS_SECTION_AREA_VS_WORST_LOADING',
  score: 'NORMALIZED_LOADING_REDUCTION_MINUS_NORMALIZED_AREA',
  fallback: 'SMALLEST_ELIGIBLE_IF_NO_POSITIVE_INTERIOR_DEPARTURE',
  tieEpsilon: KNEE_TIE_EPSILON,
  acceptance: 'SIX_LOWER_CONNECTED_ROOTS_LOADING_LE_0.70_TIP_LE_4.5',
};
export const AUTOMATIC_SELECTION_HASH = kuhniRunHash(policy);
export type AutomaticHydraulicSelection = ReturnType<typeof resolveAutomaticHydraulicSelection>;
const positive = (x: any) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const identities = [.36, .42, .43].flatMap(c => ['BARRY_PARLANGE_MOBILE', 'SCHILLER_NAUMANN_IMMOBILE'].map(i => `${c}:${i}`));

/** Consumes trusted server evidence only. No physics execution, window or ranking dependency. */
export function resolveAutomaticHydraulicSelection(run: any, currentHash: string) {
  const r = run?.result;
  if (run?.status !== 'completed' || run.sourceSnapshotHash !== currentHash
    || run.basis?.stage1SnapshotHash !== currentHash
    || r?.stage1Authority?.snapshotHash !== currentHash
    || r?.processBasis?.stage1SnapshotHash !== currentHash
    || kuhniRunHash(r?.processBasis) !== kuhniRunHash(run?.basis)
    || run.basis?.phaseConfiguration !== run.phaseConfiguration
    || run.basis?.operatingTemperatureC !== 40
    || run.phaseConfiguration !== 'rrbo-continuous-nmp-dispersed'
    || r?.engine?.version !== ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION
    || r?.engine?.implementationHash !== ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH) {
    throw new Error('AUTOMATIC_SELECTION_CURRENT_P1_SOURCE_REQUIRED');
  }
  const { calculationHash, ...payload } = r;
  if (kuhniRunHash(payload) !== calculationHash) throw new Error('AUTOMATIC_SELECTION_SOURCE_INTEGRITY_FAILURE');
  const points: any[] = [];
  let rejected = 0;
  const grid = r.orientationComparison?.find((o: any) => o.orientation === run.phaseConfiguration)?.geometryGrid ?? [];
  for (const group of grid) for (const t of group.trials ?? []) {
    const g = group.geometry;
    const s = t.hydraulicMethod?.scenarios;
    const matches = g && t.diameterM === g.columnDiameterM && t.compartmentHeightM === g.compartmentHeightM
      && t.rotorDiameterM === g.rotorDiameterM && t.freeArea === g.freeArea
      && t.hcToColumn === g.hcToColumn && t.rotorToColumn === g.rotorToColumn
      && g.compartmentHeightM === g.columnDiameterM * g.hcToColumn
      && g.rotorDiameterM === g.columnDiameterM * g.rotorToColumn;
    const valid = matches && t.status === 'FEASIBLE' && t.validity !== 'PHYSICAL_INVALID'
      && [t.diameterM, t.compartmentHeightM, t.rotorDiameterM, t.freeArea, t.rpm, t.tipSpeedMS].every(positive)
      && t.tipSpeedMS <= 4.5 && t.hydraulicMethod?.methodId === RRBO_HYDRAULIC_METHOD
      && Array.isArray(s) && s.length === 6 && new Set(s.map((v: any) => `${v.coefficient}:${v.interfaceScenario}`)).size === 6
      && s.every((v: any) => identities.includes(`${v.coefficient}:${v.interfaceScenario}`)
        && [v.loading, v.d32M, v.operatingHoldup, v.floodHoldup, v.capacityMS, v.interfacialAreaM2M3,
          v.terminalSpeedMS, v.characteristicSpeedMS].every(positive)
        && [v.forceBalanceResidualN, v.operatingBalanceResidualMS].every(x => typeof x === 'number' && Number.isFinite(x))
        && v.loading <= .70 && v.operatingHoldup < v.floodHoldup && v.floodHoldup < 1
        && v.branchStatus === 'LOWER_QUASI_STEADY_ADMISSIBLE'
        && Array.isArray(v.operatingRoots) && v.operatingRoots.length > 0
        && v.operatingRoots.every(positive) && v.operatingHoldup === Math.min(...v.operatingRoots)
        && v.continuation?.length === 16
        && v.continuation.every((p: any, i: number) => p.flowFraction === (i + 1) / 16
          && positive(p.holdup) && p.holdup < v.floodHoldup
          && (i === 0 || p.holdup >= v.continuation[i - 1].holdup))
        && v.continuation[15].holdup === v.operatingHoldup);
    if (!valid) { rejected++; continue; }
    points.push({ geometry: g, trial: t, loading: Math.max(...s.map((v: any) => v.loading)),
      areaM2: Math.PI * t.diameterM ** 2 / 4,
      minimumInterfacialAreaM2M3: Math.min(...s.map((v: any) => v.interfacialAreaM2M3)),
      minimumHoldupGap: Math.min(...s.map((v: any) => v.floodHoldup - v.operatingHoldup)) });
  }
  const compare = (a: any, b: any) => a.loading - b.loading || a.trial.rpm - b.trial.rpm
    || a.geometry.compartmentHeightM - b.geometry.compartmentHeightM
    || a.geometry.rotorDiameterM - b.geometry.rotorDiameterM || a.geometry.freeArea - b.geometry.freeArea;
  const ds = [...new Set<number>(points.map(p => p.geometry.columnDiameterM))].sort((a, b) => a - b);
  const refs = ds.map(d => {
    const atD = points.filter(p => p.geometry.columnDiameterM === d).sort(compare);
    return { ...atD[0], feasibleConfigurationCount: atD.length, dominated: false,
      areaIncreasePercent: null as number | null, loadingImprovementPercent: null as number | null,
      elasticity: null as number | null, normalizedScore: null as number | null };
  });
  let best = Infinity;
  refs.forEach((p, i) => {
    p.dominated = p.loading >= best;
    best = Math.min(best, p.loading);
    if (i) {
      p.areaIncreasePercent = 100 * (p.areaM2 / refs[i - 1].areaM2 - 1);
      p.loadingImprovementPercent = 100 * (1 - p.loading / refs[i - 1].loading);
      p.elasticity = p.loadingImprovementPercent / p.areaIncreasePercent;
    }
  });
  const curve = refs.filter(p => !p.dominated);
  let selected = refs[0] ?? null;
  let status = selected ? 'SMALLEST_FEASIBLE_NO_RESOLVED_KNEE' : 'NO_ELIGIBLE_HYDRAULIC_CONFIGURATION';
  if (curve.length >= 3) {
    const first = curve[0], last = curve[curve.length - 1];
    if (last.areaM2 > first.areaM2 && first.loading > last.loading) {
      curve.forEach(p => { p.normalizedScore = (first.loading - p.loading) / (first.loading - last.loading)
        - (p.areaM2 - first.areaM2) / (last.areaM2 - first.areaM2); });
      const maximum = Math.max(...curve.slice(1, -1).map(p => p.normalizedScore!));
      if (maximum > KNEE_TIE_EPSILON) {
        selected = curve.slice(1, -1).find(p => maximum - p.normalizedScore! <= KNEE_TIE_EPSILON)!;
        status = 'AUTOMATIC_DISCRETE_KNEE_SELECTED';
      }
    }
  }
  const result = {
    policy, policyHash: AUTOMATIC_SELECTION_HASH, status, selected, references: refs,
    qualification: 'PRELIMINARY_EXTRAPOLATED_HYDRAULIC_SCREENING_NOT_MODEL_GOVERNANCE',
    source: { candidateId: run.id, candidateImmutableHash: run.immutableHash,
      calculationHash, currentStage1Hash: currentHash, method: r.engine },
    configuredSearch: r.candidateGrid, feasibleConfigurationCount: points.length, rejectedTrialCount: rejected,
    eligibleDiameterBoundsM: refs.length ? [refs[0].geometry.columnDiameterM, refs[refs.length - 1].geometry.columnDiameterM] : null,
    kneeAtEligibleBoundary: selected ? selected === refs[0] || selected === refs[refs.length - 1] : null,
    qualificationUnknowns: ['INTERFACE_MOBILITY', 'INVERSION', 'ENTRAINMENT', 'DISENGAGEMENT',
      'TURBULENCE', 'SCHILLER_NAUMANN_RANGE', 'SPHERICAL_DROP_QUALIFICATION', 'DYNAMIC_STABILITY'],
    sensitivity: 'SEARCH_ENVELOPE_AND_GRID_DEPENDENT_NOT_SCIENTIFIC_CONFIDENCE',
    rationale: 'Maximum discrete global chord departure, not proof of convexity or a unique physical optimum. Each diameter uses minimum worst-six-scenario loading, not independently optimized drop size or area. No RPM-window criterion. No resolved knee uses smallest eligible diameter.',
  };
  return { ...result, immutableHash: kuhniRunHash(result) };
}