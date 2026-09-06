# Liquid-diffusivity estimator review for the 7C pre-pilot basis

Scope: SAT, MONO, DI, POLY, PA, NMP, H2O; frozen Stage-2 authority 7C-1.5.0. This is literature research only, not an implementation specification.

## Evidence status

**Primary-source pages verified by direct `webFetch`:**

1. Wilke & Chang (1955), *AIChE Journal* 1, 264-270, DOI 10.1002/aic.690010222:  
   https://aiche.onlinelibrary.wiley.com/doi/10.1002/aic.690010222
2. Tyn & Calus (1975), *J. Chem. Eng. Data* 20, 106-109, DOI 10.1021/je60064a006:  
   https://pubs.acs.org/doi/10.1021/je60064a006
3. Hayduk & Minhas (1982), *Can. J. Chem. Eng.* 60, 295-299, DOI 10.1002/cjce.5450600213:  
   https://onlinelibrary.wiley.com/doi/10.1002/cjce.5450600213

The publisher extractions verify bibliographic identity and abstracts, but do **not** expose the equation bodies as machine-readable text. The Hayduk-Minhas abstract explicitly says its correlations are for infinite-dilution normal-paraffin, aqueous, and general polar/nonpolar solutions, using solute/solvent molar volumes, parachors, and radii of gyration. The Tyn-Calus abstract states that its correlation covers infinite-dilution and self-diffusion coefficients. These are primary-source verifications; equations below are identified as secondary reproductions rather than falsely attributed as equation-text directly recovered from the originals.

**Academic/technical secondary reproductions directly fetched:**

- D. C. Cunha et al. (2021), *Materials* 14, 542, PMCID PMC7866074:  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/
- COMSOL 6.4 Transport Properties, equations 6-240 through 6-246 and model-selection rules:  
  https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html
- Sousa & Matos (2020) letter warning about the printed normal-paraffin Hayduk-Minhas expression, DOI 10.1002/cjce.23651:  
  https://onlinelibrary.wiley.com/doi/10.1002/cjce.23651

Raw fetched evidence is retained alongside this report as `source-1.md` through `source-4-cont.md` and `supplement-1.md` through `supplement-3.md`.

## Correlations and inputs

Notation: `i` or A is the dilute solute; `j` or B is the solvent. `D_ij^∞` is directional tracer/infinite-dilution diffusivity, not a finite-composition mutual diffusivity. In the conventional cgs reproductions below, `D` is cm²/s, `T` K, solvent viscosity `mu_j` cP, molar volumes `V` cm³/mol (normally liquid molar volume at the normal boiling point), molecular weight `M` g/mol, and parachor `P` has the internally consistent conventional parachor units used by the source correlation. Convert cm²/s to m²/s by multiplying by 10^-4.

### Wilke-Chang

Secondary reproduction:

`D_ij^∞ = 7.4e-8 * (phi_j M_j)^0.5 * T / (mu_j V_i^0.6)`

Inputs: solvent association factor `phi_j`, solvent molecular weight and viscosity, solute molar volume at normal boiling point, temperature. COMSOL Table 6-9 gives `phi = 2.26` water, `1.9` methanol, `1.5` ethanol, and `1` others. Cunha et al. use 1.9, 1.5, and 1.0 for methanol, ethanol, and unassociated solvents, respectively.

Restrictions: infinite dilution; empirical Stokes-Einstein modification. COMSOL explicitly says it is not suitable when water is the **solute** and applies the Kooijman correction (`V_water` multiplied by 4.5) in that case. No fetched primary evidence establishes a special NMP association factor, so `phi_NMP` must not be invented. Treat NMP as the documented “other” case only if this secondary convention is deliberately adopted.

### Scheibel

Common secondary reproduction:

`D_ij^∞ = 8.2e-8 * T / (mu_j V_i^(1/3)) * [1 + (3 V_j / V_i)^(2/3)]`

Inputs: temperature, solvent viscosity, and solute/solvent normal-boiling molar volumes. It avoids Wilke-Chang’s empirical association factor. The present fetches verified the 8.2e-8 constant through the 1997 *Analytical Chemistry* search record, but did not recover the original Scheibel paper or its complete machine-readable equation. Therefore this formula is a **secondary reproduction requiring equation-level checking before governed use**, not primary-source verified evidence. No fetched source established a defensible heavy-oil viscosity range.

