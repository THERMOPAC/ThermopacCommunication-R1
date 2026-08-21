---
name: ECR-2 K&H 1999 evidence boundary
description: Evidence status and governance boundary for the K&H 1999 mass-transfer scaffold.
---

The K&H 1999 publisher record is Kumar & Hartland, *Chemical Engineering Research and Design* 77(5), 372–384, DOI 10.1205/026387699526359. Its full text was access-restricted during the evidence review, so its equations, C1/C2 values, phase convention, and overall-coefficient convention are not primary-verified.

Laitinen et al. (2019), *Axial dispersion and CFD models for the extraction of levulinic acid from dilute aqueous solution in a Kühni column with 2-methyltetrahydrofuran solvent*, DOI 10.1016/j.cherd.2019.04.018, is an accessible peer-reviewed accepted manuscript that reproduces K&H 1999 equations as a secondary source. It defines concentration as mass concentration, Kd as Cd* / Cc*, and its balances use the mass-basis transfer term ki·a·(Kd·Cc − Cd).

**Why:** The current code contains partial secondary-source transcription variants, including unresolved C1/C2 values and discrepancies in the overall-coefficient denominator and Sherwood terms. A plausible-looking implementation could silently use a wrong correlation or phase basis.

**How to apply:** Keep Shc, Shd, kc, kd, Kd, Koverall, Koa, driving force, and transfer rate as blocked/null. Treat the Laitinen source as SECONDARY_VERIFIED only; use it to identify primary-paper questions, not to authorize numerical implementation. Preserve ECR-2’s separate NRTL surrogate-coordinate and physical mass-transfer layers.