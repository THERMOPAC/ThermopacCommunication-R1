# Why Stage 3 has no final column diameter

## Executive finding

The saved run completed successfully; it did **not** fail to calculate. In the saved RRBO-continuous orientation, increasing speed makes predicted droplets smaller, reduces settling/characteristic/swarm capacity, and raises loading. Every sampled geometry at **45–70 rpm** exceeds the accepted **0.70 loading limit**. The largest accepted fixed-geometry span is consequently **30–40 rpm = 10 rpm**, not 20 rpm. The current selection policy requires **two distinct diameters with a ≥20 rpm contiguous accepted span**; it finds zero and deliberately returns no selected diameter or Stage 4 geometry.

This is a coupled **model-capacity limitation on the searched grid → narrow accepted windows → selection-policy gate**, not just a missing UI value. Neither a physical impossibility for all real columns nor a universally necessary 20-rpm physical law has been established.

## 1. Provenance and exact status

- Project **236**, design **269**, newest candidate **b4b44349-5471-4b9c-acf8-d06e2cea8d42**, completed ledger row **69**, saved **2026-09-21T04:19:32.005Z**.
- Requested **2026-09-21T04:15:36.681Z**. Persisted metadata status **completed**, no persisted error; calculated status **NO_SECOND_ADEQUATE_DIAMETER**, blocker **INSUFFICIENT_ACCEPTED_ADEQUATE_DIAMETERS**.
- Current saved Stage 1 hash and candidate source hash both **06bb9227b30f1f4c67b3ed557db34f61fe749037addf66163194dd46e2e98c5f**. Stage 1 last updated **2026-09-21T03:29:28.206Z**. This is not a stale candidate.
- Latest ledger ordering was checked separately: row 69 completed supersedes row 68 running for this candidate; row 67 is the previous completed candidate.
- Candidate kind **RRBO_P1_CANDIDATE_ONLY**, engine **ECR_STAGE3_STAGE4_OPTIMIZER_V1.4.0**, implementation hash **a79c49a6d554381bde9dbdbd5076845f3d033e744e17d7612970021134671de0**.
- Stage 1 snapshot validation, canonical ledger hash, and result calculation hash all passed. Only validation/hashing functions were invoked, not optimizer/solver functions.
- Database reads used explicit read-only transactions. Main extraction used repeatable-read and ROLLBACK. No database or application-code changes, calculation requests, optimizer runs, or workflow operations; only local investigation deliverables were written.
- Selected geometry, RPM and operating window are null. The Stage 4 geometry-input object has status **UNAVAILABLE** and null geometry/RPM fields. “Completed” means completed computation, not selected/qualified design.

## 2. What was actually searched

Saved controls: D = **0.2–1.5 m in 0.1 m steps**, speed **30–70 rpm in 5 rpm steps**, rotor/D **0.33, 0.40, 0.50**, compartment-height/D **0.20, 0.25, 0.30**, free-area fraction **0.20, 0.30, 0.40**. The saved control for minimum useful span is **20 rpm**.

Per orientation: **378 fixed geometries × 9 speeds = 3,402 trials**. RRBO P1 evaluates **six scenarios per trial**: C32 = 0.36, 0.42, 0.43, each with mobile Barry–Parlange and immobile Schiller–Naumann drag; **20,412 scenario states** are persisted. With the comparison orientation there are 6,804 trial rows overall, but that comparison is not a fallback for the saved phase.

RRBO results: **158 accepted trial points**, **103 geometries with at least one accepted point**, **3,244 rejected trials**, **zero adequate geometries**. The governing scenario in every RRBO trial is **C32 = 0.36, Schiller–Naumann immobile**. All 3,244 rejected trials exceed loading 0.70; 3,074 also have at least one absent dilute-connected root. There are no tip-speed rejection flags.

