# Project 236 / design 269 — read-only end-section input audit

## Authority and state

Development database read on 2026-09-21 using an explicit `BEGIN READ ONLY` transaction; owner `created_by=3` enforced. No design/DB writes, optimizer execution, workflows, or external research. Reproducible extraction: `npx tsx deliverables/disengager-input-audit.ts`; raw local evidence `/tmp/disengager-input-audit.json`. Only audit files were added.

| Authority | Observed current evidence |
|---|---|
| Stage 1 | saved 2026-09-21 03:29:28.201Z; hash `06bb9227b30f1f4c67b3ed557db34f61fe749037addf66163194dd46e2e98c5f` |
| Stage 2 | completed job `145e962e-892a-4424-aab9-91532af9f5ef`; predictive N_T=4; trials 1–10 saved, N=7 also accepted; releaseEligible=false, PRE_PILOT_MULTISTAGE_PREDICTIVE_MODEL |
| Stage 3 | ledger 69, candidate `b4b44349-5471-4b9c-acf8-d06e2cea8d42`, immutable hash `4b60bbd4396e508ce58a2de945540035e46062396d94b000f89fdecd335c8e82`; current Stage-1 hash matches |
| Stage 4 | row 17, CALCULATED, linked to ledger 69 and current Stage-1 hash; Stage-2 link is NULL; N_T=7 independently adopted, eta=0.35, ceil(7/0.35)=20 compartments, pitch 0.210 m, active height 4.200 m |
| Stage 5 | saved revision 6 / id 6, 2026-09-21 13:37:49.395Z; basis links Stage 3=69, Stage 4=17; preliminary R5 current-basis shrouded/perforated geometry, NOT FOR FABRICATION |

Important: ledger 69's frozen *historical window-based optimizer* result says NO_SECOND_ADEQUATE_DIAMETER and has null historical selectedTrial. Current authority is the additive automatic selection reconstructed from that immutable grid by `resolveAutomaticHydraulicSelection`, also persisted in Stage-4 row 17's `selectedStage3Hydraulics.automaticSelection`. Do not mistake historical null fields for absence of the current selected geometry. The selection hash stored there is `af20840c6b0eb031cc0858c29e7eb4de2f443b8aff9ba61ad684f8b2a329054c`.

Stage-2 source snapshot hash is `6ccf5381167d4deb01d313881b63f5bb537c8bc729e3902b2919fc1f4397fbe9`, NOT current Stage 1. A field-by-field comparison of its source.stage1 with current.stage1 found **zero differences**. This supports process-basis compatibility, not automatic current authority admission: binding/governance snapshots differ. Existing Stage-4 RRBO authority deliberately has no Stage-2 dependency and calls actual Stage-2 N_T unavailable/reference-only. End-section work must explicitly bind a compatible boundary-stream trial. Do not silently use first accepted N=4, last array member N=10, or assume N=7 automatically governs because physical design N_T=7. Both N=4 and N=7 results below are available, distinctly labeled.

## Available inherited inputs

| Quantity | Value / scope |
|---|---|
| Temperature | 40 °C = 313.15 K |
| Oil feed | 4000 L/h = 4 m³/h = 0.001111111111 m³/s |
| RRBO SN300 density / viscosity | 869 kg/m³; 59.8 cP = 0.0598 Pa·s |
| Wet-solvent density / viscosity used by hydraulics | 1015 kg/m³; 1.416 cP = 0.001416 Pa·s |
| Interfacial tension | 11 mN/m = 0.011 N/m |
| Density difference magnitude | 146 kg/m³; NMP drops settle in RRBO; RRBO drops rise in NMP-rich continuous phase |
| Feed mass | 3476 kg/h |
| S/O | 0.6 **mass**, not volume |
| Fresh wet solvent | 2085.6 kg/h = 2054.778325 L/h = 0.000570771757 m³/s |
| Wet solvent composition | 99.5/0.5 wt% NMP/water = 2075.172 / 10.428 kg/h |
| Oil composition mass flows | saturates 2954.6; mono 243.32; di 139.04; poly 69.52; polar 69.52; NMP 0 kg/h |
| Frozen geometry | ID 0.700 m; area 0.3848451001 m²; rotor 0.231 m; pitch 0.210 m; stator free area 0.4 |
| Selected speed | 30 rpm; **not** an accepted 30–70 rpm operating window |

Property lineage: Stage-1 UI `NMP_DENSITY_POINTS`, `NMP_DYNAMIC_VISCOSITY_POINTS`, `RRBO_GRADE_PROPERTIES` in `client/src/pages/design-software/ecr-pre-pilot-design-page.tsx`; frozen server consumer `makeStage1HydrodynamicProcessBasis` in `server/ecr-pre-pilot/stage1.ts`. SN300 has explicit 40 °C table points; NMP viscosity is temperature-interpolated. These are saved nominal feed/solvent properties, used unchanged as phase proxies by Stage 3 (`PROVISIONAL_SAVED_40C`). No composition-dependent product-mixture density/viscosity/IFT closure was identified. Neither pure-NMP-style temperature tables nor nominal RRBO data establish properties of the equilibrated extract/raffinate. Do not silently add ideal-volume mixing or call these measured product densities.

