# Corrected Project 236 Myint–Garthe Drop-Shape and Drag Recommendation

**Status:** final research recommendation for governance review  
**Scope:** frozen Project 236 property basis at 50 °C  
**Production impact:** none; no optimizer, resolver, production kernel, API, job, or historical record was changed

## Executive decision

The earlier research result contained three regressions and must not be accepted as written:

1. Project \(X\) is defined and remains
   \[
   X=\kappa=\frac{\mu_D}{\mu_C}=\frac{0.042}{0.00125}=33.6.
   \]
2. The previously recovered Garthe Eq. 5.6/5.7 and Eq. 8.3 remain qualified project evidence. The rendered Eq. 8.3 contains the square root over the complete product.
3. Garthe Eq. 8.3 must not be replaced by a terminal-velocity-plus-hindrance shortcut.

After correction, the Myint–Hosokawa–Tomiyama papers provide a materially useful but bounded result:

- Myint 2006 supplies a liquid–liquid \(C_D(Re,\kappa,\text{interface})\) relation validated through \(Re<200\), including high viscosity ratios up to \(\kappa=100\).
- Myint 2007 supplies a clean-drop aspect-ratio relation covering the Project Morton number and viscosity ratio.
- On the frozen Project 236 basis, the Myint terminal-drag range reaches approximately \(d=2.975\) mm on the clean branch and \(d=2.984\) mm on the fully contaminated branch.
- Therefore the existing arbitrary \(Re_t\le 50\) cutoff is not a physical deformation boundary and can be replaced, after separate implementation approval, by the actual published Myint applicability gates.
- The combined route is suitable for a controlled **pre-pilot extrapolated diagnostic**, not a governed/release hydraulic design result.

The remaining release blocker is now narrow: neither Myint paper directly validates its isolated-terminal-drop drag curve at the forced characteristic and swarm-slip states of an agitated Kühni compartment. Direct RRBO/NMP validation is not required to run the pre-pilot diagnostic, but release eligibility remains fail-closed.

## Frozen Project basis

\[
\rho_C=1006\ {\rm kg\,m^{-3}},\quad
\rho_D=862\ {\rm kg\,m^{-3}}
\]

\[
\mu_C=0.00125\ {\rm Pa\,s},\quad
\mu_D=0.042\ {\rm Pa\,s},\quad
\sigma=0.0106\ {\rm N\,m^{-1}}
\]

\[
\kappa=\frac{\mu_D}{\mu_C}=33.6,\qquad
P=\frac{\rho_D}{\rho_C}=0.8568588469
\]

\[
Mo=\frac{g\mu_C^4(\rho_C-\rho_D)}
{\rho_C^2\sigma^3}
=2.8602873308\times10^{-9},
\qquad \log_{10}Mo=-8.5436.
\]

This report deliberately does not mix the frozen 50 °C audit basis with later Project 236 input revisions.

## Governing equations

### Dimensionless groups

\[
Re=\frac{\rho_C U d}{\mu_C},\qquad
Eo=\frac{(\rho_C-\rho_D)gd^2}{\sigma}
\]

\[
We=\frac{\rho_CU^2d}{\sigma},\qquad
Ta=Re\,Mo^{0.23}.
\]

At terminal force balance, using the volume-equivalent spherical reference area,

\[
C_D Re^2=\frac43\sqrt{\frac{Eo^3}{Mo}}.
\]

### Myint 2006 liquid-drop drag

For a clean or partially contaminated liquid drop,

\[
C_D(Re,\kappa,\Lambda)=
\frac{8(2+3\kappa+3\Lambda)}
{Re(1+\kappa+\Lambda)}
\times\left(1+0.15Re^{0.687}\right),
\]

where \(\Lambda=C/\mu\) is the paper's interfacial-retardation term. The source limits are

\[
-11.6<\log_{10}Mo<-0.9,\quad
0.17<Re<200,\quad
0.017<Eo<12.1,\quad
0.1<\kappa<100.
\]

The two controlled bounding branches are:

**Clean**

\[
\Lambda=0,\qquad
C_{D,\rm clean}=
\frac{8(2+3\kappa)}{(1+\kappa)Re}
\times\left(1+0.15Re^{0.687}\right).
\]

**Fully contaminated**

\[
\Lambda\rightarrow\infty,\qquad
C_{D,\rm contaminated}=
\frac{24}{Re}\left(1+0.15Re^{0.687}\right).
\]

At \(\kappa=33.6\), the clean prefactor is

\[
A_{\rm clean}=\frac{8(2+3\kappa)}{1+\kappa}
=23.76878613
\]

