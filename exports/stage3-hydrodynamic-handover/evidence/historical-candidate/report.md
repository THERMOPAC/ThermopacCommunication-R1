# RRBO-continuous / wet-NMP-dispersed — new Stage-3 candidate only

## Decision and scope

Status: **NO_SECOND_ADEQUATE_DIAMETER**. Conditional pre-pilot extrapolated screening, not validated final equipment. No authority replaced; no database writes, application edits, engine version bumps, Stage-1 changes or downstream changes. Isolated candidate only.

**No diameter/RPM is selected by the agreed ranking.** There are 158 hydraulically feasible trials across 13 diameters, but zero geometries meet the required 20-rpm ranking preference. The longest fixed-geometry tested-grid span is 10 rpm. Thus this is a ranking-adequacy failure, NOT an assertion that all hydraulic trials fail. The grid was not expanded and no fallback candidate was promoted.

Existing agreed ranking retained: second-smallest distinct accepted adequate diameter, after fixed-geometry 20-rpm useful-grid-span preference; no fallback if fewer than two adequate diameters. Within-diameter ties and representative RPM use existing optimizer rules. Adequacy is a ranking preference, not a hydraulic limit. A smaller feasible diameter is not misreported as hydraulically rejected.

## Provenance and reproduction

Project 236 / design 269, identified from existing saved-evidence and audit artifacts, then read from development database in an explicit READ ONLY transaction. Current saved 40 °C Stage-1 snapshot hash: 549dffa428356ee5e94d8baff297c114e1f0c6f345b84e121181e7b5f6b5f15b. Source file SHA-256: aeef586f907f9b1ccaef7ba4af837d667a2d64a09bf34be768c1dbd9bda091fd. Isolated input basis SHA-256: 6e6b5439b1006dcea6d196b9ce93304a596873a79294dc41db0ea43f5ced420a.

Review engine identity: {"id":"ecr_stage3_stage4_optimizer","version":"ECR_STAGE3_STAGE4_OPTIMIZER_V1.4.0","implementationHash":"a79c49a6d554381bde9dbdbd5076845f3d033e744e17d7612970021134671de0"}. Result calculation hash: 948b59ef34073eddd32c07d02b433ca2576ed243c5dec81be407ac3ccf650641. Existing active authority identity was not bumped; this is the previously implemented separate P1 review entry point.

Saved Stage-1 orientation is nmp-continuous-rrbo-dispersed; only the in-memory candidate basis phaseConfiguration was changed to rrbo-continuous-nmp-dispersed. The source snapshot hash is provenance, NOT a claim that this modified basis is a persisted Stage-1 authority. input.json records both hashes separately.

Prior latest Stage-3 run 64, immutable hash e2afc059444f3c22c5d3a64b83ed81b59b5a122bd51ac1c9bc9897337d788249, implementation hash faa56fdd99b0904a5e524fb8350859192d94b269331e91bbd34cc5d946ccb550. These were not changed. Full prior identifiers and frozen snapshot are in source.json. Source code file hashes are in input.json.

Reproduce offline with npx tsx deliverables/rrbo-stage3-candidate/run.ts after placing the frozen source.json in a fresh output directory/worktree (the runner refuses result overwrite). Preflight: same command with --preflight. Postprocess with npx tsx deliverables/rrbo-stage3-candidate/report.ts. extract.ts is the separately isolated read-only extraction script; it is not required for replay.

The unchanged optimizeStage3Stage4P1ForReview default routine performs an alternate-orientation comparison internally (compareOrientations=true). It was retained, not separately requested or used for selection. Its raw comparison is retained in result.json; this report and CSVs concern only the requested RRBO-continuous candidate. No additional orientation runs were performed.

## Basis, equations and numerical domain

| Quantity | Value |
| --- | --- |
| T °C | 40 |
| RRBO density kg/m³ | 869 |
| RRBO viscosity Pa s | 0.0598 |
| Wet-NMP density kg/m³ | 1015 |
| Wet-NMP viscosity Pa s | 0.001416 |
| RRBO m³/h | 4 |
| Wet-NMP m³/h | 2.054778 |
| Interfacial tension N/m | 0.011 |
| Np | 1.2 |


Retained grid: D=0.2–1.5 m every 0.1 m; hc/D=0.20,0.25,0.30; rotor/D=0.33,0.40,0.50; free-area fraction=0.20,0.30,0.40; RPM=30,35,40,45,50,55,60,65,70. 378 geometries and 3402 trials per orientation; six mandatory scenario combinations per reverse trial. No design-space modification.

C32=0.36,0.42,0.43 each paired independently with Barry–Parlange mobile and Schiller–Naumann immobile. d32=C32(sigma/rho_c)^0.6 epsilon^-0.4; Np=1.2. Both interface scenarios solve their own terminal/characteristic/swarm states, operating lower branch and modeled flood maximum. Capacity envelope is min across all six; all six must admit a dilute-connected operating root and actual loading≤0.70. Tip speed≤4.5 m/s.

Garthe convention: superficial swarm vs = relative slip × (1−phi). Operating balance is jd/phi+jc/(1−phi)=vs/(1−phi). Capacity maximizes (1+r) vslip/[r/phi+1/(1−phi)], r=jd/jc. Operating holdup is never replaced by flood holdup. a=6 phi_op/d32. Flood is a modeled turning capacity, not an observed flood or inversion point. Source convention and approvals: ../rrbo-hydraulic-method/report.md, ../rrbo-hydraulic-implementation/report.md, and .agents/memory/garthe-swarm-velocity-convention.md.

512-interval holdup mesh, 16-step flow continuation, 70 bisection iterations and 60 capacity-refinement iterations are retained implementation assumptions, not scientific qualification thresholds. Preflight and elapsed calculation evidence are in preflight.json and progress.jsonl. No performance/science modifications. Initial detached-launch attempts did not survive the command session; a managed background process with a live supervising shell and 15-second persisted heartbeat completed the full routine in 214.50 seconds (exit code 0). Only the completed result is reported; the initial START without COMPLETE is retained transparently in the progress log.

**Every RPM “window” below is a discrete tested grid run, NOT proof of continuous feasibility between points.** Diameter unions mix geometries and are explicitly labeled; full per-geometry sets follow.

