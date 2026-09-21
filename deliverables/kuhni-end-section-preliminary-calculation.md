# Kühni end sections — preliminary engineering calculation

Project 236 · Design 269 · Frozen active ID 700 mm · Offline snapshot 2026-09-21

**CONDITIONAL SCREENING ONLY — NOT FOR FABRICATION. Final top and bottom hydraulic approval and mechanical geometry remain HOLD.**

## 1. Engineering conclusion

The straight 700-mm shell passes the assumed 50%-of-isolated-terminal-speed screen for the selected top NMP mean drop in both unbound outlet scenarios. This is not a proven entrainment-removal efficiency: the mean drop is not the lower-tail capture size, and its Eötvös number 4.793 leaves spherical-drop drag applicability unresolved.

At the bottom, a 700-mm shell meets the same screen only if the RRBO capture diameter is at least 250.0 µm (N4) or 252.6 µm (N7), under the stated phase-property and immobile-interface assumptions. No RRBO entrained-drop size or carryover loading is established. Therefore neither straight-shell acceptance nor enlargement selection is justified.

**Geometry summary: top 700-mm ID candidate × height HOLD → active ECR 700-mm ID × 4200-mm active height → bottom 700-mm ID conditional candidate × height HOLD.** No end diameter, end height, transition, interface elevation or nozzle arrangement is frozen by this report.

## 2. Authority, classifications and assumptions

- INHERITED: current Stage-1 snapshot 06bb9227b30f1f4c67b3ed557db34f61fe749037addf66163194dd46e2e98c5f; Stage-3 ledger 69; Stage-4 row 17; Stage-5 revision 6. Rotor 231 mm, pitch 210 mm, stator free area 0.4, selected 30 rpm. Active diameter is frozen, not optimized here.
- INHERITED: physical design N_T=7 is independently adopted; efficiency 0.35 yields 20 compartments and 4.2-m active height. It does not select a thermodynamic boundary trial.
- UNBOUND SCENARIOS: Stage-2 job 145e962e-892a-4424-aab9-91532af9f5ef predicts N_T=4; its accepted N=4 and N=7 trials are both evaluated, neither promoted to downstream authority. Stage-4's Stage-2 link is NULL. All source Stage-1 input fields match current values, but Stage-2 source hash 6ccf5381167d4deb01d313881b63f5bb537c8bc729e3902b2919fc1f4397fbe9 differs from current. Formal compatibility/boundary binding remains required. Stage-2 releaseEligible=false.
- ASSUMED: operating superficial velocity ≤ 0.50 × isolated terminal speed. This factor is a disclosed screening selection, NOT an established approved disengager criterion and NOT the active-section 70%-of-modeled-capacity criterion.
- ASSUMED: saved nominal feed/solvent properties proxy the outlet phases; dilute isolated drops, immobile spherical-interface Schiller–Naumann drag; no coalescence credit and no swarm/compartment-speed multiplier. No physical entrainment loading, interface inventory, residence-time criterion or minimum drop size is invented.
- CALCULATED: mass normalization, conditional volume flows, force-balance terminal speeds, superficial velocities, required areas/diameters and inverse critical capture sizes below.
- UNKNOWN: actual mixture properties, interface mobility, droplet deformation/shape applicability, exit drop distributions, entrainment concentrations and acceptable carryover. These prevent final release even where the numerical screen says PASS.

## 3. Process and physical-property inputs


| Input | Value / lineage |
| --- | --- |
| Temperature | 40 °C = 313.15 K, persisted Stage 1 |
| RRBO feed / mass | 4000 L/h / 3476.000 kg/h |
| Wet solvent | S/O=0.6 mass; 2085.6 kg/h; 2054.778325 L/h at 1015 kg/m³ |
| Wet composition | 99.5/0.5 wt% NMP/water; 2075.172 / 10.428 kg/h |
| Top phase properties | Continuous RRBO: 869 kg/m³, 0.0598 Pa·s; dispersed NMP: 1015 kg/m³, 0.001416 Pa·s |
| Bottom phase properties | Continuous NMP-rich: 1015 kg/m³, 0.001416 Pa·s; dispersed RRBO: 869 kg/m³, 0.0598 Pa·s |
| Interfacial tension / density difference | 0.011 N/m / 146 kg/m³ magnitude; nominal proxies |
| Gravity / active cross-section | 9.80665 m/s² / 0.3848451001 m² |


