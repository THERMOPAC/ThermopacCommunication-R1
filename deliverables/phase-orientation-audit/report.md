# Design 269 phase-orientation authority audit

**Scope:** read-only audit of persisted Design 269 evidence and the source paths that consume it. SQL was executed inside `BEGIN READ ONLY` and rolled back. No hydraulic solver, optimizer, migration, or what-if calculation was run. No database or application files were changed.

## Executive finding

The current authority chain is unambiguous:

* **Stage 1:** NMP continuous / RRBO dispersed, saved `2026-09-16T03:31:27.734Z`, hash `549dffa4…b5f15b`.
* **Stage 3 primary authority:** run **64**, `ECR_STAGE3_STAGE4_OPTIMIZER_V1.3.0`, implementation `faa56fdd…ccb550`, immutable hash `e2afc059…788249`, created `2026-09-16T09:06:30.839Z`. It selected NMP-continuous/RRBO-dispersed, **D = 0.600 m**, **30–60 rpm saved feasible window**, and **45 rpm selected point**.
* **Stage 4 live/current persisted result:** calculation **16**, completed `2026-09-20T16:23:12.866Z`, lineage `2feeeca2…69bf3`, implementation `ECR_STAGE4_ADOPTED_COMPARTMENT_EFFICIENCY_V2_FIXED_DESIGN_NT7_ETA0.35` / `b6893ba2…f58a`. It carries run 64's NMP-continuous geometry and RPM without hydraulic recalculation.
* **Accepted Stage 2 reference:** job `145e962e-892a-4424-aab9-91532af9f5ef`, completed `2026-09-15T07:34:35.795Z`, was created from an earlier **RRBO-continuous/NMP-dispersed** Stage-1 snapshot saved `2026-09-15T05:36:27.418Z`, hash `6ccf5381…fbe9`, and accepted `N_T = 4`.

This coexistence is intentional in the current compatibility contract, not evidence that Stage 3 used Stage 2's orientation. Stage 2's equilibrium input identity excludes only `stage1.phaseConfiguration`; result 16 persists `EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION` and the same equilibrium-scientific hash `faa75060…1af` for both snapshots. Source: `server/ecr-pre-pilot/stage1.ts:388-412`; compatibility enforcement: `server/ecr-pre-pilot/stage4-pre-pilot-sizing-service.ts:141-175`.

## Why the orientations differ — chronology, not intent

Persisted evidence proves that orientation-bearing Stage-1 snapshots changed repeatedly:

| Evidence time | Orientation | Snapshot / evidence |
|---|---|---|
| 2026-09-15 05:36:27.418Z | RRBO continuous | Accepted Stage-2 embedded Stage-1 hash `6ccf5381…fbe9` |
| 2026-09-15 09:20:09.276Z | NMP continuous | Stage-3 run 12, hash `c1a9be06…e2f3c` |
| 2026-09-15 10:17:14.494Z | RRBO continuous | Stage-3 run 13, hash `3805119f…ac33` |
| 2026-09-15 10:21:16.236Z | NMP continuous | Stage-3 run 14, hash `52abf0c7…caba1` |
| 2026-09-15 10:46:14.491Z through 2026-09-16 02:53:18.063Z | RRBO continuous | Stage-3 hashes rooted in `e4137f46…f8af` |
| 2026-09-16 03:05:39.445Z | NMP continuous | Stage-3 run 26, hash `662406c9…295de` |
| 2026-09-16 03:29:12.503Z | RRBO continuous | Stage-3 run 59, hash `5ad25d85…6640` |
| **2026-09-16 03:31:27.734Z** | **NMP continuous** | **Current Stage-1 exact save, `549dffa4…b5f15b`** |
| 2026-09-16 09:06:30.839Z | NMP continuous | Current primary Stage-3 run 64 |
| 2026-09-20 16:23:12.866Z | NMP continuous | Current Stage-4 result 16 |