### Tyn-Calus

Common secondary reproduction corresponding to COMSOL equation 6-241:

`D_ij^∞ = 8.93e-8 * (V_j^0.267 / V_i^0.433) * (T / mu_j) * (P_j / P_i)^0.15`

Inputs: `T`, solvent viscosity, both normal-boiling liquid molar volumes, and both parachors. COMSOL states all of these are required (lines corresponding to equation 6-241). Its documented corrections include special treatment for water solute and organic acids; these must not be generalized to PA unless the exact structural trigger and solvent exception apply.

Strength: unlike Wilke-Chang, explicitly uses both molecular sizes and parachors; the original abstract states the work also addresses self-diffusion. Weakness: authentic parachors and normal-boiling liquid volumes are often unavailable or ill-defined for RRBO pseudo-components and nonvolatile POLY material. Estimated pseudo-properties compound uncertainty.

### Hayduk-Minhas

Normal-paraffin form, secondary reproduction:

`D_ij^∞ = 13.3e-8 * T^1.47 * mu_j^epsilon / V_i^0.71`

`epsilon = 10.2 / V_i - 0.791`

Inputs: `T`, solvent viscosity, and solute normal-boiling molar volume. This branch is specifically for a normal-paraffin solute in a normal-paraffin solvent. A 2020 letter (DOI above) reports that the 1982 equation and a later Hayduk reproduction may contain typographical issues; the exact printed form must therefore be checked against the letter/PDF before governed calculation.

The 1982 paper also proposed separate aqueous and general polar/nonpolar equations involving molar volumes, parachors, and radii of gyration. Their exact symbols and coefficients were not exposed in the fetched primary page, so they are intentionally **not reconstructed here**. COMSOL confirms three separate branches (equations 6-242 aqueous, 6-243 normal paraffin, 6-244 general).

Applicability warning: RRBO is not a normal paraffin. SAT may contain branched/cyclic saturates and unresolved mixtures; MONO/DI/POLY are aromatic classes. The normal-paraffin branch is defensible only for individually identified normal alkanes, never for the bulk RRBO phase or class labels.

### Siddiqi-Lucas

Organic-solution secondary reproduction:

`D_ij^∞ = 9.89e-8 * T / (mu_j^0.907 V_i^0.265 V_j^0.45)`

Equivalent SI-prefactor reproduction uses `9.89e-12` to return m²/s while retaining K, cP, and cm³/mol inputs.

Inputs: `T`, solvent viscosity, and solute/solvent normal-boiling liquid molar volumes. COMSOL equation 6-246 identifies this as the organic-solution branch; equation 6-245 is a distinct aqueous branch, and normal-paraffin systems are referred to Hayduk-Minhas. COMSOL’s operational definition of “organic” requires at least one carbon bonded to something other than only O or C.

The original 1986 paper reports an extensive collection of about 1925 points in its abstract/search record, but the fetched publisher page was blocked and the exact original accuracy statement was not recoverable. Therefore do not attach an invented average error to this correlation.

### Other defensible options

- **Measured directional tracer/self-diffusion at process temperature and representative composition** is the first authority, especially for viscous RRBO.
- **System-fitted Magalhães correlation**: Cunha et al. report global AARD 5.19% polar and 6.19% nonpolar, but two parameters must be fitted for each binary system. It is not predictive without data.
- **Cunha et al. gradient-boosted models**: 5.07% global AARD for the polar test set and 5.86% for nonpolar. However, their validated solvent-viscosity domains were 0.0241-17.6 cP (polar) and 0.0229-2.92 cP (nonpolar), and water and supercritical CO2 were excluded. This makes the nonpolar model unsuitable for a genuinely viscous RRBO phase outside 2.92 cP and means the polar model cannot be claimed as NMP-specific without checking training-system coverage.
- **Zhu hybrid/free-volume model**: limited to nonpolar/weakly polar fluids; Cunha et al. found 37.93% global AARD, worse than Wilke-Chang and Tyn-Calus for their nonpolar set.
- **Erkey-Rodden-Akgerman**: COMSOL restricts its automatic use to normal-paraffin solvents with required density/Lennard-Jones inputs and certain solutes. It is not a bulk-RRBO estimator.

## Validation evidence and limitations

Cunha et al. Table 4 (polar test set, 79 systems/430 points):

