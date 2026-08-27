# Independent equation-level implementation audit

Overall implementation audit: **PASS**

The fitted parameter vector and 221/15 train/holdout split were frozen. An independent column/vector NRTL implementation was compared with the primary implementation over experimental, flash, structural-zero ternary, temperature, and interior-probe states. Maximum ln-gamma difference was 1.77636e-15.

All 212 accepted flashes carry homogeneous and selected two-phase reduced Gibbs values, Gibbs decrease, TPD minimum, isoactivity, and component closure. Aggregate isoactivity maximum is 8.09075e-15; mass-balance maximum is 1.11022e-16. Materially different starts independently reproduce each required canonical selected equilibrium within the frozen audit tolerances. All stationary candidates remain serialized; competing points are rejected by explicit thermodynamic admissibility checks or by the lower reduced-Gibbs selection rule.

Obligations: {"KKT_isoactivity": "PASS", "TPD_and_Gibbs": "PASS", "independentLngamma": "PASS", "massBalance": "PASS", "multistartAgreement": "PASS"}.

Implementation/flash-selection defects were not found within tested tolerances; this is not formal proof.
