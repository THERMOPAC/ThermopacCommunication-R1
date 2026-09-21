# Terminal-stator → return/calming → quiet region → raffinate outlet

## Decision and scope

**There is substantially more geometric evidence than “40% open area”: a current-basis local Stage-5 export contains 84 individually located round holes, a shaft annulus, 4 mm plate thickness and rotor clearances. However, that export is explicitly an unsaved preliminary preview, not a fabrication-approved Ø700 drawing.** The preserved approved-component revision is Ø600, not the stipulated Ø700. Distributor orifice geometry and terminal discharge velocity/population fields remain missing. The Ø700 ×1600 top is a reserved layout, not a demonstrated calming or separation length.

This is a read-only filesystem and literature investigation. No database query, application execution, workflow, saved-record change, active Stage-3 scientific work, bottom reselection or geometry regeneration was performed. Only this new report was added. Existing report assertions are distinguished from directly inspected artifacts. The fixed basis remains active Ø700 ×4200 mm, 20 ×210 mm, rotor Ø231 mm, 30 rpm, adopted Np=1.2; RRBO μ=0.0598 Pa·s, ρ=869 kg/m³; NMP μ=0.001416 Pa·s, ρ=1015 kg/m³; σ=0.011 N/m. These are nominal inherited properties, not measured equilibrated-product properties.

## 1. Geometry provenance: what actually exists

### 1.1 Do not confuse the two local Stage-5 artifacts

| Artifact inspected | Finding and authority limit |
|---|---|
| `approved-stage5-internals/preservation.json`, `stator.svg`, `compartment.svg`, `section.svg`, `ga.svg` | Design 269, preserved revision 5, R4 approved-component ruleset. Drawings explicitly show **Ø600**, 20×180=3600, rotor Ø198, stator 84×Ø39.559 plus Ø112 center. All remain preliminary/not for fabrication. They are historical component evidence, **not the current Ø700 dimensions**. |
| `stage5-current-269/current-preview.json`, companion SVGs | Basis Stage 3=69, Stage 4=17; Ø700, 20×210, rotor Ø231, 30 rpm. Explicit currentness: “CURRENT PRELIMINARY PREVIEW — UNSAVED, NOT AN ISSUED REVISION.” Geometry source hash `d69bc153d009196c806639257001dd8abf0914f572e4d1809cbf5f440e078138`; geometry hash `ee377680bca1d61c1afb4fc0707fbf720de70f9f2ad04b7d8fc2485e5bcb3337`. These are local export identifiers, not fresh database verification. |
| `disengager-input-audit.md`, lines 13, 86–92 | An earlier audit reports saved revision 6/id 6 with current-basis R5 geometry and the same main dimensions. This investigation did **not** query that record; the earlier raw `/tmp/disengager-input-audit.json` was not present. Do not upgrade the preview to an independently verified issued revision. |
| `top-disengager-layout.md`, §§1–4 | Separately selected Ø700 ×1600 top layout, with outlet/levels but **no selected distributor hole pattern**. Not the preview's original 700 mm top straight. Later terminal-coalescence review explicitly leaves bare-top versus auxiliary separation selection unresolved. |

Paths in this report are relative to `deliverables/` unless prefixed `shared/`.

### 1.2 Current-basis opening pattern is reconstructible

Direct fields: `geometry.r1Model.approvedComponent.stator` and `geometry.dimensions` in `current-preview.json`.

* Plate OD **700 mm**, thickness **4 mm**.
* **84 round holes, diameter 46.733285782 mm**, not the preserved Ø600 plate's 39.559 mm.
* Center opening **112 mm** around a **44 mm shaft**: radial gap **34 mm**, concentric-annulus hydraulic diameter **68 mm**.
* Six nominal **8 mm no-hole lanes**; all 84 Cartesian centers are present in the export. Exact ring rule below reproduces them: `x=r cos θ`, `y=r sin θ`, `θ=θ0+k Δθ`, `k=0…count−1`. These are column-centered plan coordinates, not unknown randomized perforations.

| Row | Radius, mm | PCD, mm | Count | First angle | Angular step |
|---|---:|---:|---:|---:|---:|
| 1 | 105.736588589 | 211.473177179 | 12 | 15° | 30° |
| 2 | 157.598215304 | 315.196430608 | 18 | 10° | 20° |
| 3 | 210 | 420 | 24 | 7.5° | 15° |
| 4 | 265 | 530 | 30 | 6° | 12° |

