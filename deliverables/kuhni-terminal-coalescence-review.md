# Kühni terminal-stage coalescence and top NMP carryover: independent evidence review

## Decision in brief

**Coalescence after the final rotor/stator is physically possible, but neither its rate nor the resulting outlet NMP entrainment is established for this RRBO/NMP service.** Removing rotor-driven breakup does not ensure rapid coalescence: drops must meet, drain the intervening continuous-phase film, merge and then have a viable return path. A dilute fine tail can have few collisions even in a relatively quiet region. Conversely, measurable coalescence or selective return can make the actual withdrawal distribution very different from the active-section distribution.

**The reviewed evidence does not establish that a coalescer, external guard or large top is mandatory. It also does not establish that bare Ø700 is adequate.** Retain Ø700 ×1600 as a spatial reservation, not a qualified separator. Compare bare Ø700, modest enlargement, internal collection/coalescence and external guarding against measured carryover and an explicit physical-entrainment specification. An assigned 500 µm screen cannot select among them.

This is research only. The fixed active section is Ø700 ×4200 mm, 20 ×210 mm compartments, rotor Ø231 mm, 30 rpm, adopted Np=1.2 and calculated active d32=6.068 mm. No active internals, bottom arrangement, application, database or existing report is changed.

## 1. What was reviewed and what was actually found

Existing local reports read: `top-disengager-physics.md` (including its integrated-return supplement), `top-disengager-layout.md` (including §8), and `disengager-investigation-literature.md`. Their calculations are useful **conditional hydraulic screens**, but the layout's requirement for a qualified coalescer/guard should not be interpreted as an experimentally demonstrated equipment need. This review does not amend those files.

Searches specifically sought Kühni/ECR terminal compartments, stator exit distributions, top settling regions, coalescence and entrainment. The strongest directly relevant primary findings were:

* Actual **last-stage photographic DSD measurements** in a short Kühni column, but not a downstream quiet-zone growth history or raffinate carryover measurement [1].
* A primary Kühni study distinguishing **static and dynamic DSDs** and relating their difference to size-dependent drop transport [2].
* A primary Kühni population-balance study fitting **breakage and coalescence coefficients to measured axial DSD profiles**, with residence-time dependence and weaker rotor-speed dependence than stirred-tank correlations suggest [3].
* A primary single-drop compartment transport study, which addresses residence/transport rather than drop–drop coalescence [4].
* Primary settling/coalescing-aid research explaining how to measure and model the missing separation kinetics [5,6].

**No retrieved primary study measured the complete chain “last rotor → last stator → top quiescent DSD evolution → physical NMP-in-RRBO outlet carryover” for this service.** This is a bounded search finding, not a claim that no proprietary/vendor or unpublished evidence exists. The public ECR manufacturer page is not such a dataset [7].

## 2. Primary evidence and quantitative transferability

### [1] Oliveira et al. (2008): closest measured terminal-stage distribution