For Stage-3 rows, the table supplies run creation time and snapshot hash but not the upstream snapshot's `savedAt`; those times are therefore labelled as run times, not silently relabelled as save times.

### Is the cause recorded as user save, default, or migration?

**No.** The persisted schema examined records the current snapshot, its `savedAt`, hashes, owner key, and downstream lineage, but no orientation-change event, cause, request-source, default-applied flag, migration identifier, or actor-intent field. The save endpoint accepts the authenticated request body and overwrites `input_data` when scientific content differs (`server/ecr-pre-pilot-service.ts:272-302`; route `server/ecr-pre-pilot/routes.ts:146-160`). It does not persist why a value was present.

The client initializes a new form to NMP-continuous (`client/src/pages/design-software/ecr-pre-pilot-design-page.tsx:361-371`) and hydrates a saved orientation when present (`:404-428`). That is a code fact, **not proof** that the default caused the current save. No migration attribution was found. Accordingly this audit does not infer an actor or intent.

## Orientation actually consumed by current Stage 3

### Authoritative property and flow projection

Stage 1 projects its frozen values directly into the hydrodynamic basis: phase configuration, RRBO flow/density/viscosity, wet-NMP flow/density/viscosity, and interfacial tension (`server/ecr-pre-pilot/stage1.ts:161-206`). Run 64 saved:

| Quantity | RRBO | wet NMP |
|---|---:|---:|
| Flow, m³/s | 0.0011111111111111111 | 0.0005707717569786535 |
| Density, kg/m³ | 869 | 1015 |
| Dynamic viscosity, Pa·s | 0.0598 | 0.001416 |

`σ = 0.011 N/m`, `T = 313.15 K`. Because run 64's phase configuration is NMP-continuous, **continuous = wet NMP** and **dispersed = RRBO** in every authoritative ordinary-orientation kernel.

### Dual Stage-3 hydraulic chain

The optimizer uses two linked calculations for each ordinary-orientation candidate:

1. **Kumar–Hartland operating holdup and preliminary d32.** `evaluateKuhniHydrodynamics` maps NMP to continuous and RRBO to dispersed (`server/ecr-pre-pilot/kuhni-hydrodynamics.ts:80-85`), computes `Uc`/`Ud`, power, `ψ`, K&H `φ`, slip, and direct-turbulence d32 (`:104-140`). The optimizer saves that operating dispersed holdup as candidate `holdup` (`server/ecr-pre-pilot/stage3-stage4-optimizer.ts:549-584`).
2. **Myint/Garthe flooding admission.** The optimizer separately calls `evaluateKuhniHydraulicTrial` with the same basis and geometry (`stage3-stage4-optimizer.ts:696-735`). That kernel maps phases again, requires the ordinary branch's continuous phase to be heavier, and uses NMP as `ρc, μc, Qc` and RRBO as `ρd, μd, Qd` (`server/ecr-pre-pilot/kuhni-geometry-resolver.ts:149-186`). It then evaluates Myint drag/shape, Garthe characteristic velocity, swarm velocity, the turning-point capacity maximum, and loading (`:187-244`).

The K&H record itself correctly says its source has no generic flooding correlation. The optimizer does **not** convert K&H holdup into flooding by label; it appends the separate Myint/Garthe `actualLoading` and `designFloodFraction` result. This explains the apparently contradictory saved diagnostic `FLOODING_CAPACITY_CORRELATION_UNAVAILABLE` alongside a finite optimizer loading.

### Saved run-64 values

At selected D = 0.600 m, `hc = 0.180 m`, `Dr = 0.198 m`, free area 0.4, and 45 rpm:

* d32 = **0.0044853344930663765 m**
* operating dispersed holdup `φ` = **0.06398240117180216**
* interfacial area = **85.58880226753513 m²/m³**
* Myint/Garthe actual loading = **0.47540999374941056**
* design flood fraction = **0.7**, hydraulic pass = true
* `P/V = 3.072501775637703 W/m³`, `ψ = 0.003027095345455865 W/kg`
* selected trial remains labelled **SCALE_UP_EXTRAPOLATION**, not validated in-range performance.

