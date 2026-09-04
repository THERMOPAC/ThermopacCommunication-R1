# 3 wt% water 7C daughter-state TPD A/B replay

## Scope

- Source job: `cd5d9f6e-1340-4da0-a9a2-1e29d2617258`
- Trials: 10 (`N_T = 1…10`)
- Persisted stages: 55
- Daughter states: 110
- A: native seven-component cCOSMO only
- B: native seven-component cCOSMO plus inherited six-component residual amendment
- Cascade equations, daughter states, search threshold, and acceptance logic were not changed.

## Result

- Native A negative states: **0 / 110**
- Native A stable or near-zero states: **110 / 110**
- Residual-added B negative states: **110 / 110**
- Maximum absolute difference between independently replayed B objective and persisted B minimum: **1.288e-14**
- Native A minimum range: **-1.11869e-14 to 8.77777e-15**
- Residual-added B minimum range: **-0.781736 to -0.307462**
- Native A minimizers reproduce their reference daughter states: maximum composition L1 difference **1.869e-08**.
- Under native A, the B minimizers have positive TPD: **2.16861 to 3.10532**.
- Residual-added B minimizers are uniformly MONO-rich: **89.337142% to 95.530548% MONO**.
- Other B-minimizer ranges: SAT 0.150209%–0.247342%; NMP 1.753747%–2.797297%; H2O 0.468049%–6.401279%.
- Mean L1 distance between A and B minimizers: **1.763554**.

**Diagnostic conclusion:** `SAME_INHERITED_6C_RESIDUAL_NEGATIVE_BASIN_PROPAGATED_INTO_WET_7C`

## Per-trial extrema

| N_T | states | A min | A max | B min | B max |
|---:|---:|---:|---:|---:|---:|
| 1 | 2 | 0 | 0 | -0.670603 | -0.670603 |
| 2 | 4 | -1.33137e-16 | 5.69707e-16 | -0.745373 | -0.574301 |
| 3 | 6 | -1.72047e-16 | 0 | -0.764445 | -0.501363 |
| 4 | 8 | -1.11869e-14 | 0 | -0.771879 | -0.446508 |
| 5 | 10 | 0 | 8.77777e-15 | -0.775558 | -0.405234 |
| 6 | 12 | -1.81451e-15 | 0 | -0.777716 | -0.374064 |
| 7 | 14 | -4.12851e-15 | 1.44055e-16 | -0.779159 | -0.350389 |
| 8 | 16 | 0 | 0 | -0.780219 | -0.332277 |
| 9 | 18 | -3.15819e-15 | 2.17934e-15 | -0.781053 | -0.318313 |
| 10 | 20 | -5.25652e-15 | 8.82537e-16 | -0.781736 | -0.307462 |

The complete state compositions, minima, minimizers, cross-model objective values, and source hashes are retained in `evidence.json`.
