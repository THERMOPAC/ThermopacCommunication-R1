# RRBO Stage-3 current-basis numerical audit

**Scope:** Stage 3 only. This is a read-only numerical audit of the exact
persisted v1.5 run matching the screenshot values (`0.693 m`, `25 rpm`,
`d32 = 4.746 mm`, `kappa = 0.023678929765886286`, and
`delta rho = -146 kg/m3`). No application endpoint was called, no database
write was made, and no Stage 2 or Stage 4 calculation was run or changed.
The independent reproduction uses ordinary JavaScript `Math`, bisection, and
golden-section maximization; no scientific package/import is used outside the
Stage-3 equations.

## 1. Exact saved run and lineage

The safe database read was against the development `replit_database` through
the read-only SQL mechanism, not a GET endpoint:

| Item | Persisted value |
|---|---|
| Table | `ecr_pre_pilot_kuhni_geometry_resolver_runs` |
| Stage-3 run | `id = 15` |
| Design | `id = 269`, project `236` |
| Created | `2026-09-15T10:46:14.491Z` |
| Engine | `KUHNI_GEOMETRY_RESOLVER_V1.5.0` |
| Run implementation hash | `26df76278f021c010f6057991c03b72362f003a1a6320fbb01a74fca2cbd3637` |
| Run immutable hash | `4cc3e2d3e99598fc5f01a13a0f397c2f5d00a4149ff6ce01a497a469d838b5d6` |
| Result calculation hash | `7e5999836fdeb7ffe6365eb8e4f72ddded266ec2a3b208e0b27445a8c7a04cf6` |
| Parent hydrodynamic run | `id = 9`, hash `d089a80918c6657c3d291046ec049d7a488d64f0f601f646f34a3ac0e2e26c27` |

The current Stage 1 design `input_data.immutableHash` is
`e4137f46b51c7eb17e0ec7bb7077fb5dd24cb93acedce531d40420b53bb4f8af`. The
Stage-3 row's `stage1_snapshot_hash` and its nested
`processBasis.stage1SnapshotHash` are exactly the same hash. Therefore the
lineage check passes before comparing the screenshot/prior `.693 m` values.
The Stage-3 snapshot is not silently being compared with a room-temperature
or stale Stage-1 basis.

The authoritative Stage-1 row was updated at
`2026-09-15T10:46:02.278Z` and carries schema
`ECR_PRE_PILOT_STAGE_1_V1`, immediately before the saved Stage-3 row.

## 2. Current Stage-1 operating-temperature authority

The saved Stage-1 row is the sole property authority for this audit. It gives
40 °C (`313.15 K`), not room temperature, and the
`rrbo-continuous-nmp-dispersed` orientation:

| Quantity | Current Stage-1 value |
|---|---:|
| Continuous RRBO flow | `4000 L/h = 0.0011111111111111111 m3/s` |
| Continuous RRBO density | `869 kg/m3` |
| Continuous RRBO dynamic viscosity | `59.8 cP = 0.0598 Pa s` |
| Dispersed wet-NMP flow | `0.0005707717569786535 m3/s` |
| Dispersed wet-NMP density | `1015 kg/m3` |
| Dispersed wet-NMP dynamic viscosity | `1.416 cP = 0.001416 Pa s` |
| Wet-NMP solvent/oil mass ratio | `0.6` |
| Wet-NMP water | `0.5 wt%` |
| Interfacial tension | `11 mN/m = 0.011 N/m` |
| Temperature | `313.15 K = 40 °C` |

The wet-NMP flow was freshly reconstructed from the Stage-1 basis:

```text
Q_wetNMP = Q_RRBO * rho_RRBO * (S/O) / rho_wetNMP
          = 0.0011111111111111111 * 869 * 0.6 / 1015
          = 0.0005707717569786535 m3/s
```

The fresh viscosity ratio is:

```text
lambda_mu = mu_dispersed / mu_continuous
          = 0.001416 / 0.0598
          = 0.023678929765886286
```