versus \(A_{\rm contaminated}=24\). The prefactors differ by only 0.9634%.

The source reports approximately 10% maximum terminal-velocity error over its stated envelope. It also concludes that initial deformation does not create terminal-velocity scatter for its liquid drops because the shape oscillation is strongly damped. This makes Eq. 9 a deformation-tolerant empirical terminal-drop relation over its tested \(Eo\) range, but not an explicit \(C_D(Re,E,\kappa)\) shape multiplier.

### Myint 2007 clean-drop shape

\[
E=\frac{\text{minor axis}}{\text{major axis}}
=1-0.0487Ta-0.0289Ta^2.
\]

The source limits are

\[
-11.6\le\log_{10}Mo\le-0.9,
\quad 0.015\le Re\le850,
\]

\[
0.017\le Eo\le9.3,\quad
0.0074\le Ta\le3.6,\quad
0.1\le\kappa\le100.
\]

This is a clean, isolated, terminal-drop shape correlation. It must not be multiplied into the Myint drag equation as an invented correction.

### Wellek contaminated-drop shape sensitivity

For non-oscillating contaminated drops,

\[
E_{\rm Wellek}=
\frac{1}{1+0.163Eo^{0.757}}.
\]

Wellek provides shape only and does not replace the Myint drag equation.

### Garthe Eq. 5.6/5.7

The recovered Kühni characteristic-velocity relation remains:

\[
\frac{v_{\rm char,0}}{v_0}
=1-1.669N_P^{-3.945}
-2.807\left(\frac{d}{D_C-d_A}\right)^{1.336}
-1.159\left(\frac{h_C}{D_C}\right)^{2.049}
+2.1\phi_s^{1.032},
\]

with

\[
N_P=1.08+\frac{10.94}{Re_R^{0.5}}
+\frac{257.37}{Re_R^{1.5}},
\qquad
Re_R=\frac{n_Rd_A^2\rho_C}{\mu_C}.
\]

### Garthe Eq. 8.3

The rendered thesis page is authoritative:

\[
\boxed{
\frac{v_s}{v_{\rm char,0}}
=
\sqrt{
\frac{C_{D,0}(Re_{\rm char})}
{C_{D,0}(Re_s)}
(1-h_D)^{4.65}
}
}
\]

The plain-text extraction omits the radical; that extraction defect does not invalidate the rendered source evidence.

## Exact Myint–Garthe compatibility

Write the Myint drag equation as

\[
C_D(Re)=
A(\kappa,\Lambda)
\times\frac{1+0.15Re^{0.687}}{Re}.
\]

If the same interfacial state applies at the characteristic and swarm states, \(A\) cancels exactly:

\[
\frac{C_D(Re_{\rm char})}{C_D(Re_s)}
=
\frac{Re_s}{Re_{\rm char}}
\frac{1+0.15Re_{\rm char}^{0.687}}
{1+0.15Re_s^{0.687}}.
\]

Therefore Garthe Eq. 8.3 becomes

\[
\boxed{
\frac{v_s}{v_{\rm char,0}}
=
\sqrt{
\frac{Re_s}{Re_{\rm char}}
\frac{1+0.15Re_{\rm char}^{0.687}}
{1+0.15Re_s^{0.687}}
(1-h_D)^{4.65}
}
}
\]

with

\[
Re_{\rm char}=\frac{\rho_Cv_{\rm char,0}d}{\mu_C},
\qquad
Re_s=\frac{\rho_Cv_sd}{\mu_C}.
\]

This is mathematically compatible with the existing Garthe iteration. It does not silently replace the swarm model.

The cancellation is also important physically: uncertainty between the clean and fully contaminated Myint drag prefactors has negligible effect on terminal velocity at \(\kappa=33.6\), and no effect on the Eq. 8.3 drag ratio if the interface state is unchanged between the two local states.

## Project 236 numerical map

The table below solves terminal force balance with the Myint clean branch; the contaminated branch is in the accompanying CSV and differs only slightly.

