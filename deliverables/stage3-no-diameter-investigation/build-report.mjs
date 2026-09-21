// Offline reporting only: reads one previously exported, read-only database snapshot.
// Does not import or call an optimizer, hydraulic solver, service, or database client.
import fs from 'node:fs';
import path from 'node:path';
const out = path.dirname(new URL(import.meta.url).pathname);
const saved = JSON.parse(fs.readFileSync('/tmp/stage3-investigation-data.json', 'utf8'));
const { row, design } = saved;
const result = row.result_snapshot.result;
const orientation = result.orientationComparison.find(o => o.orientation === 'rrbo-continuous-nmp-dispersed');
const groups = orientation.geometryGrid;
const trials = groups.flatMap(g => g.trials);
const selected = trials.filter(t => [.3, .6, .9, 1.2, 1.5].includes(t.diameterM)
  && t.rotorToColumn === .33 && t.hcToColumn === .3 && t.freeArea === .4);
const f = (x, digits = 5) => x == null ? '—' : Number(x).toPrecision(digits);
const table = (head, rows) => `| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |\n${rows.map(r => `| ${r.join(' | ')} |`).join('\n')}`;
const diameterRows = [...new Set(trials.map(t => t.diameterM))].map(d => {
  const gs = groups.filter(g => g.geometry.columnDiameterM === d);
  const windows = gs.filter(g => g.operatingWindow);
  return [d, gs.length, windows.length, gs.flatMap(g => g.trials).filter(t => t.hydraulicPass).length,
    windows.length ? Math.max(...windows.map(g => g.operatingWindow.widthRpm)) : 'none'];
});
const rpmRows = [...new Set(trials.map(t => t.rpm))].map(n => {
  const tt = trials.filter(t => t.rpm === n);
  const best = tt.reduce((a, b) => a.actualLoading < b.actualLoading ? a : b);
  return [n, tt.filter(t => t.hydraulicPass).length, `${best.diameterM} / ${best.rotorToColumn} / ${best.hcToColumn} / ${best.freeArea}`,
    f(best.actualLoading), f(.7 - best.actualLoading), best.hydraulicMethod.governing.operatingRoots.length];
});
const allScenarios = trials.flatMap(t => t.hydraulicMethod.scenarios);
const audit = {
  trialCount: trials.length, scenarioCount: allScenarios.length,
  acceptedTrialCount: trials.filter(t => t.hydraulicPass).length,
  feasibleGeometryCount: groups.filter(g => g.operatingWindow).length,
  nullRootBelowCapacity: allScenarios.filter(s => s.operatingHoldup === null && s.loading < 1).length,
  nullRootDespiteStoredRoots: allScenarios.filter(s => s.operatingHoldup === null && s.operatingRoots.length).length,
  loadingRootContradictions: allScenarios.filter(s => (s.loading > 1) !== (s.operatingRoots.length === 0)).length,
  maximumAbsoluteForceResidualN: Math.max(...allScenarios.map(s => Math.abs(s.forceBalanceResidualN))),
  maximumAbsoluteOperatingBalanceResidualMS: Math.max(...allScenarios.map(s => Math.abs(s.operatingBalanceResidualMS ?? 0))),
  governingScenarioKinds: [...new Set(trials.map(t => `${t.hydraulicMethod.governing.coefficient} ${t.hydraulicMethod.governing.interfaceScenario}`))],
  maximumTipSpeedMS: Math.max(...trials.map(t => t.tipSpeedMS)),
  branchStatusCounts: allScenarios.reduce((a,s) => ({...a,[s.branchStatus]:(a[s.branchStatus]??0)+1}),{}),
};
const evidence = {
  provenance: { projectNumber: design.project_number, designId: design.id, ledgerRowId: row.id,
    ledgerCreatedAt: row.created_at, stage1UpdatedAt: design.updated_at,
    currentStage1Hash: design.input_data.immutableHash, storedStage1Hash: row.stage1_snapshot_hash,
    ledgerImmutableHash: row.immutable_hash, ledgerImplementationHash: row.implementation_hash,
    queryMode: 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT; ROLLBACK',
    integrityChecks: 'Stage1 validation, ledger canonical hash, and result calculation hash verified without calculation',
  },
  metadata: row.result_snapshot.metadata, status: result.status, blockers: result.blockers,
  controls: result.controls, processBasis: result.processBasis,
  selectedGeometry: result.selectedGeometry, selectedRpm: result.selectedRpm,
  stage4GeometryInput: result.stage4GeometryInput,
  selectionRationale: result.selectionRationale,
  audit, diameterRows, rpmRows,
  rankingWindows: groups.map(g => ({geometry:g.geometry,operatingWindow:g.operatingWindow})),
  selectedStoredTrials: selected,
};
fs.writeFileSync(path.join(out, 'saved-evidence.json'), JSON.stringify(evidence, null, 2));
const csvHeaders = ['D_m','rpm','rotor_D','hc_D','free_area','pass','reasons','d32_mm','epsilon_W_kg','terminal_m_s','Garthe_factor','characteristic_m_s','capacity_m_s','loading','flood_phi','operating_phi','root_count','tip_m_s','rotor_Re'];
const csvRows = trials.map(t => {
  const m=t.hydraulicMethod,s=m.governing;
  return [t.diameterM,t.rpm,t.rotorToColumn,t.hcToColumn,t.freeArea,t.hydraulicPass,t.reasons.join(';'),
    s.d32M*1000,m.epsilonWKg,s.terminalSpeedMS,s.characteristicFactor,s.characteristicSpeedMS,s.capacityMS,
    s.loading,s.floodHoldup,s.operatingHoldup,s.operatingRoots.length,m.tipSpeedMS,m.rotorReynolds];
});
fs.writeFileSync(path.join(out,'all-rrbo-trials.csv'),[csvHeaders,...csvRows].map(r=>r.join(',')).join('\n')+'\n');
const representativeTable = tt => table(
  ['D m','rpm','d32 mm','ε W/kg','terminal m/s','Garthe factor','vchar m/s','capacity m/s','loading','φ operating','φ capacity','roots'],
  tt.map(t => {const m=t.hydraulicMethod,s=m.governing;return [t.diameterM,t.rpm,f(s.d32M*1000),f(m.epsilonWKg),f(s.terminalSpeedMS),f(s.characteristicFactor),f(s.characteristicSpeedMS),f(s.capacityMS),f(s.loading),f(s.operatingHoldup),f(s.floodHoldup),s.operatingRoots.length];}));
