# Bottom RRBO/NMP disengager — verified literature investigation

Offline research, 21 September 2026. Read with `kuhni-end-section-preliminary-calculation.md`. **Screening evidence only; no geometry selected, no application/database changes, no final hydraulic approval.**

## 1. Answer to the 250–253 µm question

**The reviewed publications do not establish 250–253 µm as a conservative RRBO-in-NMP capture diameter.** That range is the inverse requirement of the existing 700-mm shell, flow proxies and assumed `U ≤ 0.50 vt` screen, not a measured incoming drop population or a published universal acceptance criterion. Selecting the cutoff because it makes 700 mm pass would be circular.

There is support for gravity separation, size-dependent settling, separate sedimentation and interfacial-coalescence constraints, batch-test-based design, and control of inlet turbulence. There is **no verified RRBO/NMP lower-tail distribution, coalescence parameter, carryover guarantee, or universal 100–300 µm industry design range** in these sources. The 150-µm oil/water example below is explicitly a different service.

It is legitimate to investigate 100–300 µm as an **engineer-selected sensitivity interval**, and to use 200 µm or a stricter 150 µm as a **provisional screening target**, provided the report says:

> The selected capture size and 50%-terminal-velocity factor are engineering assumptions pending representative RRBO/NMP entrainment and settling tests; neither is a demonstrated conservative lower bound on actual droplet size or a guarantee of outlet purity.

“More demanding than 253 µm” is defensible; “proven conservative for RRBO/NMP” is not. Even a 150-µm selection can miss a consequential finer tail.

### Three sizes that must not be conflated

1. **Active-compartment mean:** the saved 6.068-mm `d32` describes NMP dispersed in RRBO in the agitated section. It is neither a minimum size nor the RRBO-in-NMP size after crossing the bottom interface. `d32 = Σn d³ / Σn d²` cannot bound the fine tail.
2. **Incoming end-zone distribution:** actual entrained RRBO drops in NMP depend on interface transfer, dispersion/breakup, withdrawal, local shear, start-up and operating condition. Phase continuity reverses relative to the active-section dispersion. A change of continuous phase does not preserve the former drop-size distribution. Sulzer explicitly notes that the two dispersion orientations can behave considerably differently [S1].
3. **Quiescent/coalesced size versus design cutoff:** coalescence can increase sizes after entry, but its rate and the resulting distribution are system-specific [S3–S6]. A design cutoff is an assigned separation duty, not a prediction of those sizes. Do not substitute a presumed quiet-zone coalesced mean. Retain **no growth/coalescence credit in the dilute capture calculation**, while still recognizing that final merger at the bulk interface requires finite coalescence capacity.

For a volume-weighted inlet distribution `pV(d)`, entrained RRBO flow `Qe`, and grade capture efficiency `η(d)`, the uncaptured dispersed flow is conceptually `Qe ∫[1−η(d)]pV(d) dd`. This is a mass-balance framing, not a literature-calibrated efficiency model. With an ideal step cutoff, the volume fraction below that cutoff remains uncaptured. Neither `pV`, `Qe`, nor the acceptable dispersed carryover is currently established. Dissolved hydrocarbons in extract are not this entrainment inventory.

## 2. Verified sources and precise applicability

All evidence below was obtained by **webFetch of the actual publisher, university or manufacturer page/PDF**, not search snippets. Full-access status is stated; an abstract is not represented as a read full paper. Brief quotes are deliberately limited.

### S1 — Sulzer, OptimEXT: extraction equipment brochure

URL: https://www.sulzer.com/en/-/media/files/products/separation-technology/brochures/english/liquid_liquid_extraction_technology_e10556_en_web.pdf

Locations: “Overview of OptimEXT core extraction equipments / Extractors”; “OptimEXT: agitated Kühni column (ECR)”; “ECP packed column / Liquid distributors.”

- Verified text explains both feed-dispersed and solvent-dispersed operation and says: **“These two types often show a considerably different behavior.”**
- The brochure identifies droplet formation, transport and settling as extractor functions. It emphasizes an adapted droplet size and uniform holdup, not a universal drop-size cutoff.
- Its packed-column distributor section calls for distributing both phases over the whole cross-section and special attention to the dispersed-phase distributor for a narrow distribution. This supports the general importance of distribution, **not a transferable numerical design rule for the ECR bottom**.
- Companion ECR manufacturer page: https://www.sulzer.com/en/shared/products/kuehni-agitated-columns-ecr — confirms adaptable agitated compartments, special turbines and perforated plates, but no end-settler cutoff or height rule.

