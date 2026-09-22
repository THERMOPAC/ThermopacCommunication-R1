# Both physical end sections — preliminary sizing and nozzle calculations

**PRELIMINARY_CONDITIONAL_LAYOUT_AND_NOZZLES; CAPTURE/RETURN/FABRICATION HOLD**

Run offline: `node deliverables/end-sections-sizing.mjs`. SI calculations; displayed flows m³/h, dimensions explicitly labeled. The JSON contains complete numerical results, force/mass checks, sensitivity cases and source SHA-256 hashes. No database, app, saved geometry, or existing deliverable is edited. No CFD rerun.

## Decision and scope

**No enlarged top or final end-section geometry is selected or carried forward.** Top Ø1000 ×1600 mm straight and bottom Ø900 ×1200 mm straight are illustrative comparison geometries only, not qualified minimum diameters or proven separation duties. Top reference Ø700 ×1600 is not governing; bottom reference Ø900 ×1200 is independently screened below. Compare Ø700/900/1000/1200 without asserting enlargement cures carryover. The 700-mm top and 500-mm bottom effective calm heights are arbitrary disclosed comparison allowances, not calculated requirements or optima. Establish the frozen Stage20 boundary and terminal/return closure before selecting an enlarged top. Frozen active section: Ø700, 20 ×210 mm =4200 mm, rotor Ø231, 30 rpm, Np=1.2. No active geometry or Stage-2 thermodynamics is reopened.

Top candidate provides 388.405 s calm residence at 120% proxy flow and a local 2×velocity slip threshold 1.669 mm. Bottom independently provides 381.841 s and 0.225 mm for **RRBO drops in NMP-rich liquid**, not inherited NMP d32. Those are inverse hydraulic requirements, not measured capture sizes. The old bottom 900×1200 reservation arose from an assumed 200-µm / 0.5-factor screen, not an actual oil PSD; that assumed duty is not adopted here. No scientifically supported unique final diameter/height or predicted actual removal follows from the available outlet DSD, loading and return evidence. The conditional performance calculation below states exactly what would be needed for <5 wt% physical dispersed NMP.

## Read-only flow authority

Input: existing preliminary-calculation.input.json; original audit binds Stage-3 ledger 69, Stage-4 row17 and Stage-5 revision6. Stage-4 independently adopts 7 theoretical/20 physical stages but its Stage-2 link is NULL. Existing thermodynamic N4 and N7 trials are **alternative boundary scenarios**, not Stage20 outlet DSDs. No automatic binding of N7 is made. A balanced calculation is retained for each; envelope maxima use N4 top and N7 bottom and must not be summed as one operating point.

Oil feed=3476 kg/h=4 m³/h; fresh wet NMP=2085.6 kg/h=2.054778 m³/h. S/O=0.6 **mass**. Normalized source streams oil=100, solvent=60 are scaled by 34.76 kg/h per source mass unit. Components are saturates/mono/di/poly/polar/NMP/water. Every component balance and total balance closes within 1e-7 kg/h.

| Trial | Raff kg/h | Raff m³/h proxy | Extract kg/h | Extract m³/h proxy | Mass residual kg/h |
| --- | --- | --- | --- | --- | --- |
| 4 | 3321.139 | 3.821794 | 2240.461 | 2.207351 | 4.55e-13 |
| 7 | 3278.674 | 3.772927 | 2282.926 | 2.249189 | -3.18e-12 |

Outlet volumes are m/rho proxies, not composition-resolved measurements. 40°C basis: RRBO 869 kg/m³, μ=0.0598 Pa·s; wet NMP1015 kg/m³, μ=0.001416 Pa·s; σ=.011 N/m. For bottom, invert carrier/drop properties: carrier1015/.001416 and drop869/.0598. Mixture properties and contaminated-interface mobility remain unqualified. JSON sweeps carrier viscosity ±30% and density contrast ±20%, as engineering sensitivities, not confidence limits. Physical droplet recycle is not added to plant outlet mass flows without a closed local inventory.

## Slip, volume and residence

Immobile spherical Schiller–Naumann screening: Cd=24/Re(1+.15Re^.687) for Re≤1000, else .44; solve Cd Re²=4Ar/3, Ar=ρc|Δρ|gd³/μc². vt=Re μc/(ρc d); force residual independently checked. Eo and We exported per test size; large/deformed drops and concentrated swarms are not qualified by this relation. Opposite rise/settle direction is explicit. No d32 transfer to bottom, no coalescence credit.

