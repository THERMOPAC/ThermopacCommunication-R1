# ECR Pre-Pilot Modified UNIFAC (Dortmund) Coverage Review

## 1. Document status

**Status:** Technical review record  
**Review date:** 26 August 2026  
**Scope:** Parameter-completeness check for the five-component ECR Pre-Pilot
surrogate basis only  
**Result:** **PASS — no missing subgroup or required ordered main-group
interaction**

This review does not approve a production LLE implementation, establish
quantitative accuracy, or extend the model to Polar Aromatics or sulfur-bearing
families.

---

## 2. Reviewed basis

### 2.1 Project Owner determination

The first predictive Stage 2 basis is:

1. Saturates;
2. Mono-aromatics;
3. Di-aromatics;
4. Poly-aromatics; and
5. NMP.

Polar Aromatics is excluded from this first equilibrium basis. It remains an
explicit future component and must not be folded into another aromatic family.

### 2.2 Representative compounds

The reviewed representatives are those used by Coto et al. for the relevant
five-family coordinates:

| Family | Reviewed representative | CAS No. |
|---|---|---|
| Saturates | n-Dodecane | 112-40-3 |
| Mono-aromatics | Toluene or 1,4-xylene | 108-88-3 / 106-42-3 |
| Di-aromatics | 1-Methylnaphthalene | 90-12-0 |
| Poly-aromatics | Pyrene | 129-00-0 |
| Solvent | 1-Methylpyrrolidin-2-one (NMP) | 872-50-4 |

### 2.3 Explicit exclusions

- No Polar Aromatics group assignment.
- No sulfur-family or DBT group assignment.
- No RRBO pseudo-component group assignment.
- No fitted NRTL, UNIQUAC, or project-adjusted UNIFAC interaction.
- No LLE flash, phase-stability solver, or production code.
- No claim that pure-compound representatives fully describe physical SN300.

---

## 3. Parameter package identity and provenance

### 3.1 Governing public package for this review

| Field | Recorded value |
|---|---|
| Model | Modified UNIFAC (Dortmund) |
| Public package label | `2026 Published Parameters` |
| Publisher | UNIFAC Consortium / DDBST |
| Public matrix URL | <https://unifac.ddbst.com/files/unifac/Matrices/2026%20Published%20Parameters.pdf> |
| Public subgroup table | <https://www.ddbst.com/PublishedParametersUNIFACDO.html> |
| Matrix file metadata | 25-page PDF; created 31 July 2026; title `2026 Published Parameters.xls` |
| Retrieved | 26 August 2026 |
| Matrix SHA-256 | `cfd84d26444b20eb394afadaaf05b0f2a428a6600ab3ec2d5041f121b1781232` |
| Published-reference span listed by DDBST | Weidlich and Gmehling (1987) through Constantinescu and Gmehling (2016) |

The hash identifies the exact matrix reviewed. A later DDBST or consortium
update is a different parameter package and requires a new completeness and
regression review.

### 3.2 Experimental benchmark source

B. Coto, I. Suárez, M. J. Tenorio, and I. Huerga, “Extraction of aromatic
and polyaromatic compounds with NMP: experimental and model description,”
*Fluid Phase Equilibria* 554 (2022) 113293,
<https://doi.org/10.1016/j.fluid.2021.113293>.

The paper:

- identifies the reviewed compounds;
- reports five-component LLE systems at 298.15 K and atmospheric pressure,
  drawn from a six-molecule set in which toluene and 1,4-xylene are alternative
  mono-aromatics across feeds;
- compares several UNIFAC variants; and
- reports Modified UNIFAC (Dortmund) as the best overall variant tested while
  warning that some predicted compositions deviate by about 40%.

The paper does not identify a reproducible runtime parameter-package hash.
Therefore, its reported Dortmund results must be reproduced against the
package frozen above; matching the model name is not enough.

---

## 4. Reviewed subgroup assignments

### 4.1 Assignment table

| Component | Formula audit | Modified Dortmund subgroup assignment | Main groups used | Review |
|---|---|---|---|---|
| n-Dodecane | C12H26 | 2 × `[1] CH3` + 10 × `[2] CH2` | `[1] CH2` | PASS |
| Toluene | C7H8 | 5 × `[9] ACH` + 1 × `[11] ACCH3` | `[3] ACH`, `[4] ACCH2` | PASS |
| 1,4-Xylene | C8H10 | 4 × `[9] ACH` + 2 × `[11] ACCH3` | `[3] ACH`, `[4] ACCH2` | PASS |
| 1-Methylnaphthalene | C11H10 | 7 × `[9] ACH` + 2 × `[10] AC` + 1 × `[11] ACCH3` | `[3] ACH`, `[4] ACCH2` | PASS |
| Pyrene | C16H10 | 10 × `[9] ACH` + 6 × `[10] AC` | `[3] ACH` | PASS |
| NMP | C5H9NO | 3 × `[78] CY-CH2` + 1 × `[86] NMP` | `[42] CY-CH2`, `[46] CY-CONC` | PASS |

For NMP, subgroup `[86] NMP` represents the residual cyclic lactam/N-methyl
structural contribution after the three ring `CY-CH2` groups are counted.

### 4.2 Required subgroup records

| Subgroup No. | Subgroup | Main group No. | Main group | R | Q |
|---:|---|---:|---|---:|---:|
| 1 | CH3 | 1 | CH2 | 0.6325 | 1.0608 |
| 2 | CH2 | 1 | CH2 | 0.6325 | 0.7081 |
| 9 | ACH | 3 | ACH | 0.3763 | 0.4321 |
| 10 | AC | 3 | ACH | 0.3763 | 0.2113 |
| 11 | ACCH3 | 4 | ACCH2 | 0.9100 | 0.9490 |
| 78 | CY-CH2 | 42 | CY-CH2 | 0.7136 | 0.8635 |
| 86 | NMP | 46 | CY-CONC | 3.9810 | 3.2000 |