N. S. Oliveira, D. Moraes Silva, M. P. C. Gondim and M. Borges Mansur, “A study of the drop size distributions and hold-up in short Kühni columns,” *Brazilian Journal of Chemical Engineering* 25(4), 729–741. DOI [10.1590/S0104-66322008000400010](https://doi.org/10.1590/S0104-66322008000400010). **Original full paper retrieved and read**, particularly Experimental, Table 1 and Figures 2–3:
https://www.scielo.br/j/bjce/a/xpHL7QGjRbJGQ4XTrsm3BrH?format=pdf&lang=en

The pilot had 150 mm ID, five stages, 85 mm six-blade rotors, 70 mm stator spacing and 30% stator free area. Photographs were taken at distributor stage 0 and stages 1, 3 and **5**, at 60–180 rpm. Thus stage 5 is a genuine terminal **active-stage** observation. It is not a measured flux distribution crossing the terminal stator or the continuous-phase outlet. The paper reports at least 400 measured drops per condition and 18 size classes over 0–9 mm. Its 0.5 mm class width and photographed sample cannot quantify a trace submillimetric carryover tail for our design.

The system was mutually saturated water continuous/Exxsol D-80 dispersed, without mass transfer, at approximately room temperature. Table 1 at 25 °C gives μc=0.0011 Pa·s, μd=0.0016 Pa·s, ρc=996, ρd=801 kg/m³ and σ=0.017 N/m. Flows tested were 1.24 and 2.00 L/min per phase. DSDs narrowed and shifted smaller with increasing stage and agitation; the authors found breakage dominant in their short column. The unagitated distributor stage also showed some influence of turbulence from the neighboring rotor stage. This supports checking disturbance beyond a nominal rotor boundary, **not** assigning a universal decay distance.

Transfer limits are large:

| Quantity | Primary experiment | Fixed RRBO/NMP basis |
|---|---:|---:|
| Column ID / stages | 150 mm / 5 | 700 mm / 20 |
| Rotor/column diameter | 0.567 | 0.330 |
| Stage spacing/column diameter | 0.467 | 0.300 |
| Continuous viscosity | 1.1 mPa·s | 59.8 mPa·s (54.4×) |
| Dispersed/continuous viscosity ratio | 1.45 | 0.02368 |
| Density difference | 195 kg/m³, dispersed phase lighter | 146 kg/m³, dispersed phase heavier |
| Interfacial tension | 17 mN/m | 11 mN/m |
| Rotor Reynolds number, ρc N Dr²/μc | Reported 7225–21675 | 387.7 |
| Continuous superficial speed | 1.17–1.89 mm/s | 2.759 mm/s |

The target rotor Reynolds number is approximately **19–56 times lower**. Neither measured DSDs nor fitted lognormal parameters nor fitted correlations can be carried into the target quantitatively. Their successful lognormal fit is not permission to generate a target tail from our d32.

The introduction discusses larger upper-stage drops attributed to feed effects in earlier multistage-contactor work (Tsouris et al., 1990). That is a **secondary attribution inside [1]**, not this paper's demonstration of coalescence above a Kühni terminal stator; it is not used here as direct ECR outlet evidence.

### [2] Kentish, Stevens and Pratt (1997): static versus dynamic distributions

“Measurement of Drop Rise Velocities within a Kühni Extraction Column,” *Industrial & Engineering Chemistry Research* 36, starting p. 4928. DOI [10.1021/ie9702690](https://doi.org/10.1021/ie9702690).
https://pubs.acs.org/doi/abs/10.1021/ie9702690

**Publisher abstract retrieved; full paper access unavailable.** The abstract distinguishes static photographic DSD from dynamic capillary-probe DSD. Their volume-density ratio, multiplied by average flow velocity, provides individual drop velocity. Low-holdup results agreed with other single-drop measurements; at higher holdup the measured velocities converged rather than retaining the same size dependence.

This is direct Kühni support for distinguishing population in a snapshot from population transported through a boundary, and for not applying dilute slip uncritically to dense dispersions. It does **not** establish the direction or magnitude of fine enrichment at our outlet. Full geometry, calibration, probe bias and the complete experimental envelope were not verified; no numerical velocity or entrainment correlation is transferred.

### [3] Kentish, Stevens and Pratt (1998): kinetics require fitted closure

“Estimation of Coalescence and Breakage Rate Constants within a Kühni Column,” *Industrial & Engineering Chemistry Research* 37(3), 1099–1106. DOI [10.1021/ie970336q](https://doi.org/10.1021/ie970336q).
https://pubs.acs.org/doi/abs/10.1021/ie970336q

**Publisher abstract retrieved; full paper access unavailable.** A simplified population balance is fitted to experimental axial DSD profiles through optimized breakage/coalescence expressions. The abstract explicitly finds weaker dependence on rotor speed than turbulent stirred-tank correlations suggest and relates the rates to drop residence time and individual velocities.

This is evidence **against inferring a coalescence time from “only 30 rpm.”** It is also evidence that active-column DSD modeling needs transport and interaction closure together. The abstract's displayed fitted expressions are not imported: their full definitions, units, operating envelope and suitability for a nonagitated end region are unverified. Even a validated active-column kernel would require a separate check as turbulence decays beyond the terminal stator.

### [4] Seikova, Gourdon and Casamatta (1992): transport is geometry-dependent

“Single-drop transport in a Kühni extraction column,” *Chemical Engineering Science* 47, 4141–4148. DOI [10.1016/0009-2509(92)85164-7](https://doi.org/10.1016/0009-2509(92)85164-7).
https://www.sciencedirect.com/science/article/pii/0009250992851647

**Publisher abstract/record retrieved, not full experimental paper.** Addresses residence time inside a single agitated compartment. It does not measure a drop swarm's coalescence rate or end-settler carryover. It reinforces the need to resolve actual transport rather than substitute gross vessel V/Q for every drop trajectory.

### [5] Henschke, Schlieper and Pfennig (2002): test-based coalescence characterization

“Determination of a coalescence parameter from batch-settling experiments,” *Chemical Engineering Journal* 85, 369–378. DOI [10.1016/S1385-8947(01)00251-0](https://doi.org/10.1016/S1385-8947(01)00251-0).
https://www.sciencedirect.com/science/article/abs/pii/S1385894701002510

**Publisher abstract, introduction and previews retrieved; full paper unavailable.** Describes an integral parameter inferred from batch settling, intended within its model to characterize coalescence independently of the mixing equipment and initial dispersed fraction. The introduction explicitly describes heavy drops accumulating in a dense zone when sedimentation outruns interfacial coalescence.

This supports measuring original-material settling/coalescence and checking accumulated inventory. It supplies no RRBO/NMP parameter. An integral interface/band parameter is not automatically a unique drop–drop kernel for a dilute top: additional DSD/time/holdup evidence is needed.

### [6] Schäfer, Hlawitschka and Bart (2022): coalescing-aid performance must be measured

“Image analysis for design and operation of gravity separators with coalescing aids,” *Canadian Journal of Chemical Engineering* 100, 2331–2346. DOI [10.1002/cjce.24503](https://doi.org/10.1002/cjce.24503).
https://onlinelibrary.wiley.com/doi/full/10.1002/cjce.24503

**Open full text retrieved; abstract, introduction and relevant separator discussion reviewed.** Primary experiments and modeling concern horizontal settlers with knitted meshes; image-based measurements support material/structure-specific performance and scale-up. The separator discussion distinguishes sedimentation and coalescence and includes vertical countercurrent separation at extraction-column heads. It is relevant methodology, not a proven NMP-compatible medium or a universal required coalescer. Its experimental hardware dimensions and efficiencies are not transferred.

### [7] Sulzer ECR manufacturer evidence

https://www.sulzer.com/en/shared/products/kuehni-agitated-columns-ecr

**Public manufacturer page retrieved in full.** Confirms special mixing turbines, perforated partition plates and adaptable compartment geometry. Its typical industrial 10–100 rpm statement concerns robust, low-maintenance operation—not instantaneous separation. The broad published viscosity capability (up to 500 mPa·s), density difference (>50 kg/m³) and interfacial tension (>1 mN/m) encompass the nominal property values here, but are not a carryover guarantee for this geometry and throughput. No terminal-zone DSD, coalescence kernel, 1600 mm height rule or mandatory guard is supplied.

## 3. Four distributions/inventories that must remain separate

1. **Active local DSD:** n(d,x,t) within agitated compartments. d32 = ∫d³n dd / ∫d²n dd is a surface/volume mean. The calculated 6.068 mm does not determine the fines fraction, maximum, minimum or terminal boundary condition.
2. **One-way exit flux-weighted DSD:** the drops actually crossing above the terminal stator with the upward stream. In a simplified dilute model, the volume contribution is proportional to d³n(d,x)[uz−vt(d)]+ integrated over the open crossing plane; turbulent dispersion, recirculation and nonuniform velocities require additional transport terms. Normalize this flux to obtain pV,F, not the local photograph. Count upward and downward crossings separately: a net distribution can hide recirculating load. Large drops that descend normally through the active section need not be represented in the upward entrainment flux.
3. **End-region DSD:** the position- and age-dependent distribution above the stator after selective settling, transport, coalescence, any residual breakup and feed-distributor interaction. An increasing observed mean can result from loss of small or large drops from a sampled population, not exclusively from coalescence. Evidence of merger events, matched flux balances and time-resolved DSD is preferable to assuming growth from a mean alone. Fresh NMP fed above the terminal stator is an additional possible source; last-stage measurements alone cannot characterize the whole top duty.
4. **Outlet physical versus dissolved NMP:** distinct-phase NMP-rich droplets constitute mechanical carryover; molecularly dissolved NMP in RRBO-rich liquid is not removed by gravity/coalescence. Total NMP analysis alone cannot identify entrainment. Use composition-appropriate dissolved-phase analysis plus separately characterized droplet loading; droplets may contain hydrocarbons/water, so physical dispersed volume is not automatically pure-NMP mass.

If an entering physical dispersed load Qe and its flux-weighted pV,F were known, a no-growth grade-efficiency description gives Qcarry = Qe∫[1−η(d)]pV,F(d)dd. With coalescence, η is not a universal independent single-drop function: it depends on load, interactions, residence distribution and accumulated inventory. None of Qe, pV,F, η or the allowable carryover is presently supplied.

## 4. What a defensible terminal population balance needs

Use a volume-coordinate number density n(v,x,t), with local convection/slip and dispersion, and source terms for drop–drop coalescence and breakup:

`∂n/∂t + ∇·[(uc + uslip)n − Dt∇n] = Bcoal − Dcoal + Bbreak − Dbreak + Sfeed`.

This is a framework, **not a fitted RRBO/NMP prediction**. Coalescence birth/death integrals require a kernel K(v,v′)=collision frequency × coalescence efficiency. Efficiency depends on film drainage, contact duration, interfacial mobility, contamination and material composition; collision frequency depends on DSD, holdup, differential settling, shear and turbulence. A bulk receiving interface or a wetted collecting medium requires additional capture, film drainage and drainage/return closure. Such sinks must conserve dispersed volume into a tracked collected inventory.

Required boundary/closure information includes:

* Terminal open-area velocity and turbulence fields, size-resolved upward/downward flux and holdup.
* Fresh-feed jet/distributor conditions, outlet withdrawal field and recirculation.
* Composition-dependent settling/swarm behavior, breakup/daughter distributions where residual shear is relevant, and calibrated coalescence behavior.
* Drop/medium and drop/bulk-interface merger capacity where collection is proposed.
* Actual residence/escape pathways and pressure-balanced return capacity.

At the fixed basis, rotor tip speed is 0.363 m/s and rotor Re≈388. Np=1.2 and rpm alone do not provide the spatial dissipation field at the terminal stator or a coalescence efficiency. These quantities cannot be converted into an arbitrary “seconds to coalesce” allowance. Quiescence reduces some breakup mechanisms, but can also reduce collision production; sparse fines may persist. No numerical coalescence time, rate or growth factor is assigned here.

## 5. Hydraulic facts useful for comparing concepts—not selecting a duty

Nominal 40 °C basis: upward RRBO continuous μc=0.0598 Pa·s, ρc=869 kg/m³; NMP-rich drops μd=0.001416 Pa·s, ρd=1015 kg/m³; σ=0.011 N/m; Qraff=3.8218 m³/h. Actual equilibrated outlet properties still need verification.

The table was independently recomputed using A=πD²/4, U=Q/A and the existing immobile spherical Schiller–Naumann screen:
`CD=(24/Re)(1+0.15Re^0.687)`, `Re=ρc vt d/μc`, `CD ρc vt²/2=(2/3)d Δρ g`.

| Local shell ID | U, mm/s | d at vt=U, mm | d at vt=2U, mm |
|---:|---:|---:|---:|
| 700 mm | 2.75854 | 1.45534 | 2.08075 |
| 900 mm | 1.66875 | 1.12713 | 1.60445 |
| 1000 mm | 1.35169 | 1.01318 | 1.44041 |
| 1200 mm | 0.93867 | 0.84298 | 1.19647 |

These are **inverse model velocity equalities**, not measured tail percentiles or separation guarantees. vt=2U is the former reports' engineer-selected 50% velocity screen, not a physical capture law. At millimetric sizes deformation/mobility and local flow add uncertainty. At 500 µm the same screen gives vt≈0.33175 mm/s, so an unchanged isolated drop rises in the ideal Ø700 upflow. That establishes its trajectory **if present**, not its loading or significance. The earlier ≈2.855 m diameter follows only if 500 µm and that factor are assigned as the duty.

The current layout's 600 mm clear allowance gives L/U≈217.5 s at Ø700. That is an ideal bulk transit scale, **not a coalescence time or proof of sufficient contacting time**. The 1600 mm gross straight includes distributor/calming, outlet cover, level band and dry allowances; it is not all quiet liquid.

## 6. Integrated choice, including the Ø700 return throat

| Candidate | Evidence needed to justify selection | Principal unresolved failure mode |
|---|---|---|
| Bare Ø700 ×1600 reservation | Measured physical outlet carryover meets specification across normal/upset conditions; representative terminal/top flux/DSD and stable inventory | Unknown fines load, residual shear/feed short-circuiting and selective upward transport |
| Modest enlargement, e.g. 900–1200 mm | Measured problematic load lies in a range meaningfully helped by reduced local U; flow distribution and **whole return path** validated | Settles locally but stalls on return through the Ø700 throat; expansion recirculation |
| Internal collector/coalescing aid | Tested wettability/compatibility, actual fine-load capture, growth or collected-phase drainage, fouling/pressure drop, supports and service space | Noncoalescing/plugged medium, re-entrainment, no hydraulic drainage path, loss of credited quiet volume |
| External guard separator | Actual withdrawal load/specification, tested separation method, pressure/inventory/control and independent collection/return design | Unqualified media, excessive pressure loss, return backflow/bypass; does not cure unstable top accumulation automatically |

An unchanged drop that settles in a larger section still encounters faster upward RRBO as the return path contracts. For example, a nominal spherical 1 mm drop has vt≈1.317 mm/s: it can descend locally in Ø1200 but cannot descend through Ø700. A 500 µm drop in a very large top has a zero-net section near Ø2019; enlargement alone does not carry it through the active throat.

Possible return mechanisms are demonstrated growth to a sufficiently settling population, an observed stable descending collected phase/film, or a protected collected-phase drain/downcomer/pumped return. **None is automatic.** Wall wetting and film continuity need evidence. A protected line requires a real collector, receiving pressure/elevation, hydrostatic head and losses, capacity at the entrained load, liquid sealing and prevention of RRBO bypass. Fresh-solvent throughput is not the entrained return duty. Do not invent an upper heavy-phase interface: a pool exists only if a collection mechanism and controlled inventory establish it.

Accordingly, **do not require or purchase a guard solely because 500 µm fails Ø700**. Nor relax a cutoff until the existing shell “passes.” Bare, enlarged and aided alternatives remain legitimate candidates until the actual duty discriminates among them.

## 7. Minimum discriminating evidence and release gates

1. Define allowed **physical dispersed NMP-rich carryover**, reporting both dispersed-phase volume and NMP mass as appropriate, separately from allowed dissolved/total NMP.
2. With representative aged RRBO/NMP at 40 °C, measure equilibrated properties, contamination/water/solids sensitivity, batch separation curves and time-resolved DSD. A batch test should inform kinetics, not replace continuous-flow validation.
3. Obtain matched observations in the last active compartment, immediately above the stator, above the fresh-feed region, along the available quiet path and in the actual withdrawal. Record local holdup, one-way flux/velocity information where possible, physical dispersed load and mass balance. Use validated optical or sampling methods suitable for opaque/viscous RRBO; quantify detection limits and sampling-induced breakup/coalescence.
4. Identify whether the remaining limitation is dilute fine-drop transport, delayed drop–drop growth, collector/interface coalescence, feed-induced entrainment, or return-path blockage. Test representative throughput, rpm, composition, startup and credible surge conditions; do not infer these from one equilibrium photograph.
5. Compare the simplest bare arrangement first against the specification. If insufficient, test modest area changes and/or collection/guard concepts at the measured duty, including stable return and accumulated inventory. A vendor guarantee must specify the actual fluid condition, load/DSD and residual **physical** carryover.

**Conclusion:** direct Kühni research supports axial evolution, transport-weighted distributions and experimentally closed coalescence models; it does not supply this terminal RRBO/NMP carryover prediction. Coalescence above the last stator may materially reduce entrainment and should be investigated rather than ignored, but no growth credit can yet be quantified. Keep the compact top as a reservation and the equipment choice open; hold hydraulic/performance release until the terminal-to-outlet evidence and integrated return mechanism are demonstrated.