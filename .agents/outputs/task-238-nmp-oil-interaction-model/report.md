# Task 238 NMP/oil interaction model

**Research-only, separately versioned, not Predictive N_T or release eligible.**

The replacement is one thermodynamically integrable scalar model: `g_total/RT = g_native_7C/RT + delta_g_RK/RT`. Native seven-component cCOSMO remains in every fit, flash, Gibbs, and TPD evaluation. The additive Redlich–Kister interaction has 48 bounded coefficients over eight declared pairs and three polynomial orders.

All 219 declared dry rows were partitioned before fitting (175 training, 44 held out). Training chemical-potential RMS is 0.135177; held-out RMS is 0.139664. The historical water-bearing N_T=1 row is an explicitly declared development calibration row, not direct or blind qualification.

At the exact 3 wt% water parent, the fitted model has negative TPD toward both development branches (-1.000000e-05, -9.790750e-02) and a two-phase Gibbs reduction of -4.251545e-02. Independent phase-mole Gibbs and common-tangent routes agree with maximum phase-composition difference 2.788e-11 and beta difference 1.395e-11. Material closure is 1.110e-16; the chemical-potential residual is 8.660e-15. The raffinate is oil/SAT-rich and the extract is NMP-rich, with positive phase and component amounts.

Full-simplex lattice, interior global, every face, every edge, and phase-local searches found no negative post-split TPD. A separately constrained MONO-rich search over x_MONO >= 0.5 included the persisted historical false-basin seed and found no negative basin. These are declared finite-search findings, not a mathematical global proof.

**FAIL CLOSED.** The dry held-out evidence gate remains failed, and direct plus blind water-bearing LLE evidence are absent. Frozen 7C-1.2.0 and 7C-1.3.0 engines/workers, production routing, cascade solver, and TPD thresholds are unchanged.