| D m | geometries searched | geometries with accepted points | accepted RPM points | maximum span rpm |
| --- | --- | --- | --- | --- |
| 0.2 | 27 | 0 | 0 | none |
| 0.3 | 27 | 1 | 1 | 0 |
| 0.4 | 27 | 5 | 5 | 0 |
| 0.5 | 27 | 8 | 10 | 5 |
| 0.6 | 27 | 8 | 11 | 5 |
| 0.7 | 27 | 9 | 12 | 5 |
| 0.8 | 27 | 9 | 14 | 5 |
| 0.9 | 27 | 9 | 15 | 10 |
| 1 | 27 | 9 | 15 | 10 |
| 1.1 | 27 | 9 | 15 | 10 |
| 1.2 | 27 | 9 | 15 | 10 |
| 1.3 | 27 | 9 | 15 | 10 |
| 1.4 | 27 | 9 | 15 | 10 |
| 1.5 | 27 | 9 | 15 | 10 |

The span is endpoint subtraction, not count × step: 30/35/40 is 10 rpm; 30/35/40/45/50 would be 20 rpm and requires five consecutive accepted sample points. The code splits a run when it encounters a rejected point, never joins disjoint windows, and never pools speeds from different geometries. Diameter and rotor dimensions are in metres; speed is converted to revolutions/second as rpm/60 only in physical calculations. No count/span or rpm/revolutions-per-second mismatch explains this result. The stored table above covers every requested diameter, not merely the displayed frontier.

## 3. Why 45 rpm is already too high on this grid

Each row below chooses the lowest loading across **all 378 geometries at that speed**, not only the representative geometry. Positive margin is 0.70 minus loading.

| rpm | accepted points | best D / rotor:D / hc:D / free | minimum loading | margin to 0.70 | governing roots |
| --- | --- | --- | --- | --- | --- |
| 30 | 103 | 1.5 / 0.33 / 0.3 / 0.4 | 0.32045 | 0.37955 | 2 |
| 35 | 48 | 1.5 / 0.33 / 0.3 / 0.4 | 0.46849 | 0.23151 | 2 |
| 40 | 7 | 1.5 / 0.33 / 0.3 / 0.4 | 0.65383 | 0.046167 | 2 |
| 45 | 0 | 1.5 / 0.33 / 0.3 / 0.4 | 0.87957 | -0.17957 | 2 |
| 50 | 0 | 1.5 / 0.33 / 0.3 / 0.4 | 1.1486 | -0.44861 | 0 |
| 55 | 0 | 1.5 / 0.33 / 0.3 / 0.4 | 1.4637 | -0.76373 | 0 |
| 60 | 0 | 1.5 / 0.33 / 0.3 / 0.4 | 1.8276 | -1.1276 | 0 |
| 65 | 0 | 1.5 / 0.33 / 0.3 / 0.4 | 2.2427 | -1.5427 | 0 |
| 70 | 0 | 1.5 / 0.33 / 0.3 / 0.4 | 2.7116 | -2.0116 | 0 |

Even the best 45-rpm geometry (D=1.5 m, rotor/D=.33, hc/D=.30, free=.40) has loading **0.879565**, above 0.70 by **0.179565**. It still has operating roots: rejection at 45 rpm is principally the required design margin, not numerical inability to find any root. At 50 rpm even the best grid loading is **1.148605**: flow exceeds that model's turning capacity and no governing operating root exists.

Maximum tip speed over the whole grid is **2.7489 m/s**, below **4.5 m/s**. The code imposes no independent invented power ceiling here. Source-range and qualification warnings are not hidden rejection gates in the conditional P1 path.

## 4. Hydraulic cause, not just the 20-rpm headline

Saved basis: RRBO continuous, wet NMP dispersed, 40°C; continuous viscosity **0.0598 Pa·s**, density **869 kg/m³**; dispersed viscosity **0.001416 Pa·s**, density **1015 kg/m³**; interfacial tension **0.011 N/m**. Continuous flow **0.0011111111 m³/s**, dispersed flow **0.00057077176 m³/s**. Gravity acts on the 146 kg/m³ density contrast; modeled NMP drops move downward against upward continuous RRBO.

The implemented chain is:

1. Power = 1.2 ρ n³ d_rotor⁵; ε = power/(ρ A hc).
2. d32 = C32 (σ/ρ)^0.6 ε^−0.4. More rotation therefore predicts smaller drops.
3. Terminal force balance with scenario-specific drag gives terminal speed. Smaller drops have less gravitational driving relative to viscous drag and settle more slowly.
4. Garthe characteristic multiplier converts terminal speed to vchar. In the representative fixed geometry the multiplier **also decreases** with RPM, although much less strongly than terminal speed. It does not rescue capacity.
5. The swarm law computes superficial swarm speed; slip = swarm/(1−φ). For r = jd/jc, total-flow capacity at a given φ is (1+r) × slip / [r/φ + 1/(1−φ)]. The model maximizes this curve over φ to obtain turning capacity.
6. Loading = (jc+jd)/capacity. Acceptance requires **all six** scenario lower branches and loading ≤0.70, plus tip speed ≤4.5 m/s.

### D=0.9 m, rotor/D=.33, hc/D=.30, free=.40

These are dimensionless ratios, **not a 0.33-m rotor**: actual rotor diameter is **0.297 m**, compartment height **0.27 m**. The table is the governing C32=.36/SN scenario, directly from the saved run.

| D m | rpm | d32 mm | ε W/kg | terminal m/s | Garthe factor | vchar m/s | capacity m/s | loading | φ operating | φ capacity | roots |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.9 | 30 | 4.9631 | 0.0020181 | 0.026544 | 1.3994 | 0.037146 | 0.0074339 | 0.35564 | 0.027774 | 0.16958 | 2 |
| 0.9 | 35 | 4.1249 | 0.0032046 | 0.019404 | 1.3701 | 0.026585 | 0.0051978 | 0.50863 | 0.041985 | 0.16640 | 2 |
| 0.9 | 40 | 3.5142 | 0.0047836 | 0.014630 | 1.3440 | 0.019663 | 0.0037807 | 0.69927 | 0.064452 | 0.16421 | 2 |
| 0.9 | 45 | 3.0510 | 0.0068110 | 0.011324 | 1.3206 | 0.014954 | 0.0028406 | 0.93072 | 0.11132 | 0.16268 | 2 |
| 0.9 | 50 | 2.6886 | 0.0093429 | 0.0089617 | 1.2993 | 0.011644 | 0.0021923 | 1.2059 | — | 0.16159 | 0 |
| 0.9 | 55 | 2.3981 | 0.012435 | 0.0072288 | 1.2799 | 0.0092523 | 0.0017305 | 1.5277 | — | 0.16079 | 0 |
| 0.9 | 60 | 2.1603 | 0.016145 | 0.0059277 | 1.2621 | 0.0074814 | 0.0013923 | 1.8988 | — | 0.16019 | 0 |
| 0.9 | 65 | 1.9625 | 0.020526 | 0.0049306 | 1.2457 | 0.0061420 | 0.0011386 | 2.3218 | — | 0.15973 | 0 |
| 0.9 | 70 | 1.7955 | 0.025637 | 0.0041527 | 1.2305 | 0.0051098 | 0.00094444 | 2.7993 | — | 0.15938 | 0 |

At this fixed geometry, 30→70 rpm increases ε by **12.704×**, reduces d32 from **4.9631 to 1.7955 mm**, terminal velocity from **0.026544 to 0.0041527 m/s**, and Garthe factor from **1.39939 to 1.23046**. Terminal velocity falls ~84.4%, factor ~12.1%, characteristic speed ~86.2%, and capacity ~87.3%. Thus the main loss is breakup/drag, reinforced rather than offset by the characteristic multiplier. Flow per cross-sectional area stays fixed while loading rises **0.35564→2.79927**.

40 rpm is barely admitted (loading **0.699272**, margin only **0.000728**). At 45 rpm the governing lower and upper roots are **0.111316** and **0.224917**, but loading **0.930717** violates the 0.70 policy. At 50 rpm loading **1.205931 > 1** and both roots are absent. This cleanly separates a loading-margin failure from a beyond-capacity no-root result.

