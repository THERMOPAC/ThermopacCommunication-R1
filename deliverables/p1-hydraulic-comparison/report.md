# P1 hydraulic comparison — saved feasible sweep

**COMPLETE • CANDIDATE ONLY • NOT ENGINEERING-QUALIFIED**

## Decision in one paragraph

**D = 1.5 m at 30 rpm is the maximum modeled hydraulic-headroom candidate**: max-six loading 0.320454, absolute headroom 0.379546, or 37.954589 percentage points below 0.70. Geometry: hc/D = 0.30, rotor/D = 0.33, free area = 0.40. D = 1.4 m is second by this same objective (37.636539 pp), only 0.318051 pp behind. These are modeled turning-capacity margins, not observed flooding or a definitive engineering best. All selected points use the same geometry ratios and 30 rpm; no RPM-window criterion was applied.

## Scope and reproducibility

Terminal COMPLETE and all 16 source manifest SHA256 entries verified. Result SHA256: fe523527db2be6d17d1f922f9ad209d207a8c10f81d2e96e28a83536fd56f2fa.

Saved full sweep: 13,230 points / 79,380 scenarios. This comparison: **158 feasible points / 948 scenarios**, 13 diameters from 0.3 to 1.5 m. Selected-best subset: **13 points / 78 scenarios**. D = 0.2 m has **no feasible point**; it is not assigned a winner. Reproduction command: node --max-old-space-size=4096 deliverables/p1-hydraulic-comparison/reproduce.mjs. Only frozen saved JSON/CSV/manifest/terminal are read; no DB or scientific engine access.

## Methodology

1. Saved-data postprocessing only: no engine/solver import, no model execution, no database read/write, no application, input, equation or authority changes.

2. Use saved FEASIBLE classification and verify all six loading <=0.70, tip speed <=4.5 m/s, finite metrics and lower-root evidence. Ignore the 20 rpm rule AND all RPM-window preferences. No comparison ranking from the old window selection is used.

3. Within each diameter minimize max(six scenario loading). Absolute headroom = 0.70 - maxLoading; percentage-point headroom = 100 times that difference (NOT percent relative). This is the sole hydraulic objective, not area or a weighted score.

4. Exact objective ties are retained and counted; deterministic presentation tie-break: ascending RPM, hc/D, rotor/D, free area. Numerical near-ties are not claims of significant engineering differences.

5. Controlling scenario is saved governing minimum-capacity scenario, checked against all six. Its capacity, holdups, drop size, area, roots and diagnostics stay together. Worst separation is min over six of phi_turn - phi_op; ranges describe scenario envelopes, not synthetic scenarios.

6. Area objective for alternatives is maximize MINIMUM six-scenario interfacial area (m2/m3): conservative across mandatory unestablished interface/coefficient cases, not an average. It is not a transfer coefficient, residence time, removal prediction or guaranteed contact efficiency.

7. Pareto 2D uses maximize headroom and minimum-six area, globally and within each D. Optional global 3D adds maximize minimum-six turning separation. Exact nonweighted dominance (all no worse and at least one strictly better); all equal-coordinate trials remain. No cost/compactness/spacing preference is invented.

8. Roots and 16-point continuation are stored evidence, not rerun. Recheck closure, endpoint, monotonic holdup and signed velocities algebraically. Lower branch is quasi-steady admissibility, not dynamic stability. Root distance and normalized turning separation are geometry of saved solutions, not probabilities or confidence.

9. Verify SHA256 of every file in source manifest and terminal COMPLETE/result hash. Cross-check all feasible CSV scenario numerical core metrics, roots, continuation, diagnostics, velocities and qualification against saved JSON. CSV doubled-quote handling preserves backslashes in embedded JSON.

10. Reporting uses rounded tables; CSV/JSON retain native JS numeric precision. No new physical acceptance cutoffs are imposed on Eo, We, Re or Oh. Drag-correlation bounds and spherical/turbulent validity remain UNKNOWN as stored.

## Best hydraulic point at every feasible diameter

All rows: 30 rpm, hc/D 0.30, rotor/D 0.33, free area 0.40. Loading is dimensionless; margin is absolute fraction and percentage points, never relative percent. Capacity and all controlling columns belong to the same scenario.

| D m | Feasible points | Exact ties | Max loading | Margin absolute | Margin pp | Control | Capacity m/s | phi op | phi turn | Separation pp | d32 mm | Area m²/m³ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 1 | 1 | 0.674354 | 0.025646 | 2.564595 | 0.36/SN | 0.035284 | 0.072826 | 0.193275 | 12.044854 | 11.95224 | 36.558561 |
| 0.4 | 5 | 1 | 0.530591 | 0.169409 | 16.940934 | 0.36/SN | 0.025225 | 0.050421 | 0.186737 | 13.631652 | 9.495073 | 31.861069 |
| 0.5 | 10 | 1 | 0.457781 | 0.242219 | 24.221875 | 0.36/SN | 0.018711 | 0.04058 | 0.181543 | 14.096335 | 7.942739 | 30.654362 |
| 0.6 | 11 | 1 | 0.415105 | 0.284895 | 28.489453 | 0.36/SN | 0.01433 | 0.035125 | 0.177446 | 14.232127 | 6.864759 | 30.700236 |
| 0.7 | 12 | 1 | 0.387722 | 0.312278 | 31.227815 | 0.36/SN | 0.011272 | 0.031713 | 0.17421 | 14.249655 | 6.068312 | 31.356145 |
| 0.8 | 14 | 1 | 0.369017 | 0.330983 | 33.098257 | 0.36/SN | 0.009067 | 0.029411 | 0.171638 | 14.222738 | 5.453488 | 32.358409 |
| 0.9 | 15 | 1 | 0.355637 | 0.344363 | 34.436341 | 0.36/SN | 0.007434 | 0.027774 | 0.169579 | 14.180597 | 4.963092 | 33.576074 |
| 1 | 15 | 1 | 0.345714 | 0.354286 | 35.428628 | 0.36/SN | 0.006194 | 0.026562 | 0.167916 | 14.135387 | 4.561906 | 34.935628 |
| 1.1 | 15 | 1 | 0.338138 | 0.361862 | 36.186163 | 0.36/SN | 0.005234 | 0.025638 | 0.16656 | 14.092129 | 4.226999 | 36.392112 |
| 1.2 | 15 | 1 | 0.332213 | 0.367787 | 36.778657 | 0.36/SN | 0.004476 | 0.024916 | 0.165443 | 14.052722 | 3.942769 | 37.916231 |
| 1.3 | 15 | 1 | 0.327482 | 0.372518 | 37.251783 | 0.36/SN | 0.003869 | 0.024339 | 0.164516 | 14.017671 | 3.698211 | 39.487958 |
| 1.4 | 15 | 1 | 0.323635 | 0.376365 | 37.636539 | 0.36/SN | 0.003376 | 0.02387 | 0.163739 | 13.986873 | 3.48533 | 41.093069 |
| 1.5 | 15 | 1 | 0.320454 | 0.379546 | 37.954589 | 0.36/SN | 0.00297 | 0.023484 | 0.163083 | 13.959982 | 3.298172 | 42.721158 |

## Worst separation and six-scenario envelopes

Each range retains its own six-scenario endpoints; combining minima/maxima across columns does NOT define a real operating case. BP = BARRY_PARLANGE_MOBILE; SN = SCHILLER_NAUMANN_IMMOBILE; prefix is C32.

| D m | Min separation pp | Scenario(s) | Different from capacity control? | d32 mm range | phi op range | Area m²/m³ range | Rotor Re | P/V W/m³ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 12.044854 | 0.36/SN | false | 11.95224–14.276287 | 0.030786–0.072826 | 12.93881–36.558561 | 71.212952 | 0.194855 |
| 0.4 | 13.631652 | 0.36/SN | false | 9.495073–11.341338 | 0.023414–0.050421 | 12.386847–31.861069 | 126.600803 | 0.346409 |
| 0.5 | 14.096335 | 0.36/SN | false | 7.942739–9.487161 | 0.019394–0.04058 | 12.265375–30.654362 | 197.813754 | 0.541265 |
| 0.6 | 14.232127 | 0.36/SN | false | 6.864759–8.199574 | 0.016886–0.035125 | 12.356458–30.700236 | 284.851806 | 0.779421 |
| 0.7 | 14.249655 | 0.36/SN | false | 6.068312–7.248261 | 0.015194–0.031713 | 12.577724–31.356145 | 387.714958 | 1.060879 |
| 0.8 | 14.222738 | 0.36/SN | false | 5.453488–6.513888 | 0.013992–0.029411 | 12.887697–32.358409 | 506.403211 | 1.385637 |
| 0.9 | 14.180597 | 0.36/SN | false | 4.963092–5.928137 | 0.013103–0.027774 | 13.261919–33.576074 | 640.916564 | 1.753697 |
| 1 | 14.135387 | 0.36/SN | false | 4.561906–5.448943 | 0.012428–0.026562 | 13.68446–34.935628 | 791.255017 | 2.165058 |
| 1.1 | 14.092129 | 0.36/SN | false | 4.226999–5.048916 | 0.011902–0.025638 | 14.144207–36.392112 | 957.41857 | 2.619721 |
| 1.2 | 14.052722 | 0.36/SN | false | 3.942769–4.709418 | 0.011485–0.024916 | 14.633016–37.916231 | 1139.407224 | 3.117684 |
| 1.3 | 14.017671 | 0.36/SN | false | 3.698211–4.417307 | 0.01115–0.024339 | 15.144702–39.487958 | 1337.220978 | 3.658949 |
| 1.4 | 13.986873 | 0.36/SN | false | 3.48533–4.163033 | 0.010876–0.02387 | 15.674442–41.093069 | 1550.859833 | 4.243514 |
| 1.5 | 13.959982 | 0.36/SN | false | 3.298172–3.939483 | 0.010649–0.023484 | 16.218394–42.721158 | 1780.323788 | 4.871381 |

## Strongest candidates and physical trade-offs

**Maximum modeled headroom: 1.5 m; second: 1.4 m.** The difference is numerical, not proof of physical superiority under unqualified correlations. **Smaller-diameter near-plateau alternatives: 0.9 and 1.0 m at 30 rpm**, not automatically preferred without a footprint/cost/contact requirement. D = 0.9 gives 34.436341 pp headroom; D = 1.0 gives 35.428628 pp; D = 1.5 gives 37.954589 pp. Moving 1.0 → 1.5 gains 2.525961 pp while diameter rises 50% (cross-section ×2.25); modeled max loading changes 0.345714 → 0.320454. Their conservative minimum areas actually INCREASE 13.68446 → 16.218394 m²/m³. Consequently the saved data do not support a blanket claim that area decreases with increasing diameter. The 1.5 m / 30 rpm point improves both headroom and conservative area over 1.0 m / 30 rpm, but has slightly less worst-six turning separation (13.959982 versus 14.135387 pp). D=1.4 is dominated by D=1.5 on the two objectives, but survives the three-objective frontier because its turning separation is 13.986873 pp.

At fixed phase holdup area is 6 phi/d32, so smaller drops would increase area; across these selected cases phase holdup is NOT fixed. Larger D reduces superficial flux and computed holdup, competing with decreasing d32. From D=0.3 to 0.5, conservative area falls 12.93881 → 12.265375 and controlling area falls 36.558561 → 30.654362 m²/m³. Above that range the saved selected areas rise. D=0.3 selected governing drop is 11.95224 mm versus 3.298172 mm at D=1.5. The large-drop cases carry stronger deformation-related diagnostic concern; no Eo/We acceptance threshold is newly asserted here. All diameters remain extrapolated and unqualified.

**Area-led candidate: D=1.5 m, 40 rpm, hc/D=0.30, rotor/D=0.33, free area=0.40** maximizes conservative area over all 158 feasible points (47.658396 m²/m³), but leaves just 4.616671 pp headroom. **Turning-separation-led candidate among the best-margin selections: D=0.7 m at 30 rpm**, with 14.249655 pp worst-six turning gap, versus 13.959982 at D=1.5. These are distinct modeled objectives, not equivalent quality claims.

30 rpm can maximize this model's capacity margin while low modeled power density/turbulence may not establish adequate dispersion. Neither area nor these hydraulics establish sulfur removal, mass-transfer rate, residence-time adequacy, coalescence, phase inversion, entrainment or disengagement. There is **no defensible unique engineering compromise** without specifying and qualifying those criteria; the explicit headroom and contact-area candidates below are the appropriate shortlist.

## Higher-area alternatives within each diameter

The area-best point maximizes minimum-six area, not mean or governing-only area. It can have less hydraulic headroom. Full ratios are encoded as D|hc/D|rotor/D|free area|rpm in each key. Exact area ties are counted; tie-break is presentation only.

| D m | 30 rpm min area | 30 rpm margin pp | Area-best key | Area ties | Area-best min area | Area-best margin pp | Area-best min separation pp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 12.93881 | 2.564595 | 0.3 / 0.3 / 0.33 / 0.4 / 30 | 1 | 12.93881 | 2.564595 | 12.044854 |
| 0.4 | 12.386847 | 16.940934 | 0.4 / 0.2 / 0.33 / 0.4 / 30 | 1 | 18.208598 | 4.626588 | 11.706039 |
| 0.5 | 12.265375 | 24.221875 | 0.5 / 0.25 / 0.33 / 0.4 / 35 | 1 | 23.953878 | 0.723582 | 10.676031 |
| 0.6 | 12.356458 | 28.489453 | 0.6 / 0.25 / 0.33 / 0.4 / 35 | 1 | 24.293438 | 5.881187 | 11.203717 |
| 0.7 | 12.577724 | 31.227815 | 0.7 / 0.2 / 0.33 / 0.2 / 30 | 1 | 26.432004 | 1.221687 | 10.394233 |
| 0.8 | 12.887697 | 33.098257 | 0.8 / 0.2 / 0.33 / 0.4 / 35 | 1 | 32.723277 | 2.200775 | 10.36268 |
| 0.9 | 13.261919 | 34.436341 | 0.9 / 0.3 / 0.33 / 0.4 / 40 | 1 | 36.346809 | 0.072765 | 9.97598 |
| 1 | 13.68446 | 35.428628 | 1 / 0.3 / 0.33 / 0.4 / 40 | 1 | 38.071766 | 1.355371 | 10.100299 |
| 1.1 | 14.144207 | 36.186163 | 1.1 / 0.3 / 0.33 / 0.4 / 40 | 1 | 39.891181 | 2.332615 | 10.189041 |
| 1.2 | 14.633016 | 36.778657 | 1.2 / 0.3 / 0.33 / 0.4 / 40 | 1 | 41.777158 | 3.096127 | 10.254916 |
| 1.3 | 15.144702 | 37.251783 | 1.3 / 0.3 / 0.33 / 0.4 / 40 | 1 | 43.709629 | 3.706088 | 10.305499 |
| 1.4 | 15.674442 | 37.636539 | 1.4 / 0.3 / 0.33 / 0.4 / 40 | 1 | 45.673766 | 4.203402 | 10.345541 |
| 1.5 | 16.218394 | 37.954589 | 1.5 / 0.3 / 0.33 / 0.4 / 40 | 1 | 47.658396 | 4.616671 | 10.378146 |

