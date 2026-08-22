---
name: ECR-2 K&H 1996 d32 transcription invalidation
description: Fail-closed boundary for the legacy K&H 1996 droplet-size reconstruction and historical snapshots.
---

The legacy K&H 1996 d₃₂ reconstruction is **transcription-invalid** and must never produce a numerical published-correlation result. It remains traceable only as evidence provenance; a complete, tagged engineer-supplied d₃₂ is the sole usable route for simulator development and sensitivity work.

**Why:** The uploaded Rahimpour et al. (2024) *Scientific Reports* Table 1, reference 24 (Kumar & Hartland 1996), and Laitinen et al. (2019), Eq. (3), show reciprocal denominator structure that conflicts with the legacy direct-addition implementation. Neither secondary source resolves all required physical notation or coefficient mapping; numerical correction would therefore be invention.

**How to apply:** Keep `PRIMARY_SOURCE_UNVERIFIED__KH1996`, block downstream interfacial-area/BVP calculations from the published route, and require authoritative definitions before adding an executable equation. Historical frozen snapshots must remain immutable but receive a display-only transcription-invalid overlay so prior numerical values cannot be interpreted as an active design basis.

## Secondary-source transcription audit

The uploaded paper is **Rahimpour et al. (2024)**, not Mirzaei et al. (2023). Its Table 1 (p. 3), reference 24, prints the K&H 1996 row as:

\[
\frac{d_{32}}{h_c} =
\frac{C_{\psi}\varepsilon^{0.32}}
{\frac{1}{1.55\left(\frac{\sigma}{\Delta\rho g h_c^2}\right)^{1/2}}
+ \frac{1}
{0.42
\left[\left(\frac{\psi}{g}\right)
\left(\frac{\Delta\rho}{g\sigma}\right)^{1/4}\right]^{-0.35}
\left[h_c\left(\frac{\Delta\rho g}{\sigma}\right)^{1/2}\right]^{-1.15}}}
\]

The printed row uses \(h_c\), not \(H\), and visibly distinguishes numerator \(\varepsilon\) from \(\psi\). It prints numeric coefficients 1.55 and 0.42 and fixed exponents 0.32, −0.35, and −1.15; it does not print \(C_\Omega\), \(C_{\mathrm{II}}\), \(n\), \(n_1\), \(n_2\), or \(\rho_c\). It contains no variable glossary, units table, or definition of \(h_c\), \(C_\psi\), or \(\varepsilon\).

**Why:** The provisional implementation used \(C_1^{n_1}\), a direct first denominator term, a directly multiplied second term, and \(\rho_c\) in two groups. All differ from the exact printed row. This establishes that the legacy 10.29936 m path is not an implementation of this secondary-source equation, but does not itself supply a corrected executable equation.

**How to apply:** Preserve provenance as `SECONDARY_SOURCE / PRIMARY_SOURCE_UNVERIFIED_KH1996`. Do not implement the secondary-source form until authoritative evidence defines \(h_c\), \(C_\psi\), \(\varepsilon\), coefficient mapping, phase convention, and applicability. The prose calls \(\psi\) power loss per unit mass; W/kg makes its printed group dimensionless, but the table does not print units.