# Stage 5 end-section qualification protocol

**Protocol authority:** `ECR_END_QUALIFICATION_PROTOCOL / 2.0.0`  
**Supersedes:** source-audit authority `ECR_END_SOURCE_AUDIT / 1.0.0`  
**Current decision:** **HOLD — no top or bottom model is admitted by issuing
this protocol. No live diameter or residence height may be calculated.**

This is the fallback qualification task when suitable experimental or vendor
evidence is unavailable. It specifies how new evidence may be generated and
approved; it is not evidence and does not turn a candidate correlation,
historical size, test fixture, or signed form into qualified process data.
Top and bottom are separate duties and shall be tested, analysed, and admitted
independently.

The evidence basis for this protocol is the original
[`task-306-end-sizing-source-audit.md`](task-306-end-sizing-source-audit.md),
as superseded and refined by the dated
[`stage5-end-qualification-evidence-review.md`](stage5-end-qualification-evidence-review.md).
The latter is the controlling evidence review; neither document admits a live
model.

### Reviewed candidate sources and exact present limits

- **Outlet evidence:** Oliveira et al. (2008), DOI
  `10.1590/S0104-66322008000400010`, pp. 731–736, supplies number-based local
  Exxsol/water active-stage photographs, not either target one-way outlet
  volume flux. Glatz and Cross, PDF pp. 7–8, supports immediate centrifuging of
  each outlet as an independent physical-entrainment check, but supplies no
  target DSD, detection limit or acceptance criterion.
- **Terminal mobility:** Myint, Hosokawa and Tomiyama (2006), DOI
  `10.1299/jfst.1.72`, pp. 72–73 and 77–80, Eqs. (1)–(5), (9)–(10), reports
  `−11.6 < log10(M) < −0.9`, `0.17 < Re < 200`, `0.017 < Eo < 12.1` and
  `0.1 < kappa < 100`. Its `C=0` and `C→infinity` endpoints represent
  clean/mobile and fully contaminated/immobile interfaces. A finite mobility
  parameter requires evidence. The nominal top `kappa ≈ 0.0237` is outside
  range; nominal bottom `kappa ≈ 42.2` being inside that one range does not
  qualify its properties, size, shape or interface.
- **Shape:** Tomiyama, Myint and Hosokawa (2007), DOI
  `10.1299/jfst.2.184`, reports the clean-drop shape domain
  `−11.6 ≤ log10(M) ≤ −0.9`, `0.015 ≤ Re ≤ 850`, `0.017 ≤ Eo ≤ 9.3`,
  `0.0074 ≤ Ta ≤ 3.6`, and `0.1 ≤ kappa ≤ 100`. It does not extend the
  contaminated terminal model to all shapes or admit the top duty.
- **Other terminal candidates:** Barry and Parlange (2018), DOI
  `10.1371/journal.pone.0194907`, Eq. (10), pp. 3–9, assumes a spherical,
  isolated fluid particle in an infinite homogeneous liquid and is discussed
  only to Reynolds numbers of a few hundred. Weber et al. (2019), DOI
  `10.1002/cite.201900057`, Eqs. (1)–(2) and supplement Eqs. (S1)–(S5), does
  not state a complete joint `Re/Eo/M/kappa` validation envelope; its fitted
  mobility weight is not target-interface evidence. Henschke and Pfennig
  (1996), §2.1, is a packed-column candidate without supplied target-service
  domains. None is admitted.
- **Fabrication candidate:** IS 4049 (Part 2):1996, §§1, 4.1, 4.4 and Table 1,
  SHA-256
  `a5c5289ddb8fb95f4ee2fe52e7eb1542c2003cb40ba0c5a35d6d2a4250923a83`,
  is a controlled inside-diameter formed-end standard. Table 1 lists deep
  torispherical IDs 400–2400 mm in 100-mm steps, then 2600, 2800, 3000, 3200,
  3400, 3600, 3800, 4000, 4250, 4500, 4750 and 5000 mm. Finished-end inside
  circumference tolerance is ±5 mm through 400 mm ID and ±0.25% above 400 mm
  unless made more stringent. It neither prescribes process round-up nor binds
  a project fabricator/tooling/code hierarchy, so it is
  `CANDIDATE_NOT_QUALIFIED`, not an adopted fabrication rule.