The historical Ø600 pattern instead has PCDs 200/310/420/530 mm with the same counts/angles. Current-builder logic (`shared/ecr-stage5-approved-components.ts`, approximately lines 90–126) increases hole diameter to retain gross φ=0.4 and moves the first two rows outward to preserve lane clearance. Thus simple uniform scaling of the historical drawing would be wrong.

Within-ring neighboring center distances are approximately 54.733/54.733/54.821/55.400 mm, with ligaments 8.000/8.000/8.088/8.667 mm. These quantify geometrical jet proximity only, not merging height.

Calculated from actual listed diameters:

```
Acolumn = π(0.700)²/4                         = 0.3848451001 m²
Agross  = π[(0.112)² + 84(0.046733285782)²]/4 = 0.1539380400 m²
Ashaft  = π(0.044)²/4                         = 0.0015205308 m²
Anet    = Agross − Ashaft                     = 0.1524175092 m²
φgross = 0.400000; φnet = 0.3960489796
```

**Export consistency caution:** `dimensions.shaftAreaM2` separately contains 0.0020696114 m², inconsistent with its overwritten 44 mm shaft diameter. The stator net-area field agrees with direct 44 mm subtraction. The component builder overwrites shaft diameter and stator areas but does not overwrite that inherited shaft-area field. No code or data correction is made here; use the explicit diameters for this audit, and reconcile the field before downstream automation.

### 1.3 Rotor-relative terminal geometry and an important 2 mm datum correction

Current export: rotor axial envelope **32 mm**, six blades, blade thickness **3 mm**, two **2 mm** shrouds, shroud eye **130 mm**. Rotor-wall radial clearance **234.5 mm**; rotor-to-stator face clearances **87 mm** on either side of a typical compartment. Rotor/stator center-plane separation is **105 mm**, not 87 mm.

Last compartment, bottom-pole datum: bottom 4865, rotor center 4970, terminal-stator center 5075 mm. Active start is 875 mm. Thus, in the top-local convention with active top/stator center `z=0`:

* Rotor center `z=−105 mm`, rotor top `z=−89 mm`.
* Stator lower/upper faces `z=−2/+2 mm`.
* Last rotor top to stator lower face: **87 mm**.

This is supported by the centered plate section in `shared/ecr-stage5-r1-drawings.ts` and the clearance formulas in `shared/ecr-stage5-approved-components.ts`. There is no separately evidenced special terminal perforation pattern; the exported compartment/plate construction uses the common stator.

The preliminary top layout assumes the terminal obstruction at or below `z=0`, while the exported upper face projects **2 mm above it**. Hence its 0–200 mm calming interval provides **198 mm above this plate face**, before additional supports. To retain a full 200 mm clear interval, explicitly shift the lower stack datum by 2 mm and reconcile the total envelope; do not silently change active pitch or rotor location.

### 1.4 Distributor, outlet and levels: existing geometry versus selected allowances

The current preview's original top straight is 700 mm. It has a radial NMP feed P03, **70 mm bore**, bottom-pole elevation 5355 mm, azimuth 180°, i.e. top-local `z=280 mm`; raffinate P04, **70 mm bore**, elevation 5495 mm, azimuth 0°, `z=420 mm`. These are shell connections, **not distributor holes**. Upper shaft support elevation 5425 mm (`z=350 mm`) and its envelope also exist; they would intrude into the later proposed quiet interval if carried over unchanged. They require reconciliation, not automatic erasure when reserving a longer top.

The later Ø700 ×1600 reservation in `top-disengager-layout.md` selects:

| Feature | Top-local z, mm |
|---|---:|
| Calming/return allowance | 0–200 |
| Distributor/support envelope; downward fresh feed | 200–300; feed CL 250 |
| Nominal unobstructed quiet interval | 300–900 |
| Raffinate opening lower edge / CL / crown | 900 / 935 / 970 |
| Low / normal / high liquid–gas levels | 1270 / 1345 / 1420 |
| Top straight tangent | 1600 |

These proposed levels and relocated outlet are **not found as issued Stage-5 geometry**. They are not an NMP/RRBO interface. Neither 1600 mm gross height nor cover above the outlet is all upstream quiet settling path.

**Still absent:** distributor ring/header dimensions, hole count/diameters/coordinates, orientation vectors, discharge coefficients, feed pressure, manifold balance, support footprint and feed DSD; actual outlet takeoff/entry contour, any anti-vortex internals, final azimuth/shaft-support integration in the 1600 mm layout; qualified level-control response and gas-space arrangement. A 70 mm feed connection does not supply those missing fields.