**Evidence limit:** the fetched current extraction brochure/page did **not** provide the requested explicit wording “Kühni top/bottom end zones with optional coalescers.” Do not attribute that exact configuration or a mandatory coalescer to Sulzer from this retrieval. The separately verified separator brochure [S2] does establish available optional separation technologies, not a specific ECR end-section arrangement.

### S2 — Sulzer Chemtech, Liquid-liquid separation technology

URL: https://www.sulzer.com/en/-/media/files/products/separation-technology/brochures/english/liquid_liquid_separation_technology_e10559_en_web.pdf

Locations: Introduction, printed pp. 2–3 and Fig. 1; “Feed Inlets and Calming Baffles,” p. 9; “DC Coalescer,” p. 10; “Dusec and Dusec Plus Cartridge Coalescer,” pp. 11–12. Full brochure extracted.

- Introduction distinguishes drop–drop and drop–interface coalescence and ties equipment selection to their **kinetics**, not merely eventual thermodynamic separation.
- Fig. 1 describes primary dispersions as coarse, predominantly **>30 µm**, and secondary dispersions as typically **1–30 µm**. These are broad dispersion categories, **not guaranteed incoming sizes, gravity-design cutoffs or RRBO/NMP data**.
- Feed-inlet discussion: **“it is important that the flow in the vessel is equalized.”** It explains that turbulence, disturbances and surges compromise efficiency, and that inlet devices should improve distribution without droplet shattering.
- DC coalescer discussion describes coalescing/draining growth and handling primary dispersions with droplets as small as **30 µm**. This is aided-separation product capability, not bare-settler performance.
- Dusec discussion describes fine **1–30 µm** dispersions and growth to primary-dispersion sizes **>60 µm** through fiber interception/coalescence. This is also not a guaranteed RRBO/NMP result.

**Applicability:** primary manufacturer support for inlet calming, distinct free-settling and coalescing functions, and possible coalescer investigation. Select media only with material compatibility, wetting, fouling and performance evidence. No numerical inlet-to-interface clearance, universal residence time, or bare-gravity 250-µm acceptance is given.

### S3 — Henschke, Schlieper and Pfennig (2002)

“Determination of a coalescence parameter from batch-settling experiments,” *Chemical Engineering Journal* **85**, 369–378. DOI: **10.1016/S1385-8947(01)00251-0**.

URL: https://www.sciencedirect.com/science/article/abs/pii/S1385894701002510

**Access:** publisher abstract, introduction and section previews read; full article not obtained.

- Abstract: an integral coalescence parameter is obtained from **“a simple batch-settling experiment.”** The model aims to separate system coalescence behavior from mixing intensity, equipment and dispersed fraction.
- “Balances” preview identifies interfacial drop size, dispersed holdup and drop–interface coalescence time in the coalescence-curve slope.
- “Coalescence” preview states that outflow of the intervening liquid film is the time-determining step and discusses nonuniform/asymmetric film drainage.
- “Results and discussion” explicitly discusses light dispersed phase in heavy continuous phase (cyclohexanone/water), but not RRBO/NMP.

**Applicability:** supports representative test-based film-drainage/coalescence characterization and the distinction between settling to an interface and actually merging through it. No numerical coalescence parameter or drainage time can be transferred to RRBO/NMP. The fetched equation typography is degraded; no design equation has been transcribed from it.

### S4 — Hartland and Jeelani (1987)

“Choice of model for predicting the dispersion height in liquid/liquid gravity settlers from batch settling data,” *Chemical Engineering Science* **42**(8), 1927–1938. DOI: **10.1016/0009-2509(87)80139-2**.

URL: https://www.sciencedirect.com/science/article/pii/0009250987801392

**Access:** actual publisher abstract and references read; full article not obtained.

- Abstract: sedimentation rate depends on drop size and dispersed holdup; interface-coalescence rate depends on **dense-packed-zone height and drop size at the interface**.
- Both batch and continuous dispersions can contain sedimentation and dense-packed zones. At one limit the dense-packed height can approach zero for effectively immediate interfacial coalescence; at another the dispersion can be entirely dense-packed.
- Continuous total dispersion height versus throughput is predicted from experimental batch sedimentation/coalescence parameters and a model chosen for the observed behavior.

**Applicability:** direct support for sizing/allowing a dispersion band on actual **throughput and coalescence capacity**, rather than selecting a generic residence time. This is not a proof of a fixed band height or universally close-packed band.

Related verification: Hartland and Jeelani (1988), “Prediction of sedimentation and coalescence profiles in a decaying batch dispersion,” *CES* **43**(9), 2421–2429, DOI **10.1016/0009-2509(88)85176-5**, publisher abstract read at https://www.sciencedirect.com/science/article/pii/0009250988851765 . Its assumptions include no interdrop coalescence in the sedimentation zone and prescribed dense-zone coalescence behavior; these assumptions are not automatically RRBO/NMP facts.