## The 0.9 m / 40 rpm edge case

At 0.9|0.3|0.33|0.4|40, minimum-six area is 36.346809 m²/m³, but max loading is 0.699272 and headroom only 0.072765 pp. The 0.9 m best-margin 30 rpm point instead has 34.436341 pp headroom and 13.261919 m²/m³ minimum area. Higher area cannot make the 40 rpm case the hydraulic-objective winner; proximity to the acceptance limit is not operating robustness.

## Why the hydraulic leader is still conditional

Every point on the global headroom–conservative-area frontier is D=1.5 m in this saved grid. Smaller diameters are therefore NOT non-dominated alternatives on those two modeled objectives alone. They can remain relevant through the explicitly reported third objective (turning separation), footprint or future qualification evidence—not an invented compactness score.

| Selected D m | Governing Eo | Governing We | Governing Re terminal | Governing Oh continuous | D / source maximum | Interpretation |
| --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 18.594285 | 8.341482 | 16.32493 | 0.176917 | 1.973684 | UNKNOWN spherical/drag/turbulence validity |
| 0.9 | 3.206162 | 0.276259 | 1.91443 | 0.274548 | 5.921053 | UNKNOWN spherical/drag/turbulence validity |
| 1 | 2.708778 | 0.191539 | 1.528295 | 0.286366 | 6.578947 | UNKNOWN spherical/drag/turbulence validity |
| 1.5 | 1.415883 | 0.04438 | 0.625513 | 0.336789 | 9.868421 | UNKNOWN spherical/drag/turbulence validity |

Larger-D selections lower the drop-deformation diagnostics here, but increase the scale extrapolation beyond the source geometry. Those competing qualification concerns are not converted into a synthetic risk/confidence score. The maximum-headroom candidate remains a modeled shortlist leader, not hydraulically validated equipment.

## Nonweighted Pareto alternatives

Global two-objective frontier: 10 of 158 points. Three-objective frontier (adding worst-six turning separation): 28 points. The all-feasible CSV marks both global frontiers and the within-diameter two-objective frontier. Equal objective coordinates are retained, not arbitrarily discarded. No composite score.

| Trial key | Margin pp | Min area m²/m³ | Min separation pp | Global 3D? |
| --- | --- | --- | --- | --- |
| 1.5 / 0.2 / 0.33 / 0.3 / 30 | 19.766609 | 30.111029 | 12.154069 | true |
| 1.5 / 0.2 / 0.33 / 0.4 / 30 | 28.349213 | 24.643357 | 13.016784 | true |
| 1.5 / 0.2 / 0.33 / 0.4 / 35 | 8.891874 | 44.268067 | 10.910631 | true |
| 1.5 / 0.25 / 0.33 / 0.4 / 30 | 34.150056 | 19.431393 | 13.587365 | true |
| 1.5 / 0.25 / 0.33 / 0.4 / 35 | 17.501942 | 34.475264 | 11.898894 | true |
| 1.5 / 0.3 / 0.33 / 0.3 / 30 | 30.936191 | 19.933653 | 13.300787 | true |
| 1.5 / 0.3 / 0.33 / 0.3 / 35 | 12.631396 | 35.533931 | 11.369765 | true |
| 1.5 / 0.3 / 0.33 / 0.4 / 30 | 37.954589 | 16.218394 | 13.959982 | true |
| 1.5 / 0.3 / 0.33 / 0.4 / 35 | 23.150795 | 28.516585 | 12.498733 | true |
| 1.5 / 0.3 / 0.33 / 0.4 / 40 | 4.616671 | 47.658396 | 10.378146 | true |

## Numerical evidence: exact scope

| Subset | Points | Scenarios | Two distinct roots | 16 monotone continuation steps | Max |op residual| m/s | Max independent closure m/s | Max |force residual| N |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Selected | 13 | 78 | 78 | 78 | 5.551e-17 | 5.551e-17 | 8.674e-19 |
| All feasible | 158 | 948 | 948 | 948 | 5.551e-17 | 5.551e-17 | 8.674e-19 |

All 948 scenarios: stored branch status **LOWER_QUASI_STEADY_ADMISSIBLE**; positive continuous and negative dispersed/relative velocities; lower root exactly equals phi_op; upper root is distinct and above phi_turn; continuation reaches full flow in 16 monotone steps. No roots or continuation were solved anew. Residuals establish numerical closure only, not model validity.

## Selected-point roots: all six scenarios per diameter

Each row is one actual scenario. Δroots = upper − lower; turn gap is 100(phi_turn − phi_op). Normalized gap = (phi_turn − phi_op)/phi_turn, not confidence. All rows have 2 roots and 16 validated continuation steps; residual columns retain scientific notation.

| D | Scenario | Lower root | Upper root | Δroots | phi turn | Turn gap pp | Normalized gap | Op residual m/s | Force residual N | Steps / status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 0.36/BP | 0.041764 | 0.437817 | 0.396053 | 0.183364 | 14.160036 | 0.772236 | -5.551e-17 | -2.168e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.3 | 0.36/SN | 0.072826 | 0.370757 | 0.297931 | 0.193275 | 12.044854 | 0.623199 | 0 | -8.674e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.3 | 0.42/BP | 0.032037 | 0.475923 | 0.443886 | 0.182015 | 14.997838 | 0.823987 | -5.551e-17 | 8.674e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.3 | 0.42/SN | 0.056521 | 0.422001 | 0.36548 | 0.197363 | 14.084198 | 0.713618 | -2.776e-17 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.3 | 0.43/BP | 0.030786 | 0.481304 | 0.450518 | 0.181719 | 15.093242 | 0.830582 | -5.551e-17 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.3 | 0.43/SN | 0.054587 | 0.42899 | 0.374403 | 0.197968 | 14.338136 | 0.724264 | 0 | -8.674e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.4 | 0.36/BP | 0.031232 | 0.473147 | 0.441915 | 0.183269 | 15.20373 | 0.829585 | 0 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.4 | 0.36/SN | 0.050421 | 0.410959 | 0.360538 | 0.186737 | 13.631652 | 0.729992 | 0 | -1.084e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.4 | 0.42/BP | 0.02431 | 0.509811 | 0.4855 | 0.183633 | 15.932282 | 0.867615 | 0 | -2.168e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.4 | 0.42/SN | 0.039238 | 0.458114 | 0.418876 | 0.191022 | 15.178416 | 0.79459 | -2.776e-17 | 2.168e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.4 | 0.43/BP | 0.023414 | 0.515008 | 0.491594 | 0.183588 | 16.017433 | 0.872465 | 0 | -8.674e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.4 | 0.43/SN | 0.037873 | 0.464705 | 0.426832 | 0.191672 | 15.379893 | 0.802407 | -2.776e-17 | -2.168e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.5 | 0.36/BP | 0.025774 | 0.489692 | 0.463918 | 0.181361 | 15.558715 | 0.857888 | 0 | 5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.5 | 0.36/SN | 0.04058 | 0.42876 | 0.38818 | 0.181543 | 14.096335 | 0.776472 | 1.388e-17 | 1.084e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.5 | 0.42/BP | 0.020123 | 0.526232 | 0.506109 | 0.183031 | 16.290819 | 0.890058 | 0 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.5 | 0.42/SN | 0.031368 | 0.474315 | 0.442947 | 0.185751 | 15.438306 | 0.83113 | 0 | -1.084e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.5 | 0.43/BP | 0.019394 | 0.531423 | 0.512029 | 0.183197 | 16.380314 | 0.894136 | 0 | 1.084e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.5 | 0.43/SN | 0.030237 | 0.48074 | 0.450503 | 0.186403 | 15.616649 | 0.837788 | 0 | 2.168e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.6 | 0.36/BP | 0.022488 | 0.498207 | 0.475719 | 0.178764 | 15.627657 | 0.874204 | 0 | 8.132e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.6 | 0.36/SN | 0.035125 | 0.43824 | 0.403115 | 0.177446 | 14.232127 | 0.802053 | -1.388e-17 | 8.132e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.6 | 0.42/BP | 0.017522 | 0.534879 | 0.517357 | 0.181303 | 16.378087 | 0.903353 | -1.388e-17 | 1.084e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.6 | 0.42/SN | 0.026934 | 0.482858 | 0.455924 | 0.181428 | 15.449379 | 0.851544 | -1.388e-17 | 5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.6 | 0.43/BP | 0.016886 | 0.5401 | 0.523214 | 0.181623 | 16.473666 | 0.907026 | -1.388e-17 | 5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.6 | 0.43/SN | 0.025928 | 0.489182 | 0.463254 | 0.182058 | 15.61301 | 0.857585 | 0 | 1.626e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.7 | 0.36/BP | 0.020332 | 0.502857 | 0.482525 | 0.176054 | 15.5722 | 0.884513 | -1.388e-17 | 2.711e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.7 | 0.36/SN | 0.031713 | 0.443866 | 0.412153 | 0.17421 | 14.249655 | 0.81796 | 0 | -2.711e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.7 | 0.42/BP | 0.015774 | 0.539658 | 0.523883 | 0.179096 | 16.332189 | 0.911922 | -1.388e-17 | 5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.7 | 0.42/SN | 0.024132 | 0.487825 | 0.463693 | 0.177897 | 15.376537 | 0.86435 | -1.388e-17 | 5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.7 | 0.43/BP | 0.015194 | 0.54491 | 0.529716 | 0.179517 | 16.432217 | 0.915359 | -1.388e-17 | -1.084e-19 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.7 | 0.43/SN | 0.0232 | 0.494074 | 0.470873 | 0.17849 | 15.529001 | 0.870018 | 0 | 5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.8 | 0.36/BP | 0.018835 | 0.505507 | 0.486672 | 0.173505 | 15.46699 | 0.891445 | -1.388e-17 | 2.711e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.8 | 0.36/SN | 0.029411 | 0.447468 | 0.418057 | 0.171638 | 14.222738 | 0.828645 | -6.939e-18 | 2.711e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.8 | 0.42/BP | 0.014535 | 0.542372 | 0.527837 | 0.176775 | 16.22394 | 0.917774 | -1.388e-17 | 8.132e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.8 | 0.42/SN | 0.022225 | 0.49092 | 0.468695 | 0.17501 | 15.278554 | 0.873008 | 0 | -5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.8 | 0.43/BP | 0.013992 | 0.547646 | 0.533654 | 0.177253 | 16.326126 | 0.921065 | -1.388e-17 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.8 | 0.43/SN | 0.021343 | 0.497109 | 0.475766 | 0.175561 | 15.42184 | 0.87843 | -6.939e-18 | 5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.9 | 0.36/BP | 0.017752 | 0.507072 | 0.48932 | 0.17123 | 15.347886 | 0.896329 | 0 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.9 | 0.36/SN | 0.027774 | 0.449911 | 0.422137 | 0.169579 | 14.180597 | 0.836221 | -6.939e-18 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.9 | 0.42/BP | 0.013623 | 0.543937 | 0.530314 | 0.174535 | 16.091236 | 0.921947 | -1.388e-17 | -2.711e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.9 | 0.42/SN | 0.020859 | 0.492957 | 0.472098 | 0.172642 | 15.178307 | 0.879177 | -6.939e-18 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.9 | 0.43/BP | 0.013103 | 0.549221 | 0.536118 | 0.175038 | 16.193525 | 0.925142 | -1.388e-17 | -5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 0.9 | 0.43/SN | 0.020011 | 0.499096 | 0.479085 | 0.173149 | 15.313787 | 0.884429 | 0 | -5.421e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1 | 0.36/BP | 0.016943 | 0.508029 | 0.491086 | 0.169261 | 15.231758 | 0.899899 | 0 | -2.711e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1 | 0.36/SN | 0.026562 | 0.451646 | 0.425084 | 0.167916 | 14.135387 | 0.841813 | -3.469e-18 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1 | 0.42/BP | 0.012931 | 0.544845 | 0.531914 | 0.172474 | 15.954327 | 0.925027 | -6.939e-18 | -1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1 | 0.42/SN | 0.019842 | 0.49436 | 0.474518 | 0.170689 | 15.084638 | 0.883751 | 0 | -1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1 | 0.43/BP | 0.012428 | 0.550132 | 0.537704 | 0.172979 | 16.055158 | 0.928155 | 6.939e-18 | 2.711e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1 | 0.43/SN | 0.019019 | 0.500458 | 0.481439 | 0.171152 | 15.213388 | 0.888879 | -6.939e-18 | 6.776e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.1 | 0.36/BP | 0.016325 | 0.508639 | 0.492314 | 0.167583 | 15.125868 | 0.902587 | -1.388e-17 | 2.033e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.1 | 0.36/SN | 0.025638 | 0.452926 | 0.427288 | 0.16656 | 14.092129 | 0.846072 | -3.469e-18 | 1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.1 | 0.42/BP | 0.012394 | 0.545374 | 0.53298 | 0.17063 | 15.823603 | 0.927365 | 6.939e-18 | 4.066e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.1 | 0.42/SN | 0.019062 | 0.495366 | 0.476304 | 0.169067 | 15.000506 | 0.88725 | -6.939e-18 | 2.711e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.1 | 0.43/BP | 0.011902 | 0.550656 | 0.538754 | 0.171121 | 15.921917 | 0.930446 | -1.388e-17 | 9.487e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.1 | 0.43/SN | 0.018257 | 0.501428 | 0.483171 | 0.169491 | 15.123416 | 0.892285 | -6.939e-18 | 6.776e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.2 | 0.36/BP | 0.015842 | 0.509047 | 0.493205 | 0.166168 | 15.03263 | 0.904663 | 0 | -2.033e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.2 | 0.36/SN | 0.024916 | 0.453902 | 0.428986 | 0.165443 | 14.052722 | 0.849399 | -3.469e-18 | 6.776e-21 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.2 | 0.42/BP | 0.011969 | 0.545684 | 0.533716 | 0.169008 | 15.703887 | 0.929183 | -1.388e-17 | -1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.2 | 0.42/SN | 0.018449 | 0.496113 | 0.477664 | 0.167713 | 14.926353 | 0.889995 | 0 | 1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.2 | 0.43/BP | 0.011485 | 0.550958 | 0.539472 | 0.169476 | 15.799052 | 0.932229 | 0 | 4.066e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.2 | 0.43/SN | 0.017657 | 0.502145 | 0.484488 | 0.168099 | 15.044182 | 0.894959 | -3.469e-18 | 1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.3 | 0.36/BP | 0.015458 | 0.509337 | 0.493878 | 0.164979 | 14.952102 | 0.906302 | -3.469e-18 | 2.033e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.3 | 0.36/SN | 0.024339 | 0.454668 | 0.430329 | 0.164516 | 14.017671 | 0.852056 | 0 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.3 | 0.42/BP | 0.011627 | 0.545869 | 0.534243 | 0.167596 | 15.596901 | 0.930625 | 0 | -1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.3 | 0.42/SN | 0.017958 | 0.496688 | 0.47873 | 0.166573 | 14.86158 | 0.892194 | 0 | 1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.3 | 0.43/BP | 0.01115 | 0.551132 | 0.539982 | 0.168036 | 15.688605 | 0.933646 | 6.939e-18 | -1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.3 | 0.43/SN | 0.017176 | 0.502694 | 0.485518 | 0.166926 | 14.974974 | 0.897103 | -3.469e-18 | 2.711e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.4 | 0.36/BP | 0.015149 | 0.509556 | 0.494408 | 0.163982 | 14.883286 | 0.907619 | -3.469e-18 | 6.776e-21 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.4 | 0.36/SN | 0.02387 | 0.455285 | 0.431414 | 0.163739 | 13.986873 | 0.854216 | -3.469e-18 | 2.033e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.4 | 0.42/BP | 0.011348 | 0.545985 | 0.534637 | 0.166375 | 15.502694 | 0.931792 | 0 | -6.776e-21 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.4 | 0.42/SN | 0.017556 | 0.497144 | 0.479588 | 0.165608 | 14.805212 | 0.893989 | -3.469e-18 | -1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.4 | 0.43/BP | 0.010876 | 0.551235 | 0.540359 | 0.166784 | 15.590857 | 0.934793 | -6.939e-18 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.4 | 0.43/SN | 0.016783 | 0.503128 | 0.486344 | 0.165931 | 14.914729 | 0.898853 | 0 | -6.776e-21 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.5 | 0.36/BP | 0.014896 | 0.509734 | 0.494839 | 0.163144 | 14.824803 | 0.908696 | -3.469e-18 | -3.388e-21 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.5 | 0.36/SN | 0.023484 | 0.455794 | 0.43231 | 0.163083 | 13.959982 | 0.856002 | 0 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.5 | 0.42/BP | 0.011118 | 0.546064 | 0.534946 | 0.165323 | 15.420476 | 0.93275 | 0 | 6.776e-21 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.5 | 0.42/SN | 0.017224 | 0.497517 | 0.480293 | 0.164786 | 14.756205 | 0.895478 | 0 | 6.776e-21 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.5 | 0.43/BP | 0.010649 | 0.551302 | 0.540653 | 0.1657 | 15.505167 | 0.935735 | -3.469e-18 | 0 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |
| 1.5 | 0.43/SN | 0.016458 | 0.503481 | 0.487024 | 0.165081 | 14.86232 | 0.900306 | 0 | -1.355e-20 | 16 / LOWER_QUASI_STEADY_ADMISSIBLE |