## 2. What velocity and Reynolds-number calculations honestly say

For continuity screening only, inherit the explicitly provisional N4 raffinate volume proxy **3.821794230 m³/h**, giving full-bore `U=2.758537 mm/s`. N7 is an alternative; no governing outlet lineage or mixture properties are newly approved.

* `U/φgross = 6.896343 mm/s`.
* `Q/Anet = 6.965141 mm/s`.

**Neither number is the actual terminal-stator hole discharge velocity.** They assume a carrier-only positive uniform opening flux with the stated net flow. Actual `u(x,t)=mean u(x)+u′(x,t)` includes rotor-driven spatial nonuniformity, coherent pulsation/swirl, possible reverse flow and two-phase displacement. Even the correct net flux cannot reveal the two one-way fluxes. For a phase-resolved formulation, integrate `αc uc·n` rather than substitute mixture velocity.

At fixed net Q, momentum flux `ρ∫ u_z² dA`, its radial distribution and its time average depend on the profile and fluctuations, not just `Q/Aopen`. Holdup, changing drop shapes, wall wetting and the center annulus further prevent equal flow allocation to every hole.

Using RRBO continuous viscosity, `νc=6.88147×10⁻⁵ m²/s`:

```
Re_h = ρc |u_h| d_h / μc
     = 0.100216 (d_h / mm) [|u_h| / (6.896343 mm/s)].
```

| Geometry/scale | Reynolds number at the gross-area mean |
|---|---:|
| Hypothetical dh=5 / 10 / 20 mm, for parameter sensitivity only | 0.50 / 1.00 / 2.00 |
| Actual exported round hole dh=46.7333 mm | **4.68** |
| Shaft annulus hydraulic diameter 68 mm | **6.81** |

Using net-area mean gives round-hole Re≈4.73. Thickness/round-hole diameter is **0.0856**, a thin aperture rather than a developed long pipe. At the same assumed mean and hole diameter, NMP-only Re would be about 231, but this is **not** the RRBO carrier-jet Reynolds number and not a distributor calculation.

Rotor `Re=ρc N Dr²/μc=387.7`, tip speed **0.36285 m/s**. Substituting tip speed into a hole-based Re would give approximately 246, solely a scale comparison—not a known hole speed, bound or fluctuation amplitude. Np and rpm do not determine this amplitude or an eddy diffusivity.

The mean-flow hole Re indicates strong viscous importance and gives no basis for importing a fully turbulent round-jet decay/spreading coefficient. It also does not prove the actual unsteady terminal field is laminar. A dimensional transverse viscous time `dh²/ν≈31.7 s` and corresponding mean advection distance `Uj dh²/ν≈0.219 m` can be formed. **This is not a calculated decay/merging length or validation of the selected 200 mm allowance:** radius versus diameter and the appropriate transverse mode already alter that scale; nearby jets, finite plate, walls, feed, rotor forcing and pressure redistribution determine the real field. No constant is fitted or invented.

Open area alone determines neither hydraulic diameter nor jet momentum distribution, merging distance or eddy diffusivity. Here hole diameter/pattern are available in a provisional export; the missing obstacle is chiefly validated boundary conditions and flow/transport closure, not an intrinsically unknowable hole diameter.

## 3. Primary literature: support and explicit access/transfer limits

### [1] Perforated plates: geometry- and regime-dependent losses, not a calming correlation

Shuai Li, Lars Davidson and Shia-Hui Peng (2024), “A pressure-loss model for flow-through round-hole perforated plates of moderate porosity and thickness in laminar and turbulent flow regimes,” *International Journal of Heat and Mass Transfer* 226, 125490. DOI: https://doi.org/10.1016/j.ijheatmasstransfer.2024.125490 .

Publisher landing page fetched: https://www.sciencedirect.com/science/article/pii/S0017931024003211 . **Primary full-paper PDF accessible at Chalmers:** https://research.chalmers.se/publication/541413/file/541413_Fulltext.pdf . Reviewed its first fetched 50,000-character segment, including definitions, model development, laminar comparison and validation discussion; extraction was truncated, so this is not a claim to have inspected every appendix/reference.

