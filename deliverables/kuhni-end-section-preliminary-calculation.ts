import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dragCoefficient } from '../server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1';

// Offline calculation only. No DB imports, network calls, upstream optimizer or state changes.
const stem = 'deliverables/kuhni-end-section-preliminary-calculation';
const inputPath = `${stem}.input.json`;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
if (!existsSync(inputPath)) {
  const raw = JSON.parse(readFileSync('/tmp/disengager-input-audit.json', 'utf8'));
  const s3 = raw.ecr_pre_pilot_kuhni_geometry_resolver_runs[0];
  const s4 = raw.ecr_pre_pilot_stage4_physical_sizing_calculations[0];
  const s2 = raw.ecr_pre_pilot_predictive_nt_jobs[0];
  const s5 = raw.ecr_pre_pilot_stage5_geometry_revisions[0];
  const selected = s4.result_snapshot.selectedStage3Hydraulics.automaticSelection.selected;
  const grid = s3.result_snapshot.result.orientationComparison
    .find((o: any) => o.orientation === 'rrbo-continuous-nmp-dispersed').geometryGrid
    .find((r: any) => Math.abs(r.geometry.columnDiameterM - .7) < 1e-12
      && r.geometry.rotorToColumn === .33 && r.geometry.hcToColumn === .3 && r.geometry.freeArea === .4);
  const input = {
    provenance: { source: 'Owner-scoped development DB BEGIN READ ONLY audit, 2026-09-21',
      designId: raw.design.id, projectNumber: raw.design.project_number,
      stage1Hash: raw.design.input_data.immutableHash,
      stage2JobId: s2.id, stage2SourceHash: s2.input_snapshot.stage1Authority.source.immutableHash,
      stage2PredictiveNt: s2.result_snapshot.predictiveNt, stage2ReleaseEligible: s2.result_snapshot.releaseEligible,
      stage2Stage1InputDifferences: Object.keys(s2.input_snapshot.stage1Authority.source.stage1).filter(k =>
        JSON.stringify(s2.input_snapshot.stage1Authority.source.stage1[k]) !== JSON.stringify(raw.design.input_data.stage1[k])),
      stage3Id: s3.id, stage3Hash: s3.immutable_hash, stage4Id: s4.id,
      stage4Stage2JobId: s4.stage2_job_id, stage5Revision: s5.revision,
      stage5Hash: s5.immutable_hash,
      dragSourceSha256: sha(readFileSync('server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts', 'utf8')) },
    stage1: raw.design.input_data.stage1, processBasis: s3.process_basis,
    selected, stage4: s4.result_snapshot.hetsSizing,
    boundaryScenarios: [4, 7].map(N => {
      const trial = s2.result_snapshot.trials.find((t: any) => t.stageCount === N);
      return { N, accepted: trial.accepted, streams: trial.boundaryStreams };
    }),
    rpmSensitivity: grid.trials.map((t: any) => ({ rpm: t.rpm, d32M: t.d32M,
      loading: t.actualLoading, hydraulicPass: t.hydraulicPass })),
    stage5: { dimensions: s5.snapshot.geometry.dimensions, nozzles: s5.snapshot.geometry.nozzles },
  };
  writeFileSync(inputPath, JSON.stringify(input, null, 2));
}
const inputText = readFileSync(inputPath, 'utf8');
const input = JSON.parse(inputText);
if (sha(readFileSync('server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts', 'utf8'))
  !== input.provenance.dragSourceSha256) throw Error('Drag source changed: explicit review required');
if (input.provenance.designId !== 269 || Number(input.provenance.projectNumber) !== 236
  || input.selected.geometry.columnDiameterM !== .7) throw Error('Frozen authority mismatch');
const gravity = 9.80665, fraction = .5, diameter = .7, area = Math.PI * diameter ** 2 / 4;
type Phase = { name: string; rhoC: number; rhoD: number; muC: number; muD: number; sigma: number };
const b = input.processBasis;
const top: Phase = { name: 'NMP drops / RRBO continuous', rhoC: b.rrboFeed.densityKgM3,
  rhoD: b.wetSolventPhase.densityKgM3, muC: b.rrboFeed.dynamicViscosityPaS,
  muD: b.wetSolventPhase.dynamicViscosityPaS, sigma: b.interfacialTensionNM };
const bottom: Phase = { name: 'RRBO drops / NMP-rich continuous', rhoC: top.rhoD, rhoD: top.rhoC,
  muC: top.muD, muD: top.muC, sigma: top.sigma };
