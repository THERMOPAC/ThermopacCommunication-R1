Completed research; no production files changed and no optimizer/workflow was run. I performed 4 distinct web searches before fetching, then fetched 5 source URLs (1 DTIC fetch is a maintenance-page failure).

## Key facts / equations

1. **Wellek, Agrawal & Skelland (1966), AIChE J. 12(5), 854–862**, DOI https://doi.org/10.1002/aic.690120506 — original primary paper.
   - The publisher abstract establishes: **nonoscillating drops falling through stationary liquid continuous phases**; 45 dispersed/continuous systems; continuous-phase viscosity 0.3–46 cP; interfacial tension 0.3–42 dyn/cm; **6 <= Re <= 1354**; reported mean deviations 6–8% for empirical eccentricity relations.
   - Its Taylor–Acrivos-based relation is said to be accurate only at drop Re below about 20 and “highly inaccurate” above that.
   - The accessible original landing/full-text endpoints do **not** expose equation body or diameter definition. The two exact Wellek equations below are independently transcribed by the later academic single-drop paper (#2), which cites Wellek as its ref. 3:
     - contaminated immiscible liquids: \(E=[1+0.091We^{0.95}]^{-1}\)
     - low/moderate-viscosity systems: \(E=[1+0.163Eo^{0.757}]^{-1}\)
   - Here \(E\) is the minor-to-major shape measure (see #2 definition); this is a **shape relation, not a Reynolds-dependent drag closure**.

2. **Myint, Hosokawa & Tomiyama (2007), “Shapes of Single Drops Rising Through Stagnant Liquids,” Journal of Fluid Science and Technology 2, 184–195**, DOI https://doi.org/10.1299/jfst.2.184 — primary academic validation/correlation experiment.
   - Exact geometry: \(E=(b_1+b_2)/(2a)\), \(\gamma=2b_2/(b_1+b_2)\), where \(a\) is half major axis; \(b_1,b_2\) are distances from major axis to bottom/top. Thus E=1 is spherical; lower E is oblate/deformed.
   - Exact groups: \(Eo=g d^2|\rho_c-\rho_d|/\sigma\); \(Re=\rho_cV_Td/\mu_c\); \(M=g\mu_c^4|\rho_c-\rho_d|/(\rho_c^2\sigma^3)\); \(We=\rho_cV_T^2d/\sigma\); \(Ta=ReM^{0.23}\); \(\kappa=\mu_d/\mu_c\). In this paper, **d is sphere-volume-equivalent diameter**, and \(V_T\) is terminal velocity.
   - Clean-single-drop alternative: \(E=1-0.0487Ta-0.0289Ta^2\).
   - Explicit validation envelope: clean drops, \(-11.6\le\log_{10}M\le-0.9\), \(1.5\times10^{-2}\le Re\le8.5\times10^2\), \(1.7\times10^{-2}\le Eo\le9.3\), \(7.4\times10^{-3}\le Ta\le3.6\), \(0.1\le\kappa\le100\).
   - Systems/method: silicone-oil drops (KF96-30/100) rising in purified water or glycerol–water; rectangular quiescent tank; high-speed imaging 400 mm above nozzle after terminal condition. Triton X-100 was the contaminated case. The paper finds surfactant addition lowers E and breaks fore–aft symmetry, particularly at low M; \(\kappa\) has limited effect on E but affects \(\gamma\). Its own clean-drop correlation is therefore not a contaminated-NMP surrogate.
   - The paper specifically says bubble correlations cannot accurately evaluate drop E—do not substitute bubble correlations as a validated liquid-drop closure.

3. **Balcázar Arciniega (2024), UPC doctoral thesis** — secondary source, useful only as independent equation transcription: it states \(E=[1+0.163Eo^{0.757}]^{-1}\) and attributes the source/reported Wellek Re range. It is not primary evidence for agitated service.

## Project-236 applicability verdict

- If **X=33.6 denotes Eo**, evaluating Wellek’s Eo expression gives \(E\approx0.3002\). This is a numerical extrapolation, not a qualified result. It is **3.6 times above** the highest Eo=9.3 in the directly relevant Myint clean-single-drop data. Also, at E~0.30 an ellipsoidal/aspect-ratio treatment itself needs observed-shape confirmation.
- \(M=2.86\times10^{-9}\), \(\log_{10}M=-8.544\), lies inside Myint’s stated M interval. That fact alone does **not** qualify a case: Eo, Re, Ta, interfacial cleanliness, \(\kappa\), flow field, and single-drop/terminal condition also must be met.
- **Terminal slip:** Wellek is the best available preliminary candidate only for an isolated, nonoscillating, stationary-continuous-phase drop and only after calculating its own \(Re\), \(We/Eo\), \(\kappa\), and showing the actual point is supported. Its original paper offers broad Re coverage but the accessible primary text lacks exact equation domain/diameter convention; retain that uncertainty. Myint is stronger for clean terminal drops but rejects X=33.6/Eo as outside its Eo range.
- **Characteristic/process velocity:** reject both as source-supported direct predictions unless that velocity is demonstrably the measured isolated-drop terminal \(V_T\); We, Re and Ta include velocity and change with this choice.
- **Swarm-slip velocity:** reject as validated use. Both relevant sources are explicitly **single-drop** studies in otherwise stagnant liquid; neither supplies holdup/swarm/hindered-settling correction.
- **Turbulent/agitated local velocity:** reject as validated use. No fetched primary source validates Wellek or Myint in impeller turbulence, fluctuating slip, coalescence/breakage, or RRBO/NMP. Using a mean/characteristic turbulent slip in We is therefore a **pre-pilot extrapolation**, not an equation-supported drag/shape closure.
- **Reynolds-dependent drag:** neither recovered source provides an exact coupled non-spherical \(C_D(Re,E,\kappa,...)\) law for RRBO/NMP. Do not represent Wellek E as validating a drag closure. A separate primary drag-source/model plus coupling/iteration and experimental confirmation are required.

## Conflicts and gaps

- Wellek’s Eo form is presented by #2 as “low and moderate viscosity,” while its We form is for contaminated liquids. Applying the Eo form to NMP without documented interface cleanliness is unsupported; #2’s data directly show surfactant sensitivity.
- Wellek original’s publisher-accessible content confirms variables but not equation text, exact equation-specific range, or diameter definition. The equations are recovered through #2, so quote them as a later academic transcription until the original 1966 page images/PDF are acquired.
- “X” was not source-defined. The X=33.6 conclusion is conditional on **X=Eo**; if X is a different design group, no range comparison can be made.
- RRBO/NMP physical properties, viscosity ratio, actual diameter convention, local/turbulent/slip velocity, holdup, and interfacial contamination state were not supplied; no direct RRBO/NMP validation was found.

## Saved source paths (numbered)
1. `research/kuhni-drag-shape/sources/wellek-agrawal-skelland-1966.html` — original publisher landing page, high quality primary.
2. `research/kuhni-drag-shape/sources/myint-hosokawa-tomiyama-2007.pdf` — open primary academic article (serialized text despite extension), high quality for exact definitions/equations/range.
3. `research/kuhni-drag-shape/sources/shapes-single-drops-jstage.html` — #2 publisher metadata/abstract.
4. `research/kuhni-drag-shape/sources/upc-drop-deformation-thesis.pdf` — secondary thesis/equation cross-check only.
5. `research/kuhni-drag-shape/sources/wellek-agrawal-skelland-1966-full.pdf` — publisher ePDF endpoint; accessible content still only abstract/references.
6. `research/kuhni-drag-shape/sources/dtic-liquid-drop-drag-report.pdf` — fetch failed substantively: DTIC maintenance notice, do not use as evidence.