The paper distinguishes pore diameter, spacing, plate thickness, porosity and pore Reynolds number. It treats Darcy and inertial pressure-loss contributions and compares against laminar simulations as well as turbulent air experiments. Its discussion reports Darcy dominance in the low-Re regime and explicitly links thickness to separation/reattachment behavior. Validation includes δ/D=0.25 laminar comparisons; model development uses moderate porosities near 0.4–0.63. Our δ/D≈0.0856, irregular ring arrangement plus shaft annulus, countercurrent droplets and upstream rotor are not the demonstrated target configuration.

**Use:** organize a local aperture resistance model and select appropriate validation cases. **Do not use:** a pressure-drop fit as a measured jet-decay law, a universal merging distance or proof that 200 mm is quiet.

Additional search lead, **not relied on quantitatively:** “Characterization of Fluid Flow Through Perforated Plates,” *Journal of Porous Media* 22(11), 2019, https://www.dl.begellhouse.com/journals/49dcde6d4c0809db,38c159d667a9b5b0,7b6a0fd57c999d86.html . Search snippet describes numerical Re=10⁻¹–10⁴, porosity 0.15–0.90, but the fetched publisher response contained only a navigation line. Full primary content was not obtained; snippet ranges are not validation evidence.

### [2] Viscous jet evidence: low-Re jets are not simply turbulent jets with smaller constants

N. Laohakunakorn et al. (2013), “A Landau–Squire Nanojet,” *Nano Letters* 13, 5141–5146, DOI https://doi.org/10.1021/nl402350a . **Open primary author manuscript fetched and relevant theory/experimental passages read:** https://pmc.ncbi.nlm.nih.gov/articles/PMC3897716/ .

An electroosmotically driven nanopore experiment tests a low-Re Landau–Squire field. The authors describe its low-Re Stokeslet limit, point-momentum-source idealization, entrainment and a far-field validity condition; their quoted Reynolds definition is momentum-based and approximately 0.1, not our conventional `ρ u dh/μ`. They explicitly distinguish finite nozzle volume flux from a zero-volume-flux point-force idealization.

**Use:** primary evidence for viscous, multidimensional entraining jet fields and caution against borrowing turbulent jet coefficients. **Limits:** isolated nanoscale jet/reservoir, not finite perforated plate, multi-jet interaction, confined coflow, rotor or two-phase RRBO. Its inverse-distance far-field behavior is not a finite-height quiet criterion. No fitted amplitude or numerical decay length is transferred.

### [3] Kühni velocity measurements: actual vortices, but not a terminal-top experiment

M.W. Hlawitschka and H.-J. Bart (2012), “Determination of local velocity, energy dissipation and phase fraction with LIF- and PIV-measurement in a Kühni miniplant extraction column,” *Chemical Engineering Science* 69, 138–145, DOI https://doi.org/10.1016/j.ces.2011.10.019 .

**Publisher abstract/introduction and section previews fetched, not full paper:** https://www.sciencedirect.com/science/article/abs/pii/S0009250911007238 . The velocity-measurement preview describes radial/axial PIV from shaft to wall and stator to stator, CaCl₂/water at 100–300 rpm and zero throughput, with two large vortices above/below the stirrer. The abstract reports strong flow-pattern changes at extremely low dispersed flow and accumulation beneath the stirrer.

**Use:** direct evidence of multidimensional compartment circulation and loading-dependent flow. **Limits:** not the open top above a final stator, not 30 rpm viscous RRBO, and zero-throughput vectors cannot prescribe our withdrawal field. Full velocity maps, uncertainty and complete conditions were not accessible; no terminal recirculation strength or return probability is extracted.

### [4] Kühni drop transport: radial location matters

F. Buchbender, A. Fischer and A. Pfennig, “Influence of compartment geometry on the residence time of single drops in Kühni extraction columns,” DOI https://doi.org/10.1016/j.ces.2013.10.010 .

**Publisher abstract/introduction/section previews fetched; full paper unavailable:** https://www.sciencedirect.com/science/article/abs/pii/S0009250913006945 . Single-drop experiments motivate a three-zone model: lower toroidal vortex, impeller zone, upper toroidal vortex. Its abstract explicitly superimposes drop settling on a vortex axial velocity depending on **radial position**, with stochastic stator impact/backmixing. This is unusually direct evidence against replacing compartment transport with one axial decay curve.

**Limits:** compartment single-drop residence, not a terminal-top swarm/coalescence/outlet test. Do not transfer fitted stochastic coefficients, geometry optimization or residence times into the fixed design.

