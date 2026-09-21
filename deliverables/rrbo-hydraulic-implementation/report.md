# RRBO / wet-NMP hydraulic implementation review

## Decision and boundary

Implemented an additive pure method, `RRBO_WETNMP_KUHNI_HYDRAULIC_P1`, for the user-approved **conditional pre-pilot screening** chain. The separately named `evaluateP1ReviewTrial` uses this method; the future-only `optimizeStage3Stage4P1ForReview` has V1.4.0 identity but is not connected to any service dispatcher and was not executed. **Current V1.3 authority, default calculations and replay remain unchanged pending approval of a new optimization.** This is **PREPILOT_EXTRAPOLATED_METHOD**, not validated equipment design. No final diameter/RPM optimization, saved Stage-3 replacement, or persisted Stage-4 sizing run was performed. Implementation tests make no database calls. The normal application workflow was subsequently restarted for a startup check; its existing startup routines ran.

Stage 4 remains fixed Ndesign=7 with adopted physical-compartment efficiency 0.35 and NC=ceil(7/0.35); no finite-rate qualification requirement was restored. Existing Stage-3 authority remains current and immutable. Current Stage-3 and transitive Stage-4 implementation hashes are exactly preserved; P1 must not mark existing V1.3 authority stale or silently recalculate its science.

Read basis: `deliverables/rrbo-hydraulic-method/report.md`, retained Barry–Parlange and Garthe primary text, and the Garthe velocity-convention and Stage-4 screening-boundary memory records.

## Implemented equations

Use positive flow magnitudes jc=Qc/A, jd=Qd/A; upward RRBO is positive in signed velocities. The supplied saved property snapshot is consumed unchanged and copied into results. P1 requires the supplied 40 °C basis; it never silently replaces properties.

* N=RPM/60; Dr=(Dr/D)D; hc=(hc/D)D; A=πD²/4.
* Power=1.2 ρc N³ Dr⁵; ε=Power/(A hc ρc).
* d32=C(σ/ρc)^0.6 ε^-0.4, at **C=0.36, 0.42, 0.43**. This is a conditional Sauter-mean proxy, not Hinze maximum stable diameter. Np=1.2 is separate from Garthe's source power number.
* Mobile drag: Barry–Parlange (2018), Eq. 10, with positive τ from Eq. 12, λτ=1 and ωτ=1/[3(1+X)]. Source constants A=2√2(6√3+5√2−14)/(5√π), α=2.5891, β=0.9879; X=μd/μc, P=ρd/ρc.
  Specifically Cd = [48(1+1.5X)/(Re(1+X))] × [√Re+AZ+τ exp(−√Re/τ)]/[√Re/(1+X)+3AZ+3τ exp(−√Re/[3(1+X)τ])]; Z=1+[(α−2)√(XP)+(β−1)XP]/[1+√(XP)]². With B=(8/9)(4+3X)/(1+X), the numerically non-cancelling positive root is τ=2B/[√((AZ)²+4B)+AZ].
* Immobile drag: Cd=(24/Re)(1+0.15 Re^0.687). Neither interface scenario is presumed actual.
* Terminal force balance: Cd(Re)Re²=(4/3)Ar, Ar=ρc(ρd−ρc)gd32³/μc²; ut=Re μc/(ρc d32). Signed terminal velocity is downward.
* Garthe characteristic factor: 1−1.669 NP,G^-3.945−2.807[d32/(D−Dr)]^1.336−1.159(hc/D)^2.049+2.1 φs^1.032; NP,G=1.08+10.94/ReR^0.5+257.37/ReR^1.5. Source: dissertation Eqs. 5.6–5.7, printed p.86.
* Garthe Eq. 8.3: vs/v0=√[(Cd(Re0)/Cd(Res))(1−φ)^4.65]. The **same scenario drag law** is used at terminal, characteristic and swarm states.
* Garthe Eqs. 2.37–2.38: **vslip=vs/(1−φ)**. Low-Re limits are vs/v0=(1−φ)^4.65 and vslip/v0=(1−φ)^3.65, not the constant-drag exponent 2.325.
* Operating roots satisfy jd/φ+jc/(1−φ)=vslip(φ), using actual flows. The lower dilute-connected branch is retained; other roots remain mathematical roots.
* Capacity at fixed r=jd/jc: jT,allow=(1+r)vslip/[r/φ+1/(1−φ)]. Its maximum and argmax are stored as modeled capacity and flood holdup, separately from operating holdup.
* aop=6φop/d32 only when operating holdup exists. No-root cases return null operating holdup/area, never flood substitution.
* Conservative scenario is the lowest modeled capacity across both mandatory interfaces and all three coefficient values. Screening requires every scenario to have an operating root and loading≤0.70, plus the existing tip-speed ceiling. Governing scalar holdup/d32/area all come from this same conservative scenario.

