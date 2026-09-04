---
name: Additive thermodynamic amendments
description: Scientific integrity rules for separately versioned excess-Gibbs corrections layered on a native activity model.
---

A model described as native-plus-amendment must evaluate \(g_\mathrm{total}=g_\mathrm{native}+\Delta g\) in fitting, flash, Gibbs minimization, and every TPD route. Never define \(\Delta g\) by subtracting the native surface or encode desired daughter phases as constructed wells. Use one scalar, integrable excess-Gibbs basis and derive its partial-molar correction from that scalar.

**Why:** A target-well construction can reproduce a requested split and remove a known false basin while silently cancelling the native model and bypassing actual evidence fitting. Self-consistent closure and TPD results from that constructed surface do not validate the claimed native interaction model.

**How to apply:** Quantify training and held-out evidence residuals, classify fitted water-bearing targets as development-only, reconstruct scalar-Gibbs derivatives independently, require negative parent TPD/Gibbs reduction, compare genuinely different split solvers, and keep finite-search stability wording distinct from global proof.