## Regime qualifications and interpretation

Exact stored qualification flags, applying to every feasible point: inversion = UNKNOWN; entrainment = UNKNOWN; disengagement = UNKNOWN; turbulence = UNKNOWN; sphericalDrop = UNKNOWN; schillerNaumannRange = UNKNOWN; interfaceMobility = UNKNOWN. Source status **EXTRAPOLATED**, method **PREPILOT_EXTRAPOLATED_METHOD**, property qualification **PROVISIONAL_SAVED_40C**. Capacity meaning **MODELED_TURNING_CAPACITY_NOT_OBSERVED_FLOOD**.

- Np=1.2 fixed engineering assumption; distinct from Garthe source power number
- C32=.36,.42,.43 conditional Sauter-mean proxy, not Hinze maximum stable diameter
- Spherical drop and turbulent breakup assumptions remain unqualified; diagnostics are not acceptance thresholds
- BP and SN interface scenarios are mandatory, neither is established as actual
- Lower quasi-steady branch is not proof of dynamical stability; capacity is not observed flood

The following are raw dimensionless numerical risk indicators, not new pass/fail gates. Eo and We expose deformation/inertial relevance; Re describes the specified velocity scale, not proof of rotor turbulence; Oh records viscous/capillary balance. Terminal Re, characteristic Re, swarm-at-turn Re, operating swarm/slip Re and rotor Re must not be conflated. Spherical-drop validity, actual interface mobility and drag-correlation applicability remain UNKNOWN; no newly invented drag bounds. Source extrapolation ratios and every full-precision diagnostic are in scenario-evidence.csv.

| D selected | D / source max | Rotor / source max | hc / source max | Viscosity / source max |
| --- | --- | --- | --- | --- |
| 0.3 | 1.973684 | 1.164706 | 1.25 | 37.142857 |
| 0.4 | 2.631579 | 1.552941 | 1.666667 | 37.142857 |
| 0.5 | 3.289474 | 1.941176 | 2.083333 | 37.142857 |
| 0.6 | 3.947368 | 2.329412 | 2.5 | 37.142857 |
| 0.7 | 4.605263 | 2.717647 | 2.916667 | 37.142857 |
| 0.8 | 5.263158 | 3.105882 | 3.333333 | 37.142857 |
| 0.9 | 5.921053 | 3.494118 | 3.75 | 37.142857 |
| 1 | 6.578947 | 3.882353 | 4.166667 | 37.142857 |
| 1.1 | 7.236842 | 4.270588 | 4.583333 | 37.142857 |
| 1.2 | 7.894737 | 4.658824 | 5 | 37.142857 |
| 1.3 | 8.552632 | 5.047059 | 5.416667 | 37.142857 |
| 1.4 | 9.210526 | 5.435294 | 5.833333 | 37.142857 |
| 1.5 | 9.868421 | 5.823529 | 6.25 | 37.142857 |

## Regime numbers: selected and both global Pareto sets

32 unique points / 192 scenarios in this table (union, not an extra sweep). Every selected 30 rpm point and every global 2D/3D Pareto candidate is covered. Flags for every row are exactly the UNKNOWN/EXTRAPOLATED flags above. P/V and rotor Re per point are in the all-feasible table and CSV.

