# Fixed NT=7 Sensitivity Test for Three RRBO Feed Compositions

**25°C · S/O = 0.90 by mass · direct NT=7 calculation for each feed · research diagnostic only**

Only RRBO feed composition changes. The pinned NIST cCOSMO COSMO-SAC-2010 kernel, project NMP-LLE residual amendment, parameters, equations, numerical settings, multistart logic, solvent basis, and phase-stability gates are unchanged.

## Executive comparison

| Scenario | Feed SAT % | Feed Aromatics+PA % | Raffinate SAT % | Aromatics % | PA % | NMP % | Recovery % | NMP Gate | Aromatics Gate | PA Gate | All 3 Gates | Primary Closure | Multistart | Phase Stability |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Scenario 1 | 85.0 | 15.0 | 98.9138 | 1.0842 | 0.001961 | 6.0150 | 79.5939 | PASS | PASS | PASS | **PASS** | PASS | FAIL | FAIL |
| Scenario 2 | 88.0 | 12.0 | 98.9548 | 1.0433 | 0.001929 | 6.0094 | 83.2499 | PASS | PASS | PASS | **PASS** | PASS | FAIL | FAIL |
| Scenario 3 | 90.0 | 10.0 | 99.0225 | 0.9757 | 0.001765 | 6.0002 | 85.6082 | PASS | PASS | PASS | **PASS** | PASS | FAIL | FAIL |

**Product-screen result:** All three feed compositions pass all three strict product gates at NT=7.

**Thermodynamic-acceptance result:** All three fail. Primary closure is excellent, but every secondary deterministic start fails closure/branch agreement and every case has formal phase-stability failures including strongly negative post-split TPD.

## Feed compositions and calculated oil-feed mole fractions

### Scenario 1

| Component | Feed wt% | Feed mole fraction |
|---|---:|---:|
| SAT | 85.0000 | 0.8314095021 |
| MONO | 7.0000 | 0.0970319355 |
| DI | 4.0000 | 0.0468671662 |
| POLY | 2.0000 | 0.0164755386 |
| PA | 2.0000 | 0.0082158577 |
| NMP | 0.0000 | 0.0000000000 |

### Scenario 2

| Component | Feed wt% | Feed mole fraction |
|---|---:|---:|
| SAT | 88.0000 | 0.8645350461 |
| MONO | 5.6000 | 0.0779665926 |
| DI | 3.2000 | 0.0376584599 |
| POLY | 1.6000 | 0.0132383384 |
| PA | 1.6000 | 0.0066015629 |
| NMP | 0.0000 | 0.0000000000 |

### Scenario 3

| Component | Feed wt% | Feed mole fraction |
|---|---:|---:|
| SAT | 90.0000 | 0.8863870726 |
| MONO | 4.7000 | 0.0655993232 |
| DI | 2.7000 | 0.0318535114 |
| POLY | 1.3000 | 0.0107829557 |
| PA | 1.3000 | 0.0053771371 |
| NMP | 0.0000 | 0.0000000000 |

## Detailed calculation results

### Scenario 1

- Final raffinate saturates, NMP-free HC basis: **98.913792 wt%**
- Final total aromatics, NMP-free HC basis: **1.084247 wt%**
- Final polar aromatics, NMP-free HC basis: **0.00196083 wt%**
- NMP in total raffinate: **6.014961 wt%**
- NMP-free RRBO recovery: **79.593938%**
- Primary maximum scaled equation residual: **3.586020e-14** — PASS
- Maximum stage component-balance residual: **2.942423e-16 mol** — PASS
- Maximum overall component-balance residual: **4.857226e-16 mol** — PASS
- Secondary-start maximum scaled residual: **1.187494e-03** — FAIL
- Multistart product relative difference: **3.310494e-03** versus 1e-6 limit — FAIL
- Minimum post-split TPD: **-7.255044e-01**, Stage 1 extract — FAIL
- Overall thermodynamic acceptance: **FAIL**

Final extract composition:

| Component | Mass wt% | Mole fraction |
|---|---:|---:|
| SAT | 5.954317 | 0.0372671424 |
| MONO | 6.101820 | 0.0541220312 |
| DI | 3.584547 | 0.0268745397 |
| POLY | 1.838428 | 0.0096906798 |
| PA | 1.897635 | 0.0049880821 |
| NMP | 80.623254 | 0.8670575248 |

### Scenario 2

