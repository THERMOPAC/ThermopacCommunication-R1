# Framed end-section rule — separate S/O 1.5 mass calculation

**Computed feeds and conditional dimensions; actual product split, final selection and fabrication remain HOLD.**

Run `node deliverables/end-rule-calculation.mjs`; test `node deliverables/end-rule-tests.mjs`. Only new end-rule outputs are written. Source SHA-256 hashes and unrounded numbers are in JSON. No saved Stage 1/2, job, Stage 5, app or database is changed.

## Feasibility decision before any long solver

The exported balance has S/O=0.6, with alternative N=4 and N=7 trials. Its Stage-2 releaseEligible flag is false; Stage-4 has no Stage-2 job binding. The frozen job includes an input snapshot/model/engine hashes, but these are not an accepted S/O=1.5 result. The inspected offline refinement script fits a different xylene-family model; it is not a reusable RRBO product calculation. Current seven-component research worker variants exist, so a numerical research rerun may be possible, but its successful convergence would not establish the required qualified product split or select N=4, 7 or 20. No solver or persisted job was launched. This bounded calculation therefore uses a closed parameterized balance and separately labelled numerical sensitivities, not invented equilibrium.

The newer explicit 10-minute user rule governs residence dimensions; the older memory's prohibition on arbitrary residence selection does not override it. The memory's physical carryover/return and equilibrium distinctions remain applicable.

## Exact independent feed balance

RRBO: 4 m³/h ×869 kg/m³ = **3476 kg/h**. Wet solvent: 1.5×3476 = **5214 kg/h**, /1015 = **5.1369 m³/h**. Combined feed **8690 kg/h**. Inherited wet-solvent composition gives NMP 5187.930 kg/h and water 26.070 kg/h; this purity is a source assumption, not a newly measured assay.

| Component | Total feed kg/h |
| --- | --- |
| saturates | 2954.6000 |
| mono | 243.3200 |
| di | 139.0400 |
| poly | 69.5200 |
| polar | 69.5200 |
| NMP | 5187.9300 |
| water | 26.0700 |

For each component choose an evidenced fraction f_i to raffinate: R_i=F_i f_i; E_i=F_i(1−f_i). Thus R+E=8690 exactly, with no arbitrary phase loss. Actual f_i, R, E and product volumes remain null. **Total mass alone cannot determine two product streams.** Volume is not conserved on mixing; do not add feed m³/h and impose it on products. A product mass-to-volume conversion also requires its qualified density.

## Rule geometry: independent top and bottom comparison

Stage 5 active section remains Ø700, 20×210=4200 mm, rotor Ø231, 30 rpm, stator open fraction 0.4. All other active internals remain inherited, not recalculated. The new Ø700 entry/distribution neck is additional at each end and receives no active-stage or residence credit. Keep the earlier 300-mm bottom neck reservation; its adequacy and whether it fulfills all new distributor requirements need layout reconciliation. Top neck height and additional bottom requirement are not invented.

H10=Q_normal/(6×0.90×πD²/4), Q in m³/h, H in metres. The 0.90 factor is usable volume, **not a 10% product mass loss**. Net credited volume is Q/6 m³. Normal flow sets residence; 120% is only a hydraulic/nozzle check.

| D mm | Area m² | H10 m per m³/h | Transition min mm | Sharp 30° reference mm | Post-edge min mm |
| --- | --- | --- | --- | --- | --- |
| 700 | 0.3848 | 0.4812 | 280.0000 | 0.0000 | 280.0000 |
| 900 | 0.6362 | 0.2911 | 360.0000 | 173.2051 | 360.0000 |
| 1000 | 0.7854 | 0.2358 | 400.0000 | 259.8076 | 400.0000 |
| 1200 | 1.1310 | 0.1637 | 480.0000 | 433.0127 | 480.0000 |

**30° is wall-to-axis half-angle (60° included), following the earlier calculation.** L_sharp=(D−0.700)/(2 tan30°) is an unknuckled reference, not the finished transition. Rule 4 calls max(200 mm,0.4D) a minimum; the summary equality cannot simultaneously define an exact straight-cone length at the fixed diameter/angle. All expanded candidates have sharp-reference lengths below the stated minimum. Do not stretch the straight cone and still label it 30°, nor set the sharp reference equal to a finished formed transition. Mechanical design must solve radii, tangent points and total axial envelope with a 30° conical portion and verify L_transition≥minimum. It may require additional transition/straight tangent allowance or rule reconciliation. No separate cylindrical calming zone is assumed. At D700 there is no radial expansion, hence no 30° expanding cone; it is only a straight-bore comparison and requires a stated exception to the literal cone rule.

Use outward coordinate s from each active terminal **physical face** (top upward, bottom downward). Stack: extra neck → formed transition → 150-mm straight-shell allowance → interface → H10 → product-opening near edge → nozzle envelope → post-edge extension → torispherical head. Bottom is the mirror, with its interface 150 mm below the transition reference. Reconcile the terminal plate face, not center plane, with the frozen ledger before global elevations.