| \(d\), mm | \(Eo\) | \(Re_t\) | \(C_D\) | \(U_t\), m/s | \(We_t\) | \(Ta_t\) | Myint \(E\) | Drag gate | Shape gate |
|---:|---:|---:|---:|---:|---:|---:|---:|:---:|:---:|
| 0.50 | 0.0333 | 4.487 | 7.525 | 0.01115 | 0.00590 | 0.0486 | 0.9976 | PASS | PASS |
| 1.00 | 0.1332 | 22.451 | 2.405 | 0.02790 | 0.07386 | 0.2433 | 0.9864 | PASS | PASS |
| 1.47 | 0.2879 | 50.379 | 1.517 | 0.04258 | 0.25299 | 0.5460 | 0.9648 | PASS | PASS |
| 1.75 | 0.4080 | 71.557 | 1.269 | 0.05081 | 0.42873 | 0.7756 | 0.9448 | PASS | PASS |
| 2.00 | 0.5329 | 93.153 | 1.118 | 0.05787 | 0.63574 | 1.0097 | 0.9214 | PASS | PASS |
| 2.50 | 0.8326 | 143.585 | 0.9188 | 0.07136 | 1.20835 | 1.5563 | 0.8542 | PASS | PASS |
| 3.00 | 1.1990 | 203.216 | 0.7926 | 0.08417 | 2.01702 | 2.2026 | 0.7525 | **FAIL \(Re\)** | PASS |
| 4.00 | 2.1316 | 348.478 | 0.6389 | 0.10825 | 4.44844 | 3.7770 | 0.4038 | FAIL | **FAIL \(Ta\)** |
| 5.00 | 3.3306 | 526.486 | 0.5467 | 0.13084 | 8.12305 | 5.7064 | nonphysical extrapolation | FAIL | FAIL |

The exact clean-branch \(Re=200\) boundary is

\[
d=2.97482\ {\rm mm},\quad Eo=1.17896,\quad
Ta=2.16773,\quad E=0.75863.
\]

The contaminated-branch \(Re=200\) boundary is \(d=2.98444\) mm.

The Myint clean shape equation itself reaches \(Ta=3.6\) near \(d=3.8981\) mm on the clean drag trajectory, but the stricter Myint 2006 drag gate has already failed at approximately 2.98 mm.

Thus:

- the old \(Re_t=50\) cutoff near \(d=1.47\) mm is not supported as a deformation boundary;
- significant but source-covered deformation exists above that point;
- the evidence-based terminal-drag boundary is \(Re_t<200\), approximately \(d<2.98\) mm for this property basis.

The complete clean and contaminated results are in:

- `project236-myint-closure-map.csv`
- `project236-myint-terminal-map.csv` for comparison against the archived Barry trajectory.

## Terminal, characteristic, and swarm state disposition

| State | Numerical status | Source status |
|---|---|---|
| Free terminal | Fully mapped on 0.5–5 mm grid using Myint force-balance roots | Source-supported for isolated stagnant-liquid drops inside all Myint 2006 gates |
| Kühni characteristic | Exact mapping equation retained through Garthe Eq. 5.6/5.7; \(Re_{\rm char}\) must be checked against Myint gates for each trial | Using Myint \(C_D(Re)\) here is pre-pilot extrapolation from terminal single-drop data |
| Swarm slip | Exact implicit Eq. 8.3 retained; Myint prefactor cancellation shown above; \(Re_s\) must be checked at every root | Pre-pilot extrapolation; no direct RRBO/NMP agitated-swarm validation |

No frozen 50 °C persisted Project 236 record containing a unique \(v_{\rm char,0}\), \(h_D\), and \(v_s\) was found. Those numbers are therefore not invented, borrowed from a different property basis, or regenerated by running the prohibited diameter/RPM optimizer.

## Proposed governed decision logic

Proposed identifier:

`MYINT_GARTHE_PREPILOT_CLOSURE_V1.0.0`

Proposed result classification:

`CALCULATED_EXTRAPOLATED / PRE_PILOT_DIAGNOSTIC / NOT_RELEASE_ELIGIBLE`

1. Bind the closure to the exact Stage‑1 property snapshot and calculate \(Mo\) and \(\kappa\); never reinterpret Project \(X\).
2. Evaluate the clean and fully contaminated Myint drag branches. Do not fit or assume an intermediate \(\Lambda\).
3. Solve terminal force balance using Myint Eq. 9.
4. For clean shape, evaluate Myint 2007 Eq. 14 at the terminal state. For contaminated shape sensitivity, evaluate Wellek separately.
5. Do not introduce a shape multiplier into Myint drag.
6. Calculate \(v_{\rm char,0}\) only through the existing Garthe Eq. 5.6/5.7 architecture.
7. Solve \(v_s\) and \(h_D\) through the existing square-root Eq. 8.3 architecture.
8. At terminal, characteristic, and swarm roots, enforce the local Myint 2006 \(Re\) gate and the diameter-based \(Eo\) gate. For the clean shape diagnostic also enforce the local \(Ta\) and Myint 2007 gates.
9. Require one unchanged interface-state branch across the two \(C_D\) evaluations in a single Eq. 8.3 ratio. If a branch change is asserted, fail closed because the prefactor no longer cancels.
10. If any required state is outside the published range, return an explicit dependency hold; do not clip \(Re\), \(Ta\), \(E\), or diameter.