Selected effective area=.9πD²/4 (10% assumed internals blockage); U=Q/Aeff; Vcalm=Aeff Hcalm; τ=Vcalm/Q. Design-rate sensitivity=1.2Q, not an inherited flow guarantee. Neutral diameter solves vt=U; chosen 2×design-slip margin solves vt=2Udesign, so an ideal drop can traverse Hcalm in τdesign. Height increases inventory and time but does not change the velocity threshold. There is no validated residence requirement to optimize height.

| Side | D mm | H calm mm | U design mm/s | τ nominal s | τ design s | Neutral nominal mm | 2×design slip mm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| top | 700 | 700 | 3.678 | 228.382 | 190.318 | 1.536 | 2.420 |
| top | 900 | 700 | 2.225 | 377.529 | 314.608 | 1.189 | 1.861 |
| top | 1000 | 700 | 1.802 | 466.086 | 388.405 | 1.069 | 1.669 |
| top | 1200 | 700 | 1.252 | 671.163 | 559.303 | 0.889 | 1.385 |
| bottom | 700 | 500 | 2.165 | 277.188 | 230.990 | 0.184 | 0.297 |
| bottom | 900 | 500 | 1.309 | 458.209 | 381.841 | 0.142 | 0.225 |
| bottom | 1000 | 500 | 1.061 | 565.691 | 471.409 | 0.127 | 0.201 |
| bottom | 1200 | 500 | 0.737 | 814.595 | 678.829 | 0.105 | 0.166 |

### Illustrative geometry local drop tests (independent test sizes, NOT actual DSD)

| Side | Test d mm | vt mm/s | Re | Eo | We | Net return mm/s | Calm crossing s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| top | 0.5 | 0.332 | 0.002 | 0.033 | 0.000 | -1.470 | — |
| top | 1 | 1.317 | 0.019 | 0.130 | 0.000 | -0.485 | — |
| top | 1.5 | 2.927 | 0.064 | 0.293 | 0.001 | 1.124 | 622.600 |
| top | 2 | 5.114 | 0.149 | 0.521 | 0.004 | 3.311 | 211.396 |
| top | 3 | 10.979 | 0.479 | 1.171 | 0.029 | 9.176 | 76.282 |
| bottom | 0.5 | 10.272 | 3.681 | 0.033 | 0.005 | 8.962 | 55.790 |
| bottom | 1 | 26.373 | 18.904 | 0.130 | 0.064 | 25.063 | 19.950 |
| bottom | 1.5 | 41.566 | 44.692 | 0.293 | 0.239 | 40.256 | 12.420 |
| bottom | 2 | 55.640 | 79.767 | 0.521 | 0.571 | 54.331 | 9.203 |
| bottom | 3 | 81.378 | 174.997 | 1.171 | 1.833 | 80.069 | 6.245 |

## Arrangement, anti-swirl and transitions

All arrangement dimensions below describe illustrative comparisons only. “Candidate,” “proposed,” and allowance language does not select a top diameter, authorize geometry changes, or establish an optimized calm height. Preliminary process-nozzle selections remain distinct from this unresolved end-section geometry.

Top datum is **upper terminal plate face**, not active-top center plane: existing evidence places the face 2 mm above nominal active-top. Proposed straight stack above enlarged-cone exit: 0–250 mm calming/anti-swirl and isolated downward NMP distributor; 250–950 mm effective quiet; 950–1200 mm baffled lateral raffinate withdrawal; 1200–1600 mm level/control/support/top-clearance allowance. Do not count cone/head/outlet band as calm volume. Candidate cone from Ø700 to1000 at selected 30° wall-to-axis angle adds 259.8 mm separately. Four stationary radial anti-swirl vanes and a low-momentum feed shield are conceptual allowances; no decay coefficient or removal efficiency is asserted. Keep final rotor/stator untouched; reconcile existing shaft support that intrudes near z350 mm. Full-bore effective-area and local opening velocities are different.

Bottom, independently, use 0–250 mm sump/outlet protection, 250–750 mm effective NMP-rich calm liquid, 750–1000 mm interface operating band, 1000–1200 mm oil-feed/internals allowance (datum lower straight tangent). RRBO rises through the interface; extract withdraws below it through a baffled outlet. Oil feed requires a low-shear distributor into the intended RRBO region, shielded from the extract takeoff. The lower enlarged transition to Ø700 is separate: 173.2 mm at 30°. Exact feed/interface elevations need phase inventory and level-control qualification; the proposed calm volume presumes the full 500 mm remains below the minimum interface. No RRBO nozzle is moved to the top and no NMP feed is moved to the bottom.