## 1. Controlled evidence register and release gate

| ID | End | Required controlled evidence |
|---|---|---|
| `TOP-QP-DSD-001` | top | One-way top terminal/outlet volume-flux DSD, loading, fines and return evidence |
| `TOP-QP-PROP-001` | top | Representative RRBO-rich/NMP properties and interface state |
| `TOP-QP-TERM-001` | top | Independent NMP-drop terminal tests and validated model/domain |
| `TOP-QP-MARGIN-001` | top | Supported top velocity-margin admission |
| `TOP-QP-FAB-001` | top | Fabricator-controlled top shell inside-diameter rule |
| `TOP-QP-CTRL-001` | top | Complete blind-validation and approval package |
| `BOTTOM-QP-DSD-001` | bottom | One-way bottom terminal/outlet volume-flux DSD, loading, fines and return evidence |
| `BOTTOM-QP-PROP-001` | bottom | Representative NMP-rich/RRBO properties and interface state |
| `BOTTOM-QP-TERM-001` | bottom | Independent RRBO-drop terminal tests and validated model/domain |
| `BOTTOM-QP-MARGIN-001` | bottom | Supported bottom velocity-margin admission |
| `BOTTOM-QP-FAB-001` | bottom | Fabricator-controlled bottom shell inside-diameter rule |
| `BOTTOM-QP-CTRL-001` | bottom | Complete blind-validation and approval package |

An end remains on HOLD until all six IDs for that end are approved in one
versioned package. Approval of one end does not qualify the other. Frozen Stage
1 composition/normal feed, the accepted simultaneous Stage 2 product trial
bound through frozen Stage 5, and all existing source-hash/currentness checks
remain mandatory. The protocol creates no user parameter or user approval
route. No latest-job substitution, N4/N7 choice, nozzle-only S/O 1.5 or 120%
hydraulic flow may enter the normal product balance, diameter, or residence
height.

## 2. Representative operating and property envelope

Before testing, freeze a design-of-experiments matrix covering the claimed
normal and credible adverse envelope: normal product flow and phase ratio;
temperature and gradients; compositions of both equilibrated product phases;
continuous/dispersed phase identity; rotor speed and final-compartment
hydraulics; interface level; terminal geometry, withdrawal rate and location;
startup/steady-state history; expected water, solids, surfactant and
contamination states; and ageing or recycle states that can change interfacial
mobility. Include centre points, boundaries, adverse combinations, replicates,
and independently prepared batches. Record actual values and deviations.

For every run, measure source-labelled continuous and dispersed densities,
dynamic viscosities and interfacial tension at test temperature and
composition, with methods, calibration traceability, repeatability, sampling
time/location and uncertainty. Identify phase inversion and interface
contamination/mobility. Feed or pure-fluid proxies are not product properties.
The claimed domain may not extend beyond the tested/validated envelope; an
outside-domain case is HOLD, not extrapolation.

## 3. Independent per-end DSD, loading, fines and return campaign

Install independently calibrated measurements on terminal planes above and
below the end zone so that **signed one-way volume flux** is available in both
directions. For the top, quantify NMP-rich droplets carried upward toward the
raffinate outlet and NMP-rich material genuinely returned downward. For the
bottom, quantify RRBO-rich droplets carried downward toward the extract outlet
and RRBO-rich material genuinely returned upward. Do not transfer a top
population across phase inversion.

The predeclared capture specification shall state:

1. plane coordinates, sampled area, edge/withdrawal coverage, time window,
   steady-state rule and synchronization with flows and interface position;