Stage-1 UI property tables are the persisted nominal-property source: SN300 explicit 40 °C points and temperature-derived NMP data. They are not composition-dependent measurements of equilibrated product phases. No mixture-density, mixture-viscosity or composition-dependent interfacial-tension closure was added.

Stage-2 oil feed is normalized to mass 100 and wet solvent to mass 60. Plant normalization is 3476/100=34.76 kg/h per normalized mass unit. Q = mass flow / nominal phase density; m³/h divided by 3600 gives m³/s. Product volumes below are calculated proxies, not measured or composition-resolved outlet flows.


| Unbound scenario | Raffinate kg/h | Extract kg/h | Raffinate L/h proxy | Extract L/h proxy | Total kg/h |
| --- | --- | --- | --- | --- | --- |
| N=4 | 3321.139186 | 2240.460814 | 3821.794230 | 2207.350556 | 5561.600000 |
| N=7 | 3278.673563 | 2282.926437 | 3772.927000 | 2249.188608 | 5561.600000 |


Each scenario closes to 5561.6 kg/h total incoming and outgoing mass. Physical volume closure is not asserted because phase volume changes and mixing are not modeled.

Component flows (kg/h), normalized from saved boundary-stream component masses:


| Scenario / stream | Saturates | Mono | Di | Poly | Polar | NMP | Water |
| --- | --- | --- | --- | --- | --- | --- | --- |
| N4 raffinate | 2806.456797 | 108.302253 | 67.696596 | 30.019545 | 11.614700 | 288.401203 | 8.648092 |
| N4 extract | 148.143203 | 135.017747 | 71.343404 | 39.500455 | 57.905300 | 1786.770797 | 1.779908 |
| N7 raffinate | 2800.833804 | 100.382762 | 64.772744 | 27.784909 | 6.002949 | 269.640969 | 9.255427 |
| N7 extract | 153.766196 | 142.937238 | 74.267256 | 41.735091 | 63.517051 | 1805.531031 | 1.172573 |


The NMP in the equilibrium raffinate is dissolved solvent, not discrete settleable entrainment. Extract hydrocarbon components are likewise not an inventory of entrained RRBO drops. Neither N_T nor these outlet balances predicts physical carryover. Bulk fresh-solvent flow is not top entrained-solvent loading. Thus these continuous-stream estimates cannot establish actual two-phase end-zone inlet rates or return-flow capacity.

## 4. Equations and validity

F_b = (π/6)d³ |ρ_d−ρ_c| g; F_D = (1/2)ρ_c C_D (π/4)d² v_t²; set F_b=F_D.

Re = ρ_c v_t d / μ_c; Ar = ρ_c |ρ_d−ρ_c| g d³ / μ_c²; C_D Re² = 4Ar/3.

C_D = (24/Re)(1 + 0.15 Re^0.687), using the existing exported Schiller–Naumann immobile-interface drag implementation. Root solved by bracketed bisection, not a Stokes-only shortcut. Eo = |Δρ| g d²/σ; We = ρ_c v_t² d/σ.

For dilute opposing flow: U_c=Q_c/A; U_allow=f v_t with f=0.50; A_req=Q_c/(f v_t); D_req=√(4A_req/π); margin ratio=f v_t/U_c; net drop speed away from outlet=v_t−U_c. Screen PASS means ratio≥1. Margin percent=(ratio−1)×100, not a statistical confidence measure.

Critical size at a candidate diameter solves v_t(d_crit)=U_c/f=2U_c. These equations assume the volume proxy, dilute isolated drops and uniform axial flow; inlet jets, recirculation, finite holdup and nonuniform withdrawal can invalidate this simplification. Small Re/Eo supports, but does not prove, spherical/immobile applicability. Numerical force-balance closure is not empirical model validation.

## 5. TOP RAFFINATE calculation card

