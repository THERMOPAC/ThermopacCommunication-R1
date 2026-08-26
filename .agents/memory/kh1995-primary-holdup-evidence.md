---
name: K&H 1995 primary holdup evidence
description: Primary-source boundary for the Kumar and Hartland 1995 Kühni dispersed-phase holdup correlation.
---

The user-supplied primary paper, Kumar & Hartland (1995), *Industrial & Engineering Chemistry Research* 34(11), 3925–3940, DOI 10.1021/ie00038a032, establishes the executable Kühni form:

\[
\phi = \Pi\Phi\Psi\Gamma
\]

with \(\Pi\), \(\Phi\), \(\Psi\), and \(\Gamma\) defined in Eqs. 16–19. For Kühni, Table 2 gives \(C_\Pi=2.67\times10^{-2}\), \(C_\Psi=1\) for no transfer / c→d and \(0.56\) for d→c, \(C_\Gamma=2.27\), and \(n_1\ldots n_7=(0.77,0.64,20.7,-0.34,0,-0.77,0)\).

**Rule:** Do not describe the former secondary reproduction as an exact K&H 1995 implementation. The primary \(\Phi\) term is \(\exp(20.7\,V_c\theta)\), with no outer \(0.90\) exponent, and the primary model requires the mass-transfer factor \(C_\Psi\). A multicomponent, bidirectional ECR-2 LLE model has no automatically valid single \(C_\Psi\) mapping.

**Why:** The primary paper supersedes the prior access gap. It also shows the Run #948 operating point is outside the published Kühni dataset: \(V_c\) and \(V_d\) exceed their maxima, as do column and rotor diameter and dispersed-phase viscosity; the initial 10 mm compartment is below the reported 50–90 mm range. Thus even a read-only primary-form comparator cannot be treated as valid physical holdup.

**How to apply:** Preserve historical snapshots unchanged and retain fail-closed behavior. Any future implementation decision must separately define the admissible mass-transfer direction treatment, derive \(\epsilon\) consistently with primary Eq. 9 (\(P/(A_c H\rho_c)\)), and obtain a scoped applicability/calibration approval for NMP/RRBO before allowing downstream design use.