function bisect(fn: (x: number) => number, lo: number, hi: number) {
  if (!(fn(lo) <= 0 && fn(hi) >= 0)) throw Error('Unbracketed monotone root');
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
function terminal(d: number, p: Phase) {
  if (!(d > 0)) throw Error('Invalid droplet size');
  const dr = Math.abs(p.rhoD - p.rhoC);
  const ar = p.rhoC * dr * gravity * d ** 3 / p.muC ** 2;
  const cd = (re: number) => dragCoefficient(re, p.muD / p.muC, p.rhoD / p.rhoC, 'SCHILLER_NAUMANN_IMMOBILE');
  let upper = 1;
  while (cd(upper) * upper ** 2 < 4 / 3 * ar) upper *= 2;
  const re = bisect(r => cd(r) * r ** 2 - 4 / 3 * ar, 1e-25, upper);
  const vt = re * p.muC / (p.rhoC * d);
  const buoyancyN = Math.PI / 6 * d ** 3 * dr * gravity;
  const dragN = .5 * p.rhoC * cd(re) * Math.PI / 4 * d ** 2 * vt ** 2;
  return { d, vt, re, cd: cd(re), ar, eo: dr * gravity * d ** 2 / p.sigma,
    we: p.rhoC * vt ** 2 * d / p.sigma, residualN: buoyancyN - dragN };
}
function critical(q: number, D: number, p: Phase) {
  const U = q / (Math.PI * D ** 2 / 4);
  const d = bisect(d => terminal(d, p).vt - U / fraction, 1e-8, .1);
  return { ...terminal(d, p), D, U, q, requiredTerminal: U / fraction };
}
function size(q: number, drop: ReturnType<typeof terminal>) {
  const U = q / area, allowable = fraction * drop.vt, requiredArea = q / allowable;
  return { U, allowable, requiredArea, requiredDiameter: Math.sqrt(4 * requiredArea / Math.PI),
    marginRatio: allowable / U, marginPct: (allowable / U - 1) * 100,
    utilization: U / allowable, netSpeed: drop.vt - U, pass: U <= allowable };
}
const feedKgH = input.stage1.designFeedRateLph / 1000 * top.rhoC;
const topDrop = terminal(input.selected.trial.d32M, top);
const savedVt = input.selected.trial.hydraulicMethod.governing.terminalSpeedMS;
if (Math.abs(topDrop.vt - savedVt) > 1e-12) throw Error('Saved terminal speed not reproduced');
const scenarios = input.boundaryScenarios.map((s: any) => {
  const scale = feedKgH / s.streams.oilFeed.mass;
  const mass = Object.fromEntries(Object.entries(s.streams).map(([k, v]: [string, any]) => [k, v.mass * scale])) as Record<string, number>;
  const closure = mass.oilFeed + mass.freshWetSolvent - mass.finalRaffinate - mass.finalExtract;
  if (Math.abs(closure) > 1e-8) throw Error('Plant mass balance failure');
  const qTop = mass.finalRaffinate / top.rhoC / 3600;
  const qBottom = mass.finalExtract / bottom.rhoC / 3600;
  const sizes = [50, 100, 200, 300, 500, 1000].map(um => {
    const drop = terminal(um * 1e-6, bottom);
    return { um, drop, ...size(qBottom, drop) };
  });
  return { N: s.N, mass, scale, closure, qTop, qBottom,
    top: size(qTop, topDrop), topCut: critical(qTop, diameter, top),
    bottomCut: critical(qBottom, diameter, bottom), bottomGrid: sizes,
    bottomDiameterCases: [.7, 1, 1.2].map(D => critical(qBottom, D, bottom)),
    componentsKgH: Object.fromEntries(Object.entries(s.streams).map(([k, v]: [string, any]) =>
      [k, v.componentMass.map((x: number) => x * scale)])) };
});
for (const s of scenarios) {
  for (const d of [topDrop, s.topCut, s.bottomCut, ...s.bottomGrid.map((x: any) => x.drop)]) {
    if (Math.abs(d.residualN) > 1e-12) throw Error('Force balance failure');
  }
  if (Math.abs(s.bottomCut.vt - 2 * s.bottomCut.U) > 1e-12) throw Error('Critical root failure');
}
const results = { inputSha256: sha(inputText), gravity, fraction, diameter, area, top, bottom,
  topDrop, savedVt, feedKgH, scenarios, checks: {
    noDatabaseDependency: true, massClosureToleranceKgH: 1e-8, forceResidualToleranceN: 1e-12,
    selectedTerminalReproductionToleranceMS: 1e-12, allChecksPass: true } };
writeFileSync(`${stem}.results.json`, JSON.stringify(results, null, 2));
const f = (n: number, digits = 6) => n.toFixed(digits);
const p = (n: number) => f(100 * n, 2);
const table = (heads: string[], rows: (string | number)[][]) =>
  `| ${heads.join(' | ')} |\n| ${heads.map(() => '---').join(' | ')} |\n${rows.map(r => `| ${r.join(' | ')} |`).join('\n')}\n`;
const section: string[] = [];
section.push(`# Kühni end sections — preliminary engineering calculation

Project 236 · Design 269 · Frozen active ID 700 mm · Offline snapshot 2026-09-21

**CONDITIONAL SCREENING ONLY — NOT FOR FABRICATION. Final top and bottom hydraulic approval and mechanical geometry remain HOLD.**

## 1. Engineering conclusion

The straight 700-mm shell passes the assumed 50%-of-isolated-terminal-speed screen for the selected top NMP mean drop in both unbound outlet scenarios. This is not a proven entrainment-removal efficiency: the mean drop is not the lower-tail capture size, and its Eötvös number ${f(topDrop.eo, 3)} leaves spherical-drop drag applicability unresolved.

At the bottom, a 700-mm shell meets the same screen only if the RRBO capture diameter is at least ${f(scenarios[0].bottomCut.d * 1e6, 1)} µm (N4) or ${f(scenarios[1].bottomCut.d * 1e6, 1)} µm (N7), under the stated phase-property and immobile-interface assumptions. No RRBO entrained-drop size or carryover loading is established. Therefore neither straight-shell acceptance nor enlargement selection is justified.

**Geometry summary: top 700-mm ID candidate × height HOLD → active ECR 700-mm ID × 4200-mm active height → bottom 700-mm ID conditional candidate × height HOLD.** No end diameter, end height, transition, interface elevation or nozzle arrangement is frozen by this report.

## 2. Authority, classifications and assumptions

- INHERITED: current Stage-1 snapshot ${input.provenance.stage1Hash}; Stage-3 ledger ${input.provenance.stage3Id}; Stage-4 row ${input.provenance.stage4Id}; Stage-5 revision ${input.provenance.stage5Revision}. Rotor 231 mm, pitch 210 mm, stator free area 0.4, selected 30 rpm. Active diameter is frozen, not optimized here.
- INHERITED: physical design N_T=7 is independently adopted; efficiency 0.35 yields 20 compartments and 4.2-m active height. It does not select a thermodynamic boundary trial.
- UNBOUND SCENARIOS: Stage-2 job ${input.provenance.stage2JobId} predicts N_T=4; its accepted N=4 and N=7 trials are both evaluated, neither promoted to downstream authority. Stage-4's Stage-2 link is NULL. All source Stage-1 input fields match current values, but Stage-2 source hash ${input.provenance.stage2SourceHash} differs from current. Formal compatibility/boundary binding remains required. Stage-2 releaseEligible=false.
- ASSUMED: operating superficial velocity ≤ 0.50 × isolated terminal speed. This factor is a disclosed screening selection, NOT an established approved disengager criterion and NOT the active-section 70%-of-modeled-capacity criterion.
- ASSUMED: saved nominal feed/solvent properties proxy the outlet phases; dilute isolated drops, immobile spherical-interface Schiller–Naumann drag; no coalescence credit and no swarm/compartment-speed multiplier. No physical entrainment loading, interface inventory, residence-time criterion or minimum drop size is invented.
- CALCULATED: mass normalization, conditional volume flows, force-balance terminal speeds, superficial velocities, required areas/diameters and inverse critical capture sizes below.
- UNKNOWN: actual mixture properties, interface mobility, droplet deformation/shape applicability, exit drop distributions, entrainment concentrations and acceptable carryover. These prevent final release even where the numerical screen says PASS.

## 3. Process and physical-property inputs
`);
section.push(table(['Input', 'Value / lineage'], [
  ['Temperature', '40 °C = 313.15 K, persisted Stage 1'],
  ['RRBO feed / mass', `4000 L/h / ${f(feedKgH, 3)} kg/h`],
  ['Wet solvent', 'S/O=0.6 mass; 2085.6 kg/h; 2054.778325 L/h at 1015 kg/m³'],
  ['Wet composition', '99.5/0.5 wt% NMP/water; 2075.172 / 10.428 kg/h'],
  ['Top phase properties', 'Continuous RRBO: 869 kg/m³, 0.0598 Pa·s; dispersed NMP: 1015 kg/m³, 0.001416 Pa·s'],
  ['Bottom phase properties', 'Continuous NMP-rich: 1015 kg/m³, 0.001416 Pa·s; dispersed RRBO: 869 kg/m³, 0.0598 Pa·s'],
  ['Interfacial tension / density difference', '0.011 N/m / 146 kg/m³ magnitude; nominal proxies'],
  ['Gravity / active cross-section', `${gravity} m/s² / ${f(area, 10)} m²`],
]));
section.push(`Stage-1 UI property tables are the persisted nominal-property source: SN300 explicit 40 °C points and temperature-derived NMP data. They are not composition-dependent measurements of equilibrated product phases. No mixture-density, mixture-viscosity or composition-dependent interfacial-tension closure was added.

Stage-2 oil feed is normalized to mass 100 and wet solvent to mass 60. Plant normalization is 3476/100=34.76 kg/h per normalized mass unit. Q = mass flow / nominal phase density; m³/h divided by 3600 gives m³/s. Product volumes below are calculated proxies, not measured or composition-resolved outlet flows.
`);
section.push(table(['Unbound scenario', 'Raffinate kg/h', 'Extract kg/h', 'Raffinate L/h proxy', 'Extract L/h proxy', 'Total kg/h'], scenarios.map((s: any) =>
  [`N=${s.N}`, f(s.mass.finalRaffinate), f(s.mass.finalExtract), f(s.qTop * 3.6e6), f(s.qBottom * 3.6e6), f(s.mass.finalRaffinate + s.mass.finalExtract)])));
section.push(`Each scenario closes to 5561.6 kg/h total incoming and outgoing mass. Physical volume closure is not asserted because phase volume changes and mixing are not modeled.

Component flows (kg/h), normalized from saved boundary-stream component masses:
`);
section.push(table(['Scenario / stream', 'Saturates', 'Mono', 'Di', 'Poly', 'Polar', 'NMP', 'Water'], scenarios.flatMap((s: any) =>
  ['finalRaffinate', 'finalExtract'].map(k => [`N${s.N} ${k === 'finalRaffinate' ? 'raffinate' : 'extract'}`, ...s.componentsKgH[k].map((x: number) => f(x, 6))]))));
section.push(`The NMP in the equilibrium raffinate is dissolved solvent, not discrete settleable entrainment. Extract hydrocarbon components are likewise not an inventory of entrained RRBO drops. Neither N_T nor these outlet balances predicts physical carryover. Bulk fresh-solvent flow is not top entrained-solvent loading. Thus these continuous-stream estimates cannot establish actual two-phase end-zone inlet rates or return-flow capacity.

## 4. Equations and validity

F_b = (π/6)d³ |ρ_d−ρ_c| g; F_D = (1/2)ρ_c C_D (π/4)d² v_t²; set F_b=F_D.

Re = ρ_c v_t d / μ_c; Ar = ρ_c |ρ_d−ρ_c| g d³ / μ_c²; C_D Re² = 4Ar/3.

C_D = (24/Re)(1 + 0.15 Re^0.687), using the existing exported Schiller–Naumann immobile-interface drag implementation. Root solved by bracketed bisection, not a Stokes-only shortcut. Eo = |Δρ| g d²/σ; We = ρ_c v_t² d/σ.

For dilute opposing flow: U_c=Q_c/A; U_allow=f v_t with f=0.50; A_req=Q_c/(f v_t); D_req=√(4A_req/π); margin ratio=f v_t/U_c; net drop speed away from outlet=v_t−U_c. Screen PASS means ratio≥1. Margin percent=(ratio−1)×100, not a statistical confidence measure.

Critical size at a candidate diameter solves v_t(d_crit)=U_c/f=2U_c. These equations assume the volume proxy, dilute isolated drops and uniform axial flow; inlet jets, recirculation, finite holdup and nonuniform withdrawal can invalidate this simplification. Small Re/Eo supports, but does not prove, spherical/immobile applicability. Numerical force-balance closure is not empirical model validation.

## 5. TOP RAFFINATE calculation card

Continuous phase: upward RRBO-rich raffinate. Discrete dispersed phase: NMP drops settling downward. Selected active-compartment d32 is ${f(topDrop.d * 1000, 6)} mm at 30 rpm, from d32=C32(σ/ρ_c)^0.6 ε^−0.4 with governing C32=0.36. ε=(P/V)/ρ_c; P=Np ρ_c N³ D_r⁵; adopted Np=1.2 remains unchanged. The separate sourcePowerNumber=1.669310828 in the active characteristic-speed correction is not substituted for Np.

Recomputed isolated terminal speed=${f(topDrop.vt, 9)} m/s exactly reproduces the persisted value within 10⁻¹² m/s. Re=${f(topDrop.re, 6)}, Eo=${f(topDrop.eo, 6)}, We=${f(topDrop.we, 6)}. Allowed superficial velocity under the explicit assumption is ${f(fraction * topDrop.vt, 9)} m/s. This is not the saved compartment characteristic speed or swarm slip.
`);
section.push(table(['Result at 700 mm', 'N4 unbound', 'N7 unbound'], [
  ['Continuous Q, m³/s', ...scenarios.map((s: any) => f(s.qTop, 10))],
  ['Superficial upward U, m/s', ...scenarios.map((s: any) => f(s.top.U, 9))],
  ['Required area, m²', ...scenarios.map((s: any) => f(s.top.requiredArea, 8))],
  ['Calculated D_req, mm', ...scenarios.map((s: any) => f(1000 * s.top.requiredDiameter, 2))],
  ['Margin ratio f vt / U', ...scenarios.map((s: any) => f(s.top.marginRatio, 4))],
  ['Margin percent above equality', ...scenarios.map((s: any) => `${f(s.top.marginPct, 2)}%`)],
  ['Net downward mean-drop speed, m/s', ...scenarios.map((s: any) => f(s.top.netSpeed, 9))],
  ['Numerical mean-drop screen', 'PASS — conditional only', 'PASS — conditional only'],
  ['Final hydraulic / carryover acceptance', 'HOLD', 'HOLD'],
]));
section.push(`Calculated end D_req below 700 mm is not a proposal to shrink the frozen active section or select a reduced-diameter outlet neck. A straight 700-mm top is a candidate with no demonstrated enlargement requirement from this mean-drop screen alone.

Inverse capture-size requirement in the same 700-mm top:
`);
section.push(table(['Scenario', 'NMP d_crit, µm', 'vt at threshold, m/s', 'Re', 'Eo', 'Mean d32 / d_crit'], scenarios.map((s: any) =>
  [`N${s.N}`, f(s.topCut.d * 1e6, 2), f(s.topCut.vt, 9), f(s.topCut.re, 6), f(s.topCut.eo, 6), f(topDrop.d / s.topCut.d, 3)])));
section.push(`Mean d32 being larger than d_crit does not show what fraction of the drop population is captured. A lower-tail distribution and specified carryover limit are required. The selected mean-drop Eo≈4.79 is not evidence of a rigid sphere; deformation/interface uncertainty makes its terminal speed and apparent margin conditional. No unsupported larger/coalesced drop is substituted.

### Requested 30–70 rpm investigation, not accepted operation
`);
section.push(table(['rpm', 'Saved d32, mm', 'Active capacity loading', 'Saved hydraulic pass'], input.rpmSensitivity.map((r: any) =>
  [r.rpm, f(r.d32M * 1000, 6), f(r.loading, 6), r.hydraulicPass ? 'PASS (screen)' : 'FAIL'])));
section.push(`Selected operation remains 30 rpm. Only 30 and 35 rpm pass the saved fixed-geometry active screen; 40–70 rpm fail. The minimum investigated fixed-geometry d32=2.195309 mm at 70 rpm is not an approved operating/drop-size basis. No geometry/RPM re-selection or new active-column calculation was performed. Active holdup/turning-capacity rules are not disengagement criteria; Garthe superficial swarm velocity equals relative slip times (1−φ), and neither is silently transferred to a quiescent settler.

## 6. BOTTOM EXTRACT calculation card

Continuous phase: downward NMP-rich extract. Entrained dispersed phase: RRBO drops rising. Phase properties are swapped explicitly from the top; μ_c=0.001416 Pa·s and μ_d=0.0598 Pa·s. The top NMP-compartment d32 is NOT assigned to these RRBO drops. Bottom RRBO size is unknown; inverse threshold and size sensitivities are calculated instead.
`);
section.push(table(['Result at 700 mm', 'N4 unbound', 'N7 unbound'], [
  ['Extract Q, m³/s', ...scenarios.map((s: any) => f(s.qBottom, 10))],
  ['Downward U, m/s', ...scenarios.map((s: any) => f(s.bottomCut.U, 9))],
  ['Required vt=2U, m/s', ...scenarios.map((s: any) => f(s.bottomCut.vt, 9))],
  ['Critical RRBO diameter, µm', ...scenarios.map((s: any) => f(s.bottomCut.d * 1e6, 3))],
  ['Re at critical size', ...scenarios.map((s: any) => f(s.bottomCut.re, 6))],
  ['Eo at critical size', ...scenarios.map((s: any) => f(s.bottomCut.eo, 6))],
  ['We at critical size', ...scenarios.map((s: any) => f(s.bottomCut.we, 6))],
  ['Net upward speed at threshold, m/s', ...scenarios.map((s: any) => f(s.bottomCut.vt - s.bottomCut.U, 9))],
  ['Area at equality, m²', f(area, 10), f(area, 10)],
  ['Screen condition', 'PASS only if actual capture drop ≥ critical size', 'PASS only if actual capture drop ≥ critical size'],
  ['Actual geometry acceptance', 'HOLD — capture/drop basis missing', 'HOLD — capture/drop basis missing'],
]));
section.push(`At the inverse threshold the margin ratio is exactly 1 under the assumed f=.50 criterion (vt/U=2); there is no additional margin beyond that selected factor. This is a requirements curve, not a predicted physical drop size. Low Eo at the critical bottom size makes small-deformation approximation more plausible than for the top mean drop, but real interface mobility, contamination, inversion and mixture properties remain unvalidated. Exact drag was used regardless of Re; no claim of exact Stokes validity is made.

### Bottom droplet-size sensitivity — deliberately assumed sizes, NOT assigned design input

Common physical-property proxy applies to both scenarios. Required D below is derived from f=.50; v_net differs by scenario. PASS/FAIL refers only to the selected numerical screen at 700 mm.
`);
section.push(table(['Assumed RRBO d, µm', 'vt, m/s', 'Re', 'Eo', 'N4 D_req, mm', 'N7 D_req, mm', 'N4 / N7 screen'], scenarios[0].bottomGrid.map((r: any, i: number) =>
  [r.um, f(r.drop.vt, 9), f(r.drop.re, 6), f(r.drop.eo, 6), f(r.requiredDiameter * 1000, 2),
    f(scenarios[1].bottomGrid[i].requiredDiameter * 1000, 2),
    `${r.pass ? 'PASS' : 'FAIL'} / ${scenarios[1].bottomGrid[i].pass ? 'PASS' : 'FAIL'}`])));
section.push(table(['Assumed RRBO d, µm', 'N4 net upward speed, m/s', 'N7 net upward speed, m/s', 'N4 margin ratio', 'N7 margin ratio'], scenarios[0].bottomGrid.map((r: any, i: number) =>
  [r.um, f(r.netSpeed, 9), f(scenarios[1].bottomGrid[i].netSpeed, 9), f(r.marginRatio, 4), f(scenarios[1].bottomGrid[i].marginRatio, 4)])));
section.push(`If v_net≤0, extra height cannot reverse the direction of motion under this opposing-flow model. If v_net>0 but the 50% screen fails, height alone still cannot satisfy that velocity-margin criterion. Sizes in this table are sensitivity coordinates, not assumed real populations or a proposed coalescer performance.

### Enlarged-bottom diameter sensitivity — not selected geometry
`);
section.push(table(['Candidate bottom ID, mm', 'N4 U, m/s', 'N7 U, m/s', 'N4 critical RRBO d, µm', 'N7 critical RRBO d, µm'], scenarios[0].bottomDiameterCases.map((r: any, i: number) =>
  [r.D * 1000, f(r.U, 9), f(scenarios[1].bottomDiameterCases[i].U, 9), f(r.d * 1e6, 3),
    f(scenarios[1].bottomDiameterCases[i].d * 1e6, 3)])));
section.push(`Larger cross-section reduces the required capture diameter, showing a quantitative potential benefit. There is no established actual droplet cutoff or carryover target with which to justify selecting 1000 or 1200 mm. Transition height depends on a selected end diameter and independently justified cone angle/layout; neither is frozen here.

## 7. Height, residence time and interface — parametric, not arbitrary time sizing

For an ideal axial separation travel length L and positive net speed: t_settle=L/(v_t−U_c). For an occupied continuous-phase volume approximated by A H in the dilute limit: t_bulk=A H/Q_c=H/U_c. These are different times with different physical definitions. Assuming L=H makes their ratio U_c/(v_t−U_c), independent of H; choosing an arbitrary residence time cannot uniquely determine a physically sufficient end height. Actual inlet/outlet paths, calming, dispersion-band holdup, coalescence and interface/control inventory must determine the layout.

The following per-metre coefficients are parametric only. Top uses the conditional mean drop; bottom uses the inverse threshold (not a known real drop). H and L need not be equal.
`);
section.push(table(['Quantity', 'N4 seconds per metre', 'N7 seconds per metre'], [
  ['Top t_settle / L', ...scenarios.map((s: any) => f(1 / s.top.netSpeed, 3))],
  ['Top t_bulk / H', ...scenarios.map((s: any) => f(1 / s.top.U, 3))],
  ['Bottom threshold t_settle / L', ...scenarios.map((s: any) => f(1 / (s.bottomCut.vt - s.bottomCut.U), 3))],
  ['Bottom t_bulk / H', ...scenarios.map((s: any) => f(1 / s.bottomCut.U, 3))],
]));
section.push(`The existing Stage-5 straight-side allowances H_top=H_bottom=0.7 m are geometry proportions, not validated settling heights. Multiplying the above coefficients by 0.7 is merely a hypothetical idealized transit/inventory time and does not approve those heights. For example:
`);
section.push(table(['Hypothetical 0.7-m allowance', 'N4 seconds', 'N7 seconds'], [
  ['Top mean-drop travel, IF L=0.7 m', ...scenarios.map((s: any) => f(.7 / s.top.netSpeed, 2))],
  ['Top bulk-volume residence, IF H=0.7 m', ...scenarios.map((s: any) => f(.7 / s.top.U, 2))],
  ['Bottom threshold-drop travel, IF L=0.7 m', ...scenarios.map((s: any) => f(.7 / (s.bottomCut.vt - s.bottomCut.U), 2))],
  ['Bottom bulk-volume residence, IF H=0.7 m', ...scenarios.map((s: any) => f(.7 / s.bottomCut.U, 2))],
]));
section.push(`## 8. Layout continuation and existing geometry reference

TOP concept: upward RRBO-rich bulk withdrawal away from the agitated exit; provide a calm path for descending NMP drops back toward the active section. Retain fresh NMP feed at the top with a separately designed distributor that avoids outlet short-circuiting and excessive breakup. Free-surface level, any local heavy-phase accumulation/interface and control band must be defined from the actual layout; do not invent a second stable interface merely for symmetry.

BOTTOM concept: downward NMP-rich bulk withdrawal with an upward path for entrained RRBO drops to rejoin the active section; retain RRBO feed near the bottom. The inversion/dispersion-band location, extract outlet submergence and interface-control band require explicit hydraulic/control design. Fresh NMP feed is not moved to the bottom: the existing countercurrent orientation places it at the top.

Both ends need separate decisions for calming clearance from terminal stators/rotors, distributor geometry, vent and drain duty, sampling, level/interface instrumentation, alarms and maintainability. Generic ports in the present drawing are not proof of instrument selection or suitable return-flow capacity. No full dispersed-phase return rate can be assigned from the available equilibrium streams.

Existing Stage-5 reference only, elevations above bottom pole: active start 0.875 m; active end 5.075 m; top tangent 5.775 m; vessel height 5.950 m; overall envelope 7.000 m. Current 0.7-m end allowances and .087-m rotor clearances are not approved disengagement or calming dimensions.
`);
section.push(table(['Existing port', 'Service', 'Bore mm (proportional)', 'Elevation m (reference only)'], input.stage5.nozzles.map((n: any) =>
  [n.id, n.service, f(n.boreM * 1000, 1), f(n.elevationM, 3)])));
section.push(`The 70-mm process bores arise from D/10, not hydraulic nozzle sizing. An approved velocity/pressure-drop/erosion/breakup criterion, nozzle schedule and inlet distribution design are missing; no existing bore is accepted by this report. Vent is a crown-region connection, not qualified relief/vent capacity. Generic instrument connections do not specify interface-measurement technology or setpoints.

Overall additional straight/transition length beyond the active section is H_top + H_bottom + H_transition,top + H_transition,bottom. For a straight shell, transition terms are zero; H_top and H_bottom remain HOLD. Heads, flanges and mechanical envelope remain separate. For an enlarged end, transition geometry and inlet/outlet elevations must be derived only after diameter and layout criteria are accepted.

## 9. Decision table and required next evidence
`);
section.push(table(['Item', 'Available result', 'Status / genuinely missing requirement'], [
  ['Frozen active column', '700-mm ID × 4200-mm active; 20 × 210-mm compartments', 'INHERITED — unchanged'],
  ['Top 700-mm shell', 'Mean-drop 50%-velocity screen passes both scenarios', 'CONDITIONAL ONLY; actual exit PSD/capture criterion and shape/property applicability missing'],
  ['Bottom 700-mm shell', `Critical RRBO drop ${f(scenarios[0].bottomCut.d * 1e6, 1)}–${f(scenarios[1].bottomCut.d * 1e6, 1)} µm`, 'HOLD; actual entrained RRBO size/distribution and load unknown'],
  ['Enlarged bottom', '1000/1200-mm requirements curves quantified', 'NOT SELECTED; actual capture requirement absent'],
  ['Stage-2 outlet binding', 'N4 and N7 rates/compositions already available', 'HOLD; explicitly admit compatible downstream trial, do not request re-entry'],
  ['Property closure', 'Saved nominal phase properties reused', 'PROXY ONLY; product-mixture evidence/closure or authorized bounded basis needed'],
  ['Design velocity factor', 'f=0.50 explicit screening assumption', 'Requires engineering acceptance; not existing governed criterion'],
  ['Carryover / separation spec', 'No physical carryover prediction available', 'Specify allowable entrainment and capture distribution; dissolved NMP is excluded'],
  ['End heights / coalescence / interface', 'Parametric times and legacy proportions shown', 'HOLD; layout travel path, calming/coalescence and control inventory criteria missing'],
  ['Nozzles / distributor / return paths', 'Existing service/elevation references available', 'HOLD; hydraulic/control criteria missing; do not approve proportional bores'],
  ['Final geometry release', 'Candidate summary only', 'HOLD — NOT FOR FABRICATION'],
]));
section.push(`## 10. Reproducibility and checks

Run: npx tsx deliverables/kuhni-end-section-preliminary-calculation.ts

The companion .input.json contains the compact frozen audit extract, unrounded source numbers and hashes; .results.json contains full-precision calculated outputs and checks. After the first extraction, reruns use only the companion input and the pure exported drag function, with no DB/network calls, workflow execution, upstream optimization or UI/scientific-state mutation. Changing the drag source fails the source-hash guard.

Input SHA-256: ${sha(inputText)}.

Drag source SHA-256: ${input.provenance.dragSourceSha256}.

Checks PASS: each N4/N7 mass balance closes within 10⁻⁸ kg/h; isolated top terminal velocity reproduces the saved result within 10⁻¹² m/s; all evaluated drop force balances close within 10⁻¹² N; bottom inverse roots satisfy vt=2U within 10⁻¹² m/s. These are numerical consistency checks, not experimental qualification.

Internal source paths: server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts (dragCoefficient); server/ecr-pre-pilot/stage1.ts (saved process basis); server/ecr-pre-pilot/p1-candidate-service.ts and automatic-hydraulic-selection.ts (current immutable hydraulic selection); stage4-pre-pilot-sizing-service.ts (physical sizing authority); stage5-geometry-service.ts and shared/ecr-stage5-geometry.ts (existing preliminary layout). No external standard, empirical coalescence correlation or invented acceptance criterion is claimed.
`);
const markdown = section.join('\n\n');
writeFileSync(`${stem}.md`, markdown);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s: string) => esc(s).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
const lines = markdown.split('\n');
const html: string[] = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  if (line.startsWith('|')) {
    const block: string[] = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) block.push(lines[i++].trim());
    i--;
    const cells = (s: string) => s.slice(1, -1).split('|').map(x => x.trim());
    html.push(`<div class="tablewrap"><table><thead><tr>${cells(block[0]).map(x => `<th>${inline(x)}</th>`).join('')}</tr></thead><tbody>${block.slice(2).map(r => `<tr>${cells(r).map(x => `<td>${inline(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
  } else if (line.startsWith('#')) {
    const match = /^(#{1,3}) (.*)$/.exec(line);
    if (match) html.push(`<h${match[1].length}>${inline(match[2])}</h${match[1].length}>`);
  } else if (line.startsWith('- ')) {
    html.push(`<p class="bullet">• ${inline(line.slice(2))}</p>`);
  } else html.push(`<p>${inline(line)}</p>`);
}
writeFileSync(`${stem}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kühni end sections — preliminary calculation</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#edf1f3;color:#162a36;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}header{background:#12384b;color:white;padding:28px max(24px,calc((100vw - 1180px)/2))}header span{font-size:12px;letter-spacing:.12em;text-transform:uppercase}header div{font-size:23px;font-weight:650;margin-top:5px}main{max-width:1240px;margin:28px auto;padding:36px;background:white;border:1px solid #d9e1e5;border-radius:8px}h1{font-size:30px;line-height:1.2;margin-top:0}h2{font-size:23px;border-top:2px solid #dce6eb;padding-top:24px;margin-top:36px}h3{font-size:18px;color:#245570}p{overflow-wrap:anywhere}strong{color:#793f0c}.bullet{padding-left:18px}.tablewrap{overflow:auto;margin:16px 0 22px}table{border-collapse:collapse;min-width:650px;width:100%;font-size:13px;line-height:1.45}th{background:#e4eef3;text-align:left;color:#12384b;position:static}th,td{padding:10px 12px;border:1px solid #d6e0e6;vertical-align:top}tbody tr:nth-child(even){background:#f6f9fa}footer{max-width:1240px;margin:0 auto;padding:0 24px 30px;color:#526571;font-size:13px}@media(max-width:700px){main{margin:12px;padding:20px}h1{font-size:25px}h2{font-size:21px}header{padding:20px}table{font-size:12px}}@media print{body{background:white;font-size:10pt}header{padding:10px}main{margin:0;border:0;padding:10px;max-width:none}table{min-width:0;font-size:8pt}th,td{padding:5px}thead{display:table-header-group}tr{break-inside:avoid}h2,h3{break-after:avoid}.tablewrap{overflow:visible}footer{padding:10px}}
</style></head><body><header><span>Engineering calculation · Project 236 / Design 269</span><div>Frozen active section. Conditional end-section screening.</div></header><main>${html.join('\n')}</main><footer>Offline read-only evidence · No upstream authority changed · Preliminary — not for fabrication</footer></body></html>`);
console.log(JSON.stringify({ output: `${stem}.html`, checks: results.checks,
  top: scenarios.map((s: any) => ({ N: s.N, DreqMm: s.top.requiredDiameter * 1000,
    margin: s.top.marginRatio, criticalUm: s.topCut.d * 1e6 })),
  bottom: scenarios.map((s: any) => ({ N: s.N, criticalUm: s.bottomCut.d * 1e6,
    re: s.bottomCut.re, eo: s.bottomCut.eo })) }, null, 2));