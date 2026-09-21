# Conservative quiet-zone PBM and unresolved plate population

**Conditional numerical study, NOT actual RRBO/NMP probabilities or a calibrated bound.**
Run `python3 deliverables/kuhni-coalescence-model.py` (installed NumPy/SciPy).
No app, workflow, database or saved-geometry access. Keep Ø700 ×1600 reservation.

## Population definition and transport

This is a separate spatial finite-volume extension of the SAVED momentum field, not a rerun or overwrite of the original trajectory benchmark. Reconstruct ClampedField exactly. The original contact fractions are not transformed into a concentration. A declared finite pulse occupies the first axial FV layer above open slots with equal VOLUME of 1.455 and 1.650 mm drops; selected alpha=10⁻⁵ or 10⁻³ is an explicit scenario, not measured holdup. Each original size has a permanent terminal-source volume label. Fresh distributor input=0 (unknown geometry/loading); no claim to cover its actual duty. There is no continuous injection.

State X[cell,size,source] is physical dispersed volume (m³); expected drop count is Σsource X/v, and local number density is that count divided by cell mixture volume. Thus alpha=ΣX/Vcell. Expected counts may be noninteger and below unity; deterministic mean-field closure then does not resolve rare-event fluctuations. Coalescence never changes source volume, although daughters may contain both source labels. No dissolved solvent balance is conflated with this separate dispersed-phase volume.

Axisymmetric face carrier fluxes derive from differences of the SAME solved streamfunction; sum over a cell cancels exactly. Settling subtracts vt(d) times horizontal face area. Donor-cell upwinding is first-order/numerically diffusive; CFL≤0.65. Coagulation/transport Lie splitting uses 2 s outer steps with CFL-limited transport substeps; time-half halves both. All equivalent-slot edges are radial mesh boundaries. At lower face 80 radial quadrature subfaces resolve downward drop flux max(vt−uz,0) and d/2 slot clearance; downward flux outside clearance enters the surface population. This preserves simultaneous up/down drop velocities hidden by the net carrier face flux. The cell concentration is still uniform within each donor cell; this is not the prior earliest-event particle geometry. Shaft/shell have zero radial material flux; finite-radius wall interception is omitted. Contact here means bottom plate/rim unresolved contact, not the predecessor's full wall inventory. Initial layer thickness varies with spatial refinement, so that sensitivity combines transport and pulse-placement changes; no formal convergence order is claimed.

First upper-face downward return and ideal upper-plane outlet are absorbing EXTERNAL ledgers. Neither is actual lower-face passage or permanent return. Quiet entry/exit are internal face transfers, not arbitrary quiet-zone sinks. Lower compartment recycling, lateral nozzle, distributor, breakup and two-way hydrodynamic coupling remain absent.

## Collision and merger

βij=π(di+dj)²|vti−vtj|/4 [m³/s]. K=β Ehyd Emerge|encounter. Only differential-settling encounters are enabled, and only within quiet 0.298–0.898 m above the stator upper face. No generic strain-magnitude substitution into a simple-shear kernel is made. Laminar-shear encounters are omitted, not proven negligible. Ehyd=1 is the geometric reference scenario, not a universal upper bound; Emerge=0,0.1,1 are selected sensitivity parameters, not invented fitted rates. Equal-size differential-settling kernel is zero. Near-surface bulk kernels are never applied to contact inventory. Collision rates use evolving physical number concentrations, not normalized trajectory weights.

Unordered rates are K Ni Nj/Vcell (half for i=j). Fixed-pivot daughter number weights sum to one and their volume-weighted sum equals vi+vj; source volume is split in the same daughter-volume proportions. Simultaneous events use a common per-cell positivity limiter (reported). Beyond largest pivot, volume and labels enter an explicit UNRESOLVED overflow ledger; no extrapolated passage or hidden last-bin pileup. Overflow is not physical removal. Slip is recomputed at each pivot with the inherited immobile spherical Schiller–Naumann force balance. At grown sizes Bo can exceed unity: extrapolated spherical transport is only a numerical thought experiment, not a qualified deformation model.

## Conditional bulk results at 600 s

