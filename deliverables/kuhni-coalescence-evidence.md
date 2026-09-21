# Quiet-zone coalescence and plate-contact fate: evidence and implementable closures

## Finding and scope

**Gravity-driven and laminar-shear encounters are defensible mechanisms for this viscous continuous phase. They do not determine a merger rate without local population loading and film/interfacial information. Plate contact is neither demonstrated coalescence nor demonstrated drainage/return.** The present contact inventory must remain conserved and unresolved; assigning it an absorbing “removed” boundary would manufacture separator performance.

This independent investigation read `kuhni-spatial-benchmark.md`, `kuhni-terminal-flow-evidence.md`, `kuhni-terminal-coalescence-review.md` and `.agents/memory/kuhni-disengagement-boundary.md`. Only this new report is written. No existing report, code, database, geometry or workflow is changed. The formulas below are either directly supported by the retrieved primary studies or explicitly identified continuum/geometric derivations, not fitted RRBO/NMP laws.

Preserved basis: upward RRBO-rich continuous liquid, ρc=869 kg/m³, μc=0.0598 Pa·s; heavy NMP-rich drops, ρd=1015 kg/m³, μd=0.001416 Pa·s; σ=0.011 N/m; Δρ=146 kg/m³; nominal 40 °C. These inherited properties are not verified equilibrated-product measurements. Shell 700 mm; preliminary terminal plate 4 mm thick with 84 holes of diameter 46.733285782 mm and shaft annulus. The spatial benchmark replaces discrete holes with annular slots and does not resolve passage through plate thickness, wetting or the lower compartment.

## 1. Regime and what can actually be calculated

Define λ=μd/μc=0.023679 and capillary length ℓc=√[σ/(Δρg)]=**2.771 mm**, using g=9.81 m/s². Diameter-based Bond number Bo=Δρgd²/σ; Reynolds number Re=ρc vt d/μc; slip-based capillary number Ca=μc vt/σ; Weber number We=ρc vt²d/σ.

| d, mm | Existing immobile-sphere vt, mm/s | Re | Bo | Ca | We | Net submerged weight, µN |
|---:|---:|---:|---:|---:|---:|---:|
| 1.455 | 2.75726 | 0.0583 | 0.2756 | 0.01499 | 0.000874 | 2.310 |
| 2.339 | 6.89539 | 0.2344 | 0.7123 | 0.03749 | 0.008786 | 9.596 |

These use the benchmark's Schiller–Naumann velocities, not measured settling speeds. Low inertia is favorable to viscous interaction models, but Bo is not asymptotically small at the large end: deformation can matter. Small external slip Re also does not automatically justify neglecting internal dynamics when λ is very small [5].

For comparison only, clean spherical creeping-flow Hadamard–Rybczynski settling would give

`vt,HR = Δρ g d²/(18 μc) × 3(1+λ)/(2+3λ)` [m/s].

The multiplier relative to rigid Stokes is 1.483 at this λ. It is an **alternative limiting interface condition**, not an uncertainty bound or a multiplier to apply to Schiller–Naumann at finite Re. Surfactants, contaminants and interfacial rheology may immobilize an otherwise low-viscosity drop. Qualify mobility before changing the trajectory model.

### Two different films must not be confused

1. **Between approaching NMP drops, or between a drop and an NMP-wetted collector:** the intervening film is normally **RRBO**, so its drainage resistance involves μc=0.0598 Pa·s.
2. **An already established NMP-rich collected film running along a plate/wall:** the film viscosity is μd=0.001416 Pa·s, with continuous-oil traction coupled at its free liquid–liquid surface.

The 42.2-fold viscosity difference makes using one “film drainage time” for both phenomena particularly misleading.

## 2. Encounter kernels without inventing turbulent coalescence

Use size-class number concentrations Ni [m⁻³], diameters di [m], drop volumes vi=πdi³/6 [m³], and local dispersed fraction α=ΣNi vi. α is a spatial concentration, not a normalized trajectory weight, not an inlet flux probability and not automatically the fresh-solvent throughput fraction.

### 2.1 Differential settling: geometric reference

For dilute, spherical, noninteracting trajectories with uniform local slip:

`βg,ij = π(di+dj)²/4 × |vt(di)−vt(dj)|` [m³/s].

