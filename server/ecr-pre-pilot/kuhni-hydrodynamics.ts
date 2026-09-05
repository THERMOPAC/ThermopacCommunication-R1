import { createHash } from 'node:crypto';
import { computeDropletDiameter } from '../engines/llx/llx-ecr2-d32-interface';
import type { EcrPrePilotHydrodynamicProcessBasis } from './stage1';

export const KUHNI_PHASE1_ENGINE_VERSION = 'KUHNI_PHASE1_V1.0.3';
export const KUHNI_PHASE1_SOURCE =
  'Kumar, A. & Hartland, S. (1995), Ind. Eng. Chem. Res. 34, 3925–3940, Eq. 1, 4, 15–19, Tables 1–2.';
export const KUHNI_PHASE1_ENGINE_HASH = createHash('sha256')
  .update(`${KUHNI_PHASE1_ENGINE_VERSION}|${KUHNI_PHASE1_SOURCE}|Eq19:e^-0.77*lterm^0|governed-geometry|explicit-capacity-gap|diagnostic-hold-status|quantity-specific-applicability|direct-turbulence-v1`)
  .digest('hex');

const G = 9.80665;
const PI = Math.PI;
const envelope = {
  rhoC: [994, 1003], rhoD: [801, 882], muC: [0.00097, 0.00161],
  muD: [0.00066, 0.00392], gamma: [0.0008, 0.0341],
  dc: [0.072, 0.2], dr: [0.05, 0.085], h: [0.05, 0.09],
  hDc: [0.45, 0.69], drDc: [0.43, 0.69], drH: [0.94, 1.21], statorFreeArea: [0.16, 1],
  uc: [0.0002, 0.0079], ud: [0.0001, 0.0088], n: [0, 5],
  flowRatio: [0.09, 5], reR: [0, 36058], epsilon: [0, 0.83],
} as const;

export interface KuhniHydrodynamicInput {
  columnDiameterM: number;
  rotorDiameterM?: number;
  rotorToColumnRatio?: number;
  compartmentHeightM: number;
  statorFreeAreaFraction: number;
  rotorSpeedRpmMin: number;
  rotorSpeedRpmMax: number;
  rotorSpeedRpmStep: number;
  powerNumber: number;
  directTurbulenceC: number;
}
export type HydrodynamicProcessBasis = EcrPrePilotHydrodynamicProcessBasis;
type Status =
  | 'CALCULATED_PRELIMINARY'
  | 'PRELIMINARY_DIAGNOSTIC_HOLD'
  | 'CORRELATION_UNAVAILABLE'
  | 'NOT_CALCULABLE';

function finite(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min;
}
function within(v: number, r: readonly [number, number]) { return v >= r[0] && v <= r[1]; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function kuhniRunHash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }

export function canonicalizeKuhniHydrodynamicInput(raw: unknown): KuhniHydrodynamicInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_KUHNI_INPUT');
  const x = raw as Record<string, unknown>;
  const get = (k: string, min: number) => { const v = typeof x[k] === 'string' ? Number(x[k]) : x[k]; if (!finite(v, min)) throw new Error(`INVALID_KUHNI_${k}`); return v; };
  const columnDiameterM = get('columnDiameterM', 0.001);
  const suppliedRotor = x.rotorDiameterM === undefined ? undefined : get('rotorDiameterM', 0.001);
  const ratio = x.rotorToColumnRatio === undefined ? undefined : get('rotorToColumnRatio', 0.001);
  if (suppliedRotor === undefined && ratio === undefined) throw new Error('KUHNI_ROTOR_DIAMETER_OR_RATIO_REQUIRED');
  const rotorDiameterM = suppliedRotor ?? ratio! * columnDiameterM;
  if (ratio !== undefined && suppliedRotor !== undefined && Math.abs(suppliedRotor / columnDiameterM - ratio) > 1e-9) throw new Error('KUHNI_ROTOR_RATIO_INCONSISTENT');
  const input = { columnDiameterM, rotorDiameterM, rotorToColumnRatio: ratio, compartmentHeightM: get('compartmentHeightM', .001), statorFreeAreaFraction: get('statorFreeAreaFraction', .001), rotorSpeedRpmMin: get('rotorSpeedRpmMin', 0), rotorSpeedRpmMax: get('rotorSpeedRpmMax', 0), rotorSpeedRpmStep: get('rotorSpeedRpmStep', .001), powerNumber: get('powerNumber', .000001), directTurbulenceC: get('directTurbulenceC', .36) };
  if (
    input.rotorSpeedRpmMax < input.rotorSpeedRpmMin
    || input.directTurbulenceC > .43
    || input.statorFreeAreaFraction > 1
    || input.rotorDiameterM >= input.columnDiameterM
  ) throw new Error('INVALID_KUHNI_RANGE');
  if (Math.floor((input.rotorSpeedRpmMax - input.rotorSpeedRpmMin) / input.rotorSpeedRpmStep + 1 + 1e-9) > 100) throw new Error('KUHNI_TOO_MANY_SPEED_TRIALS');
  return input;
}