Fractions below divide by the declared initial dispersed volume, not raffinate throughput. They are not measured or actual plant fate probabilities. Alpha affects encounter rates independently of merger efficiency; a quiet-zone DSD change alone cannot identify both.

| Scenario | first face return | ideal outlet | mobile | contact | size overflow | merger events |
|---|---:|---:|---:|---:|---:|---:|
| alpha=1e-05,Ehyd=1,Emerge=0 | 0.161488 | 0.0330128 | 0.128761 | 0.676738 | 0 | 0 |
| alpha=1e-05,Ehyd=1,Emerge=1 | 0.161488 | 0.0330127 | 0.128761 | 0.676738 | 9.01047e-62 | 9.39473e-07 |
| alpha=0.001,Ehyd=1,Emerge=0 | 0.161488 | 0.0330128 | 0.128761 | 0.676738 | 0 | 0 |
| alpha=0.001,Ehyd=1,Emerge=0.1 | 0.161488 | 0.0330127 | 0.128761 | 0.676739 | 9.00153e-51 | 0.000939577 |
| alpha=0.001,Ehyd=1,Emerge=1 | 0.161488 | 0.0330118 | 0.12876 | 0.67674 | 8.91255e-40 | 0.00940618 |
| time-half | 0.161488 | 0.033025 | 0.128749 | 0.676738 | 3.99993e-38 | 0.00954368 |
| space-refined | 0.266099 | 0.0261983 | 0.106219 | 0.601484 | 3.87745e-45 | 0.000920109 |
| size-refined | 0.161488 | 0.0330118 | 0.12876 | 0.67674 | 1.24837e-69 | 0.00940743 |
| horizon-double | 0.161488 | 0.124026 | 0.0326841 | 0.681802 | 9.25102e-40 | 0.00965235 |

### Independent quiet-inventory interaction probes (300 s)

The terminal pulse becomes strongly depleted/size-segregated before reaching the quiet zone; negligible merger in that chosen pulse is NOT a claim that real quiet-zone coalescence is negligible. The following independent tests initialize equal physical volume of the same two sizes uniformly ONLY in the quiet cells at declared local alpha. These represent an unmeasured test inventory, not a derived terminal or fresh-feed input. Source labels are quiet-test size ancestries. They expose nonlinear concentration dependence without pretending to know actual occupancy or using V/Q as a coalescence time.

| Quiet probe | first face return | ideal outlet | mobile | contact | overflow | merger events |
|---|---:|---:|---:|---:|---:|---:|
| quiet inventory alpha=1e-05,Emerge=1 | 1.80734e-06 | 0.15545 | 0.652099 | 0.192448 | 2.25987e-30 | 1.66301 |
| quiet inventory alpha=0.001,Emerge=0 | 0 | 0.155702 | 0.652328 | 0.19197 | 0 | 0 |
| quiet inventory alpha=0.001,Emerge=0.1 | 8.02266e-05 | 0.15318 | 0.649478 | 0.197262 | 2.04788e-19 | 1731.11 |
| quiet inventory alpha=0.001,Emerge=1 | 0.000789799 | 0.148566 | 0.639922 | 0.210722 | 5.74972e-15 | 4992.45 |
| quiet alpha=0.001,Emerge=1,PBM step=0.5s | 0.0120689 | 0.133518 | 0.573163 | 0.28125 | 2.8615e-08 | 19445.2 |
| quiet alpha=0.001,Emerge=1,PBM step=0.25s | 0.0145734 | 0.130925 | 0.560987 | 0.293515 | 8.1772e-08 | 21087 |
| quiet alpha=0.001,Emerge=1,PBM step=0.125s | 0.0145894 | 0.130935 | 0.56097 | 0.293506 | 9.31807e-08 | 21087.3 |

Last two quiet PBM refinements differ by at most 1.6778e-05 of initial volume in an individual fate ledger. Both 0.25 and 0.125 s runs avoid event limiting; use them rather than the limited 2 s high-loading row for this conditional kinetic comparison. This checks time splitting only, not actual alpha/efficiency or carrier-field validity. Additional matched fixed-inventory checks appear below when run. The terminal spatial/pulse-placement sensitivity changes first return by about 0.105 of initial volume, much larger than its merger effect: it is not a numerically converged replacement for the original trajectory benchmark.

