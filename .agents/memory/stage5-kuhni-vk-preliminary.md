---
name: Stage 5 Kühni Vk preliminary route
description: Governance boundary for the Asadollahzadeh 2017 Kühni characteristic-velocity comparison route.
---

The `ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY` Stage 5 route is a distinct, per-diameter characteristic-velocity calculation. It must never reuse the rigid-sphere terminal velocity or that route's hindrance exponent.

The bibliographic record is verified as Asadollahzadeh, Torkaman, and Torab-Mostaedi, “New correlations for slip velocity and characteristic velocity in a rotary liquid–liquid extraction column,” *Chemical Engineering Research & Design* 127 (2017), 146–153, DOI `10.1016/j.cherd.2017.07.032`. The accessible record confirms a Kühni liquid–liquid hydrodynamics study, but does not verify the supplied expression’s native output unit, fitted validity ranges, complete tested geometry, or NMP/RRBO applicability.

**Why:** A characteristic-velocity expression alone does not establish the exponent needed by the generic Stage 5 slip/holdup model. Reusing the legacy assumed `n = 1` would turn an unrelated preliminary screening assumption into an apparent Kühni capacity result. Unverified expression units and applicability can make even a separately sourced `m` unsafe for sizing.

**How to apply:** Resolve the transfer direction from governed Stage 4 context and rotor ratio/speed from Stage 7. Show calculated Fr, Morton number, and V_k only as an unlabelled native expression output. Keep all d32/terminal-velocity and generic-`n` fields out of this route. Until source units, validity envelope, tested geometry, project applicability, a separately sourced route-specific `m`, and engineer design-use approval are accepted, report holdup, limiting throughput, percentage, feasibility, and any diameter preference as Not Calculable. Do not change Stage 5 selection, Stage 7 geometry, DS-SEL, or downstream simulator inputs from this route alone.