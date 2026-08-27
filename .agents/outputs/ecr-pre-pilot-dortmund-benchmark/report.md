# ECR Pre-Pilot Dortmund Numerical LLE Benchmark

**Verdict:** PRELIMINARY: reproducible five-component predictive research only; benchmark accuracy is not release approval and does not block a physical supported-subset prediction.

- Frozen subset digest: `570395a2cb12511466e17830c4714c9a9a1ae67fcd1a3ff2ada26e2393036292`
- Coto rows: 17 (13 xylene; 4 toluene); predicted two-phase: 17
- Composition RMSD: 0.093210; maximum: 0.335025; values > 3u(x): 126/170
- SN300 50 C: **EXTRAPOLATED**; TWO_LIQUID_PHASES; beta=0.56793081; isoactivity residual=9.313e-11.

Polar Aromatics (2 wt% of the documented six-component oil basis) is explicitly unresolved and excluded from this five-component flash, not folded into another family.

## Per-row results

| Row | Phase | RMSD | Max error | >3u |
|---|---|---:|---:|---:|
| coto-2022-xylene-2 | TWO_LIQUID_PHASES | 0.138871 | 0.320341 | 7 |
| coto-2022-xylene-5 | TWO_LIQUID_PHASES | 0.109334 | 0.246549 | 8 |
| coto-2022-xylene-9 | TWO_LIQUID_PHASES | 0.079205 | 0.164294 | 8 |
| coto-2022-xylene-10 | TWO_LIQUID_PHASES | 0.090676 | 0.186444 | 8 |
| coto-2022-xylene-6 | TWO_LIQUID_PHASES | 0.085070 | 0.161408 | 8 |
| coto-2022-xylene-11 | TWO_LIQUID_PHASES | 0.081501 | 0.150491 | 8 |
| coto-2022-xylene-3 | TWO_LIQUID_PHASES | 0.106023 | 0.207322 | 8 |
| coto-2022-xylene-7 | TWO_LIQUID_PHASES | 0.085638 | 0.152513 | 8 |
| coto-2022-xylene-4 | TWO_LIQUID_PHASES | 0.079527 | 0.147921 | 7 |
| coto-2022-xylene-1 | TWO_LIQUID_PHASES | 0.083582 | 0.158269 | 7 |
| coto-2022-xylene-12 | TWO_LIQUID_PHASES | 0.073738 | 0.135457 | 7 |
| coto-2022-xylene-8 | TWO_LIQUID_PHASES | 0.085656 | 0.150634 | 7 |
| coto-2022-xylene-13 | TWO_LIQUID_PHASES | 0.069479 | 0.132305 | 7 |
| coto-2022-toluene-14 | TWO_LIQUID_PHASES | 0.145530 | 0.335025 | 7 |
| coto-2022-toluene-15 | TWO_LIQUID_PHASES | 0.079957 | 0.167013 | 8 |
| coto-2022-toluene-16 | TWO_LIQUID_PHASES | 0.079427 | 0.143372 | 7 |
| coto-2022-toluene-17 | TWO_LIQUID_PHASES | 0.068671 | 0.117388 | 6 |

The JSON artifact contains complete phases, K/selectivity, isoactivity and material-balance residuals for each row.

## Numerical equation and stability gate

Dortmund combinatorial: `ln gamma^C_i = 1 - Vprime_i + ln(Vprime_i) - 5 q_i [1 - V_i/F_i + ln(V_i/F_i)]`, where `Vprime_i = r_i^(3/4)/sum(x r^(3/4))`, `V_i = r_i/sum(x r_i)`, and `F_i = q_i/sum(x q_i)`. The residual term uses the frozen Dortmund interaction polynomial. Multistart stationary splits are selected by minimum split Gibbs energy only when phases are positive/normalized/distinct, beta is nontrivial, isoactivity and mass balance close, and split Gibbs is lower than homogeneous Gibbs by more than the declared tolerance.

This finite lattice/local-refinement TPD screen is deliberately described as multistart no-negative-trial, **not a mathematical proof of global optimality**. Tolerances: TPD 1e-8, isoactivity 1e-8, material balance 1e-10, minimum phase fraction 0.001, and minimum phase distance 0.00001.

SN300 homogeneous TPD minimum: -0.018700725981606218; split common-tangent TPD minimum: -5.992317031871644e-11.

## Aljimaz 2006 supported ternary benchmark

| Temperature (K) | Rows | Accepted | RMSD | Max error |
|---:|---:|---:|---:|---:|
| 293.2 | 10 | 10 | 0.053176 | 0.140465 |
| 303.2 | 9 | 9 | 0.080125 | 0.220405 |
| 313.2 | 8 | 8 | 0.080096 | 0.225036 |
| 323.2 | 8 | 8 | 0.094194 | 0.256329 |

## Unsupported analogue inventory

- Fahim 2005 (106 rows, propylbenzene): **NOT_CALCULABLE_MISSING_REQUIRED_DORTMUND_SUBGROUP** — required alkyl-aromatic subgroup is outside the frozen subset.
- Fandary 2006 (78 rows, pentylbenzene): **NOT_CALCULABLE_MISSING_REQUIRED_DORTMUND_SUBGROUP** — required alkyl-aromatic subgroup is outside the frozen subset.

## Stage 1 selectable-temperature applicability

| °C | Evidence | Prediction policy |
|---:|---|---|
| 25 | DIRECT_FIVE_COMPONENT_COTO_EVIDENCE_AT_298_15_K | PREDICTIVE/PRELIMINARY within direct five-component benchmark temperature |
| 30 | DIRECT_TERNARY_ALJIMAZ_ANALOGUE_ONLY; FIVE_COMPONENT_EXTRAPOLATED | EXTRAPOLATED prediction allowed when parameters and physical solve pass |
| 40 | DIRECT_TERNARY_ALJIMAZ_ANALOGUE_ONLY; FIVE_COMPONENT_EXTRAPOLATED | EXTRAPOLATED prediction allowed when parameters and physical solve pass |
| 50 | DIRECT_TERNARY_ALJIMAZ_ANALOGUE_ONLY; FIVE_COMPONENT_EXTRAPOLATED | EXTRAPOLATED prediction allowed when parameters and physical solve pass |
| 60 | NO_DIRECT_LOCAL_ANALOGUE; FIVE_COMPONENT_EXTRAPOLATED | EXTRAPOLATED prediction allowed when parameters and physical solve pass |
| 70 | NO_DIRECT_LOCAL_ANALOGUE; FIVE_COMPONENT_EXTRAPOLATED | EXTRAPOLATED prediction allowed when parameters and physical solve pass |
| 80 | NO_DIRECT_LOCAL_ANALOGUE; FIVE_COMPONENT_EXTRAPOLATED | EXTRAPOLATED prediction allowed when parameters and physical solve pass |
| 90 | NO_DIRECT_LOCAL_ANALOGUE; FIVE_COMPONENT_EXTRAPOLATED | EXTRAPOLATED prediction allowed when parameters and physical solve pass |
| 100 | NO_DIRECT_LOCAL_ANALOGUE; FIVE_COMPONENT_EXTRAPOLATED | EXTRAPOLATED prediction allowed when parameters and physical solve pass |

## SN300 50 C predicted mole fractions

| Component | Raffinate | Extract |
|---|---:|---:|
| n-dodecane | 0.688278936436 | 0.059687167152 |
| 1,4-xylene | 0.049276855400 | 0.039584556542 |
| 1-methylnaphthalene | 0.015078930852 | 0.021410153686 |
| pyrene | 0.002621179561 | 0.009565055573 |
| NMP | 0.244744097750 | 0.869753067046 |
