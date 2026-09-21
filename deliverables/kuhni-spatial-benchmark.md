# Conditional terminal-stator spatial laminar / tagged-volume benchmark

**Executable momentum-based screening benchmark, not calibrated actual flow; hydraulic/fabrication HOLD.**

Run `python3 deliverables/kuhni-spatial-benchmark.py`. Installed NumPy/SciPy only; no installation, app, DB, network or workflow access. SVG generated without plotting dependencies.

## Geometry and declared boundaries

Read the full terminal-flow evidence report, chain report, boundary memory and actual current-preview geometry. The preview is unsaved/preliminary, not an issued drawing. Actual 84 × 46.733285782 mm holes are mapped to four equivalent annular slots: each slot preserves its row's area and center radius, NOT discrete-hole momentum or azimuthal interhole topology. Central 112 mm opening around 44 mm shaft is retained. Shell is 700 mm. The 4 mm plate has faces at top-local −2/+2 mm; model starts at the upper face. Rotor top −89 mm, lower plate face −2 mm: 87 mm clearance, rotor center −105 mm. Rotor and aperture thickness are not meshed; their unknown discharge is replaced by an explicitly conditional upper-face inlet. No plate pressure loss or rotor torque is calculated.

At each slot impose a smooth sin² radial axial inflow, zero radial velocity, equal peak in every slot, normalized to carrier Q=3.821794230 m³/h. This is an analyst boundary condition, NOT a thin-aperture fully developed profile or measured flow allocation. Peak exceeds the old uniform-opening mean, so the old 2.339 mm mean-jet cutoff is not a support cutoff here. Adjacent annular-slot jets and radial/inter-slot paths are resolved; individual holes and the six angular lanes are lost. The computed inlet momentum and uniform actual-open-area momentum are both recorded to expose, not conceal, this mismatch.

Shell/shaft are stationary no-slip; swirl=0. There is no rotor forcing despite inherited 30 rpm and Np=1.2; these cannot determine an inlet vector field. Distributor/support envelope top-local 200–300 mm is transparent: fresh NMP source=0, no support obstruction, no injected momentum. Continue the SAME tags into quiet z=300–900 mm, then to ideal whole-annulus withdrawal at local z=970 mm with developed annular Stokes velocity. This is NOT the actual 70 mm lateral nozzle. Free surface, level inventory and upper support are not modeled. These strong assumptions are deliberately favorable to a tractable conditional test, not a physical bound.

## Momentum equations and numerical method

Solve steady axisymmetric, incompressible, no-swirl laminar momentum: ρ(u·∇)u=−∇p+μ∇²u, ∇·u=0. With ur=−ψz/r and uz=ψr/r, let Eψ=ψrr−ψr/r+ψzz=q. The pressure-eliminated equation is E q=(ur qr+uz qz−2ur q/r)/ν. Start with Stokes E q=0 by minimizing 2πμ∫q²/r dr dz with clamped boundaries. Then iterate the full advective-vorticity RHS using centered differences and 0.35 under-relaxation; sparse viscous factorization is reused. Stop only at relative streamfunction update <2e−9; failure raises an explicit error. This is a nonlinear steady laminar solve, not a prescribed vortex or turbulent jet correlation. An independent Stokes comparison quantifies the cost of dropping inertia.

The discrete solve fixes first interior rows as a first-order approximation to normal derivative conditions; this does not itself provide an accurate boundary derivative under arbitrary interpolation. Reconstruction therefore uses ANALYTIC inlet/outlet streamfunction lifts plus a tensor cubic residual spline with exact clamped zero normal derivatives on all four boundaries. The lifts use boundary-local clamped axial cardinal splines (one at their boundary node, zero at other axial nodes), over a cubic radial base. Thus aperture-scale analytic radial structure does not contaminate the quiet-zone derivatives through imperfect cancellation of a global lift. Analytic slot integrals make the solid-plate axial velocity identically zero and preserve exact prescribed opening velocity, including between nodes. Both wall velocity components and inlet/outlet radial velocities are tested directly at thousands of points. This corrects the rejected original unconstrained RectBivariateSpline reconstruction; original fate numbers are superseded.

Pressure is eliminated by curl; recorded linear residual belongs to the initial Stokes solve, and nonlinear curl-momentum residual is normalized by the advective load. These are discrete equations, not a guarantee that every reconstructed off-grid derivative satisfies momentum exactly. No primitive-pressure or transient-stability validation is claimed. Both velocity components derive from the SAME reconstructed ψ; an independent centered divergence diagnostic is reported. Section flux follows exactly from boundary ψ. NPZ saves the solved nodal field and grids; reconstruct using ClampedField from the script, NOT a default RectBivariateSpline.

