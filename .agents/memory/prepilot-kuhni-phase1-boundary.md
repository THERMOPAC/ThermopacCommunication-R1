---
name: Pre-pilot Kühni Phase 1 boundary
description: Governing scope and authority boundary for the approved Kühni hydrodynamic screening kernel.
---

Phase 1 is a pre-pilot Kühni hydrodynamic screening kernel. It executes independently of experimental-validation/evidence approval and independently of an accepted Predictive N_T.

All process-basis inputs come unchanged from the authoritative saved Stage-1 design case. Missing inputs block dependent calculations; the hydrodynamic module never re-enters, defaults, reconstructs, substitutes, or modifies them. Only hydrodynamic geometry and operating variables absent from Stage 1 may be introduced.

The kernel establishes governed geometry and ratios; phase superficial velocities; rotor speed, tip speed, and P/V; d32; dispersed holdup; slip/characteristic velocity; flooding/capacity and percent flooding; and a = 6 phi_D / d32. The maximum rotor-tip speed is 4.5 m/s.

Every empirical correlation retains identity, reference, equation, units, applicability, assumptions, and version. Evidence status is metadata rather than an execution gate, but a genuinely out-of-applicability operating point fails closed without extrapolation or correlation substitution.

Phase 1 terminates at a reproducible hydrodynamic state for the next module. It excludes compartment efficiency, mass-transfer coefficients, physical compartment count, active height, final diameter/speed selection, and final mechanical sizing. Existing thermodynamic engines and historical results remain unchanged.

**Why:** The approved architecture must permit useful pre-pilot hydraulic screening before thermodynamic/evidence qualification while preventing hidden property substitution or premature physical-column design claims.

**How to apply:** Enforce the Stage-1 authority contract at every hydrodynamic run boundary, preserve per-correlation applicability verdicts, and keep all mass-transfer and physical-stage calculations in a subsequent layer.