### Matched fixed-physical-inventory quiet validation

Reproduce separately without rerunning other cases: `python3 deliverables/kuhni-coalescence-model.py --validate-quiet base` (then `size` and `space`). All use exact mesh faces at z=0.298 and 0.898 m, uniform alpha=0.001, equal source volumes of 1.455/1.650 mm, 300 s horizon and 0.125 s PBM splitting. Thus physical volume and source inventory are identical across meshes, unlike the earlier shrinking terminal pulse. Each has a matched no-merger run on the SAME mesh and step.

| Mesh / size pivots | initial total m³ | no-merger outlet | merger outlet | outlet difference | merger contact | minimum limiter |
|---|---:|---:|---:|---:|---:|---:|
| base: 30×74 / 14 | 0.000229994742 | 0.1550381 | 0.1306309 | -0.02440717 | 0.2929649 | 1 |
| size: 30×74 / 26 | 0.000229994742 | 0.1550381 | 0.1303115 | -0.02472663 | 0.2940513 | 1 |
| space: 44×109 / 14 | 0.000229994742 | 0.1551653 | 0.1308907 | -0.02427462 | 0.2936359 | 1 |

These checks assess the selected nonlinear model, not unknown physical loading or efficiencies. Raw source ledgers, overflow and counts remain in JSON. A size- or mesh-dependent change must not be hidden by source-volume conservation.

The maximum change of any fate ledger versus the matched base is 0.00108639 for pivot refinement and 0.00121649 for spatial refinement. The selected coalescence effect on outlet fraction remains about −0.0243 to −0.0247 across these checks. This supports a numerical conditional trend, not certified convergence or a physical carryover prediction.

## Contact population, coalescence and release endpoints

Plate state S[radial patch,size,source] receives every intercepted volume and preserves size/source population. Baseline keeps it unresolved: this is NOT a predicted permanently pinned fate. No empirical seconds-to-drain or seconds-to-reentrain is supplied. The surface_exchange helper accepts a future independently qualified exchange fraction and transfers exactly equal/opposite volume; it is not a closure.

At the 600 s high-loading/unit-efficiency snapshot two morphology endpoints are computed: (a) unmerged contacts; (b) a declared binary-grouping endpoint within each radial/nominal circumferential patch. Repeated same-class mergers of the most populated class form 2v daughters until expected count reaches one per patch (or explicit size overflow). Fixed-pivot daughters never occupy bins smaller than their parents. Underoccupied patches are preserved size-for-size, never replaced by their mean drop. This particular grouping order is an intervention, not measured contact physics or an extremum. Patch arc lengths 1 m and 0.01 m test this endpoint's strong connectivity dependence; they are explicit scenarios, NOT measured film connectivity or wetting scales. No surface kernel or merger timescale is inferred. Source labels and total contact volume are exactly retained during aggregation. Large endpoint aggregates can exceed spherical-model validity and the size grid; those stay unresolved instead of receiving a fabricated outcome.

For each morphology, a 90° immersed sessile-hemisphere footprint screens whether a rim could geometrically be reached and equivalent-spherical d is smaller than slot width. This conditional contact-angle/shape is NOT measured; radial patch-center placement does not resolve subcell rim accumulations, so zero rim overlap is NOT exclusion of real drainage. Rim overlap is not drainage eligibility in the force/pressure sense and is not credited as return. The other endpoint externally FORCES complete lift-off above the same patch (one axial cell plus drop radius clearance) and follows released volume for 300 s with the preserved field, no further mergers. No lateral teleportation to a hole occurs. Lift-off placement is a numerical intervention, not a demonstrated force-permitted mechanism or a re-entrainment rate. Unsupported size/wall geometry stays unresolved. These intervention outcomes are not lower/upper carryover bounds.