## All diameters — feasibility, geometry and rejection evidence

Geometry notation is D / hc / rotor diameter (m) / free-area fraction. Best representative geometry at each diameter uses the existing within-diameter ranking; it is descriptive, not a second global selection.

| D m | Pass trials /243 | Pass geometries /27 | Adequate geometries | RPM union across geometries (NOT one window) | Best geometry | Best geometry discrete runs | Disposition / rejection counts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.2 | 0 | 0 | 0 |  | none |  | HYDRAULICALLY REJECTED; {"NO_DILUTE_CONNECTED_ROOT":243,"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":243} |
| 0.3 | 1 | 1 | 0 | 30 | 0.3 / 0.09 / 0.099 / 0.4 | 30 | FEASIBLE but 20-rpm ranking preference unmet; {"NO_DILUTE_CONNECTED_ROOT":233,"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":242} |
| 0.4 | 5 | 5 | 0 | 30 | 0.4 / 0.12 / 0.132 / 0.3 | 30 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":238,"NO_DILUTE_CONNECTED_ROOT":226} |
| 0.5 | 10 | 8 | 0 | 30, 35 | 0.5 / 0.15 / 0.165 / 0.4 | 30,35 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":233,"NO_DILUTE_CONNECTED_ROOT":222} |
| 0.6 | 11 | 8 | 0 | 30, 35 | 0.6 / 0.18 / 0.198 / 0.3 | 30,35 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":232,"NO_DILUTE_CONNECTED_ROOT":220} |
| 0.7 | 12 | 9 | 0 | 30, 35 | 0.7 / 0.21 / 0.231 / 0.3 | 30,35 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":231,"NO_DILUTE_CONNECTED_ROOT":216} |
| 0.8 | 14 | 9 | 0 | 30, 35 | 0.8 / 0.24 / 0.264 / 0.3 | 30,35 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":229,"NO_DILUTE_CONNECTED_ROOT":216} |
| 0.9 | 15 | 9 | 0 | 30, 35, 40 | 0.9 / 0.27 / 0.297 / 0.4 | 30,35,40 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":228,"NO_DILUTE_CONNECTED_ROOT":215} |
| 1 | 15 | 9 | 0 | 30, 35, 40 | 1 / 0.3 / 0.33 / 0.4 | 30,35,40 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":228,"NO_DILUTE_CONNECTED_ROOT":215} |
| 1.1 | 15 | 9 | 0 | 30, 35, 40 | 1.1 / 0.33 / 0.363 / 0.4 | 30,35,40 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":228,"NO_DILUTE_CONNECTED_ROOT":215} |
| 1.2 | 15 | 9 | 0 | 30, 35, 40 | 1.2 / 0.36 / 0.396 / 0.4 | 30,35,40 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":228,"NO_DILUTE_CONNECTED_ROOT":214} |
| 1.3 | 15 | 9 | 0 | 30, 35, 40 | 1.3 / 0.39 / 0.429 / 0.4 | 30,35,40 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":228,"NO_DILUTE_CONNECTED_ROOT":213} |
| 1.4 | 15 | 9 | 0 | 30, 35, 40 | 1.4 / 0.42 / 0.462 / 0.4 | 30,35,40 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":228,"NO_DILUTE_CONNECTED_ROOT":213} |
| 1.5 | 15 | 9 | 0 | 30, 35, 40 | 1.5 / 0.45 / 0.495 / 0.4 | 30,35,40 | FEASIBLE but 20-rpm ranking preference unmet; {"ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION":228,"NO_DILUTE_CONNECTED_ROOT":213} |


## Selection evidence

{"rule":"NEXT_SMALLEST_ACCEPTED_ADEQUATE_DIAMETER","acceptedAdequateDiametersM":[],"SMALLEST_ACCEPTED_ADEQUATE_DIAMETER":null,"SELECTED_NEXT_SMALLEST_ACCEPTED_DIAMETER":null,"status":"INSUFFICIENT_ACCEPTED_ADEQUATE_DIAMETERS"}



## Every feasible diameter — representative geometry, controlling scenario and full six-scenario diagnostics

### D=0.3 m

Geometry 0.3 / 0.09 / 0.099 / 0.4; hc/D=0.3, rotor/D=0.33. Representative 30 rpm; discrete fixed-geometry runs 30. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=11.95224–14.27629 mm. Rotor Re=71.21295, tip=0.1555088 m/s, power=0.001239616 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 11.95224 | 0.04176383 | 0.1833642 | 0.05017122 | 0.4742515 | 20.96536 | 25.37529 | 41.21416 | 18.92737 | 20.15406 | 18.59428 | 0.1769173 | 0.003876227 | -5.551115e-17 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 11.95224 | 0.07282612 | 0.1932747 | 0.0352838 | 0.6743541 | 36.55856 | 16.32493 | 26.5147 | 12.72942 | 8.341482 | 18.59428 | 0.1769173 | 0.003876227 | 0 |
| BARRY_PARLANGE_MOBILE | 0.42 | 13.94428 | 0.03203703 | 0.1820154 | 0.06167823 | 0.3857727 | 13.78502 | 37.22511 | 59.91 | 27.31794 | 37.17626 | 25.30889 | 0.1637936 | 0.003588689 | -5.551115e-17 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 13.94428 | 0.05652132 | 0.1973633 | 0.04291803 | 0.5544004 | 24.32022 | 22.8962 | 36.84909 | 17.74791 | 14.06438 | 25.30889 | 0.1637936 | 0.003588689 | -2.775558e-17 |
| BARRY_PARLANGE_MOBILE | 0.43 | 14.27629 | 0.03078636 | 0.1817188 | 0.06365642 | 0.3737844 | 12.93881 | 39.49206 | 63.45823 | 28.90558 | 40.86903 | 26.52842 | 0.1618778 | 0.003546715 | -5.551115e-17 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 14.27629 | 0.05458698 | 0.1979683 | 0.04416745 | 0.5387174 | 22.94167 | 24.08918 | 38.70796 | 18.65129 | 15.20613 | 26.52842 | 0.1618778 | 0.003546715 | 0 |


### D=0.4 m