export function evaluateKuhniHydrodynamics(input: KuhniHydrodynamicInput, basis: HydrodynamicProcessBasis) {
  const area = PI * input.columnDiameterM ** 2 / 4;
  const nmpContinuous = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed';
  const continuous = nmpContinuous ? basis.wetSolventPhase : basis.rrboFeed;
  const dispersed = nmpContinuous ? basis.rrboFeed : basis.wetSolventPhase;
  const uc = continuous.flowM3S / area, ud = dispersed.flowM3S / area;
  const diagnostics: string[] = [];
  const runBlockers = new Set<string>([
    'FLOODING_CAPACITY_CORRELATION_UNAVAILABLE: no generic Kühni flooding velocity, capacity metric, or percent-flooding result is admitted.',
  ]);
  const tests: Array<[string, number, readonly [number, number]]> = [
    ['rho_c', continuous.densityKgM3, envelope.rhoC], ['rho_d', dispersed.densityKgM3, envelope.rhoD],
    ['mu_c', continuous.dynamicViscosityPaS, envelope.muC], ['mu_d', dispersed.dynamicViscosityPaS, envelope.muD],
    ['gamma', basis.interfacialTensionNM, envelope.gamma], ['Dc', input.columnDiameterM, envelope.dc],
    ['Dr', input.rotorDiameterM!, envelope.dr], ['H', input.compartmentHeightM, envelope.h],
    ['H/Dc', input.compartmentHeightM / input.columnDiameterM, envelope.hDc],
    ['Dr/Dc', input.rotorDiameterM! / input.columnDiameterM, envelope.drDc],
    ['Dr/H', input.rotorDiameterM! / input.compartmentHeightM, envelope.drH],
    ['stator free area', input.statorFreeAreaFraction, envelope.statorFreeArea],
    ['Uc', uc, envelope.uc], ['Ud', ud, envelope.ud], ['R=Vd/Vc', ud / uc, envelope.flowRatio],
  ];
  tests.filter(([, v, r]) => !within(v, r)).forEach(([n, v, r]) => diagnostics.push(`TABLE_1_OUT_OF_RANGE:${n}=${v}; permitted [${r[0]},${r[1]}] SI.`));
  diagnostics.forEach((diagnostic) => runBlockers.add(`KH1995_HOLDUP_NOT_APPLICABLE:${diagnostic}`));
  const speeds = [];
  for (let rpm = input.rotorSpeedRpmMin; rpm <= input.rotorSpeedRpmMax + 1e-8; rpm += input.rotorSpeedRpmStep) {
    const n = rpm / 60, tip = PI * input.rotorDiameterM! * n;
    const power = input.powerNumber * continuous.densityKgM3 * n ** 3 * input.rotorDiameterM! ** 5;
    const pv = power / (area * input.compartmentHeightM), psi = pv / continuous.densityKgM3;
    const reR = continuous.densityKgM3 * n * input.rotorDiameterM! ** 2 / continuous.dynamicViscosityPaS;
    const tipBlocked = tip > 4.5;
    const trialDiagnostics = tipBlocked ? ['TIP_SPEED_LIMIT_EXCEEDED: maximum permitted tip speed is 4.5 m/s.'] : [];
    const holdupDiagnostics = [...diagnostics];
    if (!within(n, envelope.n)) holdupDiagnostics.push(`TABLE_1_OUT_OF_RANGE:N=${n}; permitted [0,5] 1/s.`);
    if (!within(reR, envelope.reR)) holdupDiagnostics.push(`TABLE_1_OUT_OF_RANGE:Re_R=${reR}; permitted [0,36058].`);
    if (!within(psi, envelope.epsilon)) holdupDiagnostics.push(`TABLE_1_OUT_OF_RANGE:epsilon=${psi}; permitted [0,0.83] W/kg.`);
    if (!(continuous.densityKgM3 > dispersed.densityKgM3)) holdupDiagnostics.push('CONTINUOUS_PHASE_NOT_HEAVIER: Eq18 requires positive delta-rho = rho_c-rho_d.');
    if (tipBlocked) runBlockers.add(`RPM_${rpm}:TIP_SPEED_LIMIT_EXCEEDED`);
    let phi: number | null = null, d32: number | null = null, slip: number | null = null, vk: number | null = null, a: number | null = null;
    if (!tipBlocked && !holdupDiagnostics.length) {
      const theta = (continuous.densityKgM3 / (G * basis.interfacialTensionNM)) ** .25;
      const pi = .0267 + (psi / G * theta) ** .77;
      const Phi = (ud * theta) ** .64 * Math.exp(20.7 * uc * theta);
      const deltaRho = continuous.densityKgM3 - dispersed.densityKgM3;
      const Psi = (deltaRho > 0 ? deltaRho / continuous.densityKgM3 : NaN) ** -.34
        * (dispersed.dynamicViscosityPaS / 1e-3) ** 0;
      // K&H Eq19: e is Kühni free-area fraction; l is the rotor length scale.
      // n7=0 makes the bracket unity, but the exact factor remains auditable.
      const Gamma = 2.27 * input.statorFreeAreaFraction ** -.77
        * (input.rotorDiameterM! * (continuous.densityKgM3 * G / basis.interfacialTensionNM) ** .5) ** 0;
      phi = pi * Phi * Psi * Gamma;
      if (!(phi > 0 && phi < 1)) { phi = null; holdupDiagnostics.push('NOT_CALCULABLE: Eq15 produced non-physical holdup.'); }
      if (phi !== null) {
        slip = ud / phi + uc / (1 - phi); vk = slip / (1 - phi);
      }
    }
    const d = tipBlocked ? null : computeDropletDiameter(
      { sigma_N_m: basis.interfacialTensionNM, rho_c_kg_m3: continuous.densityKgM3, psi_W_kg: psi },
      { mode: 'direct_turbulence_preliminary', correlationId: 'ecr2_d32_direct_turbulence_preliminary', C_nominal: input.directTurbulenceC, sourceType: 'Project-Controlled Preliminary', sourceReference: 'ECR-2 direct-turbulence preliminary sensitivity register' },
    );
    d32 = d?.d32_m ?? null;
    if (d32 && phi) a = 6 * phi / d32;
    const holdupStatus: Status = phi ? 'CALCULATED_PRELIMINARY' : 'NOT_CALCULABLE';
    const d32Status: Status = d32 ? 'CALCULATED_PRELIMINARY' : 'NOT_CALCULABLE';
    const trialBlockers = [
      ...holdupDiagnostics.map((diagnostic) => `KH1995_HOLDUP_NOT_APPLICABLE:${diagnostic}`),
      ...(tipBlocked ? ['TIP_SPEED_LIMIT_EXCEEDED'] : []),
      ...(!d32 ? ['D32_NOT_CALCULABLE'] : []),
      'FLOODING_CAPACITY_CORRELATION_UNAVAILABLE',
    ];
    holdupDiagnostics
      .filter((diagnostic) => !diagnostics.includes(diagnostic))
      .forEach((diagnostic) => runBlockers.add(`RPM_${rpm}:KH1995_HOLDUP_NOT_APPLICABLE:${diagnostic}`));
    if (!d32) runBlockers.add(`RPM_${rpm}:D32_NOT_CALCULABLE`);
    const geometryRatios = {
      rotorToColumn: input.rotorDiameterM! / input.columnDiameterM,
      compartmentToColumn: input.compartmentHeightM / input.columnDiameterM,
      rotorToCompartment: input.rotorDiameterM! / input.compartmentHeightM,
      statorFreeArea: input.statorFreeAreaFraction,
    };
    speeds.push({
      rpm, rotorSpeedS: n, tipSpeedMS: tip,
      tipSpeed: { status: tipBlocked ? 'NOT_CALCULABLE' as Status : 'CALCULATED_PRELIMINARY' as Status, limitMS: 4.5, marginMS: 4.5 - tip, blocked: tipBlocked },
      geometry: {
        status: 'CALCULATED_PRELIMINARY' as Status,
        columnDiameterM: input.columnDiameterM,
        rotorDiameterM: input.rotorDiameterM,
        compartmentHeightM: input.compartmentHeightM,
        columnAreaM2: area,
        ratios: geometryRatios,
      },
      powerW: power, powerNumber: { value: input.powerNumber, provenance: 'ENGINEERING_INPUT' },
      powerVolumeWM3: pv, psiWKg: psi, rotorReynolds: reR,
      superficialVelocitiesMS: { status: 'CALCULATED_PRELIMINARY' as Status, Ud: ud, Uc: uc, continuousIdentity: continuous.identity, dispersedIdentity: dispersed.identity },
      phiD: phi, holdup: { status: holdupStatus, value: phi, diagnostics: holdupDiagnostics },
      d32M: d32, d32: { status: d32Status, valueM: d32, diagnostics: d?.diagnostics ?? trialDiagnostics },
      slipMS: slip, vkMS: vk, slip: { status: phi ? 'CALCULATED_PRELIMINARY' as Status : 'NOT_CALCULABLE' as Status, dependency: phi ? null : 'KH1995_HOLDUP_NOT_CALCULABLE' },
      flooding: {
        status: 'CORRELATION_UNAVAILABLE' as const,
        floodingVelocityMS: null,
        capacityMetric: null,
        percentFlooding: null,
        message: 'Kumar & Hartland (1995) supplies no general Kühni flooding/capacity equation; no flooding state or percentage is inferred from holdup.',
      },
      interfacialAreaM2M3: a, interfacialArea: { status: a ? 'CALCULATED_PRELIMINARY' as Status : 'NOT_CALCULABLE' as Status, dependency: !phi ? 'KH1995_HOLDUP_NOT_CALCULABLE' : !d32 ? 'D32_NOT_CALCULABLE' : null },
      status: 'PRELIMINARY_DIAGNOSTIC_HOLD' as Status,
      blockers: trialBlockers,
      diagnostics: trialDiagnostics,
    });
  }
  const empiricalRecords = [
    { id: 'kh1995_holdup_eq15_19', version: '1.0.0', source: KUHNI_PHASE1_SOURCE, equation: 'Eq15-19; phi=Pi*Phi*Psi*Gamma; Gamma=Cr*e^n6*[l*(rho_c*g/gamma)^0.5]^n7', units: 'dimensionless; SI inputs', ranges: envelope, constants: { Ceta: .0267, Cpsi: 1, Cr: 2.27, n1: .77, n2: .64, n3: 20.7, n4: -.34, n5: 0, n6: -.77, n7: 0, g: G }, symbolDefinitions: { e: 'Kuhni stator/free-area fraction', l: 'rotor length scale', mu_w: '1e-3 Pa.s', epsilon: 'P/(Ac*H*rho_c)' }, assumptions: ['water-continuous Table-1 Kühni source chemistry', 'Cpsi=1, no mass transfer', 'Kuhni e=stator/free-area fraction; Cr=2.27,n6=-0.77,n7=0'], applicabilityDiagnostics: diagnostics, implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    { id: 'direct_turbulence_d32_preliminary', version: '1.0.0', source: 'Project-controlled preliminary route', equation: 'd32=C*(gamma/rho_c)^0.6*psi^-0.4', units: 'd32 m; gamma N/m; rho_c kg/m3; psi W/kg', ranges: { C: [.36, .43], inputs: 'positive finite gamma, rho_c, psi' }, constants: { C: 'selected engineering input, 0.36-0.43' }, symbolDefinitions: { psi: '(P/V)/rho_c', rho_c: 'saved Stage-1 continuous-phase density' }, assumptions: ['project-controlled preliminary', 'not K&H 1995 or 1996'], applicabilityDiagnostics: ['Project-controlled C range only; positive finite sigma/rho/psi required.', 'See this trial d32 diagnostics for computeDropletDiameter provenance.'], implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    { id: 'phase_continuity_slip_identity', version: '1.0.0', source: 'K&H 1995 Eq1 and Eq4', equation: 'Vslip=Vd/phi+Vc/(1-phi); Vk=Vslip/(1-phi)', units: 'm/s', ranges: 'requires 0<phi<1', constants: {}, symbolDefinitions: { Vd: 'saved Stage-1 dispersed superficial velocity', Vc: 'saved Stage-1 continuous superficial velocity' }, assumptions: ['two-phase continuity identity'], applicabilityDiagnostics: diagnostics, implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    { id: 'engineering_power_identity', version: '1.0.0', source: 'Engineering input power identity; K&H attribution limited to epsilon=P/(Ac*H*rho_c)', equation: 'P=Np*rho_c*N^3*Dr^5; P/V=P/(Ac*H); psi=(P/V)/rho_c', units: 'P W; P/V W/m3; psi W/kg', ranges: 'positive finite engineering power number and geometry', constants: { Np: 'user-entered ENGINEERING_INPUT' }, symbolDefinitions: { Ac: 'pi*Dc^2/4', N: 'rotor speed 1/s' }, assumptions: ['power number is not attributed to K&H'], applicabilityDiagnostics: [], implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    { id: 'interfacial_area_identity', version: '1.0.0', source: 'Drop-population interfacial-area identity', equation: 'a=6*phi/d32', units: 'm2/m3', ranges: 'requires 0<phi<1 and d32>0 m', constants: { factor: 6 }, symbolDefinitions: { phi: 'dispersed holdup included once', d32: 'Sauter mean diameter m' }, assumptions: ['no second phase-fraction factor'], applicabilityDiagnostics: ['Blocked when holdup or d32 is not calculable.'], implementationHash: KUHNI_PHASE1_ENGINE_HASH },
  ];
  return {
    status: 'PRELIMINARY_DIAGNOSTIC_HOLD' as const,
    blockers: [...runBlockers],
    engine: { id: 'kuhni_phase1_hydrodynamics', version: KUHNI_PHASE1_ENGINE_VERSION, implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    source: {
      reference: KUHNI_PHASE1_SOURCE,
      equations: ['Eq15 phi=Pi*Phi*Psi*Gamma', 'Eq16 Pi', 'Eq17 Phi', 'Eq18 Psi Cpsi=1 no mass transfer mu_w=1e-3 Pa.s', 'Eq19 Gamma=Cr*e^n6*[l*(rho_c*g/gamma)^0.5]^n7', 'Eq1 Vslip', 'Eq4 Vk', 'P=Np*rho_c*N^3*Dr^5', 'a=6phi/d32'],
      assumptions: ['Table-1 Kühni water-continuous source chemistry is qualification metadata and distinct from RRBO/NMP applicability; it is not an execution gate.', 'No mass transfer Cpsi=1.', 'd32 route is project-controlled preliminary, not K&H 1995/1996.'],
      chemicalSystemQualification: { sourceContinuousPhase: 'water', actualContinuousPhase: continuous.identity, rrboNmpValidated: false, executionGate: false },
      aarePercent: 21.4,
    },
    empiricalRecords,
    processBasis: basis,
    input,
    records: speeds,
    applicabilityDiagnostics: diagnostics,
  };
}