## Existing thermodynamic outlet streams, normalized to real throughput

Stage-2 boundary streams are normalized to oil mass=100 and fresh wet solvent mass=60. Scale every component mass by **34.76 kg/h per normalized mass unit**. Do not directly interpret `flowMol` as plant molar throughput.

| Stream | N=4 mass kg/h | N=7 mass kg/h | N=4 volume proxy L/h | N=7 volume proxy L/h |
|---|---:|---:|---:|---:|
| Final raffinate | 3321.139186 | 3278.673563 | 3821.794230 | 3772.927000 |
| Final extract | 2240.460814 | 2282.926437 | 2207.350556 | 2249.188608 |
| Total | 5561.600000 | 5561.600000 | — | — |

Volume columns are **conditional m/rho proxies**, using 869 for raffinate and 1015 for extract, not saved composition-resolved product volumes.

Component order: saturates, mono, di, poly, polar, NMP, water; kg/h:

- N4 raffinate: `[2806.456797,108.302253,67.696596,30.019545,11.614700,288.401203,8.648092]`.
- N4 extract: `[148.143203,135.017747,71.343404,39.500455,57.905300,1786.770797,1.779908]`.
- N7 raffinate: `[2800.833804,100.382762,64.772744,27.784909,6.002949,269.640969,9.255427]`.
- N7 extract: `[153.766196,142.937238,74.267256,41.735091,63.517051,1805.531031,1.172573]`.

NMP in raffinate is 8.683804 wt% (N4), 8.224087 wt% (N7). This is **equilibrium dissolved NMP**, not discrete settleable carryover. Extract hydrocarbon inventory is likewise not automatically entrained RRBO drops. Boundary-stream mass balances do not supply physical entrainment rates, drop-size distributions, or separator removal efficiency. N_T and equilibrium acceptance do not predict carryover. Bulk countercurrent solvent flow also is not the NMP entrainment load entering the top end zone.

## Stage-3 drop/drag evidence

Selected calculation is project-controlled direct-turbulence `d32=C32*(sigma/rho_c)^0.6*epsilon^-0.4`; epsilon=(P/V)/rho_c; P=1.2*rho_c*N³*Dr⁵. Np=1.2 remains the adopted power input. Separately, `sourcePowerNumber=1.669310828` from source rotor-Re expression enters the characteristic-speed correction; it is NOT a replacement power-number authority.

At 30 rpm: power 0.085737524 W; epsilon 0.001220803884 W/kg; rotor Re 387.714958. C32 sensitivities 0.36/0.42/0.43 produce d32=6.068312/7.079697/7.248261 mm. Governing active hydraulic scenario is C32=.36, Schiller–Naumann immobile: isolated terminal speed 0.036665670 m/s, Re=3.233301, Eo=4.793101, We=0.644487, Oh_c=.248291, Oh_d=.005440; force residual -2.71e-20 N. Mobile alternative speed=.054086097 m/s, Re=4.769492. These numbers do **not** prove spherical-drop or interface-mobility validity.

Operating holdup=.031713144; modeled capacity loading=.387721849 versus adopted active-section .70 limit; flood turning holdup=.174209689. Characteristic speed=.054554353, superficial swarm=.048170797, relative slip=.049748477 m/s. Do not substitute these agitation/swarm quantities for isolated quiescent terminal velocity. Garthe convention is v_swarm=v_slip*(1-phi); maintain that distinction.

Saved grid has 6804 trials (3402 each orientation); selected fixed-geometry RRBO-continuous sweep:

| rpm | d32 mm (C=.36) | modeled loading | active hydraulic pass |
|---:|---:|---:|---|
|30|6.068312|.387722|yes|
|35|5.043497|.545353|yes|
|40|4.296763|.740893|no|
|45|3.730426|.977563|no|
|50|3.287376|1.258355|no|
|55|2.932096|1.586094|no|
|60|2.641386|1.963480|no|
|65|2.399481|2.393110|no|
|70|2.195309|2.877494|no|

At 70 rpm isolated terminal speed=.006112272 m/s, Re=.194992, Eo=.627296. This is a requested **investigation sensitivity**, not an admissible operating point. Minimum across all RRBO grid geometries=.441929 mm is irrelevant to frozen geometry. The d32 is an active-compartment Sauter mean, not a lower-tail capture diameter or a measured last-compartment exit distribution.

`server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts`: reusable exported `dragCoefficient`; `evaluateRrboHydraulicTrial` contains force balance Cd*Re²=4*Ar/3, with Ar=rho_c*abs(deltaRho)*g*d³/mu_c², and terminal velocity=Re*mu_c/(rho_c*d). Its whole evaluator explicitly only admits RRBO continuous, so **do not call it with inverted basis for the bottom zone**. A small independent terminal-force-balance adapter can reuse dragCoefficient with swapped continuous/dispersed properties, buoyancy sign, and separately qualified RRBO drop diameter. Current qualifications explicitly mark inversion, entrainment, disengagement, turbulence, sphere assumption and drag-range validity UNKNOWN. Stokes-only use is not valid at selected top-drop Re≈3.23.