Geometry 0.4 / 0.12 / 0.132 / 0.3; hc/D=0.3, rotor/D=0.33. Representative 30 rpm; discrete fixed-geometry runs 30. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=9.495073–11.34134 mm. Rotor Re=126.6008, tip=0.2073451 m/s, power=0.00522373 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 9.495073 | 0.03686839 | 0.1828504 | 0.03139548 | 0.4263034 | 23.29738 | 14.43619 | 20.28744 | 9.431707 | 8.211015 | 11.73485 | 0.1984933 | 0.004348953 | -2.775558e-17 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 9.495073 | 0.06102621 | 0.1850786 | 0.02174519 | 0.6154923 | 38.56287 | 9.661932 | 13.57809 | 6.465564 | 3.678066 | 11.73485 | 0.1984933 | 0.004348953 | 0 |
| BARRY_PARLANGE_MOBILE | 0.42 | 11.07759 | 0.0285148 | 0.1836296 | 0.03893996 | 0.3437086 | 15.44459 | 21.04907 | 29.4248 | 13.59852 | 14.96272 | 15.97243 | 0.1837691 | 0.004026348 | -2.775558e-17 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 11.07759 | 0.04675211 | 0.189294 | 0.02704789 | 0.494826 | 25.32255 | 13.76584 | 19.24347 | 9.20481 | 6.399561 | 15.97243 | 0.1837691 | 0.004026348 | 0 |
| BARRY_PARLANGE_MOBILE | 0.43 | 11.34134 | 0.0274435 | 0.1836505 | 0.0402226 | 0.3327483 | 14.51866 | 22.30093 | 31.14647 | 14.37949 | 16.40482 | 16.74208 | 0.1816196 | 0.003979255 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 11.34134 | 0.04505238 | 0.1899375 | 0.02793121 | 0.4791771 | 23.83442 | 14.5161 | 20.27383 | 9.703777 | 6.950649 | 16.74208 | 0.1816196 | 0.003979255 | 0 |


### D=0.5 m

Geometry 0.5 / 0.15 / 0.165 / 0.4; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=6.601371–7.884971 mm. Rotor Re=230.7827, tip=0.3023783 m/s, power=0.0253146 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 6.601371 | 0.03601655 | 0.1781574 | 0.02018049 | 0.4244575 | 32.73551 | 5.895379 | 9.210904 | 4.309579 | 1.969605 | 5.672169 | 0.2380553 | 0.00521575 | -1.387779e-17 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 6.601371 | 0.05941415 | 0.1766573 | 0.01368884 | 0.6257477 | 54.00165 | 4.003298 | 6.254728 | 2.944516 | 0.9082211 | 5.672169 | 0.2380553 | 0.00521575 | -6.938894e-18 |
| BARRY_PARLANGE_MOBILE | 0.42 | 7.7016 | 0.02753778 | 0.1808363 | 0.02558278 | 0.3348252 | 21.45355 | 8.643321 | 13.47505 | 6.292995 | 3.62886 | 7.720453 | 0.2203964 | 0.004828847 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 7.7016 | 0.04362522 | 0.1805804 | 0.01757739 | 0.4873169 | 33.98661 | 5.86451 | 9.142846 | 4.329016 | 1.6706 | 7.720453 | 0.2203964 | 0.004828847 | 0 |
| BARRY_PARLANGE_MOBILE | 0.43 | 7.884971 | 0.02648021 | 0.1811824 | 0.02649865 | 0.3232527 | 20.14988 | 9.158806 | 14.27338 | 6.662597 | 3.979857 | 8.09247 | 0.2178186 | 0.004772367 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 7.884971 | 0.04179707 | 0.1812035 | 0.0182417 | 0.4695703 | 31.80512 | 6.209846 | 9.677626 | 4.586084 | 1.82958 | 8.09247 | 0.2178186 | 0.004772367 | 0 |


### D=0.6 m

Geometry 0.6 / 0.18 / 0.198 / 0.3; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=5.70544–6.814832 mm. Rotor Re=332.3271, tip=0.362854 m/s, power=0.06299083 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 5.70544 | 0.03798179 | 0.173623 | 0.01315562 | 0.4521598 | 39.94271 | 4.077255 | 5.312722 | 2.482378 | 1.090025 | 4.237007 | 0.2560651 | 0.005610342 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 5.70544 | 0.06432334 | 0.1717619 | 0.008811215 | 0.6750992 | 67.64421 | 2.758905 | 3.594893 | 1.67809 | 0.4990846 | 4.237007 | 0.2560651 | 0.005610342 | -1.387779e-17 |
| BARRY_PARLANGE_MOBILE | 0.42 | 6.656347 | 0.02863941 | 0.1768631 | 0.0169081 | 0.3518103 | 25.81543 | 6.018983 | 7.829695 | 3.663623 | 2.036105 | 5.767037 | 0.2370702 | 0.005194167 | -1.387779e-17 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 6.656347 | 0.04588915 | 0.1751165 | 0.01142623 | 0.5205955 | 41.36427 | 4.087636 | 5.317334 | 2.496972 | 0.939071 | 5.767037 | 0.2370702 | 0.005194167 | -6.938894e-18 |
| BARRY_PARLANGE_MOBILE | 0.43 | 6.814832 | 0.02749542 | 0.1773361 | 0.01754977 | 0.3389472 | 24.20787 | 6.383245 | 8.301151 | 3.884304 | 2.236752 | 6.044927 | 0.2342974 | 0.005133414 | 1.387779e-17 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 6.814832 | 0.0438141 | 0.1756634 | 0.01187736 | 0.5008222 | 38.57536 | 4.3359 | 5.638662 | 2.650258 | 1.032032 | 6.044927 | 0.2342974 | 0.005133414 | 0 |


### D=0.7 m

