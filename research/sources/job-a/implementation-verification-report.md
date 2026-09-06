# Job-A implementation verification report

## Verdict

`PASS — JOB_A_IMPLEMENTATION_VERIFIED_FOR_PRE_PILOT_TESTING`

Date: 2026-09-06

This verdict covers the bounded seven-component diffusivity and Kumar &
Hartland base-film-coefficient implementation only. It does not qualify the
model for release, pilot guarantee, vendor guarantee, Job B, or final ECR
sizing.

## Verified authority boundary

- Thermodynamic engine:
  `ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O`
- Engine contract: `7C-1.5.0`
- Fixed order: `SAT, MONO, DI, POLY, PA, NMP, H2O`
- The theoretical-stage authority follows the governed two-branch rule:
  use a valid calculated Stage-2 \(N_T\), otherwise use the immutable
  pre-pilot default \(N_T=7\).
- The source of \(N_T\) is independent of the thermodynamic engine used by
  Stage 4.
- When a calculated Stage-2 \(N_T\) is used, the existing server-owned loader
  re-establishes ownership, design identity, completed status, Stage-1
  authority, engine/model hashes, exact 7C-1.5.0 contract, persisted result
  integrity, selected accepted trial, and theoretical-stage result.
- Job A performs a cryptographic preflight of the governed 7C-1.5.0 adapter
  without running the much slower equilibrium/reference-duty cascade.
- The preflight response's engine ID, version, engine hash, component order,
  status, and result hash are verified before Job A is admitted.
- The same adapter owns the later Stage-4 `REFERENCE_DUTY` operation and
  implements the default seven-stage branch when no valid calculated \(N_T\)
  is available.
- The theoretical-stage provenance and verified adapter preflight hash are
  included in the Job-A input and result hashes.

## Numerical replay

Verification condition:

| Quantity | Value |
|---|---:|
| Temperature | 333.15 K |
| Interfacial tension | 0.012 N/m |
| \(d_{32}\) | 0.0015 m |
| Slip velocity | 0.08 m/s |
| Continuous density / viscosity | 1020 kg/m3 / 0.002 Pa s |
| Dispersed density / viscosity | 850 kg/m3 / 0.012 Pa s |
| Drop Reynolds number | 61.2 |

All 14 ordered cells returned positive, finite diffusivity, Reynolds, Schmidt,
Peclet, Sherwood, and film-coefficient values:

| Component | Phase | D, m2/s | Sc | Sh | k, m/s |
|---|---|---:|---:|---:|---:|
| SAT | continuous | 4.21743e-10 | 4.64924e3 | 208.992 | 5.87605e-5 |
| SAT | dispersed | 9.28644e-11 | 1.52024e5 | 138.409 | 8.56888e-6 |
| MONO | continuous | 5.71304e-10 | 3.43212e3 | 178.595 | 6.80213e-5 |
| MONO | dispersed | 1.25797e-10 | 1.12226e5 | 125.253 | 1.05043e-5 |
| DI | continuous | 5.51420e-10 | 3.55588e3 | 181.858 | 6.68535e-5 |
| DI | dispersed | 1.21418e-10 | 1.16273e5 | 126.716 | 1.02571e-5 |
| POLY | continuous | 4.55874e-10 | 4.30115e3 | 200.650 | 6.09807e-5 |
| POLY | dispersed | 1.00380e-10 | 1.40642e5 | 134.899 | 9.02745e-6 |
| PA | continuous | 2.89573e-10 | 6.77128e3 | 255.501 | 4.93242e-5 |
| PA | dispersed | 6.37618e-11 | 2.21412e5 | 156.808 | 6.66556e-6 |
| NMP | continuous | 6.00008e-10 | 3.26793e3 | 174.193 | 6.96783e-5 |
| NMP | dispersed | 1.32117e-10 | 1.06857e5 | 123.259 | 1.08564e-5 |
| H2O | continuous | 8.36700e-10 | 2.34347e3 | 147.541 | 8.22983e-5 |
| H2O | dispersed | 1.84235e-10 | 7.66285e4 | 110.621 | 1.35869e-5 |

The PA result is slower than MONO in both phases, providing the required
heavy-component plausibility check.

## Dimensional verification

Every cell records and replays these identities:

- Wilke-Chang cm2/s to m2/s conversion: multiplier \(10^{-4}\)
- \(Re_d=\rho_c U_{\mathrm{slip}}d_{32}/\mu_c\)
- \(Sc_{i,p}=\mu_p/(\rho_pD_{i,p})\)
- \(Pe_{i,p}=d_{32}U_{\mathrm{slip}}/D_{i,p}\)
- \(k_{i,p}=Sh_{i,p}D_{i,p}/d_{32}\)

Maximum recorded identity residual in the 14-cell replay: `0`.

## Equation and evidence checks

- Continuous-phase exponent is exactly
  \(1/3+0.0659Re_d^{1/4}\).
- Dispersed density term is exactly
  \((\rho_d/\rho_c)^{2/3}\).
- Base dispersed viscosity term is exactly
  \(1/(1+\kappa^{2/3})\).
- Continuous viscosity term is exactly
  \(1/(1+\kappa^{1.1})\).
- No holdup correction, \(C_1\psi\), \(C_2\psi\), or column enhancement is
  applied.
- \(C_2\) is represented as unavailable with a null value; it is not set to
  zero, copied from \(C_1\), or inferred.
- DI uses \(V_b=178.16594275007947\) cm3/mol.
- PA uses \(V_b=521.231269838688\) cm3/mol.
- The water-solute Wilke-Chang volume is multiplied by 4.5 in both phases.
- All estimated cells carry the required predictive, approximation,
  infinite-dilution, non-pilot, non-release, and extrapolation flags.

## Stage-3 ownership checks

Job A consumes server-owned Stage-3 \(d_{32}\), slip velocity, density,
viscosity, interfacial tension, selected trial identity, implementation hash,
and immutable run hash.

The result explicitly records:

- `recomputedPower: false`
- `recomputedDropSize: false`
- `recomputedHoldup: false`
- `recomputedSlipVelocity: false`
- `psiUsed: false`

No Stage-3 power-number convention or hydraulic correlation is reproduced in
the Job-A module.

## Legacy isolation

- The Job-A module, service bridge, and routes have no import from the legacy
  five-component BVP, local-property closure, or diffusivity implementation.
- The result contract fixes `legacyPathInvoked: false`.
- A static source guard rejects a legacy transport import.
- Invalid or missing seven-component authority fails closed; there is no
  five-component fallback.

## Determinism and provenance

Canonical object-key sorting is used before SHA-256 hashing. Reordered but
equivalent inputs replay the same input and result hashes.

The result carries separate hashes for:

- implementation descriptor;
- evidence set;
- full server-owned input;
- full result;
- verified Stage-1 snapshot;
- verified calculated Stage-2 result when that \(N_T\) branch is used;
- verified 7C-1.5.0 adapter preflight and engine;
- verified Stage-3 run and implementation.

## Automated checks

Passed:

```text
npx vitest run tests/ecr-pre-pilot-job-a.test.ts \
  tests/kuhni-geometry-resolver-v110.test.ts --maxWorkers=1

Test Files  2 passed
Tests       15 passed
```

Passed focused app/server bundling:

```text
npx esbuild client/src/App.tsx \
  server/ecr-pre-pilot/job-a.ts \
  server/ecr-pre-pilot-service.ts \
  server/ecr-pre-pilot/routes.ts \
  --bundle --packages=external
```

The repository-wide TypeScript check remains unsuitable as a release gate for
this change because it reports extensive pre-existing errors outside the
Job-A files. The focused Job-A client and server bundles completed without
syntax or module-resolution errors.

## Live integration and UI regression

- The application workflow restarted successfully and registered the ECR
  Pre-Pilot routes.
- A saved design with a verified Stage-3 run and default-seven theoretical-stage
  authority was exercised through the governed 7C-1.5.0 adapter preflight and
  Job-A evaluation path.
- The Stage-4 route is protected. The clean preview browser was signed out and
  correctly stopped at the login screen with HTTP 401 rather than exposing the
  engineering result.
- The authenticated screen is available at
  `/design-software/ecr-pre-pilot-design/stage-4`.
- The client bundle verifies the route, Stage-3 navigation, server-owned
  evaluate action, 7x2 coefficient table, local hydraulics, dimensional audit,
  hashes, flags, and legacy-isolation indicator.

An authenticated user may evaluate Stage 4 with either a valid calculated
Stage-2 \(N_T\) or the governed default \(N_T=7\). Both paths require and verify
the 7C-1.5.0 Stage-4 reference-duty engine.

## Job-B gate

This report passes the Job-A implementation gate. Job B remains outside this
implementation and was not started.