The earlier `kuhni-terminal-coalescence-review.md` separately records Oliveira et al.'s terminal **active-stage** photographs and explains why they are not terminal-stator-crossing or outlet DSDs. That evidence is not relabeled as terminal-top velocimetry here. **No primary evidence retrieved in this bounded search validates the complete terminal-stator→top-return→raffinate-withdrawal field for this service.** This does not exclude proprietary vendor measurements.

## 4. Why a monotone one-dimensional decay does not demonstrate return

Let a heavy drop obey `dz/dt = u(z) − vt`, with `u(0)=Uj`, `u(z)→U`, and `u′(z)<0`. For **U < vt < Uj**, a crossing `u(z*)=vt` has:

* positive upward speed below z*;
* negative downward speed above z*;
* stable equilibrium because the derivative of the right-hand side is negative.

The drop approaches a **trap**, not a return route through the stator. In the deterministic terminal-slip ODE it cannot cross the equilibrium and continue to the active section. Finite drop inertia could change transient motion, but is not included in that model and cannot be silently invoked as irreversible return. If the profile never reaches vt within the actual domain, even the trap need not exist there.

Moreover, a cross-sectionally uniform `u(z)` decreasing in a constant-area incompressible carrier-only vessel, without lateral flux, violates continuity: `∂uz/∂z=0` is required. A decaying **jet-core** velocity is possible because its area and lateral entrainment change, with compensating surrounding flow. Jet core and full-bore mean cannot be interchanged.

Genuine return can occur when a drop migrates laterally from a fast jet to a connected low-upflow or downflow region where `uz−vt<0`, and then reaches an opening/return passage. Carrier downflow is not strictly required: upward carrier slower than vt suffices. No-slip near a wall alone does not demonstrate that drops can reach that region, avoid deposition and find a passage back through the stator. Coalescence could increase vt and release a trap, but requires separate measured kinetics and a connected return path.

## 5. Minimal physically closed next model—not a claimed simulation

### 5.1 Preferred resolved-opening model

Include the last fixed rotor compartment, the **actual perforated terminal plate and shaft**, top shell, distributor and side outlet. Solve incompressible transient viscous momentum with moving rotor boundaries at fixed 30 rpm:

```
∇·u = 0
ρc(∂t u + u·∇u) = −∇p + μc ∇²u + f
```

For a dilute continuous-phase approximation this is a baseline carrier field, not a finite-holdup mixture identity. Use no-slip walls/plate/shaft/rotor and resolved openings. Let rotation generate the boundary fluctuations rather than equating hole speed to tip speed or imposing invented turbulence intensity. Np=1.2 remains the adopted inherited power basis; integrated model torque/power is a consistency diagnostic, not a license to tune viscosity or reselect active geometry. A laminar transient calculation is a testable baseline, not proof that all unsteadiness is resolved.

Instead of including the last rotor, a top-only domain could take a **measured or validated** time-resolved vector/pressure coupling and bidirectional phase flux at each opening. Giving only its net Q does not close that boundary. Do not simultaneously overprescribe velocity and traction.

Fresh NMP enters at its real distributor outlets with known flow and injection population. Raffinate is removed at the real side takeoff with prescribed withdrawal flow plus a consistent pressure reference/traction treatment, not a uniform absorbing plane across the vessel. The free surface obeys kinematic inventory balance (or a specified level-controlled boundary); a rigid-lid simplification must be labeled. Outlet rate, fresh feed and terminal exchange must satisfy total volume balance.

At non-negligible dispersed loading, use phase continuity:

```
∂t αk + ∇·(αk uk) = Sk,      αc + αd = 1
∇·(αc uc + αd ud) = ΣSk
```

With incompressible phases and no net volumetric production the mixture flux is divergence-free, not necessarily uc alone. Include interphase momentum/buoyancy and appropriate source accounting. Dispersed NMP injection is not an arbitrary extra continuous-oil inlet. Sum all terminal upward/downward phase fluxes, fresh feed and outlet withdrawals; reflected/recycled crossings cannot create volume.

### 5.2 Minimal axisymmetric screening alternative

A 2D `(r,z)` meridional field with swirl is useful if its azimuthal averaging is explicit. Annularize each hole ring while retaining ring open area and its flux/momentum information; preserve the central annulus, thickness and rotor separation. Resolve `ur` and `uz`; for the dilute incompressible baseline a streamfunction guarantees continuity:

```
ur = −(1/r) ∂ψ/∂z,       uz = (1/r) ∂ψ/∂r.
```

