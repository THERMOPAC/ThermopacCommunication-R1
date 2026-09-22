import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Offline only. No application/DB imports, network calls or solver/job execution.
const prefix = 'deliverables/end-rule';
const inputPath = 'deliverables/kuhni-end-section-preliminary-calculation.input.json';
const sourcePaths = [inputPath, '.agents/memory/kuhni-disengagement-boundary.md',
  'attached_assets/Pasted-Framed-Design-Rule-Top-Bottom-Disengagement-Sections-Ru_1790052567230.txt',
  'deliverables/end-sections-sizing.mjs', 'deliverables/end-sections-sizing.md',
  'deliverables/stage2-report-corrected/frozen-job.json'];
export const area = d => Math.PI * d ** 2 / 4;
export const h10 = (q, d) => {
  assert(Number.isFinite(q) && q >= 0 && Number.isFinite(d) && d > 0);
  return q / (6 * 0.9 * area(d));
};
export function balance(componentFeedKgH, fractionsToRaffinate) {
  assert.equal(componentFeedKgH.length, fractionsToRaffinate.length);
  componentFeedKgH.forEach(x => assert(Number.isFinite(x) && x >= 0));
  fractionsToRaffinate.forEach(x => assert(Number.isFinite(x) && x >= 0 && x <= 1));
  const raffinate = componentFeedKgH.map((m, i) => m * fractionsToRaffinate[i]);
  const extract = componentFeedKgH.map((m, i) => m - raffinate[i]);
  const sum = a => a.reduce((s, x) => s + x, 0);
  return { raffinateComponentKgH: raffinate, extractComponentKgH: extract,
    raffinateKgH: sum(raffinate), extractKgH: sum(extract),
    totalResidualKgH: sum(componentFeedKgH) - sum(raffinate) - sum(extract),
    componentResidualKgH: componentFeedKgH.map((m, i) => m - raffinate[i] - extract[i]) };
}
export function geometry(d) {
  assert(Number.isFinite(d) && d >= 0.7);
  const min = Math.max(0.2, 0.4 * d);
  const sharp = (d - 0.7) / (2 * Math.tan(Math.PI / 6));
  return { diameterM: d, areaM2: area(d), h10MetresPerM3H: h10(1, d),
    transitionMinimumM: min, sharpConeReferenceLengthM: sharp,
    sharpConeShortfallToMinimumM: Math.max(0, min - sharp),
    physicalTransitionLengthM: null, interfaceAllowanceM: 0.15,
    postNozzleMinimumM: min, knownStraightHeightExcludingResidenceAndNozzleEnvelopeM: 0.15 + min,
    actualH10TopM: null, actualH10BottomM: null, finalSelected: false,
    transitionStatus: d === 0.7 ? 'NO_EXPANSION: 30-degree cone impossible at equal IDs; straight calming reservation requires rule exception' :
      '30-degree half-angle conical portion plus mechanically designed formed junctions; exact axial envelope unresolved' };
}
// Same nominal Schedule 40 OD/wall data as previous offline report, not approved metallurgy.
export const pipes = [[40,48.3,3.68],[50,60.3,3.91],[65,73,5.16],[80,88.9,5.49],[100,114.3,6.02]]
  .map(([dn, odMm, wallMm]) => ({ dn, odMm, wallMm, idMm: odMm - 2 * wallMm }));