- Final raffinate saturates, NMP-free HC basis: **98.954796 wt%**
- Final total aromatics, NMP-free HC basis: **1.043275 wt%**
- Final polar aromatics, NMP-free HC basis: **0.00192882 wt%**
- NMP in total raffinate: **6.009377 wt%**
- NMP-free RRBO recovery: **83.249933%**
- Primary maximum scaled equation residual: **2.309264e-14** — PASS
- Maximum stage component-balance residual: **4.845815e-15 mol** — PASS
- Maximum overall component-balance residual: **8.873111e-15 mol** — PASS
- Secondary-start maximum scaled residual: **1.100570e-03** — FAIL
- Multistart product relative difference: **3.664708e-03** versus 1e-6 limit — FAIL
- Minimum post-split TPD: **-6.629354e-01**, Stage 1 extract — FAIL
- Overall thermodynamic acceptance: **FAIL**

Final extract composition:

| Component | Mass wt% | Mole fraction |
|---|---:|---:|
| SAT | 5.541105 | 0.0343193215 |
| MONO | 4.945863 | 0.0434115219 |
| DI | 2.937023 | 0.0217902575 |
| POLY | 1.514450 | 0.0078997018 |
| PA | 1.575900 | 0.0040991873 |
| NMP | 83.485659 | 0.8884800099 |

### Scenario 3

- Final raffinate saturates, NMP-free HC basis: **99.022541 wt%**
- Final total aromatics, NMP-free HC basis: **0.975694 wt%**
- Final polar aromatics, NMP-free HC basis: **0.00176470 wt%**
- NMP in total raffinate: **6.000181 wt%**
- NMP-free RRBO recovery: **85.608232%**
- Primary maximum scaled equation residual: **5.795364e-14** — PASS
- Maximum stage component-balance residual: **1.227398e-15 mol** — PASS
- Maximum overall component-balance residual: **2.149756e-15 mol** — PASS
- Secondary-start maximum scaled residual: **1.084336e-03** — FAIL
- Multistart product relative difference: **3.838749e-03** versus 1e-6 limit — FAIL
- Minimum post-split TPD: **-5.941699e-01**, Stage 1 extract — FAIL
- Overall thermodynamic acceptance: **FAIL**

Final extract composition:

| Component | Mass wt% | Mole fraction |
|---|---:|---:|
| SAT | 5.285251 | 0.0324925159 |
| MONO | 4.179106 | 0.0364100865 |
| DI | 2.516693 | 0.0185336365 |
| POLY | 1.254211 | 0.0064938465 |
| PA | 1.312570 | 0.0033889649 |
| NMP | 85.452169 | 0.9026809497 |

## Changes as feed saturates increase

| Scenario | Δ Aromatics, wt%-point | Δ PA, wt%-point | Δ NMP, wt%-point | Δ Recovery, %-point |
|---|---:|---:|---:|---:|
| Scenario 1 vs Scenario 1 | +0.000000 | +0.00000000 | +0.000000 | +0.000000 |
| Scenario 2 vs Scenario 1 | -0.040972 | -0.00003200 | -0.005583 | +3.655994 |
| Scenario 3 vs Scenario 1 | -0.108553 | -0.00019613 | -0.014780 | +6.014294 |

From 85 to 90 wt% feed saturates, calculated raffinate aromatics decrease by 0.108553 wt%-point, PA decreases by 0.00019613 wt%-point, NMP carryover decreases by 0.014780 wt%-point, and recovery increases by 6.014294 percentage points.

## Numerical and stability trend

- Primary convergence remains excellent for all three scenarios; there is no meaningful degradation in primary closure.
- The bounded secondary-start residual improves slightly as feed saturates rise (1.187e-3 → 1.084e-3), but remains about five orders of magnitude above the 1e-8 closure gate.
- Multistart product disagreement worsens (3.310e-3 → 3.839e-3) and remains far above the 1e-6 limit.
- Minimum TPD becomes less negative (-0.7255 → -0.5942), indicating directional improvement, but remains decisively below the -1e-8 stability limit. None of the cases is globally phase-stable.

## Final answers

1. **All three compositions pass the three product gates at NT=7.**
2. Higher feed saturates modestly improve raffinate product composition and materially improve calculated hydrocarbon recovery.
3. Primary convergence remains strong. Secondary residual and minimum TPD improve slightly, while multistart product agreement worsens. Every scenario still fails multistart and phase-stability acceptance.
4. **NT=7 is not numerically and thermodynamically accepted for any scenario.**

> `PRODUCT_GATES_PASS` for Scenarios 1, 2, and 3.
>
> `THERMODYNAMIC_ACCEPTANCE_FAIL` for Scenarios 1, 2, and 3.

## Governance

These are non-accepted sensitivity diagnostics from `COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL`. They are research-only, calibration-required, non-pilot-validated, and non-release-eligible. The model remains `NOT_QUALIFIED`; sulfur remains `NOT_CALCULABLE`; PA is not a sulfur surrogate.
