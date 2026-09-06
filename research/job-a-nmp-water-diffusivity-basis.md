# Job A literature basis: H2O and NMP liquid diffusion

**Scope.** Seven-component pre-pilot LLE transport basis (SAT, MONO, DI, POLY, PA, NMP, H2O), frozen Stage-2 authority 7C-1.5.0. This is evidence review only; no implementation or parameter changes are proposed.

## Evidence status and principal finding

The strongest directly relevant primary source found is te Riele, Snijder, and van Swaaij, *Journal of Chemical & Engineering Data* **40** (1995), 34–36, DOI 10.1021/je00017a009. The authors measured both limiting directions of the NMP/H2O pair by Taylor–Aris dispersion:

* NMP at infinite dilution in water; and
* water at infinite dilution in NMP.

The measurements cover 298–348 K. They are **infinite-dilution binary diffusion coefficients**, not measured finite-composition mutual-diffusion data. The searches did not locate a primary data set for finite-composition NMP-water mutual diffusion over the full composition range. Self-diffusion data in NMP/water-containing ternary systems were found in search results, but they are not interchangeable with the binary Fick mutual coefficient and were not adopted.

Primary full text: https://ris.utwente.nl/ws/files/6773595/Riele95diffusion.pdf  
Publisher record: https://pubs.acs.org/doi/10.1021/je00017a009

## Primary-source verification: NMP/H2O limiting coefficients

### Method and experimental limits

The paper's pp. 34–36 reports Taylor–Aris dispersion. Its equations are:

\[
C_m=\frac{N_{\rm inj}}{2\pi R^2(\pi Kt)^{1/2}}
\exp\left[-\frac{(x-ut)^2}{4Kt}\right]
\]

\[
K=\frac{u^2R^2}{48D}
\]

and, when axial molecular diffusion is retained,

\[
K=\frac{u^2R^2}{48D}+D.
\]

The authors kept the experimental \((De)^2(Sc)\) below the observed critical value of about 100. Table 1 gives a capillary length of 15.085 m, tube radius \(5.565\times10^{-4}\) m, and coil-curvature radius 0.1 m. The bath temperature was held within 0.1 K. Each tabulated result is an average of 3–4 measurements.

### NMP infinitely dilute in water

Paper Table 2, units \(10^9D/(\mathrm{m^2\,s^{-1}})\):

| T (K) | \(D_{\mathrm{NMP\ in\ H2O}}^\infty\) (\(10^{-9}\) m2/s) |
|---:|---:|
| 298.0 | 0.946 |
| 308.0 | 1.208 |
| 318.0 | 1.504 |
| 333.0 | 1.996 |
| 348.0 | 2.567 |

The table gives an averaged standard deviation of \(3.7\times10^{-3}\) in the table's \(10^{-9}\ \mathrm{m^2\,s^{-1}}\) scale.

### Water infinitely dilute in NMP

Paper Table 3, units \(10^9D/(\mathrm{m^2\,s^{-1}})\):

| T (K) | \(D_{\mathrm{H2O\ in\ NMP}}^\infty\) (\(10^{-9}\) m2/s) |
|---:|---:|
| 298.1 | 1.003 |
| 308.0 | 1.164 |
| 318.0 | 1.514 |
| 333.0 | 1.987 |
| 348.0 | 2.546 |

The table gives an averaged standard deviation of \(1.2\times10^{-2}\) in the table's \(10^{-9}\ \mathrm{m^2\,s^{-1}}\) scale.

### Temperature correlations

Paper eq. (5) and Table 4 use

\[
\frac{D}{\mathrm{m^2\,s^{-1}}}
=A\exp\left[-\frac{B}{T/\mathrm K}\right].
\]

Verified parameters are:

| Limiting direction | A (m2/s) | B (K) | stated data range |
|---|---:|---:|---:|
| NMP in water | \(9.813\times10^{-7}\) | 2066 | 298–348 K |
| water in NMP | \(7.536\times10^{-7}\) | 1980 | 298–348 K |