Geometry 0.7 / 0.21 / 0.231 / 0.3; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=5.043497–6.024177 mm. Rotor Re=452.3341, tip=0.4233296 m/s, power=0.136148 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 5.043497 | 0.03481118 | 0.1706808 | 0.01022908 | 0.4272415 | 41.41315 | 2.965926 | 3.716663 | 1.731482 | 0.6524974 | 3.310887 | 0.2723511 | 0.005967165 | -1.387779e-17 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 5.043497 | 0.0586181 | 0.1691165 | 0.006813116 | 0.6414518 | 69.73507 | 1.997728 | 2.503395 | 1.162444 | 0.2960268 | 3.310887 | 0.2723511 | 0.005967165 | -6.938894e-18 |
| BARRY_PARLANGE_MOBILE | 0.42 | 5.884079 | 0.0261 | 0.1739459 | 0.01327908 | 0.3291106 | 26.61419 | 4.410608 | 5.520385 | 2.580008 | 1.236825 | 4.506485 | 0.2521481 | 0.005524521 | -6.938894e-18 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 5.884079 | 0.04171119 | 0.1720756 | 0.008905572 | 0.490736 | 42.53293 | 2.987395 | 3.73907 | 1.746422 | 0.5674097 | 4.506485 | 0.2521481 | 0.005524521 | -6.938894e-18 |
| BARRY_PARLANGE_MOBILE | 0.43 | 6.024177 | 0.02503748 | 0.1744477 | 0.01380438 | 0.3165869 | 24.937 | 4.682114 | 5.858997 | 2.739146 | 1.36137 | 4.723634 | 0.2491989 | 0.005459904 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 6.024177 | 0.03979101 | 0.172566 | 0.009269326 | 0.4714782 | 39.63131 | 3.173443 | 3.97111 | 1.856487 | 0.6253938 | 4.723634 | 0.2491989 | 0.005459904 | 0 |


### D=0.8 m

Geometry 0.8 / 0.24 / 0.264 / 0.3; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=4.532504–5.413824 mm. Rotor Re=590.8037, tip=0.4838053 m/s, power=0.2654429 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 4.532504 | 0.03272491 | 0.1682513 | 0.00813558 | 0.4112798 | 43.32031 | 2.239283 | 2.699155 | 1.252974 | 0.4138756 | 2.673974 | 0.2872935 | 0.006294552 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 4.532504 | 0.05498488 | 0.1671028 | 0.005402375 | 0.6193572 | 72.78742 | 1.50192 | 1.810363 | 0.8369614 | 0.1861852 | 2.673974 | 0.2872935 | 0.006294552 | 0 |
| BARRY_PARLANGE_MOBILE | 0.42 | 5.287921 | 0.02438151 | 0.1713493 | 0.01064619 | 0.3142908 | 27.66476 | 3.353735 | 4.038815 | 1.883077 | 0.7957237 | 3.639576 | 0.2659821 | 0.005827622 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 5.287921 | 0.03897926 | 0.1696991 | 0.007104059 | 0.4709983 | 44.22826 | 2.26312 | 2.725416 | 1.267066 | 0.3623431 | 3.639576 | 0.2659821 | 0.005827622 | -6.938894e-18 |
| BARRY_PARLANGE_MOBILE | 0.43 | 5.413824 | 0.02336737 | 0.171844 | 0.01108157 | 0.3019426 | 25.89745 | 3.563761 | 4.291076 | 2.001784 | 0.8776126 | 3.814952 | 0.2628711 | 0.005759461 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 5.413824 | 0.03715273 | 0.1701351 | 0.007401665 | 0.4520604 | 41.1754 | 2.406981 | 2.898213 | 1.348593 | 0.400342 | 3.814952 | 0.2628711 | 0.005759461 | -6.938894e-18 |


### D=0.9 m

Geometry 0.9 / 0.27 / 0.297 / 0.4; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35,40. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=4.124926–4.926995 mm. Rotor Re=747.736, tip=0.5442809 m/s, power=0.4783366 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 4.124926 | 0.02572023 | 0.1673824 | 0.007849007 | 0.3368264 | 37.41192 | 1.74014 | 2.384164 | 1.105062 | 0.2746262 | 2.214691 | 0.3011528 | 0.006598205 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 4.124926 | 0.04198455 | 0.1663969 | 0.005197794 | 0.5086297 | 61.06953 | 1.1631 | 1.593562 | 0.7355389 | 0.1226896 | 2.214691 | 0.3011528 | 0.006598205 | 0 |
| BARRY_PARLANGE_MOBILE | 0.42 | 4.812414 | 0.01922154 | 0.1704104 | 0.01034305 | 0.2556068 | 23.96494 | 2.623306 | 3.592032 | 1.67284 | 0.5349646 | 3.014441 | 0.2788133 | 0.006108751 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 4.812414 | 0.03028814 | 0.1688768 | 0.006876063 | 0.3844864 | 37.76251 | 1.763653 | 2.414929 | 1.120801 | 0.2417984 | 3.014441 | 0.2788133 | 0.006108751 | 0 |
| BARRY_PARLANGE_MOBILE | 0.43 | 4.926995 | 0.01842424 | 0.1709006 | 0.01077774 | 0.2452976 | 22.43668 | 2.790287 | 3.820281 | 1.78024 | 0.5911606 | 3.159694 | 0.2755522 | 0.006037301 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 4.926995 | 0.02890898 | 0.1692961 | 0.007171229 | 0.3686611 | 35.20481 | 1.877677 | 2.570795 | 1.194189 | 0.2677008 | 3.159694 | 0.2755522 | 0.006037301 | 0 |


### D=1 m

