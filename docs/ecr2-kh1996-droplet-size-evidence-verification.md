# ECR-2 K&H 1996 Droplet-Size Evidence Verification

**Status:** Evidence gap confirmed — published ECR-2 d₃₂ route remains blocked  
**Assessment date:** 22 August 2026  
**Scope:** Kumar & Hartland (1996) d₃₂ correlation only. No BVP, holdup, interfacial-area, or mass-transfer equation is changed by this record.

## Decision

The published ECR-2 d₃₂ route **must remain `transcription_invalid` and non-executable**.

The authoritative publisher record establishes that Kumar and Hartland published a
unified drop-size study covering eight extraction-column types, including Kühni,
pulsed perforated-plate, and Karr columns. It does **not** expose the equation body,
parameter table, symbol definitions, phase convention, or length bases without
article access. No author-hosted or publisher-supported full-text equation record
was recovered in this assessment.

The available secondary Kühni reproduction is useful structural evidence, but it is
not a substitute for the primary equation. It leaves material equation notation
unresolved. The available Rahimpour table is a separate pulsed/Karr record and must
not be used as a Kühni equation.

## Direct-turbulence C-range verification

**Status:** no authoritative support found for `C = 0.36–0.43` in the ECR-2
direct-turbulence route. The interval remains a **project-controlled preliminary
sensitivity interval** and is not design-decision or release eligible.

### Route and claimed range assessed

The assessed route is:

\[
d_{32}=C\left(\frac{\gamma}{\rho_c}\right)^{0.6}\varepsilon^{-0.4},
\qquad
\varepsilon=\frac{N_e n^3d_R^5}{V_R}
\]

with dimensionless `C = 0.36–0.43`. This is not the K&H 1996 equation and is
not treated as a transcription, parameterisation, or substitute for K&H 1996.

### Sources inspected and exact limits