| Trial key | Scenario | d32 mm | Eo | We terminal | Re terminal | Re characteristic | Re swarm turn | Re swarm op | Re slip op | Oh continuous | Oh dispersed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 11.95224 | 18.594285 | 20.154064 | 25.37529 | 41.214162 | 18.927369 | 34.90902 | 36.430497 | 0.176917 | 0.003876 |
| 0.3 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 11.95224 | 18.594285 | 8.341482 | 16.32493 | 26.514704 | 12.729423 | 20.585691 | 22.202622 | 0.176917 | 0.003876 |
| 0.3 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 13.94428 | 25.308887 | 37.176263 | 37.225108 | 59.910004 | 27.317938 | 52.622129 | 54.363783 | 0.163794 | 0.003589 |
| 0.3 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 13.94428 | 25.308887 | 14.064377 | 22.896196 | 36.849086 | 17.747905 | 30.497919 | 32.324969 | 0.163794 | 0.003589 |
| 0.3 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 14.276287 | 26.52842 | 40.869027 | 39.492064 | 63.458234 | 28.90558 | 55.999236 | 57.778011 | 0.161878 | 0.003547 |
| 0.3 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 14.276287 | 26.52842 | 15.206134 | 24.089184 | 38.707956 | 18.651295 | 32.274316 | 34.137795 | 0.161878 | 0.003547 |
| 0.4 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 9.495073 | 11.734849 | 8.211015 | 14.436192 | 23.312377 | 10.815773 | 20.659847 | 21.325893 | 0.198493 | 0.004349 |
| 0.4 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 9.495073 | 11.734849 | 3.678066 | 9.661932 | 15.602633 | 7.443461 | 13.023041 | 13.714535 | 0.198493 | 0.004349 |
| 0.4 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 11.077586 | 15.972433 | 14.962717 | 21.049066 | 33.835385 | 15.597097 | 30.768589 | 31.535219 | 0.183769 | 0.004026 |
| 0.4 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 11.077586 | 15.972433 | 6.399561 | 13.765839 | 22.12794 | 10.602112 | 19.326389 | 20.115685 | 0.183769 | 0.004026 |
| 0.4 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 11.341338 | 16.74208 | 16.404818 | 22.300926 | 35.819362 | 16.494001 | 32.680064 | 33.463577 | 0.18162 | 0.003979 |
| 0.4 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 11.341338 | 16.74208 | 6.950649 | 14.516097 | 23.315505 | 11.17777 | 20.47401 | 21.279948 | 0.18162 | 0.003979 |
| 0.5 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 7.942739 | 8.211481 | 4.095332 | 9.324698 | 14.721822 | 6.869986 | 13.33571 | 13.688512 | 0.217025 | 0.004755 |
| 0.5 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 7.942739 | 8.211481 | 1.881694 | 6.320693 | 9.979102 | 4.731081 | 8.585817 | 8.948966 | 0.217025 | 0.004755 |
| 0.5 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 9.266529 | 11.176738 | 7.469194 | 13.601928 | 21.415825 | 9.948608 | 19.823363 | 20.230455 | 0.200926 | 0.004402 |
| 0.5 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 9.266529 | 11.176738 | 3.362803 | 9.126711 | 14.369731 | 6.847789 | 12.849755 | 13.265874 | 0.200926 | 0.004402 |
| 0.5 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 9.487161 | 11.715299 | 8.184457 | 14.406819 | 22.672401 | 10.523375 | 21.043738 | 21.45993 | 0.198576 | 0.004351 |
| 0.5 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 9.487161 | 11.715299 | 3.66684 | 9.643156 | 15.175695 | 7.237136 | 13.633504 | 14.058592 | 0.198576 | 0.004351 |
| 0.6 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 6.864759 | 6.133826 | 2.302776 | 6.500452 | 9.973173 | 4.66533 | 9.145668 | 9.356065 | 0.233444 | 0.005115 |
| 0.6 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 6.864759 | 6.133826 | 1.062579 | 4.415687 | 6.774669 | 3.1932 | 5.923857 | 6.139507 | 0.233444 | 0.005115 |
| 0.6 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 8.008886 | 8.348819 | 4.230509 | 9.516723 | 14.574245 | 6.801754 | 13.630522 | 13.873621 | 0.216127 | 0.004735 |
| 0.6 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 8.008886 | 8.348819 | 1.942579 | 6.448823 | 9.875955 | 4.681466 | 8.945254 | 9.192856 | 0.216127 | 0.004735 |
| 0.6 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 8.199574 | 8.751115 | 4.638282 | 10.082756 | 15.436258 | 7.200063 | 14.47217 | 14.720748 | 0.213599 | 0.00468 |
| 0.6 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 8.199574 | 8.751115 | 2.125458 | 6.825382 | 10.44936 | 4.957361 | 9.504868 | 9.757868 | 0.213599 | 0.00468 |
| 0.7 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 6.068312 | 4.793101 | 1.402382 | 4.769492 | 7.096463 | 3.320024 | 6.556362 | 6.692433 | 0.248291 | 0.00544 |
| 0.7 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 6.068312 | 4.793101 | 0.644487 | 3.233301 | 4.810784 | 2.255625 | 4.247861 | 4.386986 | 0.248291 | 0.00544 |
| 0.7 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 7.079697 | 6.523944 | 2.602971 | 7.018544 | 10.429269 | 4.877938 | 9.817333 | 9.974677 | 0.229873 | 0.005036 |
| 0.7 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 7.079697 | 6.523944 | 1.201171 | 4.767765 | 7.084703 | 3.34162 | 6.467441 | 6.627371 | 0.229873 | 0.005036 |
| 0.7 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 7.248261 | 6.838306 | 2.857202 | 7.440334 | 11.053571 | 5.168649 | 10.429099 | 10.590009 | 0.227184 | 0.004978 |
| 0.7 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 7.248261 | 6.838306 | 1.318134 | 5.05361 | 7.507786 | 3.544308 | 6.881249 | 7.044689 | 0.227184 | 0.004978 |
| 0.8 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 5.453488 | 3.871056 | 0.904605 | 3.631379 | 5.23846 | 2.44746 | 4.862967 | 4.956318 | 0.261913 | 0.005738 |
| 0.8 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 5.453488 | 3.871056 | 0.412877 | 2.453311 | 3.539034 | 1.651628 | 3.144865 | 3.240162 | 0.261913 | 0.005738 |
| 0.8 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 6.362402 | 5.268938 | 1.698385 | 5.374446 | 7.745414 | 3.624152 | 7.322157 | 7.430158 | 0.242485 | 0.005313 |
| 0.8 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 6.362402 | 5.268938 | 0.782225 | 3.647383 | 5.256447 | 2.467942 | 4.823187 | 4.932819 | 0.242485 | 0.005313 |
| 0.8 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 6.513888 | 5.522827 | 1.866992 | 5.701595 | 8.215519 | 3.844236 | 7.783982 | 7.894437 | 0.239649 | 0.005251 |
| 0.8 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 6.513888 | 5.522827 | 0.860582 | 3.870984 | 5.577763 | 2.621196 | 5.137887 | 5.249936 | 0.239649 | 0.005251 |
| 0.9 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 4.963092 | 3.206162 | 0.609704 | 2.844074 | 3.979968 | 1.855385 | 3.706466 | 3.773451 | 0.274548 | 0.006015 |
| 0.9 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 4.963092 | 3.206162 | 0.276259 | 1.91443 | 2.679034 | 1.245197 | 2.391106 | 2.459412 | 0.274548 | 0.006015 |
| 0.9 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 5.790274 | 4.363943 | 1.158098 | 4.23377 | 5.920237 | 2.767919 | 5.613064 | 5.690587 | 0.254182 | 0.005569 |
| 0.9 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 5.790274 | 4.363943 | 0.530763 | 2.86619 | 4.007899 | 1.873948 | 3.690644 | 3.769267 | 0.254182 | 0.005569 |
| 0.9 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 5.928137 | 4.574223 | 1.275081 | 4.495034 | 6.284759 | 2.939133 | 5.971798 | 6.051086 | 0.251209 | 0.005504 |
| 0.9 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 5.928137 | 4.574223 | 0.58522 | 3.045255 | 4.257741 | 1.992595 | 3.935553 | 4.015916 | 0.251209 | 0.005504 |
| 1 / 0.25 / 0.33 / 0.4 / 30 | 0.36/BP | 4.241054 | 2.341146 | 0.310165 | 1.875159 | 2.606124 | 1.209273 | 2.41057 | 2.457039 | 0.297001 | 0.006507 |
| 1 / 0.25 / 0.33 / 0.4 / 30 | 0.36/SN | 4.241054 | 2.341146 | 0.138837 | 1.25457 | 1.74362 | 0.805716 | 1.53656 | 1.584042 | 0.297001 | 0.006507 |
| 1 / 0.25 / 0.33 / 0.4 / 30 | 0.42/BP | 4.947897 | 3.18656 | 0.601848 | 2.821363 | 3.91908 | 1.826732 | 3.700733 | 3.754463 | 0.27497 | 0.006025 |
| 1 / 0.25 / 0.33 / 0.4 / 30 | 0.42/SN | 4.947897 | 3.18656 | 0.272633 | 1.89891 | 2.637725 | 1.225726 | 2.409744 | 2.4643 | 0.27497 | 0.006025 |
| 1 / 0.25 / 0.33 / 0.4 / 30 | 0.43/BP | 5.065704 | 3.340107 | 0.664684 | 3.000078 | 4.166947 | 1.943373 | 3.944724 | 3.999672 | 0.271753 | 0.005954 |
| 1 / 0.25 / 0.33 / 0.4 / 30 | 0.43/SN | 5.065704 | 3.340107 | 0.301661 | 2.021083 | 2.807176 | 1.30563 | 2.57566 | 2.631411 | 0.271753 | 0.005954 |
| 1 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 4.561906 | 2.708778 | 0.425563 | 2.278035 | 3.09546 | 1.439255 | 2.889041 | 2.938834 | 0.286366 | 0.006274 |
| 1 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 4.561906 | 2.708778 | 0.191539 | 1.528295 | 2.076692 | 0.96183 | 1.859343 | 1.910079 | 0.286366 | 0.006274 |
| 1 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 5.322223 | 3.686948 | 0.817471 | 3.410262 | 4.631176 | 2.161811 | 4.399874 | 4.457514 | 0.265124 | 0.005809 |
| 1 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 5.322223 | 3.686948 | 0.37243 | 2.301832 | 3.125915 | 1.456151 | 2.885851 | 2.944272 | 0.265124 | 0.005809 |
| 1 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 5.448943 | 3.864607 | 0.901482 | 3.623596 | 4.920378 | 2.297863 | 4.684836 | 4.74379 | 0.262023 | 0.005741 |
| 1 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 5.448943 | 3.864607 | 0.411427 | 2.447978 | 3.32404 | 1.549848 | 3.080171 | 3.139887 | 0.262023 | 0.005741 |
| 1.1 / 0.2 / 0.33 / 0.4 / 30 | 0.36/BP | 3.594146 | 1.681404 | 0.148635 | 1.194987 | 1.645505 | 0.759075 | 1.503044 | 1.535742 | 0.322624 | 0.007069 |
| 1.1 / 0.2 / 0.33 / 0.4 / 30 | 0.36/SN | 3.594146 | 1.681404 | 0.065864 | 0.795476 | 1.095376 | 0.503383 | 0.943848 | 0.977387 | 0.322624 | 0.007069 |
| 1.1 / 0.2 / 0.33 / 0.4 / 30 | 0.42/BP | 4.19317 | 2.288578 | 0.295131 | 1.818794 | 2.50354 | 1.161099 | 2.34512 | 2.382864 | 0.298692 | 0.006544 |
| 1.1 / 0.2 / 0.33 / 0.4 / 30 | 0.42/SN | 4.19317 | 2.288578 | 0.132001 | 1.216367 | 1.674309 | 0.773289 | 1.507911 | 1.546324 | 0.298692 | 0.006544 |
| 1.1 / 0.2 / 0.33 / 0.4 / 30 | 0.43/BP | 4.293007 | 2.398855 | 0.327095 | 1.937415 | 2.666647 | 1.237702 | 2.50554 | 2.544132 | 0.295198 | 0.006468 |
| 1.1 / 0.2 / 0.33 / 0.4 / 30 | 0.43/SN | 4.293007 | 2.398855 | 0.146545 | 1.296794 | 1.784899 | 0.825038 | 1.615953 | 1.655192 | 0.295198 | 0.006468 |
| 1.1 / 0.25 / 0.33 / 0.4 / 30 | 0.36/BP | 3.929702 | 2.010019 | 0.221678 | 1.525971 | 2.062933 | 0.954415 | 1.911179 | 1.946718 | 0.308543 | 0.00676 |
| 1.1 / 0.25 / 0.33 / 0.4 / 30 | 0.36/SN | 3.929702 | 2.010019 | 0.098721 | 1.018331 | 1.376663 | 0.634296 | 1.21638 | 1.25267 | 0.308543 | 0.00676 |
| 1.1 / 0.25 / 0.33 / 0.4 / 30 | 0.42/BP | 4.584653 | 2.735859 | 0.434767 | 2.30827 | 3.119147 | 1.450393 | 2.949778 | 2.990878 | 0.285655 | 0.006259 |
| 1.1 / 0.25 / 0.33 / 0.4 / 30 | 0.42/SN | 4.584653 | 2.735859 | 0.195758 | 1.54888 | 2.092988 | 0.96948 | 1.916054 | 1.957763 | 0.285655 | 0.006259 |
| 1.1 / 0.25 / 0.33 / 0.4 / 30 | 0.43/BP | 4.693811 | 2.867689 | 0.480933 | 2.456462 | 3.319148 | 1.544459 | 3.146811 | 3.188843 | 0.282314 | 0.006185 |
| 1.1 / 0.25 / 0.33 / 0.4 / 30 | 0.43/SN | 4.693811 | 2.867689 | 0.216946 | 1.649845 | 2.229256 | 1.033484 | 2.049516 | 2.092141 | 0.282314 | 0.006185 |
| 1.1 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 4.226999 | 2.325654 | 0.305696 | 1.858514 | 2.45503 | 1.138324 | 2.294835 | 2.332919 | 0.297494 | 0.006518 |
| 1.1 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 4.226999 | 2.325654 | 0.136804 | 1.243286 | 1.642335 | 0.758337 | 1.473889 | 1.512671 | 0.297494 | 0.006518 |
| 1.1 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 4.931499 | 3.165474 | 0.593452 | 2.796967 | 3.692875 | 1.720289 | 3.513578 | 3.557671 | 0.275426 | 0.006035 |
| 1.1 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 4.931499 | 3.165474 | 0.268758 | 1.882242 | 2.48515 | 1.153854 | 2.298664 | 2.343333 | 0.275426 | 0.006035 |
| 1.1 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 5.048916 | 3.318005 | 0.655456 | 2.97424 | 3.926599 | 1.83027 | 3.744075 | 3.789174 | 0.272205 | 0.005964 |
| 1.1 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 5.048916 | 3.318005 | 0.297395 | 2.003414 | 2.644911 | 1.229113 | 2.455413 | 2.501074 | 0.272205 | 0.005964 |
| 1.2 / 0.2 / 0.33 / 0.4 / 30 | 0.36/BP | 3.352469 | 1.462886 | 0.108317 | 0.985227 | 1.321842 | 0.60807 | 1.208903 | 1.234503 | 0.334051 | 0.007319 |
| 1.2 / 0.2 / 0.33 / 0.4 / 30 | 0.36/SN | 3.352469 | 1.462886 | 0.047855 | 0.654863 | 0.878606 | 0.402838 | 0.758912 | 0.785153 | 0.334051 | 0.007319 |
| 1.2 / 0.2 / 0.33 / 0.4 / 30 | 0.42/BP | 3.911214 | 1.99115 | 0.217083 | 1.506518 | 2.020598 | 0.93458 | 1.894869 | 1.924424 | 0.309271 | 0.006776 |
| 1.2 / 0.2 / 0.33 / 0.4 / 30 | 0.42/SN | 3.911214 | 1.99115 | 0.096646 | 1.005202 | 1.348214 | 0.621035 | 1.216431 | 1.246495 | 0.309271 | 0.006776 |
| 1.2 / 0.2 / 0.33 / 0.4 / 30 | 0.43/BP | 4.004338 | 2.087096 | 0.240951 | 1.60596 | 2.153857 | 0.997031 | 2.025989 | 2.056209 | 0.305654 | 0.006697 |
| 1.2 / 0.2 / 0.33 / 0.4 / 30 | 0.43/SN | 4.004338 | 2.087096 | 0.107432 | 1.072351 | 1.4382 | 0.662995 | 1.304349 | 1.335062 | 0.305654 | 0.006697 |
| 1.2 / 0.25 / 0.33 / 0.4 / 30 | 0.36/BP | 3.665463 | 1.748793 | 0.162402 | 1.261438 | 1.660798 | 0.76622 | 1.540398 | 1.568225 | 0.31947 | 0.007 |
| 1.2 / 0.25 / 0.33 / 0.4 / 30 | 0.36/SN | 3.665463 | 1.748793 | 0.072036 | 0.840125 | 1.106101 | 0.508366 | 0.979305 | 1.007704 | 0.31947 | 0.007 |
| 1.2 / 0.25 / 0.33 / 0.4 / 30 | 0.42/BP | 4.276373 | 2.380302 | 0.321603 | 1.917358 | 2.523459 | 1.170452 | 2.389037 | 2.421222 | 0.295772 | 0.00648 |
| 1.2 / 0.25 / 0.33 / 0.4 / 30 | 0.42/SN | 4.276373 | 2.380302 | 0.144044 | 1.283187 | 1.688819 | 0.780075 | 1.548514 | 1.581163 | 0.295772 | 0.00648 |
| 1.2 / 0.25 / 0.33 / 0.4 / 30 | 0.43/BP | 4.378192 | 2.494999 | 0.356284 | 2.041977 | 2.687304 | 1.247406 | 2.550537 | 2.583453 | 0.292313 | 0.006405 |
| 1.2 / 0.25 / 0.33 / 0.4 / 30 | 0.43/SN | 4.378192 | 2.494999 | 0.159854 | 1.367776 | 1.800035 | 0.832125 | 1.657458 | 1.690825 | 0.292313 | 0.006405 |
| 1.2 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 3.942769 | 2.023408 | 0.224968 | 1.539806 | 1.979765 | 0.915452 | 1.852623 | 1.882444 | 0.308031 | 0.006749 |
| 1.2 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 3.942769 | 2.023408 | 0.100207 | 1.02767 | 1.321299 | 0.608493 | 1.187899 | 1.218253 | 0.308031 | 0.006749 |
| 1.2 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 4.599897 | 2.754083 | 0.441014 | 2.328657 | 2.99278 | 1.390975 | 2.850518 | 2.885048 | 0.285181 | 0.006248 |
| 1.2 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 4.599897 | 2.754083 | 0.198622 | 1.562762 | 2.008456 | 0.92981 | 1.860443 | 1.895412 | 0.285181 | 0.006248 |
| 1.2 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 4.709418 | 2.886791 | 0.487809 | 2.478069 | 3.18458 | 1.481165 | 3.039784 | 3.075103 | 0.281846 | 0.006175 |
| 1.2 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 4.709418 | 2.886791 | 0.220105 | 1.664577 | 2.139156 | 0.991157 | 1.988707 | 2.024453 | 0.281846 | 0.006175 |
| 1.3 / 0.2 / 0.33 / 0.4 / 30 | 0.36/BP | 3.144526 | 1.287037 | 0.080686 | 0.823537 | 1.077863 | 0.4946 | 0.986694 | 1.007136 | 0.344919 | 0.007557 |
| 1.3 / 0.2 / 0.33 / 0.4 / 30 | 0.36/SN | 3.144526 | 1.287037 | 0.035575 | 0.546832 | 0.715705 | 0.327508 | 0.619405 | 0.640348 | 0.344919 | 0.007557 |
| 1.3 / 0.2 / 0.33 / 0.4 / 30 | 0.42/BP | 3.668613 | 1.751801 | 0.163032 | 1.264421 | 1.654459 | 0.763258 | 1.552815 | 1.576418 | 0.319333 | 0.006997 |
| 1.3 / 0.2 / 0.33 / 0.4 / 30 | 0.42/SN | 3.668613 | 1.751801 | 0.072318 | 0.842131 | 1.101904 | 0.506416 | 0.99563 | 1.019631 | 0.319333 | 0.006997 |
| 1.3 / 0.2 / 0.33 / 0.4 / 30 | 0.43/BP | 3.755961 | 1.836213 | 0.181196 | 1.348776 | 1.764754 | 0.81482 | 1.661368 | 1.685502 | 0.315598 | 0.006915 |
| 1.3 / 0.2 / 0.33 / 0.4 / 30 | 0.43/SN | 3.755961 | 1.836213 | 0.080477 | 0.898882 | 1.176107 | 0.540908 | 1.06813 | 1.092649 | 0.315598 | 0.006915 |
| 1.3 / 0.25 / 0.33 / 0.4 / 30 | 0.36/BP | 3.438105 | 1.538577 | 0.121533 | 1.056844 | 1.356768 | 0.624341 | 1.259484 | 1.281707 | 0.329864 | 0.007227 |
| 1.3 / 0.25 / 0.33 / 0.4 / 30 | 0.36/SN | 3.438105 | 1.538577 | 0.053747 | 0.702814 | 0.902267 | 0.413797 | 0.800118 | 0.822788 | 0.329864 | 0.007227 |
| 1.3 / 0.25 / 0.33 / 0.4 / 30 | 0.42/BP | 4.011123 | 2.094174 | 0.242761 | 1.613346 | 2.070564 | 0.957991 | 1.961854 | 1.987558 | 0.305395 | 0.006691 |
| 1.3 / 0.25 / 0.33 / 0.4 / 30 | 0.42/SN | 4.011123 | 2.094174 | 0.108251 | 1.077343 | 1.382658 | 0.637091 | 1.269379 | 1.295446 | 0.305395 | 0.006691 |
| 1.3 / 0.25 / 0.33 / 0.4 / 30 | 0.43/BP | 4.106625 | 2.195083 | 0.269308 | 1.719382 | 2.206533 | 1.02173 | 2.095924 | 2.122212 | 0.301823 | 0.006613 |
| 1.3 / 0.25 / 0.33 / 0.4 / 30 | 0.43/SN | 4.106625 | 2.195083 | 0.120277 | 1.149051 | 1.474611 | 0.679986 | 1.359461 | 1.386102 | 0.301823 | 0.006613 |
| 1.3 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 3.698211 | 1.780181 | 0.169029 | 1.292652 | 1.619642 | 0.746991 | 1.516855 | 1.540671 | 0.318053 | 0.006968 |
| 1.3 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 3.698211 | 1.780181 | 0.07501 | 0.861115 | 1.078944 | 0.49575 | 0.971369 | 0.995601 | 0.318053 | 0.006968 |
| 1.3 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 4.314579 | 2.423024 | 0.334317 | 1.963602 | 2.459462 | 1.140405 | 2.344409 | 2.371988 | 0.29446 | 0.006452 |
| 1.3 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 4.314579 | 2.423024 | 0.149835 | 1.314563 | 1.646525 | 0.760296 | 1.526918 | 1.554839 | 0.29446 | 0.006452 |
| 1.3 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 4.417307 | 2.53978 | 0.370298 | 2.091027 | 2.61891 | 1.215278 | 2.501814 | 2.530024 | 0.291016 | 0.006376 |
| 1.3 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 4.417307 | 2.53978 | 0.166253 | 1.4011 | 1.754809 | 0.810953 | 1.633198 | 1.661741 | 0.291016 | 0.006376 |
| 1.4 / 0.2 / 0.33 / 0.3 / 30 | 0.36/BP | 2.963517 | 1.14313 | 0.061264 | 0.696645 | 0.744549 | 0.340248 | 0.667865 | 0.684612 | 0.355297 | 0.007784 |
| 1.4 / 0.2 / 0.33 / 0.3 / 30 | 0.36/SN | 2.963517 | 1.14313 | 0.026976 | 0.462273 | 0.494061 | 0.225384 | 0.41232 | 0.429589 | 0.355297 | 0.007784 |
| 1.4 / 0.2 / 0.33 / 0.3 / 30 | 0.42/BP | 3.457436 | 1.555927 | 0.124674 | 1.073421 | 1.146919 | 0.526681 | 1.061578 | 1.080866 | 0.328941 | 0.007207 |
| 1.4 / 0.2 / 0.33 / 0.3 / 30 | 0.42/SN | 3.457436 | 1.555927 | 0.055149 | 0.713922 | 0.762805 | 0.349266 | 0.673244 | 0.692933 | 0.328941 | 0.007207 |
| 1.4 / 0.2 / 0.33 / 0.3 / 30 | 0.43/BP | 3.539756 | 1.630901 | 0.138728 | 1.145709 | 1.224099 | 0.56257 | 1.137313 | 1.157029 | 0.325093 | 0.007123 |
| 1.4 / 0.2 / 0.33 / 0.3 / 30 | 0.43/SN | 3.539756 | 1.630901 | 0.06143 | 0.762397 | 0.814561 | 0.373196 | 0.72362 | 0.743724 | 0.325093 | 0.007123 |
| 1.4 / 0.2 / 0.33 / 0.4 / 30 | 0.36/BP | 2.963517 | 1.14313 | 0.061264 | 0.696645 | 0.890522 | 0.407738 | 0.815793 | 0.832393 | 0.355297 | 0.007784 |
| 1.4 / 0.2 / 0.33 / 0.4 / 30 | 0.36/SN | 2.963517 | 1.14313 | 0.026976 | 0.462273 | 0.590925 | 0.269957 | 0.512224 | 0.529223 | 0.355297 | 0.007784 |
| 1.4 / 0.2 / 0.33 / 0.4 / 30 | 0.42/BP | 3.457436 | 1.555927 | 0.124674 | 1.073421 | 1.371841 | 0.631365 | 1.288386 | 1.307555 | 0.328941 | 0.007207 |
| 1.4 / 0.2 / 0.33 / 0.4 / 30 | 0.42/SN | 3.457436 | 1.555927 | 0.055149 | 0.713922 | 0.912398 | 0.41849 | 0.825366 | 0.844851 | 0.328941 | 0.007207 |
| 1.4 / 0.2 / 0.33 / 0.4 / 30 | 0.43/BP | 3.539756 | 1.630901 | 0.138728 | 1.145709 | 1.464169 | 0.674414 | 1.379268 | 1.398868 | 0.325093 | 0.007123 |
| 1.4 / 0.2 / 0.33 / 0.4 / 30 | 0.43/SN | 3.539756 | 1.630901 | 0.06143 | 0.762397 | 0.974312 | 0.447189 | 0.885857 | 0.905764 | 0.325093 | 0.007123 |
| 1.4 / 0.25 / 0.33 / 0.4 / 30 | 0.36/BP | 3.240197 | 1.366544 | 0.092647 | 0.895792 | 1.1227 | 0.515426 | 1.042878 | 1.060925 | 0.339789 | 0.007445 |
| 1.4 / 0.25 / 0.33 / 0.4 / 30 | 0.36/SN | 3.240197 | 1.366544 | 0.040884 | 0.595069 | 0.745803 | 0.341409 | 0.662224 | 0.680627 | 0.339789 | 0.007445 |
| 1.4 / 0.25 / 0.33 / 0.4 / 30 | 0.42/BP | 3.78023 | 1.860018 | 0.186496 | 1.372773 | 1.720049 | 0.793915 | 1.630741 | 1.651617 | 0.314583 | 0.006892 |
| 1.4 / 0.25 / 0.33 / 0.4 / 30 | 0.42/SN | 3.78023 | 1.860018 | 0.082861 | 0.91504 | 1.146521 | 0.527151 | 1.053651 | 1.074816 | 0.314583 | 0.006892 |
| 1.4 / 0.25 / 0.33 / 0.4 / 30 | 0.43/BP | 3.870235 | 1.949645 | 0.207147 | 1.463907 | 1.834154 | 0.847285 | 1.743277 | 1.764627 | 0.310904 | 0.006812 |
| 1.4 / 0.25 / 0.33 / 0.4 / 30 | 0.43/SN | 3.870235 | 1.949645 | 0.092164 | 0.976457 | 1.22342 | 0.562918 | 1.128989 | 1.15062 | 0.310904 | 0.006812 |
| 1.4 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 3.48533 | 1.581134 | 0.129312 | 1.097607 | 1.341826 | 0.617379 | 1.257433 | 1.276774 | 0.327622 | 0.007178 |
| 1.4 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 3.48533 | 1.581134 | 0.05722 | 0.730134 | 0.89259 | 0.409314 | 0.804494 | 0.824167 | 0.327622 | 0.007178 |
| 1.4 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 4.066218 | 2.152099 | 0.257831 | 1.67405 | 2.04592 | 0.946443 | 1.951378 | 1.973777 | 0.303319 | 0.006646 |
| 1.4 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 4.066218 | 2.152099 | 0.115075 | 1.118382 | 1.366817 | 0.629706 | 1.26868 | 1.291351 | 0.303319 | 0.006646 |
| 1.4 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 4.163033 | 2.2558 | 0.285944 | 1.783817 | 2.179959 | 1.009269 | 2.083736 | 2.106647 | 0.299771 | 0.006568 |
| 1.4 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 4.163033 | 2.2558 | 0.127827 | 1.192673 | 1.457537 | 0.672018 | 1.357726 | 1.380903 | 0.299771 | 0.006568 |
| 1.5 / 0.2 / 0.33 / 0.3 / 30 | 0.36/BP | 2.80438 | 1.023657 | 0.047306 | 0.5955 | 0.619544 | 0.282611 | 0.555883 | 0.569682 | 0.365238 | 0.008002 |
| 1.5 / 0.2 / 0.33 / 0.3 / 30 | 0.36/SN | 2.80438 | 1.023657 | 0.020815 | 0.395011 | 0.410961 | 0.187224 | 0.34326 | 0.357484 | 0.365238 | 0.008002 |
| 1.5 / 0.2 / 0.33 / 0.3 / 30 | 0.42/BP | 3.271776 | 1.393311 | 0.096872 | 0.920439 | 0.957376 | 0.438706 | 0.886401 | 0.902294 | 0.338145 | 0.007409 |
| 1.5 / 0.2 / 0.33 / 0.3 / 30 | 0.42/SN | 3.271776 | 1.393311 | 0.042762 | 0.611538 | 0.636079 | 0.290766 | 0.561776 | 0.577996 | 0.338145 | 0.007409 |
| 1.5 / 0.2 / 0.33 / 0.3 / 30 | 0.43/BP | 3.349676 | 1.460449 | 0.107905 | 0.98294 | 1.022343 | 0.468832 | 0.950148 | 0.966394 | 0.33419 | 0.007322 |
| 1.5 / 0.2 / 0.33 / 0.3 / 30 | 0.43/SN | 3.349676 | 1.460449 | 0.047671 | 0.653334 | 0.679524 | 0.310806 | 0.604057 | 0.620618 | 0.33419 | 0.007322 |
| 1.5 / 0.2 / 0.33 / 0.4 / 30 | 0.36/BP | 2.80438 | 1.023657 | 0.047306 | 0.5955 | 0.744324 | 0.340145 | 0.682261 | 0.695937 | 0.365238 | 0.008002 |
| 1.5 / 0.2 / 0.33 / 0.4 / 30 | 0.36/SN | 2.80438 | 1.023657 | 0.020815 | 0.395011 | 0.493731 | 0.225232 | 0.428538 | 0.442538 | 0.365238 | 0.008002 |
| 1.5 / 0.2 / 0.33 / 0.4 / 30 | 0.42/BP | 3.271776 | 1.393311 | 0.096872 | 0.920439 | 1.150243 | 0.528226 | 1.080812 | 1.096605 | 0.338145 | 0.007409 |
| 1.5 / 0.2 / 0.33 / 0.4 / 30 | 0.42/SN | 3.271776 | 1.393311 | 0.042762 | 0.611538 | 0.764219 | 0.34992 | 0.691991 | 0.708041 | 0.338145 | 0.007409 |
| 1.5 / 0.2 / 0.33 / 0.4 / 30 | 0.43/BP | 3.349676 | 1.460449 | 0.107905 | 0.98294 | 1.228307 | 0.564527 | 1.157657 | 1.173806 | 0.33419 | 0.007322 |
| 1.5 / 0.2 / 0.33 / 0.4 / 30 | 0.43/SN | 3.349676 | 1.460449 | 0.047671 | 0.653334 | 0.816422 | 0.374057 | 0.742993 | 0.75939 | 0.33419 | 0.007322 |
| 1.5 / 0.2 / 0.33 / 0.4 / 35 | 0.36/BP | 2.330777 | 0.707102 | 0.019626 | 0.349677 | 0.426054 | 0.193731 | 0.371135 | 0.382741 | 0.400631 | 0.008778 |
| 1.5 / 0.2 / 0.33 / 0.4 / 35 | 0.36/SN | 2.330777 | 0.707102 | 0.008639 | 0.231995 | 0.282667 | 0.128474 | 0.223128 | 0.235222 | 0.400631 | 0.008778 |
| 1.5 / 0.2 / 0.33 / 0.4 / 35 | 0.42/BP | 2.719239 | 0.962445 | 0.040909 | 0.545305 | 0.664306 | 0.303232 | 0.603376 | 0.616687 | 0.370912 | 0.008127 |
| 1.5 / 0.2 / 0.33 / 0.4 / 35 | 0.42/SN | 2.719239 | 0.962445 | 0.017996 | 0.361676 | 0.440603 | 0.200827 | 0.376301 | 0.389967 | 0.370912 | 0.008127 |
| 1.5 / 0.2 / 0.33 / 0.4 / 35 | 0.43/BP | 2.783983 | 1.008821 | 0.045709 | 0.583228 | 0.710485 | 0.324527 | 0.648535 | 0.662135 | 0.366574 | 0.008032 |
| 1.5 / 0.2 / 0.33 / 0.4 / 35 | 0.43/SN | 2.783983 | 1.008821 | 0.020111 | 0.386859 | 0.471269 | 0.21491 | 0.406055 | 0.419995 | 0.366574 | 0.008032 |
| 1.5 / 0.25 / 0.33 / 0.4 / 30 | 0.36/BP | 3.066202 | 1.223721 | 0.071788 | 0.767065 | 0.93961 | 0.430473 | 0.87325 | 0.888118 | 0.349297 | 0.007653 |
| 1.5 / 0.25 / 0.33 / 0.4 / 30 | 0.36/SN | 3.066202 | 1.223721 | 0.031632 | 0.509175 | 0.623711 | 0.285065 | 0.554405 | 0.569563 | 0.349297 | 0.007653 |
| 1.5 / 0.25 / 0.33 / 0.4 / 30 | 0.42/BP | 3.577236 | 1.66562 | 0.145501 | 1.179537 | 1.444535 | 0.665255 | 1.370182 | 1.387382 | 0.323386 | 0.007085 |
| 1.5 / 0.25 / 0.33 / 0.4 / 30 | 0.42/SN | 3.577236 | 1.66562 | 0.064461 | 0.785102 | 0.961485 | 0.441241 | 0.884335 | 0.90177 | 0.323386 | 0.007085 |
| 1.5 / 0.25 / 0.33 / 0.4 / 30 | 0.43/BP | 3.662408 | 1.74588 | 0.161794 | 1.258549 | 1.541237 | 0.710378 | 1.465566 | 1.483157 | 0.319604 | 0.007002 |
| 1.5 / 0.25 / 0.33 / 0.4 / 30 | 0.43/SN | 3.662408 | 1.74588 | 0.071763 | 0.838183 | 1.026451 | 0.471378 | 0.947984 | 0.965803 | 0.319604 | 0.007002 |
| 1.5 / 0.25 / 0.33 / 0.4 / 35 | 0.36/BP | 2.548383 | 0.845299 | 0.030075 | 0.45263 | 0.540203 | 0.246112 | 0.48177 | 0.494339 | 0.383145 | 0.008395 |
| 1.5 / 0.25 / 0.33 / 0.4 / 35 | 0.36/SN | 2.548383 | 0.845299 | 0.013229 | 0.300198 | 0.35828 | 0.163074 | 0.295954 | 0.308937 | 0.383145 | 0.008395 |
| 1.5 / 0.25 / 0.33 / 0.4 / 35 | 0.42/BP | 2.973113 | 1.150545 | 0.062195 | 0.703053 | 0.838925 | 0.383861 | 0.77382 | 0.788282 | 0.354723 | 0.007772 |
| 1.5 / 0.25 / 0.33 / 0.4 / 35 | 0.42/SN | 2.973113 | 1.150545 | 0.027388 | 0.466539 | 0.556702 | 0.254198 | 0.488489 | 0.503266 | 0.354723 | 0.007772 |
| 1.5 / 0.25 / 0.33 / 0.4 / 35 | 0.43/BP | 3.043902 | 1.205985 | 0.069395 | 0.751424 | 0.896615 | 0.410559 | 0.830394 | 0.845176 | 0.350574 | 0.007681 |
| 1.5 / 0.25 / 0.33 / 0.4 / 35 | 0.43/SN | 3.043902 | 1.205985 | 0.030572 | 0.498753 | 0.595123 | 0.271891 | 0.525857 | 0.540942 | 0.350574 | 0.007681 |
| 1.5 / 0.3 / 0.33 / 0.3 / 30 | 0.36/BP | 3.298172 | 1.415883 | 0.100511 | 0.941346 | 0.926872 | 0.424572 | 0.854986 | 0.871032 | 0.336789 | 0.007379 |
| 1.5 / 0.3 / 0.33 / 0.3 / 30 | 0.36/SN | 3.298172 | 1.415883 | 0.04438 | 0.625513 | 0.615896 | 0.281463 | 0.540501 | 0.556895 | 0.336789 | 0.007379 |
| 1.5 / 0.3 / 0.33 / 0.3 / 30 | 0.42/BP | 3.847867 | 1.927175 | 0.201867 | 1.440944 | 1.418346 | 0.653043 | 1.337897 | 1.356444 | 0.311806 | 0.006832 |
| 1.5 / 0.3 / 0.33 / 0.3 / 30 | 0.42/SN | 3.847867 | 1.927175 | 0.089783 | 0.960974 | 0.945903 | 0.434017 | 0.862211 | 0.881039 | 0.311806 | 0.006832 |
| 1.5 / 0.3 / 0.33 / 0.3 / 30 | 0.43/BP | 3.939483 | 2.020037 | 0.224137 | 1.536321 | 1.512145 | 0.696799 | 1.43028 | 1.449248 | 0.308159 | 0.006752 |
| 1.5 / 0.3 / 0.33 / 0.3 / 30 | 0.43/SN | 3.939483 | 2.020037 | 0.099831 | 1.025317 | 1.009182 | 0.463365 | 0.924087 | 0.943327 | 0.308159 | 0.006752 |
| 1.5 / 0.3 / 0.33 / 0.3 / 35 | 0.36/BP | 2.741178 | 0.978037 | 0.04249 | 0.557981 | 0.531861 | 0.242279 | 0.468292 | 0.481885 | 0.369425 | 0.008094 |
| 1.5 / 0.3 / 0.33 / 0.3 / 35 | 0.36/SN | 2.741178 | 0.978037 | 0.018693 | 0.370091 | 0.352767 | 0.160549 | 0.284303 | 0.298412 | 0.369425 | 0.008094 |
| 1.5 / 0.3 / 0.33 / 0.3 / 35 | 0.42/BP | 3.19804 | 1.331217 | 0.087224 | 0.863508 | 0.822877 | 0.37644 | 0.752249 | 0.767866 | 0.342021 | 0.007494 |
| 1.5 / 0.3 / 0.33 / 0.3 / 35 | 0.42/SN | 3.19804 | 1.331217 | 0.038476 | 0.573508 | 0.546523 | 0.249513 | 0.472129 | 0.48813 | 0.342021 | 0.007494 |
| 1.5 / 0.3 / 0.33 / 0.3 / 35 | 0.43/BP | 3.274184 | 1.395363 | 0.0972 | 0.922335 | 0.878898 | 0.402357 | 0.80708 | 0.82304 | 0.338021 | 0.007406 |
| 1.5 / 0.3 / 0.33 / 0.3 / 35 | 0.43/SN | 3.274184 | 1.395363 | 0.042907 | 0.612805 | 0.583946 | 0.266742 | 0.508458 | 0.524786 | 0.338021 | 0.007406 |
| 1.5 / 0.3 / 0.33 / 0.4 / 30 | 0.36/BP | 3.298172 | 1.415883 | 0.100511 | 0.941346 | 1.12412 | 0.516086 | 1.053909 | 1.069845 | 0.336789 | 0.007379 |
| 1.5 / 0.3 / 0.33 / 0.4 / 30 | 0.36/SN | 3.298172 | 1.415883 | 0.04438 | 0.625513 | 0.746965 | 0.341946 | 0.673855 | 0.69006 | 0.336789 | 0.007379 |
| 1.5 / 0.3 / 0.33 / 0.4 / 30 | 0.42/BP | 3.847867 | 1.927175 | 0.201867 | 1.440944 | 1.720279 | 0.794023 | 1.641537 | 1.659992 | 0.311806 | 0.006832 |
| 1.5 / 0.3 / 0.33 / 0.4 / 30 | 0.42/SN | 3.847867 | 1.927175 | 0.089783 | 0.960974 | 1.147264 | 0.527496 | 1.065676 | 1.084353 | 0.311806 | 0.006832 |
| 1.5 / 0.3 / 0.33 / 0.4 / 30 | 0.43/BP | 3.939483 | 2.020037 | 0.224137 | 1.536321 | 1.834063 | 0.847243 | 1.753914 | 1.772792 | 0.308159 | 0.006752 |
| 1.5 / 0.3 / 0.33 / 0.4 / 30 | 0.43/SN | 3.939483 | 2.020037 | 0.099831 | 1.025317 | 1.224025 | 0.5632 | 1.141026 | 1.160119 | 0.308159 | 0.006752 |
| 1.5 / 0.3 / 0.33 / 0.4 / 35 | 0.36/BP | 2.741178 | 0.978037 | 0.04249 | 0.557981 | 0.648779 | 0.296076 | 0.587109 | 0.600548 | 0.369425 | 0.008094 |
| 1.5 / 0.3 / 0.33 / 0.4 / 35 | 0.36/SN | 2.741178 | 0.978037 | 0.018693 | 0.370091 | 0.430315 | 0.196105 | 0.365087 | 0.378901 | 0.369425 | 0.008094 |
| 1.5 / 0.3 / 0.33 / 0.4 / 35 | 0.42/BP | 3.19804 | 1.331217 | 0.087224 | 0.863508 | 1.003815 | 0.460237 | 0.934953 | 0.950448 | 0.342021 | 0.007494 |
| 1.5 / 0.3 / 0.33 / 0.4 / 35 | 0.42/SN | 3.19804 | 1.331217 | 0.038476 | 0.573508 | 0.666695 | 0.304887 | 0.594815 | 0.610601 | 0.342021 | 0.007494 |
| 1.5 / 0.3 / 0.33 / 0.4 / 35 | 0.43/BP | 3.274184 | 1.395363 | 0.0972 | 0.922335 | 1.072163 | 0.491954 | 1.002106 | 1.017947 | 0.338021 | 0.007406 |
| 1.5 / 0.3 / 0.33 / 0.4 / 35 | 0.43/SN | 3.274184 | 1.395363 | 0.042907 | 0.612805 | 0.712352 | 0.325959 | 0.639315 | 0.655437 | 0.338021 | 0.007406 |
| 1.5 / 0.3 / 0.33 / 0.4 / 40 | 0.36/BP | 2.335322 | 0.709863 | 0.01981 | 0.35166 | 0.399382 | 0.181517 | 0.343693 | 0.35538 | 0.400241 | 0.008769 |
| 1.5 / 0.3 / 0.33 / 0.4 / 40 | 0.36/SN | 2.335322 | 0.709863 | 0.00872 | 0.233307 | 0.264969 | 0.120386 | 0.203971 | 0.216212 | 0.400241 | 0.008769 |
| 1.5 / 0.3 / 0.33 / 0.4 / 40 | 0.42/BP | 2.724543 | 0.966202 | 0.041287 | 0.548353 | 0.622662 | 0.284046 | 0.561045 | 0.574427 | 0.370551 | 0.008119 |
| 1.5 / 0.3 / 0.33 / 0.4 / 40 | 0.42/SN | 2.724543 | 0.966202 | 0.018163 | 0.363699 | 0.412985 | 0.188153 | 0.347649 | 0.361423 | 0.370551 | 0.008119 |
| 1.5 / 0.3 / 0.33 / 0.4 / 40 | 0.43/BP | 2.789413 | 1.01276 | 0.04613 | 0.58648 | 0.665936 | 0.303983 | 0.603303 | 0.616973 | 0.366217 | 0.008024 |
| 1.5 / 0.3 / 0.33 / 0.4 / 40 | 0.43/SN | 2.789413 | 1.01276 | 0.020296 | 0.389019 | 0.441723 | 0.201341 | 0.375509 | 0.389554 | 0.366217 | 0.008024 |

