---
name: Pre-pilot seven-component multistage roadmap
description: Governing execution and stability boundaries for the simultaneous NMP/H2O counter-current predictor.
---

This application is a pre-pilot engineering simulator. Execute the explicit seven-component molecular/thermodynamic model directly from governed Stage-1 process and property inputs. Experimental wet NMP/RRBO LLE evidence is not an execution prerequisite and the user must not be asked to upload it.

**Why:** The purpose is to produce the strongest physics-based prediction before pilot testing, when direct wet equilibrium evidence is expected to be unavailable. Future pilot evidence may calibrate or validate the model but cannot be a present execution blocker.

**How to apply:** Preserve assumptions, equations, parameter sources, tolerances, provenance, and immutable engine hashes. Label outputs PRE-PILOT PREDICTIVE MODEL or PRE-PILOT PREDICTION, not research-only or validation-pending solely because experimental data are absent.

The authoritative model is the simultaneous seven-component counter-current cascade for N_T = 1–10. N_T = 1 is the one-stage member of that same engine, not a separate governing flash or qualification model. Every stage solves equilibrium inside the coupled cascade while internal raffinate and extract streams propagate counter-currently between the RRBO-feed and wet-solvent boundaries.

**Why:** An isolated parent composition can be homogeneous while the actual coupled counter-current trajectory visits different stage compositions. A separate single-contact gate could incorrectly stop the authoritative multistage matrix. Removing that gate must still not permit artificial splits or revive the false lower-Gibbs MONO-rich basin.

**How to apply:** Attempt the complete governed N_T = 1–10 matrix where numerically possible. For each trial require simultaneous closure, positive phase flows, chemical-potential and material closure, stage TPD stability, reproducible branches, stream consistency, and credible NMP/H2O and aromatic movement. Classify collapsed stages/trials as NO_PHYSICAL_LLE and continue the matrix; never accept identical labelled phases as extraction. Isolated flash and parent-state TPD analyses are diagnostic only. Assign Predictive N_T only from a multistage trial satisfying every governing criterion.