No overall vessel height or combined axial-stack total is asserted: the full retained-geometry ledger is not closed. In particular, retain the existing Ø700 ×300-mm bottom neck; this exercise does not authorize deleting or replacing it. Cone dimensions above are isolated illustrative geometric increments only; their integration with the retained neck, heads, terminal datums, supports and access must be reconciled before any total-height calculation.

## Return hydraulics: local settling is not collection

| Side | Available area fraction | Carrier @120% mm/s | Neutral size mm | 2×carrier size mm |
| --- | --- | --- | --- | --- |
| top | 1 | 3.310 | 1.598 | 2.289 |
| top | 0.4 | 8.276 | 2.577 | 3.767 |
| bottom | 1 | 1.948 | 0.192 | 0.280 |
| bottom | 0.4 | 4.870 | 0.317 | 0.483 |

The 700-mm throat and 40% plate openings remain stronger constraints than enlarged calm area. Bottom 40% is only a inherited common-stator screen, not a verified interface aperture. JSON also tabulates dilute return capacity Qd=Aopen α max(vt−Qc/[Aopen(1−α)],0) for **assumed** α=.01/.05 and independent sizes. This is a mean-flow eligibility estimate, not countercurrent flooding qualification or actual plate transmission. Fresh solvent 2.055 m³/h must also reach the active section; it cannot be claimed accommodated by the dilute terminal-droplet-return calculation. Terminal-origin recycled solvent is additional local traffic, not a second plant feed.

Keep the final rotor compartment, actual plate thickness/openings and both faces in the required domain. Gross Stage20 upcrossing, return across the **lower** face, fresh distributor source and outlet must be source-labelled. Jet decay can create a trapping surface: upper-face settling eligibility or contact is not lower-face return. Neither enlarging top nor assigning longer residence demonstrates cross-stream transport into a closed return path. Do not credit draining films, coalescence, a downcomer or a guard separator without loading, wetting, pressure and collection qualification. No such equipment is selected here.

## Process nozzles — actual assumed pipe bores, not D/10

ASME B36.10M nominal Schedule40 OD/wall dimensions assumed for carbon steel; ID=OD−2t, no lining/corrosion deduction. This is a bore calculation only: metallurgy, nozzle neck wall, flange class and reinforcement remain HOLD. Criteria selected for preliminary liquid nozzles: velocity≤0.5 m/s at 120% flow, then shield/diffuse feed jets. Not a universal standard limit.

| Tag/service/location | DN selected | ID mm | Q nominal m³/h | v nominal m/s | v design m/s | Re design | Jet momentum N | Δp neck Pa | Δp K=3 Pa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P01 RRBO feed / bottom | 65 | 62.68 | 4.000 | 0.360 | 0.432 | 394 | 0.501 | 63.140 | 243.384 |
| P02 extract outlet / bottom | 50 | 52.48 | 2.249 | 0.289 | 0.347 | 13038 | 0.264 | 10.621 | 182.899 |
| P03 fresh wet NMP feed / top | 50 | 52.48 | 2.055 | 0.264 | 0.317 | 11911 | 0.220 | 9.050 | 152.647 |
| P04 raffinate outlet / top | 65 | 62.68 | 3.822 | 0.344 | 0.413 | 376 | 0.457 | 60.327 | 222.181 |

### DN80 alternative, explicitly calculated

DN80 Schedule40 is OD88.90 × wall5.49 mm, **ID77.92 mm**, not the saved70-mm drawing allowance. DN65 is ID62.68 mm and DN50 ID52.48 mm. DN80 is a feasible lower-velocity alternative on all four duties, not required by the selected 0.5-m/s criterion.

| Service | DN80 area m² | v nominal m/s | v design m/s | Re design | Neck + K3 Δp Pa | Momentum design N |
| --- | --- | --- | --- | --- | --- | --- |
| RRBO feed | 0.004769 | 0.233 | 0.280 | 317 | 128.347 | 0.324 |
| extract outlet | 0.004769 | 0.131 | 0.157 | 8781 | 39.231 | 0.120 |
| fresh wet NMP feed | 0.004769 | 0.120 | 0.144 | 8022 | 32.774 | 0.100 |
| raffinate outlet | 0.004769 | 0.223 | 0.267 | 303 | 118.291 | 0.296 |