**Subgroup closure:** 7 required; 7 present; 0 missing.

---

## 5. Ordered interaction closure

### 5.1 Temperature convention

The Dortmund interaction polynomial is:

\[
a_{ij}(T) = A_{ij} + B_{ij}T + C_{ij}T^2
\]

and the residual-group interaction factor uses:

\[
\Psi_{ij}(T) =
\exp\left[-\frac{A_{ij}+B_{ij}T+C_{ij}T^2}{T}\right]
\]

with absolute temperature \(T\) in kelvin. The two directions are independent:
\((A_{ij},B_{ij},C_{ij})\) must not be copied into \(j \rightarrow i\).

The dated matrix prints explicit `0.000E+00` values for zero third-order terms.
Those recorded zeros are valid coefficients. A missing interaction row is not
a zero coefficient and must never be treated as one.

### 5.2 Required interaction records

The five required main groups are `[1] CH2`, `[3] ACH`, `[4] ACCH2`,
`[42] CY-CH2`, and `[46] CY-CONC`.

Each row below records both ordered directions as
`(A, B, C)`:

| Main-group pair | First direction | Reverse direction | Review |
|---|---|---|---|
| 1 ↔ 3 | 1→3 `(114.2, 0.0933, 0)` | 3→1 `(16.07, -0.2998, 0)` | PASS |
| 1 ↔ 4 | 1→4 `(7.339, -0.4538, 0)` | 4→1 `(47.2, 0.3575, 0)` | PASS |
| 1 ↔ 42 | 1→42 `(-117.1, 0.5481, -0.00098)` | 42→1 `(170.9, -0.8062, 0.001291)` | PASS |
| 1 ↔ 46 | 1→46 `(677.32, -2.0066, 0)` | 46→1 `(-249.85, 1.7054, 0)` | PASS |
| 3 ↔ 4 | 3→4 `(139.2, -0.65, 0)` | 4→3 `(-45.33, 0.4223, 0)` | PASS |
| 3 ↔ 42 | 3→42 `(134.6, -1.231, 0.001488)` | 42→3 `(-2.619, 1.094, -0.001557)` | PASS |
| 3 ↔ 46 | 3→46 `(313.79, -1.1552, 0)` | 46→3 `(-258.12, 1.4084, 0)` | PASS |
| 4 ↔ 42 | 4→42 `(-107.1, 0.2564, 0)` | 42→4 `(191.5, -0.5561, 0)` | PASS |
| 4 ↔ 46 | 4→46 `(72.26, -0.1919, 0)` | 46→4 `(763.57, -1.3961, 0)` | PASS |
| 42 ↔ 46 | 42→46 `(298.46, -0.6823, 0)` | 46→42 `(499.59, -0.8158, 0)` | PASS |

Same-main-group interactions use the model identity
\(a_{ii}=0,\ \Psi_{ii}=1\); they do not require fitted matrix rows.

**Interaction closure:** 10 unordered pairs; 20 required ordered directions;
20 present; 0 missing.

---

## 6. Applicability record

### 6.1 Facts

| Applicability question | Recorded answer |
|---|---|
| Can the public package represent every reviewed molecule? | Yes |
| Are all required subgroup R/Q records present? | Yes |
| Are all required ordered interaction polynomials present? | Yes |
| Does the public package declare one global numeric temperature-validity interval for these five components? | **No interval is stated in the reviewed package** |
| Can the polynomial be evaluated mathematically from 298.15 K to 373.15 K? | Yes |
| Does mathematical evaluation prove LLE validity over 25–100 °C? | No |
| Direct five-family LLE benchmark temperature in Coto et al. | 298.15 K |
| Direct five-family validation over the full 25–100 °C Pre-Pilot range | Not established |

### 6.2 AI technical analysis

The Dortmund package passes the parameter-completeness prerequisite for the
five reviewed representatives. This is a **coverage pass**, not an accuracy or
temperature-applicability pass.

The package can therefore enter a reproducible predictive LLE benchmark.
Until that benchmark is accepted:

- results remain predictive/preliminary;
- Coto phase compositions, phase split, and transfer trends must be reproduced
  at 298.15 K before any SN300 design conclusion;
- operation above the direct evidence temperature remains unvalidated; and
- no result may be labelled governed or release-ready solely because every
  parameter exists.

---

## 7. Missing-coverage behavior

There is no missing subgroup or interaction blocker for the reviewed
five-component basis.

For any future component or changed group assignment, the implementation must
re-run closure before calculation. If a required subgroup, R/Q record, or
ordered interaction is absent, return a specific blocker containing:

1. component name and CAS number;
2. missing subgroup or ordered main-group pair;
3. frozen parameter-package identity and hash; and
4. `NOT_CALCULABLE — DORTMUND_PARAMETER_COVERAGE_MISSING`.

Prohibited behavior:

- substituting zero for an absent interaction;
- copying the reverse-direction coefficient;
- silently dropping the unsupported group or component;
- substituting a chemically different representative; or
- using consortium-only parameters without separately recording their version
  and provenance.

---

## 8. Review conclusion

**Parameter-completeness decision:** **PASS**

Modified UNIFAC (Dortmund), using the frozen public 2026 package identified in
Section 3, contains every subgroup and every required ordered interaction for:

- n-dodecane;
- toluene or 1,4-xylene;
- 1-methylnaphthalene;
- pyrene; and
- NMP.

The concrete prerequisite for implementing the first reproducible predictive
five-component LLE benchmark is satisfied. Quantitative LLE performance and
the 25–100 °C applicability claim remain separate validation gates.