## Numerical implementation assumptions

Bounded bisection uses 70 iterations, including a log-velocity bracket for very small swarm speeds. Capacity is sampled at 512 holdup intervals and locally refined for 60 iterations. Actual roots are enumerated on the mesh with the refined capacity point included, then bracketed and refined. Sixteen proportional flow-ramp steps track the lower branch; missing/non-monotone roots or a root reaching the turning point return no operating state. Numerical constants are implementation assumptions, not physical acceptance thresholds. Extremely small flows outside the finite root bracket fail explicitly rather than silently substituting a solution.

This is quasi-steady algebraic continuation, **not proof of dynamic stability**. The finite mesh is not a formal certification against arbitrarily narrow, unobserved additional branches. No unrestricted Newton solver is used.

## Qualification and diagnostics

Independent fields remain **UNKNOWN** for inversion, entrainment, disengagement, turbulence, sphericity, Schiller–Naumann range and actual interface mobility. A loading pass does not change these fields. Missing empirical qualification does not block the explicitly approved assumption-based screening calculation; it does prevent a scientific qualification claim.

Outputs include rotor Re, terminal/characteristic/swarm Re, Eo, terminal We, continuous/dispersed Oh, power and ε, signed operating velocities, operating balance residual, force residual, root list and continuation, all six scenarios, and geometry/property source-range ratios. No authoritative turbulence, deformation or drag-range threshold was invented.

### Single nominated verification fixture — not an optimized design

Fixture properties: ρc=869, ρd=1015 kg/m³; μc=0.0598, μd=0.001416 Pa s; σ=0.011 N/m; Qc=4 m³/h; Qd=0.6×869/1015×4 m³/h, at 40 °C. The **arbitrary test geometry** D=1.2 m, Dr/D=.33, hc/D=.30, free area=.30, 40 rpm is not selected or saved authority.

Rotor Re=1519.21; power=3.00887 W; ε=.00850410 W/kg.

| C | Interface | d32 mm | Terminal Re | φop | φf,model | Capacity m/s | Loading |
|---|---|---:|---:|---:|---:|---:|---:|
| .36 | Mobile BP | 2.79174 | .587876 | .043386 | .160870 | .00276564 | .537709 |
| .36 | Immobile SN | 2.79174 | .389947 | .080847 | .161247 | .00183602 | .809963 |
| .42 | Mobile BP | 3.25703 | .908880 | .030404 | .162326 | .00370906 | .400940 |
| .42 | Immobile SN | 3.25703 | .603813 | .051387 | .162438 | .00245983 | .604558 |
| .43 | Mobile BP | 3.33458 | .970637 | .028901 | .162588 | .00387708 | .383565 |
| .43 | Immobile SN | 3.33458 | .645102 | .048418 | .162647 | .00257111 | .578393 |

The governing .36/SN scenario fails the accepted 0.70 loading policy despite some other scenarios passing. Its Eo=1.01445, We=.0203763, Ohc=.366064, Ohd=.00802041. These diagnostics do not establish sphericity or turbulence. Inversion and entrainment remain UNKNOWN.

## Versioning, output and authority