export function nozzle(q) {
  assert(Number.isFinite(q) && q >= 0);
  const candidates = pipes.map(p => ({ ...p, normalVelocityMS: q / 3600 / area(p.idMm / 1000),
    hydraulic120VelocityMS: 1.2 * q / 3600 / area(p.idMm / 1000),
    passesAssumed05MS: 1.2 * q / 3600 / area(p.idMm / 1000) <= 0.5 }));
  return { normalM3H: q, hydraulic120M3H: 1.2 * q,
    requiredIdAt120And05MSMm: 1000 * Math.sqrt(4 * 1.2 * q / 3600 / (Math.PI * 0.5)),
    provisionalMinimumDn: candidates.find(p => p.passesAssumed05MS)?.dn ?? null, candidates };
}
export function calculate() {
  const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const sourceHashes = Object.fromEntries(sourcePaths.map(p => [p, hash(p)]));
  const x = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const frozen = x.stage5.dimensions;
  assert.equal(frozen.columnDiameterM, 0.7);
  assert.equal(frozen.compartmentCount, 20);
  assert.equal(frozen.compartmentHeightM, 0.21);
  const oilKgH = x.stage1.designFeedRateLph / 1000 * x.stage1.rrboDensityKgM3;
  const solventKgH = 1.5 * oilKgH;
  assert.equal(oilKgH, 3476);
  assert.equal(solventKgH, 5214);
  const first = x.boundaryScenarios[0].streams;
  const componentFeedKgH = first.oilFeed.massFractions.map((f, i) =>
    f * oilKgH + first.freshWetSolvent.massFractions[i] * solventKgH);
  const geometryComparison = [0.7, 0.9, 1, 1.2].map(geometry);
  const sensitivities = x.boundaryScenarios.map(s => {
    const fractions = s.streams.finalRaffinate.componentMass.map((m, i) =>
      m / (s.streams.oilFeed.componentMass[i] + s.streams.freshWetSolvent.componentMass[i]));
    const b = balance(componentFeedKgH, fractions);
    const topQ = b.raffinateKgH / 869, bottomQ = b.extractKgH / 1015;
    return { label: `UNQUALIFIED constant component partition fractions from S/O=0.6 N=${s.N}`,
      actualPrediction: false, fractionsToRaffinate: fractions, ...b,
      topVolumeProxyM3H: topQ, bottomVolumeProxyM3H: bottomQ,
      residenceComparison: geometryComparison.map(g => ({ diameterM: g.diameterM,
        topH10M: h10(topQ, g.diameterM), bottomH10M: h10(bottomQ, g.diameterM),
        topRequiredNetResidenceM3: topQ / 6, bottomRequiredNetResidenceM3: bottomQ / 6 })),
      nozzles: { P04: nozzle(topQ), P02: nozzle(bottomQ) } };
  });
  const r = { status: 'CALCULATED_FEEDS_AND_RULE_GEOMETRY; ACTUAL_PRODUCT_SPLIT_INDETERMINATE',
    sourceHashes, provenance: x.provenance,
    feasibility: { numericalResearchRerunMayBePossible: true, qualifiedSeparate15ResultEstablished: false,
      solverExecuted: false, reason: 'Frozen S/O=0.6 outputs are unbound to Stage5 and releaseEligible=false; changed solvent ratio requires new qualified thermodynamics and chosen stage boundary. Current worker variants are research code, not authority to invent an actual split. No stage-number choice or long solver attempted.' },
    frozenActive: { diameterM: frozen.columnDiameterM, compartments: frozen.compartmentCount,
      pitchM: frozen.compartmentHeightM, activeHeightM: frozen.compartmentCount * frozen.compartmentHeightM,
      rotorDiameterM: frozen.rotorDiameterM, rpm: frozen.selectedRpm, statorOpenFraction: frozen.statorFreeAreaRatio },
    feeds: { oilKgH, oilM3H: 4, wetSolventKgH: solventKgH,
      wetSolventM3H: solventKgH / 1015, totalKgH: oilKgH + solventKgH, massRatio: 1.5,
      savedStage1MassRatioUnchanged: x.stage1.solventOilRatio, componentFeedKgH,
      componentOrder: ['saturates','mono','di','poly','polar','NMP','water'],
      solventCompositionSource: 'inherited source wet-solvent 99.5 mass% NMP / 0.5 mass% water' },
    parameterizedActualBalance: { fractionsToRaffinate: Array(7).fill(null),
      equation: 'R_i = feed_i*f_i; E_i=feed_i*(1-f_i); 0<=f_i<=1. R+E=8690 kg/h. No external phase loss.',
      raffinateKgH: null, extractKgH: null, raffinateM3H: null, extractM3H: null,
      densityRaffinateKgM3: null, densityExtractKgM3: null,
      reason: 'Seven source-labelled component partition fractions and qualified product densities are unavailable at S/O=1.5.' },
    geometryComparison, feedNozzles: { P01: nozzle(4), P03: nozzle(solventKgH / 1015) },
    actualProductNozzles: { P02: null, P04: null }, unqualifiedSensitivities: sensitivities,
    mechanicalHolds: { additionalTopNeckM: null, additionalBottomNeckM: null,
      retainedBottomNeckReservationM: 0.3, knuckleRadiiM: null, thicknessM: null,
      reinforcement: null, torisphericalHeadDepthM: null, totalVesselHeightM: null },
    noResidenceCredit: ['entry/distributor neck','transition','150-mm interface allowance','nozzle envelope','post-nozzle extension','torispherical head'],
    selectedEndDiameters: null, physicalCarryoverPerformance: null };
  assert(sourcePaths.every(p => sourceHashes[p] === hash(p)));
  return r;
}
const fmt = x => x == null ? 'indeterminate' : x.toFixed(4);
const table = (headers, rows) => `| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${rows.map(a=>`| ${a.join(' | ')} |`).join('\n')}`;
export function report(r) {
  return `# Framed end-section rule — separate S/O 1.5 mass calculation

**Computed feeds and conditional dimensions; actual product split, final selection and fabrication remain HOLD.**

Run \`node deliverables/end-rule-calculation.mjs\`; test \`node deliverables/end-rule-tests.mjs\`. Only new end-rule outputs are written. Source SHA-256 hashes and unrounded numbers are in JSON. No saved Stage 1/2, job, Stage 5, app or database is changed.

## Feasibility decision before any long solver

The exported balance has S/O=0.6, with alternative N=4 and N=7 trials. Its Stage-2 releaseEligible flag is false; Stage-4 has no Stage-2 job binding. The frozen job includes an input snapshot/model/engine hashes, but these are not an accepted S/O=1.5 result. The inspected offline refinement script fits a different xylene-family model; it is not a reusable RRBO product calculation. Current seven-component research worker variants exist, so a numerical research rerun may be possible, but its successful convergence would not establish the required qualified product split or select N=4, 7 or 20. No solver or persisted job was launched. This bounded calculation therefore uses a closed parameterized balance and separately labelled numerical sensitivities, not invented equilibrium.

The newer explicit 10-minute user rule governs residence dimensions; the older memory's prohibition on arbitrary residence selection does not override it. The memory's physical carryover/return and equilibrium distinctions remain applicable.

## Exact independent feed balance

RRBO: 4 m³/h ×869 kg/m³ = **3476 kg/h**. Wet solvent: 1.5×3476 = **5214 kg/h**, /1015 = **${fmt(r.feeds.wetSolventM3H)} m³/h**. Combined feed **8690 kg/h**. Inherited wet-solvent composition gives NMP 5187.930 kg/h and water 26.070 kg/h; this purity is a source assumption, not a newly measured assay.

${table(['Component','Total feed kg/h'],r.feeds.componentOrder.map((c,i)=>[c,fmt(r.feeds.componentFeedKgH[i])]))}

For each component choose an evidenced fraction f_i to raffinate: R_i=F_i f_i; E_i=F_i(1−f_i). Thus R+E=8690 exactly, with no arbitrary phase loss. Actual f_i, R, E and product volumes remain null. **Total mass alone cannot determine two product streams.** Volume is not conserved on mixing; do not add feed m³/h and impose it on products. A product mass-to-volume conversion also requires its qualified density.

## Rule geometry: independent top and bottom comparison

Stage 5 active section remains Ø700, 20×210=4200 mm, rotor Ø231, 30 rpm, stator open fraction 0.4. All other active internals remain inherited, not recalculated. The new Ø700 entry/distribution neck is additional at each end and receives no active-stage or residence credit. Keep the earlier 300-mm bottom neck reservation; its adequacy and whether it fulfills all new distributor requirements need layout reconciliation. Top neck height and additional bottom requirement are not invented.

H10=Q_normal/(6×0.90×πD²/4), Q in m³/h, H in metres. The 0.90 factor is usable volume, **not a 10% product mass loss**. Net credited volume is Q/6 m³. Normal flow sets residence; 120% is only a hydraulic/nozzle check.

${table(['D mm','Area m²','H10 m per m³/h','Transition min mm','Sharp 30° reference mm','Post-edge min mm'],r.geometryComparison.map(g=>[g.diameterM*1000,fmt(g.areaM2),fmt(g.h10MetresPerM3H),fmt(g.transitionMinimumM*1000),fmt(g.sharpConeReferenceLengthM*1000),fmt(g.postNozzleMinimumM*1000)]))}

**30° is wall-to-axis half-angle (60° included), following the earlier calculation.** L_sharp=(D−0.700)/(2 tan30°) is an unknuckled reference, not the finished transition. Rule 4 calls max(200 mm,0.4D) a minimum; the summary equality cannot simultaneously define an exact straight-cone length at the fixed diameter/angle. All expanded candidates have sharp-reference lengths below the stated minimum. Do not stretch the straight cone and still label it 30°, nor set the sharp reference equal to a finished formed transition. Mechanical design must solve radii, tangent points and total axial envelope with a 30° conical portion and verify L_transition≥minimum. It may require additional transition/straight tangent allowance or rule reconciliation. No separate cylindrical calming zone is assumed. At D700 there is no radial expansion, hence no 30° expanding cone; it is only a straight-bore comparison and requires a stated exception to the literal cone rule.

Use outward coordinate s from each active terminal **physical face** (top upward, bottom downward). Stack: extra neck → formed transition → 150-mm straight-shell allowance → interface → H10 → product-opening near edge → nozzle envelope → post-edge extension → torispherical head. Bottom is the mirror, with its interface 150 mm below the transition reference. Reconcile the terminal plate face, not center plane, with the frozen ledger before global elevations.

Conservative nozzle convention: H10 ends at the opening's nearest physical edge toward the interface, not centerline. If e_near and e_far are the final axial envelope offsets from nozzle center, center is at s_interface+H10+e_near; head tangent is at that center+e_far+Hpost. Top post extension begins above the crown/outer physical edge; bottom begins below the bottom outer edge. For a simple unreinforced radial pipe only, e_near=e_far=OD/2 is a provisional envelope, not the ID/2. Reinforcement, oblique openings and weld envelopes may increase it. These offsets are not yet final.

Straight shell beyond transition = 0.150+H10+e_near+e_far+max(0.200,0.4D). Transition, interface allowance, nozzle band, post-nozzle extension and torispherical ends get zero residence credit. Head radii/depth, cone knuckles, wall thickness, reinforcement, pressure/material/corrosion and ASME mechanical verification are TBD. No fabrication-compliance assertion or complete overall height is made.

## Numerical sensitivity ONLY — not actual S/O 1.5 outlet predictions

To make conditional sizing reproducible without fabricating equilibrium, each old N=4/N=7 component fraction to raffinate is held constant while its new feed component mass is used. This extrapolates S/O 0.6 partition fractions to 1.5 and is **unqualified**, neither conservative nor a confidence bound. Density proxies remain 869 top /1015 bottom kg/m³. Both outlets in each row belong to that one balanced scenario; do not mix independent maxima as an operating balance.

${table(['Old trial used ONLY for fractions','R kg/h','E kg/h','Q top proxy m³/h','Q bottom proxy m³/h'],r.unqualifiedSensitivities.map((s,i)=>[i===0?'N4':'N7',fmt(s.raffinateKgH),fmt(s.extractKgH),fmt(s.topVolumeProxyM3H),fmt(s.bottomVolumeProxyM3H)]))}

${table(['Sensitivity','D mm','Top H10 mm','Bottom H10 mm'],r.unqualifiedSensitivities.flatMap((s,i)=>s.residenceComparison.map(g=>[i===0?'N4 fractions':'N7 fractions',g.diameterM*1000,fmt(g.topH10M*1000),fmt(g.bottomH10M*1000)])))}

These are calculated conditional heights, not an arbitrary final choice of Ø900 or Ø1000. Qualified actual heights remain indeterminate.

## Revised nozzle hydraulic calculations

Inherited preliminary screening criterion: velocity≤0.5 m/s at 120% normal Q, not an ASME limit. Candidate Schedule40 bores use ID=OD−2wall, from the previous report's nominal ASME B36.10M dimensional assumptions (no lining/corrosion deduction). Metallurgy/schedule/pressure class and final bores remain mechanical decisions.

${table(['Duty / basis','Normal m³/h','120% m³/h','Required ID mm','Provisional DN','ID mm','v120 m/s'],
    [['P01 oil feed',r.feedNozzles.P01],['P03 wet solvent feed',r.feedNozzles.P03],
      ...r.unqualifiedSensitivities.flatMap((s,i)=>[[`P04 conditional N${i===0?4:7}`,s.nozzles.P04],[`P02 conditional N${i===0?4:7}`,s.nozzles.P02]])].map(([name,n])=>{
        const p=n.candidates.find(p=>p.dn===n.provisionalMinimumDn);
        return [name,fmt(n.normalM3H),fmt(n.hydraulic120M3H),fmt(n.requiredIdAt120And05MSMm),p?.dn??'none',fmt(p?.idMm),fmt(p?.hydraulic120VelocityMS)];
      }))}

The revised wet-solvent feed cannot retain the old DN50 on this criterion. P01/P03 feed results follow the specified new basis; P02/P04 actual selections remain null pending the real phase split/densities. JSON supplies every candidate ID/velocity, including DN80, rather than equating DN to bore. No distributor pressure loss, pump duty or nozzle mechanical qualification is inferred.

## Remaining holds

Specify/qualify S/O1.5 component allocation, phase densities and scientific boundary; establish independent droplet loading/DSDs and return paths, including the Ø700 throat. Dissolved NMP is not settleable carryover. Residence compliance alone demonstrates neither removal nor less than 5 wt% physical NMP. Neither the new feed nor these nozzles prove the unchanged active section hydraulically accepts S/O1.5. No active-section re-rating, diameter selection, <5% performance claim or fabrication release is authorized.
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = calculate();
  fs.writeFileSync(`${prefix}-results.json`, JSON.stringify(r, null, 2) + '\n');
  fs.writeFileSync(`${prefix}-report.md`, report(r));
  console.log('Wrote end-rule-results.json and end-rule-report.md; no solver or saved design touched.');
}