Continuous phase: upward RRBO-rich raffinate. Discrete dispersed phase: NMP drops settling downward. Selected active-compartment d32 is 6.068312 mm at 30 rpm, from d32=C32(σ/ρ_c)^0.6 ε^−0.4 with governing C32=0.36. ε=(P/V)/ρ_c; P=Np ρ_c N³ D_r⁵; adopted Np=1.2 remains unchanged. The separate sourcePowerNumber=1.669310828 in the active characteristic-speed correction is not substituted for Np.

Recomputed isolated terminal speed=0.036665670 m/s exactly reproduces the persisted value within 10⁻¹² m/s. Re=3.233301, Eo=4.793101, We=0.644487. Allowed superficial velocity under the explicit assumption is 0.018332835 m/s. This is not the saved compartment characteristic speed or swarm slip.


| Result at 700 mm | N4 unbound | N7 unbound |
| --- | --- | --- |
| Continuous Q, m³/s | 0.0010616095 | 0.0010480353 |
| Superficial upward U, m/s | 0.002758537 | 0.002723265 |
| Required area, m² | 0.05790755 | 0.05716712 |
| Calculated D_req, mm | 271.53 | 269.79 |
| Margin ratio f vt / U | 6.6459 | 6.7319 |
| Margin percent above equality | 564.59% | 573.19% |
| Net downward mean-drop speed, m/s | 0.033907132 | 0.033942404 |
| Numerical mean-drop screen | PASS — conditional only | PASS — conditional only |
| Final hydraulic / carryover acceptance | HOLD | HOLD |


Calculated end D_req below 700 mm is not a proposal to shrink the frozen active section or select a reduced-diameter outlet neck. A straight 700-mm top is a candidate with no demonstrated enlargement requirement from this mean-drop screen alone.

Inverse capture-size requirement in the same 700-mm top:


| Scenario | NMP d_crit, µm | vt at threshold, m/s | Re | Eo | Mean d32 / d_crit |
| --- | --- | --- | --- | --- | --- |
| N4 | 2080.75 | 0.005517074 | 0.166820 | 0.563534 | 2.916 |
| N7 | 2066.82 | 0.005446530 | 0.163584 | 0.556016 | 2.936 |


Mean d32 being larger than d_crit does not show what fraction of the drop population is captured. A lower-tail distribution and specified carryover limit are required. The selected mean-drop Eo≈4.79 is not evidence of a rigid sphere; deformation/interface uncertainty makes its terminal speed and apparent margin conditional. No unsupported larger/coalesced drop is substituted.

### Requested 30–70 rpm investigation, not accepted operation


| rpm | Saved d32, mm | Active capacity loading | Saved hydraulic pass |
| --- | --- | --- | --- |
| 30 | 6.068312 | 0.387722 | PASS (screen) |
| 35 | 5.043497 | 0.545353 | PASS (screen) |
| 40 | 4.296763 | 0.740893 | FAIL |
| 45 | 3.730426 | 0.977563 | FAIL |
| 50 | 3.287376 | 1.258355 | FAIL |
| 55 | 2.932096 | 1.586094 | FAIL |
| 60 | 2.641386 | 1.963480 | FAIL |
| 65 | 2.399481 | 2.393110 | FAIL |
| 70 | 2.195309 | 2.877494 | FAIL |


Selected operation remains 30 rpm. Only 30 and 35 rpm pass the saved fixed-geometry active screen; 40–70 rpm fail. The minimum investigated fixed-geometry d32=2.195309 mm at 70 rpm is not an approved operating/drop-size basis. No geometry/RPM re-selection or new active-column calculation was performed. Active holdup/turning-capacity rules are not disengagement criteria; Garthe superficial swarm velocity equals relative slip times (1−φ), and neither is silently transferred to a quiescent settler.

## 6. BOTTOM EXTRACT calculation card

Continuous phase: downward NMP-rich extract. Entrained dispersed phase: RRBO drops rising. Phase properties are swapped explicitly from the top; μ_c=0.001416 Pa·s and μ_d=0.0598 Pa·s. The top NMP-compartment d32 is NOT assigned to these RRBO drops. Bottom RRBO size is unknown; inverse threshold and size sensitivities are calculated instead.