Stored operating swarm/slip speeds at 30,35,40,45 rpm are respectively **0.033153/0.034100**, **0.022219/0.023193**, **0.014770/0.015787**, **0.008909/0.010025 m/s**; at 50–70 there is no operating root, so operating swarm speed is null, not zero. Tip speed at these representative RPMs rises only 0.4665→1.0886 m/s. Capacity holdup shifts modestly from 0.16958 to 0.15938; it is not a fixed imposed holdup.

### Why a larger diameter does not extend the accepted window to 50 rpm

At fixed geometry ratios and fixed RPM, rotor and compartment scale with D, so power scales as D⁵ and compartment volume as D³: **ε ∝ n³D²**, hence **d32 ∝ n^−1.2 D^−0.8**. Meanwhile applied superficial flow scales as **D^−2**. Larger D lowers applied flux but also increases breakup energy and reduces droplet size/settling capacity. Capacity cannot be assumed constant as area increases.

The actual saved 40-rpm comparison:

| D m | d32 mm | capacity m/s | jc+jd m/s | loading |
| --- | --- | --- | --- | --- |
| 0.3 | 8.4630 | 0.021389 | 0.023794 | 1.1124 |
| 0.6 | 4.8607 | 0.0076605 | 0.0059484 | 0.77651 |
| 0.9 | 3.5142 | 0.0037807 | 0.0026438 | 0.69927 |
| 1.2 | 2.7917 | 0.0022228 | 0.0014871 | 0.66904 |
| 1.5 | 2.3353 | 0.0014556 | 0.00095175 | 0.65383 |

Across D=.3→1.5 at 40 rpm the applied flux falls 25-fold, but the saved capacity falls **14.69-fold** (0.0213890→0.00145565 m/s). Loading improves only **1.70-fold** (1.11243→0.653833), not 25-fold. Enlargement does improve loading, enough to reach 40 rpm at D≥.9, but not enough for 45 rpm at any searched geometry. These are measured saved-model outcomes, not an extrapolated proof about D>1.5 m. The appendix includes the same five fixed ratios at every saved speed, including all six raw scenarios in the JSON.

## 5. Numerical audit: are roots really missing?

No hydraulic equations were rerun. We inspected the algorithm and checked all **20,412 stored scenario states**, including roots, continuation traces, residuals, and loading:

- **0** null operating holdups with loading <1.
- **0** null operating holdups despite nonempty saved operating-root arrays.
- **0** contradictions between loading >1 and an empty operating-root array.
- Separate reaggregation of saved pass/fail points found **zero mismatches** with all 378 stored window widths/counts, **zero disjoint accepted-window geometries**, and **zero stored continuation traces with decreasing lower holdup or holdup at/above the turning point**.
- **3847** admitted lower branches; **16565** no-root scenario states.
- Maximum absolute stored terminal force-balance residual **3.469446951953614e-18 N**.
- Maximum absolute stored operating slip-balance residual (non-null states) **1.1102230246251565e-16 m/s**.

The solver does **not** use one fixed φ bracket that assumes opposite endpoint signs. It samples 511 interior points on a 512-interval mesh, refines the highest capacity neighborhood with 60 ternary iterations, then explicitly inserts the refined peak into the root-search mesh. Every neighboring sign-changing interval is bisected (70 iterations). It keeps both operating roots and advances the lower root through 16 flow fractions, requiring monotone continuation below the turning holdup. Inserting the peak matters: two roots around a peak are not rejected merely because capacity−flow is negative at both outer endpoints.

There is additional algebraic support for the **governing SN** capacity maximum being genuine rather than a missed secondary peak. Let v be superficial swarm speed, F(v)=Cd(Re(v))v², and h=d log F/d log v. SN gives F(v)=a v+b v^1.687, so h=1+0.687z/(1+z), z∝v^0.687. As φ rises, v and h decrease. Capacity simplifies to (1+r)vφ/[r+(1−r)φ]; its stationary condition is

**h r(1−φ) = 4.65 φ[r+(1−r)φ].**

