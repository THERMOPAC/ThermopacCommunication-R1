# Stage 4 pre-pilot mixing audit

This is a partial calculation, not a completed physical-sizing result.
No Stage-2/Stage-3 result or Job C data is changed. No scientific job is launched.

## Source boundary

The supplied Kumar–Hartland expression with constants 13.38, 3.18 and 0.0126
has not been verified against readable source algebra. The retained
Asadollahzadeh et al. (2017) Eq. 9 extraction is blank. Reference 23 identifies
Kumar–Hartland (1992), for rotating-disc/asymmetric rotating-disc columns.
Neither numerical plausibility nor application in a later Kühni study verifies
the offered expression's exact symbols, constants, or original validity limits.
It is NOT implemented.

Steiner 0.188/0.0267 and modified Rod–Misek 0.056/0.0119 likewise remain
unimplemented until the original definitions and dimensional conversions are verified.

## Implemented equations

| Equation | Symbols and units | Authority |
|---|---|---|
| a = 6φ/d32 | φ operating dispersed-volume fraction; d32 m; a m²/m³ of total active liquid | Asadollahzadeh (2017), Eq. 2; spherical-drop approximation |
| N = RPM/60 | N s⁻¹ | Unit conversion only; does not settle the candidate equation's N convention |
| Vbar_c = Vc/(1−φ) | velocities m/s; Vc superficial | Phase continuity; not silently substituted into Pe |
| Ed = 0 | m²/s | Explicit base screening assumption, supported as an assumption in Asadollahzadeh following Eqs. 5–6; not verified for RRBO/NMP |
| Pe = H V/E | H m, superficial V m/s, E m²/s | Asadollahzadeh Eqs. 5–6; helper tested, live values await dependencies |
| hc = 0.5D | m | User-authorized preliminary geometry assumption |

For Ed=0 and positive height/flow, Pe_d has an infinite limit. JSON stores no
Infinity/NaN numeric value; the limit is explicit. This does not establish a
solved height. H=N_physical hc will be used only after physical-count search;
overall efficiency is then Nt/N_physical, not an assumed input.

## Read-only replay: design 269

| Persisted/current quantity | Value |
|---|---|
| Accepted Nt | 5 |
| D | 0.9742129194448474 m |
| Rotor diameter | 0.4871064597224237 m |
| RPM | 30 |
| d32 | 0.0025707441992382585 m |
| Operating / flood holdup | 0.0816427744236363 / 0.20077600313512306 |
| Vc / Vd superficial | 0.0009598419119466572 / 0.0014905956171508057 m/s |
| Continuous density / viscosity | 997 kg/m³ / 0.001083 Pa·s |
| Calculated a | 190.55052100748415 m²/m³ |
| Preliminary hc | 0.4871064597224237 m |
| Stator opening | Not persisted |

Do not infer stator opening from column or rotor diameter. Ds might require
an opening, hydraulic, or equivalent diameter: source verification must resolve
the definition. Free area and clearance are not asserted as independently
mandatory until the chosen equation establishes that requirement.

## Applicability

Asadollahzadeh's equipment table gives D=0.117 m and rotor diameter 0.05 m;
plots include 100–250 RPM. The selected 0.974 m / 30 RPM point is outside those
study conditions. These are NOT proven bounds of the original Kumar–Hartland
correlation. RRBO/NMP transferability remains unvalidated. Pilot data is not
a prerequisite for a documented pre-pilot screening prediction.

## Result and remaining work

Area, carried geometry/velocities, and the explicit Ed=0 assumption are available.
Ec, finite Pe values, physical compartments, active height, overall efficiency,
predicted physical-column outlets, and the dispersed-mixing sensitivity result
are NOT calculated. Two immediate structured dependencies are exposed:

- STAGE4_GEOMETRY_INPUT_REQUIRED: stator opening geometry.
- STAGE4_AXIAL_MIXING_SOURCE_EQUATION_UNVERIFIED: Ds, velocity convention,
  N convention, constants/exponents, and published calibration range.

After resolving these, integrate the existing preliminary film/local-equilibrium
physics into a conserved axial-dispersion physical-compartment search, qualify
closure, and evaluate all outlet targets. Existing Stage-2 outlets must not be
relabeled as solved Stage-4 physical-column predictions.