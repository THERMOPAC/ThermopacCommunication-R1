import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Offline, read-only source extraction. Only end-sections-sizing outputs are written.
const prefix = 'deliverables/end-sections-sizing';
const sources = [
  '.agents/memory/kuhni-disengagement-boundary.md',
  'deliverables/kuhni-end-section-preliminary-calculation.input.json',
  'deliverables/disengager-input-audit.md',
  'deliverables/kuhni-terminal-flow-evidence.md',
  'deliverables/kuhni-terminal-chain.md',
  'deliverables/kuhni-terminal-coalescence-review.md',
];
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before = Object.fromEntries(sources.map(p => [p, hash(p)]));
const input = JSON.parse(fs.readFileSync(sources[1], 'utf8'));
const g = 9.80665, sigma = 0.011;
const area = d => Math.PI * d * d / 4;
const properties = {
  top: { rhoC: 869, rhoD: 1015, muC: 0.0598, muD: 0.001416, direction: 'NMP settles against upward RRBO' },
  bottom: { rhoC: 1015, rhoD: 869, muC: 0.001416, muD: 0.0598, direction: 'RRBO rises against downward extract' },
};
const fixed = { diameterM: 0.7, stages: 20, activeHeightM: 4.2, pitchM: 0.21,
  rotorDiameterM: 0.231, rpm: 30, Np: 1.2, statorOpenFraction: 0.4 };
assert.equal(input.selected.trial.rpm, fixed.rpm);
assert.equal(input.selected.trial.diameterM, fixed.diameterM);
assert.equal(input.stage4.requiredPhysicalCompartments, fixed.stages);
assert(Math.abs(fixed.stages * fixed.pitchM - fixed.activeHeightM) < 1e-12);
const feeds = { oilKgH: 4 * 869, oilM3H: 4, solventKgH: 4 * 869 * 0.6,
  solventM3H: 4 * 869 * 0.6 / 1015 };
