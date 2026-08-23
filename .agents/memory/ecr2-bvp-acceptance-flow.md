---
name: ECR-2 BVP acceptance flow
description: Numerical residual closure alone cannot accept an ECR-2 BVP result; terminal column balances are independent acceptance gates.
---

An ECR-2 BVP may report a small local normalized residual before its terminal
five-component and total mass balances have closed. A successful solve must
require normalized residual, relative state change, maximum component balance,
and total balance to all pass their existing limits; the final result mapping
must repeat those checks.

**Why:** Local compartment residuals can be within tolerance while the
accumulated terminal face imbalance remains materially above the strict column
closure limits. Stopping at that point yields a rejected result after the
solver has already declared success.

**How to apply:** When changing solver termination, continuation, or result
serialization, calculate global balance from the terminal face flows using the
same immutable limits. Continue feasible iterations when only global closure
is pending, and retain a structured non-convergence reason if the remaining
budget or trust-region rules prevent closure. Never solve this by loosening a
tolerance or modifying ECR-2 physical equations. The state-change metric is
already normalized, so compare it directly with its dimensionless relative
tolerance; do not scale that limit by the flow-state magnitude.