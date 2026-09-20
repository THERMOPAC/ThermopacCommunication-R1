import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../server/db';

const DESIGN_ID = 269;
const G = 9.80665;
const OUT_DIR = resolve('deliverables/disengagement-assessment');

type Json = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: unknown, name: string): number {
  const n = Number(value);
  assert(Number.isFinite(n), `${name} is not finite`);
  return n;
}

function sphereVelocitySchillerNaumann(
  diameterM: number,
  carrierDensityKgM3: number,
  particleDensityKgM3: number,
  carrierViscosityPaS: number,
) {
  const deltaRho = Math.abs(particleDensityKgM3 - carrierDensityKgM3);
  let velocityMS = deltaRho * G * diameterM ** 2 / (18 * carrierViscosityPaS);
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const re = carrierDensityKgM3 * velocityMS * diameterM / carrierViscosityPaS;
    const cd = re > 0 ? 24 / re * (1 + 0.15 * re ** 0.687) : Infinity;
    const next = Math.sqrt(4 * deltaRho * G * diameterM / (3 * carrierDensityKgM3 * cd));
    if (Math.abs(next - velocityMS) <= 1e-12 * Math.max(1, next)) {
      velocityMS = next;
      break;
    }
    velocityMS = 0.5 * (velocityMS + next);
  }
  const reynolds = carrierDensityKgM3 * velocityMS * diameterM / carrierViscosityPaS;
  const dragCoefficient = 24 / reynolds * (1 + 0.15 * reynolds ** 0.687);
  const forceBalanceResidual = Math.abs(
    velocityMS ** 2 - 4 * deltaRho * G * diameterM
      / (3 * carrierDensityKgM3 * dragCoefficient),
  );
  return { velocityMS, reynolds, dragCoefficient, forceBalanceResidual };
}