These correlations are defensible interpolation routes only over the measured temperature interval. No extrapolation beyond 298–348 K is supported here.

An EPA HERO record independently reproduces the article's bibliographic information, method, limiting directions, and temperature range, but not its numerical tables: https://hero.epa.gov/reference/3577330/. This is **secondary verification**, not a substitute for the primary full text.

## Infinite dilution is not finite-composition mutual diffusion

For a binary liquid, a common finite-composition architecture separates mobility and thermodynamics:

\[
D_{12}^{F}=\widetilde{D}_{12}\,\Gamma,
\qquad
\Gamma=1+\left(\frac{\partial\ln\gamma_1}{\partial\ln x_1}\right)_{T,P},
\]

where \(D_{12}^{F}\) is the Fick mutual coefficient, \(\widetilde D_{12}\) is the Maxwell–Stefan coefficient, and \(\Gamma\) is the thermodynamic factor. A conventional Vignes endpoint interpolation is

\[
\ln \widetilde D_{12}
=x_2\ln D_{1\ {\rm in}\ 2}^{\infty}
+x_1\ln D_{2\ {\rm in}\ 1}^{\infty}.
\]

The endpoint labels in this expression are explicit to avoid ambiguity: at \(x_1\rightarrow0\), it returns the diffusivity of component 1 infinitely dilute in component 2; at \(x_1\rightarrow1\), it returns component 2 infinitely dilute in component 1.

Bosse and Bart describe an Eyring-based extension of Vignes that adds an excess-Gibbs-energy contribution and applies a thermodynamic correction. Their study covered 85 binary mixtures of alkanes, cycloalkanes, halogenated alkanes, aromatics, ketones, and alcohols and reports an approximately 8% average relative deviation depending on the \(g^E\) model. However, NMP-water is not identified among those systems in the fetched record, and the accessible abstract does not expose the full working equation. Therefore this paper supports the **route**, not NMP-water parameter values:

https://pubs.acs.org/doi/10.1021/ie0487989

Consequences for this basis:

1. The two te Riele endpoints can anchor a Vignes/Maxwell–Stefan model.
2. A finite-composition coefficient additionally requires a validated NMP-water activity model and its derivative. A tie-line/VLE fit alone does not automatically validate the derivative \(\Gamma\).
3. Near liquid-liquid instability, \(\Gamma\) can control the Fick coefficient; endpoint interpolation alone is not enough.
4. No finite-composition NMP-water value should be labeled “measured” on the evidence found.

## Wilke–Chang: applicability and association

The commonly reproduced Wilke–Chang form for a dilute solute A in solvent B is

\[
D_{AB}^{\infty}
=\frac{7.4\times10^{-8}\,(\phi_B M_B)^{1/2}T}
{\mu_B V_A^{0.6}}
\quad\mathrm{cm^2\,s^{-1}},
\]

with \(T\) in K, solvent viscosity \(\mu_B\) in cP, solvent molar mass \(M_B\) in g/mol, solute molar volume at its normal boiling point \(V_A\) in cm3/mol, and dimensionless solvent association factor \(\phi_B\). This equation and units are a **secondary reproduction** of Wilke and Chang (1955); the original paper was identified as AIChE Journal **1** (1955), 264–270, DOI 10.1002/aic.690010222, but full primary text was not available through the fetched records.

Important restrictions:

* \(\phi\) belongs to the **solvent**, not the solute. A water-solvent value must not be attached to water when water is diffusing as a solute in NMP or hydrocarbon.
* The literature commonly assigns water-as-solvent \(\phi=2.6\) in the original model and later reproductions use 2.26. These alternatives are model conventions, not measured NMP-water parameters. They must not be silently interchanged.
* No verified Wilke–Chang association factor for NMP was found. It would violate the “do not infer missing symbols or values” requirement to invent one.
* Wilke–Chang is an infinite-dilution correlation. Substituting finite-composition phase viscosity does not convert it into a finite-composition mutual-diffusion model.

