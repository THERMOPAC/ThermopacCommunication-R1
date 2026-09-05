---
name: Pre-pilot Kühni Phase 1 boundary
description: Governing scope and authority boundary for the approved Kühni hydrodynamic screening kernel.
---

Phase 1 is a pre-pilot Kühni hydrodynamic screening kernel. It executes independently of experimental-validation/evidence approval and independently of an accepted Predictive N_T.

All process-basis inputs come unchanged from the authoritative saved Stage-1 design case. Missing inputs block dependent calculations; the hydrodynamic module never re-enters, defaults, reconstructs, substitutes, or modifies them. Only hydrodynamic geometry and operating variables absent from Stage 1 may be introduced.

The kernel establishes governed geometry and ratios; phase superficial velocities; rotor speed, tip speed, and P/V; d32; dispersed holdup; slip/characteristic velocity; flooding/capacity and percent flooding; and a = 6 phi_D / d32. The maximum rotor-tip speed is 4.5 m/s.

Every empirical correlation retains identity, reference, equation, units, applicability, assumptions, and version. Evidence status is metadata rather than an execution gate, but a genuinely out-of-applicability operating point fails closed without extrapolation or correlation substitution.

The governed Stage-1 throughput/property domain does not currently overlap the K&H 1995 Table-1 Kühni envelope: even the minimum admitted feed is at the dispersed-velocity boundary at the largest source column, and governed RRBO viscosity is outside the source range. K&H holdup, slip, Vk, and area are therefore expected diagnostic HOLDs for real saved cases; independently applicable quantities such as project-controlled preliminary d32 may still calculate.

Phase 1 terminates at a reproducible hydrodynamic state for the next module. It excludes compartment efficiency, mass-transfer coefficients, physical compartment count, active height, final diameter/speed selection, and final mechanical sizing. Existing thermodynamic engines and historical results remain unchanged.

**Why:** The approved architecture must permit useful pre-pilot hydraulic screening before thermodynamic/evidence qualification while preventing hidden property substitution, silent source-range widening, or premature physical-column design claims.

**How to apply:** Enforce the Stage-1 authority contract at every hydrodynamic run boundary, preserve per-correlation applicability verdicts, never make K&H calculate by widening its envelope, and keep all mass-transfer and physical-stage calculations in a subsequent layer.