Conservative nozzle convention: H10 ends at the opening's nearest physical edge toward the interface, not centerline. If e_near and e_far are the final axial envelope offsets from nozzle center, center is at s_interface+H10+e_near; head tangent is at that center+e_far+Hpost. Top post extension begins above the crown/outer physical edge; bottom begins below the bottom outer edge. For a simple unreinforced radial pipe only, e_near=e_far=OD/2 is a provisional envelope, not the ID/2. Reinforcement, oblique openings and weld envelopes may increase it. These offsets are not yet final.

Straight shell beyond transition = 0.150+H10+e_near+e_far+max(0.200,0.4D). Transition, interface allowance, nozzle band, post-nozzle extension and torispherical ends get zero residence credit. Head radii/depth, cone knuckles, wall thickness, reinforcement, pressure/material/corrosion and ASME mechanical verification are TBD. No fabrication-compliance assertion or complete overall height is made.

## Numerical sensitivity ONLY — not actual S/O 1.5 outlet predictions

To make conditional sizing reproducible without fabricating equilibrium, each old N=4/N=7 component fraction to raffinate is held constant while its new feed component mass is used. This extrapolates S/O 0.6 partition fractions to 1.5 and is **unqualified**, neither conservative nor a confidence bound. Density proxies remain 869 top /1015 bottom kg/m³. Both outlets in each row belong to that one balanced scenario; do not mix independent maxima as an operating balance.

| Old trial used ONLY for fractions | R kg/h | E kg/h | Q top proxy m³/h | Q bottom proxy m³/h |
| --- | --- | --- | --- | --- |
| N4 | 3766.7131 | 4923.2869 | 4.3345 | 4.8505 |
| N7 | 3697.0182 | 4992.9818 | 4.2543 | 4.9192 |

| Sensitivity | D mm | Top H10 mm | Bottom H10 mm |
| --- | --- | --- | --- |
| N4 fractions | 700 | 2085.7538 | 2334.0458 |
| N4 fractions | 900 | 1261.7523 | 1411.9536 |
| N4 fractions | 1000 | 1022.0194 | 1143.6825 |
| N4 fractions | 1200 | 709.7357 | 794.2239 |
| N7 fractions | 700 | 2047.1614 | 2367.0870 |
| N7 fractions | 900 | 1238.4063 | 1431.9415 |
| N7 fractions | 1000 | 1003.1091 | 1159.8726 |
| N7 fractions | 1200 | 696.6035 | 805.4671 |

These are calculated conditional heights, not an arbitrary final choice of Ø900 or Ø1000. Qualified actual heights remain indeterminate.

## Revised nozzle hydraulic calculations

Inherited preliminary screening criterion: velocity≤0.5 m/s at 120% normal Q, not an ASME limit. Candidate Schedule40 bores use ID=OD−2wall, from the previous report's nominal ASME B36.10M dimensional assumptions (no lining/corrosion deduction). Metallurgy/schedule/pressure class and final bores remain mechanical decisions.

| Duty / basis | Normal m³/h | 120% m³/h | Required ID mm | Provisional DN | ID mm | v120 m/s |
| --- | --- | --- | --- | --- | --- | --- |
| P01 oil feed | 4.0000 | 4.8000 | 58.2692 | 65 | 62.6800 | 0.4321 |
| P03 wet solvent feed | 5.1369 | 6.1643 | 66.0331 | 80 | 77.9200 | 0.3591 |
| P04 conditional N4 | 4.3345 | 5.2014 | 60.6570 | 65 | 62.6800 | 0.4682 |
| P02 conditional N4 | 4.8505 | 5.8206 | 64.1659 | 80 | 77.9200 | 0.3391 |
| P04 conditional N7 | 4.2543 | 5.1052 | 60.0932 | 65 | 62.6800 | 0.4596 |
| P02 conditional N7 | 4.9192 | 5.9030 | 64.6184 | 80 | 77.9200 | 0.3439 |

The revised wet-solvent feed cannot retain the old DN50 on this criterion. P01/P03 feed results follow the specified new basis; P02/P04 actual selections remain null pending the real phase split/densities. JSON supplies every candidate ID/velocity, including DN80, rather than equating DN to bore. No distributor pressure loss, pump duty or nozzle mechanical qualification is inferred.

## Remaining holds

Specify/qualify S/O1.5 component allocation, phase densities and scientific boundary; establish independent droplet loading/DSDs and return paths, including the Ø700 throat. Dissolved NMP is not settleable carryover. Residence compliance alone demonstrates neither removal nor less than 5 wt% physical NMP. Neither the new feed nor these nozzles prove the unchanged active section hydraulically accepts S/O1.5. No active-section re-rating, diameter selection, <5% performance claim or fabrication release is authorized.