1. **Kumar, A.; Hartland, S.** “Unified Correlations for the Prediction of Drop
   Size in Liquid−Liquid Extraction Columns.” *Industrial & Engineering Chemistry
   Research* **35**(8), 2682–2695 (1996). DOI:
   [10.1021/ie950674w](https://doi.org/10.1021/ie950674w). The ACS publisher
   abstract/record confirms that the study includes Kühni columns and a
   high-agitation turbulence contribution, but does not expose an equation,
   coefficient table, or `C = 0.36–0.43` range. It cannot support this route or
   interval.
2. **Laitinen, A. T.; Penttilä, K. J. T.; Manninen, M. T.; Syrjänen, J. K.;
   Kaunisto, J. M.; Murtomäki, L. S.** “Axial Dispersion and CFD Models for the
   Extraction of Levulinic Acid from Dilute Aqueous Solution in a Kühni Column
   with 2-Methyltetrahydrofuran Solvent.” *Chemical Engineering Research and
   Design* **146**, 518–527 (2019). DOI:
   [10.1016/j.cherd.2019.04.018](https://doi.org/10.1016/j.cherd.2019.04.018).
   Its accepted manuscript, pp. 10–11, reproduces a different Kühni-specific
   `d32/h` relation with visible constants `1.6`, `0.034`, and `e^0.45`; it
   reports no `0.36–0.43` coefficient interval and no equation matching the
   direct-turbulence route. Its aqueous levulinic-acid/2MTHF bench column is not
   an RRBO/NMP applicability or calibration record.
3. **National Academies of Sciences, Engineering, and Medicine.** *Oil in the
   Sea IV: Inputs, Fates, and Effects*, Appendix F, “Technical Aspects of
   Equations and Models for Droplet Breakup in Turbulent Flows” (2022).
   [Online chapter](https://www.nationalacademies.org/read/26410/chapter/18).
   This is authoritative background for turbulent-breakup model limits, but
   discusses calibrated oil-jet and mixing-tank models rather than a Kühni
   extraction column. It supplies no basis for applying the stated range to the
   ECR-2 route.

### Applicability decision

No inspected source jointly establishes the exact equation, the stated C interval,
a mechanically agitated Kühni geometry, an NMP-continuous/RRBO-dispersed phase
convention, or calibration for the ECR-2 operating envelope. Therefore:

- `C = 0.36–0.43` may be used only to display the controlled preliminary
  sensitivity band after a nominal C and its audit reference are explicitly
  recorded;
- a nominal-C reference documents the selected sensitivity point, **not**
  authoritative verification of the interval;
- every result remains `PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED` and
  is not a design-decision or release basis;
- the direct-turbulence route must remain separate from K&H 1996, whose
  `transcription_invalid` lifecycle is unchanged.

Advancement requires: (1) a lawful primary or otherwise authoritative source that
prints the exact route and supports its C interval, (2) an explicit applicability
decision for the ECR-2 Kühni configuration and phase convention, (3) RRBO/NMP
pilot validation/calibration, and (4) governed review approval. No registry
evidence status is advanced by this verification.

## Recorded evidence

### A. Primary publication — authoritative bibliographic record only

**Kumar, A.; Hartland, S.** “Unified Correlations for the Prediction of Drop Size
in Liquid−Liquid Extraction Columns.” *Industrial & Engineering Chemistry Research*
**35**(8), 2682–2695 (8 August 1996). DOI:
[10.1021/ie950674w](https://doi.org/10.1021/ie950674w).

**Publisher record inspected:** ACS Publications DOI landing/abstract page, accessed
22 August 2026.

**What the publisher record supports:**

- exact title, authors, journal, volume, issue, pages, date, and DOI;
- the paper correlates average drop size for eight column types: rotating disk,
  asymmetric rotating disk, **Kühni**, Wirz-II, **pulsed perforated-plate**,
  **Karr reciprocating-plate**, packed, and spray columns;
- mechanically agitated columns use a two-term additive model involving a
  low-agitation interfacial-tension/buoyancy term and a high-agitation isotropic-
  turbulence term.

**What the publisher record does not support:**

- the equation body or a Kühni row;
- any coefficient or exponent;
- definitions of `H`, `h_c`, `Cψ1`, `Cψ`, `CΩ`, `CII`, `n`, `n1`, or `n2`;
- phase-continuity convention, transfer-direction convention, or length basis.

The accessible ACS record states that the article is available to purchase. This is
an explicit primary-evidence gap, not evidence that the equation is absent from the
paper.

### B. Secondary Kühni structural reproduction — not authoritative

**Laitinen, A. T.; Penttilä, K. J. T.; Manninen, M. T.; Syrjänen, J. K.; Kaunisto,
J. M.; Murtomäki, L. S.** “Axial Dispersion and CFD Models for the Extraction of
Levulinic Acid from Dilute Aqueous Solution in a Kühni Column with
2-Methyltetrahydrofuran Solvent.” *Chemical Engineering Research and Design*
**146**, 518–527 (2019). DOI: [10.1016/j.cherd.2019.04.018](https://doi.org/10.1016/j.cherd.2019.04.018).

The attached accepted manuscript identifies its Eq. (3) as using **Kühni-specific
parameters**. Its visually inspected transcription is:

\[
\frac{d_{32}}{h} =
\frac{e^{0.45}}
{1.6\left(\frac{\gamma}{(\rho_c-\rho_d)gH^2}\right)^{1/2}
+0.034\left[\left(\frac{\psi}{g}\right)
\left(\frac{\rho_c}{g\gamma}\right)^{1/4}\right]^{-0.63}
\left[h\left(\frac{\rho_cg}{\gamma}\right)^{0.38}\right]^{-1}}
\tag{Laitinen 2019, Eq. 3}
\]

This is a **literal secondary-source transcription for audit**, not a registered
ECR-2 equation. In particular, the source does not define uppercase `H` or the
numerator symbol rendered as `e`; the typeset form cannot safely establish whether
that glyph represents Euler’s constant, a coefficient, or another source symbol.
No conversion of this expression to a guessed `C₁ⁿ¹`, capillary-length grouping, or
ECR-2 numerical function is permitted.

Laitinen’s nomenclature does define `h` as compartment height, `γ` as interfacial
tension, `ρ` as mass density, `g` as gravity, and `ψ` as mechanical power
dissipation per unit mass in W/kg. Its accompanying prose identifies `ρ_c` and
`ρ_d` as continuous- and dispersed-phase densities. Those are secondary-source
definitions only.

### C. Pulsed/Karr evidence — explicitly excluded from Kühni mapping

**Rahimpour, N.; Bahmanyar, H.; Hemmati, A.; Asadollahzadeh, M.**
“Forecasting Sauter Mean Droplet Size and Examining the Range of Droplet Sizes in a
Tenova Liquid–Liquid Extraction Column.” *Scientific Reports* **14**, 3273
(2024). DOI: [10.1038/s41598-024-52542-1](https://doi.org/10.1038/s41598-024-52542-1).

The attached paper’s Table 1 is captioned as correlations for **pulsed columns**.
The Kumar & Hartland (1996) reference row is explicitly headed **“Pulse and karr”**
and “Different chemical systems.” It uses `h_c`, `Cψ`, the visible coefficients
1.55 and 0.42, and exponents 0.32, −0.35, and −1.15.

That table:

- corroborates that another secondary rendering has a reciprocal
  high-agitation contribution;
- is **not** a Kühni row;
- cannot identify `h_c` with Laitinen’s `h` or `H`;
- cannot transfer its coefficients, exponents, density basis, phase convention, or
  applicability to the ECR-2 Kühni route.

### D. Existing pulsed sieve-plate attachment — explicitly excluded

The attached Kumar & Hartland (1986) support is for a **liquid pulsed sieve-plate
extraction column**. Its visual Eq. (2) is a pulsed sieve-plate correlation with
pulsation terms. It is neither the 1996 paper nor a Kühni correlation and is not
used to resolve this record.

## Symbol and parameter resolution matrix

| Required item | Evidence status | Evidence and limit |
| --- | --- | --- |
| `d32` | Secondary-defined | Laitinen defines the Sauter mean drop diameter. Primary verification is pending. |
| `h` | Secondary-defined | Laitinen nomenclature: compartment height (m). It is not proven to be interchangeable with `H` or `h_c`. |
| `H` | **Unresolved** | Appears in Laitinen Eq. (3) low-agitation denominator but is not defined in the accompanying nomenclature. Its length basis is unknown. |
| `h_c` | **Pulsed/Karr-only** | Appears in Rahimpour Table 1’s “Pulse and karr” row. It cannot be mapped to the Kühni expression. |
| `γ`, `ρ_c`, `ρ_d`, `g`, `ψ` | Secondary-defined | Laitinen defines their physical roles and `ψ` in W/kg; primary notation and phase convention remain unverified. |
| numerator `e` | **Unresolved** | Laitinen Eq. (3) visibly shows `e^0.45` without a definition. Do not treat it as Euler’s constant or a renamed coefficient. |
| 1.6 and 0.034 | Secondary-visible | Visible in the Laitinen rendering; their original coefficient names and permitted mapping are not primary-verified. |
| 0.45 and −0.63 | Secondary-visible | Visible in the Laitinen rendering; whether they are the original `n1` and `n2` is not primary-verified. |
| 0.38 and the final inverse | Secondary-visible but grouping unresolved | The source typesets the factor as shown above. Its exact grouping/length basis cannot be rewritten from dimensional preference alone. |
| `Cψ1` / `Cψ` | **Unresolved** | No authoritative record was recovered. `Cψ` occurs only in the excluded pulsed/Karr table. `Cψ1` was not found in the inspected records. |
| `CΩ` | **Unresolved** | Not defined in the inspected authoritative or secondary records. |
| `CII` | **Unresolved** | Not defined in the inspected authoritative or secondary records. Do not equate it to a visually similar `C1`, `C2`, or `C3`. |
| `n`, `n1`, `n2` | **Unresolved** | The visible Laitinen exponents are recorded above, but original symbol names and placements are not established. |
| phase convention and transfer direction | **Unresolved** | The ECR-2 NMP-continuous/RRBO-dispersed convention is an ECR-2 model choice, not a verified K&H 1996 convention. |
| column/device applicability | Partially supported, not design-verified | The primary abstract names Kühni as one of eight types; only the Laitinen secondary form is specifically called Kühni. Applicability to ECR-2 geometry and NMP/RRBO is unverified. |
| validity range and calibration | **Unresolved** | No primary range or RRBO/NMP calibration is available. |

## Comparison with the historical ECR-2 path

The historical ECR-2 reconstruction must not be revived:

- it used an inferred `C₁ⁿ¹` numerator;
- it directly added the high-agitation contribution;
- the two secondary records show a reciprocal high-agitation structure;
- `H`, the numerator glyph, coefficient names/placement, phase convention, and
  length basis remain unresolved.

The currently active `transcription_invalid` route returns `null` d₃₂ and prevents
the published-correlation path from supplying interfacial area, holdup, or
mass-transfer/BVP results. An explicit engineer-supplied d₃₂ remains a separately
labelled simulator-development/sensitivity input, not a fallback published result.

## Recommendation and release gate

**Recommendation:** keep the published K&H 1996 d₃₂ path blocked. It must not enter
even a preliminary numerical route on the present evidence.

The minimum evidence needed before a governed review can consider an executable
Kühni route is:

1. a lawful full primary-paper copy or an author/publisher-supported equation record;
2. the exact Kühni equation and its table/legend, with every glyph and grouping
   transcribed from that source;
3. authoritative definitions of `H`, `h_c` where relevant, `Cψ1`, `Cψ`, `CΩ`,
   `CII`, `n`, `n1`, `n2`, all coefficients, exponents, density/phase convention,
   and length basis;
4. an explicit proof that the recovered row is Kühni, not pulsed perforated-plate
   or Karr;
5. a separate applicability and calibration decision for the ECR-2 NMP/RRBO system.

No numerical equation, BVP, holdup, or mass-transfer change is authorised by this
evidence record.