Miyabe and Isogai's 2011 research article explicitly reports that ordinary Wilke–Chang estimates for **water as solute in organic solvents** were about 2.3 times measured values in the literature case they discuss. They attribute this to water aggregation and develop a modified treatment for polar solutes/solvents. Their modified model gave mean-square deviation below 19% over 71 literature diffusivity data, but the fetched article does not provide an NMP-specific fitted association parameter:

https://www.sciencedirect.com/science/article/abs/pii/S0021967311010089  
DOI: https://doi.org/10.1016/j.chroma.2011.07.018

Thus:

* **NMP in water:** Wilke–Chang can be a screening cross-check, but direct te Riele measurements supersede it.
* **Water in NMP:** ordinary Wilke–Chang is not the preferred route; direct te Riele measurements supersede it, and the general water-in-organic bias is material.
* **Water in hydrocarbon:** ordinary Wilke–Chang is weak without direct validation or a defensible aggregation correction.
* **NMP in hydrocarbon:** Wilke–Chang may be used only as a dilute binary screening estimate for a defined dominant solvent. It is not automatically valid for a multicomponent hydrocarbon pseudo-solvent.

Aniceto et al. (2021) provide a useful independent warning on predictive error. Their open academic study covers 244 binary systems and 2560 points over 213.2–567.2 K and solvent densities 0.30–1.65 g/cm3. It explicitly **excludes water** from its polar/nonpolar model database. On its polar test set (79 systems, 430 points), Wilke–Chang had global AARD 40.92%; on the nonpolar set the abstract reports 29.19%. This is broad benchmarking, not NMP-water validation:

https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/

## Aqueous-specific estimator

For an organic nonelectrolyte infinitely dilute in water, Hayduk–Laudie is the more specific screening correlation:

\[
D_{A,\mathrm{water}}^\infty
=\frac{13.26\times10^{-5}}
{\mu_w^{1.14}V_A^{0.589}}
\quad\mathrm{cm^2\,s^{-1}},
\]

where \(\mu_w\) is water viscosity in cP and \(V_A\) is the solute molar volume at its normal boiling point in cm3/mol. The EPA estimator page confirms that the method is for an organic compound in water, uses \(D\) in cm2/s, water viscosity corrected for temperature, and LaBas molar-volume increments:

https://www3.epa.gov/ceampubl/learn2model/part-two/onsite/ed-background.html

EPA states that its implementation is based on Tucker and Nelken, Chapter 17 of *Handbook of Chemical Property Estimation Methods* (1990). The primary Hayduk–Laudie citation identified in search is AIChE Journal **20** (1974), 611–615, DOI 10.1002/aic.690200329. The equation above is therefore **secondary reproduction**; no claim is made that the fetched EPA page displayed its numerical exponents in machine-readable text.

Applicability:

* Appropriate only for the aqueous-rich limiting case (e.g., NMP dilute in water), not for water dilute in NMP and not for either solute in a hydrocarbon-rich mixed solvent.
* It predicts infinite-dilution mobility, not finite-composition mutual diffusion.
* The required \(V_A\) must come from a cited property source or a named group-increment method. No NMP \(V_A\) value is supplied or inferred in this review.
* Because direct NMP-in-water measurements exist, Hayduk–Laudie should be a cross-check rather than authority for that endpoint.

## Phase-specific treatment for the seven-component basis