All DN40/50/65/80 alternatives, minimum required bores and loss ranges are in JSON. Δp=(f L/ID+K)ρv²/2, L=.3m neck selected; f=64/Re laminar, otherwise Swamee–Jain roughness45μm (transition explicitly uncertain). K=3 is an illustrative combined entrance/turn-in/exit allowance, **not a measured fitting or distributor coefficient**; K1–10 range exported. Loss excludes piping, valves, elevation, feed-distributor restriction and outlet hydrostatic balance. Existing pressure field “2.0” has no qualified boundary interpretation here; no pump head, pressure differential or flange rating is inferred. Net pressures at both sides and levels must be supplied.

At equal Q, inlet force ρQv and dynamic pressure quantify jet scales, not penetration distance or turbulence. Low-velocity distributor selections:

| Feed | Assumed exit m/s | Required open area m² | Equivalent open diameter mm | 10-mm hole count example | Dynamic pressure Pa |
| --- | --- | --- | --- | --- | --- |
| RRBO feed | 0.1 | 0.01333 | 130.3 | 170 | 4.345 |
| fresh wet NMP feed | 0.1 | 0.00685 | 93.4 | 88 | 5.075 |

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

| Gross r kg/kg B | β eligible | γ actually returned | Physical outlet wt% | <5% conditional |
| --- | --- | --- | --- | --- |
| 0.02 | 0.9 | 0 | 1.961 | yes |
| 0.02 | 0.9 | 0.5 | 1.088 | yes |
| 0.02 | 0.9 | 1 | 0.200 | yes |
| 0.1 | 0.9 | 0 | 9.091 | no |
| 0.1 | 0.9 | 0.5 | 5.213 | no |
| 0.1 | 0.9 | 1 | 0.990 | yes |
| 0.25 | 0.9 | 0 | 20.000 | no |
| 0.25 | 0.9 | 0.5 | 12.088 | no |
| 0.25 | 0.9 | 1 | 2.439 | yes |

At r=.10, actual overall return must exceed 47.368%; at r=.25 it must exceed 78.947%. With β=.9 and γ=1, predicted physical outlet is 0.990% for r=.10; with no proved return (γ=0), it is 9.091%. These are **what-if load/return cases**, not expected operation. Saved raffinate B proxies yield allowable added dispersed NMP <172.562 to <174.797 kg/h; this is a target translation, not measured entrainment.

A droplet indefinitely retained in the calm zone is not removed at steady state. Unresolved inventory accumulation/contact cannot be assigned to return to improve this table. Actual DSD/alpha and spatial one-way crossing flux are missing, so β and γ cannot presently be calculated from diameter. The inherited 6.068-mm active NMP mean and transferred donor widths establish neither. No 500-μm stress is selected as design duty. Bottom has no supplied oil-carryunder target or outlet RRBO DSD; its result remains an independently calculated inverse rise requirement, not an invented efficiency.

## Release gates

1. Bind one compatible saved outlet trial for duty (or approve envelope); obtain actual mixture properties and rate range.
2. Establish the same Stage20 boundary across top candidates: physical loading, source-labelled one-way outlet-flux DSD, spatial axial/radial/tangential velocities, pressure, and final rotor/plate two-face geometry.
3. Qualify anti-swirl decay, inlet/outlet short-circuiting, local coalescence efficiency at real loading, contact/wetting and actual lower-face return; close each cohort inventory at steady state. Coalescence redistributes mass, never deletes it.
4. Independently establish bottom RRBO drop population/loading, interface operating band, carryunder criterion and countercurrent return path. Do not transplant NMP d32.
5. Confirm distributor and nozzle pressure budgets, vent/relief/vacuum/blanket and drain duties; reconcile support/access/manway reinforcement and full pressure-vessel mechanical design.

**Completed now:** balanced source-scaled duties; reproducible independent top/bottom slip and inverse sizes; diameter/residence/cone candidates; frozen-throat/opening return screens; real-bore process nozzle alternatives, momentum and conditional losses; auxiliary allowances; physical-only loading/return target calculation. **Not claimed:** actual <5% performance, validated coalescence, fully closed return, final fabrication sizes, or pressure safety approval.