Geometry 1 / 0.3 / 0.33 / 0.4; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35,40. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=3.791492–4.528727 mm. Rotor Re=923.1309, tip=0.6047566 m/s, power=0.8100673 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 3.791492 | 0.02475063 | 0.1657151 | 0.006506789 | 0.3291085 | 39.16763 | 1.383993 | 1.838573 | 0.8493531 | 0.1889938 | 1.871118 | 0.3141159 | 0.006882224 | 3.469447e-18 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 3.791492 | 0.04040528 | 0.1650869 | 0.004306153 | 0.4972976 | 63.94097 | 0.9225967 | 1.225629 | 0.5639456 | 0.08398536 | 1.871118 | 0.3141159 | 0.006882224 | 3.469447e-18 |
| BARRY_PARLANGE_MOBILE | 0.42 | 4.423408 | 0.01839237 | 0.168482 | 0.008620205 | 0.248421 | 24.94779 | 2.098736 | 2.786737 | 1.294126 | 0.372519 | 2.5468 | 0.2908148 | 0.006371701 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 4.423408 | 0.02903484 | 0.1672816 | 0.005717475 | 0.3745429 | 39.38344 | 1.406338 | 1.86736 | 0.8636602 | 0.1672679 | 2.5468 | 0.2908148 | 0.006371701 | 3.469447e-18 |
| BARRY_PARLANGE_MOBILE | 0.43 | 4.528727 | 0.01761396 | 0.1689419 | 0.00899069 | 0.2381841 | 23.33631 | 2.234332 | 2.96654 | 1.378639 | 0.4123911 | 2.669519 | 0.2874133 | 0.006297176 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 4.528727 | 0.02769257 | 0.1676562 | 0.005966674 | 0.3589001 | 36.68921 | 1.498551 | 1.989637 | 0.9209828 | 0.1855054 | 2.669519 | 0.2874133 | 0.006297176 | 0 |


### D=1.1 m

Geometry 1.1 / 0.33 / 0.363 / 0.4; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35,40. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=3.513145–4.196256 mm. Rotor Re=1116.988, tip=0.6652322 m/s, power=1.304621 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 3.513145 | 0.02402082 | 0.1643695 | 0.005472296 | 0.3234081 | 41.02449 | 1.122039 | 1.447332 | 0.6665602 | 0.1340632 | 1.606471 | 0.3263224 | 0.007149668 | -3.469447e-18 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 3.513145 | 0.03921052 | 0.1640399 | 0.003621734 | 0.4886568 | 66.96653 | 0.7465176 | 0.9629425 | 0.4419171 | 0.05934361 | 1.606471 | 0.3263224 | 0.007149668 | -3.469447e-18 |
| BARRY_PARLANGE_MOBILE | 0.42 | 4.098669 | 0.0177597 | 0.1668603 | 0.007280145 | 0.2430975 | 25.99824 | 1.710401 | 2.2054 | 1.021198 | 0.2670195 | 2.186586 | 0.3021159 | 0.006619306 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 4.098669 | 0.02807992 | 0.1659873 | 0.004822884 | 0.3669557 | 41.10592 | 1.142973 | 1.473756 | 0.6795869 | 0.1192393 | 2.186586 | 0.3021159 | 0.006619306 | -3.469447e-18 |
| BARRY_PARLANGE_MOBILE | 0.43 | 4.196256 | 0.01699432 | 0.1672833 | 0.007598612 | 0.232909 | 24.29926 | 1.822397 | 2.349649 | 1.088865 | 0.2960833 | 2.291948 | 0.2985822 | 0.006541885 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 4.196256 | 0.02676485 | 0.1663224 | 0.005035656 | 0.3514507 | 38.26961 | 1.218808 | 1.571431 | 0.725198 | 0.1324337 | 2.291948 | 0.2985822 | 0.006541885 | -6.938894e-18 |


### D=1.2 m

Geometry 1.2 / 0.36 / 0.396 / 0.4; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35,40. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=3.276915–3.914093 mm. Rotor Re=1329.308, tip=0.7257079 m/s, power=2.015707 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 3.276915 | 0.02345888 | 0.1632838 | 0.004660605 | 0.3190811 | 42.95298 | 0.9244875 | 1.159579 | 0.5325652 | 0.09757236 | 1.397691 | 0.3378799 | 0.00740289 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 3.276915 | 0.03828252 | 0.1631925 | 0.003085906 | 0.4819042 | 70.09493 | 0.6142437 | 0.7704422 | 0.352796 | 0.04307311 | 1.397691 | 0.3378799 | 0.00740289 | -1.734723e-18 |
| BARRY_PARLANGE_MOBILE | 0.42 | 3.823067 | 0.01726672 | 0.1655062 | 0.006220857 | 0.2390524 | 27.09874 | 1.415728 | 1.775156 | 0.819685 | 0.1961272 | 1.902413 | 0.312816 | 0.006853744 | -3.469447e-18 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 3.823067 | 0.02733369 | 0.1649266 | 0.004119188 | 0.3610205 | 42.89805 | 0.943978 | 1.183637 | 0.5444097 | 0.08719702 | 1.902413 | 0.312816 | 0.006853744 | -3.469447e-18 |
| BARRY_PARLANGE_MOBILE | 0.43 | 3.914093 | 0.01651053 | 0.1658906 | 0.006496825 | 0.2288981 | 25.30936 | 1.509537 | 1.892675 | 0.8746741 | 0.2177943 | 1.994082 | 0.3091572 | 0.006773581 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 3.914093 | 0.02603924 | 0.165227 | 0.004302709 | 0.345622 | 39.91613 | 1.007239 | 1.262888 | 0.5812888 | 0.09696703 | 1.994082 | 0.3091572 | 0.006773581 | -3.469447e-18 |


### D=1.3 m

Geometry 1.3 / 0.39 / 0.429 / 0.4; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35,40. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=3.073658–3.671313 mm. Rotor Re=1560.091, tip=0.7861836 m/s, power=3.007723 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 3.073658 | 0.02301758 | 0.1624054 | 0.004013499 | 0.3157156 | 44.93197 | 0.7723367 | 0.943314 | 0.4321891 | 0.07260186 | 1.229679 | 0.3488729 | 0.007643744 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 3.073658 | 0.03754554 | 0.1624987 | 0.00265916 | 0.476513 | 73.29158 | 0.5126892 | 0.6261867 | 0.2862061 | 0.03199211 | 1.229679 | 0.3488729 | 0.007643744 | 1.734723e-18 |
| BARRY_PARLANGE_MOBILE | 0.42 | 3.585934 | 0.01687561 | 0.1643789 | 0.005371281 | 0.2359073 | 28.23634 | 1.187469 | 1.449944 | 0.6677782 | 0.1471067 | 1.67373 | 0.3229935 | 0.007076732 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 3.585934 | 0.02673796 | 0.1640491 | 0.003556577 | 0.3562763 | 44.73807 | 0.7904276 | 0.9651413 | 0.4429366 | 0.06517961 | 1.67373 | 0.3229935 | 0.007076732 | 0 |
| BARRY_PARLANGE_MOBILE | 0.43 | 3.671313 | 0.01612604 | 0.1647255 | 0.005612244 | 0.2257785 | 26.35466 | 1.266982 | 1.546958 | 0.713048 | 0.1635721 | 1.75438 | 0.3192157 | 0.00699396 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 3.671313 | 0.02545953 | 0.1643192 | 0.00371632 | 0.3409621 | 41.60832 | 0.8438525 | 1.030326 | 0.4731767 | 0.07256071 | 1.75438 | 0.3192157 | 0.00699396 | -3.469447e-18 |