## All 158 feasible alternatives

Each row preserves the same trial identity. The separate scenario CSV gives all six actual cases, not synthetic worst-case combinations. P2 local/global and P3 global refer to the stated nonweighted objectives.

| Trial key | Max load | Margin pp | Min area | Min gap pp | Control | Rotor Re | P/V W/m³ | Best margin? | P2 local | P2 global | P3 global |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 / 0.3 / 0.33 / 0.4 / 30 | 0.674354 | 2.564595 | 12.93881 | 12.044854 | 0.36/SN | 71.212952 | 0.194855 | true | true | false | false |
| 0.4 / 0.2 / 0.33 / 0.4 / 30 | 0.653734 | 4.626588 | 18.208598 | 11.706039 | 0.36/SN | 126.600803 | 0.519614 | false | true | false | false |
| 0.4 / 0.25 / 0.33 / 0.3 / 30 | 0.670015 | 2.998515 | 17.15639 | 11.505865 | 0.36/SN | 126.600803 | 0.415691 | false | false | false | false |
| 0.4 / 0.25 / 0.33 / 0.4 / 30 | 0.579483 | 12.051651 | 14.657547 | 12.882624 | 0.36/SN | 126.600803 | 0.415691 | false | true | false | false |
| 0.4 / 0.3 / 0.33 / 0.3 / 30 | 0.615492 | 8.450765 | 14.518658 | 12.405237 | 0.36/SN | 126.600803 | 0.346409 | false | false | false | false |
| 0.4 / 0.3 / 0.33 / 0.4 / 30 | 0.530591 | 16.940934 | 12.386847 | 13.631652 | 0.36/SN | 126.600803 | 0.346409 | true | true | false | false |
| 0.5 / 0.2 / 0.33 / 0.3 / 30 | 0.66261 | 3.739024 | 21.026323 | 11.1926 | 0.36/SN | 197.813754 | 0.811897 | false | true | false | false |
| 0.5 / 0.2 / 0.33 / 0.4 / 30 | 0.572877 | 12.712344 | 17.970184 | 12.47694 | 0.36/SN | 197.813754 | 0.811897 | false | true | false | false |
| 0.5 / 0.25 / 0.33 / 0.2 / 30 | 0.69243 | 0.756984 | 20.393441 | 10.776053 | 0.36/SN | 197.813754 | 0.649517 | false | false | false | false |
| 0.5 / 0.25 / 0.33 / 0.3 / 30 | 0.584053 | 11.594715 | 16.949547 | 12.380866 | 0.36/SN | 197.813754 | 0.649517 | false | false | false | false |
| 0.5 / 0.25 / 0.33 / 0.4 / 30 | 0.503502 | 19.649793 | 14.486675 | 13.455751 | 0.36/SN | 197.813754 | 0.649517 | false | true | false | false |
| 0.5 / 0.25 / 0.33 / 0.4 / 35 | 0.692764 | 0.723582 | 23.953878 | 10.676031 | 0.36/SN | 230.782713 | 1.03141 | false | true | false | false |
| 0.5 / 0.3 / 0.33 / 0.2 / 30 | 0.634661 | 6.533931 | 17.332765 | 11.703693 | 0.36/SN | 197.813754 | 0.541265 | false | false | false | false |
| 0.5 / 0.3 / 0.33 / 0.3 / 30 | 0.532853 | 16.714672 | 14.37455 | 13.123685 | 0.36/SN | 197.813754 | 0.541265 | false | false | false | false |
| 0.5 / 0.3 / 0.33 / 0.4 / 30 | 0.457781 | 24.221875 | 12.265375 | 14.096335 | 0.36/SN | 197.813754 | 0.541265 | true | true | false | false |
| 0.5 / 0.3 / 0.33 / 0.4 / 35 | 0.625748 | 7.425231 | 20.149881 | 11.724319 | 0.36/SN | 230.782713 | 0.859508 | false | true | false | false |
| 0.6 / 0.2 / 0.33 / 0.3 / 30 | 0.609697 | 9.030322 | 21.255633 | 11.685954 | 0.36/SN | 284.851806 | 1.169131 | false | true | false | false |
| 0.6 / 0.2 / 0.33 / 0.4 / 30 | 0.525167 | 17.483333 | 18.126429 | 12.786758 | 0.36/SN | 284.851806 | 1.169131 | false | true | false | false |
| 0.6 / 0.25 / 0.33 / 0.2 / 30 | 0.636865 | 6.313481 | 20.668402 | 11.352191 | 0.36/SN | 284.851806 | 0.935305 | false | false | false | false |
| 0.6 / 0.25 / 0.33 / 0.3 / 30 | 0.534346 | 16.565394 | 17.120311 | 12.723508 | 0.36/SN | 284.851806 | 0.935305 | false | false | false | false |
| 0.6 / 0.25 / 0.33 / 0.4 / 30 | 0.458832 | 24.116786 | 14.596482 | 13.656083 | 0.36/SN | 284.851806 | 0.935305 | false | true | false | false |
| 0.6 / 0.25 / 0.33 / 0.4 / 35 | 0.641188 | 5.881187 | 24.293438 | 11.203717 | 0.36/SN | 332.327107 | 1.48523 | false | true | false | false |
| 0.6 / 0.3 / 0.33 / 0.2 / 30 | 0.581194 | 11.880607 | 17.574557 | 12.156193 | 0.36/SN | 284.851806 | 0.779421 | false | false | false | false |
| 0.6 / 0.3 / 0.33 / 0.3 / 30 | 0.485217 | 21.478343 | 14.520579 | 13.382841 | 0.36/SN | 284.851806 | 0.779421 | false | false | false | false |
| 0.6 / 0.3 / 0.33 / 0.3 / 35 | 0.675099 | 2.490085 | 24.207868 | 10.743856 | 0.36/SN | 332.327107 | 1.237692 | false | false | false | false |
| 0.6 / 0.3 / 0.33 / 0.4 / 30 | 0.415105 | 28.489453 | 12.356458 | 14.232127 | 0.36/SN | 284.851806 | 0.779421 | true | true | false | false |
| 0.6 / 0.3 / 0.33 / 0.4 / 35 | 0.576756 | 12.324377 | 20.40667 | 12.114343 | 0.36/SN | 332.327107 | 1.237692 | false | true | false | false |
| 0.7 / 0.2 / 0.33 / 0.2 / 30 | 0.687783 | 1.221687 | 26.432004 | 10.394233 | 0.36/SN | 387.714958 | 1.591318 | false | true | false | false |
| 0.7 / 0.2 / 0.33 / 0.3 / 30 | 0.576253 | 12.3747 | 21.788435 | 11.922311 | 0.36/SN | 387.714958 | 1.591318 | false | true | false | false |
| 0.7 / 0.2 / 0.33 / 0.4 / 30 | 0.494356 | 20.564378 | 18.514579 | 12.92333 | 0.36/SN | 387.714958 | 1.591318 | false | true | false | false |
| 0.7 / 0.25 / 0.33 / 0.2 / 30 | 0.603029 | 9.697138 | 21.255136 | 11.614706 | 0.36/SN | 387.714958 | 1.273054 | false | false | false | false |
| 0.7 / 0.25 / 0.33 / 0.3 / 30 | 0.50301 | 19.698954 | 17.513531 | 12.867321 | 0.36/SN | 387.714958 | 1.273054 | false | false | false | false |
| 0.7 / 0.25 / 0.33 / 0.4 / 30 | 0.430086 | 26.991354 | 14.875324 | 13.719346 | 0.36/SN | 387.714958 | 1.273054 | false | true | false | false |
| 0.7 / 0.25 / 0.33 / 0.4 / 35 | 0.607973 | 9.202735 | 24.968284 | 11.472005 | 0.36/SN | 452.334118 | 2.021563 | false | true | false | false |
| 0.7 / 0.3 / 0.33 / 0.2 / 30 | 0.548722 | 15.12775 | 18.062884 | 12.346242 | 0.36/SN | 387.714958 | 1.060879 | false | false | false | false |
| 0.7 / 0.3 / 0.33 / 0.3 / 30 | 0.455266 | 24.473351 | 14.839997 | 13.471752 | 0.36/SN | 387.714958 | 1.060879 | false | false | false | false |
| 0.7 / 0.3 / 0.33 / 0.3 / 35 | 0.641452 | 5.854819 | 24.937001 | 11.049839 | 0.36/SN | 452.334118 | 1.684636 | false | false | false | false |
| 0.7 / 0.3 / 0.33 / 0.4 / 30 | 0.387722 | 31.227815 | 12.577724 | 14.249655 | 0.36/SN | 387.714958 | 1.060879 | true | true | false | true |
| 0.7 / 0.3 / 0.33 / 0.4 / 35 | 0.545353 | 15.464669 | 20.928736 | 12.298359 | 0.36/SN | 452.334118 | 1.684636 | false | true | false | false |
| 0.8 / 0.2 / 0.33 / 0.2 / 30 | 0.664951 | 3.504853 | 27.483109 | 10.600891 | 0.36/SN | 506.403211 | 2.078456 | false | true | false | false |
| 0.8 / 0.2 / 0.33 / 0.3 / 30 | 0.553873 | 14.612729 | 22.519461 | 12.043908 | 0.36/SN | 506.403211 | 2.078456 | false | true | false | false |
| 0.8 / 0.2 / 0.33 / 0.4 / 30 | 0.473162 | 22.683788 | 19.05448 | 12.985377 | 0.36/SN | 506.403211 | 2.078456 | false | true | false | false |
| 0.8 / 0.2 / 0.33 / 0.4 / 35 | 0.677992 | 2.200775 | 32.723277 | 10.36268 | 0.36/SN | 590.803746 | 3.300511 | false | true | false | false |
| 0.8 / 0.25 / 0.33 / 0.2 / 30 | 0.581519 | 11.848114 | 22.05068 | 11.737567 | 0.36/SN | 506.403211 | 1.662765 | false | false | false | false |
| 0.8 / 0.25 / 0.33 / 0.3 / 30 | 0.482094 | 21.79057 | 18.055103 | 12.925266 | 0.36/SN | 506.403211 | 1.662765 | false | false | false | false |
| 0.8 / 0.25 / 0.33 / 0.3 / 35 | 0.688755 | 1.124483 | 30.922985 | 10.23222 | 0.36/SN | 590.803746 | 2.640409 | false | false | false | false |
| 0.8 / 0.25 / 0.33 / 0.4 / 30 | 0.410388 | 28.961204 | 15.267315 | 13.727579 | 0.36/SN | 506.403211 | 1.662765 | false | true | false | false |
| 0.8 / 0.25 / 0.33 / 0.4 / 35 | 0.585196 | 11.480358 | 25.856551 | 11.623451 | 0.36/SN | 590.803746 | 2.640409 | false | true | false | false |
| 0.8 / 0.3 / 0.33 / 0.2 / 30 | 0.528143 | 17.185701 | 18.71893 | 12.420859 | 0.36/SN | 506.403211 | 1.385637 | false | false | false | false |
| 0.8 / 0.3 / 0.33 / 0.3 / 30 | 0.435334 | 26.466603 | 15.276898 | 13.48983 | 0.36/SN | 506.403211 | 1.385637 | false | true | false | false |
| 0.8 / 0.3 / 0.33 / 0.3 / 35 | 0.619357 | 8.064284 | 25.897452 | 11.211795 | 0.36/SN | 590.803746 | 2.200341 | false | true | false | false |
| 0.8 / 0.3 / 0.33 / 0.4 / 30 | 0.369017 | 33.098257 | 12.887697 | 14.222738 | 0.36/SN | 506.403211 | 1.385637 | true | true | false | true |
| 0.8 / 0.3 / 0.33 / 0.4 / 35 | 0.523932 | 17.606775 | 21.62303 | 12.391723 | 0.36/SN | 590.803746 | 2.200341 | false | true | false | false |
| 0.9 / 0.2 / 0.33 / 0.2 / 30 | 0.650161 | 4.983855 | 28.733887 | 10.709335 | 0.36/SN | 640.916564 | 2.630546 | false | true | false | false |
| 0.9 / 0.2 / 0.33 / 0.3 / 30 | 0.538287 | 16.171304 | 23.389971 | 12.108351 | 0.36/SN | 640.916564 | 2.630546 | false | true | false | false |
| 0.9 / 0.2 / 0.33 / 0.4 / 30 | 0.457879 | 24.212055 | 19.700073 | 13.012911 | 0.36/SN | 640.916564 | 2.630546 | false | true | false | false |
| 0.9 / 0.2 / 0.33 / 0.4 / 35 | 0.660065 | 3.993535 | 34.135677 | 10.528166 | 0.36/SN | 747.735991 | 4.177209 | false | true | false | false |
| 0.9 / 0.25 / 0.33 / 0.2 / 30 | 0.567585 | 13.241478 | 22.999277 | 11.790267 | 0.36/SN | 640.916564 | 2.104437 | false | false | false | false |
| 0.9 / 0.25 / 0.33 / 0.3 / 30 | 0.467568 | 23.243235 | 18.703155 | 12.94313 | 0.36/SN | 640.916564 | 2.104437 | false | false | false | false |
| 0.9 / 0.25 / 0.33 / 0.3 / 35 | 0.672746 | 2.72536 | 32.328283 | 10.37474 | 0.36/SN | 747.735991 | 3.341768 | false | false | false | false |
| 0.9 / 0.25 / 0.33 / 0.4 / 30 | 0.396243 | 30.375715 | 15.73984 | 13.713582 | 0.36/SN | 640.916564 | 2.104437 | false | true | false | false |
| 0.9 / 0.25 / 0.33 / 0.4 / 35 | 0.568831 | 13.116922 | 26.889811 | 11.715765 | 0.36/SN | 747.735991 | 3.341768 | false | true | false | false |
| 0.9 / 0.3 / 0.33 / 0.2 / 30 | 0.514868 | 18.513184 | 19.499923 | 12.439247 | 0.36/SN | 640.916564 | 1.753697 | false | false | false | false |
| 0.9 / 0.3 / 0.33 / 0.3 / 30 | 0.42154 | 27.846029 | 15.7995 | 13.477184 | 0.36/SN | 640.916564 | 1.753697 | false | true | false | false |
| 0.9 / 0.3 / 0.33 / 0.3 / 35 | 0.604339 | 9.566087 | 27.020884 | 11.300659 | 0.36/SN | 747.735991 | 2.784806 | false | true | false | false |
| 0.9 / 0.3 / 0.33 / 0.4 / 30 | 0.355637 | 34.436341 | 13.261919 | 14.180597 | 0.36/SN | 640.916564 | 1.753697 | true | true | false | true |
| 0.9 / 0.3 / 0.33 / 0.4 / 35 | 0.50863 | 19.137025 | 22.436682 | 12.441237 | 0.36/SN | 747.735991 | 2.784806 | false | true | false | false |
| 0.9 / 0.3 / 0.33 / 0.4 / 40 | 0.699272 | 0.072765 | 36.346809 | 9.97598 | 0.36/SN | 854.555418 | 4.156912 | false | true | false | false |
| 1 / 0.2 / 0.33 / 0.2 / 30 | 0.640615 | 5.938494 | 30.137143 | 10.762281 | 0.36/SN | 791.255017 | 3.247587 | false | true | false | false |
| 1 / 0.2 / 0.33 / 0.3 / 30 | 0.527119 | 17.288101 | 24.363334 | 12.142118 | 0.36/SN | 791.255017 | 3.247587 | false | true | false | false |
| 1 / 0.2 / 0.33 / 0.4 / 30 | 0.446445 | 25.35546 | 20.422088 | 13.023823 | 0.36/SN | 791.255017 | 3.247587 | false | true | false | false |
| 1 / 0.2 / 0.33 / 0.4 / 35 | 0.646618 | 5.338182 | 35.674802 | 10.642453 | 0.36/SN | 923.130853 | 5.157049 | false | true | false | false |
| 1 / 0.25 / 0.33 / 0.2 / 30 | 0.558588 | 14.141173 | 24.066855 | 11.804676 | 0.36/SN | 791.255017 | 2.59807 | false | false | false | false |
| 1 / 0.25 / 0.33 / 0.3 / 30 | 0.45719 | 24.280969 | 19.43127 | 12.941502 | 0.36/SN | 791.255017 | 2.59807 | false | false | false | false |
| 1 / 0.25 / 0.33 / 0.3 / 35 | 0.661536 | 3.846406 | 33.87714 | 10.461997 | 0.36/SN | 923.130853 | 4.125639 | false | false | false | false |
| 1 / 0.25 / 0.33 / 0.4 / 30 | 0.385708 | 31.429231 | 16.271878 | 13.691443 | 0.36/SN | 791.255017 | 2.59807 | false | true | false | true |
| 1 / 0.25 / 0.33 / 0.4 / 35 | 0.556633 | 14.336732 | 28.025341 | 11.775621 | 0.36/SN | 923.130853 | 4.125639 | false | true | false | false |
| 1 / 0.3 / 0.33 / 0.2 / 30 | 0.506354 | 19.364593 | 20.379661 | 12.428314 | 0.36/SN | 791.255017 | 2.165058 | false | false | false | false |
| 1 / 0.3 / 0.33 / 0.3 / 30 | 0.41173 | 28.827045 | 16.387608 | 13.451466 | 0.36/SN | 791.255017 | 2.165058 | false | true | false | false |
| 1 / 0.3 / 0.33 / 0.3 / 35 | 0.593908 | 10.609244 | 28.264982 | 11.349124 | 0.36/SN | 923.130853 | 3.438032 | false | true | false | false |
| 1 / 0.3 / 0.33 / 0.4 / 30 | 0.345714 | 35.428628 | 13.68446 | 14.135387 | 0.36/SN | 791.255017 | 2.165058 | true | true | false | true |
| 1 / 0.3 / 0.33 / 0.4 / 35 | 0.497298 | 20.270239 | 23.336309 | 12.46816 | 0.36/SN | 923.130853 | 3.438032 | false | true | false | false |
| 1 / 0.3 / 0.33 / 0.4 / 40 | 0.686446 | 1.355371 | 38.071766 | 10.100299 | 0.36/SN | 1055.006689 | 5.13199 | false | true | false | false |
| 1.1 / 0.2 / 0.33 / 0.2 / 30 | 0.63464 | 6.536013 | 31.661714 | 10.781547 | 0.36/SN | 957.41857 | 3.929581 | false | true | false | false |
| 1.1 / 0.2 / 0.33 / 0.3 / 30 | 0.518951 | 18.104933 | 25.414865 | 12.158493 | 0.36/SN | 957.41857 | 3.929581 | false | true | false | false |
| 1.1 / 0.2 / 0.33 / 0.4 / 30 | 0.43763 | 26.236955 | 21.200593 | 13.026648 | 0.36/SN | 957.41857 | 3.929581 | false | true | false | true |
| 1.1 / 0.2 / 0.33 / 0.4 / 35 | 0.636223 | 6.377687 | 37.302471 | 10.725439 | 0.36/SN | 1116.988332 | 6.240029 | false | true | false | false |
| 1.1 / 0.25 / 0.33 / 0.2 / 30 | 0.552954 | 14.704644 | 25.230733 | 11.796833 | 0.36/SN | 957.41857 | 3.143665 | false | false | false | false |
| 1.1 / 0.25 / 0.33 / 0.3 / 30 | 0.449628 | 25.037242 | 20.221449 | 12.930281 | 0.36/SN | 957.41857 | 3.143665 | false | false | false | false |
| 1.1 / 0.25 / 0.33 / 0.3 / 35 | 0.653573 | 4.642731 | 35.533568 | 10.5158 | 0.36/SN | 1116.988332 | 4.992023 | false | false | false | false |
| 1.1 / 0.25 / 0.33 / 0.4 / 30 | 0.377625 | 32.237476 | 16.848918 | 13.667399 | 0.36/SN | 957.41857 | 3.143665 | false | true | false | true |
| 1.1 / 0.25 / 0.33 / 0.4 / 35 | 0.547265 | 15.273517 | 29.234485 | 11.816535 | 0.36/SN | 1116.988332 | 4.992023 | false | true | false | false |
| 1.1 / 0.3 / 0.33 / 0.2 / 30 | 0.501085 | 19.891469 | 21.340656 | 12.401315 | 0.36/SN | 957.41857 | 2.619721 | false | false | false | false |
| 1.1 / 0.3 / 0.33 / 0.3 / 30 | 0.404621 | 29.537893 | 17.027359 | 13.420824 | 0.36/SN | 957.41857 | 2.619721 | false | true | false | false |
| 1.1 / 0.3 / 0.33 / 0.3 / 35 | 0.586577 | 11.342256 | 29.601339 | 11.373826 | 0.36/SN | 1116.988332 | 4.160019 | false | true | false | false |
| 1.1 / 0.3 / 0.33 / 0.4 / 30 | 0.338138 | 36.186163 | 14.144207 | 14.092129 | 0.36/SN | 957.41857 | 2.619721 | true | true | false | true |
| 1.1 / 0.3 / 0.33 / 0.4 / 35 | 0.488657 | 21.134315 | 24.299257 | 12.482935 | 0.36/SN | 1116.988332 | 4.160019 | false | true | false | false |
| 1.1 / 0.3 / 0.33 / 0.4 / 40 | 0.676674 | 2.332615 | 39.891181 | 10.189041 | 0.36/SN | 1276.558094 | 6.209708 | false | true | false | false |
| 1.2 / 0.2 / 0.33 / 0.2 / 30 | 0.631179 | 6.882062 | 33.285686 | 10.779221 | 0.36/SN | 1139.407224 | 4.676526 | false | false | false | false |
| 1.2 / 0.2 / 0.33 / 0.3 / 30 | 0.512889 | 18.711122 | 26.526988 | 12.164598 | 0.36/SN | 1139.407224 | 4.676526 | false | true | false | false |
| 1.2 / 0.2 / 0.33 / 0.4 / 30 | 0.430661 | 26.933851 | 22.021334 | 13.025646 | 0.36/SN | 1139.407224 | 4.676526 | false | true | false | true |
| 1.2 / 0.2 / 0.33 / 0.4 / 35 | 0.627978 | 7.202219 | 38.992242 | 10.788255 | 0.36/SN | 1329.308428 | 7.42615 | false | true | false | false |
| 1.2 / 0.25 / 0.33 / 0.2 / 30 | 0.549688 | 15.031165 | 26.474826 | 11.775394 | 0.36/SN | 1139.407224 | 3.741221 | false | false | false | false |
| 1.2 / 0.25 / 0.33 / 0.3 / 30 | 0.44404 | 25.595997 | 21.060722 | 12.914459 | 0.36/SN | 1139.407224 | 3.741221 | false | false | false | false |
| 1.2 / 0.25 / 0.33 / 0.3 / 35 | 0.647879 | 5.212121 | 37.272249 | 10.5483 | 0.36/SN | 1329.308428 | 5.94092 | false | false | false | false |
| 1.2 / 0.25 / 0.33 / 0.4 / 30 | 0.371269 | 32.873125 | 17.460439 | 13.644185 | 0.36/SN | 1139.407224 | 3.741221 | false | true | false | true |
| 1.2 / 0.25 / 0.33 / 0.4 / 35 | 0.539886 | 16.011396 | 30.497048 | 11.845856 | 0.36/SN | 1329.308428 | 5.94092 | false | true | false | false |
| 1.2 / 0.3 / 0.33 / 0.2 / 30 | 0.498107 | 20.189256 | 22.370465 | 12.365178 | 0.36/SN | 1139.407224 | 3.117684 | false | false | false | false |
| 1.2 / 0.3 / 0.33 / 0.3 / 30 | 0.399408 | 30.05917 | 17.708683 | 13.389094 | 0.36/SN | 1139.407224 | 3.117684 | false | true | false | false |
| 1.2 / 0.3 / 0.33 / 0.3 / 35 | 0.581414 | 11.858612 | 31.00975 | 11.38388 | 0.36/SN | 1329.308428 | 4.950767 | false | true | false | false |
| 1.2 / 0.3 / 0.33 / 0.4 / 30 | 0.332213 | 36.778657 | 14.633016 | 14.052722 | 0.36/SN | 1139.407224 | 3.117684 | true | true | false | true |
| 1.2 / 0.3 / 0.33 / 0.4 / 35 | 0.481904 | 21.809582 | 25.309362 | 12.491 | 0.36/SN | 1329.308428 | 4.950767 | false | true | false | false |
| 1.2 / 0.3 / 0.33 / 0.4 / 40 | 0.669039 | 3.096127 | 41.777158 | 10.254916 | 0.36/SN | 1519.209632 | 7.390066 | false | true | false | false |
| 1.3 / 0.2 / 0.33 / 0.2 / 30 | 0.629536 | 7.046399 | 34.992911 | 10.762444 | 0.36/SN | 1337.220978 | 5.488423 | false | false | false | false |
| 1.3 / 0.2 / 0.33 / 0.3 / 30 | 0.508346 | 19.165425 | 27.686669 | 12.164461 | 0.36/SN | 1337.220978 | 5.488423 | false | true | false | false |
| 1.3 / 0.2 / 0.33 / 0.4 / 30 | 0.425031 | 27.496903 | 22.873754 | 13.023 | 0.36/SN | 1337.220978 | 5.488423 | false | true | false | true |
| 1.3 / 0.2 / 0.33 / 0.4 / 35 | 0.621289 | 7.871135 | 40.725154 | 10.83753 | 0.36/SN | 1560.091141 | 8.715412 | false | true | false | false |
| 1.3 / 0.25 / 0.33 / 0.2 / 30 | 0.548138 | 15.186182 | 27.787177 | 11.745308 | 0.36/SN | 1337.220978 | 4.390738 | false | false | false | false |
| 1.3 / 0.25 / 0.33 / 0.3 / 30 | 0.439876 | 26.012373 | 21.939355 | 12.896635 | 0.36/SN | 1337.220978 | 4.390738 | false | false | false | false |
| 1.3 / 0.25 / 0.33 / 0.3 / 35 | 0.643811 | 5.618943 | 39.074614 | 10.566714 | 0.36/SN | 1560.091141 | 6.97233 | false | false | false | false |
| 1.3 / 0.25 / 0.33 / 0.4 / 30 | 0.366162 | 33.383821 | 18.098539 | 13.622923 | 0.36/SN | 1337.220978 | 4.390738 | false | true | false | true |
| 1.3 / 0.25 / 0.33 / 0.4 / 35 | 0.533944 | 16.605598 | 31.79829 | 11.867814 | 0.36/SN | 1560.091141 | 6.97233 | false | true | false | false |
| 1.3 / 0.3 / 0.33 / 0.2 / 30 | 0.496792 | 20.320817 | 23.459798 | 12.323695 | 0.36/SN | 1337.220978 | 3.658949 | false | false | false | false |
| 1.3 / 0.3 / 0.33 / 0.3 / 30 | 0.395562 | 30.443783 | 18.42395 | 13.358067 | 0.36/SN | 1337.220978 | 3.658949 | false | true | false | false |
| 1.3 / 0.3 / 0.33 / 0.3 / 35 | 0.577802 | 12.219771 | 32.475224 | 11.384592 | 0.36/SN | 1560.091141 | 5.810275 | false | true | false | false |
| 1.3 / 0.3 / 0.33 / 0.4 / 30 | 0.327482 | 37.251783 | 15.144702 | 14.017671 | 0.36/SN | 1337.220978 | 3.658949 | true | true | false | true |
| 1.3 / 0.3 / 0.33 / 0.4 / 35 | 0.476513 | 22.348704 | 26.354663 | 12.49532 | 0.36/SN | 1560.091141 | 5.810275 | false | true | false | false |
| 1.3 / 0.3 / 0.33 / 0.4 / 40 | 0.662939 | 3.706088 | 43.709629 | 10.305499 | 0.36/SN | 1782.961304 | 8.673063 | false | true | false | false |
| 1.4 / 0.2 / 0.33 / 0.2 / 30 | 0.629232 | 7.076785 | 36.771047 | 10.735661 | 0.36/SN | 1550.859833 | 6.365271 | false | false | false | false |
| 1.4 / 0.2 / 0.33 / 0.3 / 30 | 0.504921 | 19.507886 | 28.883946 | 12.160464 | 0.36/SN | 1550.859833 | 6.365271 | false | true | false | true |
| 1.4 / 0.2 / 0.33 / 0.4 / 30 | 0.420394 | 27.960631 | 23.749833 | 13.019849 | 0.36/SN | 1550.859833 | 6.365271 | false | true | false | true |
| 1.4 / 0.2 / 0.33 / 0.4 / 35 | 0.615751 | 8.424893 | 42.487253 | 10.877419 | 0.36/SN | 1809.336472 | 10.107815 | false | true | false | false |
| 1.4 / 0.25 / 0.33 / 0.2 / 30 | 0.547856 | 15.214441 | 29.158559 | 11.70954 | 0.36/SN | 1550.859833 | 5.092217 | false | false | false | false |
| 1.4 / 0.25 / 0.33 / 0.3 / 30 | 0.436761 | 26.323897 | 22.849809 | 12.878185 | 0.36/SN | 1550.859833 | 5.092217 | false | false | false | false |
| 1.4 / 0.25 / 0.33 / 0.3 / 35 | 0.640929 | 5.907067 | 40.926615 | 10.575553 | 0.36/SN | 1809.336472 | 8.086252 | false | false | false | false |
| 1.4 / 0.25 / 0.33 / 0.4 / 30 | 0.361981 | 33.801922 | 18.757121 | 13.603978 | 0.36/SN | 1550.859833 | 5.092217 | false | true | false | true |
| 1.4 / 0.25 / 0.33 / 0.4 / 35 | 0.529063 | 17.093683 | 33.127171 | 11.884961 | 0.36/SN | 1809.336472 | 8.086252 | false | true | false | false |
| 1.4 / 0.3 / 0.33 / 0.2 / 30 | 0.496709 | 20.3291 | 24.601453 | 12.279026 | 0.36/SN | 1550.859833 | 4.243514 | false | false | false | false |
| 1.4 / 0.3 / 0.33 / 0.3 / 30 | 0.392723 | 30.727718 | 19.167199 | 13.328532 | 0.36/SN | 1550.859833 | 4.243514 | false | true | false | false |
| 1.4 / 0.3 / 0.33 / 0.3 / 35 | 0.575324 | 12.467587 | 33.986286 | 11.379198 | 0.36/SN | 1809.336472 | 6.738544 | false | true | false | false |
| 1.4 / 0.3 / 0.33 / 0.4 / 30 | 0.323635 | 37.636539 | 15.674442 | 13.986873 | 0.36/SN | 1550.859833 | 4.243514 | true | true | false | true |
| 1.4 / 0.3 / 0.33 / 0.4 / 35 | 0.472126 | 22.787442 | 27.426081 | 12.497572 | 0.36/SN | 1809.336472 | 6.738544 | false | true | false | false |
| 1.4 / 0.3 / 0.33 / 0.4 / 40 | 0.657966 | 4.203402 | 45.673766 | 10.345541 | 0.36/SN | 2067.81311 | 10.058701 | false | true | false | false |
| 1.5 / 0.2 / 0.33 / 0.2 / 30 | 0.629931 | 7.006909 | 38.610391 | 10.701768 | 0.36/SN | 1780.323788 | 7.307072 | false | false | false | false |
| 1.5 / 0.2 / 0.33 / 0.3 / 30 | 0.502334 | 19.766609 | 30.111029 | 12.154069 | 0.36/SN | 1780.323788 | 7.307072 | false | true | true | true |
| 1.5 / 0.2 / 0.33 / 0.4 / 30 | 0.416508 | 28.349213 | 24.643357 | 13.016784 | 0.36/SN | 1780.323788 | 7.307072 | false | true | true | true |
| 1.5 / 0.2 / 0.33 / 0.4 / 35 | 0.611081 | 8.891874 | 44.268067 | 10.910631 | 0.36/SN | 2077.044419 | 11.603359 | false | true | true | true |
| 1.5 / 0.25 / 0.33 / 0.2 / 30 | 0.548525 | 15.147473 | 30.581647 | 11.669947 | 0.36/SN | 1780.323788 | 5.845657 | false | false | false | false |
| 1.5 / 0.25 / 0.33 / 0.3 / 30 | 0.434431 | 26.556876 | 23.786111 | 12.859846 | 0.36/SN | 1780.323788 | 5.845657 | false | false | false | false |
| 1.5 / 0.25 / 0.33 / 0.3 / 35 | 0.638927 | 6.107267 | 42.817365 | 10.577763 | 0.36/SN | 2077.044419 | 9.282688 | false | false | false | false |
| 1.5 / 0.25 / 0.33 / 0.4 / 30 | 0.358499 | 34.150056 | 19.431393 | 13.587365 | 0.36/SN | 1780.323788 | 5.845657 | false | true | true | true |
| 1.5 / 0.25 / 0.33 / 0.4 / 35 | 0.524981 | 17.501942 | 34.475264 | 11.898894 | 0.36/SN | 2077.044419 | 9.282688 | false | true | true | true |
| 1.5 / 0.3 / 0.33 / 0.2 / 30 | 0.497556 | 20.244362 | 25.78968 | 12.232442 | 0.36/SN | 1780.323788 | 4.871381 | false | false | false | false |
| 1.5 / 0.3 / 0.33 / 0.3 / 30 | 0.390638 | 30.936191 | 19.933653 | 13.300787 | 0.36/SN | 1780.323788 | 4.871381 | false | true | true | true |
| 1.5 / 0.3 / 0.33 / 0.3 / 35 | 0.573686 | 12.631396 | 35.533931 | 11.369765 | 0.36/SN | 2077.044419 | 7.735573 | false | true | true | true |
| 1.5 / 0.3 / 0.33 / 0.4 / 30 | 0.320454 | 37.954589 | 16.218394 | 13.959982 | 0.36/SN | 1780.323788 | 4.871381 | true | true | true | true |
| 1.5 / 0.3 / 0.33 / 0.4 / 35 | 0.468492 | 23.150795 | 28.516585 | 12.498733 | 0.36/SN | 2077.044419 | 7.735573 | false | true | true | true |
| 1.5 / 0.3 / 0.33 / 0.4 / 40 | 0.653833 | 4.616671 | 47.658396 | 10.378146 | 0.36/SN | 2373.76505 | 11.546978 | false | true | true | true |

## Files and limitations

report.html and report.md are self-contained reports; per-diameter.csv has 13 selected rows and within-D area alternatives; all-feasible-comparison.csv has 158 rows; scenario-evidence.csv has 948 rows with full roots, continuation, diagnostics, qualification and source extrapolation; summary.json contains validation, provenance and frontier sets; methodology.json states the exact rules; reproduce.mjs regenerates outputs solely from frozen files. No source artifact is changed.

These results support an offline modeled hydraulic comparison and a candidate shortlist only. They do not promote P1 authority, select an engineering-qualified column, validate dispersion or mass transfer, or adopt any candidate.
