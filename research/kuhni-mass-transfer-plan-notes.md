# Research Notes: Kühni/ECR Mass Transfer and Compartment Efficiency

**Status:** complete
**Depth:** Standard technical literature review

## Plan

- **Question:** What evidence-backed, rate-based calculation chain can convert Stage-2 theoretical stages into physical Kühni compartments and active height using the completed Stage-3 hydrodynamics, without assumed fixed stage efficiency?
- **Scope:** Kühni/ECR liquid-liquid extraction; local mass transfer, axial mixing/backmixing, compartment efficiency, scale-up, applicability, required inputs, qualification, and software boundaries. No implementation or invented correlations.
- **Audience:** Process engineers and software reviewers responsible for governed pre-pilot design.
- **Deliverable:** Development and qualification plan with equations, literature candidates, evidence gates, input ownership, calculation sequence, validation matrix, and implementation phases.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Kühni-specific mass-transfer and scale-up evidence | complete | 8 |
| 2 | Single-drop and swarm mass-transfer coefficient closure | complete | 6 |
| 3 | Axial dispersion, backmixing, and compartment efficiency | complete | 5 |
| 4 | Rate-based multicomponent LLX and thermodynamic coupling | complete | 6 |
| 5 | Existing Stage-2/Stage-3 software contract and qualification design | complete | project code |

## Coverage Checklist

- [x] Identify governing candidate equations and primary sources.
- [x] Separate continuous-side, dispersed-side, and overall resistance.
- [x] Define how Stage-3 d32, holdup, slip, P/V, geometry, and RPM are consumed.
- [x] Define how Stage-2 equilibrium and theoretical-stage duty are consumed.
- [x] Establish required diffusion, partition, interfacial, and axial-mixing inputs.
- [x] Define physical-compartment and active-height calculation without fixed efficiency.
- [x] State applicability ranges and fail-closed evidence gates.
- [x] Define validation datasets, acceptance metrics, uncertainty, and implementation phases.

## Findings Log

### Kühni-specific evidence

- Direct Kühni studies support rate-based axial-dispersion, mixing-cell, and population-balance architectures, but none validates RRBO/NMP.
- Published water/organic pilot geometries are 60–117 mm; industrial-diameter transfer is unqualified.
- Mass-transfer direction materially changes fitted performance.

### Local mass transfer

- Use two-film fluxes with nonlinear interfacial equilibrium; never one global partition coefficient.
- `a=6φ/d32` is admissible only for a spherical-drop representation; deformed drops require a qualified area model.
- Exact phase-film correlations and ranges must be recovered from primary typeset sources before code admission.

### Axial mixing and compartment efficiency

- Use physical compartments with explicit backflow or axial dispersion.
- Both-phase RTD/tracer data are required because transfer and axial mixing are non-identifiable from outlet concentration alone.
- Published 20–30% continuous-phase backflow is a dataset observation, not a transferable default.

### Rate-based thermodynamic coupling

- Stage 2 defines the equilibrium separation duty and supplies local equilibrium closure.
- Physical compartments are found by repeated integer rate-based solves; `η=N_T/Ncomp` is reported afterward.
- Maxwell–Stefan is a future qualified option; a transparent Fick/two-film baseline should be implemented and validated first.

### Software contract

- New immutable child runs must pin Stage‑1, Stage‑2, and exact Stage‑3 parent hashes.
- Do not add mass-transfer fields to historical Stage‑1/2/3 snapshots.
- Keep dependency-blocked and pre-pilot statuses until evidence and blind validation pass.

## Conflicts & Open Questions

- Whether published Kühni correlations cover viscous NMP/RRBO and the project Reynolds/Eötvös/Morton ranges.
- Whether compartment efficiency is best closed by measured axial dispersion, a validated backflow-cell model, or a rate-based compartment residence-time solve.
- Whether literature provides transferable axial-mixing correlations or requires pilot tracer calibration.
- How multicomponent sulfur-family diffusivities and equilibrium derivatives will be governed.

## Gaps

- No qualified RRBO/NMP phase diffusivities or Maxwell–Stefan matrix.
- No actual-system interface-mobility/contamination evidence.
- No phase-specific RTD/backmixing data.
- No axial d32/holdup/concentration profiles for calibration and blind validation.
- Exact primary equations/ranges remain to be acquired for Kumar–Hartland, Garthe, and one direction of the 2017 Kühni Sherwood fit.
- Current Stage‑3 `floodHoldup` is a turning-point capacity quantity, not an operating holdup available for transfer area or residence-time calculations.
- Current Stage‑3 compartment height is a resolver geometry ratio, not yet a governed hardware pitch for active-height sizing.
- A seven-component production flux model needs a closed multicomponent diffusion/reference-frame contract; independent scalar Fick coefficients are insufficient unless a dilute-solute scope is explicitly qualified.