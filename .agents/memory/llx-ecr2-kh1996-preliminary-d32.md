---
name: ECR-2 K&H 1996 preliminary d32
description: Governance boundary for the approved K&H 1996 droplet-size reconstruction.
---

The K&H 1996 d₃₂ reconstruction is approved as **Published Correlation — Preliminary Engineering**, not as a governed correlation. It is limited to NMP-continuous/RRBO-dispersed operation.

**Why:** The user explicitly accepted the best-supported reconstruction while retaining the unresolved primary-source confirmation, phase-convention confirmation, RRBO/NMP applicability validation, and pilot-calibration gaps. Numerical use must be transparent rather than silently blocked or upgraded to a performance claim.

**How to apply:** Do not advance the result beyond preliminary engineering until the primary source, phase convention, RRBO/NMP applicability, and pilot calibration are formally evidenced and approved. Treat holdup as a separate prerequisite for interfacial-area use; do not add later-phase mass-transfer, BVP, flooding, optimization, or UI work under this approval.

## Secondary-source transcription audit

Mirzaei et al. (2023), Table 1 (p. 3), prints the K&H 1996 Kühni row as:

\[
\frac{d_{32}}{H} =
\frac{C_{\psi1} e^n}
{C_\Omega\left(\frac{\sigma}{\Delta\rho gH^2}\right)^{1/2}
+ \frac{1}
{C_{\mathrm{II}}
\left[\left(\frac{\varepsilon}{g}\right)
\left(\frac{\rho_c}{g\sigma}\right)^{1/4}\right]^{n_1}
\left[H\left(\frac{\rho_c g}{\sigma}\right)^{1/2}\right]^{n_2}}}
\]

This secondary source visibly distinguishes the numerator’s italic `e` from the agitation group’s Greek \(\varepsilon\), and places the complete high-agitation product under a reciprocal. It contains no glossary, units table, Kühni constant values, or definition of `H`/`e`; it cannot establish the original-paper meaning of those symbols.

**Why:** The provisional implementation instead uses \(C_1^{n_1}\) and a directly multiplied high-agitation term. A like-for-like calculation with its six provisional values, \(H=h_\mathrm{comp}=0.25\) m, and a conditional \(e=\mathrm{Euler}\) reading gives 27.045 mm rather than 10.299 m. This demonstrates a material transcription/reconstruction difference, but does not clear the primary-source evidence boundary.

**How to apply:** Keep `PRIMARY_SOURCE_UNVERIFIED__KH1996` and do not implement the secondary-source form until the original paper defines `e`, `H`, the parameter mapping, phase convention, and applicability. Use \(\varepsilon\) as specific power only when dimensionally checking the displayed group: W/kg makes it dimensionless; W/m³ does not.