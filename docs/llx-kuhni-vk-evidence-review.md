# LLX Kühni V<sub>k</sub> Correlation Evidence Review

**Record ID:** LLX-ECR-KUHNI-VK-2017-001  
**Assessment date:** 22 August 2026  
**Scope:** Asadollahzadeh (2017) characteristic-velocity expression in Stage 5
generic hydraulic screening. This record does not alter Stage 7 equipment
geometry, DS-SEL, or any ECR rating model.

## Engineer decision

**REJECTED — do not use this route for capacity or diameter decisions.**

The route remains available only to show the supplied expression's per-diameter
audit output, Froude number, Morton number, and mass-transfer direction. It must
not produce operating holdup, limiting throughput, percentage of maximum,
feasibility, a feasible diameter, a Stage 7 carry-over, or a DS-SEL change.

The server-owned gate is false and cannot be advanced by a workspace save or
client field. A future approval must replace this decision only after every
evidence gap below is closed in a new controlled review.

## Controlled source record

| Item | Record |
|---|---|
| Citation | Asadollahzadeh, M.; Torkaman, R.; Torab-Mostaedi, M. “New correlations for slip velocity and characteristic velocity in a rotary liquid–liquid extraction column.” *Chemical Engineering Research & Design* 127 (2017), 146–153. DOI: [10.1016/j.cherd.2017.07.032](https://doi.org/10.1016/j.cherd.2017.07.032). |
| Publisher record | [ScienceDirect article record](https://www.sciencedirect.com/science/article/abs/pii/S0263876217304100) |
| Retained material | Publisher bibliographic record and abstract. |
| Equation page | **Not retained.** The publisher record exposes institutional-access and purchase paths; no lawful primary equation page was available for this review. |
| Abstract-supported context | The study is a Kühni-column hydrodynamics study of three liquid–liquid systems with and without mass transfer, including toluene–water with silica nanoparticles. |

## Equation and transcription control

The audit implementation retains the supplied expression:

\[
V_k=0.237\left(\frac{\rho_c}{\Delta\rho}\right)^{0.741}
Fr^{-0.184}N_\mu^{-0.095}(1+0.052\alpha_{MT})
\]

with \(Fr=N^2d_R/g\) and
\(N_\mu=\mu_c^4g/(\rho_d\gamma^3)\).

This is **not** an independently checked primary transcription. The primary
equation page, its symbols, grouping, and native \(V_k\) output unit are not
available in the controlled record. Therefore:

| Required item | Review finding |
|---|---|
| Native \(V_k\) output unit | Unknown |
| Primary-source transcription check | Not completed |
| Fitted validity ranges | Unknown |
| Tested column/rotor geometry | Unknown |
| Tested system details beyond abstract | Not established |

No dimensional inference, secondary reconstruction, or numerical plausibility
check may substitute for the missing primary equation material.

## Applicability comparison

The project route is NMP-continuous/RRBO-dispersed extraction using Stage 4
operating-temperature properties and Stage 7 rotor ratio/speed. The source
record does not provide the ranges or full geometry needed to compare that
envelope, and it does not establish an NMP/RRBO calibration. Applicability is
therefore **not demonstrated**.

## Route-specific hindrance exponent \(m\)

The generic slip relation also requires a separately sourced,
route-specific \(m\). Any workspace-entered \(m\) is preserved only as audit
provenance. No controlled source, validity context, and engineer acceptance for
this specific V<sub>k</sub> route were available in this review, so no \(m\) is
accepted for capacity use.

## Conditions for reconsideration

Before a new engineer review may approve capacity or diameter use, retain and
review all of the following:

1. a lawful primary equation page or publisher/author-supported equivalent;
2. the native \(V_k\) output unit and a line-by-line independent transcription;
3. all fitted validity ranges, tested liquid systems, phase convention, and
   full column/rotor geometry;
4. a documented comparison against the NMP/RRBO project operating envelope;
5. a separately sourced route-specific \(m\), with its own validity context and
   provenance; and
6. an explicit new engineering approval covering Stage 5 capacity and diameter
   use.

Until then, the rejection remains the governing decision.