RRBO μ=.0598 Pa·s, ρ=869 kg/m³. Net mean hole Re≈4.73, annulus Re≈6.88. Viscosity matters and turbulent jet constants are unjustified, but Re is NOT ≪1. Stokes alone is not an asymptotically controlled approximation at this Re. Imposed inlet peak≈13.93 mm/s corresponds to round-hole Re≈9.46 (only a comparison scale for the annular surrogate). Therefore the principal results retain convective inertia. Axisymmetric steady laminar flow is a defensible mathematical *conditional benchmark* at these small imposed Reynolds numbers, but unknown rotor-driven velocities and swirl prevent it from being an actual-flow prediction. The inlet/developed-outlet constraints drive radial spreading and weak compensating flow without prescribing a vortex amplitude. A resolved rotating-rotor/discrete-hole calculation or measurements are still needed.

## Conservative population method and return meaning

Dilute noninteracting tags obey dr/dt=ur, dz/dt=uz−vt(d); Schiller–Naumann force balance, isolated spherical immobile-interface droplets (NMP density 1015 kg/m³), constant size, zero unresolved dispersion/coalescence/breakup. Instantaneous terminal slip is an approximation, not resolved droplet momentum. Deterministic radial midpoint quadrature at 50 µm above upper face, in equivalent open slots only, weights each tag by 2πr Δr max(uz−vt,0). This is conditional gross *volume-flux* weighting per uniform opening-local alpha at each size, not equal-number weighting or a measured DSD. Probabilities normalize separately for each size; no absolute ppm or cross-size population is inferred.

Explicit midpoint time stepping with earliest-event localization along each accepted step segment: compute all shell/shaft contact, plate-face contact, slot-lip contact, lower-return and outlet intersections; stop at the minimum fractional time, with contact priority at exact ties. Later intersections cannot overwrite an earlier event. This detects a lip encountered before the lower return even if the endpoint lies in a different slot. Four synthetic event-order/location regressions are asserted. The accepted segment approximates a curved trajectory, so time refinement remains necessary; no exact continuous-trajectory event bound is claimed. Quiet events are counted only on the actually traversed, truncated segment.

First downward crossing of an equivalent slot absorbs the tag as **first return**. Landing on plate or touching walls remains separately conserved contact inventory (no drainage/remobilization closure), never removal. The lower compartment is absent; later re-entry/re-entrainment of returned tags is UNKNOWN. Upper ideal withdrawal absorbs as P_transmit. P_retained = mobile + contact at the specified finite horizon; trapping is not permanent capture. Quiet up/down crossings count tagged-volume EVENTS and cancel in the inventory identity, while unique ever-quiet and return-after-quiet are separately reported. No fresh-source tags or dissolved NMP are included.

Finite-size surrogate: launch/return slot edges and shell/shaft are offset by d/2 for centroid clearance. A centroid within d/2 of the plate outside a cleared slot is retained as contact. This conservative slot-clearance rule is not exact sphere/round-hole collision geometry; deformation, lubrication and wetting are unresolved. Upper-plane transmission is a centroid crossing. Zero launched flux would make normalized conditional probabilities undefined (explicit guard), not zero; every requested size has positive launched flux here. Lower passage traversal through the 4 mm plate is NOT demonstrated: first return is an upper-face re-crossing through an eligible equivalent opening, not a resolved lower-face/active-compartment exit.

## Fine-grid results (1200 s, dt=0.1 s, 384 radial launch bins)

| d mm | vt mm/s | first return | ideal transmit | retained mobile | retained contact | ever quiet |
|---:|---:|---:|---:|---:|---:|---:|
| 1.455 | 2.75726 | 0.077826 | 0.290326 | 0.032512 | 0.599336 | 0.322838 |
| 1.550 | 3.12016 | 0.106194 | 0.189156 | 0.017818 | 0.686833 | 0.206974 |
| 1.650 | 3.52451 | 0.139895 | 0.067158 | 0.057963 | 0.734984 | 0.125121 |
| 1.750 | 3.95132 | 0.176008 | 0.000000 | 0.046263 | 0.777728 | 0.032220 |
| 1.850 | 4.40014 | 0.217562 | 0.000000 | 0.000000 | 0.782438 | 0.000000 |
| 1.950 | 4.87048 | 0.286973 | 0.000000 | 0.000000 | 0.713027 | 0.000000 |
| 2.050 | 5.36184 | 0.345392 | 0.000000 | 0.000000 | 0.654608 | 0.000000 |
| 2.150 | 5.87373 | 0.447929 | 0.000000 | 0.000000 | 0.552071 | 0.000000 |
| 2.250 | 6.40561 | 0.567471 | 0.000000 | 0.000000 | 0.432529 | 0.000000 |
| 2.339 | 6.89539 | 0.735275 | 0.000000 | 0.000000 | 0.264725 | 0.000000 |

