# Job A — dimensional and magnitude assessment of liquid diffusivity and K&H \(Sh\)-to-\(k\)

## Scope and authority boundary

This is literature research only. It does not alter or extend frozen Stage-2 authority
`7C-1.5.0` for `SAT, MONO, DI, POLY, PA, NMP, H2O`. No missing symbol, coefficient,
component property, or Kumar–Hartland (K&H) validity limit is supplied by inference.

At least four independent search angles were used: original Wilke–Chang provenance and
units; Hayduk–Laudie/Hayduk–Minhas aqueous correlations; heavy-organic liquid
diffusivity alternatives; K&H single-drop/column correlations; NMP/water diffusion;
and the formal Sherwood-number definition.

## Evidence status

### Primary-source verification

1. **Wilke and Chang (1955), AIChE Journal 1(2), 264–270.** The publisher record
   verifies title, authors, date, pages, and DOI, but the fetched landing page does not
   expose the equation:
   <https://aiche.onlinelibrary.wiley.com/doi/10.1002/aic.690010222>.
   Saved as `research/sources/job-a/source-1.md`.
2. **Kumar and Hartland (1999), Chemical Engineering Research and Design 77(5),
   372–384.** The publisher abstract verifies that the continuous-phase correlation
   used 596 measurements from 10 groups (14.1% average absolute error), while predicted
   overall dispersed-phase coefficients had 24.5% average absolute relative error. It
   also verifies extension to pulsed-plate, Karr, Kühni, and rotating-disc columns by
   power-input and holdup correction factors. The fetched page does **not** expose the
   exact equations, definitions, database ranges, or units:
   <https://www.sciencedirect.com/science/article/pii/S0263876299718022>.
   Saved as `research/sources/job-a/kumar-hartland-1999-webfetch.md`.
3. **Miyabe and Isogai (2011).** The PubMed abstract reports experimental benzene
   diffusivities in six organic solvents and a modified Wilke–Chang treatment for
   polar solutes/solvents; the reported mean-square deviation is less than 19% for 71
   diffusivity data. This verifies that the association coefficient is not safely a
   universal constant for polar systems:
   <https://pubmed.ncbi.nlm.nih.gov/21855880/>.
   Saved as `research/sources/job-a/miyabe-2011-webfetch.md`.

### Secondary reproduction / interpretation

4. A University of Washington teaching handout reproduces the Wilke–Chang calculation
   at 25 °C. For methanol in water it gives \(T=298\) K, \(\phi_B=2.6\),
   \(M_B=18\), \(\mu_B=0.89\) cP, \(V_A=0.037\ {\rm m^3\,kmol^{-1}}\),
   \(D=1.94\times10^{-9}\ {\rm m^2\,s^{-1}}\), and a cited experimental value
   \(1.6\times10^{-9}\ {\rm m^2\,s^{-1}}\). For ethanol in water it gives
   \(V_A=0.0592\ {\rm m^3\,kmol^{-1}}\), predicted
   \(1.46\times10^{-9}\ {\rm m^2\,s^{-1}}\), and experimental
   \(1.28\times10^{-9}\ {\rm m^2\,s^{-1}}\):
   <https://courses.washington.edu/overney/privateChemE530/Handouts/2E%20Examples_liquid_%20diffusivity.pdf>.
   Saved as `research/sources/job-a/05-uw-wilke-chang-worked-example.md`.
5. Montagnaro (2024), peer-reviewed review, defines \(k_m\) with dimensions length/time
   and gives \(Sh=k_mL/D\) (Eq. 1), with \(L\) the characteristic length and \(D\) a
   diffusion coefficient. In its liquid-liquid extraction discussion it identifies
   \(L=d_{\rm drop}\):
   <https://www.mdpi.com/1996-1073/17/17/4342>.
   Saved as `research/sources/job-a/06-sherwood-review.md`.

