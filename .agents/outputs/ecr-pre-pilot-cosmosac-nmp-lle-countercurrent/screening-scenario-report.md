# Alternative Product-Gate Screening Scenario

**Scenario only — official targets, frozen protocol, acceptance gates, and governed results are unchanged.**

## Screening limits

The following strict screening limits are applied to the existing diagnostic product values:

- NMP in total raffinate: **< 6.5 wt%**
- Total aromatics in NMP-free raffinate hydrocarbons: **< 1.5 wt%**
- Polar aromatics in NMP-free raffinate hydrocarbons: **< 0.1 wt%**

A row passes the product screen only when all three inequalities pass. Product-screen attainment is not thermodynamic or numerical acceptance.

## 25°C

| NT | NMP wt% | NMP gate | Aromatics wt% | Aromatics gate | PA wt% | PA gate | All screening gates |
|---:|---:|:---:|---:|:---:|---:|:---:|:---:|
| 1 | 6.9034 | FAIL | 6.9873 | FAIL | 0.6680 | FAIL | **FAIL** |
| 2 | 6.4967 | PASS | 4.4514 | FAIL | 0.2463 | FAIL | **FAIL** |
| 3 | 6.2953 | PASS | 3.0940 | FAIL | 0.0934 | PASS | **FAIL** |
| 4 | 6.1782 | PASS | 2.2705 | FAIL | 0.0356 | PASS | **FAIL** |
| 5 | 6.1031 | PASS | 1.7299 | FAIL | 0.0136 | PASS | **FAIL** |
| 6 | 6.0517 | PASS | 1.3549 | PASS | 0.0052 | PASS | **PASS** |
| 7 | 6.0150 | PASS | 1.0842 | PASS | 0.0020 | PASS | **PASS** |
| 8 | 6.0059 | PASS | 1.0226 | PASS | 0.0020 | PASS | **PASS** |
| 9 | 5.9987 | PASS | 0.9730 | PASS | 0.0020 | PASS | **PASS** |
| 10 | 5.9941 | PASS | 0.9417 | PASS | 0.0020 | PASS | **PASS** |

**Screening result:** The first diagnostic stage count meeting all three alternative product limits is **NT = 6**.

This is not an accepted theoretical-stage requirement. At NT = 6 the primary equations close, but the second deterministic start does not close and the governed phase-stability requirements do not pass. NT = 8–10 additionally fail primary coupled-equation closure.

## 50°C

| NT | NMP wt% | NMP gate | Aromatics wt% | Aromatics gate | PA wt% | PA gate | All screening gates |
|---:|---:|:---:|---:|:---:|---:|:---:|:---:|
| 1 | 10.1845 | FAIL | 6.8674 | FAIL | 0.6754 | FAIL | **FAIL** |
| 2 | 9.6076 | FAIL | 4.1432 | FAIL | 0.2400 | FAIL | **FAIL** |
| 3 | 9.3252 | FAIL | 2.7003 | FAIL | 0.0864 | PASS | **FAIL** |
| 4 | 9.1661 | FAIL | 1.8522 | FAIL | 0.0311 | PASS | **FAIL** |
| 5 | 9.0680 | FAIL | 1.3172 | PASS | 0.0112 | PASS | **FAIL** |
| 6 | 9.0037 | FAIL | 0.9621 | PASS | 0.0040 | PASS | **FAIL** |
| 7 | 8.9598 | FAIL | 0.7174 | PASS | 0.0014 | PASS | **FAIL** |
| 8 | 8.9553 | FAIL | 0.6943 | PASS | 0.0014 | PASS | **FAIL** |
| 9 | 8.9531 | FAIL | 0.6836 | PASS | 0.0014 | PASS | **FAIL** |
| 10 | 8.9475 | FAIL | 0.6545 | PASS | 0.0014 | PASS | **FAIL** |

**Screening result:** No diagnostic trial through **NT = 10** meets all three alternative limits. NMP carryover is the controlling failed screen.

## Interpretation and governance

- At 25°C, the calculated product values first cross all alternative limits at NT = 6.
- At 50°C, no calculated stage count through NT = 10 crosses the NMP limit.
- These are screening observations from non-accepted cascade branches, not validated design predictions.
- No row is promoted to an accepted theoretical-stage result.
- The official product targets and the original governed report remain unchanged.
- The model remains research-only, calibration-required, non-pilot-validated, non-release-eligible, and `NOT_QUALIFIED`.
- Sulfur remains `NOT_CALCULABLE`; polar aromatics are not a sulfur surrogate.