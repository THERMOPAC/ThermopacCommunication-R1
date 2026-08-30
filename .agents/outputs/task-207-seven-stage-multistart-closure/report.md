# Seven-stage multistart closure diagnosis

**Research-only; governed equations, limits, and official stage conclusions are unchanged.**

| Scenario | Best strategy | max residual | balance max | isoactivity max | product difference | disposition |
|---|---|---:|---:|---:|---:|---|
| Scenario 1 | BOUNDED_ROW_EQUILIBRATED_DAMPED_NEWTON | 5.11893e-11 | 1.01018e-11 | 5.11893e-11 | 7.5966e-12 | REACHED_PRIMARY_BRANCH |
| Scenario 2 | BOUNDED_ROW_EQUILIBRATED_DAMPED_NEWTON | 1.40354e-10 | 2.9363e-11 | 1.40354e-10 | 2.18053e-11 | REACHED_PRIMARY_BRANCH |
| Scenario 3 | BOUNDED_ROW_EQUILIBRATED_DAMPED_NEWTON | 2.91657e-10 | 6.19918e-11 | 2.91657e-10 | 4.56969e-11 | REACHED_PRIMARY_BRANCH |

## Structural diagnostics

### Scenario 1
- Numerical rank: 84/84 (relative threshold 1.0e-10).
- Condition number: 627392.
- Row-norm ratio: 144151; column-norm ratio: 2.89473.
- Active bounds: 0.
- Disposition: **REACHED_PRIMARY_BRANCH** — At least one unchanged-equation strategy closed and matched the persisted primary boundary products.

### Scenario 2
- Numerical rank: 84/84 (relative threshold 1.0e-10).
- Condition number: 647615.
- Row-norm ratio: 145042; column-norm ratio: 2.84783.
- Active bounds: 0.
- Disposition: **REACHED_PRIMARY_BRANCH** — At least one unchanged-equation strategy closed and matched the persisted primary boundary products.

### Scenario 3
- Numerical rank: 84/84 (relative threshold 1.0e-10).
- Condition number: 716447.
- Row-norm ratio: 157622; column-norm ratio: 2.77917.
- Active bounds: 0.
- Disposition: **REACHED_PRIMARY_BRANCH** — At least one unchanged-equation strategy closed and matched the persisted primary boundary products.

Sparse continuation, the inherited dense exact trust-region run, and row-equilibrated damped Newton all evaluate the identical residual function.
A rank-deficient endpoint Jacobian or active bound is reported only as a local linearization obstruction, never as proof of global infeasibility; poor conditioning alone is reported without claiming impossibility.
Phase stability is outside this audit and no causal relationship is asserted.
