# Research Notes: Predictive Kühni Hydraulic Diameter

**Status:** complete
**Depth:** Deep

## Plan

- **Question:** Can published physics-based models calculate a pre-pilot Kühni hydraulic screening diameter for Stage-1 RRBO/NMP without new experiments?
- **Scope:** Predictive d32, terminal velocity/drag, swarm holdup, flooding/capacity, and diameter; no production-model changes.
- **Audience:** Process-design and model-governance reviewers.
- **Deliverable:** Equation-level source audit, compatibility assessment, Stage-1 extrapolation test, and final executable/not-executable verdict.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Viscosity-aware d32 models for agitated extraction columns | complete | Calabrese 1986; Kumar-Hartland 1996 |
| 2 | High-viscosity terminal-drop velocity and drag | complete | Barry et al. 2018; Grace; Clift |
| 3 | Swarm velocity and holdup closures | complete | Garthe/Stichlmair; Richardson-Zaki |
| 4 | Flooding/capacity and diameter solution | complete | Turning-point capacity formulation |
| 5 | Compatible end-to-end model chain and Stage-1 stress test | complete | Reproducible Stage-1 sweep |

## Coverage Checklist

- [x] Identify at least one explicit-viscosity predictive d32 candidate.
- [x] Verify candidate equations and fitted parameter definitions from primary or authoritative sources.
- [x] Identify a terminal-velocity model applicable to high viscosity ratios.
- [x] Identify a holdup model compatible with selected terminal and d32 outputs.
- [x] Identify a flooding/capacity route that supports diameter iteration.
- [x] Quantify source-range departures for exact Stage-1 properties.
- [x] Reject only undefined or physically invalid results; label finite meaningful extrapolations.
- [x] Decide whether a pre-pilot hydraulic screening diameter is executable without experiments.

## Findings Log

_[@key] markers will reference sources in research/sources.json._

### Viscosity-aware d32

Calabrese-Chang-Dang Eq. 18-19 is the best executable candidate. It predicts d32
directly and contains explicit dispersed viscosity. Stage-1 RRBO viscosity is
inside the source's moderate-viscosity range; geometry and sigma are extrapolated.

### Terminal velocity and drag

The Barry et al. fluid-sphere formulation exposes equation-level Oliver-Chung and
Rivkind-Ryskin branches with explicit viscosity ratio. All selected-screen roots
remain spherical and within Re <= 50.

### Swarm and holdup

Garthe/Stichlmair Eq. 8.3 plus countercurrent continuity is closed using the same
fluid-sphere drag law. Richardson-Zaki was retained as an independent sensitivity.

### Flooding and diameter

The turning point is the interior maximum of total superficial capacity over
0<h<1. Diameter is the positive root at the selected fraction of flood.

### End-to-end compatibility

Geometric similarity at constant P/V produces finite roots. At 70% flood the
Garthe branch gives 2.008, 3.679, 5.219, 6.653, and 8.044 m across the five saved
reference agitation cases. Richardson-Zaki differs by less than about 2%.

## Conflicts & Open Questions

- Kumar-Hartland's accessible evidence did not establish direct dispersed-viscosity
  dependence; it remains a comparator rather than the governing d32 route.
- A no-fit fluid-sphere terminal model is closed for the calculated spherical-drop
  Reynolds regime.
- Turning-point flooding is admitted for pre-pilot screening; missing RRBO/NMP
  validation changes status, not calculability.

## Gaps

- No uniquely validated RRBO/NMP Kühni diameter is available.
- Coalescence and interfacial contamination remain model-form uncertainty.
- Mechanical feasibility and aperture velocity are outside this hydraulic audit.