function criticalDiameter(
  targetVelocityMS: number,
  carrierDensityKgM3: number,
  particleDensityKgM3: number,
  carrierViscosityPaS: number,
) {
  let low = 1e-9;
  let high = 0.1;
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const mid = (low + high) / 2;
    if (sphereVelocitySchillerNaumann(
      mid, carrierDensityKgM3, particleDensityKgM3, carrierViscosityPaS,
    ).velocityMS < targetVelocityMS) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function phaseAssessment(
  name: string,
  outletMassKgH: number,
  assumedOutletDensityKgM3: number,
  carrierDensityKgM3: number,
  entrainedDensityKgM3: number,
  carrierViscosityPaS: number,
  areaM2: number,
  grossVolumeM3: number,
  assumedTravelHeightM: number,
) {
  const flowM3H = outletMassKgH / assumedOutletDensityKgM3;
  const opposingVelocityMS = flowM3H / 3600 / areaM2;
  const deltaRho = Math.abs(entrainedDensityKgM3 - carrierDensityKgM3);
  const stokesCriticalDiameterM = Math.sqrt(
    18 * carrierViscosityPaS * opposingVelocityMS / (deltaRho * G),
  );
  const stokesCriticalReynolds = carrierDensityKgM3 * opposingVelocityMS
    * stokesCriticalDiameterM / carrierViscosityPaS;
  const snCriticalDiameterM = criticalDiameter(
    opposingVelocityMS, carrierDensityKgM3, entrainedDensityKgM3, carrierViscosityPaS,
  );
  const snAtCritical = sphereVelocitySchillerNaumann(
    snCriticalDiameterM, carrierDensityKgM3, entrainedDensityKgM3, carrierViscosityPaS,
  );
  const sensitivityDiametersMm = [0.1, 0.25, 0.5, 1, 2, 5];
  return {
    name,
    status: 'PROPERTY_CONDITIONAL_SENSITIVITY_NOT_ACTUAL_OUTLET_VOLUMETRIC_RESULT',
    outletMassKgH,
    assumedOutletDensityKgM3,
    flowM3H,
    opposingGrossSuperficialVelocityMS: opposingVelocityMS,
    nominalGrossResidenceTimeMin: grossVolumeM3 / flowM3H * 60,
    stokes: {
      equation: 'u_t = |rho_p-rho_c| g d^2 / (18 mu_c)',
      criticalDiameterM: stokesCriticalDiameterM,
      criticalDiameterMm: stokesCriticalDiameterM * 1000,
      reynoldsAtCritical: stokesCriticalReynolds,
      creepingFlowBoundSatisfied: stokesCriticalReynolds < 1,
    },
    rigidSphereSchillerNaumannConditional: {
      equations: [
        'Cd = (24/Re)(1 + 0.15 Re^0.687)',
        'u_t = sqrt(4 |rho_p-rho_c| g d / (3 rho_c Cd))',
        'Re = rho_c u_t d / mu_c',
      ],
      criticalDiameterM: snCriticalDiameterM,
      criticalDiameterMm: snCriticalDiameterM * 1000,
      reynoldsAtCritical: snAtCritical.reynolds,
      correlationNominalReBoundSatisfied: snAtCritical.reynolds < 1000,
      validatedLiquidDropModel: false,
      forceBalanceResidual: snAtCritical.forceBalanceResidual,
    },
    labelledDiameterSensitivity: sensitivityDiametersMm.map((diameterMm) => {
      const diameterM = diameterMm / 1000;
      const stokesVelocityMS = deltaRho * G * diameterM ** 2 / (18 * carrierViscosityPaS);
      const stokesReynolds = carrierDensityKgM3 * stokesVelocityMS
        * diameterM / carrierViscosityPaS;
      const sn = sphereVelocitySchillerNaumann(
        diameterM, carrierDensityKgM3, entrainedDensityKgM3, carrierViscosityPaS,
      );
      const stokesNetVelocityMS = stokesVelocityMS - opposingVelocityMS;
      const snNetVelocityMS = sn.velocityMS - opposingVelocityMS;
      return {
        diameterMm,
        status: 'SENSITIVITY_VALUE_NOT_TARGET_DROPLET_SIZE',
        stokesVelocityMS,
        stokesReynolds,
        stokesCreepingFlowBoundSatisfied: stokesReynolds < 1,
        stokesNetSlipOpposingVelocityMS: stokesNetVelocityMS,
        stokesFullStraightHeightTravelTimeS:
          stokesNetVelocityMS > 0 ? assumedTravelHeightM / stokesNetVelocityMS : null,
        stokesFullStraightHeightTravelAvailable: stokesNetVelocityMS > 0,
        rigidSphereSnVelocityMS: sn.velocityMS,
        rigidSphereSnReynolds: sn.reynolds,
        rigidSphereSnNetSlipOpposingVelocityMS: snNetVelocityMS,
        rigidSphereSnFullStraightHeightTravelTimeS:
          snNetVelocityMS > 0 ? assumedTravelHeightM / snNetVelocityMS : null,
        rigidSphereSnFullStraightHeightTravelAvailable: snNetVelocityMS > 0,
        assumedTestTravelHeightM: assumedTravelHeightM,
      };
    }),
  };
}

function esc(value: unknown) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function f(value: number, digits = 5) {
  return Number.isFinite(value) ? value.toLocaleString('en-US', {
    maximumFractionDigits: digits, minimumFractionDigits: 0, useGrouping: false,
  }) : '—';
}

function selfTest() {
  const stokesKnown = 100 * G * 1e-4 ** 2 / (18 * 1e-3);
  assert(Math.abs(stokesKnown - 0.0005448138888888889) < 1e-15, 'Stokes identity test failed');
  const sn = sphereVelocitySchillerNaumann(1e-3, 1000, 1100, 1e-3);
  assert(sn.velocityMS > 0 && sn.reynolds > 0, 'SN positivity test failed');
  assert(sn.forceBalanceResidual < 1e-12, 'SN force-balance residual test failed');
  const d = criticalDiameter(sn.velocityMS, 1000, 1100, 1e-3);
  assert(Math.abs(d - 1e-3) < 1e-10, 'SN inverse diameter test failed');
  return {
    status: 'PASS',
    independentChecks: [
      'Known Stokes identity',
      'Schiller-Naumann positivity',
      'Schiller-Naumann force-balance residual',
      'Independent bisection inversion of terminal velocity',
    ],
  };
}

async function main() {
  if (process.argv.includes('--self-test')) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }
  const client = await pool.connect();
  let evidence: Json;
  try {
    await client.query('BEGIN READ ONLY');
    const design = (await client.query(
      `SELECT id, project_number, status, input_data, updated_at
         FROM ecr_pre_pilot_designs WHERE id=$1`,
      [DESIGN_ID],
    )).rows[0];
    assert(design, 'Design269 not found');
    const stage4 = (await client.query(
      `SELECT id, stage3_run_id, stage3_immutable_hash, lineage_hash, status,
              result_snapshot, completed_at
         FROM ecr_pre_pilot_stage4_physical_sizing_calculations
        WHERE design_id=$1 AND status='CALCULATED' ORDER BY id DESC LIMIT 1`,
      [DESIGN_ID],
    )).rows[0];
    assert(stage4, 'No saved calculated Stage 4 evidence');
    const reference = stage4.result_snapshot?.actualStage2NtReference;
    assert(reference?.status === 'AVAILABLE_REFERENCE_ONLY' && reference.stage2JobId,
      'Saved Stage 4 does not identify accepted Stage 2 reference evidence');
    const stage2 = (await client.query(
      `SELECT id, status, model_hash, engine_hash, input_snapshot, result_snapshot,
              created_at, completed_at
         FROM ecr_pre_pilot_predictive_nt_jobs WHERE id=$1 AND design_id=$2`,
      [reference.stage2JobId, DESIGN_ID],
    )).rows[0];
    assert(stage2?.status === 'completed', 'Referenced Stage 2 job is not completed');
    const stage3 = (await client.query(
      `SELECT id, stage1_snapshot_hash, stage2_job_id, stage2_result_hash,
              implementation_hash, immutable_hash, created_at
         FROM ecr_pre_pilot_kuhni_geometry_resolver_runs WHERE id=$1 AND design_id=$2`,
      [stage4.stage3_run_id, DESIGN_ID],
    )).rows[0];
    assert(stage3, 'Referenced Stage 3 evidence not found');
    evidence = { design, stage2, stage3, stage4 };
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }

  const { design, stage2, stage3, stage4 } = evidence;
  const current = design.input_data;
  const s1 = current.stage1;
  const nt = finite(stage4.result_snapshot.actualStage2NtReference.value, 'accepted Stage 2 Nt');
  const trial = stage2.result_snapshot.trials.find(
    (row: Json) => Number(row.stageCount) === nt && row.accepted === true,
  );
  assert(trial, 'Accepted Stage 2 cascade trial not found');
  assert(stage2.result_snapshot.engine?.engineVersion?.startsWith('7C-'),
    'Referenced Stage 2 evidence is not a 7C engine');
  assert(finite(stage2.input_snapshot.temperatureK, 'Stage 2 temperature K')
    === finite(s1.temperatureK, 'current Stage 1 temperature K'), 'Operating temperature mismatch');

  const oilFeed = trial.boundaryStreams.oilFeed;
  const finalRaffinate = trial.boundaryStreams.finalRaffinate;
  const finalExtract = trial.boundaryStreams.finalExtract;
  const freshWetSolvent = trial.boundaryStreams.freshWetSolvent;
  assert(Math.abs(oilFeed.mass + freshWetSolvent.mass
    - finalRaffinate.mass - finalExtract.mass) < 1e-8, 'Stage 2 mass closure failed');

  const feedMassKgH = finite(s1.designFeedRateLph, 'feed L/h')
    * finite(s1.rrboDensityKgM3, 'feed density') / 1000;
  const scaleKgHPerBasisMass = feedMassKgH / finite(oilFeed.mass, 'Stage 2 oil basis mass');
  const raffinateMassKgH = finalRaffinate.mass * scaleKgHPerBasisMass;
  const extractMassKgH = finalExtract.mass * scaleKgHPerBasisMass;
  const solventMassKgH = freshWetSolvent.mass * scaleKgHPerBasisMass;
  const oilFeedKmolH = oilFeed.flowMol * scaleKgHPerBasisMass;
  const solventKmolH = freshWetSolvent.flowMol * scaleKgHPerBasisMass;
  const raffinateKmolH = finalRaffinate.flowMol * scaleKgHPerBasisMass;
  const extractKmolH = finalExtract.flowMol * scaleKgHPerBasisMass;

  const topDiameterM = 1.2;
  const topHeightM = 1.5;
  const bottomDiameterM = 1.2;
  const bottomHeightM = 0.9;
  const topAreaM2 = Math.PI * topDiameterM ** 2 / 4;
  const bottomAreaM2 = Math.PI * bottomDiameterM ** 2 / 4;
  const topGrossVolumeM3 = topAreaM2 * topHeightM;
  const bottomGrossVolumeM3 = bottomAreaM2 * bottomHeightM;

  // These are deliberately sensitivity calculations. Saved properties describe
  // bulk feed and fresh wet solvent, not the compositionally changed outlets.
  const top = phaseAssessment(
    'TOP — provisional raffinate outlet; entrained extract settles against upward outlet flow',
    raffinateMassKgH, finite(s1.rrboDensityKgM3, 'RRBO density'),
    finite(s1.rrboDensityKgM3, 'RRBO density'), finite(s1.nmpDensityKgM3, 'NMP density'),
    finite(s1.rrboDynamicViscosityCp, 'RRBO viscosity') * 1e-3,
    topAreaM2, topGrossVolumeM3, topHeightM,
  );
  const bottom = phaseAssessment(
    'BOTTOM — provisional extract outlet; entrained raffinate rises against downward outlet flow',
    extractMassKgH, finite(s1.nmpDensityKgM3, 'NMP density'),
    finite(s1.nmpDensityKgM3, 'NMP density'), finite(s1.rrboDensityKgM3, 'RRBO density'),
    finite(s1.nmpDynamicViscosityCp, 'NMP viscosity') * 1e-3,
    bottomAreaM2, bottomGrossVolumeM3, bottomHeightM,
  );
  const tests = selfTest();
  assert(Math.abs(topAreaM2 - 1.1309733552923256) < 1e-12, 'Area test failed');
  assert(Math.abs(raffinateMassKgH + extractMassKgH - feedMassKgH - solventMassKgH) < 1e-8,
    'Scaled mass closure failed');
  assert(Math.abs(raffinateKmolH + extractKmolH - oilFeedKmolH - solventKmolH) < 1e-8,
    'Scaled molar closure failed');

  const assessment = {
    assessment: {
      designId: DESIGN_ID,
      scope: 'READ_ONLY_ENGINEERING_DISENGAGEMENT_ASSESSMENT',
      calculationTimestamp: new Date().toISOString(),
      qualifiedConclusion:
        'NOT READY FOR DISENGAGEMENT ADEQUACY ACCEPTANCE. The user-proposed RRBO-continuous orientation conflicts with the current saved NMP-continuous / RRBO-dispersed authority. Scaled Stage-2 model-predicted outlet mass rates and gross geometry are calculable, but measured/actual outlet rates, outlet volumetric rates, velocities, effective residence times, and validated liquid-drop terminal-slip criteria are not established.',
      noDatabaseWrites: true,
    },
    proposedGeometry: {
      top: { diameterM: topDiameterM, straightHeightM: topHeightM, grossAreaM2: topAreaM2, grossVolumeM3: topGrossVolumeM3 },
      bottom: { diameterM: bottomDiameterM, straightHeightM: bottomHeightM, grossAreaM2: bottomAreaM2, grossVolumeM3: bottomGrossVolumeM3 },
      activeSection: { diameterM: 0.6, theoreticalStagesDesignBasis: 7, compartmentEfficiency: 0.35, physicalCompartmentCount: 20, activeHeightM: 3.6 },
      status: 'USER_PROPOSED_GEOMETRY_ASSESSED_NOT_IMPLEMENTED',
    },
    provenance: {
      currentStage1: {
        savedAt: current.savedAt, immutableHash: current.immutableHash,
        designUpdatedAt: design.updated_at, operatingTemperatureC: s1.operatingTemperatureC,
        authority: 'CURRENT_SAVED_STAGE1_SOLE_PROCESS_PROPERTY_AUTHORITY',
      },
      acceptedStage2Cascade: {
        jobId: stage2.id, jobStatus: stage2.status, createdAt: stage2.created_at,
        completedAt: stage2.completed_at, resultHash: stage4.result_snapshot.actualStage2NtReference.stage2ResultHash,
        modelHash: stage2.model_hash, engineHash: stage2.engine_hash,
        engineVersion: stage2.result_snapshot.engine.engineVersion,
        temperatureK: stage2.input_snapshot.temperatureK,
        acceptedPredictiveNt: nt, trialAccepted: trial.accepted,
        numericalAcceptancePassed: trial.numericalAcceptancePassed,
        solverTerminationStatus: trial.solverTerminationStatus,
        releaseEligible: trial.releaseEligible,
        maximumScaledEquationResidual: trial.maximumScaledEquationResidual,
        componentOrder: stage2.result_snapshot.componentOrder,
        qualification: trial.qualificationStatus,
      },
      stage3: {
        runId: stage3.id, immutableHash: stage3.immutable_hash,
        implementationHash: stage3.implementation_hash, createdAt: stage3.created_at,
      },
      currentStage4: {
        calculationId: stage4.id, status: stage4.status, completedAt: stage4.completed_at,
        lineageHash: stage4.lineage_hash, stage3ImmutableHash: stage4.stage3_immutable_hash,
        stage2Role: 'AVAILABLE_REFERENCE_ONLY_NOT_STAGE4_SIZING_BASIS',
      },
      currentness: stage4.result_snapshot.stage2Stage1Compatibility,
      phaseOrientationConflict: {
        userProposal: 'RRBO_CONTINUOUS',
        currentSavedAuthority: s1.phaseConfiguration,
        status: 'MISMATCH_NO_ORIENTATION_CHANGE_AUTHORIZED',
      },
    },
    propertyAuthority: {
      operatingTemperatureC: s1.operatingTemperatureC,
      bulkFeedAndFreshSolventOnly: {
        rrboFeed: { densityKgM3: s1.rrboDensityKgM3, dynamicViscosityPaS: s1.rrboDynamicViscosityCp * 1e-3 },
        freshWetNmp: { densityKgM3: s1.nmpDensityKgM3, dynamicViscosityPaS: s1.nmpDynamicViscosityCp * 1e-3 },
        interfacialTensionNM: s1.rrboInterfacialTensionMnM * 1e-3,
      },
      outletMixtureProperties: {
        finalRaffinateDensityKgM3: null, finalRaffinateDynamicViscosityPaS: null,
        finalExtractDensityKgM3: null, finalExtractDynamicViscosityPaS: null,
        status: 'NOT_SAVED_NOT_INVENTED',
      },
      ownership:
        'Stage 1 owns the saved additive hydrodynamic process basis. Stage 2 owns outlet compositions and normalized phase mass/molar flows. Stage 3/4 own selected active-section geometry and fixed design sizing. Bulk feed/fresh-solvent properties are not relabelled as outlet-mixture properties.',
    },
    acceptedStage2Boundary: {
      basis: 'mass units per 100 mass units oil feed; normalized cascade boundary, not kg/h',
      oilFeed, freshWetSolvent, finalRaffinate, finalExtract,
    },
    savedFeedAndSolventFlows: {
      oilFeedLph: s1.designFeedRateLph,
      oilFeedKgH: feedMassKgH,
      solventOilMassRatio: s1.solventOilRatio,
      freshWetSolventKgH: solventMassKgH,
      freshWetSolventLphUsingSavedBulkDensity: solventMassKgH / s1.nmpDensityKgM3 * 1000,
      clarification: 'S/O=0.6 is a mass ratio. It gives 2085.6 kg/h and approximately 2054.78 L/h at the saved 1015 kg/m3 wet-NMP density, not 2400 L/h.',
    },
    scaledModelPredictedMassFlows: {
      classification: 'SCALED_ACCEPTED_STAGE2_MODEL_PREDICTION_REFERENCE_ESTIMATE_NOT_MEASURED',
      derivation: 'feed mass scale = 4000 L/h × 869 kg/m3 × 1e-3 m3/L; each accepted Stage-2 boundary mass is scaled by feed mass / normalized oil basis mass',
      oilFeedKgH: feedMassKgH, freshWetSolventKgH: solventMassKgH,
      finalRaffinateKgH: raffinateMassKgH, finalExtractKgH: extractMassKgH,
      totalInKgH: feedMassKgH + solventMassKgH,
      totalOutKgH: raffinateMassKgH + extractMassKgH,
      limitation: 'Accepted predictive N_T=4 Stage-2 outputs are reference estimates. They are not measured outlet flows and are not predicted performance for the separate fixed N_T=7 Stage-3/4 design basis.',
    },
    scaledModelPredictedMolarFlows: {
      classification: 'SCALED_ACCEPTED_STAGE2_MODEL_PREDICTION_REFERENCE_ESTIMATE_NOT_MEASURED',
      derivation: 'each saved Stage-2 flowMol (kmol per normalized cascade basis) is multiplied by the same 34.76 h^-1 actual-feed scale; no molecular-weight or property mixing was added',
      oilFeedKmolH, freshWetSolventKmolH: solventKmolH,
      finalRaffinateKmolH: raffinateKmolH, finalExtractKmolH: extractKmolH,
      totalInKmolH: oilFeedKmolH + solventKmolH,
      totalOutKmolH: raffinateKmolH + extractKmolH,
    },
    modelPredictedOutletVolumetricResults: {
      status: 'NOT_CALCULABLE_FROM_SAVED_EVIDENCE',
      reason: 'The accepted cascade saves outlet composition and mass/molar flow but no outlet-mixture densities or viscosities. No property-mixing rule was introduced.',
    },
    explicitlyConditionalBulkPropertySensitivity: { top, bottom },
    zeroNetThresholdInterpretation: {
      status: 'ZERO_DRIFT_NOT_PASSING_NO_MARGIN',
      rule: 'At each reported critical diameter, terminal slip equals opposing superficial velocity; net travel velocity is zero and full-height travel time is unavailable/infinite.',
      top: {
        stokes: { diameterMm: top.stokes.criticalDiameterMm, netVelocityMS: 0, fullHeightTravelTimeS: null, passingSize: false, margin: null },
        rigidSphereSchillerNaumann: { diameterMm: top.rigidSphereSchillerNaumannConditional.criticalDiameterMm, netVelocityMS: 0, fullHeightTravelTimeS: null, passingSize: false, margin: null },
      },
      bottom: {
        stokes: { diameterMm: bottom.stokes.criticalDiameterMm, netVelocityMS: 0, fullHeightTravelTimeS: null, passingSize: false, margin: null },
        rigidSphereSchillerNaumann: { diameterMm: bottom.rigidSphereSchillerNaumannConditional.criticalDiameterMm, netVelocityMS: 0, fullHeightTravelTimeS: null, passingSize: false, margin: null },
      },
    },
    dragModelApplicability: {
      stokes:
        'Rigid sphere, isolated-particle creeping-flow result. Accepted only when the reported Reynolds number is below 1; it is not a liquid-drop/deformation/coalescence model.',
      schillerNaumann:
        'Rigid-sphere sensitivity using Cd=(24/Re)(1+0.15Re^0.687), nominally for Re below 1000. It is explicitly not validated here for liquid RRBO/NMP drops, contaminated interfaces, swarms, wall effects, or deformable drops.',
      references: [
        'G. G. Stokes (1851), On the Effect of the Internal Friction of Fluids on the Motion of Pendulums, Transactions of the Cambridge Philosophical Society 9, 8–106.',
        'L. Schiller and A. Naumann (1935), VDI Zeitung 77, 318–320.',
        'R. Clift, J. R. Grace and M. E. Weber (1978), Bubbles, Drops, and Particles, Academic Press; rigid-particle drag regime discussion.',
      ],
    },
    residenceAndLayoutLimits: {
      nominalResidence: 'Only gross vessel-volume/outlet-flow sensitivity is reported; effective liquid volume and residence-time distribution are unknown.',
      straightHeightTravelSensitivity:
        'Travel time uses the full proposed straight height divided by positive net terminal-slip-minus-opposing velocity. Height is an assumed test distance, not actual droplet routing. Zero or negative net velocity is reported unavailable/infinite, never as passage.',
      pending: [
        'outlet-mixture density and viscosity at 40 °C',
        'interface elevations and normal/minimum/maximum liquid levels',
        'inlet and outlet elevations, orientation, momentum and distributors',
        'coalescer, calming zone, internals displacement and effective free area/volume',
        'phase inventory, entrainment direction and verified top/bottom phase routing',
        'droplet-size distribution, target cut size, interfacial mobility and coalescence kinetics',
        'allowable entrainment criterion and safety/design margin',
      ],
    },
    independentMathChecks: {
      ...tests, additionalChecks: [
        'gross circular area', 'Stage-2 normalized mass closure',
        'actual scaled mass closure', 'actual scaled molar closure',
      ],
    },
  };

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design269 — Disengagement Assessment</title>
<style>
:root{--ink:#172033;--muted:#5d687b;--line:#d8dee9;--navy:#15345b;--blue:#eaf2fb;--amber:#fff4d6;--red:#8f2431;--green:#1d6b4f}
*{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:var(--ink);font:14px/1.5 Arial,sans-serif}
main{max-width:1100px;margin:28px auto;background:white;box-shadow:0 8px 30px #1a2d4820}
header{padding:30px 38px;background:var(--navy);color:white}header p{margin:6px 0 0;color:#d9e7f6}
section{padding:24px 38px;border-bottom:1px solid var(--line)}h1{font-size:25px;margin:0}h2{font-size:18px;color:var(--navy);margin:0 0 14px}h3{font-size:15px;margin:18px 0 8px}
.verdict,.warning,.note{padding:14px 16px;border-left:5px solid}.verdict{background:#fbe9eb;border-color:var(--red)}.warning{background:var(--amber);border-color:#bf7a00}.note{background:var(--blue);border-color:#3b6f9e}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.card{border:1px solid var(--line);padding:14px;border-radius:6px}.big{font-size:21px;font-weight:bold;color:var(--navy)}
table{border-collapse:collapse;width:100%;margin:10px 0 18px}th,td{padding:8px 9px;border:1px solid var(--line);text-align:left;vertical-align:top}th{background:#edf2f8;color:#263b58}code{font-size:12px}ul{margin:8px 0;padding-left:22px}.small{font-size:12px;color:var(--muted)}
@media(max-width:650px){main{margin:0}header,section{padding:22px 18px}table{font-size:12px}}
@media print{body{background:white}main{margin:0;box-shadow:none}section{break-inside:avoid}}
</style></head><body><main>
<header><h1>Design269 · Read-only disengagement assessment</h1><p>Proposed top Ø1.2 m × 1.5 m; bottom Ø1.2 m × 0.9 m · 40 °C saved basis</p></header>
<section><div class="verdict"><strong>Qualified conclusion — not ready for disengagement adequacy acceptance.</strong><br>
<strong>Phase-orientation mismatch:</strong> the user proposal is RRBO-continuous, while the current saved authority is <strong>NMP-continuous / RRBO-dispersed</strong>. No orientation change was authorized or made. Stage-2 outlet rates below are scaled accepted-model reference estimates, not measured/actual flows and not a new prediction of fixed-N<sub>T</sub>=7 performance. Outlet volumetric rates, velocities, effective residence times and validated liquid-drop cut sizes remain unestablished.</div></section>
<section><h2>1. Evidence lineage and currentness</h2>
<table><tr><th>Evidence</th><th>Saved authority</th><th>Identity / time</th></tr>
<tr><td>Current Stage 1</td><td>Sole saved process/property authority</td><td>${esc(current.immutableHash)}<br>${esc(current.savedAt)}</td></tr>
<tr><td>Accepted Stage 2</td><td>7C ${esc(stage2.result_snapshot.engine.engineVersion)}; accepted N<sub>T</sub>=${nt}; converged; reference-only for Stage 4</td><td>${esc(stage2.id)}<br>${esc(stage2.completed_at)}</td></tr>
<tr><td>Stage 3</td><td>Active-section geometry lineage</td><td>run ${esc(stage3.id)} · ${esc(stage3.immutable_hash)}</td></tr>
<tr><td>Current Stage 4</td><td>D=0.6 m; N<sub>T,design</sub>=7; η=0.35; 20 compartments; H=3.6 m</td><td>calculation ${esc(stage4.id)} · ${esc(stage4.completed_at)}</td></tr></table>
<div class="warning"><strong>Orientation conflict:</strong> user proposal = RRBO-continuous; current saved Stage-1/3/4 authority = ${esc(s1.phaseConfiguration)}. The accepted Stage-2 equilibrium evidence itself persisted RRBO-continuous/NMP-dispersed, and the saved compatibility record expressly excludes hydraulic orientation from its equilibrium-input match. This assessment does not reconcile or select an orientation.</div>
<div class="note"><strong>Currentness:</strong> ${esc(stage4.result_snapshot.stage2Stage1Compatibility.status)}. Equality of equilibrium inputs excluding orientation does not make the hydraulic phase assignments interchangeable.</div></section>
<section><h2>2. Geometry and scaled model-predicted flows</h2><div class="grid">
<div class="card"><div class="small">Gross cross-sectional area, each end</div><div class="big">${f(topAreaM2,6)} m²</div><code>A=πD²/4</code></div>
<div class="card"><div class="small">Top gross volume</div><div class="big">${f(topGrossVolumeM3,6)} m³</div><code>V=A×1.5 m</code></div>
<div class="card"><div class="small">Bottom gross volume</div><div class="big">${f(bottomGrossVolumeM3,6)} m³</div><code>V=A×0.9 m</code></div></div>
<div class="note"><strong>Saved flow basis:</strong> oil feed = 4000 L/h = ${f(feedMassKgH,4)} kg/h. Saved S/O = 0.6 is a <strong>mass ratio</strong>, so wet solvent = ${f(solventMassKgH,4)} kg/h = approximately <strong>${f(solventMassKgH/s1.nmpDensityKgM3*1000,3)} L/h</strong> using the saved 1015 kg/m³ bulk wet-NMP density—not 2400 L/h.</div>
<table><tr><th>Stream</th><th>Accepted Stage-2 normalized mass / flowMol</th><th>Scaled model-predicted mass flow</th><th>Scaled model-predicted molar flow</th></tr>
<tr><td>Oil feed</td><td>${f(oilFeed.mass,8)} / ${f(oilFeed.flowMol,9)}</td><td>${f(feedMassKgH,4)} kg/h</td><td>${f(oilFeedKmolH,6)} kmol/h</td></tr>
<tr><td>Fresh wet solvent</td><td>${f(freshWetSolvent.mass,8)} / ${f(freshWetSolvent.flowMol,9)}</td><td>${f(solventMassKgH,4)} kg/h</td><td>${f(solventKmolH,6)} kmol/h</td></tr>
<tr><td>Final raffinate</td><td>${f(finalRaffinate.mass,8)} / ${f(finalRaffinate.flowMol,9)}</td><td><strong>${f(raffinateMassKgH,4)} kg/h</strong></td><td><strong>${f(raffinateKmolH,6)} kmol/h</strong></td></tr>
<tr><td>Final extract</td><td>${f(finalExtract.mass,8)} / ${f(finalExtract.flowMol,9)}</td><td><strong>${f(extractMassKgH,4)} kg/h</strong></td><td><strong>${f(extractKmolH,6)} kmol/h</strong></td></tr></table>
<p class="small">Scale: 4000 L/h × 869 kg/m³ × 10⁻³ m³/L = ${f(feedMassKgH,4)} kg/h; cascade oil basis = 100 mass units. In = out = ${f(feedMassKgH+solventMassKgH,4)} kg/h. The accepted predictive N<sub>T</sub>=4 trial is reference evidence only: values are not measured and are not a new fixed-N<sub>T</sub>=7 performance prediction. No outlet property mixing was performed.</p></section>
<section><h2>3. Property authority: bulk is not outlet mixture</h2>
<table><tr><th>Saved 40 °C property</th><th>Value</th><th>Permitted interpretation</th></tr>
<tr><td>Operating temperature</td><td><strong>${f(s1.operatingTemperatureC)} °C</strong></td><td>Current saved Stage-1 authority</td></tr>
<tr><td>RRBO density / dynamic viscosity</td><td><strong>${f(s1.rrboDensityKgM3)} kg/m³ / ${f(s1.rrboDynamicViscosityCp)} mPa·s</strong></td><td>Bulk RRBO feed</td></tr>
<tr><td>Wet NMP density / dynamic viscosity</td><td><strong>${f(s1.nmpDensityKgM3)} kg/m³ / ${f(s1.nmpDynamicViscosityCp)} mPa·s</strong></td><td>Fresh wet-solvent phase</td></tr>
<tr><td>Final raffinate density / viscosity</td><td>Not saved</td><td>Not calculable; contains ${f(finalRaffinate.massFractions[5]*100,4)} wt% NMP</td></tr>
<tr><td>Final extract density / viscosity</td><td>Not saved</td><td>Not calculable; contains ${f(finalExtract.massFractions[0]*100,4)} wt% SAT and other oil components</td></tr></table>
<div class="warning"><strong>Therefore, there are no actual outlet velocities in this report.</strong> The values below are explicitly property-conditional sensitivities that substitute bulk-feed properties for compositionally changed model-predicted outlets.</div></section>
<section><h2>4. Opposing velocity and terminal-slip sensitivity</h2>
<table><tr><th>Conditional case</th><th>Assumed ρ outlet</th><th>Conditional Q</th><th>Opposing gross velocity</th><th>Gross nominal residence</th></tr>
<tr><td>Top: provisional raffinate upward</td><td>${f(top.assumedOutletDensityKgM3)} kg/m³</td><td>${f(top.flowM3H,5)} m³/h</td><td>${f(top.opposingGrossSuperficialVelocityMS,8)} m/s</td><td>${f(top.nominalGrossResidenceTimeMin,3)} min</td></tr>
<tr><td>Bottom: provisional extract downward</td><td>${f(bottom.assumedOutletDensityKgM3)} kg/m³</td><td>${f(bottom.flowM3H,5)} m³/h</td><td>${f(bottom.opposingGrossSuperficialVelocityMS,8)} m/s</td><td>${f(bottom.nominalGrossResidenceTimeMin,3)} min</td></tr></table>
<table><tr><th>Case</th><th>Stokes critical d</th><th>Re at Stokes d</th><th>Rigid-sphere S–N critical d</th><th>Re at S–N d</th></tr>
<tr><td>Top; extract drops settle against upward raffinate</td><td>${f(top.stokes.criticalDiameterMm,5)} mm</td><td>${f(top.stokes.reynoldsAtCritical,5)} (${top.stokes.creepingFlowBoundSatisfied?'bounded':'outside bound'})</td><td>${f(top.rigidSphereSchillerNaumannConditional.criticalDiameterMm,5)} mm</td><td>${f(top.rigidSphereSchillerNaumannConditional.reynoldsAtCritical,5)}</td></tr>
<tr><td>Bottom; raffinate drops rise against downward extract</td><td>${f(bottom.stokes.criticalDiameterMm,5)} mm</td><td>${f(bottom.stokes.reynoldsAtCritical,5)} (${bottom.stokes.creepingFlowBoundSatisfied?'bounded':'outside bound'})</td><td>${f(bottom.rigidSphereSchillerNaumannConditional.criticalDiameterMm,5)} mm</td><td>${f(bottom.rigidSphereSchillerNaumannConditional.reynoldsAtCritical,5)}</td></tr></table>
<p><strong>Threshold meaning:</strong> the “critical diameter” is the zero-net-drift equality <code>u<sub>terminal</sub> − u<sub>opposing</sub> = 0</code>. A drop exactly at that threshold has no positive travel velocity and therefore no finite full-height travel time. It is <strong>not a passing size</strong>, separator guarantee, target droplet size, safety margin, liquid-drop validation, or entrainment specification. No margin above threshold has been selected.</p>
<table><tr><th>Zero-net threshold row</th><th>Critical d</th><th>Net drift</th><th>Full straight-height travel</th><th>Disposition</th></tr>
<tr><td>Top · Stokes</td><td>${f(top.stokes.criticalDiameterMm,5)} mm</td><td>0 m/s</td><td>∞ / unavailable</td><td>NOT PASSING · no margin</td></tr>
<tr><td>Top · rigid-sphere S–N</td><td>${f(top.rigidSphereSchillerNaumannConditional.criticalDiameterMm,5)} mm</td><td>0 m/s</td><td>∞ / unavailable</td><td>NOT PASSING · no margin</td></tr>
<tr><td>Bottom · Stokes</td><td>${f(bottom.stokes.criticalDiameterMm,5)} mm</td><td>0 m/s</td><td>∞ / unavailable</td><td>NOT PASSING · no margin</td></tr>
<tr><td>Bottom · rigid-sphere S–N</td><td>${f(bottom.rigidSphereSchillerNaumannConditional.criticalDiameterMm,5)} mm</td><td>0 m/s</td><td>∞ / unavailable</td><td>NOT PASSING · no margin</td></tr></table>
<h3>Labelled diameter sensitivity — not targets</h3>
<table><tr><th>d (mm)</th><th>Top Stokes net / full 1.5 m time</th><th>Top rigid S–N net / full 1.5 m time</th><th>Bottom Stokes net / full 0.9 m time</th><th>Bottom rigid S–N net / full 0.9 m time</th></tr>
${top.labelledDiameterSensitivity.map((r: Json, i: number) => { const b=bottom.labelledDiameterSensitivity[i]; const cell=(v:number,t:number|null)=>`${f(v,7)} m/s / ${t===null?'∞ / unavailable':`${f(t/60,3)} min`}`; return `<tr><td>${r.diameterMm}</td><td>${cell(r.stokesNetSlipOpposingVelocityMS,r.stokesFullStraightHeightTravelTimeS)}</td><td>${cell(r.rigidSphereSnNetSlipOpposingVelocityMS,r.rigidSphereSnFullStraightHeightTravelTimeS)}</td><td>${cell(b.stokesNetSlipOpposingVelocityMS,b.stokesFullStraightHeightTravelTimeS)}</td><td>${cell(b.rigidSphereSnNetSlipOpposingVelocityMS,b.rigidSphereSnFullStraightHeightTravelTimeS)}</td></tr>`; }).join('')}
</table></section>
<section><h2>5. What remains unknown</h2><ul>${assessment.residenceAndLayoutLimits.pending.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
<p>Gross nominal residence uses <code>Vgross/Qoutlet</code>. Sensitivity travel times use the full proposed straight height divided by positive net slip. The full height is only an assumed test distance—not actual routing. Effective volume, true travel distance, interface location, inlet momentum/layout and residence-time distribution are unknown, so no effective disengagement time is claimed.</p></section>
<section><h2>6. Equations, applicability and checks</h2>
<p><code>uStokes=|ρp−ρc|gd²/(18μc)</code>; use only with the reported creeping-flow Reynolds check. Conditional rigid-sphere sensitivity uses <code>Cd=(24/Re)(1+0.15Re^0.687)</code>, <code>u=sqrt(4|ρp−ρc|gd/(3ρcCd))</code>. It is not a validated liquid-drop model.</p>
<p><strong>Independent math checks:</strong> PASS — known Stokes identity, S–N positivity and force-balance, independent bisection inversion, circular area, normalized and scaled mass closure.</p>
<p class="small">References: G. G. Stokes (1851), Transactions of the Cambridge Philosophical Society 9, 8–106; L. Schiller &amp; A. Naumann (1935), VDI Zeitung 77, 318–320; R. Clift, J. R. Grace &amp; M. E. Weber (1978), Bubbles, Drops, and Particles, Academic Press.</p></section>
<section><p class="small">Read-only calculation. No database record, design geometry, drawing, memory, or application code was changed. Machine-readable evidence and all unrounded values are in assessment.json.</p></section>
</main></body></html>`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, 'assessment.json'), `${JSON.stringify(assessment, null, 2)}\n`);
  await writeFile(resolve(OUT_DIR, 'report.html'), html);
  console.log(JSON.stringify({
    status: 'COMPLETE', designId: DESIGN_ID, conclusion: assessment.assessment.qualifiedConclusion,
    outputs: [
      'deliverables/disengagement-assessment/assessment.json',
      'deliverables/disengagement-assessment/report.html',
    ],
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());