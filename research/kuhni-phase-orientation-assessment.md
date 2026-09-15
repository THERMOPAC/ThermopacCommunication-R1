# Kühni Stage-3 phase-orientation applicability assessment

**Supplemental evidence review:** 2026-09-15 (see
`kuhni-reverse-orientation-qualification.md`)
**Decision:** Do not enable RRBO-continuous/NMP-dispersed downward-drop
hydraulic sizing from the currently reviewed source evidence.

The supplemental review distinguishes physical feasibility from qualification:
Rode et al. (2013) explicitly permits either heavy- or light-phase dispersion
in its general discussion of agitated columns. Thus this decision is **not**
a claim that downward heavy drops are impossible. Signed force balance and
countercurrent port directions can be derived, but neither that derivation
nor the newly assessed sources qualifies the complete RRBO/NMP sizing chain.
The result remains unsupported; no resolver version or scientific input changes.

## Scope and decision

The Stage-3 closure is allowed to calculate only when the continuous phase is
denser than the dispersed phase.  In that orientation the source-supported
interpretation is:

| Hydraulic role | Direction | Inlet | Outlet |
|---|---|---|---|
| denser continuous phase | downward | top | bottom |
| lighter dispersed phase | upward | bottom | top |

For the current Project-236 RRBO-continuous verification basis, RRBO is
878 kg/m³ and the wet NMP solvent phase is 1028 kg/m³.  NMP would therefore
be the denser dispersed phase and would move downward under gravity.  The reviewed
evidence does not provide the reversed Kühni closure needed to calculate that
case.  The resolver now returns an explicit unsupported prerequisite and
persists no diameter fallback.  It does **not** take an absolute density
difference, swap the phase properties, or infer a reversed correlation.

Equal densities are also unsupported: there is no buoyancy direction on which
the terminal-drop and countercurrent closures can be based.  Non-positive or
non-finite density values are rejected as nonphysical before any equation is
evaluated.

## Evidence reviewed

1. **Kumar–Hartland holdup structure.** The accessible transcription in
   `research/sources/kuhni-mass-transfer/laitinen-2019.md`, Eq. (1), retains
   `((rho_c-rho_d)/rho_c)^(-0.34)` and defines `rho_c` and `rho_d` as the
   continuous and dispersed densities.  The same source's Eq. (3) retains
   `rho_C-rho_d` in the drop-size buoyancy term.  These are signed density
   differences; no reversed-orientation prescription is supplied.

2. **Countercurrent direction and hardware mapping.** Laitinen et al.,
   `laitinen-2019.md`, §4.1, states that the “continuous heavier aqueous phase
   flows downwards and dispersed, lighter organic phase flows upwards.”
   Asadollahzadeh et al., `asadollahzadeh-2017.md`, equipment description,
   describes the heavy-phase inlet/control and light-phase overflow in a
    water-continuous, organic-dispersed Kühni column.  These sources support
  the heavy-continuous/light-dispersed mapping, not an
  RRBO-continuous/NMP-dispersed mapping.

3. **Drop-motion, holdup, and flooding scope.** Weber et al.,
   `research/sources/kuhni-mass-transfer/weber-2019.md`, §§2.2–2.4,
   evaluates water-continuous/toluene-dispersed properties and combines
   rise velocity, swarm effects, backmixing, coalescence and phase-inversion
   flooding.  Its operation-window/flooding model uses the source
   orientation and a fitted coalescence parameter.  The paper explicitly
   notes that further experiments are needed to validate the performance-map
   limits.  It is not evidence for a reversed RRBO/NMP downward-drop
   closure.

4. **Current hydraulic audit.** `research/kuhni-hydraulic-audit.md` records
   the terminal force balance with `rho_C (rho_C-rho_D)` and identifies the
   chain as an extrapolated pre-pilot screen.  It also requires a physically
   closed, source-compatible shape/drag and flooding route.  A finite root
   from algebra alone cannot remove the orientation boundary.

## Required evidence before enabling the reverse orientation

Enabling denser downward dispersed drops would require, at minimum:

- a primary or independently qualified source covering the reverse density
  ordering and the actual phase-specific RRBO/NMP property regime;
- signed buoyancy and terminal velocity validation for the denser dispersed
  phase, including drop shape/interface mobility and contamination limits;
- a countercurrent velocity convention with explicit top/bottom
  inlet/outlet mapping for both phases;
- a reversed-orientation holdup and flooding/phase-inversion closure;
- evidence for the RRBO/NMP interfacial and coalescence behavior and the
  applicability limits of each drag, swarm and flooding correlation.

Until those conditions are met, the scientifically honest result is an
unsupported hydraulic prerequisite, not a calculated diameter.

## Resolver contract

`KUHNI_GEOMETRY_RESOLVER_V1.2.0` adds the following metadata without changing
historical resolver artifacts:

- `hydraulicPrerequisite: { code, message }` — the prerequisite decision;
- `rootFailureReason: { code, message } | null` — the first/root failure when
  no in-range trial is retained;
- `phaseMetadata` — phase-specific properties, signed density difference,
  buoyancy magnitude/direction, source countercurrent mapping, and closure
  applicability;
- `rejectedRpmTrials[].reason` and `rejectedRpmTrials[].message` — persisted
  per-RPM reasons, including the explicit orientation boundary.

The existing CALCULATED_IN_RANGE admission rule, Stage-1 snapshot hash,
Stage-2 theoretical-stage authority and parent hydrodynamic lineage remain
unchanged.  V1.0.0, V1.0.1 and V1.1.0 remain replayable under their original
versions and implementation hashes.