This is simply swept collision area times relative speed. Equal-sized drops have zero differential-settling kernel in this idealization, even though Brownian motion, shear, wall interactions or size-dependent fluctuations can still produce encounters. Hydrodynamic pair deflection and film drainage are **not** included. Gravity-driven pair calculations explicitly demonstrate the dependence on size ratio, viscosity ratio and intermolecular forces [1].

For the endpoint sizes and the inherited slips, βg=**4.6783×10⁻⁸ m³/s**. This is a calculable encounter scale, not a measured coalescence coefficient. The hazard for a tagged i drop encountering class j is βg,ij Nj [s⁻¹]; the successful-merger hazard is Kij Nj. Neither hazard is numerical until Nj and the interaction efficiency are supplied.

### 2.2 Resolved laminar simple shear: geometric reference

For locally linear simple shear ux=G y, G [s⁻¹], isotropic uncorrelated pair positions and affine relative motion:

`βs,ij = (4/3)|G|(ai+aj)³ = |G|(di+dj)³/6` [m³/s], with ai=di/2.

This is the Smoluchowski geometric encounter result, obtainable by integrating inward relative flux through a sphere of radius ai+aj. It is not a turbulent eddy kernel. For two 2 mm drops βs=**1.0667×10⁻⁸ |G| m³/s**. A monodisperse geometric encounter hazard is

`βs N = (8/π)|G| α = 2.5465 |G| α` [s⁻¹].

Thus even with specified shear, the collision clock remains inversely proportional to unknown α; quiet residence time alone cannot close it. Increasing holdup sufficiently also invalidates dilute-pair assumptions.

For an arbitrary resolved local velocity gradient A=∇uc [s⁻¹], a more faithful geometric expression is

`βgeom = R² ∫sphere [−n·(A R n + Δuslip)]₊ dΩ`, `R=ai+aj`.

Here n is a unit pair-separation direction, Δuslip is the relative slip vector [m/s], and `[x]₊=max(x,0)`. This derivation retains the actual strain orientation; rigid rotation alone gives zero radial encounter flux. It assumes a locally linear field across the pair and uncorrelated spherical particles. Wall proximity, nonuniform concentration and pair interactions invalidate that simple angular distribution.

Adding βg+βs is a declared encounter approximation, not an exact identity for simultaneous shear and settling. For the same affine geometric assumptions, positive-part subadditivity makes the sum an upper estimate of the combined inward-flux integral; that does **not** make it a physical upper bound when deformation, attractive forces or other mechanisms are added.

Use `CaG=μc |G| a/σ` to assess deformation: CaG=(0.003955–0.006358)|G| for the present sizes. A local velocity gradient must come from a resolved/validated field, not 30 rpm, Np, or a selected “calming time.” Primary deformable-drop simulations show that trajectories and drainage depend on λ and Ca and that modest deformation can inhibit merger [2].

### 2.3 Coalescence closure and conservation

Write, with the efficiency definition made explicit,

`Kij = βgeom,ij × Ehyd,ij × Emerge|encounter,ij` [m³/s].

The second factor represents pair deflection relative to the geometric reference; the third is a conditional probability of merger after the defined encounter. A conditional probability is between zero and one, but a collision efficiency normalized to a geometric cross-section is not universally bounded by one when attraction or a changed capture definition is included. Do not multiply a published combined “collision/coalescence efficiency” by a second drainage factor and double-count the same physics.

For distinct bins, event rate per mixture volume is Kij Ni Nj [m⁻³s⁻¹]; identical-bin unordered events have the factor 1/2. A merger transfers **vi+vj** into the daughter population. It reduces drop count, not NMP-rich dispersed volume. A sectional algorithm must preserve ΣNi vi; trajectory tags require an interaction-volume/population representation, not pairwise merging of arbitrarily normalized probability markers.

For a prescribed history, a no-event probability can be expressed as

`Pno merger = exp[−∫Σj Kij Nj dt]`,

only under the stated dilute Markov/Poisson approximation and using the evolving surrounding population. This is not a transferable single constant coalescence time. Carryover with interactions is nonlinear in loading and cannot be inferred by independent per-size transmission probabilities alone.

