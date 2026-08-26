# ECR Pre-Pilot Design
## Greenfield Calculation Dependency Map

**Scope:** NMP/RRBO aromatic and polar-aromatic extraction in a Kühni-type
extraction column, for pre-pilot design and model-development use.

**Status:** Calculation architecture only. This document deliberately does
not define a UI, database schema, API, mapper, or production implementation.

**Primary design rule:** every value used by a calculation must be either an
explicit input, an approved correlation/model value, a derived value with a
traceable equation, an iterative solver state, or a calibration parameter.
If a required value cannot be resolved through an applicable evidence route,
the affected calculation returns `NOT_CALCULABLE`.

---

## 1. System boundaries and component basis

### 1.1 Species basis

All process, thermodynamic, mass-transfer, and balance vectors use this
fixed six-component order:

| Index | Component | Role |
|---:|---|---|
| 1 | Saturates | RRBO hydrocarbon family |
| 2 | Mono-aromatics | RRBO hydrocarbon family |
| 3 | Di-aromatics | RRBO hydrocarbon family |
| 4 | Poly-aromatics | RRBO hydrocarbon family |
| 5 | Polar aromatics | Explicit polar aromatic family |
| 6 | NMP | Continuous extraction solvent |

The four RRBO hydrocarbon families are used for the commercial
hydrocarbon-only raffinate quality and NMP-free RRBO recovery calculations.
Polar aromatics remain explicit and must not be silently folded into
mono-, di-, or poly-aromatics.

### 1.2 Sulfur boundary

Sulfur is a separate model. No sulfur or DBT removal value may be inferred
from aromatic transfer.

The sulfur model requires its own explicit sulfur-family definition, for
example sulfur-free hydrocarbons, sulfide/thiophene families, benzothiophene,
dibenzothiophene, and other project-approved families as applicable. Each
sulfur family requires:

- feed mass fraction or mass flow;
- molecular or pseudo-component identity;
- NMP/RRBO equilibrium evidence;
- phase-transfer or mass-transfer evidence;
- a declared applicability range.

Without those inputs, sulfur output is `NOT_CALCULABLE`, while the
non-sulfur aromatic simulation may remain calculable.

### 1.3 Basis conventions

- Flow basis: kg/h for process and mass balances; mol/h for equilibrium
  calculations.
- Composition basis: mass fractions for feed characterization and
  hydrocarbon recovery; mole fractions for thermodynamics.
- Temperature: degrees Celsius as an input, Kelvin inside equations.
- Pressure: absolute pressure where a correlation requires it.
- Geometry: metres and square metres.
- Droplet diameter: metres internally; millimetres only for display.
- Interfacial tension: N/m.
- Dynamic viscosity: Pa·s.
- Density: kg/m³.
- Diffusivity: m²/s.
- Power: W; specific power: W/kg or W/m³ as explicitly defined.
- All vector orders and unit conversions are part of the frozen calculation
  contract.

---

## 2. Evidence resolution policy

For every required value, the resolver records:

1. value and units;
2. source class;
3. source reference;
4. applicability conditions;
5. temperature and composition basis;
6. uncertainty or tolerance where available;
7. resolution status.

The preferred evidence order is:

1. applicable measured data;
2. applicable validated project correlation;
3. applicable literature correlation;
4. explicit engineering assumption;
5. `NOT_CALCULABLE`.

This is an applicability-filtered order, not an automatic rule that a
measured value always overrides a validated correlation. Conflicting
applicable sources require an explicit engineering decision or sensitivity
case.

No value may be supplied by:

- an undocumented default;
- a value copied from an unrelated equipment type;
- a value from a different phase orientation without an applicability
  decision;
- a value from a different temperature or feed basis without a declared
  conversion;
- a silent zero substitution;
- a silent clamp to a correlation boundary.

---

## 3. End-to-end dependency graph

```text
Feed characterization
  ├─> normalized six-component feed vectors
  ├─> RRBO/NMP flow basis
  ├─> hydrocarbon-only product target
  └─> S/O ratio

Thermodynamic/LLE basis
  ├─> phase split and equilibrium compositions
  ├─> independent counter-current ideal-stage solver ──> N_T
  └─> local equilibrium states for the physical ECR simulator

Physical-property basis
  └─> local phase density, viscosity, interfacial tension,
      molecular weight, and diffusivity

ECR geometry + operating decisions
  └─> area, phase velocities, power density, compartment geometry

ECR hydrodynamics
  ├─> slip velocity
  ├─> dispersed holdup
  ├─> d32
  ├─> interfacial area
  └─> flooding/capacity margin

Local rate-based mass transfer
  └─> component transfer rates and local outlet states

Counter-current physical ECR simulation
  ├─> component/total mass-balance closure
  ├─> raffinate quality
  ├─> NMP-free RRBO recovery
  └─> physical active-height requirement

Independent diameter and height solvers
  └─> feasible design envelope

Optimizer
  └─> feasible operating/design envelope, not only one optimum

Pre-pilot validation/calibration
  └─> calibrated correlations and scale-up readiness
```

The ideal-stage \(N_T\) calculation and the physical compartment simulation
share the thermodynamic basis but are not interchangeable. \(N_T\) does not
become a compartment count, and a fixed HETS is not allowed to replace the
rate-based height calculation.