Here r≈0.513695<1. The left side decreases and right side increases on 0<φ<1, so this governing curve has a unique maximum. Thus the mesh+local refinement is not choosing the wrong one of multiple governing SN peaks. This is an algebraic check of the implemented equations, not a fresh numerical solve.

No stored evidence supports a false rejection from root bracketing, disconnected windows, or solver precision. Residual agreement establishes internal numerical consistency, not external validity of the correlations. This does not constitute an independent proof of global shape for every mobile-interface scenario; importantly, the SN bottleneck alone suffices to reject all higher-speed grid trials.

## 6. “Preference” in wording versus gate in current policy

There are two deliberately different ranking functions:

- The historical **rankSmallestGeometryGroups** comment/function says “preference”: if nothing meets it, return the widest feasible fallback, then smallest diameter among equal spans.
- Current **rankGeometryGroups** first calls that helper for comparison/frontier evidence, then **overrides selected** using only groups whose span is ≥20. It sorts their **distinct diameters**, selects index 1, and returns null if fewer than two exist. Therefore 20 remains *not a hydraulic criterion*, but is an effective **mandatory selection-eligibility gate** for final geometry.

The saved metadata still says RANKING_PREFERENCE_NOT_HYDRAULIC_LIMIT and some alternatives retain “fallback” wording. Those labels do not mean they can actually become a selected final diameter under the current no-fallback policy. This is a semantic distinction to clarify, not evidence of an accidental algorithmic defect: the earlier declared project report explicitly retained **second-smallest accepted adequate diameter after a fixed 20-rpm span, no fallback**, and tests explicitly require no Stage 4 geometry below that span.

“Next-smallest” means the second **distinct accepted adequate** diameter, not the next geometry row, and not blindly D+0.1 m through an infeasible gap. Here there is no first adequate diameter, let alone a second. Source evidence is cited below.

## 7. Conditional engineering screening is not physical qualification

The selected orientation uses **USER_APPROVED_CONDITIONAL_PREPILOT_P1**, **PREPILOT_EXTRAPOLATED_METHOD**, provisional saved 40°C properties, and modeled turning capacity, **not observed flooding**. Fixed Np=1.2 is an engineering power assumption separate from the Garthe source power-number expression. The C32 values are conditional Sauter-mean proxies, not a proven maximum-stable-drop law for this system.

Accepted trial rotor Reynolds numbers range **71.21–2373.77**; accepted scenario Eötvös numbers range **0.7071–26.5284**. In particular, some apparently admitted low-speed states have large deformation indicators and low rotor Re. Turbulent breakup, spherical-drop/drag applicability, actual interface mobility, inversion, entrainment and disengagement remain unqualified or unknown. These flags must not be rewritten as “safe”, but the approved P1 path does not secretly reject candidates on those flags. They therefore do not explain zero adequate windows and were not altered here.

The persisted opposite phase comparison has **90 adequate geometries**. It uses NMP continuous/RRBO dispersed and the comparison path, not the saved RRBO-continuous P1 physical basis. It cannot be substituted automatically, and is not an acceptable workaround for this result.

## 8. Policy options for an explicit user decision — nothing implemented

1. **Retain current policy:** no selected diameter is the correct saved result. Report the feasible narrow windows separately without presenting them as qualified designs.
2. **Consider making 20 rpm soft or reducing the required span:** this changes selection policy, not the hydraulic equations. Hypothetical arithmetic filtering of the existing stored windows (no new optimizer run) gives:

| hypothetical minimum span | smallest eligible D | second distinct eligible D |
| --- | --- | --- |
| 0 | 0.3 | 0.4 |
| 5 | 0.5 | 0.6 |
| 10 | 0.9 | 1 |
| 15 | none | none |
| 20 | none | none |

   In particular, **0.4 m** is only the hypothetical second diameter when even a **single accepted RPM point (zero span)** counts. It is not the current selection, a useful operating window, or a physically qualified recommendation. Making the historical fallback fully operative would instead favor the widest available 10-rpm span and smallest diameter on that span (**0.9 m**) before any newly defined second-diameter policy; “soft” must specify which fallback behavior is intended.