### D=1.4 m

Geometry 1.4 / 0.42 / 0.462 / 0.4; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35,40. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=2.896728–3.459981 mm. Rotor Re=1809.336, tip=0.8466592 m/s, power=4.356736 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 2.896728 | 0.02266492 | 0.1616913 | 0.003490206 | 0.3130392 | 46.9459 | 0.6530217 | 0.7777025 | 0.3555603 | 0.05507283 | 1.092185 | 0.3593694 | 0.007873721 | -3.469447e-18 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 2.896728 | 0.03694885 | 0.1619246 | 0.002314154 | 0.4721256 | 76.53224 | 0.433249 | 0.5159687 | 0.2354569 | 0.02424138 | 1.092185 | 0.3593694 | 0.007873721 | -3.469447e-18 |
| BARRY_PARLANGE_MOBILE | 0.42 | 3.379516 | 0.01656033 | 0.1634403 | 0.00468092 | 0.2334095 | 29.40124 | 1.007527 | 1.199606 | 0.5511768 | 0.1123696 | 1.486586 | 0.3327114 | 0.007289649 | -3.469447e-18 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 3.379516 | 0.02625352 | 0.1633164 | 0.003100275 | 0.3524111 | 46.61054 | 0.6697878 | 0.7974792 | 0.3652961 | 0.04966035 | 1.486586 | 0.3327114 | 0.007289649 | 0 |
| BARRY_PARLANGE_MOBILE | 0.43 | 3.459981 | 0.01581562 | 0.1637514 | 0.004892823 | 0.2233008 | 27.42608 | 1.075614 | 1.280622 | 0.5888752 | 0.1250919 | 1.558218 | 0.3288199 | 0.007204387 | -3.469447e-18 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 3.459981 | 0.0249878 | 0.1635601 | 0.003240467 | 0.3371647 | 43.33169 | 0.7153917 | 0.8517424 | 0.390401 | 0.05533552 | 1.558218 | 0.3288199 | 0.007204387 | -6.938894e-18 |


### D=1.5 m

Geometry 1.5 / 0.45 / 0.495 / 0.4; hc/D=0.3, rotor/D=0.33. Representative 35 rpm; discrete fixed-geometry runs 30,35,40. Controlling SCHILLER_NAUMANN_IMMOBILE, C=0.36. d32 range=2.741178–3.274184 mm. Rotor Re=2077.044, tip=0.9071349 m/s, power=6.151449 W.

| Interface | C32 | d32 mm | phi op | phi flood | capacity m/s | loading | area m²/m³ | Re terminal | Re characteristic | Re swarm flood | We terminal | Eo | Oh c | Oh d | closure m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BARRY_PARLANGE_MOBILE | 0.36 | 2.741178 | 0.02237855 | 0.1611074 | 0.003061602 | 0.310867 | 48.98308 | 0.5579808 | 0.6487788 | 0.296076 | 0.04249044 | 0.9780367 | 0.3694251 | 0.008094039 | -1.734723e-18 |
| SCHILLER_NAUMANN_IMMOBILE | 0.36 | 2.741178 | 0.03645737 | 0.1614447 | 0.00203152 | 0.4684921 | 79.79937 | 0.3700913 | 0.4303149 | 0.1961045 | 0.01869264 | 0.9780367 | 0.3694251 | 0.008094039 | 0 |
| BARRY_PARLANGE_MOBILE | 0.42 | 3.19804 | 0.01630249 | 0.162657 | 0.004113249 | 0.2313867 | 30.58591 | 0.8635076 | 1.003815 | 0.4602369 | 0.08722447 | 1.331217 | 0.3420212 | 0.007493624 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.42 | 3.19804 | 0.02585307 | 0.1626995 | 0.002725464 | 0.349207 | 48.50421 | 0.5735082 | 0.6666949 | 0.3048867 | 0.03847558 | 1.331217 | 0.3420212 | 0.007493624 | -1.734723e-18 |
| BARRY_PARLANGE_MOBILE | 0.43 | 3.274184 | 0.01556143 | 0.1629357 | 0.004300837 | 0.2212944 | 28.51658 | 0.922335 | 1.072163 | 0.491954 | 0.09719952 | 1.395363 | 0.3380208 | 0.007405977 | 0 |
| SCHILLER_NAUMANN_IMMOBILE | 0.43 | 3.274184 | 0.02459767 | 0.16292 | 0.002849414 | 0.3340164 | 45.07565 | 0.612805 | 0.7123515 | 0.3259591 | 0.04290733 | 1.395363 | 0.3380208 | 0.007405977 | 0 |


## Complete feasible fixed-geometry RPM sets

Each row fixes all geometry; semicolons separate disconnected runs. No union is presented as a single-geometry window.

