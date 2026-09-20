# RRBO / wet-NMP proposed hydraulic method — assumptions register

**Method:** `RRBO_WETNMP_KUHNI_HYDRAULIC_P0`  
**Overall status:** `PROPOSED — ACCEPTANCE_REQUIRED`

| ID | Assumption / decision | Proposed value or rule | Status | Closure required |
|---|---|---|---|---|
| A01 | Temperature | 40 °C | `ACCEPTANCE_REQUIRED` | Operating tolerance and property remeasurement |
| A02 | Continuous phase | RRBO, upward | `ACCEPTANCE_REQUIRED` | Hardware/ports/interface review |
| A03 | Dispersed phase | Wet NMP, downward | `ACCEPTANCE_REQUIRED` | Composition and distributor/collector review |
| A04 | Properties | `ρc=869`, `ρd=1015 kg m^-3`; `μc=.0598`, `μd=.001416 Pa s` | `ACCEPTANCE_REQUIRED` | Traceable measurements and uncertainty |
| A05 | Interfacial tension | saved/known basis `σ=.011 N m^-1`; not established here as measured | `ACCEPTANCE_REQUIRED` | Provenance, method, temperature/composition/aging uncertainty |
| A06 | Power number | `Np=1.2` fixed | `ACCEPTANCE_REQUIRED` | Vendor or geometry-specific power evidence |
| A07 | `d32` law | `C32(σ/ρc)^0.6 ε^-0.4` | `ACCEPTANCE_REQUIRED` | Turbulence gate and measured size distributions |
| A08 | `d32` coefficient | interval `[.36,.43]`; nominal `.42` | `ACCEPTANCE_REQUIRED` | Controlled rationale; not exhaustive; no fitted-after-result value |
| A09 | Coefficient distribution | epistemic interval, no probability distribution | `PROPOSED` | Data before probabilistic or exhaustive-bound interpretation |
| A10 | Drop population | one `d32` represents slip | `ACCEPTANCE_REQUIRED` | `d10,d32,d43`, upper tail, shape and population sensitivity |
| A11 | Clean/mobile drag scenario | Barry–Parlange Eq. 10 | `ACCEPTANCE_REQUIRED` | Numeric spherical/non-wobbling gate |
| A12 | Immobile drag scenario | Schiller–Naumann; carry through full chain | `ACCEPTANCE_REQUIRED` | Accepted applicability range; capacity envelope uses lower scenario |
| A13 | Characteristic velocity | Garthe Eqs. 5.6–5.7 | `ACCEPTANCE_REQUIRED` | Exact-fluid pre-pilot observations |
| A14 | Swarm velocity | Garthe Eq. 8.3 | `ACCEPTANCE_REQUIRED` | Exact-fluid holdup/slip measurements |
| A15 | Velocity definition | `vslip=vs,Garthe/(1-φ)` | `REQUIRED_MODEL_CORRECTION` | Primary printed pp. 29, 31, 126; current reverse capacity path omits conversion |
| A16 | Operating holdup | lower quasi-steady root connected to dilute branch | `ACCEPTANCE_REQUIRED` | Ramp-up/down evidence; no dynamical-stability claim |
| A17 | Flood holdup | separate argmax `φf,model` | `SOURCE_REVIEW_REQUIRED` | Terminology and implementation review |
| A18 | Flood capacity | modeled turning capacity only | `REQUIRED` | Observed-flood program before validation |
| A19 | Design capacity fraction | no default; legacy `.70` not accepted here | `ACCEPTANCE_REQUIRED` | Uncertainty/margin basis |
| A20 | Phase inversion | independent unknown; never default `φ=.5` | `UNKNOWN_REQUIRED` | Exact-fluid inversion tests |
| A21 | Entrainment/disengagement | independent constraints | `UNKNOWN_REQUIRED` | Pre-pilot/hardware tests |
| A22 | Geometry extrapolation | explicit source ratios | `ACCEPTANCE_REQUIRED` | Pilot/vendor review |
| A23 | Classification | pre-pilot extrapolated method | `REQUIRED` | Governance prevents validated/final claims |
| A24 | Final diameter/RPM | not produced by this work | `REQUIRED` | Separate later authorization |
| A25 | Turbulence and shape gates | numeric criteria unspecified | `NOT_IMPLEMENTATION_READY` | Accept thresholds and evidence |
| A26 | Solver definition | mesh, tolerances and continuation settings unspecified | `NOT_IMPLEMENTATION_READY` | Versioned numerical specification |
| A27 | Historical geometry comparison | `600/152=3.95`, `180/72=2.50`, `198/85=2.33` | `REFERENCE_ONLY` | Not a new solve or selected candidate |

## Acceptance signature fields

* Scientific owner: **unassigned**
* Independent reviewer: **unassigned**
* Property snapshot/version: **unassigned**
* Equation implementation/version: **unassigned**
* Geometry and `Np` evidence: **unassigned**
* Drop-distribution evidence: **unassigned**
* Mobility/shape evidence: **unassigned**
* Holdup/flood/inversion campaign: **unassigned**
* Approved design margin: **unassigned**

No blank field may be interpreted as approval.