| Result at 700 mm | N4 unbound | N7 unbound |
| --- | --- | --- |
| Extract Q, m³/s | 0.0006131529 | 0.0006247746 |
| Downward U, m/s | 0.001593246 | 0.001623444 |
| Required vt=2U, m/s | 0.003186492 | 0.003246889 |
| Critical RRBO diameter, µm | 250.031 | 252.626 |
| Re at critical size | 0.571097 | 0.587960 |
| Eo at critical size | 0.008137 | 0.008307 |
| We at critical size | 0.000234 | 0.000246 |
| Net upward speed at threshold, m/s | 0.001593246 | 0.001623444 |
| Area at equality, m² | 0.3848451001 | 0.3848451001 |
| Screen condition | PASS only if actual capture drop ≥ critical size | PASS only if actual capture drop ≥ critical size |
| Actual geometry acceptance | HOLD — capture/drop basis missing | HOLD — capture/drop basis missing |


At the inverse threshold the margin ratio is exactly 1 under the assumed f=.50 criterion (vt/U=2); there is no additional margin beyond that selected factor. This is a requirements curve, not a predicted physical drop size. Low Eo at the critical bottom size makes small-deformation approximation more plausible than for the top mean drop, but real interface mobility, contamination, inversion and mixture properties remain unvalidated. Exact drag was used regardless of Re; no claim of exact Stokes validity is made.

### Bottom droplet-size sensitivity — deliberately assumed sizes, NOT assigned design input

Common physical-property proxy applies to both scenarios. Required D below is derived from f=.50; v_net differs by scenario. PASS/FAIL refers only to the selected numerical screen at 700 mm.


| Assumed RRBO d, µm | vt, m/s | Re | Eo | N4 D_req, mm | N7 D_req, mm | N4 / N7 screen |
| --- | --- | --- | --- | --- | --- | --- |
| 50 | 0.000139884 | 0.005013 | 0.000325 | 3340.95 | 3372.47 | FAIL / FAIL |
| 100 | 0.000552720 | 0.039619 | 0.001302 | 1680.75 | 1696.60 | FAIL / FAIL |
| 200 | 0.002108000 | 0.302206 | 0.005206 | 860.64 | 868.75 | FAIL / FAIL |
| 300 | 0.004416318 | 0.949696 | 0.011714 | 594.60 | 600.21 | PASS / PASS |
| 500 | 0.010271548 | 3.681364 | 0.032540 | 389.88 | 393.56 | PASS / PASS |
| 1000 | 0.026372676 | 18.904143 | 0.130161 | 243.32 | 245.61 | PASS / PASS |


| Assumed RRBO d, µm | N4 net upward speed, m/s | N7 net upward speed, m/s | N4 margin ratio | N7 margin ratio |
| --- | --- | --- | --- | --- |
| 50 | -0.001453362 | -0.001483560 | 0.0439 | 0.0431 |
| 100 | -0.001040526 | -0.001070724 | 0.1735 | 0.1702 |
| 200 | 0.000514754 | 0.000484555 | 0.6615 | 0.6492 |
| 300 | 0.002823072 | 0.002792874 | 1.3859 | 1.3602 |
| 500 | 0.008678302 | 0.008648104 | 3.2235 | 3.1635 |
| 1000 | 0.024779430 | 0.024749232 | 8.2764 | 8.1224 |


If v_net≤0, extra height cannot reverse the direction of motion under this opposing-flow model. If v_net>0 but the 50% screen fails, height alone still cannot satisfy that velocity-margin criterion. Sizes in this table are sensitivity coordinates, not assumed real populations or a proposed coalescer performance.

### Enlarged-bottom diameter sensitivity — not selected geometry


| Candidate bottom ID, mm | N4 U, m/s | N7 U, m/s | N4 critical RRBO d, µm | N7 critical RRBO d, µm |
| --- | --- | --- | --- | --- |
| 700 | 0.001593246 | 0.001623444 | 250.031 | 252.626 |
| 1000 | 0.000780691 | 0.000795488 | 170.682 | 172.371 |
| 1200 | 0.000542146 | 0.000552422 | 141.198 | 142.574 |


