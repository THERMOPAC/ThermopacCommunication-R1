# ECR Pre-Pilot Stage 2 Thermodynamic Model Selection

## 1. Purpose and scope

This proposal defines how the ECR Pre-Pilot Design will select and govern its
liquid-liquid equilibrium (LLE) model.

The governing rule is:

> Select the model that reproduces the relevant ECR Pre-Pilot LLE evidence
> reliably over the declared temperature, composition, pressure, and component
> domain.

No model is mandatory by name. NRTL may be evaluated as one candidate, but the
Pre-Pilot Design must not be built around NRTL unless it passes the same
evidence requirements as every other candidate.

This document is limited to the ECR Pre-Pilot Design. It does not use or inherit
legacy LLX routes, parameter sets, validation decisions, fallback behavior, or
calculation code.

No thermodynamic production code is authorized by this proposal.

---

## 2. Fixed Pre-Pilot component basis

All Stage 2 thermodynamic vectors use this six-component order:

| Index | Component family | Current status |
|---:|---|---|
| 1 | Saturates | Partially covered by public surrogate data |
| 2 | Mono-aromatics | Partially covered by public surrogate data |
| 3 | Di-aromatics | Partially covered by public surrogate data |
| 4 | Poly-aromatics | Partially covered by public surrogate data |
| 5 | Polar aromatics | Exact molecular anchor identified; thermodynamic closure blocked |
| 6 | NMP | Covered in several public LLE systems |

The four hydrocarbon families support hydrocarbon-only raffinate quality and
NMP-free RRBO recovery. Polar aromatics remain explicit and must not be folded
silently into mono-, di-, or poly-aromatics.

Sulfur removal is outside this Stage 2 thermodynamic basis. Aromatic transfer
must not be used to infer sulfur or DBT removal.

### 2.1 Bounded Polar Aromatics molecular anchor

The selected non-sulfur PA anchor is
**4,4'-bis(alpha,alpha-dimethylbenzyl)diphenylamine** (CAS 10081-67-1,
PubChem CID 82343, C30H31N, 405.58 g/mol, InChIKey
UJAWGGOCYUPCPS-UHFFFAOYSA-N). It is one exact alkylated-diphenylamine
antioxidant molecule, not an undefined commercial mixture and not a
sulfur-bearing species. Its use is limited to representing one bounded PA
partition coordinate; it does not characterize the complete RRBO polar
fraction.

Identity admission does not constitute thermodynamic admission. The reviewed
frozen molecular-pair UNIQUAC package has no directed PA pair parameters, the
reviewed Dortmund subset has no admitted aromatic-secondary-amine subgroup and
complete directed interaction closure, and the vendored COSMO libraries have
no exact profile for this alkylated molecule. The available unsubstituted
diphenylamine profile is not a valid substitute. Direct matching
PA/NMP/heavy-hydrocarbon LLE is also absent.

Accordingly, positive-PA feeds fail closed with
`POLAR_AROMATICS_THERMODYNAMIC_CLOSURE_UNAVAILABLE`. Six-component predictive
N_T and full-basis RRBO recovery remain `NOT_CALCULABLE`; sulfur remains
independently `NOT_CALCULABLE`. No temperature, composition, solvent-ratio,
pressure, or phase-region applicability is claimed until a reproducible PA
thermodynamic representation passes the existing physical checks.

The completed evidence review used the pre-declared gates in Section 8 against
the exact-identity record, frozen UNIQUAC pair inventory, published Dortmund
group/interaction inventory, vendored COSMO profile inventories, and direct LLE
registry. It found no exact molecular representation with complete directed
interactions and no matching two-phase PA/NMP/heavy-hydrocarbon measurements
over the requested 25–100 °C Stage 1 range. Hold-out composition reproduction
and phase-topology reproduction are therefore not testable, rather than failed
numerical fits. No PA-directed parameter is admitted. This is an evidence
unavailability result, not evidence of zero PA transfer or process
infeasibility.

---

## 3. Candidate LLE modelling approaches

### 3.1 Direct experimental local-composition regression

This category includes activity-coefficient models fitted to an approved
experimental dataset, including NRTL, UNIQUAC, or another documented
local-composition formulation.

#### Required evidence