This independently calculated `lambda_mu` equals the persisted terminal
`kappa`. It was not taken from the old displayed value. There are two
similarly named quantities in the diagnostic implementation: the persisted
`kappa` is the phase-viscosity ratio, while the third argument named `lambda`
in `myintDrag(Re, kappa, lambda)` is explicitly passed as `0` by the
Stage-3 terminal/characteristic/swarm calls. Both are recorded in the JSON
artifact to prevent conflation.

The signed density difference is likewise fresh:

```text
delta_rho = rho_continuous - rho_dispersed = 869 - 1015 = -146 kg/m3
```

## 3. Persisted v1.5 illustrative root

Run 15 has status
`EXTRAPOLATED_REVERSE_ORIENTATION_DIAGNOSTICS_WITH_ILLUSTRATIVE_MODEL_ROOT`.
The selected root is stored under
`result_snapshot.illustrativeExtrapolatedModelRoot`:

| Primitive/result | Persisted value |
|---|---:|
| RPM | `25` |
| Column diameter | `0.6930996970569214 m` |
| Rotor diameter | `0.3465498485284607 m` |
| Compartment height | `0.3465498485284607 m` |
| Sauter diameter d32 | `0.004745712291978037 m` (`4.745712291978 mm`) |
| Power | `0.3770473251484636 W` |
| Specific power | `0.0033184025996587617 W/kg` |
| Rotor Re | `727.174728543904` |
| Terminal Re | `2.40451506518235` |
| Terminal drag coefficient | `8.575883812936443` |
| Terminal Eo | `2.931457873237061` |
| Terminal Mo | `0.01821632051018739` |
| Terminal Taylor number | `0.9570474137453387` |
| Terminal aspect ratio | `0.9269211321132751` |
| Terminal relative velocity | `-0.034866431799366854 m/s` |
| Terminal signed force residual | `1.3552527156068805e-20 N` |
| Characteristic Re | `2.6050252509295273` |
| Characteristic velocity | `-0.03777390982587785 m/s` |
| Swarm Re | `1.3690365640430835` |
| Swarm velocity at flood | `-0.019851578674732806 m/s` |
| Countercurrent continuous velocity at flood | `0.00344326941501665 m/s` |
| Countercurrent dispersed velocity at flood | `-0.010452835657296312 m/s` |
| Countercurrent relative velocity at flood | `-0.013896105072312962 m/s` |
| Flood holdup | `0.1447261647352734` |
| Flood total superficial velocity `Uf` | `0.00636819579102804 m/s` |
| Continuous superficial velocity | `0.002944938238431022 m/s` |
| Dispersed superficial velocity | `-0.0015127988152886056 m/s` |
| Total mass flux | `4.0946421267144935 kg/m2/s` |
| Actual loading | `0.7` |

The sign is meaningful: the reverse orientation makes the wet-NMP dispersed
phase travel downward in the diagnostic mapping. The persisted root's
terminal, characteristic, and swarm velocities are therefore negative while
the flood capacity scalar `Uf` is positive.

## 4. Independent Stage-3 reproduction

The independent calculation used the current Stage-1 values above and the
existing v1.5 diagnostic formula only:

1. Set `Dr = 0.5 D`, `H = 0.5 D`, `n = rpm/60`, and
   `A = pi D^2/4`.
2. Calculate `P = Np rho_c n^3 Dr^5`, with `Np = 1.2`, then
   `psi = P/(A H rho_c)`.
3. Calculate `d32 = 0.42 (sigma/rho_c)^0.6 psi^-0.4`.
4. For `Ar = rho_c |delta_rho| g d32^3 / mu_c^2`, solve
   `Cd(Re;kappa,0) Re^2 = 4 Ar/3`, where
   `Cd = 8(2+3 kappa)/(Re(1+kappa)) * (1+0.15 Re^0.687)`.
5. Retain the signed terminal velocity
   `w = sign(delta_rho) Re mu_c/(rho_c d32)`, calculate Eo/Mo/Taylor,
   then apply the existing characteristic and swarm closures.
6. Maximize the existing flood-capacity function over holdup and solve the
   diameter root for `actualLoading = Qtotal/(A Uf) = f = 0.7` at 25 rpm.