Brownian encounters are negligible as a primary millimetric mechanism: the rigid-sphere equal-size Smoluchowski reference is `βB=8kBT/(3μc)=1.928×10⁻¹⁹ m³/s` at 313.15 K. No turbulent kernel is warranted by the low mean hole Re or unknown rotor field. A shear/settling geometric screen and **explicitly uncalibrated efficiency sensitivities** are useful; presenting them as actual coalescence predictions is not.

## 3. Film drainage: an equation, but not a known time

Primary thin-film experiments [3, Eq. 7] report the Reynolds thinning form:

`−dh/dt = 2 h³ (Δp−Π(h)) f / (3 μc Rf²)` [m/s].

Here h [m] is film thickness; Rf [m] its lateral radius; Δp [Pa] the driving pressure; Π [Pa] the disjoining pressure under the source's opposing-pressure convention; f is a dimensionless interfacial-mobility correction. The planar, axisymmetric, parallel-film, lubrication limit with effectively immobile boundaries has f=1. This is a local model, not permission to assign a constant film radius to an undeformed spherical encounter.

For **constant** Rf, Δp>0, f=1, negligible Π and a prescribed rupture thickness hc<h0:

`td = 3 μc Rf²/(4 Δp) × (hc⁻²−h0⁻²)` [s].

Equivalently, with compressive load F=πRf²Δp [N],

`td = 3π μc Rf⁴/(4F) × (hc⁻²−h0⁻²)` [s].

These are direct integrals of the stated ideal model, not fitted laws. They show why changing hc by a factor of ten can change a late-stage drainage time by roughly 100 and why an unspecified contact patch is consequential. Substituting buoyant weight for F requires a geometry and force balance; it is not valid for all flowing two-drop encounters. Capillary pressure `4σ/d` is a drop curvature-pressure scale, not automatically the constant driving pressure across a drainage film.

A deterministic encounter could merge if its **actual** drainage/rupture time is less than its contact duration. An ensemble requires the distribution of approach angles, loads, contact histories, film defects and rupture events. Neither a universal `E=exp(−td/tcontact)` nor a fitted critical Ca is justified here. Repulsive disjoining pressure can arrest thinning; attractive forces can promote rupture. Interface mobility, surfactant coverage, Marangoni stresses, solids and film dimpling matter [2,3]. The clean-liquid bulk viscosities and σ alone supply none of the missing hc, Π(h), f or contact history.

The accessible water-in-oil study [3] is valuable **because** it compares film-balance and colliding-drop times while identifying impurity, pressure and collision-angle sensitivity. Its SPAN80-stabilized system is not RRBO/NMP; transfer the measurement method and governing dependencies, not its measured seconds or mobility factors.

## 4. Plate contact, wetting, drainage and re-entrainment

### 4.1 Resolve separate physical events

The existing benchmark stops a finite-size tag at a geometric contact surrogate. An oil lubrication layer can still separate NMP from the solid. **Geometric interception ≠ three-phase contact ≠ merger with an NMP film ≠ drainage to an opening ≠ lower-face passage ≠ permanent return.**

Possible fates include rebound/deflection after lubrication, pinned discrete drops, lateral sliding/rolling, spreading into a wetted film, coalescence with neighboring drops, rim accumulation, detachment into the upper oil, passage downward through a hole, or renewed entrainment below the plate. Do not choose one from geometry alone.

The liquid–liquid Young relation at an ideal equilibrium solid is

`γsolid,oil − γsolid,NMP = σ cos θ`,

where θ is measured **through NMP immersed in the actual oil**. Neither these solid interfacial energies nor θ follows from bulk σ. A water-in-air contact angle, or calling stainless steel “hydrophilic,” does not establish NMP-in-RRBO wetting. Real rough/aged/contaminated surfaces require advancing θA and receding θR and often deposition history. At a sharp hole rim, geometric contact-line pinning adds to material hysteresis.

### 4.2 Gravity versus capillarity does not establish drainage

At the present drop sizes Bo=0.276–0.712, so gravity and capillarity are both relevant; capillarity is not negligible. Net weight is 2.31–9.60 µN, while the order-of-magnitude capillary force σd is 16.0–25.7 µN. The relevant force is its geometry/contact-line projection, not σd itself. Neither comparison proves that a drop is permanently pinned nor that it must drain.

