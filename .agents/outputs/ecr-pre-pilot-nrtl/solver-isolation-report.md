# #168 solver-isolation stage 2

Frozen parameter SHA-256: `ecaf60082eefec144c106f6697cd6650aab69b3b8fa07fb1d62bad5ac9da1d34`. `fitCalled` is **false**.

Overall isolation status: **PASS**. Synthetic recovery: **PASS**. Independent final-phase checks: **PASS**; lowest refined post-split TPD is -1.0864005422753458e-15. Ambiguous required cases: 0.

Pre-holdout qualification status: **PASS** using only `coto-1, analogue-2, analogue-205`. These IDs are disjoint from the frozen holdout IDs. The holdout flash count remained zero until `PRE_HOLDOUT_ISOLATION_PASS` was recorded.

All 11045 TPD lattice states were evaluated; 1404 negative/competitive states were refined into 452 distinct refined basins, producing 3096 deterministic conserved-Gibbs starts. Primary, standalone final-gate, and audit clamp activations are 0, 0, and 0.

Gated holdout comparison: topology 0.6 (FAIL vs 0.90); composition RMSD 0.128934 (FAIL vs 0.03). This is finite-candidate evidence, not formal global-optimum proof.