Independent values are `D = 0.693099697056925 m`,
`d32 = 0.004745712291978018 m`, terminal `Re = 2.4045150651823217`,
terminal `Eo = 2.9314578732370373`, terminal `Mo =
0.01821632051018739`, characteristic velocity
`-0.03777390982587748 m/s`, flood holdup `0.1447261647352734`, and
`Uf = 0.006368195791027972 m/s`. The largest listed reproduction
difference is below `4e-16` in velocity or `3e-14` in a dimensionless
terminal group; the diameter difference is `1.11e-16 m`. The signed
terminal force balance independently closes to
`-1.08e-19 N` (rounding-level).

These checks reproduce the saved `.693 m`, 25 rpm, 4.746 mm, kappa, delta-rho,
terminal Re/Eo/Mo, and characteristic/flood velocities from current
operating-temperature Stage-1 data. They do not promote the root to a
qualified design result.

## 5. Fixed-Q diameter comparison and algebraic sensitivity

Using the persisted positive flood-capacity scalar `Uf`, the requested fixed-Q
comparison is:

```text
D_Q = sqrt(4 Qtotal / (pi f Uf))
    = sqrt(4 * 0.0016818828680897646 /
            (pi * 0.7 * 0.00636819579102804))
    = 0.6930996970569214 m
```

It agrees with the persisted root because the existing root closure is
exactly `Qtotal/(A Uf) = 0.7`. Algebraically, at fixed `Qtotal` and `f`,
`D(Uf*(1+s)) = D0 / sqrt(1+s)`. The following are **algebraic sensitivity
values only, not uncertainty bounds**, and do not rerun or qualify the
hydrodynamic model:

| Change in `Uf` | Algebraic `Uf` (m/s) | Algebraic `D` (m) |
|---:|---:|---:|
| -50% | `0.00318409789551402` | `0.9801909916545818` |
| -20% | `0.0050945566328224326` | `0.7749090189018937` |
| -10% | `0.005731376211925236` | `0.7305912294241914` |
| +10% | `0.007005015370130844` | `0.6608446317612279` |
| +20% | `0.0076418349492336475` | `0.6327105644634549` |
| +50% | `0.00955229368654206` | `0.5659135328890191` |

## 6. Admission conclusion

The exact current-basis saved root is found and independently reproduced.
However, `hydraulicRpmEnvelope` is empty,
`hydraulicDiagnosticPoint` is `null`, `hydraulicPass` is `false`, and the
persisted Stage-4 admission says
`BLOCKED_REQUIRES_CALCULATED_IN_RANGE_STAGE3_TRIAL`. The v1.5 warning set
retains reverse-orientation and source-range extrapolation warnings,
including unqualified characteristic-velocity, swarm-holdup, and flooding
closures. Consequently, `0.6930996970569214 m` is an illustrative
extrapolated model root, not a governed Stage-3 diameter or a Stage-4 input.

The companion machine-readable artifact is
`research/rrbo-stage3-current-basis-audit.json`.

## 7. Source-based qualification decision

The current root is numerically reproducible, but the source audit does not
support treating every finite equation in the v1.5 chain as a qualified
closure. The distinction is between a conditional generic model that has a
declared physical gate and an extrapolated value returned after that gate is
skipped.

### Barry--Parlange disposition

Barry and Parlange's Eq. (10) is admitted to the research model set as a
**conditional generic spherical terminal closure**, not rejected as a mere
sensitivity equation. It uses the actual \(X=\mu_D/\mu_C\) and
\(P=\rho_D/\rho_C\), and its stated assumptions are one steady, spherical,
non-wobbling fluid sphere in an otherwise quiescent, homogeneous liquid with
no interphase mass transfer. The source comparisons extend to approximately
\(Re=200\), which covers the current terminal comparator \(Re=2.53\).