## Verification and sensitivity

| run | max ΔP return | max ΔP transmit | max ΔP retained |
|---|---:|---:|---:|
| grid-49 | 0.000874093 | 0.0221205 | 0.0223152 |
| grid-73 | 0.00119916 | 0.00815999 | 0.0080372 |
| grid-97 | 0 | 0 | 0 |
| time-half | 0 | 0 | 0 |
| particles-double | 0.0176359 | 0.0101808 | 0.0176359 |
| horizon-double | 0 | 0.0398092 | 0.0398092 |
| Stokes-comparison | 0.000503504 | 0.00631433 | 0.00631406 |

- 49×145: initial linear residual 8.23e-15; nonlinear curl-momentum residual 8.65e-10 (89 iterations); section flux relative error 0; max divergence 6.84e-08 s⁻¹; ur range [-0.0026573873173540577, 0.004166892451166668] m/s; uz range [-0.00010118913580830603, 0.011486432794202897] m/s.
  Direct maximum boundary-velocity residual: 3.47e-18 m/s. At 50 µm launch offset maximum radial velocity is 2.24477e-05 m/s; this interior value is not a no-slip boundary condition.

- 73×217: initial linear residual 1e-14; nonlinear curl-momentum residual 6.63e-10 (89 iterations); section flux relative error 0; max divergence 4.46e-08 s⁻¹; ur range [-0.002673095143807078, 0.003705086321529976] m/s; uz range [-0.00010310551503551232, 0.012318859749378594] m/s.
  Direct maximum boundary-velocity residual: 3.47e-18 m/s. At 50 µm launch offset maximum radial velocity is 2.58192e-05 m/s; this interior value is not a no-slip boundary condition.

- 97×289: initial linear residual 1.21e-14; nonlinear curl-momentum residual 5.72e-10 (89 iterations); section flux relative error 0; max divergence 3.69e-08 s⁻¹; ur range [-0.0025475350638924496, 0.0036740080241394676] m/s; uz range [-0.00010550815634099648, 0.012914640110902997] m/s.
  Direct maximum boundary-velocity residual: 3.47e-18 m/s. At 50 µm launch offset maximum radial velocity is 2.80615e-05 m/s; this interior value is not a no-slip boundary condition.

Independent Stokes inertial/viscous force L2 ratios: all=0.3434, first 50 mm=0.3438, quiet=0.0077. These compare ρ|u·∇u| with μ|vector Laplacian u| using cylindrical volume weights. They are not measured error bounds. The laminar solve retains inertia everywhere.

Maximum unique-volume conservation error: 4.44e-16; quiet crossing balance residual: 9.37e-17.

These are numerical checks, not calibration. Grid changes alter a first-order boundary approximation; radial launch quadrature and finite-time fate near separatrices can remain sensitive. All raw values and launch coefficients are in JSON, including 2400 s inventory. No zero finite-time transmission is interpreted as zero eventual transmission. Do not infer irreversible removal from P_return or retained material.

Observed grid, timestep and launch-quadrature differences are sensitivity tests, NOT numerical error bounds or a demonstrated convergence order. Six displayed decimals facilitate reproducibility and do not imply physical accuracy. Contact inventory is not credited as removed. Horizon sensitivity shows why finite-time retained mobile material cannot automatically be called trapped.

SVG contains field arrows and selected trajectories, not all weighted tags. JSON contains full diagnostics and preservation hashes. Geometry illustration is meridional equivalent-slot geometry, not a replacement drawing.

## Unresolved evidence / decision

Actual opening vector/pressure fields, swirl/unsteady rotor forcing, bidirectional phase loading, inlet joint size-position distribution, finite-Re corrections, discrete-hole/slot validation, distributor holes/flow/DSD/supports, actual lateral-outlet interception, interface mobility, coalescence, wall remobilization, lower-compartment recycling and a carryover criterion remain missing. Thus this calculation demonstrates an executable spatial, conservative conditional benchmark; it cannot certify a bare top, a coalescer need, a calming length, permanent removal or actual carryover.

**Partial scope only:** 4 mm thickness and 87 mm clearance are bound to actual geometry but do not enter a meshed lower-plenum/aperture momentum solution. Positive imposed upper-face inflow excludes carrier reversal at openings, although heavy tags can re-cross downwards. Equivalent rings resolve radial inter-slot flow, not azimuthal interhole flow. The upper absorbing plane is not the real nozzle. These requested physical closures are not claimed complete. A 60° wedge containing 14 actual holes with lower rotor/plenum coupling is a logical next resolved model; no invented lower-domain or distributor field is substituted here.

363 preexisting deliverable files SHA-256 checked unchanged. Only newly prefixed benchmark files are written; active geometry, bottom, application and saved records untouched.
