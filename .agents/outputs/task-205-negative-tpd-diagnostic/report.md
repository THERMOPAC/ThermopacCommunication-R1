# Task 205 — Isolated negative-TPD diagnostic

Research-only; calibration required; not pilot validated or release eligible.

| Scenario | Helper TPD | independent SLSQP | Base-only TPD | Residual term | Classification |
|---|---:|---:|---:|---:|---|
| Scenario 1 | -0.725504437 | -0.76145693 | 2.72182877 | -3.44733321 | RESIDUAL_AMENDMENT_DRIVEN |
| Scenario 2 | -0.662935361 | -0.698981934 | 2.93032671 | -3.59326207 | RESIDUAL_AMENDMENT_DRIVEN |
| Scenario 3 | -0.594169875 | -0.630943203 | 3.09789442 | -3.69206429 | RESIDUAL_AMENDMENT_DRIVEN |

## Track A — exact direct-NT7 multistart continuation

| Scenario | persisted secondary (20) | continued sparse | dense/standard | disposition |
|---|---:|---:|---:|---|
| Scenario 1 | 0.00118749 | 0.000650146 | 0.000199688 | UNRESOLVED |
| Scenario 2 | 0.00110057 | 0.000712411 | 0.000216537 | UNRESOLVED |
| Scenario 3 | 0.00108434 | 0.000583928 | 0.000204609 | UNRESOLVED |

The exact 20-evaluation secondary residuals and product differences reproduce the immutable artifact. Continued solves use the same start lineage; stage/equation-family maxima and RMS values are machine-readable.

## Track B — phase stability

The six-variable constrained SLSQP uses a dimensionally correct independently finite-differenced Jacobian and projected KKT test. Two same-composition algebraic assembly paths agree but share the same activity kernel; this excludes an observed algebraic mismatch, not every possible implementation defect. The lower optimized MONO-rich basin is reported as search incompleteness.

The constrained direct calculation and tangent-plane identity are recorded per scenario in `results.json`.
Lower-Gibbs stationary splits of the isolated extract phases are phase-metastability evidence only. No full alternate closed cascade branch is claimed.

## Root-cause synthesis

INDEPENDENT_EVIDENCE_TRACKS_UNRESOLVED: secondary cascade starts remain unclosed, so no causal link to the residual-driven phase instability is demonstrated.
