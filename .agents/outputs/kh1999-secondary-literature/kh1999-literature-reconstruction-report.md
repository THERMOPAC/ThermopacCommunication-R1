# ECR-2 — Kumar & Hartland (1999) mass-transfer literature reconstruction

**Scope:** literature reconstruction only. No ECR-2 numerical logic, K&H 1995
holdup, K&H 1996 \(d_{32}\), C2/NRTL, BVP, axial propagation, flooding,
optimisation, UI, or ECR-1 code was changed.

**Recommendation:** do **not** enable a local overall-transfer rate yet. The
continuous-side K&H correlation is reconstructed clearly enough for preliminary
use *only after* its Kuhni power-input definition is governed. The dispersed-side
formula is reproduced, but its Kuhni \(C_2\) value and its regime-selection
framework were not recovered. The approved preliminary constants
\(C_1=0.90\), \(C_2=0.45\), \(F_c=0.76\), and \(F_d=0.58\) cannot be assigned
to any equation role from the evidence below.

## 1. Sources and evidence boundary

1. **Kumar, A.; Hartland, S.** “Correlations for Prediction of Mass Transfer
   Coefficients in Single Drop Systems and Liquid-Liquid Extraction Columns.”
   *Chemical Engineering Research and Design* **77**(5), 372–384 (1999).
   DOI: https://doi.org/10.1205/026387699526359.
   The publisher abstract is available, but the full text was not available for
   direct checking in this work.
2. **Torab-Mostaedi, M.; Ghaemi, A.; Asadollahzadeh, M.; Pejmanzad, P.**
   “Mass Transfer Performance in Pulsed Disc and Doughnut Extraction Columns.”
   *Brazilian Journal of Chemical Engineering* **28**(3), 447–456 (2011).
   Supplied local source:
   `attached_assets/1_Mass_transfer_performance_in_pulsed_disc_and_dough_1787290773756.pdf`.
   Its Eqs. (8)–(13) explicitly identify the K&H (1999) framework.
3. **Asadollahzadeh, M.; Torkaman, R.; Torab-Mostaedi, M.**
   “Experimental Determination of Continuous Phase Overall Mass Transfer
   Coefficients: Case Study: Kühni Extraction Column.”
   *Iranian Journal of Chemistry & Chemical Engineering* **36**(5), 149–161
   (2017). Supplied local source:
   `attached_assets/0_Experimental_Determination_of_Continuous_Phase_Ove_1787290773756.pdf`.
   Its Table 3, Eq. (18), explicitly attributes a continuous-side column
   correlation to Kumar and Hartland [31] and lists its Kuhni \(C_1\) value.

The two supplied sources are peer reviewed. They independently reproduce the
same continuous-side expression. No source found here reproduces K&H’s
drop-regime selection rule, characteristic-velocity equation, \(F_c/F_d\), or
the requested \(K_d\) basis.

## 2. Notation and phase convention in the secondary papers

Both papers use:

- \(c\): continuous phase; \(d\): dispersed phase.
- \(V_s\): slip velocity between phases, in m/s.
- \(d_{32}\): Sauter mean drop diameter, in m.
- \(Re=d_{32}V_s\rho_c/\mu_c\).
- \(Sc_c=\mu_c/(\rho_cD_c)\), \(Sc_d=\mu_d/(\rho_dD_d)\).
- \(\kappa=\mu_d/\mu_c\). The explicit ratio is printed in the 2017
  nomenclature; the 2011 paper calls it the viscosity ratio.
- \(\psi\): power dissipated per unit mass, m²/s³ (W/kg).
- \(\phi\) or \(x_d\): dispersed-phase holdup.

The 2011 test system labels \(x\) as the continuous-phase solute mass fraction
and \(y\) as the dispersed-phase solute mass fraction. This notation must not
be merged with ECR-2 thermodynamic coordinates. ECR-2’s project convention
remains: continuous = NMP-rich, dispersed = RRBO-rich.

## 3. K&H continuous-side reconstruction

### 3.1 K&H continuous-phase correlation

**2011 secondary source Eq. (8), printed with \(x_d\):**

\[
\frac{\dfrac{Sh_c}{1-x_d}-Sh_{c,\mathrm{rigid}}}
{Sh_{c,\infty}-\dfrac{Sh_c}{1-x_d}}
=5.26\times10^{-2}
Re^{\,1/3+6.59\times10^{-2}Re^{0.25}}
Sc_c^{1/3}
\left(\frac{V_s\mu_c}{\sigma}\right)^{1/3}
\frac{1}{1+\kappa^{1.1}}
\left[
1+C_1\left\{
\frac{\psi}{g}\left(\frac{\rho_c}{g\sigma}\right)^{0.25}
\right\}^{1/3}
\right].
\tag{8}
\]