3. **Consider searching lower RPM while retaining ≥20 rpm adequacy:** accepted windows all touch the searched lower bound, so the current grid cannot establish their lower end. A future authorized lower-RPM search might widen them, but no lower-RPM results exist in this candidate, and the turbulent-breakup/shape assumptions may become less defensible there. No guarantee of a selected or qualified diameter follows. Public controls currently enforce 20 rpm; these options are not already available simply by editing a displayed number.

Neither relaxing the gate nor enlarging/searching outside the stored grid should be done without an explicit policy decision and appropriate physical qualification.

## 9. Full fixed-ratio representative sweep

Each row is the saved governing scenario at rotor/D=.33, hc/D=.30, free=.40. No recalculation.

| D m | rpm | d32 mm | ε W/kg | terminal m/s | Garthe factor | vchar m/s | capacity m/s | loading | φ operating | φ capacity | roots |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.3 | 30 | 11.952 | 0.00022423 | 0.093990 | 1.6242 | 0.15266 | 0.035284 | 0.67435 | 0.072826 | 0.19327 | 2 |
| 0.3 | 35 | 9.9337 | 0.00035607 | 0.074333 | 1.6295 | 0.12113 | 0.027230 | 0.87380 | 0.11126 | 0.18812 | 2 |
| 0.3 | 40 | 8.4630 | 0.00053151 | 0.059870 | 1.6303 | 0.097607 | 0.021389 | 1.1124 | — | 0.18364 | 0 |
| 0.3 | 45 | 7.3475 | 0.00075677 | 0.048944 | 1.6283 | 0.079697 | 0.017067 | 1.3942 | — | 0.17981 | 0 |
| 0.3 | 50 | 6.4749 | 0.0010381 | 0.040521 | 1.6246 | 0.065832 | 0.013813 | 1.7226 | — | 0.17656 | 0 |
| 0.3 | 55 | 5.7751 | 0.0013817 | 0.033922 | 1.6198 | 0.054949 | 0.011325 | 2.1010 | — | 0.17384 | 0 |
| 0.3 | 60 | 5.2025 | 0.0017938 | 0.028681 | 1.6144 | 0.046301 | 0.0093954 | 2.5325 | — | 0.17155 | 0 |
| 0.3 | 65 | 4.7261 | 0.0022807 | 0.024467 | 1.6084 | 0.039354 | 0.0078793 | 3.0198 | — | 0.16964 | 0 |
| 0.3 | 70 | 4.3239 | 0.0028485 | 0.021044 | 1.6022 | 0.033718 | 0.0066732 | 3.5656 | — | 0.16804 | 0 |
| 0.6 | 30 | 6.8648 | 0.00089692 | 0.044264 | 1.5342 | 0.067912 | 0.014330 | 0.41511 | 0.035125 | 0.17745 | 2 |
| 0.6 | 35 | 5.7054 | 0.0014243 | 0.033276 | 1.5126 | 0.050331 | 0.010314 | 0.57676 | 0.051836 | 0.17298 | 2 |
| 0.6 | 40 | 4.8607 | 0.0021260 | 0.025642 | 1.4921 | 0.038262 | 0.0076605 | 0.77651 | 0.079406 | 0.16964 | 2 |
| 0.6 | 45 | 4.2200 | 0.0030271 | 0.020183 | 1.4730 | 0.029730 | 0.0058452 | 1.0177 | — | 0.16714 | 0 |
| 0.6 | 50 | 3.7188 | 0.0041524 | 0.016182 | 1.4551 | 0.023547 | 0.0045643 | 1.3033 | — | 0.16526 | 0 |
| 0.6 | 55 | 3.3169 | 0.0055268 | 0.013186 | 1.4383 | 0.018965 | 0.0036357 | 1.6361 | — | 0.16383 | 0 |
| 0.6 | 60 | 2.9881 | 0.0071753 | 0.010898 | 1.4226 | 0.015504 | 0.0029463 | 2.0190 | — | 0.16273 | 0 |
| 0.6 | 65 | 2.7144 | 0.0091228 | 0.0091225 | 1.4078 | 0.012842 | 0.0024236 | 2.4544 | — | 0.16187 | 0 |
| 0.6 | 70 | 2.4834 | 0.011394 | 0.0077221 | 1.3938 | 0.010763 | 0.0020199 | 2.9449 | — | 0.16120 | 0 |
| 0.9 | 30 | 4.9631 | 0.0020181 | 0.026544 | 1.3994 | 0.037146 | 0.0074339 | 0.35564 | 0.027774 | 0.16958 | 2 |
| 0.9 | 35 | 4.1249 | 0.0032046 | 0.019404 | 1.3701 | 0.026585 | 0.0051978 | 0.50863 | 0.041985 | 0.16640 | 2 |
| 0.9 | 40 | 3.5142 | 0.0047836 | 0.014630 | 1.3440 | 0.019663 | 0.0037807 | 0.69927 | 0.064452 | 0.16421 | 2 |
| 0.9 | 45 | 3.0510 | 0.0068110 | 0.011324 | 1.3206 | 0.014954 | 0.0028406 | 0.93072 | 0.11132 | 0.16268 | 2 |
| 0.9 | 50 | 2.6886 | 0.0093429 | 0.0089617 | 1.2993 | 0.011644 | 0.0021923 | 1.2059 | — | 0.16159 | 0 |
| 0.9 | 55 | 2.3981 | 0.012435 | 0.0072288 | 1.2799 | 0.0092523 | 0.0017305 | 1.5277 | — | 0.16079 | 0 |
| 0.9 | 60 | 2.1603 | 0.016145 | 0.0059277 | 1.2621 | 0.0074814 | 0.0013923 | 1.8988 | — | 0.16019 | 0 |
| 0.9 | 65 | 1.9625 | 0.020526 | 0.0049306 | 1.2457 | 0.0061420 | 0.0011386 | 2.3218 | — | 0.15973 | 0 |
| 0.9 | 70 | 1.7955 | 0.025637 | 0.0041527 | 1.2305 | 0.0051098 | 0.00094444 | 2.7993 | — | 0.15938 | 0 |
| 1.2 | 30 | 3.9428 | 0.0035877 | 0.017936 | 1.2857 | 0.023061 | 0.0044764 | 0.33221 | 0.024916 | 0.16544 | 2 |
| 1.2 | 35 | 3.2769 | 0.0056971 | 0.012899 | 1.2543 | 0.016179 | 0.0030859 | 0.48190 | 0.038283 | 0.16319 | 2 |
| 1.2 | 40 | 2.7917 | 0.0085041 | 0.0096120 | 1.2269 | 0.011793 | 0.0022228 | 0.66904 | 0.059169 | 0.16172 | 2 |
| 1.2 | 45 | 2.4238 | 0.012108 | 0.0073759 | 1.2028 | 0.0088714 | 0.0016584 | 0.89674 | 0.099668 | 0.16072 | 2 |
| 1.2 | 50 | 2.1359 | 0.016610 | 0.0058004 | 1.1812 | 0.0068513 | 0.0012733 | 1.1679 | — | 0.16002 | 0 |
| 1.2 | 55 | 1.9051 | 0.022107 | 0.0046565 | 1.1617 | 0.0054097 | 0.0010011 | 1.4855 | — | 0.15952 | 0 |
| 1.2 | 60 | 1.7162 | 0.028701 | 0.0038045 | 1.1441 | 0.0043527 | 0.00080296 | 1.8520 | — | 0.15915 | 0 |
| 1.2 | 65 | 1.5590 | 0.036491 | 0.0031557 | 1.1280 | 0.0035595 | 0.00065506 | 2.2702 | — | 0.15888 | 0 |
| 1.2 | 70 | 1.4264 | 0.045577 | 0.0026520 | 1.1131 | 0.0029520 | 0.00054226 | 2.7424 | — | 0.15866 | 0 |
| 1.5 | 30 | 3.2982 | 0.0056057 | 0.013051 | 1.1942 | 0.015585 | 0.0029700 | 0.32045 | 0.023484 | 0.16308 | 2 |
| 1.5 | 35 | 2.7412 | 0.0089017 | 0.0092908 | 1.1627 | 0.010803 | 0.0020315 | 0.46849 | 0.036457 | 0.16144 | 2 |
| 1.5 | 40 | 2.3353 | 0.013288 | 0.0068748 | 1.1357 | 0.0078078 | 0.0014556 | 0.65383 | 0.056619 | 0.16040 | 2 |
| 1.5 | 45 | 2.0275 | 0.018919 | 0.0052495 | 1.1121 | 0.0058381 | 0.0010821 | 0.87957 | 0.094593 | 0.15971 | 2 |
| 1.5 | 50 | 1.7867 | 0.025952 | 0.0041136 | 1.0912 | 0.0044889 | 0.00082861 | 1.1486 | — | 0.15923 | 0 |
| 1.5 | 55 | 1.5936 | 0.034543 | 0.0032937 | 1.0726 | 0.0035328 | 0.00065022 | 1.4637 | — | 0.15889 | 0 |
| 1.5 | 60 | 1.4356 | 0.044846 | 0.0026858 | 1.0558 | 0.0028356 | 0.00052077 | 1.8276 | — | 0.15864 | 0 |
| 1.5 | 65 | 1.3041 | 0.057018 | 0.0022244 | 1.0405 | 0.0023144 | 0.00042437 | 2.2427 | — | 0.15846 | 0 |
| 1.5 | 70 | 1.1932 | 0.071214 | 0.0018671 | 1.0265 | 0.0019166 | 0.00035100 | 2.7116 | — | 0.15831 | 0 |