That admission is conditional, not an approval of the present RRBO/NMP state.
The current \(Eo=2.93\), low-\(\kappa\) interface state, falling direction,
and nonterminal forced-slip conditions do not establish Barry's spherical
assumptions. The current Barry value therefore remains a
`CALCULATED_EXTRAPOLATED` sensitivity. If a separate shape/interface gate
establishes a steady sphere, Barry can provide the generic terminal
\(C_D(Re)\) route; it still must be checked at characteristic and every swarm
Reynolds number before being used in Eq. 8.3. Barry has no drop-population,
coalescence, orientation, or flooding closure.

### Narrow missing-closure matrix

| Stage-3 link | What the current root does | Precise unresolved closure |
|---|---|---|
| Drop generation and \(d_{32}\) | Uses \(d_{32}=0.42(\sigma/\rho_C)^{0.6}\psi^{-0.4}\). | Conversion of a Sauter population mean into a hydraulic representative-drop/population slip, including the Kühni breakup/coalescence and geometry transfer. This is a population and geometry issue, not a demand for exact RRBO/NMP data in every preliminary calculation. |
| Isolated terminal drop | Uses the clean Myint finite-\(Re\) continuation at \(\kappa=0.02368\). | Falling low-\(\kappa\) interface and shape state. Myint's finite-\(Re\) evidence starts at \(\kappa=0.1\) and is for rising drops. Barry supplies the conditional generic spherical route, but the present state has not passed its spherical, steady, non-wobbling gate. |
| Kühni characteristic slip | Multiplies the terminal speed by the Garthe characteristic factor. | A source-backed single-drop characteristic velocity for this reverse orientation and local geometry. Terminal drag is not automatically a drag law at forced characteristic slip. |
| Swarm and holdup | Reuses the same Myint drag function at characteristic and swarm Re in the Garthe/Stichlmair \(4.65\)-exponent relation. | A Reynolds-dependent \(C_D\) valid at each nonterminal local state, or a separately qualified nonterminal/single-drop characteristic model, plus the reverse-orientation swarm response. A terminal-only closure is insufficient. |
| Flooding and diameter | Takes an interior maximum of the assumed capacity function. | Reverse-orientation holdup, stable branch, flooding/entrainment, phase inversion, and port/control limits. The turning point is a model maximum, not measured reverse flooding. |

The current root has \(D_C=693\) mm, \(h_C=346.5\) mm, \(n_R=25\) rpm,
and \(d_{32}=4.746\) mm. These are outside the reported Kühni comparison
envelope in Garthe's dissertation (\(D_C=80\)--\(152\) mm,
\(h_C=50\)--\(72\) mm, \(n_R=28\)--\(220\) rpm, and
\(d_A=45\)--\(85\) mm); the reported average relative deviation was about
23.5% for conventional liquid systems. Garthe also reports that the
drop-swarm fit becomes unsatisfactory above \(d_{32}\approx4.5\) mm in the
rotating-disc evidence and that mass-transfer direction can alter drop size
and shape. These comparisons identify extrapolation; they are not a blanket
requirement for an exact RRBO/NMP experiment.

### Qualification route

A defensible future Stage-3 route is conditional and modular:

1. retain the signed falling state and use Barry only after an explicit
   spherical/steady/non-wobbling gate, or use a qualified deformation-aware
   liquid-drop model if that gate fails;
2. retain a declared \(d_{32}\)-to-population closure and its geometry/power
   uncertainty rather than silently treating \(d_{32}\) as one drop;
3. provide the same applicable \(C_D(Re)\), or a separately validated
   nonterminal slip relation, at terminal, characteristic, and every swarm
   state visited by the holdup root; and
4. independently bound reverse holdup, flooding, inversion, and ports/control
   before releasing a diameter as a governed Stage-3 result.

No universal rule requires exact RRBO/NMP measurements if a generic,
source-backed route passes these gates with disclosed extrapolation. For the
persisted 40 °C root, however, the falling low-\(\kappa\) interface/shape
gate and the nonterminal reverse Kühni slip/holdup/flooding closures remain
open. The \(0.6931\) m value consequently remains an illustrative
`CALCULATED_EXTRAPOLATED` root, not a qualified Stage-3 diameter.