---

## 4. Variable classification legend

| Class | Meaning |
|---|---|
| `PRIMITIVE_INPUT` | User/project basis supplied before calculation |
| `MEASURED_INPUT` | Measurement supplied from laboratory, pilot, or plant data |
| `CORRELATION_PARAMETER` | Coefficient, exponent, or model setting used by an approved correlation |
| `DERIVED_PROPERTY` | Deterministically calculated from resolved inputs |
| `ITERATIVE_STATE` | Candidate state changed by a solver iteration |
| `DECISION_VARIABLE` | Operating or design variable searched or selected by the optimizer |
| `CONSTRAINT` | Acceptance, bound, or feasibility rule |
| `CALCULATED_OUTPUT` | Reported result of a completed calculation |
| `CALIBRATION_PARAMETER` | Parameter fitted or updated from validation data |

---

## 5. Process and feed characterization

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| PB-01 | RRBO total feed flow | `PRIMITIVE_INPUT` | kg/h | project operating basis | all process calculations |
| PB-02 | NMP total feed flow | `PRIMITIVE_INPUT` | kg/h | project operating basis | all process calculations |
| PB-03 | RRBO family mass fractions: Sat/Mono/Di/Poly | `MEASURED_INPUT` or `PRIMITIVE_INPUT` | mass fraction | feed assay or explicit assumption | normalization, LLE, balances |
| PB-04 | Polar-aromatic feed mass fraction | `MEASURED_INPUT` or `PRIMITIVE_INPUT` | mass fraction | feed assay | LLE, balances |
| PB-05 | NMP feed purity | `MEASURED_INPUT` or `PRIMITIVE_INPUT` | mass fraction | solvent specification | LLE, balances |
| PB-06 | Feed temperature | `PRIMITIVE_INPUT` | °C | operating case | properties, LLE, hydrodynamics |
| PB-07 | Feed pressure | `PRIMITIVE_INPUT` | absolute pressure | operating case | applicable property/capacity models |
| PB-08 | Phase configuration | `PRIMITIVE_INPUT` | controlled enum | process selection | all phase-specific models |
| PB-09 | Raffinate aromatic target | `CONSTRAINT` | hydrocarbon-only mole or mass basis | product specification | ideal stages, physical sizing |
| PB-10 | Minimum NMP-free RRBO recovery | `CONSTRAINT` | mass fraction; default requirement ≥0.95 only when explicitly approved | product requirement | physical sizing, optimizer |
| PB-11 | RRBO hydrocarbon mass flow | `DERIVED_PROPERTY` | kg/h | PB-01 and PB-03–PB-04 | recovery and balances |
| PB-12 | NMP mass flow | `DERIVED_PROPERTY` | kg/h | PB-02 and PB-05 | balances, S/O |
| PB-13 | Six-component RRBO feed vector | `DERIVED_PROPERTY` | kg/h | PB-01, PB-03–PB-04 | every component calculation |
| PB-14 | Six-component NMP feed vector | `DERIVED_PROPERTY` | kg/h | PB-02, PB-05 | every component calculation |
| PB-15 | S/O mass ratio | `DERIVED_PROPERTY` | kg/kg | PB-11 and PB-12 | reporting, optimizer |
| PB-16 | Hydrocarbon-only aromatic fraction | `DERIVED_PROPERTY` | mass or mole fraction | Sat/Mono/Di/Poly vectors | target and product reporting |
| PB-17 | Feed total mass-balance check | `CONSTRAINT` | residual tolerance | PB-13–PB-14 | process-basis acceptance |

Feed fractions must be normalized only when the source explicitly states that
normalization is appropriate. A source-total mismatch is an evidence issue,
not an invitation to silently change the assay.

---

## 6. NMP/RRBO thermodynamic and LLE engine

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| TH-01 | Thermodynamic model identity/version | `PRIMITIVE_INPUT` | controlled identifier | approved model package | all LLE calls |
| TH-02 | Binary interaction parameters \(\tau_{ij}(T)\) | `CORRELATION_PARAMETER` or `MEASURED_INPUT` | model units | approved data/model | NRTL |
| TH-03 | NRTL non-randomness parameters \(\alpha_{ij}\) | `CORRELATION_PARAMETER` | dimensionless | approved data/model | NRTL |
| TH-04 | Temperature dependence coefficients | `CORRELATION_PARAMETER` | model-specific | approved regression | NRTL |
| TH-05 | Applicability range for thermodynamic model | `CONSTRAINT` | °C, composition, phase region | evidence | LLE acceptance |
| TH-06 | Feed thermodynamic mole fractions | `DERIVED_PROPERTY` | mole fraction | PB-13–PB-14 and MWs | flash and ideal cascade |
| TH-07 | Phase split fraction \(\beta\) | `ITERATIVE_STATE` | fraction | TH-06, model, temperature | flash convergence |
| TH-08 | RRBO-rich equilibrium composition \(x_i^{eq}\) | `ITERATIVE_STATE` | mole fraction | TH-06–TH-07, NRTL | cascade and local BVP |
| TH-09 | NMP-rich equilibrium composition \(y_i^{eq}\) | `ITERATIVE_STATE` | mole fraction | TH-06–TH-07, NRTL | cascade and local BVP |
| TH-10 | Phase molar flows | `ITERATIVE_STATE` | mol/h | TH-07 and total feed | cascade and local BVP |
| TH-11 | LLE flash residual | `CALCULATED_OUTPUT` | dimensionless | TH-07–TH-10 | flash acceptance |
| TH-12 | LLE flash convergence status | `CALCULATED_OUTPUT` | status | solver and TH-11 | downstream gate |
| TH-13 | Equilibrium distribution relation \(K_i\) | `DERIVED_PROPERTY` | phase-basis ratio | TH-08–TH-09 | diagnostic and mass transfer |
| TH-14 | Equilibrium tie-line | `CALCULATED_OUTPUT` | six-component vectors | TH-08–TH-10 | audit and validation |