**2017 secondary source Table 3 Eq. (18), printed with \(\phi\):**

\[
\frac{\dfrac{Sh_c}{1-\phi}-Sh_{c,\mathrm{rigid}}}
{Sh_{c,\infty}-\dfrac{Sh_c}{1-\phi}}
=5.26\times10^{-2}
Re^{\,1/3+6.59\times10^{-2}Re^{0.25}}
Sc_c^{1/3}
\left(\frac{V_s\mu_c}{\sigma}\right)^{1/3}
\frac{1}{1+\kappa^{1.1}}
\left[
1+C_1\left\{
\frac{\psi}{g}\left(\frac{\rho_c}{g\sigma}\right)^{1/4}
\right\}^{1/3}
\right].
\tag{18}
\]

The visual page check confirms the 2017 table prints the inner density/surface
tension exponent as \(1/4\), matching the 2011 Eq. (8) expression. The
apparent discrepancy in the 2011 text extraction was therefore an OCR/layout
artefact, not an equation discrepancy.

**Evidence status:** `VERIFIED_SECONDARY` — two peer-reviewed sources agree on
the complete continuous-side structure, including the holdup normalization and
power-input factor.

### 3.2 Required continuous-side limits

The 2011 source prints:

\[
Sh_{c,\mathrm{rigid}}
=2.43+0.775Re^{1/2}Sc_c^{1/3}+0.0103ReSc_c^{1/3}.
\tag{10}
\]

\[
Sh_{c,\infty}=50+\frac{2}{\sqrt{\pi}}Pe_c^{1/2},
\qquad Pe_c=\frac{d_{32}V_s}{D_c}.
\tag{11}
\]

These are part of the same displayed K&H framework in the 2011 source.

**Evidence status:** `STRONG_SECONDARY` — one peer-reviewed reproduction.

### 3.3 K&H \(C_1\) location and Kuhni value

In both reproduced continuous-side equations, \(C_1\) is an additive
coefficient inside the power-input correction:

\[
\left[1+C_1\left\{
\frac{\psi}{g}\left(\frac{\rho_c}{g\sigma}\right)^{1/4}
\right\}^{1/3}\right].
\]

The 2017 Kuhni source explicitly prints:

\[
C_1=4.33,\ 2.44,\ 7.5,\ 0
\quad\text{for Pulsed, Karr, Kuhni, and Rotating Disc columns, respectively.}
\]

Thus, if and only if ECR-2 adopts this reproduced equation, the secondary
evidence supports **\(C_1=7.5\) for a Kuhni column**, not 0.90.

The engineer-approved value **\(C_1=0.90\)** is not rejected as a preliminary
project constant in some other, as-yet-unresolved role. It is, however,
**not evidenced as the \(C_1\) in Eq. (8)/(18)** and must not be inserted there
by name matching.

## 4. K&H dispersed-side reconstruction

The 2011 source prints one dispersed-phase correlation:

\[
Sh_d=17.7+
\frac{3.19\times10^{-3}\left(Re\,Sc_d^{1/3}\right)^{1.7}}
{1+1.43\times10^{-2}\left(Re\,Sc_d^{1/3}\right)^{0.7}}
\left(\frac{\rho_d}{\rho_c}\right)^{2/3}
\frac{1}{1+\kappa^{2/3}}
\left[
1+C_2\left\{
\frac{\psi}{g}\left(\frac{\rho_c}{g\sigma}\right)^{0.25}
\right\}^{1/3}
\right].
\tag{9}
\]

The source states that the K&H correlations describe continuous- and
dispersed-phase coefficients in pulsed, Karr, Kuhni, and rotating-disc columns.
It then states **\(C_1=C_2=4.33\) for pulsed columns**.

**What is supported**

- Exact displayed structure of a \(Sh_d\) equation: `STRONG_SECONDARY`.
- \(Sh_d=k_dd_{32}/D_d\): `STRONG_SECONDARY`, visually confirmed in the 2011
  nomenclature.
- Pulsed-column \(C_2=4.33\): `VERIFIED_SECONDARY` for the stated pulsed
  context only.

**What is not supported**

- A Kuhni-specific value or placement for engineer-approved **\(C_2=0.45\)**:
  `UNRESOLVED`.
- Any K&H rigid/circulating/oscillating split, transition criterion, or
  characteristic-drop-velocity equation: `UNRESOLVED`.
- Any proof that Eq. (9) is the rigid, circulating, or oscillating branch:
  `UNRESOLVED`. The source prints no branch label or selector.
- Any \(F_d=0.58\) role: `UNRESOLVED`.

