import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Offline proposal only. No application imports, database clients or network calls.
const root = 'deliverables/';
const stem = root + 'disengager-preliminary-proposal';
const inputPath = root + 'kuhni-end-section-preliminary-calculation.input.json';
const evidencePaths = [
  inputPath, root + 'kuhni-end-section-preliminary-calculation.md',
  root + 'kuhni-end-section-preliminary-calculation.results.json',
  root + 'disengager-investigation-literature.md',
  root + 'disengager-drag-evidence.md', root + 'disengager-drag-calculations.md',
  root + 'disengager-drag-results.json',
  'server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts',
];
const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const before = Object.fromEntries(evidencePaths.map(path => [path, hash(path)]));
assert.equal(before[inputPath], '3e65f398cfd714f599ab7fcb420e07c4a4d3c6637053a71498567099413536d2');
const input = JSON.parse(fs.readFileSync(inputPath));
const drag = JSON.parse(fs.readFileSync(root + 'disengager-drag-results.json'));
const previous = JSON.parse(fs.readFileSync(root + 'kuhni-end-section-preliminary-calculation.results.json'));
assert.equal(before[evidencePaths.at(-1)], input.provenance.dragSourceSha256);
assert.equal(input.selected.trial.rpm, 30);
assert.equal(input.selected.trial.diameterM, 0.7);
const g = 9.80665, f = 0.5, area = D => Math.PI * D ** 2 / 4;
function bisect(fn, lo, hi) {
  assert(fn(lo) < 0 && fn(hi) > 0);
  for (let i = 0; i < 110; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
function terminal(d, p) {
  const vt = bisect(v => {
    const Re = p.rhoC * v * d / p.muC;
    return 24 / Re * (1 + 0.15 * Re ** 0.687) * p.rhoC * v * v / 2
      - 2 / 3 * d * Math.abs(p.rhoC - p.rhoD) * g;
  }, 1e-14, 10);
  return { vt, Re: p.rhoC * vt * d / p.muC,
    Eo: Math.abs(p.rhoC - p.rhoD) * g * d * d / p.sigma };
}
const rows = [700, 800, 900, 1000, 1200].map(mm => ({
  diameterMm: mm,
  scenarios: drag.flowScenarios.map(s => {
    const Ubottom = s.qBottomM3h / 3600 / area(mm / 1000);
    const Utop = s.qTopM3h / 3600 / area(mm / 1000);
    const bottomCutM = bisect(d => terminal(d, drag.bottom).vt - Ubottom / f, 1e-6, 0.02);
    const topCutM = bisect(d => terminal(d, drag.top).vt - Utop / f, 1e-6, 0.02);
    const prior = drag.cuts.find(r => Math.abs(r.D - mm / 1000) < 1e-10).scenarios.find(r => r.N === s.N);
    assert(Math.abs(prior.d - bottomCutM) < 1e-12);
    assert(Math.abs(terminal(bottomCutM, drag.bottom).vt - 2 * Ubottom) < 1e-12);
    assert(Math.abs(terminal(topCutM, drag.top).vt - 2 * Utop) < 1e-12);
    if (mm === 700) assert(Math.abs(topCutM - previous.scenarios.find(r => r.N === s.N).topCut.d) < 1e-12);
    return { N: s.N, Ubottom, Utop, bottomCutM, topCutM,
      bottomDiagnostics: terminal(bottomCutM, drag.bottom), topDiagnostics: terminal(topCutM, drag.top) };
  }),
}));
const bottom200 = terminal(0.0002, drag.bottom);
const qBottom = Math.max(...drag.flowScenarios.map(s => s.qBottomM3h)) / 3600;
const qTop = Math.max(...drag.flowScenarios.map(s => s.qTopM3h)) / 3600;
const requiredD = Math.sqrt(4 * qBottom / (f * bottom200.vt) / Math.PI);
const U900 = qBottom / area(0.9);
const coneMm = 100 / Math.tan(Math.PI / 6);
const z = { activeBottom: 0, activeTop: 4200, topTangent: 5400,
  neckBottom: -300, bottomStraightTop: -300 - coneMm, bottomTangent: -1500 - coneMm,
  rrboFeed: -150, nmpFeed: 4350, raffinateOutlet: 5100,
  topLiquidNormal: 5250, topLiquidLow: 5200, topLiquidHigh: 5300 };
z.interfaceNormal = z.bottomStraightTop - 200;
z.interfaceLow = z.interfaceNormal - 100;
z.interfaceHigh = z.interfaceNormal + 100;
z.extractOutlet = z.bottomTangent + 200;
const nozzles = [
  { service: 'RRBO feed', flowM3S: input.processBasis.rrboFeed.flowM3S, z: z.rrboFeed },
  { service: 'Wet NMP feed', flowM3S: input.processBasis.wetSolventPhase.flowM3S, z: z.nmpFeed },
  { service: 'Raffinate outlet (N4 envelope)', flowM3S: qTop, z: z.raffinateOutlet },
  { service: 'Extract outlet (N7 envelope)', flowM3S: qBottom, z: z.extractOutlet },
].map(n => ({ ...n, boreMm: 70, velocityMS: n.flowM3S / area(0.07),
  minimumBoreAtSelectedPointFiveMS: 1000 * Math.sqrt(4 * n.flowM3S / (Math.PI * 0.5)) }));
const checks = {
  inputHashUnchanged: true, dragSourceHashMatches: true,
  allFiveBottomRootsMatchPriorWithin1e12M: true,
  allInverseVelocityResidualsBelow1e12MS: true,
  selected900Passes200MicronScreen: U900 <= f * bottom200.vt,
  selected800Fails200MicronScreen: qBottom / area(0.8) > f * bottom200.vt,
  normalInterfaceBelowCone: z.interfaceHigh < z.bottomStraightTop,
  feedAboveHighestInterface: z.rrboFeed > z.interfaceHigh,
  nozzleCentreSubmergenceAtLowInterfaceMm: z.interfaceLow - z.extractOutlet,
  topOutletCentreSubmergenceAtLowLiquidMm: z.topLiquidLow - z.raffinateOutlet,
};
assert(checks.selected900Passes200MicronScreen && checks.selected800Fails200MicronScreen);
assert.equal(checks.nozzleCentreSubmergenceAtLowInterfaceMm, 700);
assert.equal(checks.topOutletCentreSubmergenceAtLowLiquidMm, 100);
assert(Math.abs(requiredD * 1000 - 868.753) < 0.001);
for (const s of previous.scenarios) assert(Math.abs(s.closure) < 1e-8);
const calculations = {
  status: 'ENGINEER-SELECTED PRELIMINARY LAYOUT — NOT FOR FABRICATION',
  provenance: input.provenance, sourceHashes: before, inputs: { g, f, captureBottomM: 0.0002,
    bottom: drag.bottom, top: drag.top, scenarios: drag.flowScenarios },
  rows, bottom200, requiredBottomDiameterMm: requiredD * 1000,
  selectedBottomDiameterMm: 900, U900, marginRatio: f * bottom200.vt / U900,
  netRise200MS: bottom200.vt - U900, coneMm, elevationsMm: z,
  processEnvelopeMm: z.topTangent - z.bottomTangent, nozzles, checks,
  selectedHeightAllowancesMm: { bottomNeck: 300, bottomWithdrawal: 300,
    bottomQuiet: 600, bottomInterfaceControlReserve: 200, bottomUpperGuard: 100,
    topFeedBuffer: 300, topQuiet: 600, topWithdrawalLevelReserve: 300 },
};
const fmt = (n, digits = 3) => n.toFixed(digits);
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const table = (headers, data) => `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${data.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const paired = (r, key, scale = 1, digits = 3) => r.scenarios.map(s => fmt(s[key] * scale, digits)).join(' / ');
const diagram = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 830" role="img" aria-label="Preliminary dimensioned end-section layout, not to scale">
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#334155"/></marker></defs>
<rect width="1040" height="830" fill="white"/>
<g font-family="Arial,sans-serif" font-size="16" fill="#172b43">
<text x="25" y="28" font-size="21" font-weight="bold">LAYOUT REFERENCE • all elevations mm • not to scale</text>
<rect x="340" y="65" width="180" height="165" fill="#fff1c2" stroke="#334155" stroke-width="2"/>
<rect x="340" y="65" width="180" height="22" fill="#eef2f7"/>
<line x1="340" x2="520" y1="87" y2="87" stroke="#b7791f" stroke-dasharray="5 4"/>
<rect x="340" y="230" width="180" height="245" fill="#ffedba" stroke="#334155" stroke-width="2"/>
<path d="M355 270h150 M355 315h150 M355 360h150 M355 405h150 M355 450h150" stroke="#64748b" stroke-width="5"/>
<line x1="430" x2="430" y1="235" y2="470" stroke="#475569" stroke-width="4"/>
<rect x="340" y="475" width="180" height="65" fill="#ffedba" stroke="#334155" stroke-width="2"/>
<path d="M340 540 L305 580 H555 L520 540 Z" fill="#ffedba" stroke="#334155" stroke-width="2"/>
<rect x="305" y="580" width="250" height="205" fill="#c7e8f5" stroke="#334155" stroke-width="2"/>
<rect x="306" y="581" width="248" height="29" fill="#ffedba"/>
<rect x="306" y="610" width="248" height="40" fill="#dcebc8"/>
<line x1="305" x2="555" y1="630" y2="630" stroke="#176b8a" stroke-width="2" stroke-dasharray="6 4"/>
<path d="M345 725v-47 M515 680v50" stroke="#176b8a" stroke-width="2" marker-end="url(#arrow)"/>
<text x="359" y="700" font-size="14">RRBO ↑   NMP ↓</text>
<path d="M250 193h90 M250 505h90" stroke="#334155" stroke-width="3" marker-end="url(#arrow)"/>
<path d="M520 107h80 M555 752h45" stroke="#334155" stroke-width="3" marker-end="url(#arrow)"/>
<text x="25" y="195">NMP feed z +4350</text>
<text x="25" y="217" font-size="12">Downward feed; shield quiet zone</text>
<text x="25" y="507">RRBO feed z −150</text>
<text x="25" y="529" font-size="13">Radial distribution ABOVE interface</text>
<text x="610" y="71">Top tangent +5400</text>
<text x="610" y="93">Liquid normal +5250 (5200–5300)</text>
<text x="610" y="115">Raffinate outlet +5100; vortex HOLD</text>
<text x="610" y="152">TOP ID 700 × straight 1200</text>
<text x="610" y="177">300 feed + 600 quiet + 300 withdrawal</text>
<text x="610" y="234">Active upper boundary +4200</text>
<text x="610" y="319">ACTIVE ID 700 × H 4200 — unchanged</text>
<text x="610" y="345">20 × 210 pitch; rotor 231; 30 rpm</text>
<text x="610" y="371">Nₚ 1.2; stator free area 0.4</text>
<text x="610" y="479">Active lower boundary z = 0</text>
<text x="610" y="512">ID 700 feed neck × 300</text>
<text x="610" y="552">Cone: 30° to axis; H 173.205</text>
<text x="610" y="580">900 straight top −473.205</text>
<text x="610" y="614">Interface high −573.205</text>
<text x="610" y="638">Normal −673.205; low −773.205</text>
<text x="610" y="679">BOTTOM ID 900 × straight 1200</text>
<text x="610" y="703">NMP-rich continuous pool below interface</text>
<text x="610" y="755">Extract outlet −1473.205</text>
<text x="610" y="785">Lower tangent −1673.205</text>
<line x1="285" x2="285" y1="65" y2="785" stroke="#334155" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
<text x="269" y="355" text-anchor="middle" transform="rotate(-90 269 355)">7073.205 mm process envelope</text>
<text x="25" y="817" font-size="14">Amber: RRBO continuous. Blue: NMP continuous. Green: interface-control reserve, NOT a predicted dispersion band.</text>
</g></svg>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kühni end sections — preliminary mechanical proposal</title>
<style>
*{box-sizing:border-box}body{font:15px/1.5 Arial,Helvetica,sans-serif;color:#203047;background:#eef2f6;margin:0}
main{max-width:1130px;margin:30px auto;background:#fff;padding:48px 55px}
h1{font-size:32px;line-height:1.15;color:#153852;margin:8px 0 18px}h2{font-size:23px;color:#153852;border-bottom:2px solid #dce6ed;padding-bottom:8px;margin-top:35px}
h3{font-size:18px;margin:22px 0 8px}.eyebrow{font-size:12px;font-weight:bold;letter-spacing:1.4px;color:#37647c}
.notice{border-left:5px solid #c27c17;background:#fff5db;padding:16px 20px;margin:20px 0}
.decision{border-left:5px solid #178384;background:#eaf7f6;padding:16px 20px}p{margin:11px 0}li{margin:6px 0}
table{border-collapse:collapse;width:100%;font-size:13px;margin:15px 0}th{background:#e8eff4;text-align:left}th,td{border:1px solid #cfdae2;padding:8px;vertical-align:top}
tr{break-inside:avoid}thead{display:table-header-group}code{font-size:12px;overflow-wrap:anywhere}
.small{font-size:12px;color:#45566a}.equation{background:#f2f5f8;padding:12px 16px;font-family:monospace;font-size:13px;white-space:normal}
svg{width:100%;height:auto}a{color:#176482;overflow-wrap:anywhere}.page{break-before:page}.keep{break-inside:avoid}footer{border-top:1px solid #ccd7df;margin-top:30px;padding-top:15px}
@media print{body{background:white;font-size:10.5pt}main{margin:0;padding:0;max-width:none}h1{font-size:25pt}h2{font-size:17pt;margin-top:20px}h3{font-size:13pt}table{font-size:9pt}th,td{padding:6px}a{color:inherit}.notice,.decision{padding:10px 14px}h2,h3{break-after:avoid}.diagram{break-inside:avoid} .small{font-size:8.5pt}@page{size:A4;margin:17mm 14mm 18mm}}
</style></head><body><main>
<div class="eyebrow">PROJECT 236 · DESIGN 269 · OFFLINE ENGINEERING INVESTIGATION · 21 SEPTEMBER 2026</div>
<h1>Kühni end sections<br>Preliminary mechanical proposal</h1>
<div class="notice"><strong>PRELIMINARY — NOT FOR FABRICATION.</strong> A dimensioned proposal is selected below for engineering development. Capture performance, actual required end heights, pressure design and release remain HOLD. Selected allowances are not measured requirements or published universal clearances.</div>
<div class="decision"><strong>Proposed configuration:</strong> top <b>700 mm ID × 1200 mm straight</b> → unchanged active <b>700 mm ID × 4200 mm</b> → bottom <b>700 mm ID × 300 mm feed neck</b> + <b>173.205 mm conical transition</b> + <b>900 mm ID × 1200 mm straight</b>.<br>
Bottom 900 mm is selected for an <b>engineer-selected 200 µm RRBO capture screen</b>, with <b>U ≤ 0.50 v<sub>t</sub></b> and <b>no coalescence growth credit</b>. Calculated minimum ID is <b>${fmt(requiredD * 1000, 2)} mm</b> at the worst bottom flow proxy. This is not proof that physical enlargement is necessary, that the real population has this cutoff, or that carryover is acceptable.</div>
<h2>1 · What is preserved, and what is selected</h2>
${table(['Classification','Basis / decision'],[
['INHERITED, unchanged','Active ID 700 mm; active H 4200 mm; 20 compartments × 210 mm pitch; rotor 231 mm; stator free-area ratio 0.4; 30 rpm; adopted power number Nₚ=1.2. Physical N<sub>T</sub>=7 and efficiency 0.35 are not changed.'],
['ENGINEER-SELECTED','Bottom capture target 200 µm; velocity fraction 0.50; 900-mm bottom; 30° cone half-angle measured from axis; all end-zone heights, interface levels, nozzle centre elevations and 0.5-m/s nozzle screening velocity below. None is a vendor guarantee.'],
['CALCULATED','Finite-Re terminal speeds, inverse capture cutoffs, superficial velocities, 868.753-mm required ID, 173.205-mm cone rise, nozzle bulk velocities and dimension chains.'],
['NOT ESTABLISHED','Actual incoming end-zone drop populations, dispersed load, acceptable carryover, equilibrated outlet properties, coalescence/band capacity, nonuniform-flow allowances, surge duty and mechanical suitability.']])}
<p>The previous report withheld geometry selection because the actual bottom population was unknown. This proposal advances a <em>disclosed provisional design duty</em>; it does not overturn that evidence limitation. Neither 250–253 µm nor 200 µm is literature-proven conservative for RRBO/NMP. A 150-µm duty would require about 1142.58 mm by the same screen (1200-mm candidate), and 100 µm about 1696.60 mm. A consequential finer tail may defeat any selected duty.</p>
<h3>Unbound outlet-flow envelope, not Stage-2 approval</h3>
${table(['Unbound scenario','Raffinate kg/h','Top Q proxy m³/h','Extract kg/h','Bottom Q proxy m³/h'],previous.scenarios.map(s=>[s.N,fmt(s.mass.finalRaffinate,6),fmt(s.qTop*3600,9),fmt(s.mass.finalExtract,6),fmt(s.qBottom*3600,9)]))}
<p><b>N4 controls the top flow; N7 controls the bottom flow.</b> Taking separate maxima is an explicit design envelope, not a single thermodynamic operating state. Stage-2 job ${esc(input.provenance.stage2JobId)} remains unbound; releaseEligible=false and Stage-4’s Stage-2 job link is NULL. The source hash differs from current Stage 1 despite matching audited input fields. Physical N<sub>T</sub>=7 does not silently bind N7 outlet results.</p>
<p>RRBO feed: 4000 L/h × 869 kg/m³ = 3476 kg/h. Wet solvent: S/O=0.6 mass = 2085.6 kg/h = 2054.778325 L/h, 99.5/0.5 wt% NMP/water. Total mass closes at 5561.6 kg/h in both scenarios. Product Q = product mass / nominal phase density; these are <b>volume proxies</b>, not measured mixture volumes. Equilibrium dissolved NMP in raffinate and hydrocarbon in extract are not physical droplet entrainment loads.</p>

<h2 class="page">2 · Physics and reproducible diameter comparison</h2>
${table(['Nominal 40 °C property','Bottom','Top'],[
['Continuous phase ρ / μ','NMP-rich: 1015 kg/m³ / 0.001416 Pa·s','RRBO-rich: 869 kg/m³ / 0.0598 Pa·s'],
['Dispersed phase ρ / μ','RRBO: 869 kg/m³ / 0.0598 Pa·s','NMP: 1015 kg/m³ / 0.001416 Pa·s'],
['Common |Δρ| / σ / g','146 kg/m³ / 0.011 N/m / 9.80665 m/s²','Same nominal proxies'],
['Dispersed / continuous viscosity ratio','42.2316','0.0236789']])}
<div class="equation">Re = ρc vt d / μc; CD = (24/Re)(1 + 0.15 Re^0.687)<br>
CD ρc vt² / 2 = (2/3) d |Δρ| g; U = Q/A; A = πD²/4<br>
Criterion: U ≤ f vt, f=0.50; Dreq = √[4Q/(π f vt)]<br>
Inverse cutoff: vt(dcrit) = U/f = 2U; net return speed = vt − U.<br>
Eo = |Δρ| g d² / σ. All roots use bracketed bisection.</div>
<p>Bottom: high viscosity ratio suppresses internal mobility; finite-Re spherical Schiller–Naumann is an appropriate <em>isolated-drop screening approximation</em> at the small cutoffs. Over the requested diameter range Re≈0.110–0.588 and Eo≈0.0026–0.0083: static deformation is negligible as a leading correction on this basis. This does not exclude turbulence, swarm retardation or property errors. Using RRBO viscosity as the continuous drag viscosity at the bottom would be wrong.</p>
<p>Stokes and clean Hadamard–Rybczynski are diagnostics, not the adopted finite-Re calculation. At 250 µm, Stokes overpredicts SN speed by 10.21%; HR/Stokes differs by only 0.777%. Myint et al. Eq. 9 gives a clean-to-SN correction of about 0.730% there, but Eo is below its tested minimum 0.017. This is an extrapolation diagnostic, not a new validated RRBO/NMP model. No bubble deformation correlation is substituted [R1].</p>
<h3>Bottom: RRBO rising against downward NMP-rich flow</h3>
<p>Paired entries are <b>N4 / N7</b>; Q = <b>2.207350556 / 2.249188608 m³/h</b>. dcrit is a required size at equality to the assumed margin, not a predicted population or the zero-net-rise diameter.</p>
${table(['ID mm','U mm/s<br>N4 / N7','dcrit µm<br>N4 / N7','200-µm screen<br>N4 / N7'], rows.map(r=>[r.diameterMm,paired(r,'Ubottom',1000,6),paired(r,'bottomCutM',1e6,3),r.scenarios.map(s=>s.Ubottom<=f*bottom200.vt?'PASS':'FAIL').join(' / ')]))}
<h3>Top: NMP settling against upward RRBO-rich flow</h3>
<p>Paired entries are <b>N4 / N7</b>; Q = <b>3.821794230 / 3.772927000 m³/h</b>. All top cutoffs are <b>conditional SN diagnostics, not validated liquid-drop capture predictions</b>.</p>
${table(['ID mm','U mm/s<br>N4 / N7','Conditional dcrit mm<br>N4 / N7'],rows.map(r=>[r.diameterMm,paired(r,'Utop',1000,6),paired(r,'topCutM',1000,6)]))}
<p><b>Retain the 700-mm top as a candidate, not an approved settler.</b> The saved active-compartment mean is 6.068312 mm <b>NMP-in-RRBO</b>, never RRBO-in-NMP. SN gives vt=36.665670 mm/s, Re=3.2333, Eo=4.7931 and We=0.6445. Significant deformation/mobility uncertainty remains. The 700-mm critical size is about 2.08 mm (Eo≈0.56); mean d32 exceeding it does not prove fine-tail capture. Top viscosity ratio is below Myint’s tested lower limit 0.1. No coalesced mean or coalescence-growth benefit is assumed.</p>

<h2 class="page">3 · Selected bottom duty and spatial height basis</h2>
${table(['200-µm design screen, worst bottom Q','Calculated result'],[
['Terminal speed / Re / Eo',`${fmt(bottom200.vt*1000,6)} mm/s / ${fmt(bottom200.Re,6)} / ${fmt(bottom200.Eo,6)}`],
['Allowed U = 0.50 vt',`${fmt(f*bottom200.vt*1000,6)} mm/s`],
['Required area / ID',`${fmt(qBottom/(f*bottom200.vt),6)} m² / ${fmt(requiredD*1000,3)} mm`],
['Selected ID / area / actual bulk U',`900 mm / ${fmt(area(.9),6)} m² / ${fmt(U900*1000,6)} mm/s`],
['Margin ratio / excess above assumed criterion',`${fmt(f*bottom200.vt/U900,6)} / ${fmt((f*bottom200.vt/U900-1)*100,2)}%`],
['Net upward speed at selected ID',`${fmt((bottom200.vt-U900)*1000,6)} mm/s`]])}
<p>900 mm is the smallest of the evaluated 700/800/900/1000/1200-mm sizes passing this assigned 200-µm duty. Its modest excess capacity is not a demonstrated allowance for jets, fouling, swarm effects or property uncertainty. At 700 mm, 200-µm net rise is positive but the 50% criterion fails; at 150 µm the net direction is downward. More height cannot repair either a failed area criterion or a wrong-direction trajectory.</p>
<h3>Heights are selected layout allowances, not an arbitrary residence-time result</h3>
<div class="equation">treturn = L/(vt−U), if vt &gt; U; tbulk = AH/Q = H/U.<br>
If L=H, treturn/tbulk = U/(vt−U), independent of height.</div>
<p>Therefore these equations cannot determine a unique sufficient end height. The proposal instead reserves identifiable physical spaces and sets elevations. <b>The numeric allowances below are engineering selections for layout development, not source-prescribed or calculated necessary clearances.</b> Actual hydraulic height remains HOLD until inlet decay, band/coalescence, withdrawal and controls are qualified [R2–R6].</p>
${table(['Region (bottom upward)','Selected axial allowance','Purpose / qualification'],[
['900-mm withdrawal zone','300 mm','Outlet centre 200 mm above lower tangent; anti-vortex device and accessible drain below. Local drawdown check required.'],
['900-mm clear return zone','600 mm','Space below the lowest interface-control elevation, above withdrawal zone. No claim that 600 mm dissipates a particular jet.'],
['900-mm interface/control reserve','200 mm','Normal interface ±100 mm. This is a reserved combined operating envelope, not a predicted 200-mm dispersion band. If band extent plus excursions exceeds it, increase/reposition layout.'],
['900-mm upper guard','100 mm','From highest reserved interface elevation to cone lower end; verify interface cannot invade transition.'],
['900-mm straight total','1200 mm','300 + 600 + 200 + 100. Mechanical layout selection only.'],
['900→700 cone','173.205 mm','Radial change (900−700)/2 = 100 mm; H = 100/tan30°. Angle chosen, height geometrically derived.'],
['700-mm feed neck','300 mm','Separate RRBO feed/distributor from active boundary and bottom interface; no existing active internals moved.']])}
<p>At the normal interface, outlet-centre-to-interface distance is 800 mm (range 700–900 mm). For the hypothetical uniform 200-µm trajectory, treturn=${fmt(.8/(bottom200.vt-U900),1)} s and H/U=${fmt(.8/U900,1)} s for the <em>same</em> 0.8-m slab. Across the 600-mm quiet allowance the corresponding times are ${fmt(.6/(bottom200.vt-U900),1)} and ${fmt(.6/U900,1)} s. These are illustrative transit comparisons only: drops near a radial outlet may escape much sooner, and no actual release elevation is established.</p>
<p>Normal cylindrical NMP pool inventory below interface, excluding head, is ${fmt(area(.9)*1.0,6)} m³; full 200-mm control-reserve volume is ${fmt(area(.9)*.2,6)} m³. Do not credit all of this as usable surge: dispersion, internals, alarm margins and level uncertainty reduce it. Required surge volume must come from ΔV=∫(Qin−Qout)dt for an agreed upset and response time; neither is supplied.</p>

<h2 class="page">4 · Dimensioned phase-consistent arrangement</h2>
<div class="diagram">${diagram}</div>
<p class="small">Reference datum z=0 is the preserved active lower boundary; z=4200 is its upper boundary. The drawing is schematic: no head shape, weld detail, support, plate thickness fit-up or pressure-shell design is implied. Terminal stator plane/face offsets (including 4-mm plate thickness) must be reconciled to current CAD; no stator is relocated by this report.</p>
<h3 class="page">Bottom flow topology and interface protection</h3>
<p>The dense NMP-rich continuous pool is <b>below</b> the bottom liquid–liquid interface. RRBO is continuous above that interface through the cone, feed neck and active section. Descending NMP drops merge into the lower pool; entrained RRBO in that pool rises to the interface and rejoins the upper RRBO phase. This final interface-merger process still needs coalescence capacity, even though no drop-growth credit is used in the screen.</p>
<p>RRBO feed at z=−150 lies in the 700-mm neck, <b>above the highest interface</b> by 423.205 mm. Use a low-momentum circumferential/radial distributor and shield so feed is directed toward the active entrance, not as an axial jet onto the interface. No bulk RRBO feed is injected into the NMP pool. There is no forced extract-return pipe or assumed pump: gravity phase exchange uses the open process cross-section. Distributor holes, open return area, shaft obstruction and pressure drops need design; none is assigned fictitious capacity.</p>
<p>The neck is 300 mm deep, but feed centre is only 150 mm from the active lower boundary. This is <b>not</b> a claim of 300-mm distributor-to-stator clearance. The lowest rotor/stator agitation-decay region must be checked independently. The highest interface is 573.205 mm below the active boundary; whether this is sufficient is unvalidated.</p>

<h2 class="page">5 · Top layout, nozzles and control philosophy</h2>
${table(['Top region','Elevation range mm','Selected allowance / function'],[
['Feed / terminal-stator buffer','4200 to 4500','300 mm; NMP distributor at 4350, directed downward toward active entry.'],
['Quiet return path','4500 to 5100','600 mm; descending NMP drops have an unobstructed path back to active region.'],
['Withdrawal / liquid-level space','5100 to 5400','300 mm; raffinate outlet centre 5100; liquid normal 5250, reference low/high 5200/5300.'],
['Top total','4200 to 5400','1200 mm, engineer-selected straight section; no diameter transition.']])}
<p>Use a distributor/turbulence shield that separates fresh NMP injection from the upper quiet zone while permitting upward RRBO and downward separated NMP to pass. The distributor centre is 150 mm above the active upper boundary; the buffer is 300 mm in total. Neither is an approved last-stator/rotor calming clearance. Supports must not impinge on frozen internals. A blind plate that blocks countercurrent return is unacceptable.</p>
<p>The top has an RRBO-rich liquid/gas level, <b>not an invented second stable liquid–liquid interface</b>. At the reference normal level, the raffinate outlet centre is submerged 150 mm (100 mm at low level). For a 70-mm bore, the opening crown has only 65-mm cover at low level; anti-vortex/entrainment checks may require a lower outlet or higher level. Minimum straight-section freeboard is 100 mm at high level; this is not a qualified gas-disengagement/relief allowance. Head space is additional and unspecified.</p>
<p>Over the selected 600-mm top quiet path, the conditional mean-drop return time is ${fmt(.6/(previous.topDrop.vt-qTop/area(.7)),1)} s versus ${fmt(.6/(qTop/area(.7)),1)} s bulk transit. At the conditional top cutoff, these are equal under the 0.5 screen. This illustrates the algebra; it does not establish top capture or justify 600 mm as a hydraulic minimum.</p>
<h3>Retain existing 70-mm process bores provisionally</h3>
<p>The previous proportional 70-mm bores can be retained as preliminary candidates rather than inventing a standard “DN70.” The selected bulk-nozzle velocity screen is <b>0.5 m/s</b> (engineering choice, not a breakup or pressure-loss guarantee). Minimum bore = √[4Q/(π × 0.5)]. Nominal DN and schedule must subsequently provide the actual bore.</p>
${table(['Service','Q m³/h','Centre z mm','70-mm bore velocity m/s','Min bore at 0.5 m/s, mm'],nozzles.map(n=>[n.service,fmt(n.flowM3S*3600,6),fmt(n.z,3),fmt(n.velocityMS,6),fmt(n.minimumBoreAtSelectedPointFiveMS,2)]))}
<p>All four bulk velocities are below the selected screen. Pipe friction (especially viscous RRBO), allowable nozzle loads, control-valve pressure loss, startup flow and distributor-hole jet velocities are unqualified. A low inlet-pipe velocity does not prove low local shear. Bottom outlet opening crown is 665 mm below the lowest reference interface; provide an anti-vortex arrangement without blocking droplet return and verify drawdown.</p>
<ul>
<li><b>Bottom:</b> continuous interface measurement plus independent high/low interface alarms; conceptual interface LIC modulates extract withdrawal. Measurement technology must work with this density/dielectric contrast and dispersion/crud. Alarm/trip positions, response time and fail actions require HAZOP; reference operating levels are not certified trip settings.</li>
<li><b>Top:</b> liquid level measurement/alarms and raffinate withdrawal control keep the active section flooded. Pressure control/blanket, vent and independent relief require confirmed pressure basis, gas/vapor duty and code review. Saved operating pressure field is “2.0”; confirm gauge/absolute interpretation before mechanical use. Do not equate operating pressure to design pressure.</li>
<li><b>Auxiliaries:</b> reserve low-point drain/flush, top vent/relief, representative samples at both product nozzles and interface instrumentation connections. Existing 28-mm vents/drains and 17.5-mm generic sample/instrument ports are references only, not qualified sizing. Specify their duty, compatibility, plugging risk and maintenance access before choosing final bore/DN.</li>
</ul>

<h2 class="page">6 · Elevation schedule and release boundary</h2>
${table(['Feature','z mm / dimension','Authority'],[
['Active lower / upper boundary','0 / +4200','Inherited active envelope; terminal-plate offsets HOLD'],
['Top straight upper end / reference tangent','+5400','Selected layout; head beyond this'],
['RRBO feed / wet-NMP feed','−150 / +4350','Selected nozzle centres'],
['Raffinate outlet / top normal liquid','+5100 / +5250','Selected, submergence HOLD'],
['Top low / high liquid','+5200 / +5300','Reference control envelope, not trips'],
['700-mm neck lower end','−300','Selected 300-mm neck'],
['Cone lower end / 900-mm straight upper end',fmt(z.bottomStraightTop,3),'Calculated from selected angle/IDs'],
['Bottom high / normal / low interface',`${fmt(z.interfaceHigh,3)} / ${fmt(z.interfaceNormal,3)} / ${fmt(z.interfaceLow,3)}`,'Selected reserve, not measured band'],
['Extract outlet centre',fmt(z.extractOutlet,3),'Selected 200 mm above lower tangent'],
['900-mm straight lower end / tangent',fmt(z.bottomTangent,3),'Calculated dimension chain'],
['Extra bottom length',fmt(-z.bottomTangent,3),'300 + 173.205 + 1200'],
['Process straight/transition envelope',fmt(z.topTangent-z.bottomTangent,3),'4200 + 1200 + 300 + 173.205 + 1200']])}
<p><b>7073.205 mm is not the overall fabricated vessel height.</b> It excludes heads, nozzle projections, flanges where they add length, drive, shaft seal, support feet/skirt and maintenance lifting space. Heads and supports require a fresh mechanical calculation for the enlarged bottom. Cone angle does not establish stress acceptability. Pressure/vacuum design, material/corrosion allowance, shell/head thickness, reinforcement, vibration, shaft support and access remain open. The existing Stage-5 5950-mm vessel / 7000-mm overall reference is not updated.</p>
${table(['Item','Present disposition','Evidence needed to release'],[
['Active section','PRESERVED, not re-optimized','Existing active validation obligations remain; no new operating approval.'],
['Bottom 900 × 1200 + neck/cone','PRELIMINARY SELECTED LAYOUT','Actual RRBO-in-NMP volume-weighted DSD and entrainment load; acceptable dispersed carryover; outlet-mixture properties and continuous/pilot separation evidence.'],
['Top 700 × 1200','PRELIMINARY RETAINED CANDIDATE','NMP-in-RRBO lower-tail distribution; applicable deformation/mobility model or settling measurements and carryover target.'],
['End height/interface bands','LAYOUT REFERENCE ONLY','Batch settling/coalescence kinetics, band height versus load, inlet/rotor disturbance decay, outlet trajectories, surge/control envelope.'],
['Outlet flow envelope','UNBOUND SCENARIO SCREEN','Formally compatible downstream boundary binding; do not request re-entry of already available trial data.'],
['Nozzles / distributor / return area','PROVISIONAL 70-mm bulk bores','Pressure loss, local jets, open areas, vortex protection, piping/instrument/vent duties.'],
['Pressure vessel / release','HOLD — NOT FOR FABRICATION','Code/mechanical design, controls/HAZOP, vendor hydraulic approval and controlled drawing revision.']])}
<p>Next evidence should test representative equilibrated RRBO/NMP at 40 °C, including water, trace contaminants, aging/solids and worst operating condition. Sampling must not manufacture a larger drop population. Representative batch video/settling curves and continuous/pilot or vendor confirmation should establish sedimentation and interface-coalescence capacity separately. If interface merger cannot match incoming dispersed volume, band inventory grows despite a dilute velocity-screen pass.</p>

<h2 class="page">7 · Verified source basis and limitations</h2>
<p>This synthesis uses the retrieved evidence documented in <code>disengager-investigation-literature.md</code> and <code>disengager-drag-evidence.md</code>. No additional source is claimed to have been fetched for this proposal. The cited literature supplies mechanisms and model context, <b>not the chosen 200-µm duty, 50% factor, 300/600/200/100-mm allowances or 30° cone angle.</b></p>
<ol>
<li id="R1"><b>[R1] Myint, Hosokawa &amp; Tomiyama (2006), “Terminal Velocity of Single Drops in Stagnant Liquids,” JFST 1(2), 72–81.</b> <a href="https://www.jstage.jst.go.jp/article/jfst/1/2/1_2_72/_pdf/-char/en">Publisher PDF</a>; DOI 10.1299/jfst.1.72. Full paper retained. Definitions Eqs.1–3 p.72; HR Eq.4 p.73; liquid-drop Eq.9 and SN Eq.10 p.77; applicability pp.79–80. Experimental bounds: −11.6&lt;log10M&lt;−0.9, 0.17&lt;Re&lt;200, 0.017&lt;Eo&lt;12.1, 0.1&lt;κ&lt;100. Reported error is not an RRBO/NMP uncertainty guarantee.</li>
<li><b>[R2] Sulzer, Liquid-liquid separation technology.</b> <a href="https://www.sulzer.com/en/-/media/files/products/separation-technology/brochures/english/liquid_liquid_separation_technology_e10559_en_web.pdf">Full manufacturer brochure</a>. Introduction pp.2–3/Fig.1: separate drop–drop and drop–interface coalescence; “Feed Inlets and Calming Baffles,” p.9: equalization and disturbance control; coalescers pp.10–12. Supports mechanisms and optional aided separation, not universal numerical clearances or bare-gravity 250-µm acceptance.</li>
<li><b>[R3] Henschke, Schlieper &amp; Pfennig (2002), CEJ 85, 369–378.</b> <a href="https://www.sciencedirect.com/science/article/abs/pii/S1385894701002510">Publisher abstract/introduction/section previews</a>; DOI 10.1016/S1385-8947(01)00251-0. Batch determination of a coalescence parameter; film drainage and interfacial coalescence. Full paper not obtained; no degraded-preview equation imported.</li>
<li><b>[R4] Hartland &amp; Jeelani (1987), CES 42(8), 1927–1938.</b> <a href="https://www.sciencedirect.com/science/article/pii/0009250987801392">Publisher abstract</a>; DOI 10.1016/0009-2509(87)80139-2. Sedimentation/band/coalescence dependence and batch-to-continuous model selection; full text not obtained. No fixed band height transferred.</li>
<li><b>[R5] Schäfer, Hlawitschka &amp; Bart (2022), CJCE 100(9), 2331–2346.</b> <a href="https://onlinelibrary.wiley.com/doi/full/10.1002/cjce.24503">Open article</a>; DOI 10.1002/cjce.24503. §3, Fig.8 and §3.1: gravity-settler droplet behavior, vertical countercurrent head settlers and disturbance control. Mesh/horizontal laboratory dimensions are not this vessel’s sizing rules.</li>
<li><b>[R6] Pfennig group, University of Liège.</b> <a href="https://www.chemeng.uliege.be/cms/c_3668036/en/chemeng-coalescence-liquid-liquid-phase-separation-and-settlers">Coalescence, liquid-liquid phase separation and settlers</a>, introductory technical discussion: trace components and representative lab tests. <a href="https://orbi.uliege.be/bitstream/2268/298760/1/ISEC%20-%20ReDrop%20Settler%202022%20-%20005a.pdf">Leleu &amp; Pfennig, ISEC 2022, slides 31–33</a>: polydispersity/lag/swarm/settler concept; not RRBO/NMP data.</li>
<li><b>[R7] Sulzer OptimEXT extraction brochure.</b> <a href="https://www.sulzer.com/en/-/media/files/products/separation-technology/brochures/english/liquid_liquid_extraction_technology_e10556_en_web.pdf">Manufacturer PDF</a>, overview/extractors, ECR and ECP distributor sections. Phase orientation and distribution matter. <a href="https://www.sulzer.com/en/shared/products/kuehni-agitated-columns-ecr">ECR product page</a>. Neither retrieved source supplies a numerical ECR end-height/capture rule; no specific optional ECR-end coalescer arrangement is attributed to them.</li>
<li><b>Comparator only:</b> <a href="https://www.skimoil.com/uploads/4/7/1/6/47163295/api_oil_water_separator_2020.pdf">SkimOIL API-style oil/water separator brochure</a>, “Per API guidelines design criteria / Oil droplet size.” Its 150-µm refinery-wastewater convention is not direct verification of normative API 421 text and is not transferred to RRBO/NMP.</li>
</ol>
<p>No verified source proves 250–253 µm conservative. No source quantifies incoming RRBO/NMP coalesced drop size here. The d32 statistic cannot bound a fine tail, phase inversion does not preserve the old distribution, and “no coalescence credit” is not “no interfacial coalescence duty.”</p>
<h2>8 · Reproducibility and preservation</h2>
<p>Run <code>node deliverables/disengager-preliminary-proposal.mjs</code>. This standalone calculation reads frozen files only, independently solves SN force balance, compares every bottom root against the prior results, and writes this self-contained HTML plus full-precision JSON. No DB/network query, application change, workflow execution, RPM/geometry optimization or Stage-5 overwrite occurs.</p>
<p>Numerical checks: all ten bottom inverse roots match prior values within 10⁻¹² m; velocity residuals &lt;10⁻¹² m/s; mass closure &lt;10⁻⁸ kg/h; 900-mm passes and 800-mm fails the assigned 200-µm screen; elevation ordering and outlet-centre covers checked. These are computational consistency checks, not hydraulic validation.</p>
<p>Frozen input SHA-256: <code>${before[inputPath]}</code><br>Unchanged drag source SHA-256: <code>${input.provenance.dragSourceSha256}</code><br>Current Stage-1 hash: <code>${input.provenance.stage1Hash}</code><br>Stage-3 ledger ${input.provenance.stage3Id}; Stage-4 row ${input.provenance.stage4Id}; Stage-5 revision ${input.provenance.stage5Revision}. Full source-file hashes and provenance are retained in the companion JSON.</p>
<footer><b>Engineering disposition:</b> proceed with this preliminary top/active/bottom layout for review and test planning; do not release fabrication or claim guaranteed separation. No persisted engineering authority has been changed.</footer>
</main></body></html>`;
for (const path of evidencePaths) assert.equal(hash(path), before[path], `Source modified: ${path}`);
fs.writeFileSync(stem + '.results.json', JSON.stringify(calculations, null, 2) + '\n');
fs.writeFileSync(stem + '.html', html);
console.log(JSON.stringify({ files: [stem + '.html', stem + '.results.json'], requiredBottomDiameterMm: requiredD * 1000,
  processEnvelopeMm: calculations.processEnvelopeMm, checks }, null, 2));
// Optional local-file rendering only; does not start or access the application.
if (process.argv.includes('--pdf')) {
  const { default: puppeteer } = await import('puppeteer');
  const executablePath = fs.existsSync(puppeteer.executablePath()) ? puppeteer.executablePath()
    : execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim();
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1000, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('svg').map(el => el.querySelectorAll('parsererror').length).wait(), 0);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('table,svg')]
      .filter(el => el.getBoundingClientRect().right > document.querySelector('main').getBoundingClientRect().right).length);
    assert.equal(overflow, 0, 'Table/diagram extends outside document');
    await page.pdf({ path: stem + '.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="font:8px Arial;width:100%;text-align:center;color:#555">PRELIMINARY — NOT FOR FABRICATION · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    await page.screenshot({ path: stem + '-qa.png', fullPage: false });
    await (await page.$('svg')).screenshot({ path: stem + '-diagram-qa.png' });
    console.log('PDF and local-artifact QA images rendered; no application accessed.');
  } finally { await browser.close(); }
}