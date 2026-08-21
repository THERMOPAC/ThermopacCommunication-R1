---
name: ECR-2 K&H 1999 evidence boundary
description: Evidence status and governance boundary for the K&H 1999 mass-transfer scaffold.
---

The K&H 1999 publisher record is Kumar & Hartland, *Chemical Engineering Research and Design* 77(5), 372–384, DOI 10.1205/026387699526359. Its full text was access-restricted during the evidence review, so its equations, phase convention, and overall-coefficient convention are not primary-verified.

Laitinen et al. (2019), *Axial dispersion and CFD models for the extraction of levulinic acid from dilute aqueous solution in a Kühni column with 2-methyltetrahydrofuran solvent*, DOI 10.1016/j.cherd.2019.04.018, is an accessible peer-reviewed accepted manuscript that reproduces K&H 1999 equations as a secondary source. It defines concentration as mass concentration, Kd as Cd* / Cc*, and its balances use the mass-basis transfer term ki·a·(Kd·Cc − Cd).

Wang et al. (2017), *Mass transfer in a pulsed and non-pulsed disc and doughnut solvent extraction column*, DOI 10.1016/j.ces.2017.02.011, independently attributes two overall-coefficient relations to K&H 1999: 1/Koc = 1/kc + 1/(m·kd) and 1/Kod = m/kc + 1/kd, with m = Cd/Cc at equilibrium. Thus the existing candidate kc·kd/(kd·Kd + kc) has secondary support only as the dispersed-basis coefficient Kod. The same source uses C1=C2=4.33 for pulsed columns; it is not evidence for Kühni columns.

The supplied preliminary implementation specification subsequently established C1 = 0.90 and C2 = 0.45 as continuous/dispersed agitation parameters, and Fc = 0.76 and Fd = 0.58 as continuous/dispersed Kühni corrections. It does not establish the exact equation placement for any of them, complete Shc/Shd equations, regime-selection criteria, or a low-Re policy.

**Why:** Partial secondary-source transcription variants and unplaced corrections could silently produce the wrong correlation, phase basis, or resistance convention.

**How to apply:** The controlled preliminary scope may calculate physical concentration conversion, Kd = Cd*/Cc*, and ΔCd = Cd − Kd·Cc while preserving separate NRTL surrogate coordinates and physical molecular weights. Keep Shc, Shd, kc, kd, Kod, Koa, and transfer rate unavailable until the missing source evidence is recovered and governed.