NRTL must calculate actual phase equilibrium for the current temperature and
composition. A fixed distribution coefficient may be used only as a
diagnostic or explicitly approved reduced-order model, never as a silent
replacement for the LLE calculation.

### 6.1 Independent counter-current theoretical-stage calculation

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| ST-01 | Candidate theoretical stage count \(N_{trial}\) | `ITERATIVE_STATE` | integer | solver search bounds | ideal cascade |
| ST-02 | Stage feed state | `ITERATIVE_STATE` | six-component flows | PB and prior stage state | ideal cascade |
| ST-03 | Stage equilibrium phase split | `ITERATIVE_STATE` | fraction | local stage flash | ideal cascade |
| ST-04 | Stage outlet compositions | `ITERATIVE_STATE` | six-component mole fractions | local flash and balances | next stage |
| ST-05 | Stage component balance residuals | `CALCULATED_OUTPUT` | mol/h or kg/h | stage states | stage acceptance |
| ST-06 | Stage counter-current convergence | `CALCULATED_OUTPUT` | status | ST-02–ST-05 | stage acceptance |
| ST-07 | Product aromatic target residual | `CALCULATED_OUTPUT` | target basis | raffinate outlet | stage acceptance |
| ST-08 | Ideal-stage RRBO recovery | `CALCULATED_OUTPUT` | mass fraction | raffinate and feed vectors | diagnostic/constraint |
| ST-09 | Minimum accepted theoretical stages \(N_T\) | `CALCULATED_OUTPUT` | integer | ST-01–ST-08 | independent reference |
| ST-10 | Ideal-stage calculation status | `CALCULATED_OUTPUT` | status | convergence and gates | downstream presentation |

The ideal cascade must evaluate both the aromatic target and the recovery
requirement when the recovery basis is compatible. It must not create a
physical ECR compartment count or active height.

---

## 7. Physical-property engine

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| PR-01 | Component molecular weights | `MEASURED_INPUT`, `PRIMITIVE_INPUT`, or `CORRELATION_PARAMETER` | g/mol | component definition/evidence | all mole conversions |
| PR-02 | RRBO pseudo-component MW mapping | `CORRELATION_PARAMETER` or `CALIBRATION_PARAMETER` | g/mol | assay/model basis | RRBO mole coordinates |
| PR-03 | Continuous-phase density \(\rho_c\) | `DERIVED_PROPERTY` | kg/m³ | composition, T, property model | velocity, Re, hydrodynamics |
| PR-04 | Dispersed-phase density \(\rho_d\) | `DERIVED_PROPERTY` | kg/m³ | composition, T, property model | velocity, Re, hydrodynamics |
| PR-05 | Continuous-phase viscosity \(\mu_c\) | `DERIVED_PROPERTY` | Pa·s | composition, T, property model | Re, mass transfer |
| PR-06 | Dispersed-phase viscosity \(\mu_d\) | `DERIVED_PROPERTY` | Pa·s | composition, T, property model | Re, mass transfer |
| PR-07 | Interfacial tension \(\sigma\) | `DERIVED_PROPERTY` | N/m | phase compositions, T, property model | d32, hydrodynamics |
| PR-08 | Continuous-phase diffusivities \(D_{c,i}\) | `DERIVED_PROPERTY` or `MEASURED_INPUT` | m²/s | component, phase, T, property model | Schmidt, mass transfer |
| PR-09 | Dispersed-phase diffusivities \(D_{d,i}\) | `DERIVED_PROPERTY` or `MEASURED_INPUT` | m²/s | component, phase, T, property model | Schmidt, mass transfer |
| PR-10 | Phase molar masses | `DERIVED_PROPERTY` | g/mol | composition and PR-01 | concentrations |
| PR-11 | Phase volumetric flow rates | `DERIVED_PROPERTY` | m³/h | phase mass flows and density | superficial velocities |
| PR-12 | Property applicability status | `CALCULATED_OUTPUT` | status | evidence and ranges | downstream gate |
| PR-13 | Property uncertainty | `CALCULATED_OUTPUT` | property-specific | source/model | sensitivity and optimizer |

Property models must expose whether a value is measured, calculated, or
assumed. An assumption may be used in pre-pilot mode only when it is explicit,
bounded, and included in uncertainty analysis.

---

## 8. ECR geometry and operating basis

