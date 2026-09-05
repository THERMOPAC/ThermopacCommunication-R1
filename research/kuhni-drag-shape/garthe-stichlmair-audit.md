Research completed; no production code/workflows touched.

**Verdict — RRBO/NMP / Project 236**
- **Pre-pilot only; not release-ready.** At Morton number `M ≈ 2.86e-9` (`log10 M = -8.54`), the proposed non-spherical shape relation is *within* the accessible Myint–Hosokawa–Tomiyama experimental Morton range. But `X=33.6` is not a defined dimensionless variable in the accessible primary sources, and no project definition/units were supplied. It cannot be mapped to `Eo`, `Re`, `Ta`, `We`, or a valid drag/shape regime.
- No accessible primary Garthe full text verified the project’s asserted **Eq. 5.6** or **Eq. 8.3**. Treat those equation-number attributions, their coefficients, and any claim that they validate RRBO/NMP as **unverified**, rather than inventing equations.
- The directly applicable column evidence is water/toluene/acetone in a DN80 Kühni pilot column—not RRBO/NMP—and its coalescence parameter was fitted to a pilot holdup measurement. That does not provide direct RRBO/NMP validation.

**Key facts / equations**
1. **Single-drop shape (primary, free full text):**
   - `E = (b1+b2)/(2a)` (aspect ratio); `γshape = 2b2/(b1+b2)` (fore–aft distortion).
   - `Eo = g d² |ρc−ρd|/σ`; `Re = ρc VT d/μc`; `M = g μc^4 |ρc−ρd|/(ρc² σ³)`; `We = ρc VT²d/σ`; `Ta = Re M^0.23`; `κ=μd/μc`.
   - Clean-drop correlation: `E = 1 − 0.0487 Ta − 0.0289 Ta²`.
   - Clean drops with `κ<1`: `γshape = 0.957 + 0.008 Eo + 0.002 Eo²`.
   - Validity: `−11.6≤log10M≤−0.9`, `0.015≤Re≤850`, `0.017≤Eo≤9.3`, `0.0074≤Ta≤3.6`, `0.1≤κ≤100`. Thus `M=2.86e−9` passes *only one* gate; RRBO/NMP also needs actual `Eo/Re/Ta/κ`, clean/interface condition, and observed stable nonoscillating-drop regime. Surfactant contamination especially changes shape at low M.
2. **Terminal drag closure:** for an equivalent-volume sphere, force balance gives
   `CD(Re, shape, …) = 4 d |Δρ| g / (3 ρc u_t²)`, with `Re=ρc u_t d/μc`.
   A deformation-capable closure must state its reference area/diameter. The above `CD` is incompatible with silently substituting projected area of an oblate drop unless the definition is changed consistently.
3. **Column velocity / holdup consistency:** Weber et al. explicitly describe single-drop terminal velocity `vt`, swarm reduction `(1−ε)^n` with `n=2` (citing Kalem et al.), a Garthe internal-vortex/backmixing slowing factor `kv`, and continuous-phase countercurrent velocity corrected for reduced free area. Their displayed equations are images, so coefficients/sign convention cannot be transcribed as exact text from that source. Their prose supports the structure
   `u_rel(ε)=kv vt (1−ε)^n`;
   actual dispersed axial velocity is then this relative velocity combined with the continuous-phase interstitial velocity. For countercurrent superficial speeds `j_d, j_c` (magnitudes), conservation supplies the unambiguous holdup closure
   `u_rel = j_d/ε + j_c/(1−ε)`.
   Solve this equation for `0<ε<1`, with the `u_rel(ε)` model above. This is the appropriate swarm-slip/holdup equation—not `ut` alone.

**No-circularity implementation logic**
1. At fixed fluid properties and candidate equivalent-volume `d`, solve the *single-drop terminal* scalar root `F(ut)=buoyancy−drag[CD(Re(ut), shape(ut/Eo,…)),ut]=0`; use the shape correlation only within all stated gates. `Eo` is property/diameter based, while `Ta` contains `Re`, so an iterative root is mathematically required, not circular.
2. Keep this converged `ut` as a single-drop property. Do **not** re-evaluate the terminal-drag law at a column superficial velocity or characteristic velocity.
3. Apply calibrated/explicit column effects afterwards: `u_rel(ε)=kv ut(1−ε)^n`; solve the holdup conservation residual above. The drag closure is evaluated at **terminal relative speed only**; the swarm state is a separate empirical hindrance model.
4. If a model instead claims drag at swarm slip, it requires a distinct swarm drag/voidage closure and data; it cannot reuse a single-drop `CD(Re)` without adding and validating that model.

**Conflicts / gaps**
- Weber’s modern description uses a **terminal-velocity model** (mobile/rigid interpolation) plus a separate swarm/backmixing layer; it does not support treating a single-drop drag coefficient as directly equal to characteristic or swarm drag.
- It states mobility/contamination/mass transfer can make interfaces rigid or partly mobile; shape evidence is for **clean** drops. This is a material RRBO/NMP gap.
- Weber achieved its reported column match only after fitting coalescence (`C_coa=192`) to Garthe’s 150 rpm, `Qc=60 L/h`, `Qd=72 L/h` water/toluene/acetone run. It explicitly says no universal coalescence model without adjustable parameters was available.
- Garthe full thesis repository fetch encountered an anti-bot page; ACS primary 2006 article body was paywalled; therefore neither is evidence for the requested unverified equation numbers.

**Source quality / saved paths**
1. **Primary experimental shape paper (strong):** Myint, Hosokawa & Tomiyama, 2007, *Shapes of Single Drops Rising Through Stagnant Liquids*, DOI https://doi.org/10.1299/jfst.2.184. Saved: `research/kuhni-drag-shape/sources/05-myint-hosokawa-tomiyama-2007.pdf`.
2. **Open-access peer-reviewed secondary/model paper (strong for Garthe attribution and its own equations; not primary RRBO evidence):** Weber, Meyer & Jupke, 2019, DOI https://doi.org/10.1002/cite.201900057. Saved: `research/kuhni-drag-shape/sources/02-weber-2019.html`.
3. **Primary peer-reviewed Kühni study, metadata/abstract only (equations inaccessible):** Gomes et al. incl. J. Stichlmair, 2006, DOI https://doi.org/10.1021/ie051453l. Saved: `research/kuhni-drag-shape/sources/04-gomes-stichlmair-2006.html`.
4. **Original shape study metadata/abstract (supporting historical primary evidence):** Wellek, Agrawal & Skelland, 1966, DOI https://doi.org/10.1002/aic.690120506. Saved: `research/kuhni-drag-shape/sources/wellek-agrawal-skelland-1966.html`.
5. **Target Garthe thesis record fetch failed (anti-bot; not usable evidence):** `research/kuhni-drag-shape/sources/01-garthe-mediatum.html`.
6. **Target DTIC liquid-drop source fetch failed (maintenance page):** `research/kuhni-drag-shape/sources/03-single-drop-drag-dtic.pdf`.

All four required distinct searches were run before fetches.