The modern open review by Aniceto et al. additionally reports Wilke–Chang AARD values
of 40.92% for its polar set and 29.19% for its nonpolar set; its water and
supercritical-\(\mathrm{CO_2}\) systems were excluded. That is useful uncertainty
context, not RRBO/NMP validation:
<https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/>,
`research/sources/job-a/source-4.md`, abstract and Sections 1 and 2.4.

## Candidate Wilke–Chang assessment

The candidate is stated as

\[
D=5.9\times10^{-17}
\frac{\sqrt{\phi_B M_B}\,T}
{\mu_B(M_A/\rho_A)^{0.6}},
\]

with \(M\) numerically in g/mol, \(\rho\) in kg/m3, \(\mu\) in Pa s, and \(T\) in K.

### Dimensional consistency

* Wilke–Chang is an empirical, unit-bound correlation, not a dimensionally homogeneous
  law. Its numerical coefficient carries the residual dimensions. A bare coefficient
  cannot be moved between cP, Pa s, cm3/mol, and m3/kmol conventions.
* The secondary worked example uses the coefficient \(1.17\times10^{-13}\) with
  \(\mu\) in cP and \(V_A\) in m3/kmol. Converting only cP to Pa s requires
  \(1.17\times10^{-16}\), because \(1\ {\rm cP}=10^{-3}\ {\rm Pa\,s}\).
  The candidate coefficient \(5.9\times10^{-17}\) is only 0.504 of that reproduced
  coefficient. This factor-of-about-two discrepancy is unresolved by the fetched
  primary source and must not be silently accepted.
* More importantly, Wilke–Chang calls for **solute molar volume at its normal boiling
  point**. \(M_A/\rho_A\) formed from an operating-temperature liquid density is not
  automatically that property. Numerically, `(g/mol)/(kg/m3)` is L/mol, equal in
  numerical value to m3/kmol, but correct numerical units do not make operating
  density a valid substitute for normal-boiling molar volume.

**Illustrative audit calculation, not an admissible model input:** retaining every
published worked-example input above, converting \(0.89\) cP to
\(8.9\times10^{-4}\) Pa s, and changing only the coefficient to the candidate value
gives approximately \(9.8\times10^{-10}\ {\rm m^2/s}\), exactly 0.504 of the
handout's \(1.94\times10^{-9}\ {\rm m^2/s}\). This checks the unit conversion; it does
not validate methanol/water as an RRBO/NMP analogue.

### Signs and limiting behavior

For positive finite \(T,\mu_B,\phi_B,M_B,V_A\), Wilke–Chang returns \(D>0\).
Nonpositive viscosity, association factor, molecular weight, molar volume, or absolute
temperature is physically inadmissible and must block calculation.

Holding other properties fixed,

\[
D\propto T,\qquad D\propto\mu_B^{-1},\qquad D\propto V_A^{-0.6}.
\]

Thus heavier/larger SAT→MONO→DI→POLY/PA representatives should not become faster merely
because their labels are heavier: as \(V_A\to\infty\), the correlation gives
\(D\to0^+\). Molecular weight alone does not impose this ordering because it appears
only through a separately justified molar volume (and density can vary). Temperature
dependence must use viscosity at the same temperature. Formally,
\(d\ln D/dT=1/T-d\ln\mu/dT-0.6\,d\ln V_A/dT\) if all properties vary; consequently the
usual viscosity decrease with temperature reinforces the explicit \(T\) increase, but
no monotonic claim is admissible without the phase viscosity correlation.

The sourced small-solute aqueous examples are \(O(10^{-9})\ {\rm m^2/s}\). They support
a liquid-diffusivity sanity scale, not a value for SAT/MONO/DI/POLY/PA in viscous
RRBO/NMP. The correlation's own scaling says larger \(V_A\) and larger \(\mu\) can lower
that scale substantially; no numerical heavy-component floor is established here.

## Candidate Stokes–Einstein solvent self-diffusion assessment

For

\[
r_h=\left(\frac{3M}{4\pi\rho N_A}\right)^{1/3},\qquad
D_{\rm self}=\frac{k_BT}{6\pi\mu r_h},
\]