Determine ψ from the momentum solution/validated boundary data, **not by inventing a vortex amplitude**. Annularization loses discrete-hole merging and angular lanes; it must be checked against resolved geometry. A single side outlet is not axisymmetric: replacing it with an annular withdrawal band is only a declared screening approximation and may miss direct short-circuiting. Similarly, the distributor cannot be resolved until its geometry exists.

### 5.3 Size/volume population transport and measurable return

For a dilute, terminal-slip baseline, use drop volume coordinate v, upward z, number density n(v,r,z,t):

```
Jv = (uc − vt(v) ez)n − D · ∇n
∂t n + (1/r)∂r(r Jv,r) + ∂z Jv,z = Bcoal − Dcoal + Bbreak − Dbreak.
```

Here **D is a dispersion tensor, not hole diameter**. Start with D=0 only as a declared no-unresolved-dispersion baseline; introduce measured/validated dispersion if needed, not an arbitrary eddy coefficient. A force-balance drag law with mobility/shape qualification supplies vt; rapid rotor-region acceleration may require drop momentum rather than instantaneous slip. Coalescence and breakup kernels/daughter distributions are unavailable, so no invented rates. Their source terms must conserve `∫v n dv`; collection requires a separate conserved collected inventory and drainage model.

Boundary population data:

1. Size-, position- and time-resolved **one-way upward terminal flux**, and outgoing downward flux determined by the solution. Net crossing distributions hide recycling.
2. A separately tagged fresh-feed population at distributor outlets.
3. Convective escape at the actual raffinate opening, and explicit wall interaction assumptions. No unexplained absorbing wall sink.
4. Return counted when the drop crosses downward into the active section through a viable opening. This is **first return**, not permanent removal if re-entrainment remains possible.

Integrate `v Jv·n_boundary` over the outlet to obtain physical dispersed-volume carryover. Track tagged initial/feed volume so repeated stator crossings are not double-counted. Report initial inventory + injected volume = current inventory + net returned/exported/collected volume, with any active-section reinjection explicit. Molecularly dissolved NMP is a separate component balance, not settled-droplet removal.

## 6. Bounded calculations and actionable holds

**Computable now, without reopening upstream science:** reconstruct the provisional terminal plate; audit clearances and the 2 mm face offset; distinguish original versus reserved outlet elevations; calculate carrier-only mean scales, geometry ratios and parametric Re; implement a conditional zero-dispersion/noncoalescing transport benchmark once a declared flow field is supplied. Such a benchmark may demonstrate trapping or possible return pathways, not predict plant carryover.

**Not identifiable now:** actual opening flux allocation/fluctuations/swirl, jet decay or merging distance, top recirculation strength, distributor-induced disturbance, eddy diffusivity, terminal/fresh-feed flux-weighted DSD and load, permanent return probability, coalescence times, carryover fraction, or a unique required quiet height. Neither active d32 nor φ=0.4 closes these.

Priority actions, preserving active geometry and bottom:

1. **Bind the geometry:** owner to confirm the saved Ø700 revision against the local preview; reconcile stale shaft area, terminal upper-face datum and existing upper shaft support with the reserved top. Obtain actual mechanical tolerance/support drawings without changing internals.
2. **Complete fresh-feed/outlet geometry:** distributor hole coordinates/dimensions/directions, manifold pressure/flow, support envelope, actual outlet entry and final level-control arrangement.
3. **Measure or validate the terminal field:** radial/azimuthal opening velocity maps, mean and fluctuations/swirl, bidirectional liquid and drop flux; sample multiple heights through the first 300 mm and into the quiet region. Measurements must suit the actual viscous RRBO/NMP system; water-only similarity requires explicit Reynolds/property matching.
4. **Close population and performance:** terminal and fresh-feed DSD/loading, drag/mobility qualification, allowable *physical* carryover, residence/return tracing, and coalescence/dispersion evidence if credited.
5. **Run a conservation-checked multidimensional model or pilot comparison:** report outlet short-circuiting, stable traps/inventory, first-return versus re-entrainment and sensitivity to boundary uncertainty. Keep the 200 mm calming and 600 mm quiet allowances **HOLD**, not failed or approved merely from an axial velocity crossing.

No result here establishes that a guard/coalescer is mandatory, or that a bare Ø700 top is adequate. The useful correction is that provisional hole geometry **does exist**, while the multidimensional forcing and population/outlet closure required to turn it into a performance prediction do not.