2. individual-object sizing/velocity method, segmentation rules, shape
   descriptors, minimum detectable size, saturation/overlap limits and
   classification of droplets, ligaments, films, bubbles and solids;
3. number-, area- and volume-weighted distributions, with the governing
   **one-way volume-flux-weighted** distribution and loading reported by size
   bin; raw detections and signed velocities retained;
4. fines detection efficiency and false-positive/false-negative correction by
   size, censored mass below resolution, upper bounds for non-detects, spatial
   and temporal sampling uncertainty, replicate/batch uncertainty and
   uncertainty propagation to the governing capture statistic;
5. dispersed holdup/loading and any coalescence or breakup between planes.

Object tracking shall distinguish a plane recrossing from actual returned
material. A reversal or repeated crossing at the same plane is a recrossing,
not return. “Returned” requires a predeclared physically closed destination
plane/region and sustained transport into the active dispersion or designated
collection region. Retain object identifiers where possible and report gross
outward flux, gross inward flux, unique outward objects, recrossing counts,
confirmed return, outlet carryover, unresolved contacts and observation-window
censoring separately.

Close a bounded dispersed-phase inventory over each end control volume:

`input + generation/entrainment - outlet - confirmed return - destruction/coalescence transfer = accumulation`.

Every term shall have sign convention, measured boundary, time basis and
uncertainty. Report a confidence interval for residual and unresolved inventory;
do not force closure by assigning the residual to return. Predeclare the
acceptable conservation/uncertainty criterion from instrument capability and
the protected carryover requirement before viewing validation results. This
protocol intentionally does not invent a universal numeric tolerance.

## 4. Independent terminal-velocity, shape and mobility tests

Use separately prepared, equilibrated representative phases; DSD campaign runs
must not double as the independent terminal validation set. Test isolated drops
over the full admitted size/property envelope in a vessel demonstrated free of
material wall, acceleration, swarm and circulation effects, or quantify and
validate corrections. Measure signed terminal velocity, transient approach,
equivalent diameter, aspect ratio/shape regime, path oscillation and breakup.
Characterize clean/mobile, contaminated/retarded and credible aged interface
states rather than choosing mobility from a nominal correlation.

For every observation and every proposed model prediction, calculate using
declared definitions and units at least:

- `Re = rho_c |u_t| d / mu_c`;
- `Eo = |rho_d-rho_c| g d^2 / sigma` (Bond number if that name is used);
- `Mo = g mu_c^4 |rho_d-rho_c| / (rho_c^2 sigma^3)`;
- viscosity ratio `kappa = mu_d/mu_c`;
- density ratio, Weber number, Capillary number and Archimedes/Galileo number;
- confinement ratio, dispersed loading/holdup, acceleration-length ratio,
  interface-age/contamination descriptor, and measured shape/aspect-ratio
  domain.

State each candidate equation, implementation hash, root-selection method,
mobility assumption and exact source domain. Plot calibration and validation
coverage in the full joint dimensionless domain, not only separate scalar
ranges. A point outside any admitted property, size, shape, mobility,
confinement or dimensionless domain is HOLD. Schiller–Naumann may only be
identified as an immobile rigid-sphere endpoint/screen unless independently
validated for the actual liquid-drop duty.

## 5. Predeclared calibration and blind validation

Before unblinding validation data, freeze:

- batch/run allocation to calibration and blind validation, with no shared
  droplets, image sequences or fitted property values;
- candidate model equations, fitted parameters and permitted transformations;
- DSD governing statistic and carryover/return endpoint;
- terminal velocity, shape-regime and mobility endpoints;
- conservation, bias, precision, prediction-interval coverage, fines and
  adverse-envelope acceptance criteria;
- missing-data/outlier rules, replicate handling, multiplicity treatment,
  uncertainty propagation and the exact reject/HOLD logic.