For a sessile drop on a plate tilted β from horizontal, a Furmidge-type **tangential depinning screen** is

`Δρ g V sinβ + Fhyd,parallel ≳ k σ w (cosθR−cosθA)` [N].

V [m³] is drop volume; w [m] is footprint width transverse to motion; k is a shape-dependent dimensionless factor, not a universal assigned constant; hydrodynamic force must come from the local flow/shape. This is a submerged force-balance adaptation of the classical retention relation [4], supported qualitatively by modern contact-line calculations [5,6]. It screens onset of motion, not its velocity or eventual separation.

On a **horizontal top plate**, sinβ=0: gravity presses the heavy drop toward the solid but supplies no lateral force toward a hole. Spreading, coalescence, capillary-pressure gradients, plate slope or hydrodynamic shear might move it, but require closure. A stationary horizontal film can accumulate until a new geometry/overflow develops. On a vertical wall gravity is tangential, yet pinning and upward oil traction can still oppose descent.

Thickness-based submerged head is `Δρg×0.004=5.729 Pa`. A **fully spanning ideal circular meniscus** in a cylindrical opening would have a capillary-pressure scale `4σ|cosθ|/Dh ≤0.942 Pa` for Dh=46.733 mm. The hole-scale Bo is about 284. **It is invalid to compare these numbers and declare every contacted drop drains:** a 1.455–2.339 mm drop does not span the hole, no collected pool/head is established, the rim is a thin aperture not a long capillary, and actual pressure/traction across the plate is unknown. Drop curvature pressure `4σ/d` is instead 18.8–30.2 Pa; again, this is not by itself a passage threshold.

The 4 mm thickness is a geometric travel distance, not an NMP head available to every intercepted drop. The existing model's upper-face return event does not prove transit to the lower face.

### 4.3 Conditional collected-film drainage equation

For an **already continuous**, thin, laminar NMP-rich film of thickness h(s), on a planar surface with coordinate s directed downhill and inclination β, a no-slip solid and imposed tangential interfacial stress τi give

`q = [Δρ g sinβ − ∂s pex] h³/(3 μd) + τi h²/(2 μd)` [m²/s per unit width].

This is a direct lubrication derivation from μd u''=∂s pex−Δρg sinβ; u(0)=0 and μd u'(h)=τi. pex [Pa] includes capillary curvature and nonhydrostatic surrounding-liquid pressure with a consistent sign convention. Positive τi assists downhill motion; upward counterflow gives negative τi. It presupposes a connected film, slowly varying shape, known thickness and suitable interfacial boundary condition. For a two-liquid system τi generally has to be solved together with the surrounding oil, not set to zero because the plate is called quiet.

For zero excess-pressure gradient and adverse stress, net drainage requires

`τi > −(2/3) Δρ g h sinβ`.

This is a **net film-flux sign condition**, not a detachment or flooding threshold; surface reversal occurs at a different stress. On a horizontal uniform film with no pressure gradient or tangential stress, this model predicts q=0, not automatic gravity drainage toward holes.

No film h, wetted width, continuity, edge condition or return capacity is known. Hence q cannot be evaluated as an actual return flow. Films may break into rivulets or fragments at plate edges; those fragments require renewed trajectory/entrainment analysis.

### 4.4 Why there is no universal re-entrainment threshold here

For a sessile drop, useful viscous loading coordinates are `CaG=μc G a/σ` and a stress coordinate `τ a/σ`; a local Weber number can diagnose inertial loading if its velocity is known. A critical value depends on θA, θR, λ, confinement, footprint/shape, rim geometry and the definition of sliding versus lift-off versus breakup. Primary low-Re numerical work explicitly reports critical conditions as functions of viscosity ratio, plate spacing and advancing/receding angles [5]. Thus “Ca<1,” “We<1,” or Bo at the drop scale cannot certify retention, drainage or absence of re-entrainment.

A force balance `Fhyd + Fbuoyancy` against resolved capillary/contact-line forces is a useful framework, but Stokes drag on an isolated sphere is not a validated drag law for an attached, flattened drop at a perforation rim. No RRBO/NMP numerical critical shear, film loading capacity, release size or entrainment velocity was retrieved.