Larger cross-section reduces the required capture diameter, showing a quantitative potential benefit. There is no established actual droplet cutoff or carryover target with which to justify selecting 1000 or 1200 mm. Transition height depends on a selected end diameter and independently justified cone angle/layout; neither is frozen here.

## 7. Height, residence time and interface — parametric, not arbitrary time sizing

For an ideal axial separation travel length L and positive net speed: t_settle=L/(v_t−U_c). For an occupied continuous-phase volume approximated by A H in the dilute limit: t_bulk=A H/Q_c=H/U_c. These are different times with different physical definitions. Assuming L=H makes their ratio U_c/(v_t−U_c), independent of H; choosing an arbitrary residence time cannot uniquely determine a physically sufficient end height. Actual inlet/outlet paths, calming, dispersion-band holdup, coalescence and interface/control inventory must determine the layout.

The following per-metre coefficients are parametric only. Top uses the conditional mean drop; bottom uses the inverse threshold (not a known real drop). H and L need not be equal.


| Quantity | N4 seconds per metre | N7 seconds per metre |
| --- | --- | --- |
| Top t_settle / L | 29.492 | 29.462 |
| Top t_bulk / H | 362.511 | 367.206 |
| Bottom threshold t_settle / L | 627.649 | 615.974 |
| Bottom t_bulk / H | 627.649 | 615.974 |


The existing Stage-5 straight-side allowances H_top=H_bottom=0.7 m are geometry proportions, not validated settling heights. Multiplying the above coefficients by 0.7 is merely a hypothetical idealized transit/inventory time and does not approve those heights. For example:


| Hypothetical 0.7-m allowance | N4 seconds | N7 seconds |
| --- | --- | --- |
| Top mean-drop travel, IF L=0.7 m | 20.64 | 20.62 |
| Top bulk-volume residence, IF H=0.7 m | 253.76 | 257.04 |
| Bottom threshold-drop travel, IF L=0.7 m | 439.35 | 431.18 |
| Bottom bulk-volume residence, IF H=0.7 m | 439.35 | 431.18 |


## 8. Layout continuation and existing geometry reference

TOP concept: upward RRBO-rich bulk withdrawal away from the agitated exit; provide a calm path for descending NMP drops back toward the active section. Retain fresh NMP feed at the top with a separately designed distributor that avoids outlet short-circuiting and excessive breakup. Free-surface level, any local heavy-phase accumulation/interface and control band must be defined from the actual layout; do not invent a second stable interface merely for symmetry.

BOTTOM concept: downward NMP-rich bulk withdrawal with an upward path for entrained RRBO drops to rejoin the active section; retain RRBO feed near the bottom. The inversion/dispersion-band location, extract outlet submergence and interface-control band require explicit hydraulic/control design. Fresh NMP feed is not moved to the bottom: the existing countercurrent orientation places it at the top.

Both ends need separate decisions for calming clearance from terminal stators/rotors, distributor geometry, vent and drain duty, sampling, level/interface instrumentation, alarms and maintainability. Generic ports in the present drawing are not proof of instrument selection or suitable return-flow capacity. No full dispersed-phase return rate can be assigned from the available equilibrium streams.

Existing Stage-5 reference only, elevations above bottom pole: active start 0.875 m; active end 5.075 m; top tangent 5.775 m; vessel height 5.950 m; overall envelope 7.000 m. Current 0.7-m end allowances and .087-m rotor clearances are not approved disengagement or calming dimensions.


| Existing port | Service | Bore mm (proportional) | Elevation m (reference only) |
| --- | --- | --- | --- |
| P01 | RRBO feed | 70.0 | 0.595 |
| P02 | NMP-rich extract outlet | 70.0 | 0.455 |
| P03 | NMP feed | 70.0 | 5.355 |
| P04 | RRBO-rich raffinate outlet | 70.0 | 5.495 |
| A01 | Low-shell flush | 28.0 | 0.315 |
| A02 | High-shell equalization | 28.0 | 5.635 |
| S01 | Lower sample connection | 17.5 | 0.735 |
| S02 | Upper sample connection | 17.5 | 5.215 |
| I01 | Lower instrument connection | 17.5 | 0.385 |
| I02 | Upper instrument connection | 17.5 | 5.285 |
| D01 | Bottom-head drain | 28.0 | 0.000 |
| V01 | Top-head crown-region vent | 28.0 | 5.915 |


