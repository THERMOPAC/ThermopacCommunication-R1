---
name: Pre-pilot seven-component qualification roadmap
description: Governing execution and stability boundaries for the physics-based NMP/H2O pre-pilot predictor.
---

This application is a pre-pilot engineering simulator. Execute the explicit seven-component molecular/thermodynamic model directly from governed Stage-1 process and property inputs. Experimental wet NMP/RRBO LLE evidence is not an execution prerequisite and the user must not be asked to upload it.

**Why:** The purpose is to produce the strongest physics-based prediction before pilot testing, when direct wet equilibrium evidence is expected to be unavailable. Future pilot evidence may calibrate or validate the model but cannot be a present execution blocker.

**How to apply:** Preserve assumptions, equations, parameter sources, tolerances, provenance, and immutable engine hashes. Label outputs PRE-PILOT PREDICTIVE MODEL or PRE-PILOT PREDICTION, not research-only or validation-pending solely because experimental data are absent.

Thermodynamic stability remains fail-closed. A single contact must produce distinct oil-rich and NMP/H2O-rich phases, positive phase amounts, negative split Gibbs reduction, chemical-potential and material closure, globally stable daughters under the governed TPD search, no false MONO-rich basin, and reproducible branch selection before N_T = 1–10 may be interpreted.

**Why:** Removing the experimental-evidence blocker must not permit a mathematically artificial split or revive the historical residual that generated a false lower-Gibbs MONO-rich basin.

**How to apply:** Do not tune cascade numerics to manufacture phase separation. First establish physically admissible single-contact LLE from the strongest available molecular and literature basis; then run the simultaneous cascade and report pre-pilot predictions. Future pilot comparison is a later lifecycle step.