### 8.1 Search and design variables

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| EO-01 | Column diameter \(D\) | `DECISION_VARIABLE` | m | optimizer/search bounds | area, hydraulics, transfer |
| EO-02 | Active height \(H_{active}\) | `DECISION_VARIABLE` | m | height solver bounds | compartments, BVP |
| EO-03 | Number of compartments \(N_{comp}\) | `DECISION_VARIABLE` | integer | geometry bounds | BVP mesh and mechanics |
| EO-04 | Rotor speed/RPM | `DECISION_VARIABLE` | rpm | operating range | power, hydrodynamics |
| EO-05 | S/O ratio | `DECISION_VARIABLE` | kg/kg | feed/solvent operating range | feed basis and all downstream models |
| EO-06 | Operating temperature | `DECISION_VARIABLE` | °C | approved range | LLE, properties, hydraulics |
| EO-07 | Rotor-to-column diameter ratio | `PRIMITIVE_INPUT` or `DECISION_VARIABLE` | dimensionless | equipment family | geometry/hydrodynamics |
| EO-08 | Compartment height \(h_{comp}\) | `PRIMITIVE_INPUT` or `DECISION_VARIABLE` | m | ECR geometry | local hydrodynamics |
| EO-09 | Stator open-area fraction | `PRIMITIVE_INPUT` or `CORRELATION_PARAMETER` | fraction | ECR geometry | hydrodynamics |
| EO-10 | Rotor/stator geometry | `PRIMITIVE_INPUT` | controlled geometry record | selected ECR design | power and capacity |
| EO-11 | Disengagement-zone height | `DECISION_VARIABLE` | m | mechanical design bounds | total column height |
| EO-12 | RPM operating window | `CONSTRAINT` | rpm | equipment limits | optimizer |
| EO-13 | S/O operating window | `CONSTRAINT` | kg/kg | process limits | optimizer |
| EO-14 | Temperature operating window | `CONSTRAINT` | °C | material/process limits | optimizer |
| EO-15 | Diameter search bounds | `CONSTRAINT` | m | equipment/process limits | diameter solver |
| EO-16 | Active-height search bounds | `CONSTRAINT` | m | equipment/process limits | height solver |
| EO-17 | Compartment-count bounds | `CONSTRAINT` | integer | mechanical limits | optimizer |

Diameter, active height, compartment count, RPM, S/O ratio, and temperature
are decision variables for the optimizer. They may be fixed for a single
design case, but their status remains explicit.

### 8.2 Geometry-derived quantities

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| EG-01 | Column cross-sectional area \(A\) | `DERIVED_PROPERTY` | m² | EO-01 | phase velocities |
| EG-02 | Rotor diameter | `DERIVED_PROPERTY` | m | EO-01 and EO-07 | power/hydrodynamics |
| EG-03 | Compartment height | `DERIVED_PROPERTY` | m | EO-02 and EO-03 | local transfer |
| EG-04 | Axial mesh spacing \(\Delta z\) | `DERIVED_PROPERTY` | m | EO-02 and EO-03 | BVP |
| EG-05 | Total column height | `CALCULATED_OUTPUT` | m | EO-02 and EO-11 plus mechanical allowances | design report |
| EG-06 | Active-volume | `DERIVED_PROPERTY` | m³ | EG-01 and EO-02 | power density, capacity |
| EG-07 | Rotor/stator area and clearance terms | `DERIVED_PROPERTY` | geometry units | EO-10 | hydrodynamic correlations |

---

## 9. ECR hydrodynamics, droplet behavior, and capacity

### 9.1 Hydrodynamic correlation parameters

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| HY-01 | Holdup correlation coefficients | `CORRELATION_PARAMETER` or `CALIBRATION_PARAMETER` | model-specific | ECR evidence | holdup |
| HY-02 | d32 correlation coefficients | `CORRELATION_PARAMETER` or `CALIBRATION_PARAMETER` | model-specific | ECR evidence | droplet diameter |
| HY-03 | Slip/terminal velocity coefficients | `CORRELATION_PARAMETER` or `CALIBRATION_PARAMETER` | model-specific | ECR evidence | slip |
| HY-04 | Hindrance coefficient and exponent | `CORRELATION_PARAMETER` or `CALIBRATION_PARAMETER` | model-specific | ECR evidence | holdup/slip closure |
| HY-05 | Power number correlation | `CORRELATION_PARAMETER` | model-specific | rotor/stator evidence | power |
| HY-06 | Flooding/capacity coefficients | `CORRELATION_PARAMETER` or `CALIBRATION_PARAMETER` | model-specific | ECR evidence | capacity margin |
| HY-07 | Correlation applicability ranges | `CONSTRAINT` | ranges by variable | evidence | hydrodynamic gates |