| Phase / transported species | Preferred evidence route | Acceptable predictive fallback | Not defensible without more evidence |
|---|---|---|---|
| Water-rich, NMP dilute | te Riele Table 2 / eq. (5), 298–348 K | Hayduk–Laudie cross-check with sourced NMP normal-boiling molar volume and water viscosity | Treating the endpoint as finite-composition mutual \(D\) |
| NMP-rich, H2O dilute | te Riele Table 3 / eq. (5), 298–348 K | A separately validated polar-solute correlation | Ordinary Wilke–Chang with an invented NMP association factor |
| NMP-rich, finite H2O | Composition-resolved experiment, or endpoint-anchored Maxwell–Stefan/Vignes plus validated NMP-water \(\Gamma\) | Sensitivity band spanning documented endpoint/model uncertainty | Constant infinite-dilution \(D\) represented as measured mutual diffusion |
| Hydrocarbon-rich, NMP dilute | Measurement in representative hydrocarbon matrix | Wilke–Chang or another dilute-solute correlation for a specifically defined dominant hydrocarbon, with sourced inputs and validation | Applying a pure-solvent correlation to an undefined pseudo-solvent |
| Hydrocarbon-rich, H2O dilute | Measurement in representative hydrocarbon matrix; aggregation-aware validated model | Conservative sensitivity case informed by water-in-organic bias | Uncorrected Wilke–Chang as release authority |
| Hydrocarbon-rich, both NMP and H2O finite | Multicomponent Maxwell–Stefan model with composition-dependent thermodynamics and mobility | Clearly labeled engineering screening model | Reusing binary NMP-water endpoints as hydrocarbon-phase coefficients |

For a multicomponent hydrocarbon-rich phase, “hydrocarbon solvent” must be defined. SAT, MONO, DI, POLY, and PA do not constitute one molecular solvent with a single molar mass, normal boiling molar volume, or association factor. A pseudo-component correlation requires an explicit mixing rule and validation against a representative matrix. Local phase viscosity and temperature are necessary inputs but do not by themselves resolve multicomponent friction.

## Search audit

At least four independent search angles were executed with `webSearch`; the actual campaign used these distinct themes:

1. Experimental NMP-water mutual/interdiffusion over composition and temperature.
2. NMP/H2O Taylor-dispersion and infinite-dilution measurements, including spelling and CAS variants.
3. NMP-water NMR self-diffusion versus mutual diffusion.
4. Original Wilke–Chang equation, units, association factors, and limitations.
5. Hayduk–Laudie and other aqueous-specific estimators.
6. Water-as-solute behavior in organic solvents and modified Wilke–Chang.
7. Finite-composition Vignes, Darken, Maxwell–Stefan, and thermodynamic-factor routes.
8. Exact-title and institutional-repository search for the te Riele tables.

## Saved evidence

Fetched source captures are under `research/sources/job-a/`:

* `05-te-riele-1995-primary-fulltext.md` — primary article full text from University of Twente; governing numerical evidence.
* `01-te-riele-1995-acs.md` — ACS publisher record.
* `02-te-riele-1995-epa-hero.md` — EPA HERO secondary bibliographic verification.
* `04-liu-2006-composition-dependent-diffusion.md` — Bosse and Bart publisher record/abstract for finite-composition architecture.
* `07-miyabe-isogai-2011-wilke-chang.md` — research-article preview on polar association and water-in-organic bias.
* `06-aniceto-2021-predictive-models.md` and continuation — open academic benchmarking of predictive models.
* `03-epa-aqueous-diffusivity-estimators.md` — authoritative secondary description of the aqueous Hayduk–Laudie route.

## Bottom line

The measured te Riele limiting coefficients should govern the NMP-rich and water-rich **binary endpoint** treatment within 298–348 K. They do not govern hydrocarbon-rich transport and do not establish finite-composition mutual diffusion. Aqueous Hayduk–Laudie is an appropriate independent check for NMP dilute in water. Ordinary Wilke–Chang is especially questionable for water as a solute in NMP or hydrocarbons, and no NMP association factor should be inferred. Finite-composition treatment requires endpoint-anchored Maxwell–Stefan mobility plus a validated thermodynamic factor, while hydrocarbon-rich treatment requires matrix-specific measurements or an explicitly defined and validated multicomponent predictive route.