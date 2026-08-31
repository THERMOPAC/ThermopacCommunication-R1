# Predictive N_T multistart closure resolution

**Research-only · unchanged equations and tolerances · phase stability not evaluated**

Reference job: `00d1468d-7130-41ff-b897-3b6b6303047e` (Project 170)

| N_T | Primary termination | Primary residual | Secondary termination | Secondary residual | Branch difference | Numerical blockers |
|---:|---|---:|---|---:|---:|---|
| 1 | GTOL | 2.77556e-14 | MAX_NFEV | 4.35954e-09 | 5.15124e-09 | None |
| 2 | GTOL | 1.9984e-14 | GTOL | 1.37668e-14 | 1.10269e-15 | None |
| 3 | GTOL | 3.33067e-14 | GTOL | 2.69784e-14 | 1.50665e-15 | None |
| 4 | GTOL | 3.88578e-14 | MAX_NFEV | 1.65687e-10 | 3.75133e-10 | None |
| 5 | GTOL | 5.50227e-13 | RESIDUAL_CLOSURE | 6.05396e-10 | 9.86644e-11 | None |
| 6 | GTOL | 6.70575e-14 | RESIDUAL_CLOSURE | 2.3137e-12 | 3.61907e-13 | None |
| 7 | GTOL | 3.38618e-14 | RESIDUAL_CLOSURE | 1.44316e-09 | 2.31691e-10 | None |
| 8 | RESIDUAL_CLOSURE | 1.81268e-09 | RESIDUAL_CLOSURE | 1.14323e-10 | 2.71097e-10 | None |
| 9 | RESIDUAL_CLOSURE | 9.05764e-12 | RESIDUAL_CLOSURE | 8.92326e-09 | 1.4228e-09 | None |
| 10 | RESIDUAL_CLOSURE | 2.73506e-11 | RESIDUAL_CLOSURE | 1.03473e-11 | 2.03709e-12 | None |

## Conclusion

- All primary and secondary endpoints closed at or below 1e-8: **True**.
- All closed endpoints reproduced boundary products at or below 1e-6: **True**.
- Numerical multistart blockers remaining: **False**.
- Optimizer termination is retained separately from residual closure.
- An unclosed endpoint is never classified or compared as a branch.
- TPD stability, thermodynamic qualification, sulfur prediction, and release eligibility are unchanged.
