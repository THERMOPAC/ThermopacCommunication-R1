# Frozen 7C normal-boiling molar-volume evidence

Scope: literature research only for Stage-2 authority `7C-1.5.0`; no implementation and no pseudo-component substitution.

## Frozen identities recovered from repository context

The exact six-component basis is in `.agents/outputs/ecr-pre-pilot-six-component-thermodynamics/results.json`; H2O is the seventh-component extension required by `.agents/memory/ecr-prepilot-water-admission-boundary.md`.

| Family | Frozen representative | CAS RN | InChIKey |
|---|---|---|---|
| SAT | n-dodecane | 112-40-3 | SNRUBQQJIBEYMU-UHFFFAOYSA-N |
| MONO | n-propylbenzene | 103-65-1 | ODLMAHJVESYWTB-UHFFFAOYSA-N |
| DI | 1-methylnaphthalene | 90-12-0 | QPUYECUOLPXSFR-UHFFFAOYSA-N |
| POLY | pyrene | 129-00-0 | BBEAQIROQSPTKN-UHFFFAOYSA-N |
| PA | 4,4'-bis(alpha,alpha-dimethylbenzyl)diphenylamine | 10081-67-1 | UJAWGGOCYUPCPS-UHFFFAOYSA-N |
| NMP | N-methyl-2-pyrrolidone (1-methyl-2-pyrrolidinone) | 872-50-4 | SECXISVLQFMRJM-UHFFFAOYSA-N |
| H2O | water | 7732-18-5 | XLYOFNOQVPJJNP-UHFFFAOYSA-N |

The PA identity is independently frozen in `.agents/memory/ecr-prepilot-pa-admission-boundary.md`; it must not be replaced by diphenylamine or a sulfur compound.

## Search and fetch record

Nine diverse direct `webSearch` calls were made: NIST searches for (1) SAT/MONO, (2) DI/POLY, (3) NMP/H2O; (4) PA government/manufacturer evidence; saturated-density searches for (5) SAT/MONO/DI and (6) POLY/NMP/H2O; (7) Tyn-Calus normal-boiling-volume equation; (8) PA boiling/decomposition evidence; and (9) an equation-specific Tyn-Calus search.

Four best compound records were fetched directly with `webFetch` and preserved verbatim:

- NIST dodecane: https://webbook.nist.gov/cgi/cbook.cgi?ID=C112403&Mask=4
- NIST n-propylbenzene: https://webbook.nist.gov/cgi/cbook.cgi?ID=C103651&Mask=4
- NIST 1-methylnaphthalene: https://webbook.nist.gov/cgi/cbook.cgi?ID=C90120&Mask=4
- NIST NMP: https://webbook.nist.gov/cgi/cbook.cgi?ID=C872504&Mask=4

The saved files are `property-01-nist-dodecane.md` through `property-04-nist-nmp.md`. NIST Chemistry WebBook is SRD 69, DOI https://doi.org/10.18434/T4D303. The directly fetched records are an authoritative evaluated compilation, not the primary experimental papers themselves. Values below identified as “NIST verified” are verified in that compilation; they are not relabeled as primary measurements.

An academic secondary source already fetched under this job is Aniceto et al. (2021), *Materials* 14, 542, https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/ (`source-4.md` / `06-aniceto-2021-predictive-models.md`). Its Table 2 is explicitly a reproduction/compilation with letter-coded underlying sources and estimates. It is not primary property evidence.

## Verified values and defensible routes

`Vb` means saturated-liquid molar volume at the normal boiling point. A room-temperature density is not `Vb`. The exact conversion, when a density at the boiling point is available, is:

`Vb (cm3 mol-1) = MW (g mol-1) / rho_sat(Tb) (g cm-3)`.

No density value has been extrapolated to `Tb` in this report.