### S5 — Schäfer, Hlawitschka and Bart (2022)

“Image analysis for design and operation of gravity separators with coalescing aids,” *Canadian Journal of Chemical Engineering* **100**(9), 2331–2346. DOI: **10.1002/cjce.24503**.

URL: https://onlinelibrary.wiley.com/doi/full/10.1002/cjce.24503

**Access:** open-access article; introduction and relevant §3 text read. Locations: §3 “Droplet behaviour in a gravity settler,” Fig. 8, and §3.1.

- §3 identifies countercurrent vertical settlers, including at extraction-column heads, and separates sedimentation and coalescence mechanisms.
- After the turbulent inlet region, **“there should not be any turbulence disturbing the separation of the two phases.”**
- Listed influences include DSD, continuous viscosity, density difference, interfacial tension, phase ratio, flow and surfactants.
- For sedimentation-limited separation, reducing the droplet travel distance helps. For coalescence-limited separation, increased contact opportunity or coalescing internals can help.
- Its investigations concern horizontal settlers and knitted meshes. Numerical laboratory dimensions and mesh performance must not be imposed on this unqualified vertical NMP service.

**Applicability:** inlet decay/calming and regime distinction. The paper's extracted height/length-ratio notation is internally awkward; no aspect-ratio rule is taken from it.

### S6 — Pfennig group, University of Liège; modern polydispersity qualification

Primary research-group explanation:
https://www.chemeng.uliege.be/cms/c_3668036/en/chemeng-coalescence-liquid-liquid-phase-separation-and-settlers

Location: introductory technical discussion. Actual page read.

- Representative lab tests are essential because **“trace components strongly affect the coalescence behavior.”**
- It describes model-based horizontal/vertical settler design from original-system batch data, including crud/solid-impurity work.
- It specifically discusses viscous industrial systems with wide DSDs and the fraction remaining in the continuous phase because small drops cannot reach the interface in time.

Supporting primary conference presentation: D. Leleu and A. Pfennig, “Detailed Drop-Based Simulation of Settling Behavior,” ISEC 2022:
https://orbi.uliege.be/bitstream/2268/298760/1/ISEC%20-%20ReDrop%20Settler%202022%20-%20005a.pdf

Locations: slides 31–33 (conclusions and revised settler concept), with experimental system water/ethylene glycol/hexane identified near the start. It emphasizes polydispersity, lag time, swarm velocity at high holdup, and that a truly close-packed zone need not occupy the whole dense region. This qualifies simple “packed band everywhere” pictures. The presentation is not RRBO/NMP evidence or a standard; chart/equation OCR was not used for calculations.

### Comparator only — oil/water 150 µm convention

SkimOIL, “API Design Oil Water Separators,” manufacturer brochure:
https://www.skimoil.com/uploads/4/7/1/6/47163295/api_oil_water_separator_2020.pdf

Location: “Per API guidelines design criteria / Oil droplet size.” Actual PDF text read. It describes **150 µm** refinery-wastewater droplets and warns that smaller droplets can pass through.

**Limit:** this is a manufacturer's description of API-style oil/water equipment, not direct verification of API 421 normative text. It is not an NMP qualification, not an extraction-column rule, and not support for asserting 250 µm universally conservative. Different density difference, continuous viscosity, interfacial behavior and flow geometry preclude importing its vessel dimensions or velocity rules.

## 3. Quantitative sensitivity, not a published acceptance range

Using the existing nominal 40 °C property proxies: `ρc=1015`, `ρd=869 kg/m³`, `μc=0.001416`, `μd=0.0598 Pa·s`, `σ=0.011 N/m`; viscosity ratio `μd/μc=42.23`. RRBO drops rise against downward NMP flow.

The following independently recomputed values use the report's immobile-interface spherical Schiller–Naumann force balance, not Stokes alone:

`Re=ρc vt d/μc`; `CD=(24/Re)(1+0.15 Re^0.687)`; `CD ρc vt²/2=(2/3)d Δρ g`.

For N7 extract proxy `Qc=0.0006247746 m³/s`, `A700=0.3848451 m²`, `U700=1.62344 mm/s`; `Areq=Qc/(0.50 vt)`.

| Assumed cutoff, µm | Calculated vt, mm/s | Net rise at 700 mm, mm/s | Equivalent required ID at f=0.50, mm |
|---|---:|---:|---:|
| 100 | 0.55272 | −1.07072 | 1696.60 |
| 150 | 1.21867 | −0.40477 | 1142.58 |
| 200 | 2.10800 | +0.48456 | 868.75 |
| 250 | 3.18576 | +1.56232 | 706.68 |
| 253 | 3.25563 | +1.63219 | 699.06 |
| 300 | 4.41632 | +2.79287 | 600.21 |