Historical resolver V1.4/V1.5 files are unchanged. Optimizer V1.0–V1.2 replay and current/default V1.3 calculations retain their original reverse path and flood-holdup mapping. Current service dispatch and latest queries are byte-identical to the original service. Corrected calculations require the explicitly named review entry points; no V1.4 route is installed in production dispatch. No saved rows are migrated, rewritten, excluded by changed current identities, or silently recomputed with P1 semantics.

Original identities independently reconstructed from git HEAD and pinned by tests:

* Current optimizer version: `ECR_STAGE3_STAGE4_OPTIMIZER_V1.3.0`.
* Current optimizer hash: `faa56fdd99b0904a5e524fb8350859192d94b269331e91bbd34cc5d946ccb550`.
* Stage-4 optimized implementation hash: `b6893ba2bc448ef35d1e9abdd83158602e0b7956a481028416821cfc9b66f58a`.

The initial implementation changed the current identity; review correctly identified that this would invalidate saved-authority lookup despite no DB writes. That change has been removed. A mocked, no-DB admission regression confirms a synthetic V1.3 snapshot remains admitted and a P1 review snapshot is not promoted into current Stage-4 authority.

Candidate output carries separate `holdup` (operating), `floodHoldup`, interfacial area and complete `hydraulicMethod` evidence. Selected-trial JSON and compact serialization retain this evidence. The existing optimizer panel distinguishes operating/model-flood holdup for P1 and stored model basis for historical rows, with conservative-scenario and UNKNOWN-qualification labeling; no new UI surface was built.

## Validation and review limits

Focused tests cover BP→HR over viscosity ratios, SN→Stokes, superficial/slip low-Re exponents and constant-drag limit, six-scenario coefficient coverage and conservative selection, actual balances and both roots, continuation and separate operating/flood holdup, null no-root failure, invalid/nonfinite inputs, JSON/compact preservation, single-trial historical mapping, and unchanged input authority. A passing loading must still retain UNKNOWN qualification and extrapolation.

Validation command: `npx vitest run tests/rrbo-wetnmp-hydraulic-p1.test.ts tests/rrbo-p1-authority-isolation.test.ts tests/common-hydraulic-mapper.test.ts tests/ecr-hydraulic-diameter-basis.test.ts --maxWorkers=1`.

The additional isolation suite pins original current identities, byte-identical latest/replay services, unchanged default dispatch, distinct P1 identity and pure Stage-4 admission with a fail-on-access DB mock. No optimizer is called by these tests. `git diff --check` passed. Esbuild syntax transpilation passed for the existing UI panel. After the final workflow restart, the application served on port 5000 and its login page rendered; authenticated hydraulic result rendering was not exercised. Startup logs also contain unrelated VPN-tool and mirror-table warnings.

**Final focused result: 4 test files passed, 15 tests passed** (9 hydraulic single-trial tests, 3 authority-isolation tests, 3 nearby regressions).

No optimizer-containing regression suite was executed. Historical complete-grid replay was intentionally not run; single-trial historical semantics and replay wiring were reviewed instead.

Targeted TypeScript checking reports existing errors in unchanged `kuhni-geometry-resolver-v110.ts` (engine-version widening) and `kuhni-geometry-resolver-v140.ts` (theoretical-stage authority type). It reports no errors in the new kernel or modified optimizer. The first Vitest attempt used unsupported `--minWorkers`; it was corrected to `--maxWorkers=1`.

## Files changed

* `server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts` — new pure, versioned method.
* `server/ecr-pre-pilot/stage3-stage4-optimizer.ts` — explicit review-only adapter/entry point and V1.4 identity; current V1.3 identity and default semantics preserved.
* `client/src/components/ecr-pre-pilot/stage3-stage4-optimizer-panel.tsx` — existing labels.
* `tests/rrbo-wetnmp-hydraulic-p1.test.ts` — pure/single-trial regression coverage.
* `tests/rrbo-p1-authority-isolation.test.ts` — original hash/latest/dispatch/admission isolation coverage, with DB access prohibited.
* This `report.md` and companion `report.html` — implementation review artifacts.