- Wilke-Chang: global AARD 40.92%; arithmetic system AARD 41.35%; system range 1.37-197.71%.
- Tyn-Calus: global AARD 46.49%; arithmetic system AARD 38.41%; system range 2.88-97.11%.

Table 5 (nonpolar test set, 130 systems/342 points):

- Wilke-Chang: global AARD 29.19%; arithmetic system AARD 28.20%; system range 0.26-172.30%.
- Tyn-Calus: global AARD 28.84%; arithmetic system AARD 27.82%; system range 0.18-64.97%.

The full compilation spans 213.2-567.2 K and 0.30-1.65 g/cm³, 244 systems and 2560 points (1431 polar, 1129 nonpolar), excluding water as solvent from model development. These are broad modern benchmark statistics, **not validation for NMP/RRBO specifically**. The paper observes Wilke-Chang overpredicting high and underpredicting low polar diffusivities, while Tyn-Calus systematically underpredicts polar-solvent values. Large maximum errors preclude treating either as a single “truth” value.

## Recommended hierarchy for the pre-pilot basis

### NMP-rich phase

1. Measured `D_i,NMP` (or a system-specific correlation fitted to measured data) at temperature and representative phase composition.
2. For identified organic molecules with real pure-component volumes: Siddiqi-Lucas organic branch as the primary screening estimator.
3. Tyn-Calus as an independent cross-check only when authentic `P_i`, `P_NMP`, `V_i`, and `V_NMP` are available.
4. Wilke-Chang as a low-input fallback/sensitivity bound, with documented `phi_NMP = 1` convention rather than a fitted or invented association factor.
5. Scheibel only as another sensitivity check after equation-level source verification.

For H2O diffusing in NMP, do not use uncorrected Wilke-Chang. Do not use an “aqueous” Siddiqi-Lucas/Hayduk-Minhas branch because NMP, not water, is the solvent. Prefer measured H2O-in-NMP data; otherwise report the organic/general estimates as extrapolations with the explicit water-solute correction used.

### RRBO-rich phase

1. Measured diffusivities in the actual equilibrated RRBO-rich phase. Viscosity must be measured at process temperature and composition; a bulk petroleum phase cannot be represented reliably by one molecular volume/parachor.
2. Constituent-level estimates for chemically identified molecules, then a documented class aggregation. For an identified normal alkane in an identified normal-alkane solvent, Hayduk-Minhas normal-paraffin is preferred.
3. For identified non-normal organic constituents, Siddiqi-Lucas organic and Tyn-Calus (if authentic parachors exist) form the principal independent pair.
4. Wilke-Chang/Scheibel provide broad sensitivity bounds only.
5. Do not use Cunha’s nonpolar ML model beyond its 2.92 cP validated viscosity ceiling. Do not use normal-paraffin Hayduk-Minhas for SAT/MONO/DI/POLY/PA class pseudo-components or bulk RRBO.

### Self- and counter-solvent cases

- `D_i,j^∞` and `D_j,i^∞` are distinct because solvent viscosity and molecular descriptors switch; never force symmetry or average them without a cited mixing rule.
- For NMP transport into RRBO-rich liquid, estimate `D_NMP,RRBO` using RRBO-rich viscosity and a defensible molecular description of the local continuous phase. For RRBO constituents into NMP-rich liquid, estimate each `D_i,NMP` using NMP-rich viscosity.
- For true pure-liquid self-diffusion (`D_i,i`), use measurement first. The Tyn-Calus primary abstract says self-diffusion is within its scope, but the directly fetched equation text did not expose the self-diffusion specialization; no missing symbols or coefficients should be inferred.
- At finite composition, these infinite-dilution tracer estimates are not automatically Maxwell-Stefan or Fick mutual diffusivities. Thermodynamic-factor and composition dependence require separate evidence.

## Decision

No one correlation is release-grade for all seven components. For the pre-pilot transport basis, use measured/system-calibrated values where possible and carry an estimator envelope otherwise. Siddiqi-Lucas plus Tyn-Calus is the most defensible screening pair for molecular organic solutes in NMP-rich liquid; Hayduk-Minhas is a narrow special-case authority for verified normal-paraffin pairs; Wilke-Chang and Scheibel are fallback checks. In viscous, compositionally unresolved RRBO, correlation outputs are uncertainty bounds, not validated properties.