## 10. Source citations and deliverables

- **server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts:67–99**: properties, power/ε, d32, terminal drag, Garthe factor, swarm and capacity equations.
- **Same file:27–50,100–155**: bisection, log-speed swarm solve, mesh/refined peak, operating roots, 16-step continuation, residual outputs.
- **Same file:158–183**: governing worst capacity, unknown qualification flags, numerical assumptions, conditional screening limits.
- **server/ecr-pre-pilot/stage3-stage4-optimizer.ts:690–713**: conditional P1 admission and explicit rejection reasons.
- **Same file:395–406**: public minimum span fixed at 20 rpm.
- **Same file:980–1018**: historical smallest/widest fallback policy.
- **Same file:1078–1125**: current adequate-only second-distinct-diameter override, no fallback.
- **Same file:1170–1213**: fixed-geometry scan, contiguous runs, endpoint span.
- **Same file:1504–1515**: result policy text alongside historical preference wording.
- **tests/ecr-pre-pilot-stage3-ranking.test.ts:142–156,235–285**: preference/admission separation and second distinct diameter/gaps tests.
- **tests/ecr-pre-pilot-stage3-stage4-optimizer.test.ts:261–282**: expressly withholds Stage 4 geometry when no accepted diameter reaches 20 rpm.
- **deliverables/rrbo-stage3-candidate/report.md:9**: previously declared agreed policy; no claim here about approval beyond what that artifact and the persisted acceptance record state.
- **server/ecr-pre-pilot/p1-candidate-service.ts:75–103**: latest candidate ledger view, hash checks, stale detection, metadata versus result status.

Files:
- **report.md / report.html**: this investigation.
- **saved-evidence.json**: provenance, exact metadata/ranking, every geometry's stored window, and **45 complete representative trials including all 270 scenario states and continuation traces**.
- **all-rrbo-trials.csv**: all **3,402** RRBO trial governing summaries, not a new calculation.
- **build-report.mjs**: offline aggregation/report construction only; input was a transactionally exported snapshot in /tmp, not an optimizer input.

Limitations: latest saved state at inspection time; conclusions are bounded to saved controls and approved conditional model. No optimizer, hydraulic solve, tests that invoke optimization, workflow restart, or production-source/database changes were performed.