| D m | hc/D | hc m | rotor/D | rotor m | free area | Feasible discrete RPM runs |
| --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 0.3 | 0.09 | 0.33 | 0.099 | 0.4 | 30 |
| 0.4 | 0.2 | 0.08 | 0.33 | 0.132 | 0.4 | 30 |
| 0.4 | 0.25 | 0.1 | 0.33 | 0.132 | 0.3 | 30 |
| 0.4 | 0.25 | 0.1 | 0.33 | 0.132 | 0.4 | 30 |
| 0.4 | 0.3 | 0.12 | 0.33 | 0.132 | 0.3 | 30 |
| 0.4 | 0.3 | 0.12 | 0.33 | 0.132 | 0.4 | 30 |
| 0.5 | 0.2 | 0.1 | 0.33 | 0.165 | 0.3 | 30 |
| 0.5 | 0.2 | 0.1 | 0.33 | 0.165 | 0.4 | 30 |
| 0.5 | 0.25 | 0.125 | 0.33 | 0.165 | 0.2 | 30 |
| 0.5 | 0.25 | 0.125 | 0.33 | 0.165 | 0.3 | 30 |
| 0.5 | 0.25 | 0.125 | 0.33 | 0.165 | 0.4 | 30, 35 |
| 0.5 | 0.3 | 0.15 | 0.33 | 0.165 | 0.2 | 30 |
| 0.5 | 0.3 | 0.15 | 0.33 | 0.165 | 0.3 | 30 |
| 0.5 | 0.3 | 0.15 | 0.33 | 0.165 | 0.4 | 30, 35 |
| 0.6 | 0.2 | 0.12 | 0.33 | 0.198 | 0.3 | 30 |
| 0.6 | 0.2 | 0.12 | 0.33 | 0.198 | 0.4 | 30 |
| 0.6 | 0.25 | 0.15 | 0.33 | 0.198 | 0.2 | 30 |
| 0.6 | 0.25 | 0.15 | 0.33 | 0.198 | 0.3 | 30 |
| 0.6 | 0.25 | 0.15 | 0.33 | 0.198 | 0.4 | 30, 35 |
| 0.6 | 0.3 | 0.18 | 0.33 | 0.198 | 0.2 | 30 |
| 0.6 | 0.3 | 0.18 | 0.33 | 0.198 | 0.3 | 30, 35 |
| 0.6 | 0.3 | 0.18 | 0.33 | 0.198 | 0.4 | 30, 35 |
| 0.7 | 0.2 | 0.14 | 0.33 | 0.231 | 0.2 | 30 |
| 0.7 | 0.2 | 0.14 | 0.33 | 0.231 | 0.3 | 30 |
| 0.7 | 0.2 | 0.14 | 0.33 | 0.231 | 0.4 | 30 |
| 0.7 | 0.25 | 0.175 | 0.33 | 0.231 | 0.2 | 30 |
| 0.7 | 0.25 | 0.175 | 0.33 | 0.231 | 0.3 | 30 |
| 0.7 | 0.25 | 0.175 | 0.33 | 0.231 | 0.4 | 30, 35 |
| 0.7 | 0.3 | 0.21 | 0.33 | 0.231 | 0.2 | 30 |
| 0.7 | 0.3 | 0.21 | 0.33 | 0.231 | 0.3 | 30, 35 |
| 0.7 | 0.3 | 0.21 | 0.33 | 0.231 | 0.4 | 30, 35 |
| 0.8 | 0.2 | 0.16 | 0.33 | 0.264 | 0.2 | 30 |
| 0.8 | 0.2 | 0.16 | 0.33 | 0.264 | 0.3 | 30 |
| 0.8 | 0.2 | 0.16 | 0.33 | 0.264 | 0.4 | 30, 35 |
| 0.8 | 0.25 | 0.2 | 0.33 | 0.264 | 0.2 | 30 |
| 0.8 | 0.25 | 0.2 | 0.33 | 0.264 | 0.3 | 30, 35 |
| 0.8 | 0.25 | 0.2 | 0.33 | 0.264 | 0.4 | 30, 35 |
| 0.8 | 0.3 | 0.24 | 0.33 | 0.264 | 0.2 | 30 |
| 0.8 | 0.3 | 0.24 | 0.33 | 0.264 | 0.3 | 30, 35 |
| 0.8 | 0.3 | 0.24 | 0.33 | 0.264 | 0.4 | 30, 35 |
| 0.9 | 0.2 | 0.18 | 0.33 | 0.297 | 0.2 | 30 |
| 0.9 | 0.2 | 0.18 | 0.33 | 0.297 | 0.3 | 30 |
| 0.9 | 0.2 | 0.18 | 0.33 | 0.297 | 0.4 | 30, 35 |
| 0.9 | 0.25 | 0.225 | 0.33 | 0.297 | 0.2 | 30 |
| 0.9 | 0.25 | 0.225 | 0.33 | 0.297 | 0.3 | 30, 35 |
| 0.9 | 0.25 | 0.225 | 0.33 | 0.297 | 0.4 | 30, 35 |
| 0.9 | 0.3 | 0.27 | 0.33 | 0.297 | 0.2 | 30 |
| 0.9 | 0.3 | 0.27 | 0.33 | 0.297 | 0.3 | 30, 35 |
| 0.9 | 0.3 | 0.27 | 0.33 | 0.297 | 0.4 | 30, 35, 40 |
| 1 | 0.2 | 0.2 | 0.33 | 0.33 | 0.2 | 30 |
| 1 | 0.2 | 0.2 | 0.33 | 0.33 | 0.3 | 30 |
| 1 | 0.2 | 0.2 | 0.33 | 0.33 | 0.4 | 30, 35 |
| 1 | 0.25 | 0.25 | 0.33 | 0.33 | 0.2 | 30 |
| 1 | 0.25 | 0.25 | 0.33 | 0.33 | 0.3 | 30, 35 |
| 1 | 0.25 | 0.25 | 0.33 | 0.33 | 0.4 | 30, 35 |
| 1 | 0.3 | 0.3 | 0.33 | 0.33 | 0.2 | 30 |
| 1 | 0.3 | 0.3 | 0.33 | 0.33 | 0.3 | 30, 35 |
| 1 | 0.3 | 0.3 | 0.33 | 0.33 | 0.4 | 30, 35, 40 |
| 1.1 | 0.2 | 0.22 | 0.33 | 0.363 | 0.2 | 30 |
| 1.1 | 0.2 | 0.22 | 0.33 | 0.363 | 0.3 | 30 |
| 1.1 | 0.2 | 0.22 | 0.33 | 0.363 | 0.4 | 30, 35 |
| 1.1 | 0.25 | 0.275 | 0.33 | 0.363 | 0.2 | 30 |
| 1.1 | 0.25 | 0.275 | 0.33 | 0.363 | 0.3 | 30, 35 |
| 1.1 | 0.25 | 0.275 | 0.33 | 0.363 | 0.4 | 30, 35 |
| 1.1 | 0.3 | 0.33 | 0.33 | 0.363 | 0.2 | 30 |
| 1.1 | 0.3 | 0.33 | 0.33 | 0.363 | 0.3 | 30, 35 |
| 1.1 | 0.3 | 0.33 | 0.33 | 0.363 | 0.4 | 30, 35, 40 |
| 1.2 | 0.2 | 0.24 | 0.33 | 0.396 | 0.2 | 30 |
| 1.2 | 0.2 | 0.24 | 0.33 | 0.396 | 0.3 | 30 |
| 1.2 | 0.2 | 0.24 | 0.33 | 0.396 | 0.4 | 30, 35 |
| 1.2 | 0.25 | 0.3 | 0.33 | 0.396 | 0.2 | 30 |
| 1.2 | 0.25 | 0.3 | 0.33 | 0.396 | 0.3 | 30, 35 |
| 1.2 | 0.25 | 0.3 | 0.33 | 0.396 | 0.4 | 30, 35 |
| 1.2 | 0.3 | 0.36 | 0.33 | 0.396 | 0.2 | 30 |
| 1.2 | 0.3 | 0.36 | 0.33 | 0.396 | 0.3 | 30, 35 |
| 1.2 | 0.3 | 0.36 | 0.33 | 0.396 | 0.4 | 30, 35, 40 |
| 1.3 | 0.2 | 0.26 | 0.33 | 0.429 | 0.2 | 30 |
| 1.3 | 0.2 | 0.26 | 0.33 | 0.429 | 0.3 | 30 |
| 1.3 | 0.2 | 0.26 | 0.33 | 0.429 | 0.4 | 30, 35 |
| 1.3 | 0.25 | 0.325 | 0.33 | 0.429 | 0.2 | 30 |
| 1.3 | 0.25 | 0.325 | 0.33 | 0.429 | 0.3 | 30, 35 |
| 1.3 | 0.25 | 0.325 | 0.33 | 0.429 | 0.4 | 30, 35 |
| 1.3 | 0.3 | 0.39 | 0.33 | 0.429 | 0.2 | 30 |
| 1.3 | 0.3 | 0.39 | 0.33 | 0.429 | 0.3 | 30, 35 |
| 1.3 | 0.3 | 0.39 | 0.33 | 0.429 | 0.4 | 30, 35, 40 |
| 1.4 | 0.2 | 0.28 | 0.33 | 0.462 | 0.2 | 30 |
| 1.4 | 0.2 | 0.28 | 0.33 | 0.462 | 0.3 | 30 |
| 1.4 | 0.2 | 0.28 | 0.33 | 0.462 | 0.4 | 30, 35 |
| 1.4 | 0.25 | 0.35 | 0.33 | 0.462 | 0.2 | 30 |
| 1.4 | 0.25 | 0.35 | 0.33 | 0.462 | 0.3 | 30, 35 |
| 1.4 | 0.25 | 0.35 | 0.33 | 0.462 | 0.4 | 30, 35 |
| 1.4 | 0.3 | 0.42 | 0.33 | 0.462 | 0.2 | 30 |
| 1.4 | 0.3 | 0.42 | 0.33 | 0.462 | 0.3 | 30, 35 |
| 1.4 | 0.3 | 0.42 | 0.33 | 0.462 | 0.4 | 30, 35, 40 |
| 1.5 | 0.2 | 0.3 | 0.33 | 0.495 | 0.2 | 30 |
| 1.5 | 0.2 | 0.3 | 0.33 | 0.495 | 0.3 | 30 |
| 1.5 | 0.2 | 0.3 | 0.33 | 0.495 | 0.4 | 30, 35 |
| 1.5 | 0.25 | 0.375 | 0.33 | 0.495 | 0.2 | 30 |
| 1.5 | 0.25 | 0.375 | 0.33 | 0.495 | 0.3 | 30, 35 |
| 1.5 | 0.25 | 0.375 | 0.33 | 0.495 | 0.4 | 30, 35 |
| 1.5 | 0.3 | 0.45 | 0.33 | 0.495 | 0.2 | 30 |
| 1.5 | 0.3 | 0.45 | 0.33 | 0.495 | 0.3 | 30, 35 |
| 1.5 | 0.3 | 0.45 | 0.33 | 0.495 | 0.4 | 30, 35, 40 |