### 9.2 Derived and calculated hydrodynamics

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| HD-01 | Continuous-phase superficial velocity \(u_c\) | `DERIVED_PROPERTY` | m/s | phase flow, PR-03, EG-01 | Re, capacity |
| HD-02 | Dispersed-phase superficial velocity \(u_d\) | `DERIVED_PROPERTY` | m/s | phase flow, PR-04, EG-01 | Re, capacity |
| HD-03 | Phase Reynolds numbers | `DERIVED_PROPERTY` | dimensionless | velocities, density, viscosity, geometry | correlations |
| HD-04 | Rotor tip speed | `DERIVED_PROPERTY` | m/s | EO-04, rotor diameter | power/hydrodynamics |
| HD-05 | Power number | `DERIVED_PROPERTY` | dimensionless | geometry, Re, EO-04 | shaft power |
| HD-06 | Shaft power | `DERIVED_PROPERTY` | W | power number and geometry | power density |
| HD-07 | Specific power or power density | `DERIVED_PROPERTY` | W/kg or W/m³ | shaft power, phase volume/mass | d32, holdup |
| HD-08 | Characteristic slip velocity \(u_K\) | `DERIVED_PROPERTY` or `MEASURED_INPUT` | m/s | approved route | hindrance/holdup |
| HD-09 | Hindrance exponent \(n\) | `CORRELATION_PARAMETER`, `MEASURED_INPUT`, or `CALIBRATION_PARAMETER` | dimensionless | approved route | holdup closure |
| HD-10 | Unhindered slip/terminal velocity | `DERIVED_PROPERTY` | m/s | phase properties, d32, gravity | hindrance model |
| HD-11 | Hindrance closure residual | `CALCULATED_OUTPUT` | dimensionless | HD-08–HD-10 | hydrodynamic acceptance |
| HD-12 | Dispersed-phase holdup \(\phi_d\) | `CALCULATED_OUTPUT` | fraction | HD-01–HD-11 and correlation | interfacial area, capacity |
| HD-13 | Sauter mean droplet diameter \(d_{32}\) | `CALCULATED_OUTPUT` | m | geometry, power, properties, approved correlation | interfacial area, transfer |
| HD-14 | Slip velocity \(u_{slip}\) | `CALCULATED_OUTPUT` | m/s | HD-01–HD-12 | mass transfer |
| HD-15 | Interfacial area \(a=6\phi_d/d_{32}\) | `DERIVED_PROPERTY` | m²/m³ | HD-12–HD-13 | mass transfer |
| HD-16 | Flooding capacity | `CALCULATED_OUTPUT` | flow or velocity basis | phase properties, geometry, capacity model | capacity constraint |
| HD-17 | Operating fraction of flood | `CALCULATED_OUTPUT` | fraction | actual load and HD-16 | capacity constraint |
| HD-18 | Capacity/flooding margin | `CALCULATED_OUTPUT` | fraction or status | HD-17 and limit | diameter acceptance |
| HD-19 | Hydrodynamic convergence status | `CALCULATED_OUTPUT` | status | closure residuals and ranges | BVP gate |

The hydrodynamic chain must be recomputed for every diameter, active-height,
RPM, S/O, and temperature trial for which the governing equations depend on
those variables. A value from one trial may not be reused in another trial
without an explicit invariance proof.

---

## 10. Local rate-based mass-transfer engine

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| MT-01 | Continuous-phase Schmidt number \(Sc_{c,i}\) | `DERIVED_PROPERTY` | dimensionless | PR-03, PR-05, PR-08 | \(k_c\) |
| MT-02 | Dispersed-phase Schmidt number \(Sc_{d,i}\) | `DERIVED_PROPERTY` | dimensionless | PR-04, PR-06, PR-09 | \(k_d\) |
| MT-03 | Continuous-phase mass-transfer coefficient \(k_{c,i}\) | `CALCULATED_OUTPUT` | m/s | slip, d32, properties, correlation | overall transfer |
| MT-04 | Dispersed-phase mass-transfer coefficient \(k_{d,i}\) | `CALCULATED_OUTPUT` | m/s | slip, d32, properties, correlation | overall transfer |
| MT-05 | Equilibrium concentration \(C^*_{c,i}\) | `DERIVED_PROPERTY` | kg/m³ or mol/m³ | LLE equilibrium and phase properties | driving force |
| MT-06 | Equilibrium concentration \(C^*_{d,i}\) | `DERIVED_PROPERTY` | kg/m³ or mol/m³ | LLE equilibrium and phase properties | driving force |
| MT-07 | Bulk concentration \(C_{c,i}\) | `ITERATIVE_STATE` | kg/m³ or mol/m³ | local phase flow and properties | driving force |
| MT-08 | Bulk concentration \(C_{d,i}\) | `ITERATIVE_STATE` | kg/m³ or mol/m³ | local phase flow and properties | driving force |
| MT-09 | Partition coefficient \(K_{d,i}=C^*_{d,i}/C^*_{c,i}\) | `DERIVED_PROPERTY` | basis-defined ratio | equilibrium concentrations | overall coefficient |
| MT-10 | Overall mass-transfer coefficient \(K_{overall,i}\) | `CALCULATED_OUTPUT` | m/s or equivalent | MT-03, MT-04, MT-09 | local flux |
| MT-11 | Continuous/dispersed driving force | `DERIVED_PROPERTY` | concentration basis | MT-05–MT-09 | local flux |
| MT-12 | Component interfacial flux | `CALCULATED_OUTPUT` | kg/m²·s or mol/m²·s | MT-10–MT-11 | compartment transfer |
| MT-13 | Component transfer rate | `CALCULATED_OUTPUT` | kg/h | MT-12 and HD-15 | BVP state update |
| MT-14 | Local transfer direction | `CALCULATED_OUTPUT` | controlled sign/status | bulk/equilibrium states | diagnostics |
| MT-15 | Rate-based local closure residual | `CALCULATED_OUTPUT` | tolerance basis | local transfer equations | BVP acceptance |