These are **sensitivity outputs, not geometry recommendations**. At 253 µm the margin over the selected f=0.50 criterion is only about 0.27%; the chosen velocity factor itself is not additional evidence about DSD. The existing exact inverse thresholds, 250.031 µm (N4) and 252.626 µm (N7), are consistent with this calculation.

At 150 µm, the uniform-flow model carries drops toward the bottom outlet; extra height cannot reverse that. At 200 µm, net rise is positive but the selected 50% margin is not met. High dispersed-phase viscosity does not justify applying the **dispersed** viscosity as drag-controlling continuous viscosity, nor prove instantaneous coalescence. Small calculated Eo near 253 µm supports a small-deformation approximation, not a carryover guarantee.

## 4. Defensible bottom-height, interface and clearance criteria

The following is an **engineering synthesis of S2–S6**, not a published fixed dimension or invented time rule.

1. **Establish the actual bottom flow topology.** Identify the bottom bulk interface/inversion region, feed distributor, last agitated compartment, NMP withdrawal and RRBO return path. Separate main phase throughput, entrained-drop load and any local recirculation. A distributor intentionally forming the main dispersion must not be confused with a calming device for the continuous extract withdrawal.
2. **Pass the velocity/area duty first.** Use the chosen physical capture duty and phase properties at actual composition. Check worst throughput, local nonuniform velocity, dilute/swarm applicability and the return of captured RRBO. Larger height cannot repair an unfavorable sign of `vt−U`, nor meet an area-loading criterion by itself.
3. **Provide an inlet-disturbance decay region.** Determine it from feed/exit momentum, last-rotor agitation, distributor open area and jet direction. Verify that high-shear zones do not reach the separating interface or outlet capture region. Literature supports calming and equalization, **not an arbitrary universal distance in mm or fixed multiple of nozzle diameter**. Pilot observation, vendor hydraulic design or validated CFD is needed to quantify the clearance.
4. **Reserve space for the maximum dispersion band.** Derive band extent versus dispersed load and phase throughput from representative settling/coalescence tests and an appropriate continuous-settler model [S3,S4]. Include upset/crud behavior and uncertainty. The necessary interfacial coalescence rate must at least match arriving dispersed-phase volume rate at steady state; otherwise dispersed inventory grows. A dilute terminal-speed screen alone does not establish this capacity.
5. **Keep withdrawals outside the band over the full control envelope.** Evaluate normal and high/low interface levels, measurement error, control response and credible transient accumulation. Heavy outlet submergence/separation from the interface must prevent local drawdown, entrainment and short-circuiting. The feed/last-compartment clearances likewise need protection from the band and interface excursions. No tested numerical clearance is available in these sources.
6. **Use trajectory and inventory checks, not “five/ten minutes” alone.** For an ideal uniform dilute zone, a drop a distance `L` below its receiving interface needs `trise=L/(vt−U)` if the denominator is positive. Real design must integrate the local velocity field and compare against competing outlet/short-circuit paths; `V/Q` alone is not that trajectory time. Moving an interface farther away can increase both inventory and required travel distance. For an explicit transient imbalance, `ΔV=∫(Qin−Qout)dt` gives the required control/surge inventory; use a defined scenario and response time, not an invented blanket residence time.
7. **Build height from the resulting layout envelopes.** Account for inlet/rotor disturbance clearance, clear separating paths, dispersion-band extent, interface-control range, outlet protection and mechanical access. Some regions can overlap physically; do not blindly sum arbitrary allowances. Transition geometry requires a separately selected diameter and qualified hydraulic/mechanical layout.

### Minimum evidence to remove HOLD

- Representative equilibrated RRBO-rich/NMP-rich properties at 40 °C and relevant compositions; examine water, trace contaminants, solids and aging.
- Incoming RRBO-in-NMP **volume-weighted** DSD and physical entrainment loading at representative/worst operation, sampled without artificial breakup/coalescence.
- A specified permitted **dispersed** RRBO carryover, distinguished from equilibrium dissolved hydrocarbon.
- Batch settling video/curves and preferably in-situ DSD/holdup information; validated band/coalescence scaling and continuous/pilot or vendor confirmation at design load.
- Inlet/distributor/rotor-decay and withdrawal hydraulics, interface control/surge envelope and any coalescer qualification.

**Disposition:** published evidence supports retaining hydraulic and geometry HOLD, not declaring 700 mm accepted on a supposedly conservative 250–253 µm cutoff. A smaller provisional cutoff can organize the next sensitivity study, but it does not replace these missing measurements.