## Verification and limits

| Check | Result |
| --- | --- |
| feasibleTrialCount | 158 |
| everyFeasibleHasSixScenarios | true |
| allFeasibleScenarioLoadingAtMost070 | true |
| allFeasibleScenarioRootsLowerThanFlood | true |
| allFeasibleTipSpeedWithin45 | true |
| everyGoverningIsMinCapacity | true |
| independentlyCheckedAllScenarioClosureAndLoading | true |
| maxAbsOperatingClosureMS | 5.551115e-17 |
| maxAbsTerminalForceResidualN | 8.673617e-19 |
| selectedHasSixPassingScenarios | — |


Closure residuals are checked for all feasible trials, not just the selected one. scenarios.csv retains every scenario, including operating roots, continuation, signed velocities, characteristic and terminal Reynolds, swarm Reynolds at flood, operating swarm/slip Reynolds, Eo, terminal We, continuous/dispersed Oh, capacity, actual loading, operating area and force/operating residuals. result.json retains every original solver output and comparison. All rejected trial constraints are in trials.csv; the diameter summary counts each rejection reason independently, so counts may overlap.

Inversion, entrainment, disengagement, turbulence, spherical-drop applicability, Schiller–Naumann range and actual interface mobility remain UNKNOWN; numerical diagnostics do not qualify them. The pre-pilot d32 interval is epistemic sensitivity, not a confidence interval. Larger-than-source apparatus and high RRBO viscosity remain extrapolations. Lower-branch continuation is quasi-steady admissibility, not proof of dynamic stability. This candidate does not authorize a downstream geometry, transfer, Stage-4/5, drawing or authority update.

## Files

report.html (standalone), report.md (this report), summary.json, diameters.csv, geometry-rpm-grid.csv, trials.csv, scenarios.csv, result.json (complete reproducible raw result), source.json (read-only frozen source), input.json (isolated candidate and provenance), preflight.json, progress.jsonl, extract.ts, run.ts, report.ts. No secrets or actor identities are exported.