const fixed40=selected.filter(t=>t.rpm===40);
const md = `# Why Stage 3 has no final column diameter

## Executive finding

The saved run completed successfully; it did **not** fail to calculate. In the saved RRBO-continuous orientation, increasing speed makes predicted droplets smaller, reduces settling/characteristic/swarm capacity, and raises loading. Every sampled geometry at **45–70 rpm** exceeds the accepted **0.70 loading limit**. The largest accepted fixed-geometry span is consequently **30–40 rpm = 10 rpm**, not 20 rpm. The current selection policy requires **two distinct diameters with a ≥20 rpm contiguous accepted span**; it finds zero and deliberately returns no selected diameter or Stage 4 geometry.

This is a coupled **model-capacity limitation on the searched grid → narrow accepted windows → selection-policy gate**, not just a missing UI value. Neither a physical impossibility for all real columns nor a universally necessary 20-rpm physical law has been established.

## 1. Provenance and exact status

- Project **236**, design **269**, newest candidate **${row.result_snapshot.metadata.id}**, completed ledger row **${row.id}**, saved **${row.created_at}**.
- Requested **${row.result_snapshot.metadata.requestedAt}**. Persisted metadata status **completed**, no persisted error; calculated status **${result.status}**, blocker **${result.blockers.join(', ')}**.
- Current saved Stage 1 hash and candidate source hash both **${design.input_data.immutableHash}**. Stage 1 last updated **${design.updated_at}**. This is not a stale candidate.
- Latest ledger ordering was checked separately: row 69 completed supersedes row 68 running for this candidate; row 67 is the previous completed candidate.
- Candidate kind **RRBO_P1_CANDIDATE_ONLY**, engine **${row.result_snapshot.metadata.version}**, implementation hash **${row.implementation_hash}**.
- Stage 1 snapshot validation, canonical ledger hash, and result calculation hash all passed. Only validation/hashing functions were invoked, not optimizer/solver functions.
- Database reads used explicit read-only transactions. Main extraction used repeatable-read and ROLLBACK. No database or application-code changes, calculation requests, optimizer runs, or workflow operations; only local investigation deliverables were written.
- Selected geometry, RPM and operating window are null. The Stage 4 geometry-input object has status **UNAVAILABLE** and null geometry/RPM fields. “Completed” means completed computation, not selected/qualified design.

## 2. What was actually searched

Saved controls: D = **0.2–1.5 m in 0.1 m steps**, speed **30–70 rpm in 5 rpm steps**, rotor/D **0.33, 0.40, 0.50**, compartment-height/D **0.20, 0.25, 0.30**, free-area fraction **0.20, 0.30, 0.40**. The saved control for minimum useful span is **20 rpm**.

Per orientation: **378 fixed geometries × 9 speeds = 3,402 trials**. RRBO P1 evaluates **six scenarios per trial**: C32 = 0.36, 0.42, 0.43, each with mobile Barry–Parlange and immobile Schiller–Naumann drag; **20,412 scenario states** are persisted. With the comparison orientation there are 6,804 trial rows overall, but that comparison is not a fallback for the saved phase.

RRBO results: **158 accepted trial points**, **103 geometries with at least one accepted point**, **3,244 rejected trials**, **zero adequate geometries**. The governing scenario in every RRBO trial is **C32 = 0.36, Schiller–Naumann immobile**. All 3,244 rejected trials exceed loading 0.70; 3,074 also have at least one absent dilute-connected root. There are no tip-speed rejection flags.

${table(['D m','geometries searched','geometries with accepted points','accepted RPM points','maximum span rpm'],diameterRows)}

The span is endpoint subtraction, not count × step: 30/35/40 is 10 rpm; 30/35/40/45/50 would be 20 rpm and requires five consecutive accepted sample points. The code splits a run when it encounters a rejected point, never joins disjoint windows, and never pools speeds from different geometries. Diameter and rotor dimensions are in metres; speed is converted to revolutions/second as rpm/60 only in physical calculations. No count/span or rpm/revolutions-per-second mismatch explains this result. The stored table above covers every requested diameter, not merely the displayed frontier.

## 3. Why 45 rpm is already too high on this grid

Each row below chooses the lowest loading across **all 378 geometries at that speed**, not only the representative geometry. Positive margin is 0.70 minus loading.

${table(['rpm','accepted points','best D / rotor:D / hc:D / free','minimum loading','margin to 0.70','governing roots'],rpmRows)}

Even the best 45-rpm geometry (D=1.5 m, rotor/D=.33, hc/D=.30, free=.40) has loading **0.879565**, above 0.70 by **0.179565**. It still has operating roots: rejection at 45 rpm is principally the required design margin, not numerical inability to find any root. At 50 rpm even the best grid loading is **1.148605**: flow exceeds that model's turning capacity and no governing operating root exists.

Maximum tip speed over the whole grid is **${f(audit.maximumTipSpeedMS)} m/s**, below **4.5 m/s**. The code imposes no independent invented power ceiling here. Source-range and qualification warnings are not hidden rejection gates in the conditional P1 path.

## 4. Hydraulic cause, not just the 20-rpm headline

Saved basis: RRBO continuous, wet NMP dispersed, 40°C; continuous viscosity **0.0598 Pa·s**, density **869 kg/m³**; dispersed viscosity **0.001416 Pa·s**, density **1015 kg/m³**; interfacial tension **0.011 N/m**. Continuous flow **0.0011111111 m³/s**, dispersed flow **0.00057077176 m³/s**. Gravity acts on the 146 kg/m³ density contrast; modeled NMP drops move downward against upward continuous RRBO.

The implemented chain is:

1. Power = 1.2 ρ n³ d_rotor⁵; ε = power/(ρ A hc).
2. d32 = C32 (σ/ρ)^0.6 ε^−0.4. More rotation therefore predicts smaller drops.
3. Terminal force balance with scenario-specific drag gives terminal speed. Smaller drops have less gravitational driving relative to viscous drag and settle more slowly.
4. Garthe characteristic multiplier converts terminal speed to vchar. In the representative fixed geometry the multiplier **also decreases** with RPM, although much less strongly than terminal speed. It does not rescue capacity.
5. The swarm law computes superficial swarm speed; slip = swarm/(1−φ). For r = jd/jc, total-flow capacity at a given φ is (1+r) × slip / [r/φ + 1/(1−φ)]. The model maximizes this curve over φ to obtain turning capacity.
6. Loading = (jc+jd)/capacity. Acceptance requires **all six** scenario lower branches and loading ≤0.70, plus tip speed ≤4.5 m/s.

### D=0.9 m, rotor/D=.33, hc/D=.30, free=.40

These are dimensionless ratios, **not a 0.33-m rotor**: actual rotor diameter is **0.297 m**, compartment height **0.27 m**. The table is the governing C32=.36/SN scenario, directly from the saved run.

${representativeTable(selected.filter(t=>t.diameterM===.9))}

At this fixed geometry, 30→70 rpm increases ε by **12.704×**, reduces d32 from **4.9631 to 1.7955 mm**, terminal velocity from **0.026544 to 0.0041527 m/s**, and Garthe factor from **1.39939 to 1.23046**. Terminal velocity falls ~84.4%, factor ~12.1%, characteristic speed ~86.2%, and capacity ~87.3%. Thus the main loss is breakup/drag, reinforced rather than offset by the characteristic multiplier. Flow per cross-sectional area stays fixed while loading rises **0.35564→2.79927**.

40 rpm is barely admitted (loading **0.699272**, margin only **0.000728**). At 45 rpm the governing lower and upper roots are **0.111316** and **0.224917**, but loading **0.930717** violates the 0.70 policy. At 50 rpm loading **1.205931 > 1** and both roots are absent. This cleanly separates a loading-margin failure from a beyond-capacity no-root result.

Stored operating swarm/slip speeds at 30,35,40,45 rpm are respectively **0.033153/0.034100**, **0.022219/0.023193**, **0.014770/0.015787**, **0.008909/0.010025 m/s**; at 50–70 there is no operating root, so operating swarm speed is null, not zero. Tip speed at these representative RPMs rises only 0.4665→1.0886 m/s. Capacity holdup shifts modestly from 0.16958 to 0.15938; it is not a fixed imposed holdup.

### Why a larger diameter does not extend the accepted window to 50 rpm

At fixed geometry ratios and fixed RPM, rotor and compartment scale with D, so power scales as D⁵ and compartment volume as D³: **ε ∝ n³D²**, hence **d32 ∝ n^−1.2 D^−0.8**. Meanwhile applied superficial flow scales as **D^−2**. Larger D lowers applied flux but also increases breakup energy and reduces droplet size/settling capacity. Capacity cannot be assumed constant as area increases.

The actual saved 40-rpm comparison:

${table(['D m','d32 mm','capacity m/s','jc+jd m/s','loading'],fixed40.map(t=>[t.diameterM,f(t.d32M*1000),f(t.hydraulicMethod.governing.capacityMS),f(t.hydraulicMethod.jc+t.hydraulicMethod.jd),f(t.actualLoading)]))}

Across D=.3→1.5 at 40 rpm the applied flux falls 25-fold, but the saved capacity falls **14.69-fold** (0.0213890→0.00145565 m/s). Loading improves only **1.70-fold** (1.11243→0.653833), not 25-fold. Enlargement does improve loading, enough to reach 40 rpm at D≥.9, but not enough for 45 rpm at any searched geometry. These are measured saved-model outcomes, not an extrapolated proof about D>1.5 m. The appendix includes the same five fixed ratios at every saved speed, including all six raw scenarios in the JSON.

## 5. Numerical audit: are roots really missing?

No hydraulic equations were rerun. We inspected the algorithm and checked all **20,412 stored scenario states**, including roots, continuation traces, residuals, and loading:

- **${audit.nullRootBelowCapacity}** null operating holdups with loading <1.
- **${audit.nullRootDespiteStoredRoots}** null operating holdups despite nonempty saved operating-root arrays.
- **${audit.loadingRootContradictions}** contradictions between loading >1 and an empty operating-root array.
- Separate reaggregation of saved pass/fail points found **zero mismatches** with all 378 stored window widths/counts, **zero disjoint accepted-window geometries**, and **zero stored continuation traces with decreasing lower holdup or holdup at/above the turning point**.
- **${audit.branchStatusCounts.LOWER_QUASI_STEADY_ADMISSIBLE}** admitted lower branches; **${audit.branchStatusCounts.NO_DILUTE_CONNECTED_ROOT}** no-root scenario states.
- Maximum absolute stored terminal force-balance residual **${audit.maximumAbsoluteForceResidualN} N**.
- Maximum absolute stored operating slip-balance residual (non-null states) **${audit.maximumAbsoluteOperatingBalanceResidualMS} m/s**.

The solver does **not** use one fixed φ bracket that assumes opposite endpoint signs. It samples 511 interior points on a 512-interval mesh, refines the highest capacity neighborhood with 60 ternary iterations, then explicitly inserts the refined peak into the root-search mesh. Every neighboring sign-changing interval is bisected (70 iterations). It keeps both operating roots and advances the lower root through 16 flow fractions, requiring monotone continuation below the turning holdup. Inserting the peak matters: two roots around a peak are not rejected merely because capacity−flow is negative at both outer endpoints.

There is additional algebraic support for the **governing SN** capacity maximum being genuine rather than a missed secondary peak. Let v be superficial swarm speed, F(v)=Cd(Re(v))v², and h=d log F/d log v. SN gives F(v)=a v+b v^1.687, so h=1+0.687z/(1+z), z∝v^0.687. As φ rises, v and h decrease. Capacity simplifies to (1+r)vφ/[r+(1−r)φ]; its stationary condition is

**h r(1−φ) = 4.65 φ[r+(1−r)φ].**

Here r≈0.513695<1. The left side decreases and right side increases on 0<φ<1, so this governing curve has a unique maximum. Thus the mesh+local refinement is not choosing the wrong one of multiple governing SN peaks. This is an algebraic check of the implemented equations, not a fresh numerical solve.

No stored evidence supports a false rejection from root bracketing, disconnected windows, or solver precision. Residual agreement establishes internal numerical consistency, not external validity of the correlations. This does not constitute an independent proof of global shape for every mobile-interface scenario; importantly, the SN bottleneck alone suffices to reject all higher-speed grid trials.

## 6. “Preference” in wording versus gate in current policy

There are two deliberately different ranking functions:

- The historical **rankSmallestGeometryGroups** comment/function says “preference”: if nothing meets it, return the widest feasible fallback, then smallest diameter among equal spans.
- Current **rankGeometryGroups** first calls that helper for comparison/frontier evidence, then **overrides selected** using only groups whose span is ≥20. It sorts their **distinct diameters**, selects index 1, and returns null if fewer than two exist. Therefore 20 remains *not a hydraulic criterion*, but is an effective **mandatory selection-eligibility gate** for final geometry.

The saved metadata still says RANKING_PREFERENCE_NOT_HYDRAULIC_LIMIT and some alternatives retain “fallback” wording. Those labels do not mean they can actually become a selected final diameter under the current no-fallback policy. This is a semantic distinction to clarify, not evidence of an accidental algorithmic defect: the earlier declared project report explicitly retained **second-smallest accepted adequate diameter after a fixed 20-rpm span, no fallback**, and tests explicitly require no Stage 4 geometry below that span.

“Next-smallest” means the second **distinct accepted adequate** diameter, not the next geometry row, and not blindly D+0.1 m through an infeasible gap. Here there is no first adequate diameter, let alone a second. Source evidence is cited below.

## 7. Conditional engineering screening is not physical qualification

The selected orientation uses **USER_APPROVED_CONDITIONAL_PREPILOT_P1**, **PREPILOT_EXTRAPOLATED_METHOD**, provisional saved 40°C properties, and modeled turning capacity, **not observed flooding**. Fixed Np=1.2 is an engineering power assumption separate from the Garthe source power-number expression. The C32 values are conditional Sauter-mean proxies, not a proven maximum-stable-drop law for this system.

Accepted trial rotor Reynolds numbers range **71.21–2373.77**; accepted scenario Eötvös numbers range **0.7071–26.5284**. In particular, some apparently admitted low-speed states have large deformation indicators and low rotor Re. Turbulent breakup, spherical-drop/drag applicability, actual interface mobility, inversion, entrainment and disengagement remain unqualified or unknown. These flags must not be rewritten as “safe”, but the approved P1 path does not secretly reject candidates on those flags. They therefore do not explain zero adequate windows and were not altered here.

The persisted opposite phase comparison has **90 adequate geometries**. It uses NMP continuous/RRBO dispersed and the comparison path, not the saved RRBO-continuous P1 physical basis. It cannot be substituted automatically, and is not an acceptable workaround for this result.

## 8. Policy options for an explicit user decision — nothing implemented

1. **Retain current policy:** no selected diameter is the correct saved result. Report the feasible narrow windows separately without presenting them as qualified designs.
2. **Consider making 20 rpm soft or reducing the required span:** this changes selection policy, not the hydraulic equations. Hypothetical arithmetic filtering of the existing stored windows (no new optimizer run) gives:

${table(['hypothetical minimum span','smallest eligible D','second distinct eligible D'],[0,5,10,15,20].map(w=>{const ds=[...new Set(groups.filter(g=>g.operatingWindow&&g.operatingWindow.widthRpm>=w).map(g=>g.geometry.columnDiameterM))].sort((a,b)=>a-b);return [w,ds[0]??'none',ds[1]??'none'];}))}

   In particular, **0.4 m** is only the hypothetical second diameter when even a **single accepted RPM point (zero span)** counts. It is not the current selection, a useful operating window, or a physically qualified recommendation. Making the historical fallback fully operative would instead favor the widest available 10-rpm span and smallest diameter on that span (**0.9 m**) before any newly defined second-diameter policy; “soft” must specify which fallback behavior is intended.
3. **Consider searching lower RPM while retaining ≥20 rpm adequacy:** accepted windows all touch the searched lower bound, so the current grid cannot establish their lower end. A future authorized lower-RPM search might widen them, but no lower-RPM results exist in this candidate, and the turbulent-breakup/shape assumptions may become less defensible there. No guarantee of a selected or qualified diameter follows. Public controls currently enforce 20 rpm; these options are not already available simply by editing a displayed number.

Neither relaxing the gate nor enlarging/searching outside the stored grid should be done without an explicit policy decision and appropriate physical qualification.

## 9. Full fixed-ratio representative sweep

Each row is the saved governing scenario at rotor/D=.33, hc/D=.30, free=.40. No recalculation.

${representativeTable(selected)}

## 10. Source citations and deliverables

- **server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts:67–99**: properties, power/ε, d32, terminal drag, Garthe factor, swarm and capacity equations.
- **Same file:27–50,100–155**: bisection, log-speed swarm solve, mesh/refined peak, operating roots, 16-step continuation, residual outputs.
- **Same file:158–183**: governing worst capacity, unknown qualification flags, numerical assumptions, conditional screening limits.
- **server/ecr-pre-pilot/stage3-stage4-optimizer.ts:690–713**: conditional P1 admission and explicit rejection reasons.
- **Same file:395–406**: public minimum span fixed at 20 rpm.
- **Same file:980–1018**: historical smallest/widest fallback policy.
- **Same file:1078–1125**: current adequate-only second-distinct-diameter override, no fallback.
- **Same file:1170–1213**: fixed-geometry scan, contiguous runs, endpoint span.
- **Same file:1504–1515**: result policy text alongside historical preference wording.
- **tests/ecr-pre-pilot-stage3-ranking.test.ts:142–156,235–285**: preference/admission separation and second distinct diameter/gaps tests.
- **tests/ecr-pre-pilot-stage3-stage4-optimizer.test.ts:261–282**: expressly withholds Stage 4 geometry when no accepted diameter reaches 20 rpm.
- **deliverables/rrbo-stage3-candidate/report.md:9**: previously declared agreed policy; no claim here about approval beyond what that artifact and the persisted acceptance record state.
- **server/ecr-pre-pilot/p1-candidate-service.ts:75–103**: latest candidate ledger view, hash checks, stale detection, metadata versus result status.

Files:
- **report.md / report.html**: this investigation.
- **saved-evidence.json**: provenance, exact metadata/ranking, every geometry's stored window, and **45 complete representative trials including all 270 scenario states and continuation traces**.
- **all-rrbo-trials.csv**: all **3,402** RRBO trial governing summaries, not a new calculation.
- **build-report.mjs**: offline aggregation/report construction only; input was a transactionally exported snapshot in /tmp, not an optimizer input.

Limitations: latest saved state at inspection time; conclusions are bounded to saved controls and approved conditional model. No optimizer, hydraulic solve, tests that invoke optimization, workflow restart, or production-source/database changes were performed.
`;
fs.writeFileSync(path.join(out,'report.md'),md);
// Minimal dependency-free Markdown rendering with escaped text and accessible tables.
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const inline = s => escape(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
const lines=md.split('\n');let html='',inTable=false;
for(let i=0;i<lines.length;i++){
  const l=lines[i];
  if(l.startsWith('|')){
    if(/^\|[ -]+\|/.test(l))continue;
    const tag=inTable?'td':'th';
    if(!inTable){html+='<div class="table"><table>';inTable=true;}
    html+='<tr>'+l.split('|').slice(1,-1).map(c=>`<${tag}>${inline(c.trim())}</${tag}>`).join('')+'</tr>';
    continue;
  }
  if(inTable){html+='</table></div>';inTable=false;}
  if(!l.trim())continue;
  const heading=l.match(/^(#{1,3}) (.*)/);
  html+=heading?`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`:`<p>${inline(l)}</p>`;
}
fs.writeFileSync(path.join(out,'report.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Stage 3 no-diameter investigation — project 236</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:1180px;margin:40px auto;padding:0 24px;color:#172335;background:#fbfcfe}h1,h2,h3{line-height:1.25;color:#163d57}h2{margin-top:2.2em;border-top:1px solid #d9e2ec;padding-top:1em}p{overflow-wrap:anywhere}.table{overflow-x:auto;margin:24px 0}table{border-collapse:collapse;font-size:13px;width:100%;font-variant-numeric:tabular-nums}th,td{padding:8px;border:1px solid #dbe3ec;text-align:left;white-space:nowrap}th{background:#e8f0f5}tr:nth-child(even){background:#f0f4f8}code{font-size:.9em}strong{color:#123a56}@media print{body{max-width:none;font-size:10pt;margin:0}.table{overflow:visible}table{font-size:7pt}th,td{padding:3px}h2{break-after:avoid}}</style><main>${html}</main></html>`);
console.log(JSON.stringify({audit,files:fs.readdirSync(out)},null,2));