| Family | MW, g mol-1 | Normal boiling point | Direct `Vb` status | Defensible next route |
|---|---:|---:|---|---|
| SAT | 170.3348, NIST verified | `489 ± 2 K`, NIST average of 22 values | **Unresolved** | Obtain primary saturated-liquid density at 489 K and apply `MW/rho_sat`; alternatively use the Tyn-Calus `Vb` estimator only after equation/units are verified from the original source. |
| MONO | 120.1916, NIST verified | `432 ± 2 K`, NIST average of 41/46 values | **Unresolved** | Obtain primary saturated-liquid density at 432 K and apply `MW/rho_sat`; same qualified Tyn-Calus alternative. |
| DI | 142.1971, NIST verified | `515 ± 7 K`, NIST average of 30 values | **Unresolved** | Obtain primary saturated-liquid density at 515 K and apply `MW/rho_sat`; same qualified Tyn-Calus alternative. |
| POLY | 202.2506, NIST search record | Academic secondary Table 2 gives `667.95 K`, source code `h` = Yaws (1998) | **Unresolved** | Verify whether a stable 1-atm liquid boiling point exists and obtain saturated-liquid density there. Do not treat the secondary Yaws reproduction as primary. Tyn-Calus is only an estimation route after authentic critical volume and equation-level verification. |
| PA | 405.58 in frozen repository identity; search results support 405.57 g mol-1 | **Unresolved; no authoritative normal boiling point found** | **Unresolved** | First establish experimentally whether the exact CAS 10081-67-1 reaches a stable normal boiling point rather than decomposing. Without `Tb`, `rho_sat(Tb)`, or an authenticated critical volume, no normal-boiling molar volume is defensible. Do not substitute diphenylamine. |
| NMP | 99.1311, NIST verified | `475.2 K`, NIST citing Weast and Grasselli (1989) | **Unresolved** | Primary candidate: Kneisl and Zondlo, *J. Chem. Eng. Data* 32 (1987) 11-13, “Vapor pressure, liquid density, and the latent heat of vaporization as functions of temperature for four dipolar aprotic solvents,” DOI https://doi.org/10.1021/je00047a003. Extract its density correlation/table at 475.2 K before calculating `Vb`. |
| H2O | 18.01528 g mol-1 (standard identity; exact value not refetched here) | NIST search result: `373.17 ± 0.04 K`, average of 7 values; direct URL https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=7 | **Unresolved in fetched evidence** | Query an accepted water equation of state/IAPWS saturated-liquid density at 373.15 K, then apply `MW/rho_sat`. Do not silently use density at 20 or 25 °C. |

### Secondary estimation evidence, with limitations

Aniceto et al., section 2.1, states that its solute normal-boiling molar volumes were estimated by the Tyn-Calus equation. Its Table 1 defines critical volume in `cm3 mol-1`; Table 2 reproduces critical volumes including n-dodecane `713`, n-propylbenzene `440`, pyrene `630`, and water `57.10 cm3 mol-1`. Table 2 identifies the first two and water as Reid et al. reproductions (`i`) and pyrene as Yaws (1998) (`h`). These are **secondary inputs**, not measured `Vb`.

The equation-specific web search found a Stanford dissertation reproduction stating `Vb = 0.285 Vc^1.048` (https://pangea.stanford.edu/ERE/pdf/pereports/MS/Dutta09.pdf). That PDF was not among the four direct fetches, and the original Tyn-Calus equation body was not recovered as machine-readable primary text. Therefore no numerical `Vb` is calculated here. Before governed use, verify the equation, dimensional convention (`Vb` and `Vc` in `cm3 mol-1`), applicability, and original citation: Tyn and Calus (1975), *J. Chem. Eng. Data* 20, 106-109, DOI https://doi.org/10.1021/je60064a006.

## Wilke-Chang association parameter

This parameter is an empirical solvent association factor, not a universal pure-component constant.

- Directly fetched COMSOL 6.4 secondary documentation, https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html, Table 6-9 (`supplement-3.md`), gives `phi = 2.26` for water, `1.9` methanol, `1.5` ethanol, and `1` for “others.”
- Aniceto et al. gives `1.9` methanol, `1.5` ethanol, and `1.0` for an unassociated solvent.
- No fetched primary source verifies identity-specific factors for n-dodecane, n-propylbenzene, 1-methylnaphthalene, pyrene, CAS 10081-67-1, or NMP.

Accordingly:

| Identity | Association-factor status |
|---|---|
| H2O | `phi = 2.26` is a documented **secondary software convention**, not primary verification. |
| SAT, MONO, DI, POLY, PA, NMP | Identity-specific value **unresolved**. `phi = 1` may be declared only as the documented “other/unassociated” screening convention; it must not be presented as measured or fitted evidence. In particular, NMP's polarity does not justify inventing a special value. |

COMSOL additionally warns that Wilke-Chang is unsuitable when water is the solute and applies the Kooijman correction by multiplying water's normal-boiling liquid molar volume by `4.5`. This correction is separate from `phi_water` and must not be conflated with it.

## Explicit unresolved list

1. Primary saturated-liquid density at each exact normal boiling point for SAT, MONO, DI, POLY, NMP, and H2O.
2. Any authenticated normal boiling point, stable-liquid density, critical volume, or normal-boiling molar volume for exact PA CAS 10081-67-1.
3. Direct experimental `Vb` for all seven identities.
4. Equation-level primary verification and units for the Tyn-Calus `Vb` estimator.
5. Identity-specific Wilke-Chang association factors for all components except the documented secondary water convention.
6. Primary verification that pyrene's reproduced `667.95 K` value is a true stable normal boiling point rather than an extrapolated/decomposition-affected value.

These gaps prohibit inventing pseudo-component data or silently replacing any frozen representative.