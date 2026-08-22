---
name: K&H 1986 pulsed-column evidence boundary
description: What Usman et al. (2009) establishes about the distinct Kumar and Hartland 1986 pulsed sieve-plate drop-size correlation and its limited bridge to the 1996 unified work.
---

Usman et al. (2009), “Drop Size in a Liquid Pulsed Sieve-Plate Extraction Column,” reproduces **Kumar and Hartland (1986)** Eq. (2), *Prediction of Drop Size in Pulsed Perforated-Plate Extraction Columns*, Chem. Eng. Commun. 44, 163–182, DOI 10.1080/00986448608911353. It is a pulsed perforated/sieve-plate correlation, not the K&H 1996 Kühni path.

**Why:** Its nomenclature explicitly defines \(d_{32}\) as the volume-surface/Sauter mean diameter, \(\Delta\rho\) as the density difference between heavier and lighter phases, and \(\sigma\) as interfacial tension. Those definitions and data are useful supporting hydrodynamic evidence, but importing its equation would cross an unsupported column-type boundary.

**How to apply:** Do not implement the 1986 equation in the ECR-2 Kühni d32 route. It has no \(H/h_c\), \(C_{\psi1}/C_\psi\), \(C_\Omega\), \(C_{\mathrm{II}}\), \(n\), \(n_1\), or \(n_2\) notation and cannot directly resolve them.

## Physical context, not an acceptance limit

Usman measured benzoic-acid/kerosene/water drops at 20 ± 1 °C in a 5 cm, 80-plate pulsed sieve-plate column. The reported measured \(d_{32}\) values span **1.76–5.33 mm**. Treat this only as a system- and regime-specific millimetre-scale sanity reference; it is not an ECR-2/Kühni calibration target, tolerance, or acceptance limit. The paper reports up to 50–53% deviation in the lower mixer-settler region, despite generally less than 10% deviation in its dispersion region.

## 1986 → 1996 research link

Usman cites Kumar and Hartland (1996), *Unified Correlations for the Prediction of Drop Size in Liquid–Liquid Extraction Columns*, Ind. Eng. Chem. Res. 35, 2682–2695, DOI 10.1021/ie950674w, but supplies no 1996 equation or symbol mapping. The official 1996 abstract says it covers eight column types including Kühni and pulsed perforated-plate columns; it also says a second two-term form introduces compartment height and gravity. This is a credible route for locating the meaning of the 1996 \(H/h_c\) basis, but it does not prove that the 1986 pulsed equation is inherited by the 1996 Kühni expression.

**How to apply:** Keep the ECR-2 Kühni route at `PRIMARY_SOURCE_UNVERIFIED_KH1996` until the authoritative 1996 Kühni-specific equation, definitions, and applicability conditions are recovered. Rahimpour’s “Pulse and karr” row remains structural evidence only.