the dimensions close in SI:
\(k_BT\) is J = kg m2/s2 and \(\mu r_h\) is
(kg/(m s))m = kg/s, leaving m2/s. Positive finite \(M,\rho,\mu,T\) gives
\(r_h>0\) and \(D_{\rm self}>0\). At fixed density,
\(D_{\rm self}\propto T/\mu\) and \(D_{\rm self}\propto M^{-1/3}\), so the heavy-size
limit is \(0^+\), more weakly than Wilke–Chang's \(V^{-0.6}\).

This molecular-volume radius is an estimate, not primary verification of NMP or water
self-diffusion. No sourced NMP/H2O self-diffusion parameters were recovered in this
job, so no numerical self-diffusion calculation is admissible.

## Correct handling of NMP and H2O

* A component that is the bulk solvent of a phase must not be represented as its own
  infinitely dilute solute. NMP in an NMP-rich phase and H2O in a water-rich phase
  require measured self/mutual diffusion or an explicitly approved self-diffusion
  model.
* NMP or H2O may be treated as a dilute solute only in a phase where that approximation
  is demonstrably valid. The association factor and viscosity then belong to the
  **host phase**, while the molar volume belongs to the solute.
* NMP/water-rich mixtures and seven-component LLE phases are composition-dependent,
  potentially nonideal multicomponent media. Infinite-dilution scalar estimates are
  screening values, not Maxwell–Stefan matrices and not release-grade transport data.
* PA requires the same explicit physical representative and molar-volume evidence as
  SAT/MONO/DI/POLY; it cannot inherit POLY values by label similarity.

## K&H \(Sh\)-to-\(k\) conversion

From the sourced definition,

\[
Sh=\frac{kL}{D}\quad\Longrightarrow\quad k=\frac{Sh\,D}{L}.
\]

For drops, use the exact characteristic diameter specified by the correlation (the
review uses drop diameter; if K&H specifies another diameter, that primary definition
governs). With \(D\,[{\rm m^2/s}]\), \(L\,[{\rm m}]\), and dimensionless \(Sh\), the
result is \(k\,[{\rm m/s}]\). This is dimensionally consistent and positive only when
\(Sh,D,L>0\).

Phase and basis must not be crossed:

* \(Sh_c\) converts with \(D_c\) to \(k_c\).
* \(Sh_d\) converts with \(D_d\) to \(k_d\).
* An overall \(Sh_{oc}\) or \(Sh_{od}\) converts only with the diffusivity and driving
  force basis used in its definition.
* A normalized expression such as
  \((Sh-Sh_{\rm rigid})/(Sh_{\rm circ}-Sh_{\rm rigid})\) is not itself a Sherwood
  number and cannot be inserted into \(k=ShD/L\).

The K&H primary abstract does not expose the exact correlation or its ranges.
Therefore only the generic conversion is verified here. The exact K&H equation,
symbol definitions, diameter convention, direction/overall basis, correction factors,
and validity ranges remain a blocking evidence gap. Extrapolated formulas that yield
negative or nonfinite \(Sh\) must be rejected rather than clipped, and the reported
14.1%/24.5% source errors should not be mistaken for RRBO/NMP uncertainty bounds.

## Bottom line

1. \(k=ShD/L\) is dimensionally sound when phase, overall/individual basis, and length
   convention match the source.
2. The candidate Stokes–Einstein equations are dimensionally sound but unverified for
   NMP/H2O.
3. The candidate Wilke–Chang implementation has an unresolved factor-of-about-two
   coefficient discrepancy against an accessible academic reproduction and uses
   operating-density molar volume where the reproduced equation requires
   normal-boiling molar volume.
4. All candidate estimators have the expected positive \(T/\mu\) behavior and tend to
   zero for increasing molecular size, but none supplies admissible seven-component
   RRBO/NMP inputs without component-, phase-, composition-, and temperature-specific
   evidence.