The 70-mm process bores arise from D/10, not hydraulic nozzle sizing. An approved velocity/pressure-drop/erosion/breakup criterion, nozzle schedule and inlet distribution design are missing; no existing bore is accepted by this report. Vent is a crown-region connection, not qualified relief/vent capacity. Generic instrument connections do not specify interface-measurement technology or setpoints.

Overall additional straight/transition length beyond the active section is H_top + H_bottom + H_transition,top + H_transition,bottom. For a straight shell, transition terms are zero; H_top and H_bottom remain HOLD. Heads, flanges and mechanical envelope remain separate. For an enlarged end, transition geometry and inlet/outlet elevations must be derived only after diameter and layout criteria are accepted.

## 9. Decision table and required next evidence


| Item | Available result | Status / genuinely missing requirement |
| --- | --- | --- |
| Frozen active column | 700-mm ID × 4200-mm active; 20 × 210-mm compartments | INHERITED — unchanged |
| Top 700-mm shell | Mean-drop 50%-velocity screen passes both scenarios | CONDITIONAL ONLY; actual exit PSD/capture criterion and shape/property applicability missing |
| Bottom 700-mm shell | Critical RRBO drop 250.0–252.6 µm | HOLD; actual entrained RRBO size/distribution and load unknown |
| Enlarged bottom | 1000/1200-mm requirements curves quantified | NOT SELECTED; actual capture requirement absent |
| Stage-2 outlet binding | N4 and N7 rates/compositions already available | HOLD; explicitly admit compatible downstream trial, do not request re-entry |
| Property closure | Saved nominal phase properties reused | PROXY ONLY; product-mixture evidence/closure or authorized bounded basis needed |
| Design velocity factor | f=0.50 explicit screening assumption | Requires engineering acceptance; not existing governed criterion |
| Carryover / separation spec | No physical carryover prediction available | Specify allowable entrainment and capture distribution; dissolved NMP is excluded |
| End heights / coalescence / interface | Parametric times and legacy proportions shown | HOLD; layout travel path, calming/coalescence and control inventory criteria missing |
| Nozzles / distributor / return paths | Existing service/elevation references available | HOLD; hydraulic/control criteria missing; do not approve proportional bores |
| Final geometry release | Candidate summary only | HOLD — NOT FOR FABRICATION |


## 10. Reproducibility and checks

Run: npx tsx deliverables/kuhni-end-section-preliminary-calculation.ts

The companion .input.json contains the compact frozen audit extract, unrounded source numbers and hashes; .results.json contains full-precision calculated outputs and checks. After the first extraction, reruns use only the companion input and the pure exported drag function, with no DB/network calls, workflow execution, upstream optimization or UI/scientific-state mutation. Changing the drag source fails the source-hash guard.

Input SHA-256: 3e65f398cfd714f599ab7fcb420e07c4a4d3c6637053a71498567099413536d2.

Drag source SHA-256: 9a1def48c229c5af65fe2fe3773f032d556bbdeaccbfe9c49a2166042f34f4ed.

Checks PASS: each N4/N7 mass balance closes within 10⁻⁸ kg/h; isolated top terminal velocity reproduces the saved result within 10⁻¹² m/s; all evaluated drop force balances close within 10⁻¹² N; bottom inverse roots satisfy vt=2U within 10⁻¹² m/s. These are numerical consistency checks, not experimental qualification.

Internal source paths: server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts (dragCoefficient); server/ecr-pre-pilot/stage1.ts (saved process basis); server/ecr-pre-pilot/p1-candidate-service.ts and automatic-hydraulic-selection.ts (current immutable hydraulic selection); stage4-pre-pilot-sizing-service.ts (physical sizing authority); stage5-geometry-service.ts and shared/ecr-stage5-geometry.ts (existing preliminary layout). No external standard, empirical coalescence correlation or invented acceptance criterion is claimed.
