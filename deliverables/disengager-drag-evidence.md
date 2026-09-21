# Verified literature and applicability: independent drag review

## Primary source actually retrieved and checked

Win Myint, Shigeo Hosokawa and Akio Tomiyama, **Terminal Velocity of Single Drops in Stagnant Liquids**, *Journal of Fluid Science and Technology* **1**(2), 72–81 (2006). DOI: **10.1299/jfst.1.72**.

- Publisher article: https://www.jstage.jst.go.jp/article/jfst/1/2/1_2_72/_article/-char/en
- Open publisher PDF: https://www.jstage.jst.go.jp/article/jfst/1/2/1_2_72/_pdf/-char/en
- Saved original: `disengager-drag-myint-2006.pdf`; searchable page-preserving extraction: `disengager-drag-myint-2006.txt`.
- This is a liquid–liquid single-drop experiment, not merely a gas-bubble analogy. Conclusions and reported envelope were verified on pp. 79–80; actual equations on pp. 73 and 77. PDF and extraction are retained so mathematical transcription can be independently checked.

### Equations checked against the paper

Definitions (p. 72, Eqs. 1–3), using magnitudes of density difference for falling drops:

- Re = rho_c vt d / mu_c.
- Eo = |rho_c − rho_d| g d² / sigma.
- M = g mu_c⁴ |rho_c − rho_d| / (rho_c² sigma³).
- kappa = mu_d/mu_c (the paper's viscosity ratio).

Hadamard–Rybczynski (p. 73, Eq. 4):

**CD = (8/Re) (2 + 3 kappa)/(1 + kappa).**

Combine this with buoyancy/drag balance to obtain
**vt_HR = vt_Stokes × 3(1+kappa)/(2+3kappa)**,
where **vt_Stokes = |delta rho| g d²/(18 mu_c)**.
This is a creeping-flow, spherical, clean-interface result, not a finite-Re correction. The paper describes the associated low-Re interface model as applicable to spherical particles at extremely low Re (Re<1). Here Re≤0.1 is deliberately used as a conservative diagnostic applicability screen: all requested 700–1200-mm bottom cutoff Re exceed 0.1, so Stokes/HR are not used as the design calculation.

Schiller–Naumann (p. 77, Eq. 10):

**CD = (24/Re)(1 + 0.15 Re^0.687).**

The paper identifies this as a single spherical solid-particle equation. The imported existing calculator is exactly this form; it is not modified. The source's original citation (p. 81, ref. 15) is Schiller and Nauman, VDI **77** (1933), 318–320. This corrects the commonly repeated 1935 date found in some secondary sources. No original-paper DOI is asserted.

Myint–Hosokawa–Tomiyama liquid-drop model (p. 77, Eq. 9):

**CD = [8(2 + 3 kappa + 3C/mu) / {Re(1 + kappa + C/mu)}] (1 + 0.15 Re^0.687).**

C/mu is the paper's surfactant-retardation parameter. For clean drops C=0, hence **CD_clean = CD_SN × (2+3kappa)/[3(1+kappa)]**; fully contaminated-interface limit C/mu→∞ gives SN. This is an explicitly published combination, **not** an invented multiplication of HR and SN. We do not estimate or fit intermediate contamination.

The reported experimental envelope (pp. 79–80) is:
**−11.6 < log10 M < −0.9; 0.17 < Re < 200; 0.017 < Eo < 12.1; 0.1 < kappa < 100.**
Maximum observed terminal-speed prediction error is reported as about 10% within the tested conditions; this is not a statistical design allowance or a guaranteed bound for another fluid pair.

### Deformation comparison: what the source does and does not establish

The paper discusses measured drop shapes on p. 77 and reports the range up to Eo=12.1. Eq. 9 is therefore useful liquid-drop evidence over its tested envelope, but has **no explicit Eo deformation branch**. It must not be advertised as a universally applicable deformed-drop closure.

On p. 73 the paper also reproduces **Tomiyama et al.'s bubble** equations, including the fully contaminated-bubble Eq. 8:

**CD = max[(24/Re)(1+0.15 Re^0.687), (8/3) Eo/(Eo+4)].**

The second term is a deformation-related drag branch. The cited bubble original is Tomiyama, Kataoka, Zun and Sakaguchi, *JSME International Journal Series B* **41**(2), 472–479 (1998), DOI **10.1299/jsmeb.41.472**, publisher URL https://www.jstage.jst.go.jp/article/jsmeb1993/41/2/41_2_472/_article .
The equation itself was verified in the accessible Myint PDF; the original bubble PDF was not needed or independently checked. **This bubble model is not adopted for RRBO/NMP liquid drops.**

For the 250-µm bottom drop, Eo=0.008135 and We=0.0002341: buoyancy and inertial stresses are very small relative to surface tension. In the bubble branch above the deformation term is only about 0.00541, versus SN CD about 46.3. This is a corroborating dimensionless diagnostic, not a liquid-drop validation by substitution into a bubble model. All requested 700–1200-mm cutoff Eo values are 0.00259–0.00831. Large static deformation is not a credible leading correction under the nominal isolated-drop basis; actual shape has not been measured, and turbulence or coalescence is not ruled out by Eo alone.

High bottom kappa=42.2316 gives a clean creeping-flow mobility speed increase of only 0.7770%; the published finite-Re clean model gives 0.7303% at 250 µm. By contrast, Stokes overpredicts SN speed by 10.2058%. Thus selecting a finite-Re, nearly rigid spherical-drop screening model is much better supported at the bottom than ignoring inertia. The 250-µm Eo lies below the Myint experimental envelope: the small clean correction is explicitly an extrapolation diagnostic. SN is a conservative clean-to-immobile model endpoint for the stated isolated-drop conditions, **not** a proven lower-speed bound under swarm effects, unknown contamination, deformation or actual multicomponent properties.

## Why the top remains open

Top viscosity ratio is 0.0236789, below Myint's tested minimum 0.1. The top mean-drop Eo=4.7931 and We=0.64449 are not small. Using the bubble Eq. 8 numerically would happen to leave SN governing (deformation branch about 1.45 versus SN CD=9.916), but **that does not prove spherical liquid-drop applicability or a robust top velocity bound**. No extrapolated bubble correlation, Myint result or mean-drop number is promoted to top acceptance.

The independently recalculated 700-mm top SN capture cutoffs are 2.080748 mm (N4) and 2.066822 mm (N7), conditional on the same unapproved 0.5 fraction. Their Re are 0.16682 and 0.16358; Eo about 0.56. Even these cutoffs should not be represented as validated top liquid-drop capture predictions. An applicable low-viscosity-ratio liquid–liquid deformation/mobility model or direct settling measurements and outlet size distributions are needed.

## Reproducibility and engineering decision

See `disengager-drag-comparison.ts`, `disengager-drag-results.json`, and `disengager-drag-calculations.md`. Only the frozen existing audit input/results were read; no DB query, workflow, production change or geometry decision was made.

At the larger bottom flow proxy, screening IDs are 868.753 mm for 200 µm and 1142.584 mm for 150 µm. Therefore 900 and 1200 mm respectively are **preliminary, physics-conditional bottom candidates**, not released selections. At 700 mm, 250 µm narrowly fails even N4 (cutoff 250.031 µm) and fails N7 (252.626 µm); a rounded “250 µm passes” statement would be false under this exact screen.

The assumed operating fraction 0.5, actual outlet-mixture properties, entrainment/carryover target, drop-size distribution, inlet momentum, swarm/coalescence effects and interface inventory remain unqualified. The bottom assessment does not close the separate top question.