# Fresh regularization-constrained ECR Pre-Pilot NRTL regression

**Final decision: REJECT**

This isolated regularization-constrained estimation fits 26 values: a+b/T for six directed SAT/MONO/NMP interactions and isothermal 298.15 K tau for 14 directed interactions involving DI/POLY (b exactly zero). It is not an identifiability claim. The measurement-only Jacobian rank is 26/26, condition number 318376.91616018186, with 5 practically weak directions, 1 bound hit(s), and pseudo-standard errors up to 2915.46. These large uncertainties are explicitly flagged. Polar Aromatics is null. It makes no sulfur-removal claim.

SciPy 1.14.1/NumPy 2.1.3 from `server/research/ecr-pre-pilot-cosmors/vendor/python` perform bounded least squares, full-simplex TPD refinement, and conserved-amount multistart Gibbs flashes. No COSMO or other thermodynamic code is imported. Train equilibrium residual RMS/max is 0.157381/0.578695; holdout is 0.13031/0.331443.

All 219 analogue rows preserve exact SAT/MONO/NMP structural zeros and use all 45 denominator-8 ternary lattice points. Coto uses all five families and all 70 denominator-4 points. Train categories are two-phase 198, stable 0, nonconverged/boundary 23; holdout categories are 14, 0, and 1, respectively. Nonconvergence is not called a topology failure.

The five-family candidate holdout topology recall 0.933333 passes the 0.90 gate, while composition RMSD 0.114177 fails the 0.03 gate. This rejects this specific fresh fitted form, not all NRTL.

The governing six-family Stage 2 status is **NOT_CALCULABLE** and governing admission is ineligible regardless of numerical metrics: Polar Aromatics is unresolved, sulfur representation where required is unresolved, and applicable DI/POLY temperature evidence is absent. DI/POLY are not predicted at 50, 75, or 100 C. Phase amounts were unavailable, so midpoint validation is not measured phase-split validation.