Primary plate-separator experiments [7] actually observed **different** drainage mechanisms: water-prewetted plywood formed a film that drained and fragmented at edges; Teflon did not form a film, and collected drops rolled and fell from edges. Plate placement could also worsen separation through flow short-circuiting. These findings support separate wetting/film/drop models, not assigning either experimental mechanism to the terminal stator. Their tilted cross-flow plates and water/oil conditions are not this horizontal perforated terminal plate.

## 5. Recommended implementation and discriminating evidence

### Defensible now

1. Preserve the no-interaction run as a labeled reference. Keep mobile, unresolved solid-contact, first upper-face return and outlet export as distinct volume ledgers. No numerical efficiency credit for contacted material.
2. Add diagnostic local Re, Bo, CaG and geometric settling/shear encounter coefficients if desired. Inputs α, size fractions, mobility and efficiency must be explicit or **unavailable**. Report coefficients per unit concentration rather than silently selecting a holdup.
3. If a sensitivity study is requested, use explicitly selected loading and merger/retention scenarios with no claim of fitted probabilities. Zero-merger and immediate-contact-merger cases bracket model assumptions, not necessarily outlet carryover: growth changes trajectories and can release retained material.
4. Only a population model with physical concentration/volume weights may convert kernels to rates. Track daughter volume and source provenance through mergers. Include fresh distributor NMP separately. Near walls, replace bulk pair kernels with qualified contact/film treatment rather than carrying isotropic bulk kernels unchanged to the boundary.
5. A contact module should conserve collected inventory:

   `dVcontact/dt = Qintercept − Qremobilized − Qdrained` [m³/s],

   with merger changing morphology/count but not subtracting volume. Qdrained counts only a demonstrated boundary passage; return through the lower plate face and subsequent recycling need separate states. Unspecified terms remain unresolved, not silently zero in a claimed plant prediction.

### Evidence needed before credit

- Local dispersed fraction and joint size/position/time distribution in the quiet zone and near plate; simultaneous terminal and fresh-feed one-way fluxes. Active d32 and separately normalized per-size launch tags cannot supply α.
- Representative aged, water/solids-contaminated RRBO/NMP at 40 °C: equilibrium properties, isolated slip/mobility, paired-drop encounter/drainage outcomes under measured settling/shear conditions, and time-resolved DSD/holdup mass balance.
- Actual plate material, finish, oxide/coating and aging; immersed advancing/receding NMP contact angles, pinning at real hole rims, contact-film rupture and spreading tests. Static angle alone is insufficient.
- A representative horizontal 4 mm perforated coupon under actual opposing oil flow: observe first contact, film/rivulet formation, footprint motion, collection loading, downward hole transit and upward remobilization. Measure lower-face returned volume separately from stored plate inventory.
- A local velocity/pressure/traction field including plate thickness, discrete holes, lower compartment and fresh-feed/outlet forcing. A full-sphere low-slip Re does not supply the wall shear.
- A specified allowable **physical dispersed** NMP-rich outlet load, separated analytically from dissolved NMP.

**Recommendation:** implement encounter diagnostics and conserved contact states first. Do not add a generic turbulent coalescence law, fixed drainage seconds, unit capture efficiency, a universal critical Weber number, or a gravity/capillary “PASS” for plate return. Neither bare-top adequacy nor mandatory coalescer/guard follows from this evidence.

## 6. Primary sources retrieved and access limits

**[1] Zinchenko, A. Z. & Davis, R. H. (1994).** “Gravity-induced coalescence of drops at arbitrary Péclet numbers,” *Journal of Fluid Mechanics* **280**, 119–148. DOI: https://doi.org/10.1017/S0022112094002879 . Publisher abstract and reference list retrieved:
https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/gravityinduced-coalescence-of-drops-at-arbitrary-peclet-numbers/2F4EA803BEA254F138959869783A7608 .
Primary two-drop theory assumes dilute spherical drops and neglects deformation/inertia; treats hydrodynamic mobility, Brownian/gravitational motion and van der Waals forces. **No efficiency table or fitted RRBO/NMP rate is imported from abstract-only access.** Publisher web-posting date is 2006; journal publication is 1994.

