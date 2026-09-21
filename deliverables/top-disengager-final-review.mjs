import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Offline consolidation only. Never imports application code or accesses the DB/network.
const stem = 'deliverables/top-disengager-final-review';
const input = 'deliverables/kuhni-end-section-preliminary-calculation.input.json';
const source = 'server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts';
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protectedPaths = [...fs.readdirSync('deliverables').filter(n => !n.startsWith('top-disengager-final-review')).map(n => `deliverables/${n}`).filter(p => fs.statSync(p).isFile()), source];
const before = Object.fromEntries(protectedPaths.map(p => [p, hash(p)]));
const data = JSON.parse(fs.readFileSync('deliverables/top-disengager-physics.results.json'));
const original = JSON.parse(fs.readFileSync(input));
for (const name of ['physics.md', 'physics.tables.md', 'layout.md']) assert(fs.readFileSync(`deliverables/top-disengager-${name}`, 'utf8').length > 100);
assert.equal(before[input], data.inputSha256);
assert.equal(before[input], '3e65f398cfd714f599ab7fcb420e07c4a4d3c6637053a71498567099413536d2');
assert.equal(before[source], original.provenance.dragSourceSha256);
const cone = (900 - 700) / (2 * Math.tan(Math.PI / 6));
const topCone = (3000 - 700) / (2 * Math.tan(Math.PI / 6));
const totalA = 1600 + 4200 + 300 + cone + 1200;
const totalB = totalA + topCone;
assert.equal([200,100,600,70,300,150,180].reduce((a,b)=>a+b),1600);
assert.equal(totalA.toFixed(3),'7473.205');
assert.equal(totalB.toFixed(3),'9465.064');
const duty = data.rows.find(r=>r.diameterUm===500);
const q = data.properties.Qm3h/3600;
const u3 = q/(Math.PI*3**2/4);
assert(duty.sn.v*0.5 > u3 && duty.sn.v < data.U700MS);
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const table = (h, rows, cls='') => `<table class="${cls}"><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const fmt = (n,d=3) => n.toFixed(d);
const note = s => `<div class="notice">${s}</div>`;
const page = (n,title,body) => `<section><div class="eyebrow">TOP DISENGAGER · CONSOLIDATED ENGINEERING REVIEW · ${n} / 8</div><h1>${title}</h1>${body}</section>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 650" role="img" aria-label="Dimensioned alternatives A and B, not to scale">
<defs><marker id="a" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0 0L7 3.5L0 7" fill="none" stroke="#334155"/></marker></defs>
<rect width="960" height="650" fill="white"/>
<g font-family="Arial,sans-serif" font-size="15" fill="#17354a" stroke-linejoin="round">
<text x="20" y="28" font-weight="bold">A · Preferred development route</text><text x="500" y="28" font-weight="bold">B · Area-only comparison / return HOLD</text>
<g stroke="#334155" stroke-width="2">
<rect x="95" y="65" width="110" height="160" fill="#fff0c9"/><rect x="95" y="225" width="110" height="220" fill="#edf2f7"/>
<rect x="95" y="445" width="110" height="35" fill="#edf2f7"/><path d="M95 480L75 510H225L205 480Z" fill="#edf2f7"/><rect x="75" y="510" width="150" height="100" fill="#e4eff4"/>
<rect x="520" y="65" width="230" height="120" fill="#fff0c9"/><path d="M520 185L585 300H685L750 185Z" fill="#fff0c9"/><rect x="585" y="300" width="100" height="145" fill="#edf2f7"/>
<rect x="585" y="445" width="100" height="35" fill="#edf2f7"/><path d="M585 480L565 510H705L685 480Z" fill="#edf2f7"/><rect x="565" y="510" width="140" height="100" fill="#e4eff4"/>
<path d="M205 115H270 M750 105H795" marker-end="url(#a)"/>
<path d="M635 205V258" stroke="#b7492a" marker-end="url(#a)"/><path d="M575 260H695" stroke="#b7492a" stroke-dasharray="5 4"/>
<path d="M52 65V610 M490 65V610" marker-start="url(#a)" marker-end="url(#a)"/>
<path d="M95 92H205 M520 88H750" stroke="#187e91" stroke-dasharray="5 4"/>
</g>
<text x="238" y="78">Ø700 × 1600 [E]</text><text x="238" y="105">Top tangent 5800 [C]</text>
<text x="238" y="133">Withdrawal → guard</text><text x="238" y="154">package TBD / HOLD</text><text x="238" y="175">outside vessel chain</text>
<text x="238" y="232">Active top 4200 [I]</text><text x="238" y="320">Ø700 × 4200 [I]</text><text x="238" y="344">Active unchanged</text>
<text x="238" y="452">Active bottom 0 [I]</text><text x="238" y="480">Ø700 × 300 neck [I]</text><text x="238" y="507">Cone 173.205 [I/C]</text>
<text x="238" y="547">Ø900 × 1200 [I]</text><text x="238" y="573">Bottom unchanged</text><text x="238" y="611">−1673.205 [C]</text>
<text x="35" y="370" transform="rotate(-90 35 370)">7473.205 tangent separation [C]</text>
<text x="760" y="75">Ø3000 ×1600 [E]</text><text x="760" y="133">7791.858 [C]</text><text x="760" y="183">6191.858 [C]</text>
<text x="760" y="220">Top cone [C]</text><text x="760" y="243">1991.858 high</text><text x="760" y="266">30° to axis [E]</text>
<text x="525" y="289" font-size="12" fill="#a13e24">500 µm return stalls; protected drain HOLD</text>
<text x="718" y="340">Same active [I]</text><text x="718" y="476">Same neck [I]</text><text x="718" y="501">Same cone [I/C]</text><text x="718" y="555">Same bottom [I]</text>
<text x="476" y="385" transform="rotate(-90 476 385)">9465.064 tangent separation [C]</text>
<text x="20" y="638" font-size="13">All dimensions mm. Schematic / not to scale. Heads, drive, supports and separation/return package NOT included.</text>
</g></svg>`;

const pages = [
page(1,'Decision: reserve a layout,<br>do not certify separation',`
${note('<b>TOP DIAMETER, FINE CAPTURE AND FABRICATION RELEASE: HOLD.</b> This is a completed engineering review, not finalized hydraulic geometry. Neither the active section nor the bottom is reopened.')}
<p><b>Preferred development route A:</b> reserve <b>Ø700 × 1600 mm straight</b> for top layout only, replacing the current top’s 1200 mm straight reservation. Qualify aided and/or guard separation against a real carryover specification. No validated or sized coalescer is implied.</p>
<p>The Ø700 shell <b>fails the assigned 500 µm bare-gravity screen</b>. That drop size is engineer-selected, not a proven exit percentile or conservative lower bound. A bare Ø3000 top passes only the nominal local-area calculation; unchanged drops cannot return through its narrowing cone and the frozen Ø700 throat. A large vessel is not recommended for fabrication on an arbitrary cutoff.</p>
${table(['Classification key','Meaning in this review'],[
['I · Inherited','Frozen geometry or source basis; not newly approved. Historical bottom selections remain preliminary.'],
['C · Calculated','Arithmetic/model output conditional on stated inputs and assumptions. Not a measurement.'],
['E · Engineer-selected','Duty, candidate size or spatial allowance chosen for review, not a literature minimum.'],
['A · Assumed','Unverified physical condition or provisional opening/property interpretation.'],
['HOLD','Evidence or design missing; no hydraulic/fabrication release.'],
['PASS — scoped','Only the named arithmetic, spatial or assigned model check passes; never blanket approval.']])}
<h2>Complete proposed chain — dimensions in mm</h2>
${table(['Top → bottom','Classification'],[
['700 ID × 1600 straight → 700 ID × 4200 active → 700 ID × 300 neck → cone 173.205 → 900 ID × 1200 bottom','Top E; active/neck/bottom I; cone I/C'],
['7473.205 tangent-to-tangent separation, excluding heads','C from the complete chain; not overall equipment height'],
['Alternative B: 3000 ID × 1600 straight + TOP cone 1991.858; same active and bottom; total 9465.064','IDs/straight E; top cone and integrated chain C; return HOLD']])}
<p>The current 1600 mm reservation is the <em>exact sum of selected allowances</em>, not a uniquely calculated minimum. External guard-package footprint, height, inventory, pressure drop and collection/return route remain <b>TBD/HOLD outside the vessel chain</b>. The complete system envelope is therefore not dimensioned or certified.</p>
<p class="small">Authority: top-disengager-layout.md §8 controls alternative integration; top-disengager-physics.md and its JSON/table outputs control the conditional calculations. Previous reports are preserved, not silently amended.</p>`),
page(2,'Basis, equations and<br>limits of the model',`
${table(['Basis item','Value / classification'],[
['Frozen active','Ø700 × 4200 mm; 20 × 210 mm compartments; rotor Ø231 mm [I]. 30 rpm; adopted Np 1.2 [I]. Existing terminal internals unchanged.'],
['Frozen bottom','Ø700 × 300 mm neck; 30° half-angle cone, 173.205 mm rise; Ø900 × 1200 mm straight [I; cone rise also C]. Prior preliminary-scope PASS is retained, not new qualification.'],
['Top continuous / dispersed phase','Upward RRBO-rich / downward NMP-rich drops [I nominal orientation; A dilute flow].'],
['Nominal 40 °C properties','ρc 869, ρd 1015 kg/m³; μc 0.0598, μd 0.001416 Pa·s; Δρ 146 kg/m³; σ 0.011 N/m; g 9.80665 m/s² [I nominal proxies, not measured outlet mixture].'],
['Throughput','N4 Qtop 3.821794230 m³/h; N7 3.772927000 m³/h [I unbound flow proxies]. Use N4 worst top flow, not entrained NMP load.'],
['Assigned duty / area factor','500 µm drop [E]; f = 0.50 [E, unqualified engineering assumption]; no coalescence-growth credit [A].']])}
<p>Outlet scenarios are not a bound downstream operating state; existing Stage-2 release ineligibility is not cured here. No production model, persisted authority, active design or bottom duty is changed.</p>
<div class="eq">CD ρc vt²/2 = (2/3)d Δρ g<br>Re = ρc vt d/μc; Eo = Δρ g d²/σ; We = ρc vt²d/σ; Ca = μc vt/σ<br>CD,SN = (24/Re)(1 + 0.15 Re<sup>0.687</sup>)<br>vt,Stokes = Δρ g d²/(18μc)<br>vt,HR = vt,Stokes × 3(1+κ)/(2+3κ), κ = μd/μc<br>U = Q/A; Areq = Q/(f vt); Dreq = √[4Q/(π f vt)]</div>
<p><b>Calculated:</b> κ = 0.02367893; Morton M = 0.01821632 (log₁₀M ≈ −1.73954). The clean creeping HR mobility factor is 1.482850. The finite-Re clean comparison uses CD,clean = CD,SN × (2+3κ)/[3(1+κ)] from Myint Eq. 9 at zero surfactant parameter, <b>explicitly extrapolated</b> below its tested viscosity ratio.</p>
<p>At 500 µm, Re 0.002410, Eo 0.032540, We 4.35×10⁻⁶ and Ca 0.001803 support near-spherical dilute screening. SN is only 0.238% below Stokes; interfacial mobility is the larger uncertainty. Even the clean result cannot rescue Ø700.</p>
<p>At 2–6 mm deformation and finite-Re effects matter: at 6.068 mm Eo 4.793, Re 3.233 and We 0.644. Large-drop SN and clean values are <b>diagnostics, not a validated deforming-drop curve</b>. No verified all-regime closure at this viscosity ratio is established. The immobile endpoint is not a guaranteed bound for swarms, contaminated phases, deforming drops or local flow. No bubble correlation or oil/water cutoff is substituted.</p>`),
page(3,'Full fine-tail screen<br>and uncertainty',`
<p>All velocities, dimensionless groups and required IDs below are <b>C</b> under the nominal model and <b>E</b> factor f=0.50. Drop test sizes are <b>E</b>; the 6068 µm row approximates the inherited active mean, not a tail percentile. Every required ID is a calculated screening dimension, <b>not a shell selection</b>.</p>
${table(['Drop<br>µm','SN vt<br>mm/s','Re','Eo','We','HR*<br>mm/s','Clean*<br>mm/s','SN ID<br>mm','Clean ID*<br>mm'],data.rows.map(r=>[r.diameterUm,fmt(r.sn.v*1000,6),r.sn.Re.toPrecision(5),r.sn.Eo.toPrecision(5),r.sn.We.toPrecision(5),fmt(r.sn.HR*1000,6),fmt(r.cleanExtrapolation.v*1000,6),fmt(r.requiredIDm*1000,1),fmt(r.cleanExtrapolationIDm*1000,1)]),'tight')}
<p class="small">*HR requires creeping, spherical, clean conditions; finite-Re clean values extrapolate below the tested viscosity ratio. Neither is a guaranteed bound. The exact row is 6.068 mm versus inherited d32 = 6.068311766 mm. d32 cannot bound the fine-tail volume fraction.</p>
${table(['Assumed 500 µm sensitivity [E/A], not statistical','Required ID [C], mm'],[
['Nominal','2854.6'],['μc +25%','3190.6'],['Δρ −20%','3191.0'],['Q +10%','2994.0'],['Additional 20% speed derating, unqualified','3191.6'],['All four combined','4182.4']])}
<p>These are scenario sensitivities, not tolerances, independent random variables or a confidence interval. The combined case’s illustrative Ø4300 mm candidate [E] covers only that calculation; it is <b>not recommended fabrication geometry</b>. Nominal Ø3000 has only about 10.4% excess area over the 2854.6 mm requirement.</p>
<p>In creeping flow D ∝ √(Qμc/(fΔρ))/d. A 250 µm duty nearly doubles ID; 100 µm yields 14.26 m. Such results motivate alternative separation technology, not giant-shell procurement. At f=0.4 / 0.6 [E sensitivity], calculated 500 µm IDs are approximately 3191.6 / 2605.9 mm. Do not loosen f simply to obtain PASS.</p>
${table(['Candidate ID [E], mm','700','900','1200','1500','2000','3000','4000'],[
['Conditional SN cutoff [C], µm','2080.748','1604.444','1196.472','954.681','714.577','475.717','356.616']],'tight')}
<p>σ does not enter spherical SN speed, but controls deformation applicability. Halving σ doubles Eo: 0.06508 at 500 µm and approximately 9.59 at the mean. No empirical deformation correction is claimed.</p>`),
page(4,'Capture is not return;<br>area PASS is not release',`
${table(['Nominal result [C]','Ø700 [I/E]','Ø3000 [E]'],[
['Upward U, mm/s','2.758537','0.150188'],
['500 µm terminal speed, mm/s','0.331746','0.331746'],
['500 µm net downward speed vt − U, mm/s','−2.426792','+0.181558'],
['Assigned f=0.50 area screen','FAIL','PASS — nominal local area only']])}
<p>At Ø700 the required vt is 5.517074 mm/s. SN equality corresponds to 2.080748 mm [C]; zero net downward motion is a different equality, 1.455343 mm [C]. Neither is a measured tail or a demonstrated coalescence product. Even 2 mm narrowly fails the stipulated area margin. More height cannot reverse a negative net velocity.</p>
<div class="eq">vdown,net(D) = vt − 4Q/(πD²)<br>Dstall = √[4Q/(πvt)] = Drequired,f=0.5 / √2</div>
<p>For the assigned 500 µm duty, Dstall ≈ 2018.5 mm [C]. In B’s cone this is about 1141.9 mm above its lower end, Z ≈ 5341.9 mm [C diagnostic]. Below this narrowing section, constant-size drops are transported upward. This is a topology warning, not a sharp physical accumulation ring: real cone velocities are nonuniform. Accumulation, coalescence or wall-film drainage are not granted as a return mechanism.</p>
${table(['Drop duty [E]','Area ID [C], mm','Zero-net ID [C], mm','Net down at Ø700 [C], mm/s'],[
['500 µm','2854.6','2018.5','−2.426792'],['1 mm','1432.7','1013.0','−1.441433'],['2 mm','727.1','514.1','+2.355026']])}
<h2>Two development routes, neither qualified</h2>
<p><b>A:</b> external raffinate guard-separation package and independently designed NMP collection/return. Package dimensions and pressure/inventory effects are <b>TBD/HOLD and excluded from the vessel envelope</b>. An internal coalescer is an option only after thickness, supports, drainage and maintenance space are known; it cannot occupy the credited clear quiet zone without rebuilding the height chain.</p>
<p><b>B:</b> qualified collector above the obstructed-return region with a segregated liquid-sealed downcomer or controlled pumped return to an approved receiving location. Check collection, continuous-phase bypass, hydrostatic/pressure balance, losses, capacity, plugging, gas sealing, discharge interaction and startup/upset behavior. The fresh-solvent rate is <b>not</b> the entrained return load. The provisional collection space is not proof of fit.</p>
<h2>No actual removal efficiency is known</h2>
<div class="eq">Uncaptured dispersed volume rate = Qe ∫[1 − η(d)] pV(d) dd</div>
<p>Entrained load Qe, volume-weighted distribution pV and size-dependent efficiency η are all unqualified. Set permitted physical NMP carryover separately from dissolved NMP; gravity/coalescence does not remove molecularly dissolved solvent. A selected cutoff cannot establish percent removal or compliance with a total-solvent constraint.</p>`),
page(5,'Selected top height and<br>the current 1200 mm comparison',`
<p>A uses local z=0 at active top (global Z=4200 mm [I]); B uses the same upper-straight stack above its top cone. All allowance values are <b>E</b> except the actual clear bore <b>A</b>; their elevations and totals are <b>C</b> from that selection. Qualification of every functional allowance is <b>HOLD</b>.</p>
${table(['Region / feature','z range [C], mm','Allowance / basis'],[
['Terminal-stator calming / return clearance','0–200','200 mm [E]; obstruction assumed at/below zero [A]'],
['Down-directed distributor + supports','200–300','100 mm [E]; feed CL 250 mm [E]'],
['Unobstructed quiet return path','300–900','600 mm [E], ends at outlet lower edge'],
['Raffinate opening','900–970','70 mm actual clear bore [A]; CL 935 [C]'],
['Crown cover at low level','970–1270','300 mm [E]; CL cover 335 [C]'],
['Liquid–gas operating band','1270–1420','150 mm [E]; normal 1345 ±75 [C]'],
['High level to top tangent dry space','1420–1600','180 mm [E]; no head credit'],
['Total straight','0–1600','200+100+600+70+300+150+180 = 1600 mm [C/E]']])}
<p>The top is predominantly RRBO-rich liquid with descending NMP drops. The free surface is <b>liquid–gas, not an invented upper NMP/RRBO interface</b>. Confirm a real controlled gas space; a fully flooded design requires another pressure/inventory review. A solid calming plate must not block NMP return. No hole pattern, jet velocity or momentum-decay length is established by this reservation.</p>
${table(['Comparison [mm]','Current inherited top','Proposed A','Compact fallback'],[
['Straight / quiet allowance','1200 [I] / 600 [I]','1600 [E] / 600 [E]','1200 [I] / 200 [C/E]'],
['Local feed CL','150 [I]','250 [E]','250 [E]'],
['Outlet CL / crown','900 [I] / 935 [C]','935 / 970 [C]','535 / 570 [C]'],
['Low / normal / high level','1000 / 1050 / 1100 [I]','1270 / 1345 / 1420 [C]','870 / 945 / 1020 [C]'],
['Low crown / CL cover','65 / 100 [C/I]','300 / 335 [E/C]','300 / 335 [E/C]'],
['High-level dry allowance','100 [C]','180 [E]','180 [E]']])}
<p>Keeping the new allowances and the old 600 mm quiet path in 1200 mm <b>does not fit: short by 400 mm [C]</b>. The compact fallback leaves only 200 mm quiet height and moves withdrawal near the distributor: HOLD / not preferred. A’s greater height does not repair its failed fine-drop area screen.</p>
<p>Confirm the terminal-stator upper face, shaft and supports. Projections above the datum consume clearance: increase or move the end-section stack, not the frozen active pitch/rotors. Additional intake bells, vortex devices, internal coalescers or collectors require another fit check; no hidden space allowance is available.</p>`),
page(6,'Dimensioned integrated<br>vessel alternatives',`
${svg}
${table(['Feature (global Z, mm)','A: Ø700 top','B: Ø3000 top','Type'],[
['Bottom tangent / active bottom','−1673.205 / 0','−1673.205 / 0','C / I'],
['Active top / upper straight start','4200 / 4200','4200 / 6191.858','I / C'],
['Fresh feed CL','4450','4450, lower cone','E (both)'],
['Clear quiet region','4500–5100','6491.858–7091.858','C'],
['Outlet lower edge / CL / crown','5100 / 5135 / 5170','7091.858 / 7126.858 / 7161.858','C'],
['Low / normal / high free surface','5470 / 5545 / 5620','7461.858 / 7536.858 / 7611.858','C'],
['Top tangent / tangent separation','5800 / 7473.205','7791.858 / 9465.064','C']],'tight')}
<p class="small">B: Hcone=(3000−700)/(2 tan30°)=1991.858 mm [C from E angle/ID]. No cone height is credited as quiet settling. Terminal-stator clearance remains in the lower cone; the upper straight’s 200 mm is a separate expansion-exit reserve. Its next 100 mm is a provisional collector/redistributor reservation, not validated fit. Keep fresh feed near active top, not automatically at the upper straight. B’s straight height may increase when collection/return hardware is designed. Diagram omits unspecified heads and package dimensions rather than implying that they fit.</p>`),
page(7,'Withdrawal, inventory and<br>height qualification',`
<h2>Submergence analog — not a separation standard</h2>
<div class="eq">At Q=0.001061609508 m³/s and assumed d=0.070 m:<br>V=4Q/(πd²)=0.275854 m/s; Fr=V/√(gd)=0.332943<br>HI intake analog S=d(1+2.3Fr)=123.604 mm [C]</div>
<p>The Hydraulic Institute public source defines S to the entry center; the NRC-hosted Alden tank-outlet study uses centerline submergence for horizontal nozzles. These concern liquid withdrawal beneath a free surface and gas-core vortices, <b>not liquid–liquid separation or interface drawdown</b>. This is an analog, not verified ANSI/HI compliance for this viscous agitated extractor.</p>
<p>Current 100 mm center cover [I] is below the analog. Proposed 335 mm center / 300 mm crown cover [C/E] is about 2.71 times it: <b>PASS for numerical comparison only</b>. That margin is an engineering selection, not a published safety factor. Nozzle Re≈281; viscosity, swirl, return momentum and actual approach geometry differ from many water experiments. Vortex freedom remains HOLD. NPSH requires separate pump/system pressure, vapor-pressure and loss data.</p>
<p><b>Bore is not DN.</b> The assumed 70 mm opening is not “DN70” and DN80 does not establish actual bore. Confirm schedule, lining, entry and internal takeoff. The inherited 0.5 m/s bulk-velocity screen is engineer-selected, not a standard or distributor-jet criterion. A vortex suppressor may be required; no reduced-cover credit is allowed before validation.</p>
<h2>Liquid height is not gross shell height</h2>
${table(['Calculated illustration at Ø700','Value / consequence'],[
['Area; liquid heights at low/normal/high','0.3848451 m²; 1270 / 1345 / 1420 mm [C]'],
['Gross liquid volumes at those levels','0.488753 / 0.517617 / 0.546480 m³, before internals'],
['Full 150 mm selected band inventory','0.057727 m³; 54.38 s across full band at full-outlet-rate imbalance; 27.19 s normal-to-limit'],
['600 mm path at conditional 2.080748 mm cutoff','Return and bulk passage both 217.51 s; equality follows vt=2U, not independent capture proof'],
['Ø3000, 500 µm ideal travel per metre','≈5508 s / 91.8 min; not a required residence-time prescription'],
['Ø3000 full 150 mm selected band','1.06029 m³ gross; not validated upset capacity']])}
<p>Use treturn=L/(vt−U) only for vt&gt;U in ideal uniform counterflow. Outlet-cover inventory is not automatically extra upstream settling path; streamlines can turn into the side outlet. Increasing height cannot cure a failed area criterion.</p>
<p>Required surge follows ΔV=∫(Qin−Qout)dt for agreed disturbances, detection/action time, level error, alarms and trips. Full raffinate rate is merely a scale illustration, not the real imbalance. Operating levels are not approved trip settings. Undershoot must not breach cover; high dry allowance is not free usable surge. Calming, distribution, local flow, return capacity and control dynamics remain HOLD.</p>`),
page(8,'Release gates, evidence<br>and preservation',`
${table(['Decision','Disposition / evidence needed'],[
['Frozen active and bottom','PASS — scope/dimension integrity only. Bottom’s existing preliminary scope is not new hydraulic qualification.'],
['Selected top stack / chain','PASS — arithmetic and preliminary fit only; not uniquely required hydraulic height.'],
['Ø700 fine capture','FAIL assigned 500 µm gravity screen; actual carryover and top diameter HOLD.'],
['Ø3000 alternative','PASS nominal local area only; bare return NOT PASS. Protected collector/return HOLD.'],
['Aided/guard separation','HOLD: actual DSD/load, carryover target, representative equilibrated properties, wettability, fouling, drainage, pressure and maintenance envelope.'],
['Final top / fabrication','HOLD: calibrated settling/coalescence and distribution evidence, qualified controls/outlet, heads, pressure/vacuum/code design, shaft/supports, access and controlled drawing.']])}
<h2>Verified-source record and access limits</h2>
<p class="small">Retrieval claims below belong to the supplied independent reviews; this consolidation did not re-fetch sources. No reviewed source supplies the selected cutoff, factor or layout allowances. No directly applicable measured NMP-in-RRBO outlet DSD or terminal-speed data was identified in that search; this is not proof that none exists.</p>
<ol class="sources">
<li><b>Myint, Hosokawa &amp; Tomiyama (2006), Terminal Velocity of Single Drops in Stagnant Liquids.</b> <a href="https://doi.org/10.1299/jfst.1.72">https://doi.org/10.1299/jfst.1.72</a>. Publisher abstract fetched; retained full original/text checked. Eqs. 4, 9, 10. Tested −11.6&lt;log₁₀M&lt;−0.9, 0.17&lt;Re&lt;200, 0.017&lt;Eo&lt;12.1, 0.1&lt;κ&lt;100. Our κ is outside and 500 µm Re below range. Reported ~10% error is not our design error bar.</li>
<li><b>Taylor &amp; Acrivos (1964), deformation and drag of a falling viscous drop.</b> <a href="https://doi.org/10.1017/S0022112064000349">https://doi.org/10.1017/S0022112064000349</a>. Cambridge abstract/record only; full paper not obtained. Supports deformation corrections and shape changes; no unread equation or numerical error bound transferred.</li>
<li><b>Myint et al. (2007), Shapes of Single Drops Rising Through Stagnant Liquids.</b> <a href="https://doi.org/10.1299/jfst.2.184">https://doi.org/10.1299/jfst.2.184</a>. Publisher abstract only. Surfactants affect shape; tested κ=0.1–100, Re=0.015–850, Eo=0.017–9.3. No aspect-ratio correction imported below κ range.</li>
<li><b>University of Liège/Pfennig, Coalescence, liquid-liquid phase separation and settlers.</b> <a href="https://www.chemeng.uliege.be/cms/c_3668036/en/chemeng-coalescence-liquid-liquid-phase-separation-and-settlers">https://www.chemeng.uliege.be/cms/c_3668036/en/chemeng-coalescence-liquid-liquid-phase-separation-and-settlers</a>. Research-group page fetched: original-material tests, trace components, separate settling/coalescence and viscous fine tails; no service-specific cutoff.</li>
<li><b>Hydraulic Institute, Submergence.</b> <a href="https://datatool.pumps.org/pump-fundamentals/submergence">https://datatool.pumps.org/pump-fundamentals/submergence</a>. Public explanation read, updated July 19, 2024; center definition and Hecker relation verified. Full ANSI/HI standard not reviewed; inconsistent product-link labels not used as evidence.</li>
<li><b>Johansson/Alden, Vortexing and Air Withdrawal Evaluations for Storage Tanks.</b> <a href="https://www.nrc.gov/docs/ml1315/ML13150A180.pdf">https://www.nrc.gov/docs/ml1315/ML13150A180.pdf</a>. NRC-hosted presentation read; nozzle center/suction-plane conventions and return-flow influence. Does not validate this viscous extractor.</li>
</ol>
<h2>Offline audit</h2>
<p class="small">Reproduce: <code>node deliverables/top-disengager-final-review.mjs --pdf</code>. Reads preserved inputs; writes only this new report prefix. Companion results JSON records all protected-file SHA-256 hashes and arithmetic assertions. No app/DB/workflow access. Frozen input SHA-256:<br><code>${before[input]}</code><br>Unchanged hydraulic source SHA-256:<br><code>${before[source]}</code></p>
<p><b>Final recommendation:</b> develop A as a transparent layout reservation with explicitly unsized qualified separation/return equipment. Do not certify top diameter, capture efficiency or fabrication geometry until the specified duty and integrated return path are demonstrated.</p>`)
];
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Top disengager — final engineering review, release HOLD</title><style>
*{box-sizing:border-box}body{margin:0;background:#e9eef2;color:#233647;font:14px/1.42 Arial,sans-serif}section{width:210mm;min-height:297mm;margin:20px auto;padding:16mm 15mm;background:white}h1{font-size:29px;line-height:1.1;margin:9px 0 17px;color:#173d53}h2{font-size:17px;margin:15px 0 7px;color:#173d53}p{margin:9px 0}.eyebrow{font-size:10px;letter-spacing:1.1px;color:#517386;font-weight:bold}.notice{border-left:4px solid #b57c28;background:#fff3d7;padding:12px 14px;margin:12px 0}table{border-collapse:collapse;width:100%;font-size:11px;margin:10px 0}th,td{padding:6px 7px;border:1px solid #cbd8e1;text-align:left;vertical-align:top}th{background:#e9f0f4}tr{break-inside:avoid}.tight{font-size:9.5px}.tight td,.tight th{padding:5px 4px}.eq{padding:11px;background:#f0f4f6;font:12px/1.5 monospace}.small{font-size:10.5px}.sources{font-size:10.5px;line-height:1.36;padding-left:17px}.sources li{margin:7px 0}a{color:#17627c;overflow-wrap:anywhere}code{overflow-wrap:anywhere;font-size:10px}svg{width:100%;height:auto} @page{size:A4;margin:0} @media print{body{background:white;font-size:10pt}section{margin:0;width:auto;height:297mm;min-height:0;padding:14mm 14mm 15mm;break-after:page;overflow:visible}section:last-child{break-after:auto}h1{font-size:23pt}table{font-size:8.1pt}th,td{padding:5px 6px}.tight{font-size:7.2pt}.sources,.small{font-size:7.8pt}}
@media print{svg{max-height:112mm}}
</style></head><body>${pages.join('')}</body></html>`;
fs.writeFileSync(stem+'.html',html);
const checks = { inputHashMatches:true, sourceHashMatches:true, selectedStackMm:1600, totalAMm:totalA, totalBMm:totalB, assigned700Screen:false, assigned3000LocalArea:true, bare500MicronReturnThrough700:false };
if (process.argv.includes('--pdf')) {
  const { default: puppeteer } = await import('puppeteer');
  const executablePath = fs.existsSync(puppeteer.executablePath()) ? puppeteer.executablePath() : execFileSync('which',['chromium'],{encoding:'utf8'}).trim();
  const browser = await puppeteer.launch({ executablePath,headless:true,args:['--no-sandbox'] });
  try {
    const p = await browser.newPage();
    await p.setViewport({width:1100,height:1150,deviceScaleFactor:1});
    await p.setRequestInterception(true);
    p.on('request',r=>r.abort());
    await p.setContent(html,{waitUntil:'domcontentloaded'});
    await p.emulateMediaType('print');
    const overflow = await p.evaluate(()=>[...document.querySelectorAll('section')].map((s,i)=>({page:i+1,bottom:s.getBoundingClientRect().bottom,last:s.lastElementChild.getBoundingClientRect().bottom})).filter(s=>s.last>s.bottom-35));
    assert.deepEqual(overflow,[],'Content exceeds page body');
    await p.pdf({path:stem+'.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
    await p.emulateMediaType('screen');
    await (await p.$('svg')).screenshot({path:stem+'.diagram-qa.png'});
  } finally { await browser.close(); }
}
for (const path of protectedPaths) assert.equal(hash(path),before[path],`Protected file changed: ${path}`);
fs.writeFileSync(stem+'.results.json',JSON.stringify({status:'REPORT_COMPLETE_TOP_RELEASE_HOLD',checks,protectedFileHashes:before},null,2)+'\n');
console.log(JSON.stringify(checks,null,2));