Therefore Eq. (9) must not yet be evaluated for ECR-2 Kuhni service.

## 5. Column energy term and device boundary

The 2011 pulsed-column source prints:

\[
\psi=\frac{\pi^2(1-\varepsilon^2)}
{2\varepsilon^2C_o^2h_c}(Af)^3,
\tag{12}
\]

where \(A\) is pulse amplitude (m), \(f\) pulse frequency (s⁻¹),
\(\varepsilon\) free-area fraction, \(C_o\) orifice coefficient, and \(h_c\)
compartment height (m).

This formula is dimensionally W/kg, but it is specifically for a **pulsed disc
and doughnut column**. The 2017 Kuhni paper uses the K&H continuous equation
but does not supply a Kuhni-specific \(\psi\) definition. The pulsed Eq. (12)
therefore has status `DEVICE_SPECIFIC_NOT_TRANSFERABLE` for ECR-2.

The K&H continuous and dispersed expressions demonstrably contain:

- holdup normalization, \(Sh_c/(1-\phi)\), on the continuous side; and
- power-input corrections of the form
  \([1+C_j\{(\psi/g)(\rho_c/(g\sigma))^{1/4}\}^{1/3}]\).

They do **not** evidence \(F_c=0.76\), \(F_d=0.58\), \(\psi/\phi\), or
\(\psi\phi\). Their roles remain `UNRESOLVED`.

## 6. Film, partition, and overall-coefficient basis

The 2011 source prints the continuous-basis two-film resistance equation:

\[
\frac{1}{k_{oc}}=\frac{1}{k_c}+\frac{m}{k_d}.
\tag{13}
\]

It does not define \(m\) in the printed nomenclature or nearby text. It also
lists \(k_{oc}\) as s⁻¹ in the nomenclature, although the surrounding text says
it is obtained by dividing a volumetric coefficient by interfacial area and its
Sherwood definition is \(Sh_{oc}=k_{oc}d_{32}/D_c\). The latter two statements
require \(k_{oc}\) to be m/s.

Consequences:

- \(k_c=Sh_cD_c/d_{32}\) and \(k_d=Sh_dD_d/d_{32}\) have the expected m/s
  basis, once their Sherwood correlations are fully enabled.
- The printed Eq. (13) is dimensionally consistent only if \(k_{oc}\), \(k_c\),
  and \(k_d\) are all m/s and \(m\) is dimensionless.
- The s⁻¹ nomenclature entry for \(k_{oc}\) is
  `POSSIBLE_TYPESETTING_OR_TRANSCRIPTION_ERROR`. It must not be silently
  “corrected” in an implementation record.
- No source found defines \(m\), \(K_d\), \(K_{od}\), or an overall
  dispersed-side resistance equation.
- No source found defines \(K_d\) using mole fraction, mass fraction, molar
  concentration, or mass concentration.
- No source found defines \(K_{overall}a\) or \(Koa\).

Accordingly, the current ECR-2 candidate
\(1/K_{od}=1/k_d+K_d/k_c\) is **`STILL_UNRESOLVED`** — neither confirmed nor
contradicted by the recovered secondary evidence. No algebraic replacement is
authorized.

The often-used geometric expression
\(a=6\phi_d/d_{32}\) is stated in the 2011 paper when it converts a measured
volumetric coefficient to \(k_{oc}\). It is `STRONG_SECONDARY` as a geometric
area relation, but it is not explicitly attributed there to K&H (1999).

## 7. Dimensional audit

| Equation / quantity | Check | Result |
| --- | --- | --- |
| \(Re=d_{32}V_s\rho_c/\mu_c\) | \((m)(m/s)(kg/m^3)/(kg/(m\,s))\) | Dimensionless |
| \(Sc_j=\mu_j/(\rho_jD_j)\) | \((kg/(m\,s))/[(kg/m^3)(m^2/s)]\) | Dimensionless |
| \(Pe_c=d_{32}V_s/D_c\) | \((m)(m/s)/(m^2/s)\) | Dimensionless |
| \(V_s\mu_c/\sigma\) | \((m/s)(kg/(m\,s))/(kg/s^2)\) | Dimensionless |
| \((\psi/g)(\rho_c/(g\sigma))^{1/4}\) | \((m/s)(s/m)\) | Dimensionless |
| \(Sh_c, Sh_d, Sh_{c,\mathrm{rigid}}, Sh_{c,\infty}\) | All RHS terms | Dimensionless |
| Eq. (12) \(\psi\) | \((Af)^3/h_c\) | m²/s³ = W/kg |
| \(k_j=Sh_jD_j/d_{32}\) | \((1)(m²/s)/m\) | m/s |
| Eq. (13) | Requires \(m\) dimensionless and all \(k\) values in m/s | Formally consistent under that condition; printed \(k_{oc}\) s⁻¹ unit is flagged |
| \(a=6\phi_d/d_{32}\) | \(1/m\) | m²/m³ |

