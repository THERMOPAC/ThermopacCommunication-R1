import type { HydrodynamicProcessBasis } from './kuhni-hydrodynamics';

/** Additive pure kernel. Historical V1.4/V1.5 resolvers are deliberately untouched. */
export const RRBO_HYDRAULIC_METHOD = 'RRBO_WETNMP_KUHNI_HYDRAULIC_P1' as const;
export type InterfaceScenario = 'BARRY_PARLANGE_MOBILE' | 'SCHILLER_NAUMANN_IMMOBILE';
const g = 9.80665;
function positive(x: number, name: string) {
  if (!Number.isFinite(x) || x <= 0) throw new Error(`INVALID_${name}`);
  return x;
}
export function dragCoefficient(re: number, x: number, p: number, scenario: InterfaceScenario) {
  positive(re, 'RE'); positive(x, 'VISCOSITY_RATIO'); positive(p, 'DENSITY_RATIO');
  if (scenario === 'SCHILLER_NAUMANN_IMMOBILE') return 24 / re * (1 + .15 * re ** .687);
  if (scenario !== 'BARRY_PARLANGE_MOBILE') throw new Error('INVALID_INTERFACE_SCENARIO');
  const a = 2 * Math.sqrt(2) / (5 * Math.sqrt(Math.PI)) * (6 * Math.sqrt(3) + 5 * Math.sqrt(2) - 14);
  const xp = x * p;
  const z = 1 + ((2.5891 - 2) * Math.sqrt(xp) + (.9879 - 1) * xp) / (1 + Math.sqrt(xp)) ** 2;
  const b = 8 / 9 * (4 + 3 * x) / (1 + x);
  const tau = 2 * b / (Math.sqrt((a * z) ** 2 + 4 * b) + a * z);
  const s = Math.sqrt(re);
  return 48 / (re * (1 + x)) * (1 + 1.5 * x)
    * (s + a * z + tau * Math.exp(-s / tau))
    / (s / (1 + x) + 3 * a * z + 3 * tau * Math.exp(-s / (3 * (1 + x) * tau)));
}
function bisect(f: (x: number) => number, lo: number, hi: number) {
  let fl = f(lo);
  const fh = f(hi);
  if (!Number.isFinite(fl) || !Number.isFinite(fh) || fl * fh > 0) throw new Error('ROOT_NOT_BRACKETED');
  if (fl === 0) return lo;
  if (fh === 0) return hi;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (!Number.isFinite(fm)) throw new Error('NONFINITE_ROOT_RESIDUAL');
    if (fm === 0) return mid;
    if (fl * fm > 0) { lo = mid; fl = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}
/** Eq. 8.3 returns superficial swarm speed; slip has one less void-fraction power. */
export function swarmSpeeds(phi: number, v0: number, rePerSpeed: number, drag: (re: number) => number) {
  if (!(phi >= 0 && phi < 1)) throw new Error('INVALID_HOLDUP');
  positive(v0, 'CHARACTERISTIC_SPEED'); positive(rePerSpeed, 'RE_PER_SPEED');
  const target = drag(v0 * rePerSpeed) * v0 ** 2 * (1 - phi) ** 4.65;
  const logVs = bisect(logV => {
    const v = Math.exp(logV);
    return drag(v * rePerSpeed) * v ** 2 - target;
  }, Math.log(v0) + 8 * Math.log(1 - phi) - 10, Math.log(v0) + 1e-12);
  const vs = Math.exp(logVs);
  return { superficialSwarmMS: vs, slipMS: vs / (1 - phi) };
}

export type RrboTrialGeometry = {
  rotorToColumn: number; compartmentToColumn: number; statorFreeArea: number;
};
export function evaluateRrboHydraulicTrial(
  diameterM: number, rpm: number, basis: HydrodynamicProcessBasis, geometry: RrboTrialGeometry,
) {
  if (basis.phaseConfiguration !== 'rrbo-continuous-nmp-dispersed') throw new Error('RRBO_CONTINUOUS_REQUIRED');
  if (basis.operatingTemperatureC !== 40) throw new Error('P1_REQUIRES_SAVED_40C_BASIS');
  positive(diameterM, 'DIAMETER'); positive(rpm, 'RPM');
  const c = basis.rrboFeed, d = basis.wetSolventPhase;
  for (const [key, value] of Object.entries({
    RHO_C: c.densityKgM3, RHO_D: d.densityKgM3, MU_C: c.dynamicViscosityPaS,
    MU_D: d.dynamicViscosityPaS, QC: c.flowM3S, QD: d.flowM3S, SIGMA: basis.interfacialTensionNM,
    ROTOR_RATIO: geometry.rotorToColumn, HC_RATIO: geometry.compartmentToColumn, FREE_AREA: geometry.statorFreeArea,
  })) positive(value, key);
  if (geometry.rotorToColumn >= 1 || geometry.statorFreeArea >= 1 || d.densityKgM3 <= c.densityKgM3)
    throw new Error('INVALID_REVERSE_GEOMETRY_OR_DENSITY');
  const rho = c.densityKgM3, mu = c.dynamicViscosityPaS, sigma = basis.interfacialTensionNM;
  const delta = d.densityKgM3 - rho, x = d.dynamicViscosityPaS / mu, p = d.densityKgM3 / rho;
  const area = Math.PI * diameterM ** 2 / 4, n = rpm / 60;
  const rotorDiameterM = diameterM * geometry.rotorToColumn, compartmentHeightM = diameterM * geometry.compartmentToColumn;
  const powerW = 1.2 * rho * n ** 3 * rotorDiameterM ** 5;
  const powerVolumeWM3 = powerW / (area * compartmentHeightM), epsilonWKg = powerVolumeWM3 / rho;
  const rotorReynolds = rho * n * rotorDiameterM ** 2 / mu;
  const sourcePowerNumber = 1.08 + 10.94 / Math.sqrt(rotorReynolds) + 257.37 / rotorReynolds ** 1.5;
  const jc = c.flowM3S / area, jd = d.flowM3S / area, r = jd / jc;
  const scenarios = ([.36, .42, .43] as const).flatMap(coefficient =>
    (['BARRY_PARLANGE_MOBILE', 'SCHILLER_NAUMANN_IMMOBILE'] as const).map(interfaceScenario => {
      const d32M = coefficient * (sigma / rho) ** .6 * epsilonWKg ** -.4;
      const drag = (re: number) => dragCoefficient(re, x, p, interfaceScenario);
      const ar = rho * delta * g * d32M ** 3 / mu ** 2;
      let upper = 1;
      while (drag(upper) * upper ** 2 < 4 / 3 * ar && upper < 1e12) upper *= 2;
      const terminalRe = bisect(re => drag(re) * re ** 2 - 4 / 3 * ar, 1e-30, upper);
      const terminalSpeedMS = terminalRe * mu / (rho * d32M);
      const characteristicFactor = 1 - 1.669 * sourcePowerNumber ** -3.945
        - 2.807 * (d32M / (diameterM - rotorDiameterM)) ** 1.336
        - 1.159 * geometry.compartmentToColumn ** 2.049 + 2.1 * geometry.statorFreeArea ** 1.032;
      positive(characteristicFactor, 'GARTHE_CHARACTERISTIC_FACTOR');
      const v0 = terminalSpeedMS * characteristicFactor;
      const speeds = (phi: number) => swarmSpeeds(phi, v0, rho * d32M / mu, drag);
      const capacityCache = new Map<number, number>();
      const capacity = (phi: number) => {
        const cached = capacityCache.get(phi);
        if (cached !== undefined) return cached;
        const value = (1 + r) * speeds(phi).slipMS / (r / phi + 1 / (1 - phi));
        capacityCache.set(phi, value);
        return value;
      };
      // Numerical resolution is an implementation assumption, not a source-domain threshold.
      const mesh = 512;
      let best = 1, bestValue = 0;
      for (let i = 1; i < mesh; i++) {
        const value = capacity(i / mesh);
        if (value > bestValue) { best = i; bestValue = value; }
      }
      let lo = Math.max(1e-9, (best - 1) / mesh), hi = Math.min(1 - 1e-9, (best + 1) / mesh);
      for (let i = 0; i < 60; i++) {
        const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
        if (capacity(a) < capacity(b)) lo = a; else hi = b;
      }
      const floodHoldup = (lo + hi) / 2, capacityMS = capacity(floodHoldup);
      const rootsAt = (flow: number) => {
        const points = [1e-12, ...Array.from({ length: mesh - 1 }, (_, i) => (i + 1) / mesh), floodHoldup, 1 - 1e-9].sort((a,b) => a-b);
        const roots: number[] = [];
        const f = (phi: number) => capacity(phi) - flow;
        for (let i = 0; i < points.length; i++) {
          if (f(points[i]) === 0) roots.push(points[i]);
          if (i > 0 && f(points[i-1]) * f(points[i]) < 0)
            roots.push(bisect(f, points[i-1], points[i]));
        }
        return [...new Set(roots)].sort((a,b) => a-b);
      };
      const continuation: Array<{ flowFraction: number; holdup: number }> = [];
      let connected = true, previous = 0;
      for (let step = 1; step <= 16; step++) {
        const roots = rootsAt((jc + jd) * step / 16);
        if (!roots.length || roots[0] < previous || roots[0] >= floodHoldup) { connected = false; break; }
        previous = roots[0]; continuation.push({ flowFraction: step / 16, holdup: previous });
      }
      const operatingRoots = rootsAt(jc + jd);
      const operatingHoldup = connected && continuation.length === 16 ? previous : null;
      const operatingSpeeds = operatingHoldup === null ? null : speeds(operatingHoldup);
      return {
        coefficient, interfaceScenario, d32M, terminalRe, terminalSpeedMS,
        signedTerminalVelocityMS: -terminalSpeedMS, characteristicFactor,
        characteristicSpeedMS: v0, characteristicRe: rho * v0 * d32M / mu,
        forceBalanceResidualN: Math.PI / 6 * d32M ** 3 * delta * g
          - .5 * rho * drag(terminalRe) * Math.PI / 4 * d32M ** 2 * terminalSpeedMS ** 2,
        floodHoldup, capacityMS, loading: (jc + jd) / capacityMS,
        operatingRoots, operatingHoldup, continuation, operatingSpeeds,
        signedOperatingVelocities: operatingHoldup === null ? null : {
          continuousMS: jc / (1 - operatingHoldup), dispersedMS: -jd / operatingHoldup,
          dispersedRelativeToContinuousMS: -operatingSpeeds!.slipMS,
        },
        operatingBalanceResidualMS: operatingHoldup === null ? null
          : jd / operatingHoldup + jc / (1 - operatingHoldup) - operatingSpeeds!.slipMS,
        interfacialAreaM2M3: operatingHoldup === null ? null : 6 * operatingHoldup / d32M,
        branchStatus: operatingHoldup === null ? 'NO_DILUTE_CONNECTED_ROOT' : 'LOWER_QUASI_STEADY_ADMISSIBLE',
        diagnostics: { eotvos: delta * g * d32M ** 2 / sigma,
          weberTerminal: rho * terminalSpeedMS ** 2 * d32M / sigma,
          ohnesorgeContinuous: mu / Math.sqrt(rho * sigma * d32M),
          ohnesorgeDispersed: d.dynamicViscosityPaS / Math.sqrt(d.densityKgM3 * sigma * d32M),
          swarmReAtFlood: rho * speeds(floodHoldup).superficialSwarmMS * d32M / mu },
      };
    }));
  const governing = scenarios.reduce((a,b) => a.capacityMS <= b.capacityMS ? a : b);
  return {
    methodId: RRBO_HYDRAULIC_METHOD, status: 'PREPILOT_EXTRAPOLATED_METHOD' as const,
    acceptanceRecord: 'USER_APPROVED_CONDITIONAL_PREPILOT_P1', propertyQualification: 'PROVISIONAL_SAVED_40C',
    properties: { continuous: { ...c }, dispersed: { ...d }, interfacialTensionNM: sigma, temperatureC: basis.operatingTemperatureC },
    signedDensityDifferenceKgM3: -delta, jc, jd, diameterM, rpm, rotorDiameterM, compartmentHeightM,
    phaseDirection: 'UPWARD_RRBO_CONTINUOUS_DOWNWARD_WET_NMP_DISPERSED',
    powerNumber: 1.2, powerW, powerVolumeWM3, epsilonWKg, rotorReynolds, sourcePowerNumber,
    tipSpeedMS: Math.PI * rotorDiameterM * n, maximumLoading: .70,
    qualification: { inversion: 'UNKNOWN', entrainment: 'UNKNOWN', disengagement: 'UNKNOWN',
      turbulence: 'UNKNOWN', sphericalDrop: 'UNKNOWN', schillerNaumannRange: 'UNKNOWN', interfaceMobility: 'UNKNOWN' },
    numericalPolicy: { holdupMeshIntervals: 512, continuationSteps: 16, bisectionIterations: 70,
      capacityRefinementIterations: 60, status: 'IMPLEMENTATION_ASSUMPTIONS_NOT_SOURCE_THRESHOLDS' },
    assumptions: ['Np=1.2 fixed engineering assumption; distinct from Garthe source power number',
      'C32=.36,.42,.43 conditional Sauter-mean proxy, not Hinze maximum stable diameter',
      'Spherical drop and turbulent breakup assumptions remain unqualified; diagnostics are not acceptance thresholds',
      'BP and SN interface scenarios are mandatory, neither is established as actual',
      'Lower quasi-steady branch is not proof of dynamical stability; capacity is not observed flood'],
    sourceExtrapolation: { status: 'EXTRAPOLATED', diameterToGartheMaximum: diameterM / .152,
      rotorToGartheMaximum: rotorDiameterM / .085, compartmentToGartheMaximum: compartmentHeightM / .072,
      viscosityToKhMaximum: mu / .00161 },
    capacityMeaning: 'MODELED_TURNING_CAPACITY_NOT_OBSERVED_FLOOD',
    scenarios, governing,
    screeningPass: scenarios.every(s => s.operatingHoldup !== null && s.loading <= .70)
      && Math.PI * rotorDiameterM * n <= 4.5,
  };
}