- Measured equilibrium tie-lines for the declared component basis.
- Both phase compositions, not only a distribution coefficient.
- Phase amounts or a phase-split measurement where available.
- Temperature, pressure, feed composition, and solvent-to-oil ratio.
- Analytical uncertainty, repeatability, and sample provenance.
- Enough composition coverage to test both dilute and concentrated transfer.
- Multiple temperatures if the model will be used away from the data anchor.
- A pre-declared parameter form and fitting convention.
- Independent hold-out data not used during parameter fitting.

#### Strengths

- Can represent the actual measured system closely within the data domain.
- Parameters can be calibrated to the intended operating window.
- Tie-line and phase-split behavior can be tested directly.

#### Limitations

- A good fit does not prove validity outside the calibration domain.
- A five-component fit cannot establish the missing Polar Aromatics row and
  column.
- Parameters fitted to pure-compound surrogates cannot automatically be used
  for physical RRBO pseudo-components.

#### Admission rule

Admit only if the fitted model passes the common validation protocol in Section
6 and has an explicit applicability range. The model name alone is not an
admission criterion.

---

### 3.2 Group-contribution prediction

This category includes UNIFAC and documented variants such as modified UNIFAC
forms, provided that the required functional-group parameters and temperature
rules are available for every component.

#### Required evidence

- Exact molecular or pseudo-component identities.
- Functional-group decomposition for every component.
- A complete set of group-interaction parameters for the relevant groups.
- The parameter source, version, temperature range, and known limitations.
- Independent experimental LLE data for the same or closely related systems.
- A defined treatment for components or groups absent from the selected
  parameter library.
- Validation against phase compositions, not only qualitative selectivity.

#### Strengths

- Can provide a prediction route before a complete bespoke parameter fit
  exists.
- May cover more chemical families than a sparse direct regression.
- The group basis can expose which interactions are unsupported.

#### Limitations

- Group-contribution coverage does not prove accuracy for RRBO families.
- Predictions for polar or highly fused aromatic families may be sensitive to
  group definitions and missing interactions.
- A model with no fitted project data remains predictive and must be labelled
  accordingly.

#### Admission rule

It may support a preliminary predictive route only when all required groups are
defined and the model passes the common validation protocol on relevant
external data. Unsupported groups or unvalidated extrapolation return
`NOT_CALCULABLE`.

---

### 3.3 COSMO-based prediction

This category includes COSMO-RS, COSMO-SAC, or an equivalent documented
quantum-chemistry-derived activity-coefficient route.

#### Required evidence

- A defensible molecular identity for every component.
- Validated sigma-profile or equivalent molecular representation.
- Consistent quantum-chemistry level and software/model version.
- Pure-component and mixture calculation settings.
- Evidence that the solvent and representative hydrocarbon families are
  supported by the selected implementation.
- Independent LLE data for calibration-free validation.
- Uncertainty assessment for pseudo-components and classes that lack a unique
  molecular identity.

#### Strengths

- Can provide a route for chemically defined components without fitting every
  binary pair.
- May be useful for screening alternative polar-aromatic representatives.
- Can provide an independent benchmark against empirical regressions.

#### Limitations

- It cannot resolve an undefined pseudo-component.
- A single representative molecule may not represent a broad RRBO family.
- Prediction uncertainty can be large for heavy, fused, or multifunctional
  aromatic families.
- Software and quantum-chemistry settings are part of the model identity.

#### Admission rule

Use only with explicit molecular identities and a declared uncertainty. A
COSMO-based result may be preliminary unless it reproduces relevant measured
LLE data over the intended domain.

---

### 3.4 Hybrid direct-data plus predictive route

This route combines direct experimental calibration where evidence exists with a
predictive method for unsupported interactions or component families.

#### Required evidence

- A clear boundary identifying which interactions are direct-data based and
  which are predictive.
- Independent validation of the direct-data portion.
- Validation or uncertainty bounds for every predictive portion.
- A consistent thermodynamic basis across the combined model.
- No hidden parameter transfer between chemically different representatives.
- Sensitivity cases showing the impact of each unsupported interaction.
- A report identifying the evidence status of every output.

#### Strengths

- May be the most practical route for a pre-pilot simulator.
- Allows direct evidence to anchor the important interactions while exposing
  uncertainty for missing families.
- Avoids pretending that sparse data support a fully empirical six-component
  model.

#### Limitations