| Surface morphology / patch arc m | resolved-volume d01/d50/d99 mm | rim-overlap volume | post-forced-lift first face return | post-forced-lift outlet | unresolved release |
|---|---:|---:|---:|---:|---:|
| unmerged / 1 | 1.45/1.65/1.65 | 0 | 1.03939e-09 | 1.07262e-09 | 0 |
| binary_grouping_endpoint / 1 | 1.98/6.85/8 | 0 | 0.030214 | 6.17253e-15 | 0.10061 |
| unmerged / 0.01 | 1.45/1.65/1.65 | 0 | 1.03939e-09 | 1.07262e-09 | 0 |
| binary_grouping_endpoint / 0.01 | 1.45/1.65/1.65 | 0 | 1.03939e-09 | 1.07262e-09 | 0 |

### What the force/wetting evidence does and does not resolve

Read `kuhni-coalescence-evidence.md` for primary evidence and access limits. Horizontal plate gravity has ZERO tangential component toward holes. Tangential depinning requires Fhyd,parallel + ΔρgV sinβ against kσw(cosθR−cosθA), with immersed hysteresis, footprint and geometry-specific hydrodynamic force unknown. A hemisphere rim-overlap test supplies none of these. Sliding does not prove lift-off. No universal critical Ca/We or isolated sphere drag is used as an attached-drop release criterion.

Surface size percentiles refer only to resolved-size contact volume; overflow is explicitly excluded and reported separately. JSON also gives support bins carrying at least 10⁻⁶ of initial contact volume. Numerical trace populations do not define a physically meaningful maximum drop size.
An established connected NMP film would obey the conditional lubrication relation q=[Δρg sinβ−∂s pex]h³/(3μd)+τi h²/(2μd). On a flat uniform plate without pressure gradient/traction this gives q=0, not automatic drain-to-hole. Film continuity, h, traction, pressure and edge conditions are unknown. Between approaching NMP drops, the intervening RRBO film instead drains with μc; film radius, rupture thickness, disjoining pressure, mobility and contact duration are absent. No numerical drainage clock follows. Neither 4 mm submerged head nor full-hole capillary pressure establishes small-drop passage, since no spanning meniscus/pool exists in this calculation.

**Resolution of the large-contact question:** mass conservation makes contact inventory an explicit unresolved population, not a separator success. Coalescence can change its morphology without removing any solvent; neither drainage nor lift-off is identifiable from present evidence. Conditional release trajectories are calculated, but selecting retention, downward drainage or upward re-entrainment requires coupon wetting/film/force measurements and resolved plate/lower-domain pressure/flow. This uncertainty cannot honestly be replaced by a fitted-looking first-order rate.

## Verification and sensitivity

- Bulk maximum source-balance relative residual: 4.42e-15.
- Carrier FV cell flux cancellation: 2.03e-20 m³/s.
- Asserted tests: zero-kernel bitwise identity; binary aggregation source-volume and drop-number closure; explicit overflow conservation; surface/bulk exchange cancellation; nonzero geometrically cleared first return, solid contact and upper outlet with total closure; predecessor earliest-event synthetic regressions.
- Timestep, spatial/initial-layer, size-support refinement and doubled horizon results are included above; differences are sensitivity observations, not certified errors.
- Minimum coalescence positivity factor across runs: 0.206832; largest attained local mobile alpha: 0.00104035. The 2 s high-loading quiet probe activates the limiter and is NOT an accurate kinetic reference; compare 0.5/0.25/0.125 s PBM refinements explicitly. Conservation is not accuracy.
- Surface forced-release ledgers sum to their initial contact volume, including unsupported release inventory. Detailed per-source values are in JSON.
- SHA-256 checked 371 preexisting deliverable files unchanged. Only new kuhni-coalescence-* outputs written.

## Decision and missing observations

No result qualifies bare-top performance, a required coalescer, irreversible removal, lower-face return, or actual carryover. Measure terminal/fresh-feed loading and joint DSD-position-time data, quiet-zone concentration and pair merger histories, representative aged immersed wetting/hysteresis, horizontal perforated-coupon accumulation and lower-face drainage/re-entrainment, actual local pressure/traction and allowable physical carryover. The active column, bottom, app/database and saved geometry remain untouched.
