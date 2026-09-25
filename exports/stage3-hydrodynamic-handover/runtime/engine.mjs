// server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts
var RRBO_HYDRAULIC_METHOD = "RRBO_WETNMP_KUHNI_HYDRAULIC_P1";
var g = 9.80665;
function positive(x, name) {
  if (!Number.isFinite(x) || x <= 0) throw new Error(`INVALID_${name}`);
  return x;
}
function dragCoefficient(re, x, p, scenario) {
  positive(re, "RE");
  positive(x, "VISCOSITY_RATIO");
  positive(p, "DENSITY_RATIO");
  if (scenario === "SCHILLER_NAUMANN_IMMOBILE") return 24 / re * (1 + 0.15 * re ** 0.687);
  if (scenario !== "BARRY_PARLANGE_MOBILE") throw new Error("INVALID_INTERFACE_SCENARIO");
  const a = 2 * Math.sqrt(2) / (5 * Math.sqrt(Math.PI)) * (6 * Math.sqrt(3) + 5 * Math.sqrt(2) - 14);
  const xp = x * p;
  const z = 1 + ((2.5891 - 2) * Math.sqrt(xp) + (0.9879 - 1) * xp) / (1 + Math.sqrt(xp)) ** 2;
  const b = 8 / 9 * (4 + 3 * x) / (1 + x);
  const tau = 2 * b / (Math.sqrt((a * z) ** 2 + 4 * b) + a * z);
  const s = Math.sqrt(re);
  return 48 / (re * (1 + x)) * (1 + 1.5 * x) * (s + a * z + tau * Math.exp(-s / tau)) / (s / (1 + x) + 3 * a * z + 3 * tau * Math.exp(-s / (3 * (1 + x) * tau)));
}
function bisect(f, lo, hi) {
  let fl = f(lo);
  const fh = f(hi);
  if (!Number.isFinite(fl) || !Number.isFinite(fh) || fl * fh > 0) throw new Error("ROOT_NOT_BRACKETED");
  if (fl === 0) return lo;
  if (fh === 0) return hi;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (!Number.isFinite(fm)) throw new Error("NONFINITE_ROOT_RESIDUAL");
    if (fm === 0) return mid;
    if (fl * fm > 0) {
      lo = mid;
      fl = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}
function swarmSpeeds(phi, v0, rePerSpeed, drag) {
  if (!(phi >= 0 && phi < 1)) throw new Error("INVALID_HOLDUP");
  positive(v0, "CHARACTERISTIC_SPEED");
  positive(rePerSpeed, "RE_PER_SPEED");
  const target = drag(v0 * rePerSpeed) * v0 ** 2 * (1 - phi) ** 4.65;
  const logVs = bisect((logV) => {
    const v = Math.exp(logV);
    return drag(v * rePerSpeed) * v ** 2 - target;
  }, Math.log(v0) + 8 * Math.log(1 - phi) - 10, Math.log(v0) + 1e-12);
  const vs = Math.exp(logVs);
  return { superficialSwarmMS: vs, slipMS: vs / (1 - phi) };
}
function evaluateRrboHydraulicTrial(diameterM, rpm, basis, geometry) {
  if (basis.phaseConfiguration !== "rrbo-continuous-nmp-dispersed") throw new Error("RRBO_CONTINUOUS_REQUIRED");
  if (basis.operatingTemperatureC !== 40) throw new Error("P1_REQUIRES_SAVED_40C_BASIS");
  positive(diameterM, "DIAMETER");
  positive(rpm, "RPM");
  const c = basis.rrboFeed, d = basis.wetSolventPhase;
  for (const [key, value] of Object.entries({
    RHO_C: c.densityKgM3,
    RHO_D: d.densityKgM3,
    MU_C: c.dynamicViscosityPaS,
    MU_D: d.dynamicViscosityPaS,
    QC: c.flowM3S,
    QD: d.flowM3S,
    SIGMA: basis.interfacialTensionNM,
    ROTOR_RATIO: geometry.rotorToColumn,
    HC_RATIO: geometry.compartmentToColumn,
    FREE_AREA: geometry.statorFreeArea
  })) positive(value, key);
  if (geometry.rotorToColumn >= 1 || geometry.statorFreeArea >= 1 || d.densityKgM3 <= c.densityKgM3)
    throw new Error("INVALID_REVERSE_GEOMETRY_OR_DENSITY");
  const rho = c.densityKgM3, mu = c.dynamicViscosityPaS, sigma = basis.interfacialTensionNM;
  const delta = d.densityKgM3 - rho, x = d.dynamicViscosityPaS / mu, p = d.densityKgM3 / rho;
  const area = Math.PI * diameterM ** 2 / 4, n = rpm / 60;
  const rotorDiameterM = diameterM * geometry.rotorToColumn, compartmentHeightM = diameterM * geometry.compartmentToColumn;
  const powerW = 1.2 * rho * n ** 3 * rotorDiameterM ** 5;
  const powerVolumeWM3 = powerW / (area * compartmentHeightM), epsilonWKg = powerVolumeWM3 / rho;
  const rotorReynolds = rho * n * rotorDiameterM ** 2 / mu;
  const sourcePowerNumber = 1.08 + 10.94 / Math.sqrt(rotorReynolds) + 257.37 / rotorReynolds ** 1.5;
  const jc = c.flowM3S / area, jd = d.flowM3S / area, r = jd / jc;
  const scenarios = [0.36, 0.42, 0.43].flatMap((coefficient) => ["BARRY_PARLANGE_MOBILE", "SCHILLER_NAUMANN_IMMOBILE"].map((interfaceScenario) => {
    const d32M = coefficient * (sigma / rho) ** 0.6 * epsilonWKg ** -0.4;
    const drag = (re) => dragCoefficient(re, x, p, interfaceScenario);
    const ar = rho * delta * g * d32M ** 3 / mu ** 2;
    let upper = 1;
    while (drag(upper) * upper ** 2 < 4 / 3 * ar && upper < 1e12) upper *= 2;
    const terminalRe = bisect((re) => drag(re) * re ** 2 - 4 / 3 * ar, 1e-30, upper);
    const terminalSpeedMS = terminalRe * mu / (rho * d32M);
    const characteristicFactor = 1 - 1.669 * sourcePowerNumber ** -3.945 - 2.807 * (d32M / (diameterM - rotorDiameterM)) ** 1.336 - 1.159 * geometry.compartmentToColumn ** 2.049 + 2.1 * geometry.statorFreeArea ** 1.032;
    positive(characteristicFactor, "GARTHE_CHARACTERISTIC_FACTOR");
    const v0 = terminalSpeedMS * characteristicFactor;
    const speeds = (phi) => swarmSpeeds(phi, v0, rho * d32M / mu, drag);
    const capacityCache = /* @__PURE__ */ new Map();
    const capacity = (phi) => {
      const cached = capacityCache.get(phi);
      if (cached !== void 0) return cached;
      const value = (1 + r) * speeds(phi).slipMS / (r / phi + 1 / (1 - phi));
      capacityCache.set(phi, value);
      return value;
    };
    const mesh = 512;
    let best = 1, bestValue = 0;
    for (let i = 1; i < mesh; i++) {
      const value = capacity(i / mesh);
      if (value > bestValue) {
        best = i;
        bestValue = value;
      }
    }
    let lo = Math.max(1e-9, (best - 1) / mesh), hi = Math.min(1 - 1e-9, (best + 1) / mesh);
    for (let i = 0; i < 60; i++) {
      const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
      if (capacity(a) < capacity(b)) lo = a;
      else hi = b;
    }
    const floodHoldup = (lo + hi) / 2, capacityMS = capacity(floodHoldup);
    const rootsAt = (flow) => {
      const points = [1e-12, ...Array.from({ length: mesh - 1 }, (_, i) => (i + 1) / mesh), floodHoldup, 1 - 1e-9].sort((a, b) => a - b);
      const roots = [];
      const f = (phi) => capacity(phi) - flow;
      for (let i = 0; i < points.length; i++) {
        if (f(points[i]) === 0) roots.push(points[i]);
        if (i > 0 && f(points[i - 1]) * f(points[i]) < 0)
          roots.push(bisect(f, points[i - 1], points[i]));
      }
      return [...new Set(roots)].sort((a, b) => a - b);
    };
    const continuation = [];
    let connected = true, previous = 0;
    for (let step = 1; step <= 16; step++) {
      const roots = rootsAt((jc + jd) * step / 16);
      if (!roots.length || roots[0] < previous || roots[0] >= floodHoldup) {
        connected = false;
        break;
      }
      previous = roots[0];
      continuation.push({ flowFraction: step / 16, holdup: previous });
    }
    const operatingRoots = rootsAt(jc + jd);
    const operatingHoldup = connected && continuation.length === 16 ? previous : null;
    const operatingSpeeds = operatingHoldup === null ? null : speeds(operatingHoldup);
    return {
      coefficient,
      interfaceScenario,
      d32M,
      terminalRe,
      terminalSpeedMS,
      signedTerminalVelocityMS: -terminalSpeedMS,
      characteristicFactor,
      characteristicSpeedMS: v0,
      characteristicRe: rho * v0 * d32M / mu,
      forceBalanceResidualN: Math.PI / 6 * d32M ** 3 * delta * g - 0.5 * rho * drag(terminalRe) * Math.PI / 4 * d32M ** 2 * terminalSpeedMS ** 2,
      floodHoldup,
      capacityMS,
      loading: (jc + jd) / capacityMS,
      operatingRoots,
      operatingHoldup,
      continuation,
      operatingSpeeds,
      signedOperatingVelocities: operatingHoldup === null ? null : {
        continuousMS: jc / (1 - operatingHoldup),
        dispersedMS: -jd / operatingHoldup,
        dispersedRelativeToContinuousMS: -operatingSpeeds.slipMS
      },
      operatingBalanceResidualMS: operatingHoldup === null ? null : jd / operatingHoldup + jc / (1 - operatingHoldup) - operatingSpeeds.slipMS,
      interfacialAreaM2M3: operatingHoldup === null ? null : 6 * operatingHoldup / d32M,
      branchStatus: operatingHoldup === null ? "NO_DILUTE_CONNECTED_ROOT" : "LOWER_QUASI_STEADY_ADMISSIBLE",
      diagnostics: {
        eotvos: delta * g * d32M ** 2 / sigma,
        weberTerminal: rho * terminalSpeedMS ** 2 * d32M / sigma,
        ohnesorgeContinuous: mu / Math.sqrt(rho * sigma * d32M),
        ohnesorgeDispersed: d.dynamicViscosityPaS / Math.sqrt(d.densityKgM3 * sigma * d32M),
        swarmReAtFlood: rho * speeds(floodHoldup).superficialSwarmMS * d32M / mu
      }
    };
  }));
  const governing = scenarios.reduce((a, b) => a.capacityMS <= b.capacityMS ? a : b);
  return {
    methodId: RRBO_HYDRAULIC_METHOD,
    status: "PREPILOT_EXTRAPOLATED_METHOD",
    acceptanceRecord: "USER_APPROVED_CONDITIONAL_PREPILOT_P1",
    propertyQualification: "PROVISIONAL_SAVED_40C",
    properties: { continuous: { ...c }, dispersed: { ...d }, interfacialTensionNM: sigma, temperatureC: basis.operatingTemperatureC },
    signedDensityDifferenceKgM3: -delta,
    jc,
    jd,
    diameterM,
    rpm,
    rotorDiameterM,
    compartmentHeightM,
    phaseDirection: "UPWARD_RRBO_CONTINUOUS_DOWNWARD_WET_NMP_DISPERSED",
    powerNumber: 1.2,
    powerW,
    powerVolumeWM3,
    epsilonWKg,
    rotorReynolds,
    sourcePowerNumber,
    tipSpeedMS: Math.PI * rotorDiameterM * n,
    maximumLoading: 0.7,
    qualification: {
      inversion: "UNKNOWN",
      entrainment: "UNKNOWN",
      disengagement: "UNKNOWN",
      turbulence: "UNKNOWN",
      sphericalDrop: "UNKNOWN",
      schillerNaumannRange: "UNKNOWN",
      interfaceMobility: "UNKNOWN"
    },
    numericalPolicy: {
      holdupMeshIntervals: 512,
      continuationSteps: 16,
      bisectionIterations: 70,
      capacityRefinementIterations: 60,
      status: "IMPLEMENTATION_ASSUMPTIONS_NOT_SOURCE_THRESHOLDS"
    },
    assumptions: [
      "Np=1.2 fixed engineering assumption; distinct from Garthe source power number",
      "C32=.36,.42,.43 conditional Sauter-mean proxy, not Hinze maximum stable diameter",
      "Spherical drop and turbulent breakup assumptions remain unqualified; diagnostics are not acceptance thresholds",
      "BP and SN interface scenarios are mandatory, neither is established as actual",
      "Lower quasi-steady branch is not proof of dynamical stability; capacity is not observed flood"
    ],
    sourceExtrapolation: {
      status: "EXTRAPOLATED",
      diameterToGartheMaximum: diameterM / 0.152,
      rotorToGartheMaximum: rotorDiameterM / 0.085,
      compartmentToGartheMaximum: compartmentHeightM / 0.072,
      viscosityToKhMaximum: mu / 161e-5
    },
    capacityMeaning: "MODELED_TURNING_CAPACITY_NOT_OBSERVED_FLOOD",
    scenarios,
    governing,
    screeningPass: scenarios.every((s) => s.operatingHoldup !== null && s.loading <= 0.7) && Math.PI * rotorDiameterM * n <= 4.5
  };
}

// server/ecr-pre-pilot/kuhni-hydrodynamics.ts
import { createHash } from "node:crypto";

// server/engines/llx/llx-ecr2-d32-interface.ts
var TRANSCRIPTION_INVALID_ENGINEERING_BASIS = "Published correlation disabled \u2014 K&H 1996 transcription-invalid reconstruction";
var TRANSCRIPTION_INVALID_GOVERNANCE_STATUS = "kh1996_secondary_reproductions_conflict_with_legacy_reconstruction";
var UNIFORM_INLET_BASIS = "Thermopac model extension \u2014 uniform/inlet property basis";
var DIRECT_TURBULENCE_C_MIN = 0.36;
var DIRECT_TURBULENCE_C_MAX = 0.43;
var DIRECT_TURBULENCE_C_RANGE_EVIDENCE_STATUS = "PROJECT_CONTROLLED__AUTHORITATIVE_SOURCE_NOT_VERIFIED";
var DIRECT_TURBULENCE_C_RANGE_EVIDENCE_REFERENCE = "docs/ecr2-kh1996-droplet-size-evidence-verification.md \xA7 Direct-turbulence C-range verification (22 August 2026)";
var TRANSCRIPTION_INVALID_TRACEABILITY = [
  "PRIMARY_SOURCE_UNVERIFIED__KH1996",
  "TRANSCRIPTION_INVALID__LEGACY_C1_N1_AND_DIRECT_HIGH_AGITATION_TERM",
  "SECONDARY_SOURCE_CONFIRMS_RECIPROCAL_HIGH_AGITATION_STRUCTURE",
  "KH1996_H_UNRESOLVED__NUMERICAL_EXECUTION_DISABLED",
  "KH1996_NUMERATOR_SYMBOL_UNRESOLVED__NUMERICAL_EXECUTION_DISABLED",
  "KH1996_PHASE_CONVENTION_NOT_PRIMARY_VERIFIED",
  "RRBO_NMP_VALIDATION_PENDING"
];
function publishedGovernanceFields() {
  return {
    engineeringBasis: TRANSCRIPTION_INVALID_ENGINEERING_BASIS,
    governanceStatus: TRANSCRIPTION_INVALID_GOVERNANCE_STATUS,
    primarySourceVerified: false,
    validatedForRRBONMP: false,
    pilotCalibrationStatus: "NOT_APPLICABLE__TRANSCRIPTION_INVALID",
    calibrationFactor: 1,
    localAxialApplication: `${UNIFORM_INLET_BASIS}; numerical K&H d\u2083\u2082 execution disabled`
  };
}
function engineerGovernanceFields() {
  return {
    engineeringBasis: "Engineer-Supplied d\u2083\u2082 \u2014 Simulator Development / Sensitivity Basis",
    governanceStatus: "engineer_supplied_development_basis",
    primarySourceVerified: false,
    validatedForRRBONMP: false,
    pilotCalibrationStatus: "NOT_APPLICABLE__ENGINEER_SUPPLIED_VALUE",
    calibrationFactor: null,
    localAxialApplication: "Engineer-supplied value; local axial basis declared by source reference"
  };
}
function directTurbulenceGovernanceFields() {
  return {
    engineeringBasis: "DIRECT_TURBULENCE_D32_PRELIMINARY \u2014 PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED",
    governanceStatus: "preliminary_engineering_not_design_decision_eligible__authoritative_C_range_source_not_verified__direct_turbulence_d32",
    primarySourceVerified: false,
    validatedForRRBONMP: false,
    pilotCalibrationStatus: "NOT_YET_PILOT_VALIDATED",
    calibrationFactor: 1,
    localAxialApplication: `${UNIFORM_INLET_BASIS}; \u03B5 = \u03C8 from the governed ECR-2 process-sizing basis`
  };
}
function stateLocation(state) {
  if (state.compartmentIndex !== void 0) return `compartment ${state.compartmentIndex}`;
  if (state.z_m !== void 0) return `z = ${state.z_m.toFixed(3)} m`;
  return "unspecified location";
}
function computeDropletDiameter(localState, config) {
  if (config.mode === "direct_turbulence_preliminary") {
    const cfg = config;
    const missing = [];
    const finitePositive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
    if (!finitePositive(localState.sigma_N_m)) missing.push("gamma_N_m");
    if (!finitePositive(localState.rho_c_kg_m3)) missing.push("rho_c_kg_m3");
    if (!finitePositive(localState.psi_W_kg)) missing.push("psi_W_kg");
    if (!finitePositive(cfg.C_nominal)) missing.push("C_nominal");
    if (!cfg.sourceType?.trim()) missing.push("C_nominal sourceType");
    if (!cfg.sourceReference?.trim()) missing.push("C_nominal sourceReference");
    if (missing.length > 0) {
      return {
        d32_m: null,
        d32_raw_m: null,
        status: "input_missing",
        mode: "direct_turbulence_preliminary",
        correlationId: "ecr2_d32_direct_turbulence_preliminary",
        label: null,
        extrapolated: false,
        diagnostics: [
          `DIRECT_TURBULENCE_D32_PRELIMINARY cannot calculate d\u2083\u2082 at ${stateLocation(localState)}; missing/invalid: ${missing.join(", ")}.`,
          "The \u03C8-based process-sizing route requires temperature-matched \u03B3 and \u03C1_c plus governed specific agitation \u03C8. Rotor power, speed, diameter, and volume are not substitutes."
        ],
        provenance: "Direct-turbulence preliminary route blocked. No nominal C or hydraulic input is silently inferred.",
        engineerSource: null,
        ...directTurbulenceGovernanceFields()
      };
    }
    if (cfg.C_nominal < DIRECT_TURBULENCE_C_MIN || cfg.C_nominal > DIRECT_TURBULENCE_C_MAX) {
      return {
        d32_m: null,
        d32_raw_m: null,
        status: "calculation_invalid",
        mode: "direct_turbulence_preliminary",
        correlationId: "ecr2_d32_direct_turbulence_preliminary",
        label: null,
        extrapolated: false,
        diagnostics: [
          `Selected nominal C = ${cfg.C_nominal} is outside the governed preliminary sensitivity interval [${DIRECT_TURBULENCE_C_MIN}, ${DIRECT_TURBULENCE_C_MAX}].`,
          "No midpoint or alternative nominal C is substituted."
        ],
        provenance: "Direct-turbulence preliminary route rejected because selected nominal C is outside the controlled sensitivity interval.",
        engineerSource: null,
        ...directTurbulenceGovernanceFields()
      };
    }
    const epsilon = localState.psi_W_kg;
    const hydrodynamicScale = Math.pow(localState.sigma_N_m / localState.rho_c_kg_m3, 0.6) * Math.pow(epsilon, -0.4);
    const d32Nominal = cfg.C_nominal * hydrodynamicScale;
    const d32Min = DIRECT_TURBULENCE_C_MIN * hydrodynamicScale;
    const d32Max = DIRECT_TURBULENCE_C_MAX * hydrodynamicScale;
    if (![epsilon, hydrodynamicScale, d32Nominal, d32Min, d32Max].every(finitePositive)) {
      return {
        d32_m: null,
        d32_raw_m: Number.isFinite(d32Nominal) ? d32Nominal : null,
        status: "calculation_invalid",
        mode: "direct_turbulence_preliminary",
        correlationId: "ecr2_d32_direct_turbulence_preliminary",
        label: null,
        extrapolated: false,
        diagnostics: ["DIRECT_TURBULENCE_D32_PRELIMINARY produced a non-physical epsilon or d\u2083\u2082 result."],
        provenance: "Direct-turbulence preliminary route rejected by finite-positive output guard; no clamping applied.",
        engineerSource: null,
        ...directTurbulenceGovernanceFields()
      };
    }
    return {
      d32_m: d32Nominal,
      d32_raw_m: d32Nominal,
      status: "calculated_preliminary",
      mode: "direct_turbulence_preliminary",
      correlationId: "ecr2_d32_direct_turbulence_preliminary",
      label: "DIRECT_TURBULENCE_D32_PRELIMINARY \u2014 PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED",
      extrapolated: false,
      diagnostics: [
        "This is a separate direct-turbulence preliminary d\u2083\u2082 route; it is NOT the verified K&H 1996 equation.",
        "C range [0.36, 0.43] is project-controlled sensitivity only: no authoritative source verifies this interval for this exact route in a K\xFChni or RRBO/NMP system.",
        "The nominal-C source reference records the selected value only; this result is not design-decision or release eligible pending authoritative range evidence and pilot validation."
      ],
      provenance: `d\u2083\u2082 = C\xB7(\u03B3/\u03C1_c)^0.6\xB7\u03B5^-0.4, \u03B5 = \u03C8 = ${epsilon} W/kg = m\xB2/s\xB3. Selected C=${cfg.C_nominal} (${cfg.sourceType}: ${cfg.sourceReference}); sensitivity C=[${DIRECT_TURBULENCE_C_MIN}, ${DIRECT_TURBULENCE_C_MAX}]. DIRECT_TURBULENCE_D32_PRELIMINARY \u2014 PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED. ${DIRECT_TURBULENCE_C_RANGE_EVIDENCE_STATUS}; Not K&H 1996, not design-decision eligible, and not pilot-validated for RRBO/NMP.`,
      engineerSource: null,
      directTurbulence: {
        equation: "d32 = C * (gamma / rho_c)^0.6 * epsilon^-0.4",
        epsilon_m2_s3: epsilon,
        epsilonBasis: "governed_psi",
        psi_W_kg: epsilon,
        powerNumber_Ne: null,
        rotorSpeed_s: null,
        rotorDiameter_m: null,
        rotorVolume_m3: null,
        gamma_N_m: localState.sigma_N_m,
        rho_c_kg_m3: localState.rho_c_kg_m3,
        C_nominal: cfg.C_nominal,
        C_min: DIRECT_TURBULENCE_C_MIN,
        C_max: DIRECT_TURBULENCE_C_MAX,
        C_rangeEvidenceStatus: DIRECT_TURBULENCE_C_RANGE_EVIDENCE_STATUS,
        C_rangeDesignDecisionEligible: false,
        C_rangeEvidenceReference: DIRECT_TURBULENCE_C_RANGE_EVIDENCE_REFERENCE,
        d32_at_C_min_m: d32Min,
        d32_at_C_nominal_m: d32Nominal,
        d32_at_C_max_m: d32Max,
        sourceType: cfg.sourceType,
        sourceReference: cfg.sourceReference
      },
      ...directTurbulenceGovernanceFields()
    };
  }
  if (config.mode === "engineer_supplied") {
    const cfg = config;
    const diagnostics = [];
    if (!Number.isFinite(cfg.value_m) || cfg.value_m <= 0) {
      return {
        d32_m: null,
        d32_raw_m: Number.isFinite(cfg.value_m) ? cfg.value_m : null,
        status: "calculation_invalid",
        mode: "engineer_supplied",
        correlationId: null,
        label: null,
        extrapolated: false,
        diagnostics: ["Engineer-supplied d\u2083\u2082 value must be a finite positive number (m)."],
        provenance: "Engineer-supplied value rejected \u2014 failed physical admissibility guard (d\u2083\u2082 > 0).",
        engineerSource: { sourceType: cfg.sourceType, sourceReference: cfg.sourceReference },
        ...engineerGovernanceFields()
      };
    }
    if (!cfg.sourceType || !cfg.sourceType.trim()) {
      diagnostics.push("WARNING: sourceType is empty \u2014 engineer-supplied d\u2083\u2082 should carry an explicit source type.");
    }
    if (!cfg.sourceReference || !cfg.sourceReference.trim()) {
      diagnostics.push("WARNING: sourceReference is empty \u2014 engineer-supplied d\u2083\u2082 should carry an explicit source reference.");
    }
    const d32_mm = cfg.value_m * 1e3;
    if (d32_mm < 0.1) {
      diagnostics.push(
        `ADVISORY: d\u2083\u2082 = ${d32_mm.toFixed(3)} mm is below the typical K\xFChni range (0.5\u20135 mm). Verify the supplied value. Not clamped \u2014 engineer basis accepted as supplied.`
      );
    }
    if (d32_mm > 10) {
      diagnostics.push(
        `ADVISORY: d\u2083\u2082 = ${d32_mm.toFixed(2)} mm is above the typical K\xFChni range (0.5\u20135 mm). Verify the supplied value. Not clamped \u2014 engineer basis accepted as supplied.`
      );
    }
    return {
      d32_m: cfg.value_m,
      d32_raw_m: cfg.value_m,
      status: "engineer_supplied",
      mode: "engineer_supplied",
      correlationId: null,
      label: "Engineer-Supplied d\u2083\u2082 \u2014 Simulator Development / Sensitivity Basis",
      extrapolated: false,
      diagnostics,
      provenance: `Engineer-supplied d\u2083\u2082: ${cfg.value_m * 1e3} mm. Source type: ${cfg.sourceType || "(not specified)"}. Reference: ${cfg.sourceReference || "(not specified)"}. NOT a published correlation result. For simulator development and sensitivity testing only. All downstream outputs (a, k_c, k_d, K_oa) carry the same engineer-basis label.`,
      engineerSource: {
        sourceType: cfg.sourceType,
        sourceReference: cfg.sourceReference
      },
      ...engineerGovernanceFields()
    };
  }
  if (config.mode === "published_correlation") {
    const location = stateLocation(localState);
    return {
      d32_m: null,
      d32_raw_m: null,
      status: "transcription_invalid",
      mode: "published_correlation",
      correlationId: "ecr2_d32_kh1996",
      label: null,
      extrapolated: false,
      diagnostics: [
        `K&H 1996 d\u2083\u2082 at ${location} is not calculated: the former reconstruction is transcription-invalid.`,
        "Rahimpour et al. (2024), Table 1 (explicitly \u201CPulse and karr\u201D), and Laitinen et al. (2019), Eq. (3) (K\xFChni-specific), both show a reciprocal high-agitation contribution; the legacy implementation directly added that contribution.",
        "Laitinen confirms \u03C8 is mechanical power dissipation per unit mass (W/kg), but neither independent secondary reproduction resolves H or the numerator symbol sufficiently for numerical execution.",
        ...TRANSCRIPTION_INVALID_TRACEABILITY
      ],
      provenance: "K&H 1996 published-correlation route disabled. The former C\u2081^n\u2081/direct-Term\u2082 reconstruction produced legacy outputs including approximately 10.299 m, but is incompatible with independently reproduced reciprocal high-agitation structure. No corrected numerical d\u2083\u2082 is asserted until H, numerator symbol, coefficient mapping, phase convention, and applicability are independently resolved.",
      engineerSource: null,
      ...publishedGovernanceFields()
    };
  }
  const _exhaustive = config;
  return _exhaustive;
}

// server/ecr-pre-pilot/kuhni-hydrodynamics.ts
var KUHNI_PHASE1_ENGINE_VERSION = "KUHNI_PHASE1_V1.0.3";
var KUHNI_PHASE1_SOURCE = "Kumar, A. & Hartland, S. (1995), Ind. Eng. Chem. Res. 34, 3925\u20133940, Eq. 1, 4, 15\u201319, Tables 1\u20132.";
var KUHNI_PHASE1_ENGINE_HASH = createHash("sha256").update(`${KUHNI_PHASE1_ENGINE_VERSION}|${KUHNI_PHASE1_SOURCE}|Eq19:e^-0.77*lterm^0|governed-geometry|explicit-capacity-gap|diagnostic-hold-status|quantity-specific-applicability|direct-turbulence-v1`).digest("hex");
var G = 9.80665;
var PI = Math.PI;
var envelope = {
  rhoC: [994, 1003],
  rhoD: [801, 882],
  muC: [97e-5, 161e-5],
  muD: [66e-5, 392e-5],
  gamma: [8e-4, 0.0341],
  dc: [0.072, 0.2],
  dr: [0.05, 0.085],
  h: [0.05, 0.09],
  hDc: [0.45, 0.69],
  drDc: [0.43, 0.69],
  drH: [0.94, 1.21],
  statorFreeArea: [0.16, 1],
  uc: [2e-4, 79e-4],
  ud: [1e-4, 88e-4],
  n: [0, 5],
  flowRatio: [0.09, 5],
  reR: [0, 36058],
  epsilon: [0, 0.83]
};
function within(v, r) {
  return v >= r[0] && v <= r[1];
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function kuhniRunHash(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function evaluateKuhniHydrodynamics(input, basis) {
  const area = PI * input.columnDiameterM ** 2 / 4;
  const nmpContinuous = basis.phaseConfiguration === "nmp-continuous-rrbo-dispersed";
  const continuous = nmpContinuous ? basis.wetSolventPhase : basis.rrboFeed;
  const dispersed = nmpContinuous ? basis.rrboFeed : basis.wetSolventPhase;
  const uc = continuous.flowM3S / area, ud = dispersed.flowM3S / area;
  const diagnostics = [];
  const runBlockers = /* @__PURE__ */ new Set([
    "FLOODING_CAPACITY_CORRELATION_UNAVAILABLE: no generic K\xFChni flooding velocity, capacity metric, or percent-flooding result is admitted."
  ]);
  const tests = [
    ["rho_c", continuous.densityKgM3, envelope.rhoC],
    ["rho_d", dispersed.densityKgM3, envelope.rhoD],
    ["mu_c", continuous.dynamicViscosityPaS, envelope.muC],
    ["mu_d", dispersed.dynamicViscosityPaS, envelope.muD],
    ["gamma", basis.interfacialTensionNM, envelope.gamma],
    ["Dc", input.columnDiameterM, envelope.dc],
    ["Dr", input.rotorDiameterM, envelope.dr],
    ["H", input.compartmentHeightM, envelope.h],
    ["H/Dc", input.compartmentHeightM / input.columnDiameterM, envelope.hDc],
    ["Dr/Dc", input.rotorDiameterM / input.columnDiameterM, envelope.drDc],
    ["Dr/H", input.rotorDiameterM / input.compartmentHeightM, envelope.drH],
    ["stator free area", input.statorFreeAreaFraction, envelope.statorFreeArea],
    ["Uc", uc, envelope.uc],
    ["Ud", ud, envelope.ud],
    ["R=Vd/Vc", ud / uc, envelope.flowRatio]
  ];
  tests.filter(([, v, r]) => !within(v, r)).forEach(([n, v, r]) => diagnostics.push(`TABLE_1_OUT_OF_RANGE:${n}=${v}; permitted [${r[0]},${r[1]}] SI.`));
  diagnostics.forEach((diagnostic) => runBlockers.add(`KH1995_HOLDUP_NOT_APPLICABLE:${diagnostic}`));
  const speeds = [];
  for (let rpm = input.rotorSpeedRpmMin; rpm <= input.rotorSpeedRpmMax + 1e-8; rpm += input.rotorSpeedRpmStep) {
    const n = rpm / 60, tip = PI * input.rotorDiameterM * n;
    const power = input.powerNumber * continuous.densityKgM3 * n ** 3 * input.rotorDiameterM ** 5;
    const pv = power / (area * input.compartmentHeightM), psi = pv / continuous.densityKgM3;
    const reR = continuous.densityKgM3 * n * input.rotorDiameterM ** 2 / continuous.dynamicViscosityPaS;
    const tipBlocked = tip > 4.5;
    const trialDiagnostics = tipBlocked ? ["TIP_SPEED_LIMIT_EXCEEDED: maximum permitted tip speed is 4.5 m/s."] : [];
    const holdupDiagnostics = [...diagnostics];
    if (!within(n, envelope.n)) holdupDiagnostics.push(`TABLE_1_OUT_OF_RANGE:N=${n}; permitted [0,5] 1/s.`);
    if (!within(reR, envelope.reR)) holdupDiagnostics.push(`TABLE_1_OUT_OF_RANGE:Re_R=${reR}; permitted [0,36058].`);
    if (!within(psi, envelope.epsilon)) holdupDiagnostics.push(`TABLE_1_OUT_OF_RANGE:epsilon=${psi}; permitted [0,0.83] W/kg.`);
    if (!(continuous.densityKgM3 > dispersed.densityKgM3)) holdupDiagnostics.push("CONTINUOUS_PHASE_NOT_HEAVIER: Eq18 requires positive delta-rho = rho_c-rho_d.");
    if (tipBlocked) runBlockers.add(`RPM_${rpm}:TIP_SPEED_LIMIT_EXCEEDED`);
    let phi = null, d32 = null, slip = null, vk = null, a = null;
    if (!tipBlocked && (input.allowApplicabilityExtrapolation || !holdupDiagnostics.length)) {
      const theta = (continuous.densityKgM3 / (G * basis.interfacialTensionNM)) ** 0.25;
      const pi = 0.0267 + (psi / G * theta) ** 0.77;
      const Phi = (ud * theta) ** 0.64 * Math.exp(20.7 * uc * theta);
      const deltaRho = continuous.densityKgM3 - dispersed.densityKgM3;
      const Psi = (deltaRho > 0 ? deltaRho / continuous.densityKgM3 : NaN) ** -0.34 * (dispersed.dynamicViscosityPaS / 1e-3) ** 0;
      const Gamma = 2.27 * input.statorFreeAreaFraction ** -0.77 * (input.rotorDiameterM * (continuous.densityKgM3 * G / basis.interfacialTensionNM) ** 0.5) ** 0;
      phi = pi * Phi * Psi * Gamma;
      if (!(phi > 0 && phi < 1)) {
        phi = null;
        holdupDiagnostics.push("NOT_CALCULABLE: Eq15 produced non-physical holdup.");
      }
      if (phi !== null) {
        slip = ud / phi + uc / (1 - phi);
        vk = slip / (1 - phi);
      }
    }
    const d = tipBlocked ? null : computeDropletDiameter(
      { sigma_N_m: basis.interfacialTensionNM, rho_c_kg_m3: continuous.densityKgM3, psi_W_kg: psi },
      { mode: "direct_turbulence_preliminary", correlationId: "ecr2_d32_direct_turbulence_preliminary", C_nominal: input.directTurbulenceC, sourceType: "Project-Controlled Preliminary", sourceReference: "ECR-2 direct-turbulence preliminary sensitivity register" }
    );
    d32 = d?.d32_m ?? null;
    if (d32 && phi) a = 6 * phi / d32;
    const holdupStatus = phi ? "CALCULATED_PRELIMINARY" : "NOT_CALCULABLE";
    const d32Status = d32 ? "CALCULATED_PRELIMINARY" : "NOT_CALCULABLE";
    const trialBlockers = [
      ...holdupDiagnostics.map((diagnostic) => `KH1995_HOLDUP_NOT_APPLICABLE:${diagnostic}`),
      ...tipBlocked ? ["TIP_SPEED_LIMIT_EXCEEDED"] : [],
      ...!d32 ? ["D32_NOT_CALCULABLE"] : [],
      "FLOODING_CAPACITY_CORRELATION_UNAVAILABLE"
    ];
    holdupDiagnostics.filter((diagnostic) => !diagnostics.includes(diagnostic)).forEach((diagnostic) => runBlockers.add(`RPM_${rpm}:KH1995_HOLDUP_NOT_APPLICABLE:${diagnostic}`));
    if (!d32) runBlockers.add(`RPM_${rpm}:D32_NOT_CALCULABLE`);
    const geometryRatios = {
      rotorToColumn: input.rotorDiameterM / input.columnDiameterM,
      compartmentToColumn: input.compartmentHeightM / input.columnDiameterM,
      rotorToCompartment: input.rotorDiameterM / input.compartmentHeightM,
      statorFreeArea: input.statorFreeAreaFraction
    };
    speeds.push({
      rpm,
      rotorSpeedS: n,
      tipSpeedMS: tip,
      tipSpeed: { status: tipBlocked ? "NOT_CALCULABLE" : "CALCULATED_PRELIMINARY", limitMS: 4.5, marginMS: 4.5 - tip, blocked: tipBlocked },
      geometry: {
        status: "CALCULATED_PRELIMINARY",
        columnDiameterM: input.columnDiameterM,
        rotorDiameterM: input.rotorDiameterM,
        compartmentHeightM: input.compartmentHeightM,
        columnAreaM2: area,
        ratios: geometryRatios
      },
      powerW: power,
      powerNumber: { value: input.powerNumber, provenance: "ENGINEERING_INPUT" },
      powerVolumeWM3: pv,
      psiWKg: psi,
      rotorReynolds: reR,
      superficialVelocitiesMS: { status: "CALCULATED_PRELIMINARY", Ud: ud, Uc: uc, continuousIdentity: continuous.identity, dispersedIdentity: dispersed.identity },
      phiD: phi,
      holdup: { status: holdupStatus, value: phi, diagnostics: holdupDiagnostics },
      d32M: d32,
      d32: { status: d32Status, valueM: d32, diagnostics: d?.diagnostics ?? trialDiagnostics },
      slipMS: slip,
      vkMS: vk,
      slip: { status: phi ? "CALCULATED_PRELIMINARY" : "NOT_CALCULABLE", dependency: phi ? null : "KH1995_HOLDUP_NOT_CALCULABLE" },
      flooding: {
        status: "CORRELATION_UNAVAILABLE",
        floodingVelocityMS: null,
        capacityMetric: null,
        percentFlooding: null,
        message: "Kumar & Hartland (1995) supplies no general K\xFChni flooding/capacity equation; no flooding state or percentage is inferred from holdup."
      },
      interfacialAreaM2M3: a,
      interfacialArea: { status: a ? "CALCULATED_PRELIMINARY" : "NOT_CALCULABLE", dependency: !phi ? "KH1995_HOLDUP_NOT_CALCULABLE" : !d32 ? "D32_NOT_CALCULABLE" : null },
      status: "PRELIMINARY_DIAGNOSTIC_HOLD",
      blockers: trialBlockers,
      diagnostics: trialDiagnostics
    });
  }
  const empiricalRecords = [
    { id: "kh1995_holdup_eq15_19", version: "1.0.0", source: KUHNI_PHASE1_SOURCE, equation: "Eq15-19; phi=Pi*Phi*Psi*Gamma; Gamma=Cr*e^n6*[l*(rho_c*g/gamma)^0.5]^n7", units: "dimensionless; SI inputs", ranges: envelope, constants: { Ceta: 0.0267, Cpsi: 1, Cr: 2.27, n1: 0.77, n2: 0.64, n3: 20.7, n4: -0.34, n5: 0, n6: -0.77, n7: 0, g: G }, symbolDefinitions: { e: "Kuhni stator/free-area fraction", l: "rotor length scale", mu_w: "1e-3 Pa.s", epsilon: "P/(Ac*H*rho_c)" }, assumptions: ["water-continuous Table-1 K\xFChni source chemistry", "Cpsi=1, no mass transfer", "Kuhni e=stator/free-area fraction; Cr=2.27,n6=-0.77,n7=0"], applicabilityDiagnostics: diagnostics, implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    { id: "direct_turbulence_d32_preliminary", version: "1.0.0", source: "Project-controlled preliminary route", equation: "d32=C*(gamma/rho_c)^0.6*psi^-0.4", units: "d32 m; gamma N/m; rho_c kg/m3; psi W/kg", ranges: { C: [0.36, 0.43], inputs: "positive finite gamma, rho_c, psi" }, constants: { C: "selected engineering input, 0.36-0.43" }, symbolDefinitions: { psi: "(P/V)/rho_c", rho_c: "saved Stage-1 continuous-phase density" }, assumptions: ["project-controlled preliminary", "not K&H 1995 or 1996"], applicabilityDiagnostics: ["Project-controlled C range only; positive finite sigma/rho/psi required.", "See this trial d32 diagnostics for computeDropletDiameter provenance."], implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    { id: "phase_continuity_slip_identity", version: "1.0.0", source: "K&H 1995 Eq1 and Eq4", equation: "Vslip=Vd/phi+Vc/(1-phi); Vk=Vslip/(1-phi)", units: "m/s", ranges: "requires 0<phi<1", constants: {}, symbolDefinitions: { Vd: "saved Stage-1 dispersed superficial velocity", Vc: "saved Stage-1 continuous superficial velocity" }, assumptions: ["two-phase continuity identity"], applicabilityDiagnostics: diagnostics, implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    { id: "engineering_power_identity", version: "1.0.0", source: "Engineering input power identity; K&H attribution limited to epsilon=P/(Ac*H*rho_c)", equation: "P=Np*rho_c*N^3*Dr^5; P/V=P/(Ac*H); psi=(P/V)/rho_c", units: "P W; P/V W/m3; psi W/kg", ranges: "positive finite engineering power number and geometry", constants: { Np: "user-entered ENGINEERING_INPUT" }, symbolDefinitions: { Ac: "pi*Dc^2/4", N: "rotor speed 1/s" }, assumptions: ["power number is not attributed to K&H"], applicabilityDiagnostics: [], implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    { id: "interfacial_area_identity", version: "1.0.0", source: "Drop-population interfacial-area identity", equation: "a=6*phi/d32", units: "m2/m3", ranges: "requires 0<phi<1 and d32>0 m", constants: { factor: 6 }, symbolDefinitions: { phi: "dispersed holdup included once", d32: "Sauter mean diameter m" }, assumptions: ["no second phase-fraction factor"], applicabilityDiagnostics: ["Blocked when holdup or d32 is not calculable."], implementationHash: KUHNI_PHASE1_ENGINE_HASH }
  ];
  return {
    status: "PRELIMINARY_DIAGNOSTIC_HOLD",
    blockers: [...runBlockers],
    engine: { id: "kuhni_phase1_hydrodynamics", version: KUHNI_PHASE1_ENGINE_VERSION, implementationHash: KUHNI_PHASE1_ENGINE_HASH },
    source: {
      reference: KUHNI_PHASE1_SOURCE,
      equations: ["Eq15 phi=Pi*Phi*Psi*Gamma", "Eq16 Pi", "Eq17 Phi", "Eq18 Psi Cpsi=1 no mass transfer mu_w=1e-3 Pa.s", "Eq19 Gamma=Cr*e^n6*[l*(rho_c*g/gamma)^0.5]^n7", "Eq1 Vslip", "Eq4 Vk", "P=Np*rho_c*N^3*Dr^5", "a=6phi/d32"],
      assumptions: ["Table-1 K\xFChni water-continuous source chemistry is qualification metadata and distinct from RRBO/NMP applicability; it is not an execution gate.", "No mass transfer Cpsi=1.", "d32 route is project-controlled preliminary, not K&H 1995/1996."],
      chemicalSystemQualification: { sourceContinuousPhase: "water", actualContinuousPhase: continuous.identity, rrboNmpValidated: false, executionGate: false },
      aarePercent: 21.4
    },
    empiricalRecords,
    processBasis: basis,
    input,
    records: speeds,
    applicabilityDiagnostics: diagnostics
  };
}

// server/ecr-pre-pilot/stage3-stage4-optimizer.ts
import { createHash as createHash7 } from "node:crypto";

// server/ecr-pre-pilot/kuhni-geometry-resolver-v140.ts
import { createHash as createHash6 } from "node:crypto";

// server/ecr-pre-pilot/kuhni-geometry-resolver-v130.ts
import { createHash as createHash5 } from "node:crypto";

// server/ecr-pre-pilot/kuhni-geometry-resolver-v120.ts
import { createHash as createHash4 } from "node:crypto";

// server/ecr-pre-pilot/kuhni-geometry-resolver-v110.ts
import { createHash as createHash3 } from "node:crypto";

// server/ecr-pre-pilot/kuhni-geometry-resolver.ts
import { createHash as createHash2 } from "node:crypto";
var KUHNI_GEOMETRY_RESOLVER_V100_VERSION = "KUHNI_GEOMETRY_RESOLVER_V1.0.0";
var KUHNI_GEOMETRY_RESOLVER_VERSION = "KUHNI_GEOMETRY_RESOLVER_V1.0.1";
var KUHNI_DRAG_MODEL_VERSION = "MYINT_GARTHE_PREPILOT_CLOSURE_V1.0.0";
var STAGE3_GEOMETRY_DESIGN_NT = 7;
var G2 = 9.80665;
var PI2 = Math.PI;
var ROTOR_TO_COLUMN = 0.5;
var COMPARTMENT_TO_COLUMN = 0.5;
var STATOR_FREE_AREA = 0.35;
var POWER_NUMBER = 1.2;
var DIRECT_TURBULENCE_C = 0.42;
var DESIGN_FLOOD_FRACTION = 0.7;
var MAX_TIP_SPEED_MS = 4.5;
function implementationHash(version, resultAdmissionRule) {
  const descriptors = [
    version,
    KUHNI_DRAG_MODEL_VERSION,
    "stage1-authority|stage2-nt-or-system-default-7",
    "Myint2006-Cd|Myint2007-shape|Garthe5.6-5.7|Garthe8.3-square-root",
    "turning-point-capacity|70%-flood|rpm:5..60|tip<=4.5",
    "ratios:Dr/Dc=.5,Hc/Dc=.5|Np=1.2|C=.42"
  ];
  if (resultAdmissionRule) descriptors.push(resultAdmissionRule);
  return createHash2("sha256").update(descriptors.join("|")).digest("hex");
}
var KUHNI_GEOMETRY_RESOLVER_V100_HASH = implementationHash(
  KUHNI_GEOMETRY_RESOLVER_V100_VERSION,
  ""
);
var KUHNI_GEOMETRY_RESOLVER_HASH = implementationHash(
  KUHNI_GEOMETRY_RESOLVER_VERSION,
  "visible-envelope-and-diagnostic:CALCULATED_IN_RANGE-only|extrapolated:audit-only"
);
function bisect2(fn, low, high, iterations = 50) {
  let fLow = fn(low);
  const fHigh = fn(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) throw new Error("ROOT_NOT_BRACKETED");
  for (let i = 0; i < iterations; i += 1) {
    const mid = (low + high) / 2;
    const fMid = fn(mid);
    if (!Number.isFinite(fMid)) throw new Error("NON_FINITE_ROOT_RESIDUAL");
    if (fLow * fMid <= 0) high = mid;
    else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}
function goldenMax(fn, low, high, iterations = 32) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let c = high - ratio * (high - low);
  let d = low + ratio * (high - low);
  let fc = fn(c), fd = fn(d);
  for (let i = 0; i < iterations; i += 1) {
    if (fc > fd) {
      high = d;
      d = c;
      fd = fc;
      c = high - ratio * (high - low);
      fc = fn(c);
    } else {
      low = c;
      c = d;
      fc = fd;
      d = low + ratio * (high - low);
      fd = fn(d);
    }
  }
  const x = (low + high) / 2;
  return { x, value: fn(x) };
}
function myintDrag(re, kappa, lambda) {
  if (!(re > 0) || !(kappa > 0) || lambda < 0) throw new Error("INVALID_MYINT_STATE");
  return 8 * (2 + 3 * kappa + 3 * lambda) / (re * (1 + kappa + lambda)) * (1 + 0.15 * re ** 0.687);
}
function terminalState(diameterM, rhoC, rhoD, muC, muD, sigma) {
  const deltaRho = rhoC - rhoD;
  if (!(diameterM > 0 && deltaRho > 0 && sigma > 0 && muC > 0 && muD > 0)) throw new Error("NON_PHYSICAL_TERMINAL_INPUT");
  const kappa = muD / muC;
  const archimedes = rhoC * deltaRho * G2 * diameterM ** 3 / muC ** 2;
  const residual = (re2) => myintDrag(re2, kappa, 0) * re2 ** 2 - 4 * archimedes / 3;
  let high = 1;
  while (residual(high) < 0 && high < 1e7) high *= 2;
  const re = bisect2(residual, 1e-12, high);
  const velocityMS = re * muC / (rhoC * diameterM);
  const eotvos = deltaRho * G2 * diameterM ** 2 / sigma;
  const morton = G2 * muC ** 4 * deltaRho / (rhoC ** 2 * sigma ** 3);
  const taylor = re * morton ** 0.23;
  const aspectRatio = 1 - 0.0487 * taylor - 0.0289 * taylor ** 2;
  return { velocityMS, re, drag: myintDrag(re, kappa, 0), eotvos, morton, kappa, taylor, aspectRatio };
}
function evaluateCandidate(columnDiameterM, rpm, basis, geometry = {}) {
  const continuous = basis.phaseConfiguration === "nmp-continuous-rrbo-dispersed" ? basis.wetSolventPhase : basis.rrboFeed;
  const dispersed = basis.phaseConfiguration === "nmp-continuous-rrbo-dispersed" ? basis.rrboFeed : basis.wetSolventPhase;
  if (!(continuous.densityKgM3 > dispersed.densityKgM3)) throw new Error("CONTINUOUS_PHASE_MUST_BE_HEAVIER");
  const rotorToColumn = geometry.rotorToColumn ?? ROTOR_TO_COLUMN;
  const compartmentToColumn = geometry.compartmentToColumn ?? COMPARTMENT_TO_COLUMN;
  const statorFreeArea = geometry.statorFreeArea ?? STATOR_FREE_AREA;
  const powerNumber = geometry.powerNumber ?? POWER_NUMBER;
  const directTurbulenceC = geometry.directTurbulenceC ?? DIRECT_TURBULENCE_C;
  if (!(rotorToColumn > 0 && rotorToColumn < 1) || !(compartmentToColumn > 0) || !(statorFreeArea > 0 && statorFreeArea < 1) || !(powerNumber > 0) || !(directTurbulenceC > 0)) throw new Error("NON_PHYSICAL_HYDRAULIC_TRIAL_GEOMETRY");
  const rotorDiameterM = rotorToColumn * columnDiameterM;
  const compartmentHeightM = compartmentToColumn * columnDiameterM;
  const n = rpm / 60;
  const tipSpeedMS = PI2 * rotorDiameterM * n;
  if (tipSpeedMS > MAX_TIP_SPEED_MS) throw new Error("TIP_SPEED_LIMIT_EXCEEDED");
  const areaM2 = PI2 * columnDiameterM ** 2 / 4;
  const powerW = powerNumber * continuous.densityKgM3 * n ** 3 * rotorDiameterM ** 5;
  const psiWKg = powerW / (areaM2 * compartmentHeightM * continuous.densityKgM3);
  const d32M = directTurbulenceC * (basis.interfacialTensionNM / continuous.densityKgM3) ** 0.6 * psiWKg ** -0.4;
  if (!(d32M > 0 && Number.isFinite(d32M))) throw new Error("D32_NOT_CALCULABLE");
  const terminal = terminalState(
    d32M,
    continuous.densityKgM3,
    dispersed.densityKgM3,
    continuous.dynamicViscosityPaS,
    dispersed.dynamicViscosityPaS,
    basis.interfacialTensionNM
  );
  const rotorReynolds = continuous.densityKgM3 * n * rotorDiameterM ** 2 / continuous.dynamicViscosityPaS;
  if (!(rotorReynolds > 0)) throw new Error("ROTOR_REYNOLDS_NOT_CALCULABLE");
  const sourcePowerNumber = 1.08 + 10.94 / Math.sqrt(rotorReynolds) + 257.37 / rotorReynolds ** 1.5;
  const characteristicFactor = 1 - 1.669 * sourcePowerNumber ** -3.945 - 2.807 * (d32M / (columnDiameterM - rotorDiameterM)) ** 1.336 - 1.159 * (compartmentHeightM / columnDiameterM) ** 2.049 + 2.1 * statorFreeArea ** 1.032;
  if (!(characteristicFactor > 0)) throw new Error("NON_POSITIVE_GARTHE_CHARACTERISTIC_FACTOR");
  const characteristicVelocityMS = terminal.velocityMS * characteristicFactor;
  const characteristicRe = continuous.densityKgM3 * characteristicVelocityMS * d32M / continuous.dynamicViscosityPaS;
  const characteristicDrag = myintDrag(characteristicRe, terminal.kappa, 0);
  const swarmVelocity = (holdup) => {
    const residual = (velocity) => {
      const re = continuous.densityKgM3 * velocity * d32M / continuous.dynamicViscosityPaS;
      const drag = myintDrag(re, terminal.kappa, 0);
      return velocity - characteristicVelocityMS * Math.sqrt(characteristicDrag / drag * (1 - holdup) ** 4.65);
    };
    return bisect2(residual, 1e-14, characteristicVelocityMS);
  };
  const flowRatio = dispersed.flowM3S / continuous.flowM3S;
  const capacityAtHoldup = (holdup) => (1 + flowRatio) * swarmVelocity(holdup) / (flowRatio / holdup + 1 / (1 - holdup));
  const flood = goldenMax(capacityAtHoldup, 1e-7, 1 - 1e-7);
  if (!(flood.value > 0 && flood.x > 0 && flood.x < 1)) throw new Error("NO_INTERIOR_FLOODING_MAXIMUM");
  const actualLoading = (continuous.flowM3S + dispersed.flowM3S) / (areaM2 * flood.value);
  const swarmVelocityMS = swarmVelocity(flood.x);
  const swarmRe = continuous.densityKgM3 * swarmVelocityMS * d32M / continuous.dynamicViscosityPaS;
  const dragApplicability = [];
  const shapeApplicability = [];
  const dragCheck = (condition, code) => {
    if (!condition) dragApplicability.push(code);
  };
  const shapeCheck = (condition, code) => {
    if (!condition) shapeApplicability.push(code);
  };
  const log10Morton = Math.log10(terminal.morton);
  dragCheck(log10Morton > -11.6 && log10Morton < -0.9, `MYINT_DRAG_MORTON_EXTRAPOLATED:${log10Morton}`);
  dragCheck(terminal.re > 0.17 && terminal.re < 200, `MYINT_TERMINAL_RE_EXTRAPOLATED:${terminal.re}`);
  dragCheck(characteristicRe > 0.17 && characteristicRe < 200, `MYINT_CHARACTERISTIC_RE_EXTRAPOLATED:${characteristicRe}`);
  dragCheck(swarmRe > 0.17 && swarmRe < 200, `MYINT_SWARM_RE_EXTRAPOLATED:${swarmRe}`);
  dragCheck(terminal.eotvos > 0.017 && terminal.eotvos < 12.1, `MYINT_DRAG_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  dragCheck(terminal.kappa > 0.1 && terminal.kappa < 100, `MYINT_DRAG_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  shapeCheck(log10Morton >= -11.6 && log10Morton <= -0.9, `MYINT_SHAPE_MORTON_EXTRAPOLATED:${log10Morton}`);
  shapeCheck(terminal.re >= 0.015 && terminal.re <= 850, `MYINT_SHAPE_RE_EXTRAPOLATED:${terminal.re}`);
  shapeCheck(terminal.eotvos >= 0.017 && terminal.eotvos <= 9.3, `MYINT_SHAPE_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  shapeCheck(terminal.taylor >= 74e-4 && terminal.taylor <= 3.6, `MYINT_SHAPE_TAYLOR_EXTRAPOLATED:${terminal.taylor}`);
  shapeCheck(terminal.kappa >= 0.1 && terminal.kappa <= 100, `MYINT_SHAPE_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  shapeCheck(terminal.aspectRatio > 0 && terminal.aspectRatio <= 1, `MYINT_SHAPE_NON_PHYSICAL:${terminal.aspectRatio}`);
  const applicability = [...dragApplicability, ...shapeApplicability];
  return {
    rpm,
    columnDiameterM,
    rotorDiameterM,
    compartmentHeightM,
    tipSpeedMS,
    powerW,
    powerVolumeWM3: powerW / (areaM2 * compartmentHeightM),
    psiWKg,
    d32M,
    rotorReynolds,
    terminal,
    sourcePowerNumber,
    characteristicFactor,
    characteristicVelocityMS,
    characteristicRe,
    floodHoldup: flood.x,
    floodTotalSuperficialVelocityMS: flood.value,
    swarmVelocityAtFloodMS: swarmVelocityMS,
    swarmRe,
    actualLoading,
    designFloodFraction: DESIGN_FLOOD_FRACTION,
    hydraulicPass: actualLoading <= DESIGN_FLOOD_FRACTION,
    applicability,
    dragApplicability,
    shapeApplicability,
    status: applicability.length ? "CALCULATED_EXTRAPOLATED" : "CALCULATED_IN_RANGE"
  };
}
function evaluateKuhniHydraulicTrial(columnDiameterM, rpm, basis, geometry = {}) {
  return evaluateCandidate(columnDiameterM, rpm, basis, geometry);
}

// server/ecr-pre-pilot/kuhni-geometry-resolver-v110.ts
var KUHNI_GEOMETRY_RESOLVER_V110_VERSION = "KUHNI_GEOMETRY_RESOLVER_V1.1.0";
var implementationDescriptors = [
  KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
  KUHNI_GEOMETRY_RESOLVER_HASH,
  KUHNI_DRAG_MODEL_VERSION,
  "frozen-stage-3-characteristic-velocity-and-swarm-model",
  "F(phi)=vchar(phi)-[jD/phi+jC/(1-phi)]",
  "stable-low-holdup-root-strictly-below-flooding-turning-point",
  "no-root=HYDRAULICALLY_INFEASIBLE|flood-holdup-never-substituted"
];
var KUHNI_GEOMETRY_RESOLVER_V110_HASH = createHash3("sha256").update(implementationDescriptors.join("|")).digest("hex");

// server/ecr-pre-pilot/kuhni-geometry-resolver-v120.ts
var KUHNI_GEOMETRY_RESOLVER_V120_VERSION = "KUHNI_GEOMETRY_RESOLVER_V1.2.0";
var implementationDescriptors2 = [
  KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V110_HASH,
  "phase-applicability-boundary:continuous-heavy-downward-dispersed-light-upward-only",
  "no-abs-density|no-phase-swap|no-reversed-buoyancy-fallback",
  "explicit-prerequisite-root-failure-phase-metadata",
  "preserve-stage1-stage2-lineage-and-inrange-admission"
];
var KUHNI_GEOMETRY_RESOLVER_V120_HASH = createHash4("sha256").update(implementationDescriptors2.join("|")).digest("hex");

// server/ecr-pre-pilot/kuhni-geometry-resolver-v130.ts
var KUHNI_GEOMETRY_RESOLVER_V130_VERSION = "KUHNI_GEOMETRY_RESOLVER_V1.3.0";
var implementationDescriptors3 = [
  KUHNI_GEOMETRY_RESOLVER_V130_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V120_HASH,
  `fixed-stage3-geometry-design-nt:${STAGE3_GEOMETRY_DESIGN_NT}`,
  "stage2-accepted-predictive-nt-retained-separately",
  "stage2-stage4-scientific-authority-not-relabelled"
];
var KUHNI_GEOMETRY_RESOLVER_V130_HASH = createHash5("sha256").update(implementationDescriptors3.join("|")).digest("hex");

// server/ecr-pre-pilot/kuhni-geometry-resolver-v140.ts
var KUHNI_GEOMETRY_RESOLVER_V140_VERSION = "KUHNI_GEOMETRY_RESOLVER_V1.4.0";
var G3 = 9.80665;
var PI3 = Math.PI;
var ROTOR_TO_COLUMN2 = 0.5;
var COMPARTMENT_TO_COLUMN2 = 0.5;
var STATOR_FREE_AREA2 = 0.35;
var POWER_NUMBER2 = 1.2;
var DIRECT_TURBULENCE_C2 = 0.42;
var DESIGN_FLOOD_FRACTION2 = 0.7;
var MAX_TIP_SPEED_MS2 = 4.5;
var ROOT_BOUND = 1e-7;
var implementationDescriptors4 = [
  KUHNI_GEOMETRY_RESOLVER_V140_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V130_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V130_HASH,
  "reverse-orientation-signed-buoyancy-force-balance",
  "countercurrent-mapping:rrbo-upward-bottom-to-top|nmp-downward-top-to-bottom",
  "preliminary-only:never-admit-reverse-trial-or-diameter",
  "myint-garthe-reverse-extrapolation-explicitly-diagnostic",
  "fixed-stage3-geometry-design-nt-and-stage2-retained-separately",
  "actual-loading:total-flow-over-area-over-flood-capacity-velocity"
];
var KUHNI_GEOMETRY_RESOLVER_V140_HASH = createHash6("sha256").update(implementationDescriptors4.join("|")).digest("hex");
function bisect3(fn, low, high, iterations = 60) {
  let fLow = fn(low);
  const fHigh = fn(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) {
    throw new Error("ROOT_NOT_BRACKETED");
  }
  for (let i = 0; i < iterations; i += 1) {
    const mid = (low + high) / 2;
    const fMid = fn(mid);
    if (!Number.isFinite(fMid)) throw new Error("NON_FINITE_ROOT_RESIDUAL");
    if (fLow * fMid <= 0) high = mid;
    else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}
function goldenMax2(fn, low, high, iterations = 32) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let c = high - ratio * (high - low);
  let d = low + ratio * (high - low);
  let fc = fn(c);
  let fd = fn(d);
  for (let i = 0; i < iterations; i += 1) {
    if (fc > fd) {
      high = d;
      d = c;
      fd = fc;
      c = high - ratio * (high - low);
      fc = fn(c);
    } else {
      low = c;
      c = d;
      fc = fd;
      d = low + ratio * (high - low);
      fd = fn(d);
    }
  }
  const x = (low + high) / 2;
  return { x, value: fn(x) };
}
function myintDrag2(re, kappa, lambda) {
  if (!(re > 0) || !(kappa > 0) || lambda < 0) throw new Error("INVALID_MYINT_STATE");
  return 8 * (2 + 3 * kappa + 3 * lambda) / (re * (1 + kappa + lambda)) * (1 + 0.15 * re ** 0.687);
}
function signedTerminalState(diameterM, rhoC, rhoD, muC, muD, sigma) {
  const deltaRho = rhoC - rhoD;
  const buoyancyMagnitude = Math.abs(deltaRho);
  if (!(diameterM > 0 && buoyancyMagnitude > 0 && sigma > 0 && muC > 0 && muD > 0)) {
    throw new Error("NON_PHYSICAL_SIGNED_TERMINAL_INPUT");
  }
  const kappa = muD / muC;
  const archimedes = rhoC * buoyancyMagnitude * G3 * diameterM ** 3 / muC ** 2;
  const dragResidual = (re2) => myintDrag2(re2, kappa, 0) * re2 ** 2 - 4 * archimedes / 3;
  let high = 1;
  while (dragResidual(high) < 0 && high < 1e7) high *= 2;
  const re = bisect3(dragResidual, 1e-12, high);
  const dragCoefficient2 = myintDrag2(re, kappa, 0);
  const relativeVelocityMagnitudeMS = re * muC / (rhoC * diameterM);
  const direction = Math.sign(deltaRho);
  const relativeVelocityMS = direction * relativeVelocityMagnitudeMS;
  const projectedAreaM2 = PI3 * diameterM ** 2 / 4;
  const volumeM3 = PI3 * diameterM ** 3 / 6;
  const signedBuoyancyForceN = deltaRho * volumeM3 * G3;
  const signedDragForceN = 0.5 * rhoC * dragCoefficient2 * projectedAreaM2 * Math.abs(relativeVelocityMS) * relativeVelocityMS;
  const eotvos = buoyancyMagnitude * G3 * diameterM ** 2 / sigma;
  const morton = G3 * muC ** 4 * buoyancyMagnitude / (rhoC ** 2 * sigma ** 3);
  const taylor = re * morton ** 0.23;
  const aspectRatio = 1 - 0.0487 * taylor - 0.0289 * taylor ** 2;
  return {
    deltaRhoKgM3: deltaRho,
    buoyancyMagnitudeKgM3: buoyancyMagnitude,
    buoyancyDirection: deltaRho > 0 ? "DISPERSED_UPWARD" : "DISPERSED_DOWNWARD",
    relativeVelocityMS,
    relativeVelocityMagnitudeMS,
    re,
    dragCoefficient: dragCoefficient2,
    eotvos,
    morton,
    kappa,
    taylor,
    aspectRatio,
    signedBuoyancyForceN,
    buoyancyForceMagnitudeN: Math.abs(signedBuoyancyForceN),
    signedDragForceN,
    dragForceMagnitudeN: Math.abs(signedDragForceN),
    forceBalanceResidualN: signedBuoyancyForceN - signedDragForceN
  };
}
function selectReversePhases(basis) {
  return {
    continuous: basis.rrboFeed,
    dispersed: basis.wetSolventPhase
  };
}
function evaluateKuhniReverseTrial(columnDiameterM, rpm, basis, geometry = {}) {
  const { continuous, dispersed } = selectReversePhases(basis);
  const rotorToColumn = geometry.rotorToColumn ?? ROTOR_TO_COLUMN2;
  const compartmentToColumn = geometry.compartmentToColumn ?? COMPARTMENT_TO_COLUMN2;
  const statorFreeArea = geometry.statorFreeArea ?? STATOR_FREE_AREA2;
  const powerNumber = geometry.powerNumber ?? POWER_NUMBER2;
  const directTurbulenceC = geometry.directTurbulenceC ?? DIRECT_TURBULENCE_C2;
  if (!(rotorToColumn > 0 && rotorToColumn < 1) || !(compartmentToColumn > 0) || !(statorFreeArea > 0 && statorFreeArea < 1) || !(powerNumber > 0) || !(directTurbulenceC > 0)) throw new Error("NON_PHYSICAL_REVERSE_GEOMETRY");
  const rotorDiameterM = rotorToColumn * columnDiameterM;
  const compartmentHeightM = compartmentToColumn * columnDiameterM;
  const n = rpm / 60;
  const tipSpeedMS = PI3 * rotorDiameterM * n;
  if (tipSpeedMS > MAX_TIP_SPEED_MS2) throw new Error("TIP_SPEED_LIMIT_EXCEEDED");
  const areaM2 = PI3 * columnDiameterM ** 2 / 4;
  const powerW = powerNumber * continuous.densityKgM3 * n ** 3 * rotorDiameterM ** 5;
  const psiWKg = powerW / (areaM2 * compartmentHeightM * continuous.densityKgM3);
  const d32M = directTurbulenceC * (basis.interfacialTensionNM / continuous.densityKgM3) ** 0.6 * psiWKg ** -0.4;
  if (!(d32M > 0 && Number.isFinite(d32M))) throw new Error("D32_NOT_CALCULABLE");
  const terminal = signedTerminalState(
    d32M,
    continuous.densityKgM3,
    dispersed.densityKgM3,
    continuous.dynamicViscosityPaS,
    dispersed.dynamicViscosityPaS,
    basis.interfacialTensionNM
  );
  const rotorReynolds = continuous.densityKgM3 * n * rotorDiameterM ** 2 / continuous.dynamicViscosityPaS;
  if (!(rotorReynolds > 0)) throw new Error("ROTOR_REYNOLDS_NOT_CALCULABLE");
  const sourcePowerNumber = 1.08 + 10.94 / Math.sqrt(rotorReynolds) + 257.37 / rotorReynolds ** 1.5;
  const characteristicFactor = 1 - 1.669 * sourcePowerNumber ** -3.945 - 2.807 * (d32M / (columnDiameterM - rotorDiameterM)) ** 1.336 - 1.159 * (compartmentHeightM / columnDiameterM) ** 2.049 + 2.1 * statorFreeArea ** 1.032;
  if (!(characteristicFactor > 0)) {
    throw new Error("NON_POSITIVE_GARTHE_CHARACTERISTIC_FACTOR");
  }
  const characteristicVelocityMagnitudeMS = terminal.relativeVelocityMagnitudeMS * characteristicFactor;
  const characteristicRe = continuous.densityKgM3 * characteristicVelocityMagnitudeMS * d32M / continuous.dynamicViscosityPaS;
  const characteristicDrag = myintDrag2(characteristicRe, terminal.kappa, 0);
  const swarmVelocityMagnitude = (holdup) => {
    const velocityResidual = (velocity) => {
      const re = continuous.densityKgM3 * velocity * d32M / continuous.dynamicViscosityPaS;
      const drag = myintDrag2(re, terminal.kappa, 0);
      return velocity - characteristicVelocityMagnitudeMS * Math.sqrt(characteristicDrag / drag * (1 - holdup) ** 4.65);
    };
    return bisect3(velocityResidual, 1e-14, characteristicVelocityMagnitudeMS);
  };
  const flowRatio = dispersed.flowM3S / continuous.flowM3S;
  const capacityAtHoldup = (holdup) => (1 + flowRatio) * swarmVelocityMagnitude(holdup) / (flowRatio / holdup + 1 / (1 - holdup));
  const flood = goldenMax2(capacityAtHoldup, ROOT_BOUND, 1 - ROOT_BOUND);
  if (!(flood.value > 0 && flood.x > ROOT_BOUND && flood.x < 1 - ROOT_BOUND)) {
    throw new Error("NO_INTERIOR_FLOODING_MAXIMUM");
  }
  const continuousSuperficialVelocityMS = continuous.flowM3S / areaM2;
  const dispersedSuperficialVelocityMS = -dispersed.flowM3S / areaM2;
  const continuousVelocityMS = continuousSuperficialVelocityMS / (1 - flood.x);
  const dispersedVelocityMS = dispersedSuperficialVelocityMS / flood.x;
  const signedRelativeVelocityMS = dispersedVelocityMS - continuousVelocityMS;
  const dragApplicability = [
    "REVERSE_ORIENTATION_MYINT_DRAG_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION"
  ];
  const shapeApplicability = [
    "REVERSE_ORIENTATION_MYINT_SHAPE_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION"
  ];
  const closureApplicability = [
    "REVERSE_ORIENTATION_GARTHE_CHARACTERISTIC_VELOCITY_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION",
    "REVERSE_ORIENTATION_SWARM_HOLDUP_CLOSURE_UNQUALIFIED",
    "REVERSE_ORIENTATION_FLOODING_CLOSURE_UNQUALIFIED"
  ];
  const log10Morton = Math.log10(terminal.morton);
  const dragCheck = (condition, code) => {
    if (!condition) dragApplicability.push(code);
  };
  const shapeCheck = (condition, code) => {
    if (!condition) shapeApplicability.push(code);
  };
  dragCheck(log10Morton > -11.6 && log10Morton < -0.9, `MYINT_DRAG_MORTON_EXTRAPOLATED:${log10Morton}`);
  dragCheck(terminal.re > 0.17 && terminal.re < 200, `MYINT_TERMINAL_RE_EXTRAPOLATED:${terminal.re}`);
  dragCheck(characteristicRe > 0.17 && characteristicRe < 200, `MYINT_CHARACTERISTIC_RE_EXTRAPOLATED:${characteristicRe}`);
  dragCheck(terminal.eotvos > 0.017 && terminal.eotvos < 12.1, `MYINT_DRAG_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  dragCheck(terminal.kappa > 0.1 && terminal.kappa < 100, `MYINT_DRAG_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  const swarmRe = continuous.densityKgM3 * swarmVelocityMagnitude(flood.x) * d32M / continuous.dynamicViscosityPaS;
  dragCheck(swarmRe > 0.17 && swarmRe < 200, `MYINT_SWARM_RE_EXTRAPOLATED:${swarmRe}`);
  shapeCheck(log10Morton >= -11.6 && log10Morton <= -0.9, `MYINT_SHAPE_MORTON_EXTRAPOLATED:${log10Morton}`);
  shapeCheck(terminal.re >= 0.015 && terminal.re <= 850, `MYINT_SHAPE_RE_EXTRAPOLATED:${terminal.re}`);
  shapeCheck(terminal.eotvos >= 0.017 && terminal.eotvos <= 9.3, `MYINT_SHAPE_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  shapeCheck(terminal.taylor >= 74e-4 && terminal.taylor <= 3.6, `MYINT_SHAPE_TAYLOR_EXTRAPOLATED:${terminal.taylor}`);
  shapeCheck(terminal.kappa >= 0.1 && terminal.kappa <= 100, `MYINT_SHAPE_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  shapeCheck(terminal.aspectRatio > 0 && terminal.aspectRatio <= 1, `MYINT_SHAPE_NON_PHYSICAL:${terminal.aspectRatio}`);
  return {
    rpm,
    columnDiameterM,
    rotorDiameterM,
    compartmentHeightM,
    tipSpeedMS,
    powerW,
    powerVolumeWM3: powerW / (areaM2 * compartmentHeightM),
    psiWKg,
    d32M,
    rotorReynolds,
    sourcePowerNumber,
    characteristicFactor,
    characteristicVelocityMS: Math.sign(terminal.relativeVelocityMS) * characteristicVelocityMagnitudeMS,
    characteristicVelocityMagnitudeMS,
    characteristicRe,
    floodHoldup: flood.x,
    floodTotalSuperficialVelocityMS: flood.value,
    swarmVelocityAtFloodMS: Math.sign(terminal.relativeVelocityMS) * swarmVelocityMagnitude(flood.x),
    swarmVelocityAtFloodMagnitudeMS: swarmVelocityMagnitude(flood.x),
    swarmRe,
    actualLoading: (continuous.flowM3S + dispersed.flowM3S) / (areaM2 * flood.value),
    designFloodFraction: DESIGN_FLOOD_FRACTION2,
    hydraulicPass: false,
    continuousSuperficialVelocityMS,
    dispersedSuperficialVelocityMS,
    countercurrentAtFlood: {
      holdup: flood.x,
      continuousVelocityMS,
      dispersedVelocityMS,
      relativeVelocityMS: signedRelativeVelocityMS,
      velocityEquation: "uC=+jC/(1-h), uD=-jD/h, w=uD-uC=-(jD/h+jC/(1-h))"
    },
    terminal,
    phaseProperties: { continuous, dispersed },
    applicability: {
      status: "CALCULATED_EXTRAPOLATED",
      codes: [...dragApplicability, ...shapeApplicability, ...closureApplicability],
      drag: dragApplicability,
      shape: shapeApplicability,
      closure: closureApplicability
    },
    status: "CALCULATED_EXTRAPOLATED"
  };
}

// server/ecr-pre-pilot/stage3-stage4-optimizer.ts
var ECR_STAGE3_STAGE4_OPTIMIZER_VERSION = "ECR_STAGE3_STAGE4_OPTIMIZER_V1.3.0";
var ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION = "ECR_STAGE3_STAGE4_OPTIMIZER_V1.4.0";
var ECR_STAGE3_STAGE4_OPTIMIZER_SMALLEST_VERSION = "ECR_STAGE3_STAGE4_OPTIMIZER_V1.2.0";
var ECR_STAGE3_STAGE4_OPTIMIZER_CONFIGURABLE_VERSION = "ECR_STAGE3_STAGE4_OPTIMIZER_V1.1.0";
var ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION = "ECR_STAGE3_STAGE4_OPTIMIZER_V1.0.0";
var LEGACY_OPTIMIZER_DESCRIPTOR = [
  ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION,
  "fixed-design-nt:7",
  "stage2-nt:reference-only",
  "grid:D|hc/D=.20,.25,.30|rotor/D=.33,.40,.50|free-area=.20,.30,.40|rpm=30..70",
  "accepted-basis:Np=1.2|existing-d32|larger-diameter-scale-up-disclosed",
  "candidate-forward-model:kuhni-phase1-primitives",
  "selection:fixed-geometry-useful-rpm-window-not-minimum-d-or-maximum-rpm",
  "root-search:bounded-finite-grid-bisection-all-brackets"
].join("|");
var ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_HASH = createHash7("sha256").update(LEGACY_OPTIMIZER_DESCRIPTOR).digest("hex");
var OPTIMIZER_DESCRIPTOR = [
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
  "fixed-design-nt:7",
  "stage2-nt:reference-only",
  "grid:D|hc/D=.20,.25,.30|rotor/D=.33,.40,.50|free-area=.20,.30,.40|rpm=30..70",
  "accepted-basis:Np=1.2|existing-d32|larger-diameter-scale-up-disclosed",
  "candidate-forward-model:kuhni-phase1-primitives",
  "selection:second-distinct-accepted-adequate-diameter-pre-pilot-margin-no-fallback",
  "useful-window-preference:fixed-server-owned-20-rpm-not-hydraulic-limit",
  "root-search:bounded-finite-grid-bisection-all-brackets"
].join("|");
var P1_REVIEW_OPTIMIZER_DESCRIPTOR = OPTIMIZER_DESCRIPTOR.replace(ECR_STAGE3_STAGE4_OPTIMIZER_VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION) + `|reverse:${RRBO_HYDRAULIC_METHOD}|C=.36,.42,.43|BP+SN|vs-to-slip|actual-lower-branch|loading=.70`;
var ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH = createHash7("sha256").update(P1_REVIEW_OPTIMIZER_DESCRIPTOR).digest("hex");
var ECR_STAGE3_STAGE4_OPTIMIZER_HASH = createHash7("sha256").update(OPTIMIZER_DESCRIPTOR).digest("hex");
var SMALLEST_OPTIMIZER_DESCRIPTOR = OPTIMIZER_DESCRIPTOR.replace(ECR_STAGE3_STAGE4_OPTIMIZER_VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_SMALLEST_VERSION).replace(
  "selection:second-distinct-accepted-adequate-diameter-pre-pilot-margin-no-fallback",
  "selection:useful-window-preference-then-smallest-adequate-diameter-then-wider-frontier"
);
var SMALLEST_OPTIMIZER_HASH = createHash7("sha256").update(SMALLEST_OPTIMIZER_DESCRIPTOR).digest("hex");
var CONFIGURABLE_OPTIMIZER_HASH = createHash7("sha256").update(SMALLEST_OPTIMIZER_DESCRIPTOR.replace(ECR_STAGE3_STAGE4_OPTIMIZER_SMALLEST_VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_CONFIGURABLE_VERSION).replace(
  "useful-window-preference:fixed-server-owned-20-rpm-not-hydraulic-limit",
  "useful-window-preference:configurable-ranking-preference-default-15-rpm-not-hydraulic-limit"
)).digest("hex");
function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function positive2(value) {
  return finite(value) && value > 0;
}
function trialFromRecord(record, diameterM, hcToColumn, rotorToColumn, freeArea, rpm) {
  const geometry = record.records?.[0]?.geometry;
  const reasonSet = [
    ...Array.isArray(record.blockers) ? record.blockers : [],
    ...Array.isArray(record.applicabilityDiagnostics) ? record.applicabilityDiagnostics : []
  ].map(String);
  const tipSpeedMS = Number(record.records?.[0]?.tipSpeedMS);
  const recordRow = record.records?.[0] ?? {};
  const d32M = finite(recordRow.d32M) ? recordRow.d32M : null;
  const holdup = finite(recordRow.phiD) ? recordRow.phiD : null;
  const interfacialAreaM2M3 = finite(recordRow.interfacialAreaM2M3) ? recordRow.interfacialAreaM2M3 : null;
  const physicalReasons = [];
  if (!positive2(diameterM) || !positive2(diameterM * hcToColumn)) physicalReasons.push("NON_POSITIVE_GEOMETRY");
  if (!(rotorToColumn > 0 && rotorToColumn < 1)) physicalReasons.push("ROTOR_NOT_BELOW_COLUMN");
  if (!positive2(tipSpeedMS) || tipSpeedMS > 4.5) physicalReasons.push("TIP_SPEED_LIMIT_EXCEEDED");
  if (!positive2(recordRow.powerW) || !positive2(recordRow.powerVolumeWM3) || !positive2(recordRow.psiWKg)) {
    physicalReasons.push("POWER_STATE_NOT_PHYSICAL");
  }
  if (!positive2(d32M)) physicalReasons.push("D32_NOT_CALCULABLE");
  if (!(finite(holdup) && holdup > 0 && holdup < 1)) physicalReasons.push("HOLdup_NOT_CALCULABLE");
  if (!positive2(interfacialAreaM2M3)) physicalReasons.push("INTERFACIAL_AREA_NOT_CALCULABLE");
  if (recordRow.status === "PRELIMINARY_DIAGNOSTIC_HOLD" && reasonSet.some((reason) => reason.includes("NOT_CALCULABLE"))) {
    physicalReasons.push("EQUATION_STATE_NOT_CALCULABLE");
  }
  const sourceOutOfRange = reasonSet.some((reason) => reason.startsWith("TABLE_1_OUT_OF_RANGE"));
  return {
    diameterM,
    hcToColumn,
    rotorToColumn,
    freeArea,
    compartmentHeightM: diameterM * hcToColumn,
    rotorDiameterM: diameterM * rotorToColumn,
    rpm,
    tipSpeedMS,
    powerW: Number(recordRow.powerW),
    powerVolumeWM3: Number(recordRow.powerVolumeWM3),
    psiWKg: Number(recordRow.psiWKg),
    d32M,
    holdup,
    interfacialAreaM2M3,
    actualLoading: null,
    designFloodFraction: null,
    signedForceBalanceResidualN: null,
    buoyancyDirection: null,
    hydraulicPass: null,
    rotorReynolds: Number(recordRow.rotorReynolds),
    status: physicalReasons.length ? "INFEASIBLE" : "FEASIBLE",
    validity: physicalReasons.length ? "PHYSICAL_INVALID" : sourceOutOfRange ? "SCALE_UP_EXTRAPOLATION" : "IN_RANGE",
    reasons: physicalReasons,
    sourceDiagnostics: reasonSet
  };
}
function reverseTrialFromRecord(record, diameterM, hcToColumn, rotorToColumn, freeArea, rpm) {
  const physicalReasons = [];
  if (!(record.tipSpeedMS > 0) || record.tipSpeedMS > 4.5) {
    physicalReasons.push("TIP_SPEED_LIMIT_EXCEEDED");
  }
  if (!(record.d32M > 0 && Number.isFinite(record.d32M))) {
    physicalReasons.push("D32_NOT_CALCULABLE");
  }
  if (!(record.floodHoldup > 0 && record.floodHoldup < 1)) {
    physicalReasons.push("SIGNED_REVERSE_HOLDUP_NOT_CALCULABLE");
  }
  if (!(record.actualLoading > 0 && Number.isFinite(record.actualLoading))) {
    physicalReasons.push("SIGNED_REVERSE_LOADING_NOT_CALCULABLE");
  } else if (record.actualLoading > record.designFloodFraction) {
    physicalReasons.push("ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION");
  }
  if (!(record.powerW > 0 && record.powerVolumeWM3 > 0 && record.psiWKg > 0)) {
    physicalReasons.push("POWER_STATE_NOT_PHYSICAL");
  }
  if (!Number.isFinite(record.terminal.forceBalanceResidualN) || Math.abs(record.terminal.forceBalanceResidualN) > 1e-8) {
    physicalReasons.push("SIGNED_FORCE_BALANCE_RESIDUAL_NOT_CLOSED");
  }
  return {
    diameterM,
    hcToColumn,
    rotorToColumn,
    freeArea,
    compartmentHeightM: record.compartmentHeightM,
    rotorDiameterM: record.rotorDiameterM,
    rpm,
    tipSpeedMS: record.tipSpeedMS,
    powerW: record.powerW,
    powerVolumeWM3: record.powerVolumeWM3,
    psiWKg: record.psiWKg,
    d32M: record.d32M,
    holdup: record.floodHoldup,
    interfacialAreaM2M3: record.d32M > 0 ? 6 * record.floodHoldup / record.d32M : null,
    actualLoading: record.actualLoading,
    designFloodFraction: record.designFloodFraction,
    signedForceBalanceResidualN: record.terminal.forceBalanceResidualN,
    buoyancyDirection: record.terminal.buoyancyDirection,
    // V1.4 deliberately marks reverse trials diagnostic-only. The optimizer
    // derives its bounded pre-pilot admission independently from the signed
    // force closure, finite physical state, tip-speed ceiling and the
    // established 70% design-flood cap.
    hydraulicPass: physicalReasons.length === 0,
    rotorReynolds: record.rotorReynolds,
    status: physicalReasons.length ? "INFEASIBLE" : "FEASIBLE",
    validity: physicalReasons.length ? "PHYSICAL_INVALID" : "SCALE_UP_EXTRAPOLATION",
    reasons: physicalReasons,
    sourceDiagnostics: [
      "REVERSE_ORIENTATION_SIGNED_FORCE_BALANCE_DIAGNOSTIC_ONLY",
      ...record.applicability?.codes ?? []
    ]
  };
}
function evaluateTrial(basis, diameterM, hcToColumn, rotorToColumn, freeArea, rpm, correctedReverse = false) {
  try {
    if (basis.phaseConfiguration === "rrbo-continuous-nmp-dispersed") {
      if (correctedReverse) {
        const model = evaluateRrboHydraulicTrial(diameterM, rpm, basis, {
          rotorToColumn,
          compartmentToColumn: hcToColumn,
          statorFreeArea: freeArea
        });
        const s = model.governing;
        return {
          diameterM,
          hcToColumn,
          rotorToColumn,
          freeArea,
          rpm,
          compartmentHeightM: model.compartmentHeightM,
          rotorDiameterM: model.rotorDiameterM,
          tipSpeedMS: model.tipSpeedMS,
          powerW: model.powerW,
          powerVolumeWM3: model.powerVolumeWM3,
          psiWKg: model.epsilonWKg,
          d32M: s.d32M,
          holdup: s.operatingHoldup,
          interfacialAreaM2M3: s.interfacialAreaM2M3,
          floodHoldup: s.floodHoldup,
          hydraulicMethod: model,
          actualLoading: s.loading,
          designFloodFraction: 0.7,
          signedForceBalanceResidualN: s.forceBalanceResidualN,
          buoyancyDirection: "DISPERSED_DOWNWARD",
          hydraulicPass: model.screeningPass,
          rotorReynolds: model.rotorReynolds,
          status: model.screeningPass ? "FEASIBLE" : "INFEASIBLE",
          validity: model.screeningPass ? "SCALE_UP_EXTRAPOLATION" : "PHYSICAL_INVALID",
          reasons: model.screeningPass ? [] : [
            ...model.scenarios.some((row) => row.operatingHoldup === null) ? ["NO_DILUTE_CONNECTED_ROOT"] : [],
            ...s.loading > 0.7 ? ["ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION"] : [],
            ...model.tipSpeedMS > 4.5 ? ["TIP_SPEED_LIMIT_EXCEEDED"] : []
          ],
          sourceDiagnostics: [
            "PREPILOT_EXTRAPOLATED_METHOD",
            "INVERSION_ENTRAINMENT_UNKNOWN",
            "TURBULENCE_SHAPE_DRAG_RANGE_UNQUALIFIED",
            model.capacityMeaning
          ]
        };
      }
      const reverse = evaluateKuhniReverseTrial(
        diameterM,
        rpm,
        basis,
        {
          rotorToColumn,
          compartmentToColumn: hcToColumn,
          statorFreeArea: freeArea,
          powerNumber: 1.2,
          directTurbulenceC: 0.42
        }
      );
      return reverseTrialFromRecord(
        reverse,
        diameterM,
        hcToColumn,
        rotorToColumn,
        freeArea,
        rpm
      );
    }
    const result = evaluateKuhniHydrodynamics({
      columnDiameterM: diameterM,
      rotorDiameterM: diameterM * rotorToColumn,
      rotorToColumnRatio: rotorToColumn,
      compartmentHeightM: diameterM * hcToColumn,
      statorFreeAreaFraction: freeArea,
      rotorSpeedRpmMin: rpm,
      rotorSpeedRpmMax: rpm,
      rotorSpeedRpmStep: 1,
      powerNumber: 1.2,
      directTurbulenceC: 0.42,
      allowApplicabilityExtrapolation: true
    }, basis);
    const candidate = trialFromRecord(result, diameterM, hcToColumn, rotorToColumn, freeArea, rpm);
    const hydraulicTrial = evaluateKuhniHydraulicTrial(
      diameterM,
      rpm,
      basis,
      {
        rotorToColumn,
        compartmentToColumn: hcToColumn,
        statorFreeArea: freeArea,
        powerNumber: 1.2,
        directTurbulenceC: 0.42
      }
    );
    candidate.actualLoading = hydraulicTrial.actualLoading;
    candidate.designFloodFraction = hydraulicTrial.designFloodFraction;
    candidate.sourceDiagnostics = [
      ...candidate.sourceDiagnostics,
      ...hydraulicTrial.applicability ?? []
    ];
    if (!hydraulicTrial.hydraulicPass) {
      candidate.reasons.push("ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION");
    }
    candidate.hydraulicPass = hydraulicTrial.hydraulicPass && candidate.reasons.length === 0;
    if (!candidate.hydraulicPass) {
      candidate.status = "INFEASIBLE";
      candidate.validity = "PHYSICAL_INVALID";
    }
    return candidate;
  } catch (error) {
    return {
      diameterM,
      hcToColumn,
      rotorToColumn,
      freeArea,
      compartmentHeightM: diameterM * hcToColumn,
      rotorDiameterM: diameterM * rotorToColumn,
      rpm,
      tipSpeedMS: Number.NaN,
      powerW: Number.NaN,
      powerVolumeWM3: Number.NaN,
      psiWKg: Number.NaN,
      d32M: null,
      holdup: null,
      interfacialAreaM2M3: null,
      actualLoading: null,
      designFloodFraction: null,
      signedForceBalanceResidualN: null,
      buoyancyDirection: null,
      hydraulicPass: null,
      rotorReynolds: Number.NaN,
      status: "INFEASIBLE",
      validity: "PHYSICAL_INVALID",
      reasons: [error instanceof Error ? error.message : "TRIAL_EVALUATION_FAILED"],
      sourceDiagnostics: []
    };
  }
}
function evaluateP1ReviewTrial(basis, diameterM, hcToColumn, rotorToColumn, freeArea, rpm) {
  return evaluateTrial(basis, diameterM, hcToColumn, rotorToColumn, freeArea, rpm, true);
}

// server/ecr-pre-pilot/automatic-hydraulic-selection.ts
var AUTOMATIC_SELECTION_VERSION = "P1_AREA_LOADING_GLOBAL_CHORD_V1";
var KNEE_TIE_EPSILON = 32 * Number.EPSILON;
var policy = {
  version: AUTOMATIC_SELECTION_VERSION,
  representative: "MINIMUM_WORST_SIX_SCENARIO_LOADING_THEN_RPM_HC_ROTOR_FREE",
  curve: "SIZE_NONDOMINATED_CROSS_SECTION_AREA_VS_WORST_LOADING",
  score: "NORMALIZED_LOADING_REDUCTION_MINUS_NORMALIZED_AREA",
  fallback: "SMALLEST_ELIGIBLE_IF_NO_POSITIVE_INTERIOR_DEPARTURE",
  tieEpsilon: KNEE_TIE_EPSILON,
  acceptance: "SIX_LOWER_CONNECTED_ROOTS_LOADING_LE_0.70_TIP_LE_4.5"
};
var AUTOMATIC_SELECTION_HASH = kuhniRunHash(policy);
var positive3 = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
var identities = [0.36, 0.42, 0.43].flatMap((c) => ["BARRY_PARLANGE_MOBILE", "SCHILLER_NAUMANN_IMMOBILE"].map((i) => `${c}:${i}`));
function resolveAutomaticHydraulicSelection(run, currentHash) {
  const r = run?.result;
  if (run?.status !== "completed" || run.sourceSnapshotHash !== currentHash || run.basis?.stage1SnapshotHash !== currentHash || r?.stage1Authority?.snapshotHash !== currentHash || r?.processBasis?.stage1SnapshotHash !== currentHash || kuhniRunHash(r?.processBasis) !== kuhniRunHash(run?.basis) || run.basis?.phaseConfiguration !== run.phaseConfiguration || run.basis?.operatingTemperatureC !== 40 || run.phaseConfiguration !== "rrbo-continuous-nmp-dispersed" || r?.engine?.version !== ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION || r?.engine?.implementationHash !== ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH) {
    throw new Error("AUTOMATIC_SELECTION_CURRENT_P1_SOURCE_REQUIRED");
  }
  const { calculationHash, ...payload } = r;
  if (kuhniRunHash(payload) !== calculationHash) throw new Error("AUTOMATIC_SELECTION_SOURCE_INTEGRITY_FAILURE");
  const points = [];
  let rejected = 0;
  const grid = r.orientationComparison?.find((o) => o.orientation === run.phaseConfiguration)?.geometryGrid ?? [];
  for (const group of grid) for (const t of group.trials ?? []) {
    const g2 = group.geometry;
    const s = t.hydraulicMethod?.scenarios;
    const matches = g2 && t.diameterM === g2.columnDiameterM && t.compartmentHeightM === g2.compartmentHeightM && t.rotorDiameterM === g2.rotorDiameterM && t.freeArea === g2.freeArea && t.hcToColumn === g2.hcToColumn && t.rotorToColumn === g2.rotorToColumn && g2.compartmentHeightM === g2.columnDiameterM * g2.hcToColumn && g2.rotorDiameterM === g2.columnDiameterM * g2.rotorToColumn;
    const valid = matches && t.status === "FEASIBLE" && t.validity !== "PHYSICAL_INVALID" && [t.diameterM, t.compartmentHeightM, t.rotorDiameterM, t.freeArea, t.rpm, t.tipSpeedMS].every(positive3) && t.tipSpeedMS <= 4.5 && t.hydraulicMethod?.methodId === RRBO_HYDRAULIC_METHOD && Array.isArray(s) && s.length === 6 && new Set(s.map((v) => `${v.coefficient}:${v.interfaceScenario}`)).size === 6 && s.every((v) => identities.includes(`${v.coefficient}:${v.interfaceScenario}`) && [
      v.loading,
      v.d32M,
      v.operatingHoldup,
      v.floodHoldup,
      v.capacityMS,
      v.interfacialAreaM2M3,
      v.terminalSpeedMS,
      v.characteristicSpeedMS
    ].every(positive3) && [v.forceBalanceResidualN, v.operatingBalanceResidualMS].every((x) => typeof x === "number" && Number.isFinite(x)) && v.loading <= 0.7 && v.operatingHoldup < v.floodHoldup && v.floodHoldup < 1 && v.branchStatus === "LOWER_QUASI_STEADY_ADMISSIBLE" && Array.isArray(v.operatingRoots) && v.operatingRoots.length > 0 && v.operatingRoots.every(positive3) && v.operatingHoldup === Math.min(...v.operatingRoots) && v.continuation?.length === 16 && v.continuation.every((p, i) => p.flowFraction === (i + 1) / 16 && positive3(p.holdup) && p.holdup < v.floodHoldup && (i === 0 || p.holdup >= v.continuation[i - 1].holdup)) && v.continuation[15].holdup === v.operatingHoldup);
    if (!valid) {
      rejected++;
      continue;
    }
    points.push({
      geometry: g2,
      trial: t,
      loading: Math.max(...s.map((v) => v.loading)),
      areaM2: Math.PI * t.diameterM ** 2 / 4,
      minimumInterfacialAreaM2M3: Math.min(...s.map((v) => v.interfacialAreaM2M3)),
      minimumHoldupGap: Math.min(...s.map((v) => v.floodHoldup - v.operatingHoldup))
    });
  }
  const compare = (a, b) => a.loading - b.loading || a.trial.rpm - b.trial.rpm || a.geometry.compartmentHeightM - b.geometry.compartmentHeightM || a.geometry.rotorDiameterM - b.geometry.rotorDiameterM || a.geometry.freeArea - b.geometry.freeArea;
  const ds = [...new Set(points.map((p) => p.geometry.columnDiameterM))].sort((a, b) => a - b);
  const refs = ds.map((d) => {
    const atD = points.filter((p) => p.geometry.columnDiameterM === d).sort(compare);
    return {
      ...atD[0],
      feasibleConfigurationCount: atD.length,
      dominated: false,
      areaIncreasePercent: null,
      loadingImprovementPercent: null,
      elasticity: null,
      normalizedScore: null
    };
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
  const curve = refs.filter((p) => !p.dominated);
  let selected = refs[0] ?? null;
  let status = selected ? "SMALLEST_FEASIBLE_NO_RESOLVED_KNEE" : "NO_ELIGIBLE_HYDRAULIC_CONFIGURATION";
  if (curve.length >= 3) {
    const first = curve[0], last = curve[curve.length - 1];
    if (last.areaM2 > first.areaM2 && first.loading > last.loading) {
      curve.forEach((p) => {
        p.normalizedScore = (first.loading - p.loading) / (first.loading - last.loading) - (p.areaM2 - first.areaM2) / (last.areaM2 - first.areaM2);
      });
      const maximum = Math.max(...curve.slice(1, -1).map((p) => p.normalizedScore));
      if (maximum > KNEE_TIE_EPSILON) {
        selected = curve.slice(1, -1).find((p) => maximum - p.normalizedScore <= KNEE_TIE_EPSILON);
        status = "AUTOMATIC_DISCRETE_KNEE_SELECTED";
      }
    }
  }
  const result = {
    policy,
    policyHash: AUTOMATIC_SELECTION_HASH,
    status,
    selected,
    references: refs,
    qualification: "PRELIMINARY_EXTRAPOLATED_HYDRAULIC_SCREENING_NOT_MODEL_GOVERNANCE",
    source: {
      candidateId: run.id,
      candidateImmutableHash: run.immutableHash,
      calculationHash,
      currentStage1Hash: currentHash,
      method: r.engine
    },
    configuredSearch: r.candidateGrid,
    feasibleConfigurationCount: points.length,
    rejectedTrialCount: rejected,
    eligibleDiameterBoundsM: refs.length ? [refs[0].geometry.columnDiameterM, refs[refs.length - 1].geometry.columnDiameterM] : null,
    kneeAtEligibleBoundary: selected ? selected === refs[0] || selected === refs[refs.length - 1] : null,
    qualificationUnknowns: [
      "INTERFACE_MOBILITY",
      "INVERSION",
      "ENTRAINMENT",
      "DISENGAGEMENT",
      "TURBULENCE",
      "SCHILLER_NAUMANN_RANGE",
      "SPHERICAL_DROP_QUALIFICATION",
      "DYNAMIC_STABILITY"
    ],
    sensitivity: "SEARCH_ENVELOPE_AND_GRID_DEPENDENT_NOT_SCIENTIFIC_CONFIDENCE",
    rationale: "Maximum discrete global chord departure, not proof of convexity or a unique physical optimum. Each diameter uses minimum worst-six-scenario loading, not independently optimized drop size or area. No RPM-window criterion. No resolved knee uses smallest eligible diameter."
  };
  return { ...result, immutableHash: kuhniRunHash(result) };
}

// server/research/ecr-pre-pilot-pa-anchor/evidence.ts
var ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE = {
  recordVersion: "1.2.0",
  reviewedAt: "2026-08-29",
  admission: "IDENTITY_ADMITTED_THERMODYNAMICS_BLOCKED",
  calibrationStatus: "CALIBRATION_REQUIRED",
  representativePurpose: "POLAR_AROMATICS_NMP_PARTITIONING_ONLY",
  sulfurRelationship: "INDEPENDENT_NOT_A_SULFUR_SURROGATE",
  identity: {
    commonName: "4,4'-Bis(alpha,alpha-dimethylbenzyl)diphenylamine",
    systematicName: "4-(2-phenylpropan-2-yl)-N-[4-(2-phenylpropan-2-yl)phenyl]aniline",
    aliases: [
      "4,4'-Bis(1,1-dimethylbenzyl)diphenylamine",
      "Bis(p-cumylphenyl)amine",
      "Naugard 445",
      "Antioxidant 445"
    ],
    cas: "10081-67-1",
    pubchemCid: 82343,
    formula: "C30H31N",
    molecularWeightGmol: 405.58,
    canonicalSmiles: "CC(C)(C1=CC=CC=C1)C2=CC=C(C=C2)NC3=CC=C(C=C3)C(C)(C)C4=CC=CC=C4",
    inchi: "InChI=1S/C30H31N/c1-29(2,23-11-7-5-8-12-23)25-15-19-27(20-16-25)31-28-21-17-26(18-22-28)30(3,4)24-13-9-6-10-14-24/h5-22,31H,1-4H3",
    inchiKey: "UJAWGGOCYUPCPS-UHFFFAOYSA-N",
    containsSulfur: false
  },
  rationale: {
    class: "Exact alkylated-diphenylamine molecular anchor",
    useBasis: "Commercially identified antioxidant/stabilizer associated with alkylated-diphenylamine chemistry.",
    limitation: "One exact antioxidant molecule does not characterize the full physical RRBO polar-aromatics distribution."
  },
  sources: [
    {
      authority: "NCBI PubChem",
      role: "IDENTITY_AND_STRUCTURE",
      url: "https://pubchem.ncbi.nlm.nih.gov/compound/82343",
      machineReadableUrl: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/82343/property/IUPACName,MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES,InChI,InChIKey/JSON"
    },
    {
      authority: "NCBI PubChem",
      role: "CAS_AND_SYNONYM_ASSOCIATION",
      url: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/82343/synonyms/JSON"
    },
    {
      authority: "US EPA Chemical Data Reporting via PubChem",
      role: "ANTIOXIDANT_STABILIZER_USE_CLASSIFICATION",
      url: "https://pubchem.ncbi.nlm.nih.gov/compound/82343"
    }
  ],
  thermodynamicClosure: {
    status: "BLOCKED",
    primaryBlocker: "POLAR_AROMATICS_THERMODYNAMIC_CLOSURE_UNAVAILABLE",
    routeApplicability: {
      frozenFiveComponentUniquacNrtl: {
        status: "BLOCKED",
        executionAllowed: false,
        reason: "PA is absent from the five-component state vector and has no admitted directed interaction set."
      },
      sixComponentCosmoSac2010: {
        status: "RESEARCH_DIAGNOSTIC_ALLOWED_NOT_QUALIFIED",
        executionAllowed: true,
        profileEvaluation: "PASSED",
        lleQualification: "FAILED_OR_PENDING",
        releaseEligible: false,
        reason: "The exact PA sigma profile and six-component activity evaluation are valid; LLE reproduction, multistart, closure, and TPD acceptance remain independent fail-closed gates."
      }
    },
    assessment: {
      decision: "NO_PARAMETER_ADMISSION",
      independentlyCheckableRoute: "EVIDENCE_INVENTORY_AND_PREDECLARED_GATE_REVIEW",
      evidenceBasis: [
        "EXACT_IDENTITY_AND_STRUCTURE_RECORD",
        "FROZEN_MOLECULAR_PAIR_UNIQUAC_PARAMETER_INVENTORY",
        "PUBLISHED_MODIFIED_UNIFAC_DORTMUND_GROUP_AND_INTERACTION_INVENTORY",
        "VENDORED_COSMO_PROFILE_INVENTORY",
        "DIRECT_LLE_EVIDENCE_REGISTRY"
      ],
      requiredGateResults: {
        exactMolecularRepresentation: "PASS_PROFILE_BASIS_ONLY",
        completeDirectedInteractions: "FAIL",
        matchingTwoPhaseEquilibriumEvidence: "FAIL",
        stage1TemperatureCoverage: "FAIL",
        independentHoldoutReproduction: "NOT_TESTABLE",
        phaseTopologyReproduction: "NOT_TESTABLE"
      },
      conclusion: "Molecular-pair UNIQUAC and Dortmund routes remain blocked. Exact-profile six-component COSMO-SAC activity evaluation is admitted for research diagnostics only; matching LLE qualification remains failed or pending."
    },
    missing: [
      "COMPLETE_PA_GROUP_DECOMPOSITION_AND_DIRECTED_INTERACTION_SET",
      "DIRECT_MATCHING_PA_NMP_HEAVY_HYDROCARBON_LLE"
    ],
    routesReviewed: {
      frozenMolecularPairUniquac: "BLOCKED_NO_PA_DIRECTED_PAIR_PARAMETERS",
      modifiedUnifacDortmund: "BLOCKED_NO_REVIEWED_AROMATIC_SECONDARY_AMINE_GROUP_AND_PAIR_CLOSURE",
      cosmoSac2010: "PROFILE_BASIS_QUALIFIED_TOPOLOGY_AND_LLE_GATES_PENDING",
      openCosmoRs: "BLOCKED_EXACT_PROFILE_ABSENT_AND_CANDIDATE_REJECTED_ON_PHASE_TOPOLOGY"
    },
    prohibitedSubstitutions: [
      "UNSUBSTITUTED_DIPHENYLAMINE_PROFILE",
      "DI_OR_POLY_INTERACTION_BORROWING",
      "ZERO_FILLED_INTERACTIONS",
      "SULFUR_BEARING_REPRESENTATIVE"
    ]
  },
  applicability: {
    requestedTemperatureC: { minimum: 25, maximum: 100 },
    admittedTemperatureC: null,
    composition: null,
    solventOilMassRatio: null,
    pressure: null,
    phaseRegion: null,
    reason: "No PA thermodynamic calculation is admitted, so no operating domain is claimed."
  },
  outputPolicy: {
    predictiveNtWithPositivePaFeed: "NOT_CALCULABLE",
    fiveComponentPredictiveNtWithPositivePaFeed: "NOT_CALCULABLE",
    sixComponentCosmoSacDiagnosticWithPositivePaFeed: "ALLOWED_SUBJECT_TO_OWN_ACCEPTANCE_GATES",
    sixComponentCosmoSacQualifiedResultWithPositivePaFeed: "NOT_CALCULABLE_UNTIL_LLE_QUALIFIED",
    fullBasisRrboRecoveryWithPositivePaFeed: "NOT_CALCULABLE",
    sulfurRemoval: "NOT_CALCULABLE",
    fiveComponentZeroPaDiagnostic: "UNCHANGED",
    releaseEligible: false
  }
};

// server/ecr-pre-pilot/six-component-cosmo-sac-basis.ts
import { createHash as createHash8 } from "node:crypto";
var SIX_COMPONENT_COSMO_SAC_ORDER = [
  "SAT",
  "MONO",
  "DI",
  "POLY",
  "PA",
  "NMP"
];
var PROFILE_ROOT = "server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles/sigma3";
var mutableBasis = {
  schemaVersion: "ECR_PRE_PILOT_SIX_COMPONENT_COSMO_SAC_BASIS_V1",
  model: "COSMO-SAC-2010",
  componentOrder: SIX_COMPONENT_COSMO_SAC_ORDER,
  components: [
    ["SAT", "n-dodecane", "112-40-3", "SNRUBQQJIBEYMU-UHFFFAOYSA-N", "6f51a75fbfa70df9b410fae88614e5c27d003eea228bc91318edb2854b5c26c2"],
    ["MONO", "n-propylbenzene", "103-65-1", "ODLMAHJVESYWTB-UHFFFAOYSA-N", "0afc9a2a69c0f3c7827ecdd7553f7ebf1a6e35f8b64597ffc8a6b780c324c275"],
    ["DI", "1-methylnaphthalene", "90-12-0", "QPUYECUOLPXSFR-UHFFFAOYSA-N", "7e8664f594afa70a232f845dfafbfbb1efd2e10e13c586187b556102a97503ed"],
    ["POLY", "pyrene", "129-00-0", "BBEAQIROQSPTKN-UHFFFAOYSA-N", "682828484416f124e3207f246d23954197502cba83d9b4744ace239d91fe8854"],
    ["PA", "4,4'-Bis(alpha,alpha-dimethylbenzyl)diphenylamine", "10081-67-1", "UJAWGGOCYUPCPS-UHFFFAOYSA-N", "474736e63fd99749f7dad0cd5569959e9dd47a8a2dfe55b6ef80642ed3d1c03e"],
    ["NMP", "N-methyl-2-pyrrolidone", "872-50-4", "SECXISVLQFMRJM-UHFFFAOYSA-N", "58dcecc755994f7955aec100dfb26de62c3ad933dcfd25c11f68ddec3b1efa69"]
  ].map(([family, name, cas, inchiKey, profileSha256]) => ({
    family,
    name,
    cas,
    inchiKey,
    profile: {
      available: true,
      format: "NIST_DELWARE_SIGMA3",
      path: `${PROFILE_ROOT}/${inchiKey}.sigma`,
      sha256: profileSha256
    }
  })),
  provenance: {
    generationManifestSha256: "65baa44c36ffae817e52f60a32591f3fc1be7c140517c8b37c95458c834d1fa9",
    generationProtocolSha256: "4a9cd2dbb5da63fbd30f18234763b09e05819256511d639c01958b86ca2ab216",
    complistSha256: "365a84301ee4ab5aa1a9811851468672aea736760239c63de7ad087b3ac633f1",
    profileVerificationSha256: "d07ea132252d1a56549629c630b658dcc4d9538e44ca6767f6b9b1fbdb15a0e9",
    nistCosmoSacSourceCommit: "1b82456be38026719b16cad4076109bef3fcb309"
  },
  qualification: {
    profileSemanticsGate: "PASSED",
    researchOnly: true,
    calibrationRequired: true,
    pilotValidated: false,
    releaseEligible: false
  }
};
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) {
  return createHash8("sha256").update(canonicalJson(value)).digest("hex");
}
function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}
var SIX_COMPONENT_COSMO_SAC_BASIS = deepFreeze(mutableBasis);
var SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256 = "7683442c0419659d83320cfa4433fe8cf298f285f596c4676cf39bb5042838fc";
if (sha256(SIX_COMPONENT_COSMO_SAC_BASIS) !== SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256) {
  throw new Error("SIX_COMPONENT_COSMO_SAC_CANONICAL_BASIS_CHANGED");
}
var CANONICAL_BY_FAMILY = new Map(
  SIX_COMPONENT_COSMO_SAC_BASIS.components.map((component) => [component.family, component])
);

// server/ecr-pre-pilot/stage1.ts
var PREDICTIVE_NT_MOLECULAR_REGISTRY = {
  saturates: [
    { identity: "n-dodecane", label: "n-Dodecane", molecularWeightGmol: 170.34 },
    { identity: "n-tetradecane", label: "n-Tetradecane", molecularWeightGmol: 198.39 },
    { identity: "n-hexadecane", label: "n-Hexadecane", molecularWeightGmol: 226.44 },
    { identity: "n-heptadecane", label: "n-Heptadecane", molecularWeightGmol: 240.47 }
  ],
  monoAromatics: [
    { identity: "n-propylbenzene", label: "n-Propylbenzene", molecularWeightGmol: 120.19 },
    { identity: "n-pentylbenzene", label: "n-Pentylbenzene", molecularWeightGmol: 148.25 },
    { identity: "sec-butylbenzene", label: "sec-Butylbenzene", molecularWeightGmol: 134.22 },
    { identity: "1,3,5-trimethylbenzene", label: "1,3,5-Trimethylbenzene", molecularWeightGmol: 120.19 },
    { identity: "p-xylene", label: "p-Xylene", molecularWeightGmol: 106.17 },
    { identity: "toluene", label: "Toluene", molecularWeightGmol: 92.14 }
  ],
  diAromatics: {
    identity: "1-methylnaphthalene",
    label: "1-Methylnaphthalene",
    molecularWeightGmol: 142.1971,
    admission: "FIXED_GOVERNED_SURROGATE",
    provenance: "NIST Chemistry WebBook molecular weight; frozen descriptor-transfer registry",
    applicability: "Predictive five-component surrogate screening only"
  },
  polyAromatics: {
    identity: "pyrene",
    label: "Pyrene",
    molecularWeightGmol: 202.2506,
    admission: "FIXED_GOVERNED_SURROGATE",
    provenance: "NIST Chemistry WebBook molecular weight; frozen descriptor-transfer registry",
    applicability: "Predictive five-component surrogate screening only"
  },
  nmp: {
    identity: "N-methyl-2-pyrrolidone",
    label: "N-Methyl-2-pyrrolidone",
    molecularWeightGmol: 99.1311
  },
  water: {
    identity: "water",
    label: "Water",
    molecularWeightGmol: 18.01528
  },
  polarAromatics: {
    admission: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.admission,
    representative: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.identity,
    molecularWeightGmol: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.identity.molecularWeightGmol,
    representativePurpose: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.representativePurpose,
    sulfurRelationship: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.sulfurRelationship,
    parameters: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.thermodynamicClosure,
    lleEvidence: null,
    applicability: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.applicability,
    blocker: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.thermodynamicClosure.primaryBlocker
  }
};
function makeStage1HydrodynamicProcessBasis(snapshot) {
  const s = snapshot.stage1;
  const requiredPhysicalValues = [
    s.operatingTemperatureC,
    s.temperatureK,
    s.designFeedRateLph,
    s.rrboDensityKgM3,
    s.rrboDynamicViscosityCp,
    s.nmpDensityKgM3,
    s.nmpDynamicViscosityCp,
    s.rrboInterfacialTensionMnM,
    s.solventOilRatio
  ];
  if (!requiredPhysicalValues.every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("STAGE1_HYDRODYNAMIC_PROCESS_BASIS_INCOMPLETE");
  }
  const rrboFlowM3S = s.designFeedRateLph * 1e-3 / 3600;
  const wetSolventFlowM3S = rrboFlowM3S * s.rrboDensityKgM3 * s.solventOilRatio / s.nmpDensityKgM3;
  return {
    schemaVersion: "ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1",
    stage1SnapshotHash: snapshot.immutableHash,
    operatingTemperatureC: s.operatingTemperatureC,
    temperatureK: s.temperatureK,
    operatingPressure: s.operatingPressure,
    phaseConfiguration: s.phaseConfiguration,
    composition: {
      rrboGrade: s.rrboGrade,
      rrboFeedWt: {
        saturates: s.saturatesWt,
        monoAromatics: s.monoAromaticsWt,
        diAromatics: s.diAromaticsWt,
        polyAromatics: s.polyAromaticsWt,
        polarAromatics: s.polarAromaticsWt,
        nmp: s.nmpInFeedWt
      },
      wetSolventWt: { nmp: s.nmpPurityWt, water: s.nmpWaterWt }
    },
    rrboFeed: {
      identity: "RRBO_FEED",
      valueLph: s.designFeedRateLph,
      conversion: "L/h * 1e-3 m3/L / 3600 s/h",
      flowM3S: rrboFlowM3S,
      densityKgM3: s.rrboDensityKgM3,
      dynamicViscosityPaS: s.rrboDynamicViscosityCp * 1e-3
    },
    wetSolventPhase: {
      identity: "WET_NMP_SOLVENT_PHASE",
      solventOilMassRatio: s.solventOilRatio,
      conversion: "(RRBO m3/s * RRBO kg/m3 * S/O) / wet-solvent kg/m3",
      flowM3S: wetSolventFlowM3S,
      densityKgM3: s.nmpDensityKgM3,
      dynamicViscosityPaS: s.nmpDynamicViscosityCp * 1e-3
    },
    interfacialTensionNM: s.rrboInterfacialTensionMnM * 1e-3
  };
}
var FEED_RATES = new Set(Array.from({ length: 15 }, (_, index) => (index + 1) * 1e3));
var TEMPERATURES = /* @__PURE__ */ new Set([25, 30, ...Array.from({ length: 7 }, (_, index) => (index + 4) * 10)]);
var AROMATICS_TARGETS = new Set(Array.from({ length: 17 }, (_, index) => 2 + index * 0.5));
var RECOVERY_TARGETS = new Set(Array.from({ length: 11 }, (_, index) => 80 + index));
var NMP_TARGETS = new Set(Array.from({ length: 39 }, (_, index) => 1 + index * 0.5));
var SAT_IDENTITIES = new Set(PREDICTIVE_NT_MOLECULAR_REGISTRY.saturates.map(({ identity }) => identity));
var MONO_IDENTITIES = new Set(PREDICTIVE_NT_MOLECULAR_REGISTRY.monoAromatics.map(({ identity }) => identity));
var MAXIMUM_STAGE_OPTIONS = new Set(Array.from({ length: 10 }, (_, index) => index + 1));
export {
  AUTOMATIC_SELECTION_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION,
  dragCoefficient,
  evaluateP1ReviewTrial,
  evaluateRrboHydraulicTrial,
  kuhniRunHash,
  makeStage1HydrodynamicProcessBasis,
  resolveAutomaticHydraulicSelection,
  swarmSpeeds
};