**[2] Loewenberg, M. & Hinch, E. J. (1997).** “Collision of two deformable drops in shear flow,” *Journal of Fluid Mechanics* **338**, 299–315. Open primary author PDF retrieved and theory/conclusions reviewed:
https://www.damtp.cam.ac.uk/user/hinch/publications/JFM338_299.pdf .
Boundary-integral simulations distinguish deformation-induced pair trajectories and film gaps from actual coalescence; van der Waals attraction was not included. Shows viscosity-ratio dependence and warns against geometrical encounter=merger. Not RRBO/NMP calibration.

**[3] “Studying coalescence at different lengthscales: from films to droplets” (2022),** *Rheologica Acta* **61**, 745–759. Open primary experimental article:
https://doi.org/10.1007/s00397-022-01365-w ;
https://link.springer.com/article/10.1007/s00397-022-01365-w .
Retrieved first approximately 50,000-character section, including abstract, methods discussion and Eq. 7 Reynolds thinning law; not every later reference/appendix was inspected. Water-in-oil SPAN80 system, dynamic thin-film balance and comparison with microfluidic drop experiments. Documents mobility/disjoining-pressure terms and coalescence-time sensitivity. This is the directly checked source of the film equation above.

**[4] Furmidge, C. G. L. (1962).** “Studies at phase interfaces. I. The sliding of liquid drops on solid surfaces and a theory for spray retention,” *Journal of Colloid Science* **17**, 309–324.
https://doi.org/10.1016/0095-8522(62)90011-9 ;
https://www.sciencedirect.com/science/article/pii/0095852262900119 .
Publisher abstract/preview retrieved, not full paper. Experiments concern water/surfactant sprays on wax/cellulose acetate in air, not submerged RRBO/NMP. Supports retention dependence on tilt, size, surface tension and advancing/receding angles. The submerged tangential balance in this report is an explicitly labeled adaptation, not a verified numerical law from that experiment.

**[5] Dimitrakopoulos, P. & Higdon, J. J. L. (2001).** “On the displacement of three-dimensional fluid droplets adhering to a plane wall in viscous pressure-driven flows,” *Journal of Fluid Mechanics* **435**, 327–350.
https://doi.org/10.1017/S0022112001003883 ;
https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/on-the-displacement-of-threedimensional-fluid-droplets-adhering-to-a-plane-wall-in-viscous-pressuredriven-flows/12F86953E637B5E0E915C98831458CC7 .
Primary computational abstract retrieved, not full critical-Ca curves. Explicit parameters include λ, Ca, θA, θR and plate-spacing/drop-height ratio; reports qualitatively different low-viscosity-drop behavior. Supports the **absence of a universal threshold**, not a value for this stator.

**[6] “Droplets on inclined plates: local and global hysteresis of pinned capillary surfaces” (2014),** *Physical Review Letters* **113**, 066104.
https://doi.org/10.1103/PhysRevLett.113.066104 ;
https://pubmed.ncbi.nlm.nih.gov/25148339/ .
Primary abstract retrieved. Theory/experiment show that depinning depends on hysteresis and Bond number, and in 3D on initial width/deposition history. Not a submerged-fluid numerical correlation.

**[7] Linga, H., Dahl, A. M. & Hallanger, A. (1997).** “Performance of plate separators,” Christian Michelsen Research, CMR-97-A30013, presented at the 4th Annual Production Separations Forum, Oslo, 29–30 May 1997. Open primary experimental report:
https://www.osti.gov/etdeweb/servlets/purl/645446 .
Full extracted report retrieved; experimental setup and §§4.3–4.5 directly reviewed. Cross-flow water-in-oil separator, 20/40 mm plate spacing, variable inclination, prewetted plywood versus Teflon; reported mean mixture velocities 3.1–5.2 cm/s and plate-channel Re about 160–650. Directly observed film versus rolling-drop drainage and detrimental short-circuiting. Those regimes, materials and inclined paths are not validation of the horizontal NMP/RRBO stator; no efficiency or drainage time is transferred.

Searches also located older gravity-pair and shear-collision references, but uninspected citation leads are not used as numerical evidence. No retrieved primary source measured the complete quiet-zone/plate-contact/return/re-entrainment chain for the specified RRBO/NMP fluids.