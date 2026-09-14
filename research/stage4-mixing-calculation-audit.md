# Stage 4 pre-pilot mixing audit

This is an engineering screening calculation, not a completed physical-sizing
or final-design result. No Stage-2/Stage-3 result or Job C data is changed and
no scientific job is launched. **Every output is PRE-PILOT PREDICTIVE /
SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN.**

## Source and notation boundary

The user-approved screening expression is the Kumar–Hartland (K–H) form:

\[
\frac{E_c}{V_c h_c} =
  0.42 + 0.29\frac{V_d}{V_c}
  +\left[cq+\frac{13.38}{3.18+q}\right]
  \left(\frac{V_cD_R\rho}{\mu}\right)^{-0.08}
  \left(\frac{D}{D_R}\right)^{0.16}
  \left(\frac{D}{h_c}\right)^{0.10},
\qquad
q=\frac{(\mathrm{RPM}/60)D_R}{V_c}.
\]

The displayed addition before the square bracket is intentional:
\(0.42+0.29V_d/V_c+[...]\times...\). The primary coefficient is
\(c=0.0126\); \(c=0.0105\) is a sensitivity case. \(D\), \(D_R\), and
\(h_c\) are in m; \(V_c,V_d\) are superficial velocities in m/s; \(\rho\)
is kg/m³; \(\mu\) is Pa·s; and \(E_c\) is m²/s. Thus both \(q\) and
\(V_cD_R\rho/\mu\) are dimensionless.

There is an explicit source discrepancy: the supplied/approved expression uses
0.0126 while the Asadollahzadeh (2017) presentation reports 0.0105. The
2017 paper is **supporting context, not authoritative source authority** for
the K–H typography or constants. A barred \(V\) in a source extraction is not
silently substituted for the specified superficial \(V_c\) or \(V_d\).
Likewise, a trailing undefined \(e\) in the extraction is barred from the
calculation; it is not an exponent, efficiency, or fitted parameter.
Steiner 0.188/0.0267 and modified Rod–Misek 0.056/0.0119 are not part of this
screening path.

The expression contains no stator-diameter \(D_s\) term. Stator opening
geometry is therefore not an unconditional Stage-4 blocker and no \(D_s\) is
inferred from column or rotor diameter. The rotor diameter remains required:
missing persisted \(D_R\) is reported as `STAGE4_ROTOR_DIAMETER_REQUIRED`.

## Implemented equations and assumptions

| Equation | Symbols and units | Authority / status |
|---|---|---|
| \(a=6\phi/d_{32}\) | \(\phi\) operating dispersed-volume fraction; \(d_{32}\) m; \(a\) m²/m³ of total active liquid | Asadollahzadeh (2017), Eq. 2; operating holdup, spherical-drop/Sauter approximation |
| \(N=\mathrm{RPM}/60\) | \(N\) s⁻¹ | Unit conversion |
| \(E_c/(V_ch_c)\) K–H expression above | SI units as listed above | User-approved engineering screening; pilot validation required |
| \(h_c=0.5D\) | m | Explicit preliminary physical-compartment pitch assumption |
| \(E_d=0\) | m²/s | Explicit base screening assumption; not verified for RRBO/NMP |
| \(Pe=HV/E\) | \(H\) m, superficial \(V\) m/s, \(E\) m²/s | Peclet helper; continuous case uses \(Pe_c=HV_c/E_c\) |

The pure helper exposes \(E_c\) in m²/s and accepts the primary \(c=0.0126\)
or sensitivity \(c=0.0105\). Its Peclet helper uses the **superficial**
velocity and computes \(Pe_c=HV_c/E_c\), not an interstitial velocity. For
\(E_d=0\) and positive height/flow, \(Pe_d\) has an infinite limit; JSON
stores a null value with an explicit infinite-limit status rather than
serializing `Infinity`. This does not establish a solved height.

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
| Primary Ec, c=0.0126 | 0.0015267874278949382 m²/s |
| Sensitivity Ec, c=0.0105 | 0.0013431362780342957 m²/s |
| Stator opening | Not persisted; not required by this no-\(D_s\) expression |

The replay values are screening predictions only. The primary/sensitivity
comparison documents the coefficient discrepancy; it is not source validation.

## Applicability

Asadollahzadeh's equipment table gives \(D=0.117\) m and rotor diameter
0.05 m; plots include 100–250 RPM. The selected 0.974 m / 30 RPM point is
outside those cited study conditions. Those values are not asserted as proven
bounds of the original K–H correlation. RRBO/NMP transferability remains
unvalidated and requires pilot data before final design.

## Result and remaining work

The operating-holdup area, carried geometry/velocities, \(E_c\), coefficient
sensitivity, explicit \(E_d=0\) assumption, and pure Peclet helper are
available. A finite live \(Pe_c\) still requires a selected active height.
Physical compartment count, active height, overall efficiency, and predicted
physical-column outlets require a conserved axial-dispersion
physical-compartment search and are not claimed here. Existing Stage-2
outlets must not be relabeled as solved Stage-4 physical-column predictions.