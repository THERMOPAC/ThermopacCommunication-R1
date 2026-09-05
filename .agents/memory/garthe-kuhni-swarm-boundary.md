---
name: Garthe Kühni swarm-model boundary
description: Evidence boundary for Garthe's characteristic-velocity and swarm/hold-up framework.
---

Garthe's Kühni Eq. 5.6 is a useful preliminary characteristic-velocity candidate. It contains drop size, column and agitator geometry, compartment height, stator free area, and rotor power number, but it does not predict drop size or terminal velocity.

Eq. 5.7 is \(N_P=1.08+10.94/Re_R^{0.5}+257.37/Re_R^{1.5}\). Preserve both exponents; text extraction can incorrectly drop the 0.5 exponent.

The swarm/hold-up model uses a single-particle drag curve with an implicit hold-up solve. Kühni validation used measured average Sauter diameter and reported 23.5% relative error, so it is not a blind end-to-end drop-size or flooding validation.

The source provides a theoretical route from characteristic velocity to flooding, but no independently replayed Kühni flooding envelope. It also says reliable dimensioning still requires preliminary tests.

**Why:** The framework avoids a brittle direct empirical viscosity exponent, but its dominant inputs—drop size, terminal velocity, coalescence, and axial mixing—remain fluid-specific and unresolved for RRBO/wet-NMP.

**How to apply:** Use it only as a versioned pre-pilot characteristic-velocity/hold-up candidate with strict range metadata. Do not let it select a governing diameter without RRBO/NMP input qualification and flooding replay.