const trials = input.boundaryScenarios.map(s => {
  const scale = feeds.oilKgH / s.streams.oilFeed.mass;
  const streams = Object.fromEntries(Object.entries(s.streams).map(([name, v]) => {
    const rho = ['oilFeed', 'finalRaffinate'].includes(name) ? 869 : 1015;
    return [name, { massKgH: v.mass * scale, volumeProxyM3H: v.mass * scale / rho,
      componentMassKgH: v.componentMass.map(x => x * scale), densityProxyKgM3: rho }];
  }));
  const residualKgH = streams.oilFeed.massKgH + streams.freshWetSolvent.massKgH -
    streams.finalRaffinate.massKgH - streams.finalExtract.massKgH;
  const componentResidualKgH = streams.oilFeed.componentMassKgH.map((v, k) =>
    v + streams.freshWetSolvent.componentMassKgH[k] -
    streams.finalRaffinate.componentMassKgH[k] - streams.finalExtract.componentMassKgH[k]);
  assert(Math.abs(residualKgH) < 1e-7);
  assert(componentResidualKgH.every(x => Math.abs(x) < 1e-7));
  return { thermodynamicTrialN: s.N, streams, residualKgH, componentResidualKgH };
});
const qTop = Math.max(...trials.map(t => t.streams.finalRaffinate.volumeProxyM3H));
const qBottom = Math.max(...trials.map(t => t.streams.finalExtract.volumeProxyM3H));
// Maxima across alternatives are a sizing envelope, NOT a mass-balanced single trial.
const Cd = re => re <= 1000 ? 24 / re * (1 + 0.15 * re ** 0.687) : 0.44;
function slip(d, p) {
  const dr = Math.abs(p.rhoD - p.rhoC);
  const ar = p.rhoC * dr * g * d ** 3 / p.muC ** 2;
  let lo = 1e-12, hi = 1e6;
  for (let i = 0; i < 110; i++) {
    const mid = Math.sqrt(lo * hi);
    if (Cd(mid) * mid ** 2 < 4 * ar / 3) lo = mid; else hi = mid;
  }
  const Re = Math.sqrt(lo * hi), velocityMS = Re * p.muC / (p.rhoC * d);
  const buoyancyN = Math.PI / 6 * d ** 3 * dr * g;
  const dragN = Cd(Re) * p.rhoC * velocityMS ** 2 * Math.PI * d ** 2 / 8;
  assert(Math.abs(dragN / buoyancyN - 1) < 1e-9);
  return { velocityMS, Re, Eo: dr * g * d * d / sigma,
    We: p.rhoC * velocityMS ** 2 * d / sigma, relativeForceResidual: dragN / buoyancyN - 1 };
}
function inverse(v, p) {
  let lo = 1e-7, hi = 0.05;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (slip(mid, p).velocityMS < v) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const sections = [];
for (const side of ['top', 'bottom']) {
  const p = properties[side], q = side === 'top' ? qTop : qBottom;
  for (const diameterM of [0.7, 0.9, 1, 1.2]) {
    const effectiveCalmHeightM = side === 'top' ? 0.7 : 0.5;
    const grossStraightHeightM = side === 'top' ? 1.6 : 1.2;
    const effectiveAreaM2 = area(diameterM) * 0.9; // selected 10% internals blockage
    const velocityMS = q / 3600 / effectiveAreaM2;
    const designVelocityMS = 1.2 * velocityMS;
    sections.push({ side, diameterM, grossStraightHeightM, effectiveCalmHeightM,
      effectiveAreaM2, netCalmVolumeM3: effectiveAreaM2 * effectiveCalmHeightM,
      nominalResidenceS: effectiveCalmHeightM / velocityMS,
      residenceAt120PercentS: effectiveCalmHeightM / designVelocityMS,
      velocityMS, designVelocityMS,
      neutralSizeMm: inverse(velocityMS, p) * 1000,
      sizeFor2xDesignSlipMm: inverse(2 * designVelocityMS, p) * 1000,
      coneAxialHeightM: (diameterM - 0.7) / (2 * Math.tan(Math.PI / 6)),
      sensitivities: [0.5, 1, 1.5, 2, 3].map(dmm => {
        const s = slip(dmm / 1000, p), net = s.velocityMS - designVelocityMS;
        return { independentTestDiameterMm: dmm, ...s,
          netReturnVelocityMS: net, crossingTimeS: net > 0 ? effectiveCalmHeightM / net : null,
          crossesCalmHeightWithinNominalDesignResidence: net >= designVelocityMS };
      }) });
  }
}
const returnChecks = ['top', 'bottom'].map(side => {
  const p = properties[side], q = (side === 'top' ? qTop : qBottom) * 1.2 / 3600;
  return { side, boundary: side === 'top' ? 'terminal stator, both faces and 700 mm throat' :
    'lower phase interface and first active compartment; bottom plate free fraction provisional',
  planes: [1, 0.4].map(openFraction => {
    const u = q / (area(0.7) * openFraction);
    return { openFraction, carrierVelocityMS: u, neutralSizeMm: inverse(u, p) * 1000,
      twiceCarrierSizeMm: inverse(2 * u, p) * 1000 };
  }),
  diluteCapacitySensitivities: [0.5, 1, 1.5, 2, 3].flatMap(dmm => [0.01, 0.05].map(alpha => {
    const a = area(0.7) * 0.4, u = q / (a * (1 - alpha));
    const vt = slip(dmm / 1000, p).velocityMS;
    return { dmm, assumedAlpha: alpha, velocityMS: u,
      eligibleCountercurrentM3H: a * alpha * Math.max(vt - u, 0) * 3600 };
  })) };
});
const propertySensitivity = ['top', 'bottom'].flatMap(side =>
  [0.7, 1, 1.3].flatMap(muFactor => [0.8, 1, 1.2].map(deltaDensityFactor => {
    const p = properties[side], modified = { ...p, muC: p.muC * muFactor,
      rhoD: p.rhoC + (p.rhoD - p.rhoC) * deltaDensityFactor };
    const s = sections.find(x => x.side === side && x.diameterM === (side === 'top' ? 1 : 0.9));
    return { side, muFactor, deltaDensityFactor,
      sizeFor2xDesignSlipMm: 1000 * inverse(2 * s.designVelocityMS, modified) };
  })));
// ASME B36.10M nominal Schedule 40 dimensions, assumed carbon-steel pipe bores.
// No corrosion allowance/lining deduction; material, pressure class, wall schedule not selected.
const pipes = [{ DN: 25, odMm: 33.4, wallMm: 3.38 }, { DN: 40, odMm: 48.3, wallMm: 3.68 },
  { DN: 50, odMm: 60.3, wallMm: 3.91 }, { DN: 65, odMm: 73, wallMm: 5.16 },
  { DN: 80, odMm: 88.9, wallMm: 5.49 }, { DN: 100, odMm: 114.3, wallMm: 6.02 }]
  .map(p => ({ ...p, boreMm: p.odMm - 2 * p.wallMm }));
const duties = [
  { tag: 'P01', service: 'RRBO feed', side: 'bottom', qM3H: 4, rho: 869, mu: 0.0598, selectedDN: 65 },
  { tag: 'P02', service: 'extract outlet', side: 'bottom', qM3H: qBottom, rho: 1015, mu: 0.001416, selectedDN: 50 },
  { tag: 'P03', service: 'fresh wet NMP feed', side: 'top', qM3H: feeds.solventM3H, rho: 1015, mu: 0.001416, selectedDN: 50 },
  { tag: 'P04', service: 'raffinate outlet', side: 'top', qM3H: qTop, rho: 869, mu: 0.0598, selectedDN: 65 },
];
const nozzles = duties.map(duty => ({ ...duty,
  requiredBoreAt120PercentAnd05MSMm: 1000 * Math.sqrt(4 * 1.2 * duty.qM3H / 3600 / (Math.PI * 0.5)),
  candidates: pipes.filter(p => p.DN >= 40 && p.DN <= 80).map(p => {
    const d = p.boreMm / 1000, a = area(d), v = duty.qM3H / 3600 / a, vd = 1.2 * v;
    const Re = duty.rho * vd * d / duty.mu, roughnessM = 0.000045;
    const f = Re < 2300 ? 64 / Re :
      0.25 / Math.log10(roughnessM / (3.7 * d) + 5.74 / Re ** 0.9) ** 2;
    const dynamicPressurePa = duty.rho * vd * vd / 2;
    return { DN: p.DN, boreMm: p.boreMm, areaM2: a, nominalVelocityMS: v,
      designVelocityMS: vd, Re, DarcyFrictionFactor: f,
      regime: Re < 2300 ? 'laminar' : Re < 4000 ? 'transition: f uncertain' : 'turbulent',
      momentumForceN: duty.rho * (1.2 * duty.qM3H / 3600) * vd,
      dynamicPressurePa, assumedNeckLengthM: 0.3,
      straightNeckLossPa: f * 0.3 / d * dynamicPressurePa,
      assumedK3LocalLossPa: 3 * dynamicPressurePa,
      assumedK1to10TotalLossPa: [1, 10].map(k => (f * 0.3 / d + k) * dynamicPressurePa),
      selected: p.DN === duty.selectedDN };
  }) }));
const distributorAllowances = duties.filter(d => d.service.includes('feed')).map(d => {
  const totalOpenAreaM2 = 1.2 * d.qM3H / 3600 / 0.1;
  return { service: d.service, assumedExitVelocityMS: 0.1, totalOpenAreaM2,
    equivalentOpenDiameterMm: 1000 * Math.sqrt(4 * totalOpenAreaM2 / Math.PI),
    holeCountIf10mm: Math.ceil(totalOpenAreaM2 / area(0.01)),
    dynamicPressurePa: d.rho * 0.1 ** 2 / 2 };
});
// Physical-only accounting: B is carrier-product mass (not a measured solvent-free assay).
// r = gross terminal physical-NMP upcrossing mass/B, beta = eligible flux fraction,
// gamma = fraction of eligible mass actually returning across LOWER plate face.
const performance = [0.02, 0.1, 0.25].flatMap(r =>
  [0, 0.5, 0.9].flatMap(beta => [0, 0.5, 1].map(gamma => {
    const returned = r * beta * gamma, outgoing = r - returned, inventoryRate = r - returned - outgoing;
    assert(Math.abs(inventoryRate) < 1e-12);
    const physicalNmpWtPercent = 100 * outgoing / (1 + outgoing);
    return { assumedGrossLoadingKgPerKgCarrier: r, assumedEligibleFluxFraction: beta,
      assumedActualReturnFractionOfEligible: gamma, returnedKgPerKgCarrier: returned,
      physicalOutletKgPerKgCarrier: outgoing, normalizedInventoryRate: inventoryRate,
      physicalNmpWtPercent, below5: physicalNmpWtPercent < 5,
      requiredOverallReturnFractionForStrict5: Math.max(0, 1 - 1 / (19 * r)) };
  })));
const result = { status: 'PRELIMINARY_CONDITIONAL_LAYOUT_AND_NOZZLES; CAPTURE/RETURN/FABRICATION HOLD',
  geometryDecision: { selectedEndGeometry: null,
    comparisonOnly: true, calmHeightsAreArbitraryAllowancesNotCalculatedOptima: true,
    topSelectionRequiresStage20BoundaryAndReturnClosure: true,
    retainedBottomNeck: { diameterM: 0.7, heightM: 0.3 },
    overallVesselHeightM: null, reasonNoTotal: 'Retained axial-stack ledger not closed; no neck deletion authorized.' },
  sourceHashes: before, frozenActive: fixed, feeds, properties, trials,
  sizingEnvelope: { topM3H: qTop, bottomM3H: qBottom, designRateMultiplier: 1.2,
    warning: 'Independent scenario maxima, not one balanced operating case; physical reflux not established.' },
  sections, returnChecks, propertySensitivity, pipes, nozzles, distributorAllowances, performance,
  physicalOnlyCarrierProxy: trials.map(t => ({ trialN: t.thermodynamicTrialN,
    carrierProxyKgH: t.streams.finalRaffinate.massKgH,
    strict5PercentMaximumDispersedNmpKgH: t.streams.finalRaffinate.massKgH / 19 })),
  checks: { totalAndComponentMassBalances: true, forceBalances: true, activeGeometry: true,
    sourceHashesUnchanged: sources.every(p => hash(p) === before[p]) } };
assert(result.checks.sourceHashesUnchanged);
const n = (x, digits = 3) => x == null ? '—' : Number(x).toFixed(digits);
const table = (heads, rows) => `| ${heads.join(' | ')} |\n| ${heads.map(() => '---').join(' | ')} |\n` +
  rows.map(r => `| ${r.join(' | ')} |`).join('\n');
const selectedTop = sections.find(s => s.side === 'top' && s.diameterM === 1);
const selectedBottom = sections.find(s => s.side === 'bottom' && s.diameterM === 0.9);
const report = `# Both physical end sections — preliminary sizing and nozzle calculations

**${result.status}**

Run offline: \`node deliverables/end-sections-sizing.mjs\`. SI calculations; displayed flows m³/h, dimensions explicitly labeled. The JSON contains complete numerical results, force/mass checks, sensitivity cases and source SHA-256 hashes. No database, app, saved geometry, or existing deliverable is edited. No CFD rerun.

## Decision and scope

**No enlarged top or final end-section geometry is selected or carried forward.** Top Ø1000 ×1600 mm straight and bottom Ø900 ×1200 mm straight are illustrative comparison geometries only, not qualified minimum diameters or proven separation duties. Top reference Ø700 ×1600 is not governing; bottom reference Ø900 ×1200 is independently screened below. Compare Ø700/900/1000/1200 without asserting enlargement cures carryover. The 700-mm top and 500-mm bottom effective calm heights are arbitrary disclosed comparison allowances, not calculated requirements or optima. Establish the frozen Stage20 boundary and terminal/return closure before selecting an enlarged top. Frozen active section: Ø700, 20 ×210 mm =4200 mm, rotor Ø231, 30 rpm, Np=1.2. No active geometry or Stage-2 thermodynamics is reopened.

Top candidate provides ${n(selectedTop.residenceAt120PercentS)} s calm residence at 120% proxy flow and a local 2×velocity slip threshold ${n(selectedTop.sizeFor2xDesignSlipMm)} mm. Bottom independently provides ${n(selectedBottom.residenceAt120PercentS)} s and ${n(selectedBottom.sizeFor2xDesignSlipMm)} mm for **RRBO drops in NMP-rich liquid**, not inherited NMP d32. Those are inverse hydraulic requirements, not measured capture sizes. The old bottom 900×1200 reservation arose from an assumed 200-µm / 0.5-factor screen, not an actual oil PSD; that assumed duty is not adopted here. No scientifically supported unique final diameter/height or predicted actual removal follows from the available outlet DSD, loading and return evidence. The conditional performance calculation below states exactly what would be needed for <5 wt% physical dispersed NMP.

## Read-only flow authority

Input: existing preliminary-calculation.input.json; original audit binds Stage-3 ledger 69, Stage-4 row17 and Stage-5 revision6. Stage-4 independently adopts 7 theoretical/20 physical stages but its Stage-2 link is NULL. Existing thermodynamic N4 and N7 trials are **alternative boundary scenarios**, not Stage20 outlet DSDs. No automatic binding of N7 is made. A balanced calculation is retained for each; envelope maxima use N4 top and N7 bottom and must not be summed as one operating point.

Oil feed=3476 kg/h=4 m³/h; fresh wet NMP=2085.6 kg/h=${n(feeds.solventM3H,6)} m³/h. S/O=0.6 **mass**. Normalized source streams oil=100, solvent=60 are scaled by 34.76 kg/h per source mass unit. Components are saturates/mono/di/poly/polar/NMP/water. Every component balance and total balance closes within 1e-7 kg/h.

${table(['Trial','Raff kg/h','Raff m³/h proxy','Extract kg/h','Extract m³/h proxy','Mass residual kg/h'], trials.map(t => [t.thermodynamicTrialN,n(t.streams.finalRaffinate.massKgH),n(t.streams.finalRaffinate.volumeProxyM3H,6),n(t.streams.finalExtract.massKgH),n(t.streams.finalExtract.volumeProxyM3H,6),t.residualKgH.toExponential(2)]))}

Outlet volumes are m/rho proxies, not composition-resolved measurements. 40°C basis: RRBO 869 kg/m³, μ=0.0598 Pa·s; wet NMP1015 kg/m³, μ=0.001416 Pa·s; σ=.011 N/m. For bottom, invert carrier/drop properties: carrier1015/.001416 and drop869/.0598. Mixture properties and contaminated-interface mobility remain unqualified. JSON sweeps carrier viscosity ±30% and density contrast ±20%, as engineering sensitivities, not confidence limits. Physical droplet recycle is not added to plant outlet mass flows without a closed local inventory.

## Slip, volume and residence

Immobile spherical Schiller–Naumann screening: Cd=24/Re(1+.15Re^.687) for Re≤1000, else .44; solve Cd Re²=4Ar/3, Ar=ρc|Δρ|gd³/μc². vt=Re μc/(ρc d); force residual independently checked. Eo and We exported per test size; large/deformed drops and concentrated swarms are not qualified by this relation. Opposite rise/settle direction is explicit. No d32 transfer to bottom, no coalescence credit.

Selected effective area=.9πD²/4 (10% assumed internals blockage); U=Q/Aeff; Vcalm=Aeff Hcalm; τ=Vcalm/Q. Design-rate sensitivity=1.2Q, not an inherited flow guarantee. Neutral diameter solves vt=U; chosen 2×design-slip margin solves vt=2Udesign, so an ideal drop can traverse Hcalm in τdesign. Height increases inventory and time but does not change the velocity threshold. There is no validated residence requirement to optimize height.

${table(['Side','D mm','H calm mm','U design mm/s','τ nominal s','τ design s','Neutral nominal mm','2×design slip mm'],sections.map(s => [s.side,n(s.diameterM*1000,0),n(s.effectiveCalmHeightM*1000,0),n(s.designVelocityMS*1000),n(s.nominalResidenceS),n(s.residenceAt120PercentS),n(s.neutralSizeMm),n(s.sizeFor2xDesignSlipMm)]))}

### Illustrative geometry local drop tests (independent test sizes, NOT actual DSD)

${table(['Side','Test d mm','vt mm/s','Re','Eo','We','Net return mm/s','Calm crossing s'],[selectedTop,selectedBottom].flatMap(s=>s.sensitivities.map(d=>[s.side,d.independentTestDiameterMm,n(d.velocityMS*1000),n(d.Re),n(d.Eo),n(d.We),n(d.netReturnVelocityMS*1000),n(d.crossingTimeS)])))}

## Arrangement, anti-swirl and transitions

All arrangement dimensions below describe illustrative comparisons only. “Candidate,” “proposed,” and allowance language does not select a top diameter, authorize geometry changes, or establish an optimized calm height. Preliminary process-nozzle selections remain distinct from this unresolved end-section geometry.

Top datum is **upper terminal plate face**, not active-top center plane: existing evidence places the face 2 mm above nominal active-top. Proposed straight stack above enlarged-cone exit: 0–250 mm calming/anti-swirl and isolated downward NMP distributor; 250–950 mm effective quiet; 950–1200 mm baffled lateral raffinate withdrawal; 1200–1600 mm level/control/support/top-clearance allowance. Do not count cone/head/outlet band as calm volume. Candidate cone from Ø700 to1000 at selected 30° wall-to-axis angle adds ${n(selectedTop.coneAxialHeightM*1000,1)} mm separately. Four stationary radial anti-swirl vanes and a low-momentum feed shield are conceptual allowances; no decay coefficient or removal efficiency is asserted. Keep final rotor/stator untouched; reconcile existing shaft support that intrudes near z350 mm. Full-bore effective-area and local opening velocities are different.

Bottom, independently, use 0–250 mm sump/outlet protection, 250–750 mm effective NMP-rich calm liquid, 750–1000 mm interface operating band, 1000–1200 mm oil-feed/internals allowance (datum lower straight tangent). RRBO rises through the interface; extract withdraws below it through a baffled outlet. Oil feed requires a low-shear distributor into the intended RRBO region, shielded from the extract takeoff. The lower enlarged transition to Ø700 is separate: ${n(selectedBottom.coneAxialHeightM*1000,1)} mm at 30°. Exact feed/interface elevations need phase inventory and level-control qualification; the proposed calm volume presumes the full 500 mm remains below the minimum interface. No RRBO nozzle is moved to the top and no NMP feed is moved to the bottom.

No overall vessel height or combined axial-stack total is asserted: the full retained-geometry ledger is not closed. In particular, retain the existing Ø700 ×300-mm bottom neck; this exercise does not authorize deleting or replacing it. Cone dimensions above are isolated illustrative geometric increments only; their integration with the retained neck, heads, terminal datums, supports and access must be reconciled before any total-height calculation.

## Return hydraulics: local settling is not collection

${table(['Side','Available area fraction','Carrier @120% mm/s','Neutral size mm','2×carrier size mm'],returnChecks.flatMap(r=>r.planes.map(p=>[r.side,p.openFraction,n(p.carrierVelocityMS*1000),n(p.neutralSizeMm),n(p.twiceCarrierSizeMm)])))}

The 700-mm throat and 40% plate openings remain stronger constraints than enlarged calm area. Bottom 40% is only a inherited common-stator screen, not a verified interface aperture. JSON also tabulates dilute return capacity Qd=Aopen α max(vt−Qc/[Aopen(1−α)],0) for **assumed** α=.01/.05 and independent sizes. This is a mean-flow eligibility estimate, not countercurrent flooding qualification or actual plate transmission. Fresh solvent ${n(feeds.solventM3H)} m³/h must also reach the active section; it cannot be claimed accommodated by the dilute terminal-droplet-return calculation. Terminal-origin recycled solvent is additional local traffic, not a second plant feed.

Keep the final rotor compartment, actual plate thickness/openings and both faces in the required domain. Gross Stage20 upcrossing, return across the **lower** face, fresh distributor source and outlet must be source-labelled. Jet decay can create a trapping surface: upper-face settling eligibility or contact is not lower-face return. Neither enlarging top nor assigning longer residence demonstrates cross-stream transport into a closed return path. Do not credit draining films, coalescence, a downcomer or a guard separator without loading, wetting, pressure and collection qualification. No such equipment is selected here.

## Process nozzles — actual assumed pipe bores, not D/10

ASME B36.10M nominal Schedule40 OD/wall dimensions assumed for carbon steel; ID=OD−2t, no lining/corrosion deduction. This is a bore calculation only: metallurgy, nozzle neck wall, flange class and reinforcement remain HOLD. Criteria selected for preliminary liquid nozzles: velocity≤0.5 m/s at 120% flow, then shield/diffuse feed jets. Not a universal standard limit.

${table(['Tag/service/location','DN selected','ID mm','Q nominal m³/h','v nominal m/s','v design m/s','Re design','Jet momentum N','Δp neck Pa','Δp K=3 Pa'],nozzles.map(d=>{const p=d.candidates.find(x=>x.selected);return [d.tag+' '+d.service+' / '+d.side,p.DN,n(p.boreMm,2),n(d.qM3H),n(p.nominalVelocityMS),n(p.designVelocityMS),n(p.Re,0),n(p.momentumForceN),n(p.straightNeckLossPa),n(p.assumedK3LocalLossPa)];}))}

### DN80 alternative, explicitly calculated

DN80 Schedule40 is OD88.90 × wall5.49 mm, **ID77.92 mm**, not the saved70-mm drawing allowance. DN65 is ID62.68 mm and DN50 ID52.48 mm. DN80 is a feasible lower-velocity alternative on all four duties, not required by the selected 0.5-m/s criterion.

${table(['Service','DN80 area m²','v nominal m/s','v design m/s','Re design','Neck + K3 Δp Pa','Momentum design N'],nozzles.map(d=>{const p=d.candidates.find(x=>x.DN===80);return[d.service,n(p.areaM2,6),n(p.nominalVelocityMS),n(p.designVelocityMS),n(p.Re,0),n(p.straightNeckLossPa+p.assumedK3LocalLossPa),n(p.momentumForceN)];}))}

All DN40/50/65/80 alternatives, minimum required bores and loss ranges are in JSON. Δp=(f L/ID+K)ρv²/2, L=.3m neck selected; f=64/Re laminar, otherwise Swamee–Jain roughness45μm (transition explicitly uncertain). K=3 is an illustrative combined entrance/turn-in/exit allowance, **not a measured fitting or distributor coefficient**; K1–10 range exported. Loss excludes piping, valves, elevation, feed-distributor restriction and outlet hydrostatic balance. Existing pressure field “2.0” has no qualified boundary interpretation here; no pump head, pressure differential or flange rating is inferred. Net pressures at both sides and levels must be supplied.

At equal Q, inlet force ρQv and dynamic pressure quantify jet scales, not penetration distance or turbulence. Low-velocity distributor selections:

${table(['Feed','Assumed exit m/s','Required open area m²','Equivalent open diameter mm','10-mm hole count example','Dynamic pressure Pa'],distributorAllowances.map(d=>[d.service,d.assumedExitVelocityMS,n(d.totalOpenAreaM2,5),n(d.equivalentOpenDiameterMm,1),d.holeCountIf10mm,n(d.dynamicPressurePa)]))}

Hole count is an **area equivalent only**, not an approved perforation pattern. Uniform distribution, blockage/fouling, jet breakup and minimum distributor Δp are not established; oil viscosity can govern. P03 discharges downward below/protected from the top calm zone; P01 avoids sending feed oil directly to bottom extract. P04/P02 use baffles or distributed takeoff to avoid local aspiration. Selected bores differ from prior nominal70-mm drawing holes; drawings remain unchanged.

### Auxiliary openings (engineering allowances, NOT process/relief sizing)

| Service | Preliminary allowance | Location / qualification |
|---|---|---|
| Normal vent / pressure equalization | DN25 Sch40 ID26.64 mm each, separate functions if required | Highest top point; gas blanketing/normal vent rate unknown. Not a PSV. Separate relief/vacuum study required. |
| Bottom drain | DN40 Sch40 ID40.94 mm | Lowest bottom head, full-drain geometry; drain time, containment/backpressure and viscous emptying not rated. |
| Flush/cleaning | DN25 Sch40 ID26.64 mm | Bottom, optional additional top wash; cleaning rate/chemistry unassigned. |
| Sample | DN15 nominal, two | Top raffinate and bottom extract; tubing bore/valve TBD, no hydraulic duty assigned. |
| Pressure / temperature | DN25 nominal ports as required on each section | Instrument connection and intrusion TBD; no invented instrument flow. |
| Level / interface | Two DN25 nominal tappings per external chamber, or vendor-selected in-situ port | Top operating level and bottom interface, plus independent alarms; levels/technology not qualified. |
| Manway | DN450 nominal clear-opening target on each enlarged section | No Schedule40 “bore” claim; access, shaft withdrawal, reinforcement, ligament and clash check required. Not credited in calm volume. |

No separate dedicated solvent return nozzle is asserted: current candidate relies on internal return, still HOLD. If a collected-liquid return line later becomes necessary, size it from proven recycle and pressure balance; P03 is fresh feed, not an assumed drain return.

## Physical NMP target and honest conditional prediction

Define B=carrier raffinate product mass excluding **the additional physically dispersed NMP cohort being tracked**. Do not reinterpret saved thermodynamic NMP component masses as free droplets. For rough dimensional scaling only, use the saved bulk raffinate mass as B proxy; exact cohort carrier mass must ultimately be established, without reopening Stage2.

Let r=physical terminal-origin gross upcrossing mass/B, β=eligible fraction of that **one-way flux**, γ=actual lower-face-return fraction of eligible mass. No coalescence credit. For steady bounded inventory, E/B=r(1−βγ), return/B=rβγ, dI/dt=0, and physical wt%=100E/(B+E). This is an algebraic conditional prediction with explicitly prescribed return, not a geometry-derived capture efficiency. The accepted target is **strictly <5 wt%**, therefore E/B<1/19 and βγ>1−1/(19r) when r≥1/19. It is physical dispersed-NMP performance only, not newly established total-composition compliance. Fresh distributor leakage, if any, must be tracked as a separate cohort and added to E; zero leakage is not demonstrated.

${table(['Gross r kg/kg B','β eligible','γ actually returned','Physical outlet wt%','<5% conditional'],performance.filter(p=>p.assumedEligibleFluxFraction===0.9).map(p=>[p.assumedGrossLoadingKgPerKgCarrier,p.assumedEligibleFluxFraction,p.assumedActualReturnFractionOfEligible,n(p.physicalNmpWtPercent),p.below5?'yes':'no']))}

At r=.10, actual overall return must exceed ${n(100*(1-1/1.9))}%; at r=.25 it must exceed ${n(100*(1-1/4.75))}%. With β=.9 and γ=1, predicted physical outlet is ${n(100*.01/1.01)}% for r=.10; with no proved return (γ=0), it is ${n(100*.1/1.1)}%. These are **what-if load/return cases**, not expected operation. Saved raffinate B proxies yield allowable added dispersed NMP <${n(Math.min(...result.physicalOnlyCarrierProxy.map(x=>x.strict5PercentMaximumDispersedNmpKgH)))} to <${n(Math.max(...result.physicalOnlyCarrierProxy.map(x=>x.strict5PercentMaximumDispersedNmpKgH)))} kg/h; this is a target translation, not measured entrainment.

A droplet indefinitely retained in the calm zone is not removed at steady state. Unresolved inventory accumulation/contact cannot be assigned to return to improve this table. Actual DSD/alpha and spatial one-way crossing flux are missing, so β and γ cannot presently be calculated from diameter. The inherited 6.068-mm active NMP mean and transferred donor widths establish neither. No 500-μm stress is selected as design duty. Bottom has no supplied oil-carryunder target or outlet RRBO DSD; its result remains an independently calculated inverse rise requirement, not an invented efficiency.

## Release gates

1. Bind one compatible saved outlet trial for duty (or approve envelope); obtain actual mixture properties and rate range.
2. Establish the same Stage20 boundary across top candidates: physical loading, source-labelled one-way outlet-flux DSD, spatial axial/radial/tangential velocities, pressure, and final rotor/plate two-face geometry.
3. Qualify anti-swirl decay, inlet/outlet short-circuiting, local coalescence efficiency at real loading, contact/wetting and actual lower-face return; close each cohort inventory at steady state. Coalescence redistributes mass, never deletes it.
4. Independently establish bottom RRBO drop population/loading, interface operating band, carryunder criterion and countercurrent return path. Do not transplant NMP d32.
5. Confirm distributor and nozzle pressure budgets, vent/relief/vacuum/blanket and drain duties; reconcile support/access/manway reinforcement and full pressure-vessel mechanical design.

**Completed now:** balanced source-scaled duties; reproducible independent top/bottom slip and inverse sizes; diameter/residence/cone candidates; frozen-throat/opening return screens; real-bore process nozzle alternatives, momentum and conditional losses; auxiliary allowances; physical-only loading/return target calculation. **Not claimed:** actual <5% performance, validated coalescence, fully closed return, final fabrication sizes, or pressure safety approval.
`;
fs.writeFileSync(`${prefix}.results.json`, JSON.stringify(result, null, 2) + '\n');
fs.writeFileSync(`${prefix}.md`, report);
console.log(JSON.stringify({ outputs: [`${prefix}.results.json`, `${prefix}.md`], checks: result.checks,
  top: selectedTop, bottom: selectedBottom }, null, 2));