The mass-transfer engine must preserve the six-component order. A transfer
rate for a broad aromatic family must not be used as a proxy for a distinct
sulfur family.

---

## 11. Compartment-by-compartment counter-current ECR simulation

### 11.1 Iterative state

For each compartment \(k=1\ldots N_{comp}\), the solver state includes:

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| BVP-01 | RRBO/dispersed phase inlet flow at face \(k\) | `ITERATIVE_STATE` | kg/h vector | previous compartment | local state |
| BVP-02 | NMP/continuous phase inlet flow at face \(k\) | `ITERATIVE_STATE` | kg/h vector | previous compartment | local state |
| BVP-03 | RRBO/dispersed phase outlet flow at face \(k\) | `ITERATIVE_STATE` | kg/h vector | local transfer | next compartment |
| BVP-04 | NMP/continuous phase outlet flow at face \(k\) | `ITERATIVE_STATE` | kg/h vector | local transfer | next compartment |
| BVP-05 | Local phase compositions | `ITERATIVE_STATE` | six-component vectors | local flows and MWs | properties/LLE |
| BVP-06 | Local equilibrium phase compositions | `ITERATIVE_STATE` | six-component vectors | local NRTL flash | driving force |
| BVP-07 | Local phase split | `ITERATIVE_STATE` | fraction | local flash | transfer |
| BVP-08 | Local property state | `ITERATIVE_STATE` | property record | local composition/T | hydrodynamics/transfer |
| BVP-09 | Local \(d_{32}\), holdup, slip, area | `ITERATIVE_STATE` | mixed | local hydrodynamics | transfer |
| BVP-10 | Local component transfer vector | `ITERATIVE_STATE` | kg/h vector | mass transfer | flow update |
| BVP-11 | Solver residual vector | `ITERATIVE_STATE` | equation basis | BVP equations | convergence |
| BVP-12 | Previous accepted solution | `ITERATIVE_STATE` | full state | prior trial only | acceleration/continuation |

### 11.2 Physical simulation outputs and constraints

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| BVP-13 | BVP convergence status | `CALCULATED_OUTPUT` | status | residual and iteration limits | height/diameter solver |
| BVP-14 | Component mass-balance residuals | `CALCULATED_OUTPUT` | kg/h | inlet, outlet, transfer vectors | acceptance |
| BVP-15 | Total mass-balance residual | `CALCULATED_OUTPUT` | kg/h | BVP-14 | acceptance |
| BVP-16 | Raffinate outlet composition | `CALCULATED_OUTPUT` | six-component vector | final dispersed outlet | product quality |
| BVP-17 | Extract outlet composition | `CALCULATED_OUTPUT` | six-component vector | final continuous outlet | recovery/diagnostics |
| BVP-18 | Hydrocarbon-only raffinate aromatic result | `CALCULATED_OUTPUT` | target basis | BVP-16, MWs | quality constraint |
| BVP-19 | NMP-free RRBO recovery | `CALCULATED_OUTPUT` | mass fraction | hydrocarbon feed/raffinate | recovery constraint |
| BVP-20 | Aromatic transfer by family | `CALCULATED_OUTPUT` | kg/h or fraction | BVP-16–BVP-17 | reporting |
| BVP-21 | Saturates loss/transfer | `CALCULATED_OUTPUT` | kg/h or fraction | BVP-16–BVP-17 | recovery diagnostics |
| BVP-22 | Required active height for trial | `CALCULATED_OUTPUT` | m | height search and BVP acceptance | design solver |
| BVP-23 | Physical ECR feasibility status | `CALCULATED_OUTPUT` | status | all gates | diameter/optimizer |

### 11.3 Physical acceptance constraints

| ID | Constraint | Class | Applies to |
|---|---|---|---|
| BC-01 | All required inputs resolve with valid units and provenance | `CONSTRAINT` | every run |
| BC-02 | Local LLE flashes converge | `CONSTRAINT` | every accepted compartment |
| BC-03 | BVP residual norm is within approved tolerance | `CONSTRAINT` | physical simulation |
| BC-04 | Every component balance is within approved tolerance | `CONSTRAINT` | physical simulation |
| BC-05 | Total balance is within approved tolerance | `CONSTRAINT` | physical simulation |
| BC-06 | Raffinate aromatic target is met | `CONSTRAINT` | selected design |
| BC-07 | NMP-free RRBO recovery is at least the approved minimum, normally ≥95% | `CONSTRAINT` | selected design |
| BC-08 | Holdup, d32, slip, and transfer states remain in applicable ranges | `CONSTRAINT` | every trial |
| BC-09 | Flooding/capacity margin remains positive and above minimum | `CONSTRAINT` | every trial |
| BC-10 | No nonphysical negative flow or composition | `CONSTRAINT` | every solver state |
| BC-11 | Solver iteration and function-evaluation limits are respected | `CONSTRAINT` | every solver |