## 8. Required separation from later, device-specific correlations

The 2011 authors state that K&H correlations did not accurately predict their
pulsed disc-and-doughnut data, then introduce their own Eqs. (14)–(15):

\[
Sh_{oc}=-121.56+103.62Re^{0.16}(1-x_d),
\quad 11.73<Re<69.43\quad(d\to c),
\]

\[
Sh_{oc}=-119.50+113.30Re^{0.12}(1-x_d),
\quad 9.45<Re<57.08\quad(c\to d).
\]

These are `DEVICE_SPECIFIC_NOT_TRANSFERABLE`.

The 2017 Kuhni authors likewise introduce their own Eq. (27), based on their
113 mm pilot Kuhni column and their experimental directions:

\[
Sh_{oc}=4.89+2.19Re^{0.65}(1-\phi)\quad(d\to c),
\]

\[
Sh_{oc}=-5.19+5.39Re^{0.78}(1-\phi)^{0.46}\quad(c\to d).
\]

These are also `DEVICE_SPECIFIC_NOT_TRANSFERABLE`; they are not K&H (1999)
equations and must not be substituted into ECR-2’s K&H kernel.

## 9. Validity ranges

No original K&H validity ranges for \(Re\), \(Sc\), \(We\), \(Eo\), drop
diameter, viscosity ratio, interfacial tension, holdup, or power input were
recovered from the supplied sources. Status: **`NOT RECOVERED`**.

The ranges printed for the later 2011 pulsed-column fits above belong only to
those authors’ data and must not be propagated to K&H or ECR-2.

## 10. Final implementation gate

| Target | Evidence status | Implementation gate |
| --- | --- | --- |
| K&H \(Sh_c\) structure, including holdup and \(\psi\) factor | `VERIFIED_SECONDARY` | **NOT_READY**: Kuhni-specific \(\psi\) definition must be evidenced/governed before use |
| Eq. (8)/(18) \(C_1\) | `VERIFIED_SECONDARY` for \(C_1=7.5\) in Kuhni form | **NOT_READY** for project \(C_1=0.90\): it cannot be placed in this equation |
| \(Sh_{c,\mathrm{rigid}}\), \(Sh_{c,\infty}\), \(Pe_c\) | `STRONG_SECONDARY` | Ready only together with the governed \(Sh_c\) chain |
| \(k_c=Sh_cD_c/d_{32}\) | `STRONG_SECONDARY` | Same gate as \(Sh_c\) |
| K&H \(Sh_d\) printed structure | `STRONG_SECONDARY` | **NOT_READY**: Kuhni \(C_2\) and regime selection are missing |
| \(k_d=Sh_dD_d/d_{32}\) | `STRONG_SECONDARY` | Same gate as \(Sh_d\) |
| \(C_2=0.45\) role | `UNRESOLVED` | Not usable by symbol matching |
| \(F_c=0.76\), \(F_d=0.58\) roles | `UNRESOLVED` | Not usable by symbol matching |
| Rigid/circulating/oscillating criteria and characteristic velocity | `UNRESOLVED` | Not usable |
| Pulsed \(\psi\) formula | `DEVICE_SPECIFIC_NOT_TRANSFERABLE` | Do not use for Kuhni |
| \(K_d\), \(K_{od}\), \(K_{overall}\), \(Koa\) | `UNRESOLVED` | Do not enable rates |
| Eq. (13) overall continuous-side resistance | `STRONG_SECONDARY` with unit/definition defect | **NOT_READY**: \(m\) and coefficient basis are missing |
| \(a=6\phi_d/d_{32}\) | `STRONG_SECONDARY` (not specifically attributed to K&H) | Existing geometric relation may remain separate from K&H rate enablement |
| 2011/2017 authors’ fitted overall correlations | `DEVICE_SPECIFIC_NOT_TRANSFERABLE` | Do not import into ECR-2 |

## 11. Stop point for engineer review

The evidence is sufficient to preserve the K&H continuous-side formula and to
record the dispersed-side formula faithfully. It is insufficient to activate
Sherwood-dependent film, overall-coefficient, interfacial-rate, BVP, axial, or
optimisation calculations in ECR-2.

The next evidence search, if approved, must target only the missing published
definitions: Kuhni power dissipation for the K&H correction, K&H’s \(C_2\)
column value, regime selector and characteristic velocity, \(F_c/F_d\), and
the definition of \(m\)/\(K_d\) in the overall-resistance relation.