The optimizer result shape does **not** persist the selected trial's turning-point `floodHoldup` or flood superficial velocity; it persists operating K&H `holdup`, loading, and the 0.7 criterion. This report does not invent the omitted values.

## 30–70 bounds are not a proven feasible window

`30` and `70 rpm` are server-owned candidate-search limits (`server/ecr-pre-pilot/stage3-stage4-optimizer.ts:77-86, 404-434`). The contiguous window is formed only from saved feasible trials (`:1125-1171`).

For the selected 0.600 m geometry, saved trials pass at 30, 35, 40, 45, 50, 55, and 60 rpm. At 65 rpm loading is `0.761696875831426 > 0.7`; at 70 rpm it is `0.8415051633252365 > 0.7`. Therefore:

* **Search bounds:** 30–70 rpm.
* **Saved feasible grid window:** **30–60 rpm**, seven points, width 30 rpm.
* **Selected representative operating point:** **45 rpm**.
* This is a discrete saved screening window under extrapolated correlations, not a proof of every continuous RPM between grid points and not a validated operating guarantee.

The 20 rpm value is only a ranking preference, explicitly not a hydraulic limit. Version 1.3.0 selects the second-smallest distinct diameter meeting that preference (`stage3-stage4-optimizer.ts:1038-1088`). Run 64 retained 0.5 m as the smallest adequate diameter and selected **0.6 m** as the next-smallest margin.

## Mathematical dependency trace

| Output | Implemented dependency | Orientation consequence |
|---|---|---|
| `Qc`, `Qd`, `Uc`, `Ud` | Stage-1 phase mapping; `U=Q/A` | Swaps which persisted flow is continuous/dispersed. |
| Power / `ψ` | `P=Np ρc N³ Dr⁵`; `ψ=P/(A hc ρc)` | `ρc` is consumed; algebraically cancels from `ψ` for fixed geometry/Np/N, but still enters power and other correlations. |
| d32 | `C(σ/ρc)^0.6 ψ^-0.4` | Uses continuous density and Stage-1 σ; changing orientation changes `ρc` supplied to the kernel. |
| K&H operating `φ` | functions of `ρc`, σ, ψ, `Ud`, `Uc`, `(ρc-ρd)/ρc`, free area; implemented dispersed-viscosity exponent is zero | Direction materially changes phase flows/densities. `μd^0` has no numerical effect in this specific K&H expression, though viscosities remain applicability inputs. |
| Myint terminal state | `Δρ=ρc-ρd`, `κ=μd/μc`, Archimedes, Re, Eötvös, Morton, Taylor/aspect ratio | Both densities and both viscosities are directional. Ordinary kernel rejects non-heavy continuous phase rather than taking `abs(Δρ)`. |
| Garthe/swarm | terminal velocity × geometry factor; drag ratio and `(1-φ)^4.65` | Inherits all directional terminal/drag inputs and continuous-fluid Reynolds definitions. |
| Flooding | maximizes capacity over holdup using `Qd/Qc`; loading `(Qc+Qd)/(A·vflood)` | Flow role and all upstream directional drag/slip values matter. |
| Diameter / RPM | candidate passes only when finite physical state, tip-speed, and loading ≤ 0.7; contiguous pass window is ranked | Orientation changes candidate admission and therefore D/window/RPM selection. |

Source equations: `server/ecr-pre-pilot/kuhni-hydrodynamics.ts:104-140`; `server/ecr-pre-pilot/kuhni-geometry-resolver.ts:126-146, 155-215`; pass criterion `:239-244`.

## Hardcoding and ignored-orientation audit