- The boundary between calibrated and predictive behavior must be explicit.
- Combining methods can create discontinuities or inconsistent phase behavior.
- The hybrid route must not hide an unsupported Polar Aromatics contribution.

#### Admission rule

Admit only as a labelled hybrid route with separate evidence status and
uncertainty for each portion. It must not be presented as fully validated
six-component thermodynamics unless six-component evidence supports that claim.

---

### 3.5 Reduced-order or distribution-coefficient surrogate

A reduced-order surrogate may be used for screening only if it is explicitly
derived from measured LLE data and does not claim to be a phase-equilibrium
model.

#### Required evidence

- Measured distribution coefficients or tie-lines over the intended
  composition and temperature range.
- A declared phase and component basis.
- A stated interpolation range.
- Independent validation at held-out conditions.
- A clear statement of which downstream quantities it cannot provide.

#### Admission rule

This route cannot replace the Stage 2 LLE calculation where phase compositions,
phase amounts, or local equilibrium driving forces are required. It may only
be used for a separately labelled screening result and must return
`NOT_CALCULABLE` outside its evidence domain.

---

## 4. Public and experimental evidence currently available

### 4.1 Direct five-component public evidence

Coto et al., *Fluid Phase Equilibria* 554 (2022) 113293,
[DOI 10.1016/j.fluid.2021.113293](https://doi.org/10.1016/j.fluid.2021.113293),
reports experimental LLE for a five-component surrogate system containing:

- n-Dodecane;
- mono-aromatic compounds, including xylene/toluene representatives;
- 1-methylnaphthalene;
- pyrene; and
- NMP.

The measurements are at approximately 298.15 K and atmospheric pressure.
This is useful direct evidence for a five-component surrogate benchmark. It
does not establish the sixth Polar Aromatics component, a complete Pre-Pilot
six-component model, or a temperature range from 25 to 100 °C.

The paper evaluates UNIFAC variants and does not by itself provide an approved
Pre-Pilot NRTL parameter package.

### 4.2 Public temperature-dependent analogue evidence

The following public datasets can inform analogue behavior for selected
subsystems:

- Aljimaz et al., *Fluid Phase Equilibria* 231 (2005) 163–170,
  [DOI 10.1016/j.fluid.2005.01.012](https://doi.org/10.1016/j.fluid.2005.01.012):
  alkane + propylbenzene + NMP systems over approximately 298–328 K.
- Fandary et al., *Journal of Chemical Thermodynamics* 38 (2006) 455–460,
  [DOI 10.1016/j.jct.2005.06.012](https://doi.org/10.1016/j.jct.2005.06.012):
  high-molar-mass alkane + pentylbenzene + NMP systems over approximately
  298–328 K.
- Aljimaz et al., *Journal of Chemical & Engineering Data* 51 (2006)
  1026–1030,
  [DOI 10.1021/je050513r](https://doi.org/10.1021/je050513r):
  hexadecane + mesitylene + NMP over approximately 293–323 K.

These datasets support selected alkane/mono-aromatic/NMP analogue checks. They
do not establish di-aromatic, poly-aromatic, or Polar Aromatics behavior for
the Pre-Pilot six-component basis.

### 4.3 Molecular-weight evidence

NIST Chemistry WebBook provides pure-compound molecular weights for the
five currently defined surrogate coordinates:

- n-Dodecane: 170.3348 g/mol;
- 1,4-xylene: 106.1650 g/mol;
- 1-methylnaphthalene: 142.1971 g/mol;
- pyrene: 202.2506 g/mol; and
- NMP: 99.1311 g/mol.

These values identify the pure-compound surrogate coordinates. They do not
establish physical RRBO pseudo-component MWs or define Polar Aromatics.

### 4.4 Modified UNIFAC (Dortmund) parameter-completeness review

The public `2026 Published Parameters` package has been reviewed for the
five-component surrogate basis. The detailed record is:

`docs/ecr-pre-pilot-dortmund-coverage-review.md`

The reviewed assignments require seven subgroups mapped to five main groups:
`[1] CH2`, `[3] ACH`, `[4] ACCH2`, `[42] CY-CH2`, and `[46] CY-CONC`.
All seven subgroup R/Q records and all twenty required ordered off-diagonal
main-group interactions are present.

The parameter-completeness result is therefore **PASS** for n-dodecane,
toluene or 1,4-xylene, 1-methylnaphthalene, pyrene, and NMP. No missing
interaction is zero-filled.

This finding establishes coverage only. The reviewed package does not state a
single global numeric temperature-validity interval for these components, and
the direct five-family Coto evidence is at 298.15 K. Quantitative LLE accuracy
and applicability over 25–100 °C remain unvalidated and must pass the common
validation protocol before design use.

---

## 5. Components that can presently be modelled

### 5.1 Presently modelable as a limited surrogate benchmark

The following can presently be used in a labelled, limited surrogate
benchmark:

- Saturates represented by n-dodecane;
- Mono-aromatics represented by an approved light aromatic surrogate;
- Di-aromatics represented by 1-methylnaphthalene;
- Poly-aromatics represented by pyrene; and
- NMP.

The benchmark is constrained by the evidence actually available. It is not a
claim that these pure compounds fully represent their RRBO families.

### 5.2 Not presently modelable as the complete Pre-Pilot basis

The six-component ECR Pre-Pilot system is not currently calculable because
Polar Aromatics lacks the following thermodynamic dependencies:

- NMP/RRBO equilibrium evidence;
- temperature applicability evidence; and
- model parameters or predictive representation.

The exact anchor identity and molecular weight are admitted, but those identity
facts do not supply the missing equilibrium closure.

The existing five-component evidence may be used to design validation work,
but it must not be padded with invented Polar Aromatics parameters.

---

## 6. Polar Aromatics treatment

Polar Aromatics must remain an explicit component family. It must not be
silently assigned to the poly-aromatic family, represented by a generic
default, or set to zero because its data are missing.

Before Polar Aromatics can enter a governing Stage 2 model, the project must
approve:

1. The chemical family being represented.
2. Whether one representative compound is adequate or multiple polar
   pseudo-components are required.
3. Molecular or pseudo-component identity and molecular weight.
4. Relevant functional groups and polarity basis.
5. Feed mass fraction or molar flow.
6. NMP-rich and RRBO-rich equilibrium evidence.
7. Temperature and composition applicability.
8. The selected representation in each candidate model.
9. Uncertainty and sensitivity bounds.
10. Source provenance and acceptance status.

Sulfur-bearing aromatics must not be inserted into a generic Polar Aromatics
slot. If sulfur families are required, they need their own explicitly defined
model and evidence route.

If the feed characterization cannot support a unique polar family, the result
is `NOT_CALCULABLE` for the six-component Stage 2 calculation. A reduced
five-component diagnostic may be shown only if it is clearly labelled as
incomplete and is not used for the Pre-Pilot design conclusion.

---

## 7. Temperature applicability: 25–100 °C

The requested Pre-Pilot operating envelope is:

- 25 °C = 298.15 K;
- 100 °C = 373.15 K.

The current evidence should be classified as follows:

| Temperature region | Present evidence status |
|---|---|
| Around 25 °C | Direct five-component surrogate evidence exists; Polar Aromatics remains missing |
| Approximately 25–55 °C | Some public analogue data exist for alkane/mono-aromatic/NMP systems |
| Approximately 55–100 °C | No complete six-component direct evidence currently established |
| Entire 25–100 °C range | **Not validated for the Pre-Pilot six-component basis** |

For a model to govern across the full 25–100 °C envelope, evidence must cover
the full temperature domain or provide a validated interpolation route with
hold-out tests at both ends and in the interior. A parameter form that can
mathematically evaluate at 100 °C is not, by itself, evidence of
applicability at 100 °C.

Every candidate model must declare:

- lowest and highest supported temperature;
- supported composition and solvent-to-oil range;
- supported pressure range;
- supported phase region;
- whether the result is interpolated, extrapolated, or predictive; and
- uncertainty outside the direct evidence points.

The default temperature policy is:

- direct evidence: eligible for governing use within its accepted domain;
- validated interpolation: eligible only within the registered interpolation
  domain;
- extrapolation or prediction without relevant validation: preliminary only;
- unsupported temperature: `NOT_CALCULABLE`.

---

## 8. Validation criteria

The criteria must be registered before candidate fitting or selection. They
must not be widened after seeing the results.

### 8.1 Composition reproduction

- Compare calculated and measured compositions for every reported component in
  both equilibrium phases.
- Use component-wise error, overall RMSD, and maximum absolute error.
- Where a source provides analytical uncertainty, the acceptance target should
  be pre-declared relative to that uncertainty, such as a three-uncertainty
  bound.
- Where uncertainty is unavailable, use a separately approved analytical
  tolerance; do not invent one after fitting.

### 8.2 Phase behavior

- Correctly predict whether the measured condition is single phase or two
  phase.
- Preserve the observed phase-topology region.
- Avoid artificial single-phase collapse where a two-phase tie-line is
  observed.
- Avoid nonphysical phase splits or negative component amounts.

### 8.3 Distribution and selectivity behavior

- Reproduce the direction of component transfer between phases.
- Reproduce the observed ordering of distribution coefficients where the data
  support such an ordering.
- Reproduce selectivity trends across solvent-to-oil ratio and temperature.
- Do not infer sulfur selectivity from non-sulfur aromatic transfer.

### 8.4 Generalization

Use hold-out tests separated by more than one dimension where the data allow:

- held-out tie-lines;
- held-out feed compositions;
- held-out temperatures;
- held-out solvent-to-oil ratios; and
- held-out component-family cases.

A model that only reproduces its fitting data is not admitted as governing.

### 8.5 Numerical and conservation checks

- Flash convergence must be reproducible from the same inputs.
- Phase compositions must be normalized and nonnegative.
- Phase amounts and component balances must close within pre-declared
  tolerances.
- Repeated runs must not switch phase assignments unpredictably.
- Solver failure, unstable phase selection, or unresolved multiple solutions
  must be surfaced rather than replaced with a default result.

### 8.6 Applicability and uncertainty

The model record must include:

- source and parameter provenance;
- component basis;
- fitted versus predictive parameters;
- temperature and composition range;
- validation dataset and hold-out design;
- uncertainty or sensitivity results;
- known unsupported families; and
- admission status.

---

## 9. Conditions that return `NOT_CALCULABLE`

Stage 2 returns `NOT_CALCULABLE` when any required governing dependency cannot
be resolved through an approved evidence route, including:

1. Polar Aromatics is undefined, lacks an approved MW, or lacks an approved
   model representation.
2. The requested six-component basis cannot be mapped to the selected model
   without an undocumented or arbitrary surrogate.
3. Required binary or higher-order interaction evidence is absent and no
   approved predictive route covers it.
4. The requested temperature is outside the model's accepted applicability
   range.
5. The result requires unvalidated extrapolation across a material temperature,
   composition, or component-family gap.
6. No candidate model meets the pre-declared validation criteria.
7. A candidate passes a surrogate benchmark but has no approved bridge to the
   physical Pre-Pilot feed basis.
8. Phase behavior disagrees with the relevant measured evidence in a governing
   region.
9. The flash does not converge reproducibly.
10. Phase compositions are negative, non-normalized, or violate component or
    total mass balance.
11. Required feed composition, NMP purity, temperature, pressure, or
    solvent-to-oil basis is missing or invalid.
12. Conflicting applicable evidence has not received an explicit engineering
    decision.
13. A parameter, group contribution, molecular representation, or default value
    is undocumented.
14. The only available result is a distribution-coefficient or reduced-order
    surrogate where full phase equilibrium is required.

`NOT_CALCULABLE` means the evidence route is insufficient. It must not be
relabelled as process infeasibility, numerical error, or zero transfer.

---

## 10. Proposed Stage 2 decision sequence

1. Freeze the six-component Pre-Pilot basis and define the evidence record for
   each component.
2. Resolve the Polar Aromatics family before attempting a governing
   six-component model.
3. Assemble the common public and experimental LLE evidence set with source,
   uncertainty, temperature, composition, and applicability metadata.
4. Select the candidate methods that can represent every currently defined
   component without undocumented parameters.
5. Evaluate every candidate using the same fitting, hold-out, phase-behavior,
   selectivity, conservation, and applicability criteria.
6. Record the selected model, rejected candidates, evidence gaps, and
   uncertainty. Selection is domain-specific if different models are reliable
   in demonstrably different domains.
7. Admit a governing model only for its registered evidence domain.
8. Keep unsupported temperatures, component families, or operating cases
   `NOT_CALCULABLE`.
9. Only after model admission, define the production calculation contract and
   implementation work.

The immediate deliverable is therefore an evidence and model-comparison
package, not an NRTL implementation and not a production LLE flash.