Numeric criteria must be justified by the process failure limit, measurement
capability and required confidence, and approved before validation. This
protocol supplies no arbitrary percentage, error tolerance, droplet size,
velocity fraction or confidence threshold. Failed criteria may lead to a new
version and new blind data; they may not be relaxed after results are known.
Report all planned runs and exclusions. Paperwork documenting a failed,
underpowered or out-of-domain campaign does not qualify it.

## 6. Supported velocity-margin admission

For each end, identify the protected failure mode (outlet carryover/carryunder
and confirmed non-return), required confidence, operating envelope and all
uncertainty contributors: DSD/fines, properties, terminal model discrepancy,
loading/swarm effects, nonuniform axial flow, withdrawal jets, interface motion,
recrossing classification and scale-up. Derive a bound on allowable opposing
superficial velocity from the validated evidence and propagate correlated
uncertainties. Validate that bound on the blind end-zone data.

The controlled record shall choose and define exactly one convention:

- `MULTIPLY_VT`: `Udesign = F × vt`, with the supported domain of `F`; or
- `DIVIDE_VT`: `Udesign = vt / F`, with the supported domain of `F`.

It shall demonstrate that the admitted result is positive and does not exceed
the applicable terminal velocity. No factor is selected by this protocol.
`0.50`, terminal-correlation error, and the active-column percentage capacity
margin are not defaults or supporting evidence. Outside the validated margin
domain is HOLD.

## 7. Fabricator shell-inside-diameter authority

For each end obtain a fabricator-signed, revision-controlled rule that states:

- dimensions are finished **shell inside diameters**, not nominal pipe size,
  outside diameter, drawing comparison coordinates or active-column grids;
- either the complete permitted upward series or an increment with an explicit
  datum, plus the rule selecting the least supported ID not below `Dcalc`;
- plate/thickness/forming basis, corrosion/lining basis, out-of-roundness and
  guaranteed minimum finished ID after all negative tolerances;
- how nominal ID and guaranteed minimum ID are checked against `Dcalc`;
- minimum and maximum supported size and the disposition when no supported size
  exists.

The signed rule must not be seeded from historical Ø900/Ø1000 options. A
signature controls provenance; it does not validate process performance.
IS 4049 (Part 2):1996 Table 1 may be proposed as the controlled set, using
`Dshell = min { D in approved_ID_set | D >= Dcalc }`, only after the project
mechanical authority and actual fabricator adopt the edition/table/checksum,
head profile and code hierarchy, shell/head datum, tolerance and guaranteed
minimum usable ID treatment, material/thickness/corrosion basis, tooling
availability and supported minimum/maximum. Until then `TOP-QP-FAB-001` and
`BOTTOM-QP-FAB-001` remain pending.

## 8. Controlled approval package and live admission

Each evidence ID package shall include the approved protocol/version,
as-built/test geometry, run register, immutable raw-data locations and hashes,
instrument IDs/calibrations, sample/property chain of custody, analysis code and
environment hash, equations and units, audit trail, deviations, all results
including failures, uncertainty budget, dimensionless-domain map, calibration
record, blind-validation report and limitations. Capture synchronized clocks,
plane coordinates, camera fields/calibration targets, frame rate/exposure,
resolution/depth of field, flow/interface/temperature time series and machine-
readable object tracks and bin tables.

Required signoffs are: test owner/data custodian; independent metrology or data
quality reviewer; process/separations authority; model-risk/statistics reviewer;
controls/software owner confirming immutable implementation and domain gates;
mechanical/fabricator authority for shell ID; and project design authority.
Conflicts, unresolved deviations, missing confidence basis, failed conservation,
unsupported scale-up or incomplete raw capture remain explicit HOLD items.

Live admission requires a new authority version naming every evidence ID,
artifact hash, approved end, equation/parameter set, validity domain, margin
convention, fabrication rule and software tests. It must preserve all Stage
1/2/5 lineage and fail closed outside domain. Until that admission occurs there
are no eligible production end models, and both `D` and `H` remain null/HOLD.
The 200 µm sensitivity, 0.50 factor and historical shell sizes are prohibited as
defaults.