## What this recommendation permits

- Replace the unsupported \(Re_t\le50\) research cutoff with source-declared applicability gates in a future, separately approved pre-pilot diagnostic revision.
- Evaluate finite terminal, characteristic, and swarm roots under explicit extrapolation labels.
- Report clean/contaminated terminal sensitivity and a local shape diagnostic.
- Continue diagnostic diameter/RPM-envelope research without claiming final operating RPM or release sizing.

## What it does not permit

- No production-kernel or optimizer change from this research result alone.
- No governed geometry selection, final diameter, final RPM, mass transfer, efficiency, stage count, active height, or release result.
- No claim that Myint 2007 shape is an explicit drag correction.
- No use beyond \(Re=200\) under the Myint 2006 drag qualification.
- No transfer of this 50 °C assessment to a different temperature/property snapshot without a complete re-evaluation.

## Remaining genuine physical blocker

For **pre-pilot diagnostic execution**, no additional RRBO/NMP experiment is mandatory. The source-backed range gates and extrapolation labels are sufficient to define a reproducible research closure.

For **governed/release hydraulic sizing**, the remaining blocker is:

> An independently qualified liquid–liquid validation of \(C_D(Re)\) at the nonterminal characteristic and swarm-slip states, including confirmation that the interfacial condition remains on one consistent branch through the Eq. 8.3 ratio.

This may be resolved by either:

1. direct RRBO/NMP single-drop and swarm measurements over the active local \(Re\), \(Eo\), and holdup envelope; or
2. an independently validated liquid–liquid DNS/experimental constitutive relation demonstrated at \(\kappa\approx33.6\), \(Mo\approx2.86\times10^{-9}\), and arbitrary supplied slip \(Re\).

If the calculated terminal or local state exceeds \(Re=200\), there is an additional immediate evidence blocker even for this Myint-based route.

## Final recommendation

**Accept with restrictions for pre-pilot governance review.**

The Myint 2006 drag relation plus the Myint 2007/Wellek shape diagnostics is the strongest reproducible closure found for Project 236. It is compatible with—rather than a replacement for—the qualified Garthe Eq. 8.3 architecture. It supports replacing the unsupported \(Re_t\le50\) cutoff with a real \(Re<200\) evidence gate and extends the source-covered terminal diameter to approximately 2.98 mm at the frozen 50 °C basis.

Do not promote the result to governed/release hydraulic sizing until the nonterminal characteristic/swarm validation blocker is resolved.

## Sources

- [Garthe thesis, Eq. 5.6/5.7 and rendered Eq. 8.3](https://mediatum.ub.tum.de/601973)
- [Myint, Hosokawa & Tomiyama 2006, liquid-drop drag](https://doi.org/10.1299/jfst.1.72)
- [Myint, Hosokawa & Tomiyama 2007, liquid-drop shape](https://doi.org/10.1299/jfst.2.184)
- [Wellek, Agrawal & Skelland 1966, drop shape](https://doi.org/10.1002/aic.690120506)
- [Barry & Parlange 2018, spherical-fluid drag](https://pmc.ncbi.nlm.nih.gov/articles/PMC5901779)
- [Grace, Wairegi & Nguyen 1976](https://jlc.jst.go.jp/DN/JALC/00292339765?from=CiNii)
- [Thorsen, Stordalen & Terjesen 1968](https://www.sciencedirect.com/science/article/pii/0009250968870174)
- [Loth 2008](https://www.sciencedirect.com/science/article/abs/pii/S0301932207001711)
- [Liu, Tang & Quan 2013](https://doi.org/10.1016/j.compfluid.2013.03.022)
- [Adinata 2011 ReDrop dissertation](http://publications.rwth-aachen.de/record/64211/files/3738.pdf)
- [Zhang et al. 2019 low-interfacial-tension study](https://www.sciencedirect.com/science/article/abs/pii/S0263876219303065)
- [Dandy & Leal 1989](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/buoyancydriven-motion-of-a-deformable-drop-through-a-quiescent-liquid-at-intermediate-reynolds-numbers/A22A01E99BD5B969174A4F2AF9C460BF)
- [Taylor & Acrivos 1964](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/on-the-deformation-and-drag-of-a-falling-viscous-drop-at-low-reynolds-number/796C11570B8A109A0C65F9E7304DC1D8)
- [Gomes & Stichlmair 2006](https://doi.org/10.1021/ie051453l)
- [Weber et al. 2019](https://doi.org/10.1002/cite.201900057)

Full source descriptions, roles, and limitations are recorded in `sources.json`.