* **No silent swap in current selection:** optimizer current branch is derived from Stage-1 orientation; alternate orientation is comparison-only and cannot replace it (`server/ecr-pre-pilot/stage3-stage4-optimizer.ts:1371-1395`).
* **Ordinary kernel is direction-limited:** it requires `ρc > ρd` (`kuhni-geometry-resolver.ts:155-160`). This is not orientation ignorance; it is a hard admission boundary.
* **Reverse kernel is separate:** RRBO-continuous candidates dispatch to `evaluateKuhniReverseTrial`, while NMP-continuous candidates dispatch to the ordinary K&H plus Myint/Garthe path (`stage3-stage4-optimizer.ts:665-735`). Reverse saved diagnostics explicitly say swarm/flooding closure is unqualified.
* **Metadata phase mapping also follows orientation:** `phaseProperties` maps identities, flows, and densities (`stage3-stage4-optimizer.ts:529-533`).
* **Stage 4 does not reorient or recompute hydraulics:** it requires the exact current optimizer version/hash and carries its geometry (`stage4-pre-pilot-sizing-service.ts:254-292, 342-365, 511-564`).
* **Stage 2 intentionally ignores hydraulic orientation only for equilibrium identity:** it does not supply Stage-3 phase direction (`stage1.ts:388-412`).

Run 64 contains a RRBO-continuous **comparison-only** result (D 1.3 m, 30–50 rpm, 40 rpm; reverse swarm/flooding unqualified). It is not current authority and cannot be substituted for the selected branch.

## Impact matrix for an orientation flip

| Item | Impact if Stage 1 flips | Disposition |
|---|---|---|
| Active selected D = 0.600 m | **Impacted** | Bound to run-64 NMP-continuous hash. It might numerically recur in a future governed run, but the old selection cannot prove feasibility after a flip. |
| 30–60 feasible window / 45 rpm | **Impacted** | Depends on directional loading and candidate admission. 30–70 remains only search bounds. |
| Candidate d32 | **Impacted** | Continuous density changes; power/slip chain changes. |
| Operating dispersed holdup `φ` | **Impacted** | `Qc/Qd`, density roles, and K&H terms change. |
| Flooding/loading | **Impacted** | Myint κ, signed density prerequisite, Garthe/swarm, flow ratio, and turning-point capacity are directional. |
| Stage-2 accepted `N_T=4` | **Independent of orientation-only change** | Persisted compatibility proves all equilibrium inputs except orientation match. It remains reference-only. |
| Stage-4 fixed design `N_T=7` | **Independent adopted basis** | Not calculated from Stage-2 `N_T`. |
| Adopted `η=0.35` | **Independent adopted assumption** | Hard-coded Stage-4 screening assumption (`stage4-pre-pilot-sizing-service.ts:27-40`). |
| 20 compartments | **Partly independent / geometry-coupled** | Count is `ceil(7/0.35)=20`; orientation does not enter that equation, but use in a valid design still requires current Stage-3 authority. |
| Active height 3.6 m | **Impacted through hc** | Stage 4 multiplies 20 by persisted `hc=0.18 m`; a new orientation can change selected geometry/hc (`:294-305`). |

## Selected authority versus obsolete history

Older RRBO-continuous optimizer outputs are historical only: run 18 / Stage-4 result 10 selected 1.2 m; run 20 / result 11 selected 0.5 m under older optimizer/Stage-1 hashes. NMP-continuous Stage-4 results 12–15 are also superseded by result 16's current efficiency implementation/lineage. None displaces run 64 plus result 16.

**Qualified conclusion:** Current D = 600 mm, 30–60 rpm saved feasible grid window, 45 rpm point, d32, operating `φ`, and flooding loading were all calculated with **wet NMP continuous and RRBO dispersed**. Accepted Stage 2 retained **RRBO continuous / NMP dispersed** because hydraulic orientation is excluded from its equilibrium identity. The database proves when these snapshots and downstream records existed, but does not record whether the final orientation change came from a deliberate user choice, the UI default, or a migration; actor intent is therefore unresolved and not inferred.