## Existing Stage-5 geometry is not disengager sizing evidence

Saved top/bottom straight zones are each 0.700 m (proportion rules), not terminal-velocity sizing. Bottom-pole datum: active start .875 m, active end 5.075 m, top tangent 5.775 m, vessel height 5.950 m, overall envelope 7.000 m. Rotor clearances .087 m are internals clearances, not validated calming distances.

Process nozzle bores are each D/10=.070 m: RRBO feed z=.595; extract outlet .455; NMP feed 5.355; raffinate outlet 5.495 m. Flush .315 and equalization 5.635 m have .028 m bores. Samples .735/5.215 and generic instrument connections .385/5.285 m have .0175 m bores. Drain z=0, vent z=5.915 m have .028 m bores. These are geometric allowances, explicitly not hydraulic/DN or vent-duty sizing. **NMP feed is at the top; RRBO feed is at the bottom.** Do not relocate solvent feed to bottom solely because the task mentions it under bottom arrangement.

No evidenced hydraulically sized distributors, separator capture margin, carryover criterion, coalescence factor, validated residence time, interface operating levels/control band, return-flow hydraulics, enlarged-end cone dimensions, or end-zone hydraulic PASS was found in the current authority. Geometric completeness does not establish these.

## Available / missing and bounded continuation

| Need | Status / next action |
|---|---|
| Upstream rate, temperature, phase designation, internals | Available; inherit read-only |
| End bulk outlet mass rates | Available N4/N7 alternatives; explicitly resolve governing lineage before authoritative use |
| Actual outlet volume/properties | Missing mixture closure; nominal-phase proxy sensitivity is possible only labeled provisional |
| Top entrained NMP size/load | d32 exists as conditional mean screen; exit PSD/lower-tail capture and dispersed carryover loading absent |
| Bottom entrained RRBO size/load | Genuinely missing; active NMP-drop d32 cannot transfer across inversion. Opposite-orientation grid is not a validated inversion-zone entrainment model |
| Terminal-force balance | Reusable; keep Re/Eo/We/Oh and shape/mobility validity visible |
| End-section safety margin and acceptance | Not established; .70 active modeled-capacity fraction is not automatically separator velocity margin |
| Coalescence, height, interface and nozzle controls | Missing physical/operating criteria; distinguish engineer-selected layout from calculated hydraulics |

Proceed without new duplicate process inputs by displaying inherited state, then calculating explicitly bounded screens: A_min=Q_c/(f*v_t), D_min=sqrt(4*A_min/pi), capture requirement v_t>Q_c/A (dilute isolated case). f must be a disclosed engineering sensitivity/selection, not claimed existing approved margin. Show no-coalescence top mean-drop screen plus required-cut-diameter curves and explicit bottom assumed-diameter sensitivity until size evidence exists. A mean-drop pass alone cannot establish carryover performance. Unknown entrainment concentration prevents justified hindered-settling/dispersion-band inventory sizing. Settling height/time requires actual travel geometry and positive net velocity; t_settle=L/(v_t-j_c) does not uniquely determine L. Add calming/coalescence/interface/control-volume allowances only as identified assumptions or engineer selections; no mechanical freeze.

## Minimal integration path (no implementation performed)

- Reuse read-only authorities from `server/ecr-pre-pilot/stage1.ts`, `p1-candidate-service.ts` (integrity checking + current candidate), `automatic-hydraulic-selection.ts`, and `stage4-pre-pilot-sizing-service.ts` (`validatePersistedStage2HetsAuthority` / compatibility logic for explicit Stage-2 admission).
- Current Stage-5 source resolver: `server/ecr-pre-pilot/stage5-geometry-service.ts`, `loadStage5Basis`, through `getStage5Basis`; it enforces current Stage-4 lineage and exact saved projection compatibility. Do not invoke save/generate routes during an audit.
- A focused end-section calculation service can consume these sources and dragCoefficient, return separate top/bottom calculation cards with source hashes, trial stage count, phase orientation, assumptions, margins and blocked status.
- Present within `client/src/pages/design-software/ecr-pre-pilot-design-stage-5-page.tsx` via existing `server/ecr-pre-pilot/stage5-geometry-routes.ts`; integrate accepted geometry later into `shared/ecr-stage5-geometry.ts` / current component builder, never rewriting historical revisions or upstream engine identities. Existing `stage5-design-data-report.ts` can share the same calculation dataset.

Governance memories reviewed: stage ownership, Stage-1 property authority, automatic hydraulic selection, Garthe swarm velocity convention, hydraulic chain, Stage-5 definition boundary. No external research or new scientific closure was introduced.