Failure of a required dependency or numerical closure is
`NOT_CALCULABLE`. It is not a process-infeasibility conclusion. A design may
be labelled infeasible only when all governing inputs are resolved and the
complete feasible search envelope has been evaluated.

---

## 12. Independent diameter and active-height solvers

### 12.1 Diameter solver

For each diameter trial:

```text
D_trial
  → A
  → phase velocities
  → local hydrodynamics
  → d32 / holdup / slip
  → flooding and capacity margin
  → local mass transfer
  → accepted active-height search
  → feasible/infeasible trial
```

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| DS-01 | Diameter trial \(D_{trial}\) | `ITERATIVE_STATE` | m | EO-15 | full physical simulation |
| DS-02 | Diameter trial hydraulic margin | `CALCULATED_OUTPUT` | status/value | DS-01 and hydrodynamics | trial acceptance |
| DS-03 | Minimum feasible diameter | `CALCULATED_OUTPUT` | m | all diameter trials | design report |
| DS-04 | Feasible diameter envelope | `CALCULATED_OUTPUT` | set/range | all accepted trials | optimizer/pilot plan |

The diameter solver must not solve a single algebraic equation while holding
d32, holdup, slip, or capacity constant if those values depend on diameter.

### 12.2 Active-height solver

For each height trial, the solver must rebuild any height-dependent quantity,
including compartment count or spacing, local agitation input, d32, holdup,
mass transfer, and the complete BVP state.

| ID | Variable | Class | Units/basis | Depends on | Consumed by |
|---|---|---|---|---|---|
| HS-01 | Height trial \(H_{trial}\) | `ITERATIVE_STATE` | m | EO-16 | full physical simulation |
| HS-02 | Height trial compartment count | `DERIVED_PROPERTY` | integer | H trial and geometry rule | BVP |
| HS-03 | Height trial quality residual | `CALCULATED_OUTPUT` | target basis | BVP-18 | trial acceptance |
| HS-04 | Height trial recovery residual | `CALCULATED_OUTPUT` | mass fraction | BVP-19 | trial acceptance |
| HS-05 | Minimum accepted active height | `CALCULATED_OUTPUT` | m | HS-01–HS-04 | design report |
| HS-06 | Height-search monotonicity status | `CALCULATED_OUTPUT` | status | ordered accepted trials | solver validity |

A minimum active height is established only when convergence, balance,
quality, recovery, and search-validity constraints all pass.

---

## 13. Optimizer and feasible design envelope

The optimizer must call the complete simulator. It must not optimize a
surrogate objective that bypasses LLE, hydrodynamics, mass transfer,
capacity, or balance closure.

### 13.1 Decision variables

The optimizer may search:

- \(D\): column diameter;
- \(H_{active}\): active height;
- \(N_{comp}\): physical compartment count;
- RPM;
- S/O ratio;
- operating temperature.

Each variable has explicit lower and upper bounds and may be continuous,
integer, or categorical as appropriate.

### 13.2 Feasibility constraints

The optimizer accepts a design only when all of the following pass:

1. process and evidence resolution;
2. thermodynamic/LLE convergence;
3. ECR hydrodynamic applicability;
4. positive capacity/flooding margin;
5. physical BVP convergence;
6. component and total mass-balance closure;
7. hydrocarbon-only raffinate aromatic target;
8. NMP-free RRBO recovery ≥95% or the approved project minimum;
9. mechanical geometry and operating bounds;
10. uncertainty or safety-margin requirements.

### 13.3 Outputs

| ID | Variable | Class | Units/basis | Depends on |
|---|---|---|---|---|
| OP-01 | Feasible design set | `CALCULATED_OUTPUT` | set of cases | all accepted trials |
| OP-02 | Feasible operating envelope | `CALCULATED_OUTPUT` | ranges/surface | OP-01 |
| OP-03 | Pareto frontier | `CALCULATED_OUTPUT` | multi-objective set | cost/capacity/quality objectives |
| OP-04 | Selected design point | `CALCULATED_OUTPUT` | one case, if selected | explicit decision rule |
| OP-05 | Objective values | `CALCULATED_OUTPUT` | project-defined | accepted cases |
| OP-06 | Binding constraints | `CALCULATED_OUTPUT` | constraint list | selected case |
| OP-07 | Sensitivity ranking | `CALCULATED_OUTPUT` | ranked variables | sensitivity runs |
| OP-08 | Optimizer convergence status | `CALCULATED_OUTPUT` | status | search closure |

The selected point must never be presented without the surrounding feasible
envelope and the binding constraints.

---

## 14. Pre-pilot sensitivity, validation, and calibration

### 14.1 Validation inputs

