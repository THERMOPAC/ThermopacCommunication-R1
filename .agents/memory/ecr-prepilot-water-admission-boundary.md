---
name: ECR Pre-Pilot water admission boundary
description: Governs whether Stage-1 solvent water may enter predictive COSMO-SAC as a seventh component.
---

Stage-1 water is a deliberate controlled addition to the NMP/H₂O extraction-solvent formulation, not an impurity. Both NMP purity wt% and water-in-NMP wt% are governed Stage-1 user inputs linked by exact 100 wt% closure; selecting either updates the other.

**Why:** Both values define the controlled wet-solvent formulation. Treating purity as a derived display-only value would hide one of the user's governed formulation choices, while allowing them to diverge would violate mass closure.

**How to apply:** Persist both values in the immutable Stage-1 snapshot and bind both into every successor-engine job contract. Use “controlled water addition,” “water content of extraction solvent,” or “NMP/H₂O solvent formulation,” never “water impurity.”

The seven-component engine is an extension of the exact assembled six-component thermodynamic basis, not a replacement with bare native cCOSMO. It must preserve the six molecular identities/profiles, native kernel, and unchanged nine-parameter `PROJECT_NMP_LLE_RESIDUAL`; only H₂O is added.

**Why:** Removing the residual amendment erased the negative-TPD basin even with H₂O absent, confounding model replacement with water addition. Water effects are interpretable only after the dry extension reproduces the assembled 6C model.

**How to apply:** Verify inheritance at the code/model-component level: identical six profiles/native kernel and exact residual parameters/equation. Never execute or label H₂O=0 as 7C. Apply the old residual to the normalized first-six submixture; H₂O has no new residual correction until separately governed.

The assembled seven-component engine is the production successor architecture for all new controlled-water jobs, but its outputs remain **IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING**, never release-eligible or an assigned Predictive N_T.

**Why:** A traceable H₂O sigma3 profile and complete seven-component numerical path establish implementation readiness, but no direct water-bearing multicomponent LLE evidence yet qualifies partition, selectivity, phase topology, temperature dependence, or global stability. A valid molecular profile and converged solver are not equilibrium validation.

**How to apply:** Run new wet-solvent jobs only through the dry-limit-qualified assembled 7C extension and preserve honest flash/cascade diagnostics, including stable-single-phase or unresolved-split outcomes. Admit an N_T only after governed water-bearing equilibrium evidence, blind validation, mass/mole closure, local stability, global TPD, and self-consistent cascade qualification.

For the seven-component qualification path, S/O is governed as total wet-solvent mass divided by RRBO feed mass:

\[
S/O=\frac{m_{\mathrm{NMP}}+m_{\mathrm{H_2O}}}{m_{\mathrm{RRBO}}}
\]

The Stage-1 water wt% splits the fixed total wet-solvent flow between dry NMP and water. Water is never added on top of the S/O-derived solvent flow.

**Why:** This preserves the selected solvent loading and prevents double-counting water when moving from the six-component dry-solvent representation to an explicit seven-component wet-solvent representation.

**How to apply:** Calculate total wet solvent first, then derive dry NMP and water from the selected water mass fraction. Persist and report total wet-solvent mass flow, dry NMP mass flow, and water mass flow separately.

The 0.5–3.0 wt% formulation range is a sensitivity variable. The model must determine whether water improves or worsens selectivity, aromatic and polar-aromatic removal, recovery, NMP carryover, phase topology, global stability, and stage performance; no beneficial effect or optimum may be encoded in advance.

The available direct water–NMP–hydrocarbon source measures VLE and infinite-dilution activity for light C5/C6 hydrocarbons at 90–140 °C. It is training-context evidence only, not water-bearing LLE validation. Dry NMP ternary tie lines also cannot validate the wet-solvent model.

**Why:** Neither source provides governed coexisting-liquid compositions for controlled-water extraction. Without closed water-bearing tie lines, water partition and selectivity are not testable, phase topology and temperature transfer are not qualified, and numerical TPD searches remain research diagnostics rather than experimental validation.

**How to apply:** Count bibliography sources separately from governed numeric records. Keep the blind partition reserved and empty until independently held-out water-bearing tie lines are acquired; do not interpret an empty blind set as a passed blind validation.

The pre-pilot thermodynamic model must explicitly represent the controlled NMP + H₂O solvent formulation. Dry NMP is only a diagnostic zero-water limiting case, never the operating predictive model. Experimental wet LLE evidence is not required to execute the pre-pilot predictor.

**Why:** Stage 1 already governs the wet solvent and operating properties, while the simulator is intended to predict before pilot data exist. Absence of experimental wet tie-lines is expected and must not be presented as an execution blocker.

**How to apply:** Execute the explicit SAT + MONO + DI + POLY + PA + NMP + H₂O formulation from governed Stage-1 inputs. Use dry calculations only to isolate baseline interaction errors. Keep strict split, closure, Gibbs-reduction, daughter-stability, no-false-basin, and branch-reproduction gates.