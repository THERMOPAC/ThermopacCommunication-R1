# Fresh regularization-constrained ECR Pre-Pilot NRTL regression

**Final decision: REJECT**

This #168 solver-isolation execution loads a checked-in frozen 26-value parameter vector and does not call fitting. Its IEEE-754 binary64 SHA-256 is `ecaf60082eefec144c106f6697cd6650aab69b3b8fa07fb1d62bad5ac9da1d34`. Polar Aromatics is null. It makes no sulfur-removal claim.

SciPy 1.14.1/NumPy 2.1.3 from `server/research/ecr-pre-pilot-cosmors/vendor/python` perform bounded least squares, full-simplex TPD refinement, and conserved-amount multistart Gibbs flashes. No COSMO or other thermodynamic code is imported. Train equilibrium residual RMS/max is 0.157381/0.578695; holdout is 0.13031/0.331443.

All 219 analogue rows preserve exact SAT/MONO/NMP structural zeros and use all 45 denominator-8 ternary lattice points. Coto uses all five families and all 70 denominator-4 points. Train categories are two-phase 189, stable 0, nonconverged/boundary 32; holdout categories are 9, 0, and 6, respectively. Nonconvergence is not called a topology failure.

The five-family candidate holdout topology recall 0.6 **fails** the 0.90 gate, while composition RMSD 0.128934 **fails** the 0.03 gate. This rejects this specific frozen form, not all NRTL.

The governing six-family Stage 2 status is **NOT_CALCULABLE** and governing admission is ineligible regardless of numerical metrics: Polar Aromatics is unresolved, sulfur representation where required is unresolved, and applicable DI/POLY temperature evidence is absent. DI/POLY are not predicted at 50, 75, or 100 C. Phase amounts were unavailable, so midpoint validation is not measured phase-split validation.