| ID | Variable | Class | Units/basis | Consumed by |
|---|---|---|---|---|
| VL-01 | Pilot/feed characterization records | `MEASURED_INPUT` | controlled test basis | validation |
| VL-02 | Measured phase flow rates | `MEASURED_INPUT` | kg/h or m³/h | balances/hydraulics |
| VL-03 | Measured holdup | `MEASURED_INPUT` | fraction | holdup calibration |
| VL-04 | Measured d32 distribution or d32 | `MEASURED_INPUT` | m | droplet calibration |
| VL-05 | Measured flooding/capacity point | `MEASURED_INPUT` | defined capacity basis | capacity calibration |
| VL-06 | Measured outlet compositions | `MEASURED_INPUT` | six-component basis | thermodynamic/transfer validation |
| VL-07 | Measured extraction efficiency or transfer rate | `MEASURED_INPUT` | component basis | mass-transfer calibration |
| VL-08 | Measured temperature/RPM/S/O conditions | `MEASURED_INPUT` | operating basis | applicability |
| VL-09 | Measurement uncertainty | `MEASURED_INPUT` | test-specific | parameter fitting |

### 14.2 Calibration parameters

| ID | Variable | Class | Scope |
|---|---|---|---|
| CP-01 | NRTL regression adjustment parameters | `CALIBRATION_PARAMETER` | only if fitted against approved LLE data |
| CP-02 | Density/viscosity/interfacial-tension correction factors | `CALIBRATION_PARAMETER` | only for defined RRBO/NMP range |
| CP-03 | d32 correlation correction factor/coefficients | `CALIBRATION_PARAMETER` | ECR geometry and operating range |
| CP-04 | Holdup correction factor/coefficients | `CALIBRATION_PARAMETER` | phase orientation and range |
| CP-05 | Slip/hindrance correction parameters | `CALIBRATION_PARAMETER` | validated hydrodynamic range |
| CP-06 | Flooding/capacity correction parameters | `CALIBRATION_PARAMETER` | tested ECR range |
| CP-07 | \(k_c\) and \(k_d\) correction parameters | `CALIBRATION_PARAMETER` | component/phase/range-specific |
| CP-08 | Overall transfer correction parameters | `CALIBRATION_PARAMETER` | only where independently validated |
| CP-09 | Uncertainty-model parameters | `CALIBRATION_PARAMETER` | residual/error propagation |

Calibration parameters must be versioned, fitted against specified data, and
validated on withheld conditions. They must not become hidden universal
defaults.

### 14.3 Experiment-design outputs

| ID | Variable | Class | Units/basis | Depends on |
|---|---|---|---|---|
| EX-01 | Recommended RPM test points | `CALCULATED_OUTPUT` | rpm | sensitivity and uncertainty |
| EX-02 | Recommended S/O test points | `CALCULATED_OUTPUT` | kg/kg | sensitivity and uncertainty |
| EX-03 | Recommended temperature test points | `CALCULATED_OUTPUT` | °C | thermodynamic uncertainty |
| EX-04 | Required d32 measurements | `CALCULATED_OUTPUT` | test plan | d32 uncertainty |
| EX-05 | Required holdup measurements | `CALCULATED_OUTPUT` | test plan | holdup uncertainty |
| EX-06 | Required flooding/capacity tests | `CALCULATED_OUTPUT` | test plan | capacity uncertainty |
| EX-07 | Required composition analyses | `CALCULATED_OUTPUT` | component basis | LLE/transfer uncertainty |
| EX-08 | Calibration readiness status | `CALCULATED_OUTPUT` | status | validation coverage |
| EX-09 | Scale-up readiness status | `CALCULATED_OUTPUT` | status | accepted calibration and range |

---

## 15. Required state and status semantics

Every layer must distinguish these conditions:

| Status | Meaning |
|---|---|
| `CALCULATED` | Required inputs resolved and numerical checks passed |
| `CALCULATED_PRELIMINARY` | Numerical checks passed but evidence/calibration is preliminary |
| `NOT_CALCULABLE` | A required input, applicability condition, or numerical closure is missing |
| `INFEASIBLE` | All required inputs are resolved and the complete bounded search proves no feasible case |
| `VALIDATED` | Model route passed its defined validation criteria |
| `GOVERNED_RELEASE_ELIGIBLE` | Evidence, validation, calibration, and release criteria all pass |

`NOT_CALCULABLE` must never be converted to `INFEASIBLE`.

For every failed calculation, the result must include:

- the first blocking dependency;
- all downstream calculations suppressed by that dependency;
- numerical diagnostics if a solver ran;
- evidence and applicability gaps;
- whether the failure is recoverable by input/evidence or requires model work.

---

## 16. Minimum calculation contract

A design case is complete only when it can provide all of the following:

1. resolved six-component feed and solvent basis;
2. actual NMP/RRBO LLE equilibrium;
3. independent \(N_T\) with convergence and balances;
4. traceable temperature-dependent physical properties;
5. ECR-specific hydrodynamic state;
6. d32, holdup, slip, and capacity results with applicability;
7. local rate-based mass-transfer results;
8. compartment-by-compartment counter-current simulation;
9. component and total balance closure;
10. hydrocarbon-only aromatic target result;
11. NMP-free RRBO recovery result;
12. independent diameter and active-height trial results;
13. feasible operating/design envelope;
14. uncertainty and sensitivity results;
15. explicit pre-pilot measurement and calibration requirements;
16. independent sulfur status, never inferred from aromatic transfer.

Only after this contract is frozen should the project define the UI,
persistence model, service boundaries, or production calculation workflow.