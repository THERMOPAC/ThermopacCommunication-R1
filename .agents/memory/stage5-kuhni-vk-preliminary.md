---
name: Stage 5 Kühni Vk preliminary route
description: Governance boundary for the Asadollahzadeh 2017 Kühni characteristic-velocity comparison route.
---

The `ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY` Stage 5 route is a distinct, per-diameter characteristic-velocity calculation. It must never reuse the rigid-sphere terminal velocity or that route's hindrance exponent.

The bibliographic record is verified as Asadollahzadeh, Torkaman, and Torab-Mostaedi, “New correlations for slip velocity and characteristic velocity in a rotary liquid–liquid extraction column,” *Chemical Engineering Research & Design* 127 (2017), 146–153, DOI `10.1016/j.cherd.2017.07.032`. The publisher record exposes the abstract and access paths, not a controlled primary equation page. Its native V_k unit, transcription, fitted validity ranges, complete tested geometry, NMP/RRBO applicability, and an accepted route-specific m remain unverified.

**Why:** A characteristic-velocity expression alone does not establish the exponent needed by the generic Stage 5 slip/holdup model. Reusing the legacy assumed `n = 1` would turn an unrelated preliminary screening assumption into an apparent Kühni capacity result. An engineer has explicitly rejected capacity and diameter use because unverified expression units and applicability can make even a separately sourced `m` unsafe for sizing.

**How to apply:** Resolve the transfer direction from governed Stage 4 context and rotor ratio/speed from Stage 7. Show calculated Fr, Morton number, and V_k only as an unlabelled audit expression output. Keep all d32/terminal-velocity and generic-`n` fields out of this route. The server-owned decision must continue to report holdup, limiting throughput, percentage, feasibility, and any diameter preference as Not Calculable until a future controlled review retains the equation material, validates applicability, accepts route-specific `m`, and explicitly approves design use. Do not change Stage 5 selection, Stage 7 geometry, DS-SEL, or downstream simulator inputs from this route alone.