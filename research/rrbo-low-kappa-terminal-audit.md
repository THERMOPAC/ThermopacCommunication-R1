# RRBO low-\(\kappa\) terminal/drop-slip audit

**Scope:** Stage 3 scientific qualification only.  This audit does not change the
application, Stage 1 inputs, Stage 2 equilibrium results, or Stage 4 sizing.  A
number returned by a correlation below is a sensitivity result, not validation of
the RRBO/NMP system.

**Question:** Can a terminal/drop-slip correlation be justified for the persisted
fresh-property state
\[
\kappa=\mu_D/\mu_C=0.023678929765886286
\]
when the Myint et al. liquid-drop experiments state a lower empirical bound of
\(\kappa=0.1\)?

## Executive decision

There is no source-validated finite-\(Re\), deformation- and interface-aware
liquid-drop closure at the actual state.  The state is not rejected because
\(\kappa<0.1\) makes the equations singular; it is rejected because the
primary finite-\(Re\) drop evidence does not cover that ratio, and the actual
drop is falling rather than rising through a quiescent liquid.

The most defensible qualification is a **conditional terminal sensitivity
envelope**:

1. **Myint--Levich--Schiller--Naumann clean branch:** a physically continuous
   low-\(\kappa\) continuation of the published relation, with
   \(\chi=C/\mu_C=0\).  It reproduces the persisted \(Re_t=2.4045\), but this
   is an extrapolation below the stated \(\kappa=0.1\) data boundary, not an
   admitted correlation.
2. **Fully immobilized/contaminated branch:** \(\chi\rightarrow\infty\), which
   is the rigid-sphere Schiller--Naumann limit.  It is a useful interface-state
   sensitivity and model envelope, not a measured upper bound for this
   formulation.
3. **Hadamard--Rybczynski:** an exact clean spherical creeping-flow anchor for
   all positive \(\kappa\), but not applicable as a finite-\(Re\) terminal
   prediction at the present \(Re\).
4. **Barry--Parlange:** the strongest zero-fit, all-viscosity-ratio,
   Reynolds-dependent candidate if a separate shape gate confirms a steady
   sphere.  The actual \(Eo\), \(We\), and unknown interface state do not yet
   establish that gate.

Thus, the next numerical work may report the clean/contaminated envelope and a
Barry spherical comparator as `CALCULATED_EXTRAPOLATED`.  It must not call
agreement among those numerical values validation, and it must not use a
terminal curve as a drop-slip closure at forced characteristic or swarm
velocities.

## 1. Actual persisted state and signed force balance

The current Stage 1 property record is the fresh \(40^\circ{\rm C}\) state:

| quantity | value |
|---|---:|
| continuous density \(\rho_C\) | \(869\ {\rm kg\,m^{-3}}\) |
| dispersed density \(\rho_D\) | \(1015\ {\rm kg\,m^{-3}}\) |
| continuous viscosity \(\mu_C\) | \(0.0598\ {\rm Pa\,s}\) |
| dispersed viscosity \(\mu_D\) | \(0.001416\ {\rm Pa\,s}\) |
| interfacial tension \(\sigma\) | \(0.011\ {\rm N\,m^{-1}}\) |
| representative diameter \(d_{32}\) | \(0.0047457123\ {\rm m}\) |
| viscosity ratio \(\kappa=\mu_D/\mu_C\) | \(0.023678929765886286\) |
| density ratio \(P=\rho_D/\rho_C\) | \(1.16800920598\) |
| signed density difference \(\Delta\rho=\rho_C-\rho_D\) | \(-146\ {\rm kg\,m^{-3}}\) |

Take \(+z\) upward and \(w=u_D-u_C\) as the signed dispersed-phase
velocity relative to the continuous phase.  With the standard volume-equivalent
diameter and spherical projected area,
\[
 V=\frac{\pi d^3}{6},\qquad A_p=\frac{\pi d^2}{4},
\]
the isolated terminal balance is
\[
0=(\rho_C-\rho_D)Vg-\frac12\rho_C C_D A_p|w|w,
\]
or
\[
 C_D|w|w
 =\frac{4}{3}\frac{\rho_C-\rho_D}{\rho_C}gd. \tag{1}
\]
Therefore \(w<0\) for this record: the denser dispersed phase falls.  A speed
magnitude may be introduced only after retaining this sign:
\[
 C_D |w|^2
 =\frac{4}{3}\frac{|\Delta\rho|}{\rho_C}gd. \tag{2}
\]

The dimensionless magnitudes used by the primary sources are
\[
 Re=\frac{\rho_C|w|d}{\mu_C},\qquad
 Eo=\frac{|\Delta\rho|gd^2}{\sigma},\qquad
 Mo=\frac{g\mu_C^4|\Delta\rho|}{\rho_C^2\sigma^3},
 \]
\[
 We=\frac{\rho_C|w|^2d}{\sigma},\qquad
 Ta=Re\,Mo^{0.23},\qquad
 Ar=\frac{\rho_C^2|\Delta\rho|gd^3}{\mu_C^2}.
\]
They satisfy
\[
 Ar=\sqrt{\frac{Eo^3}{Mo}},\qquad
 We=Re^2\sqrt{\frac{Mo}{Eo}},\qquad
 C_DRe^2=\frac43 Ar. \tag{3}
\]

At the persisted \(d_{32}\), using the supplied terminal root for reference:

| group | value | qualification consequence |
|---|---:|---|
| \(Re_t\) | \(2.4045\) | inside Myint 2006 terminal range \(0.17<Re<200\) |
| \(Eo\) | \(2.93146\) | inside Myint 2006 range \(0.017<Eo<12.1\); inside Myint 2007 shape range \(Eo\le9.3\) |
| \(Mo\) | \(0.0182163\), \(\log_{10}Mo=-1.73954\) | inside Myint stated \(-11.6<\log_{10}Mo<-0.9\) |
| \(Ar\) | \(37.18734\) | \(N_f=\sqrt{Ar}=6.09814\) |
| \(We\) at \(Re_t\) | \(0.45576\) | not a declared \(We\ll1\) spherical gate; shape must be assessed |
| \(Ta\) at \(Re_t\) | \(0.95704\) | inside Myint 2007 clean-shape \(0.0074\le Ta\le3.6\) |
| \(\kappa\) | \(0.0236789\) | below the Myint 2006/2007 empirical lower bound \(0.1\) by a factor of \(4.22\) |

The important result is therefore **one failed source gate, not a failed
algebraic calculation**: \(Re\), \(Eo\), \(Mo\), \(We\), and \(Ta\) are in or
near the published envelopes, while the actual viscosity ratio is outside the
finite-\(Re\) drop data.

## 2. Hadamard--Rybczynski: exact limiting anchor, not the present closure

For a clean, spherical fluid sphere in creeping flow, Hadamard and Rybczynski
give
\[
 C_D^{HR}(Re,\kappa)
 =\frac{8}{Re}\left(\frac{2+3\kappa}{1+\kappa}\right). \tag{4}
\]
The limits are
\[
\kappa\to0:\ C_D=16/Re,\qquad
\kappa\to\infty:\ C_D=24/Re.
\]
The latter is Stokes drag on a rigid sphere.  Barry and Parlange explicitly
identify Eq. (4) as the exact small-\(Re\) result for all viscosity ratios
(PLOS ONE 13, Eq. 3); Myint et al. reproduce it as Eq. (4), pp. 72--81.

For the actual ratio,
\[
f_\kappa=\frac{2+3\kappa}{1+\kappa}=2.0231312075,\qquad
K_{HR}=8f_\kappa=16.18504966.
\]
Combining (4) with (3) gives the creeping-limit terminal estimate
\[
 Re_{t,HR}=\frac{4Ar}{3K_{HR}}
 =\frac{Ar}{6f_\kappa}=3.06351,
\]
\[
 |w|_{t,HR}=\frac{\mu_C Re_{t,HR}}{\rho_Cd}
 =0.04442\ {\rm m\,s^{-1}}. \tag{5}
\]
This estimate has \(Re\approx3.06\), not \(Re\ll1\), and the actual \(Eo\)
is \(2.93\).  It is consequently an asymptotic check only.  It cannot be
used to assert a terminal speed for the actual falling drop.

The exact H--R result is direction-symmetric in an ideal infinite,
quiescent, Newtonian, spherical problem: reversing the signed buoyancy
reverses \(w\), while \(|w|\), \(Re\), and \(C_D\) remain the same.  That
symmetry does not qualify a falling experiment from a rising experiment once
shape, surfactant transport, walls, drop history, or background agitation
enters.

## 3. Myint--Levich finite-\(Re\) candidate and the \(\kappa\) gap

Myint, Hosokawa and Tomiyama (2006) measured single drops **rising** through
infinite stagnant liquids.  Their definitions use a sphere-volume-equivalent
diameter and \(Re=\rho_CV_Td/\mu_C\).  The primary paper gives:

* H--R Eq. (4), reproduced above;
* Levich's low-\(Re\) interface-retardation form
  \[
  C_D=\frac{8}{Re}
  \left(\frac{2+3\kappa+3\chi}{1+\kappa+\chi}\right),\qquad
  \chi=C/\mu_C; \tag{6}
  \]
* the finite-\(Re\) drop relation used by Myint et al. (their Eq. (9)):
  \[
  C_D^{M}(Re,\kappa,\chi)
  =\frac{8(2+3\kappa+3\chi)}
  {Re(1+\kappa+\chi)}
  \left(1+0.15Re^{0.687}\right). \tag{7}
  \]

For a nominally clean interface, \(\chi=0\):
\[
 C_{D,\mathrm{clean}}^{M}
 =\frac{8(2+3\kappa)}
 {Re(1+\kappa)}
 \left(1+0.15Re^{0.687}\right). \tag{8}
\]
For a fully immobilized/contaminated interface, \(\chi\to\infty\):
\[
 C_{D,\mathrm{immob}}^{M}
 =\frac{24}{Re}\left(1+0.15Re^{0.687}\right), \tag{9}
\]
the Schiller--Naumann rigid-sphere expression.  At fixed \(Re\), the factor in
(7) increases monotonically with \(\chi\), but this is only an envelope of the
model's interface parameter.  It is not a universal bound when a different
shape or contamination transport state changes the drop.

### What the source actually validates

Myint et al. report the combination of Levich and Schiller--Naumann as giving
good \(C_D\) and terminal-velocity estimates for
\[
-11.6<\log_{10}M<-0.9,\quad
0.17<Re<200,\quad
0.017<Eo<12.1,\quad
0.1<\kappa<100.
\]
The paper reports approximately 10% maximum terminal-velocity error over that
set.  Their clean and fully contaminated data are rising-drop data; the
contaminated examples include \(\kappa=0.4,\ 0.9,\ 31.5\), not
\(\kappa=0.02368\).  Equation (7) is therefore algebraically evaluable here
but not empirically qualified at the actual \(\kappa\), and the 10% statement
must not be carried below \(\kappa=0.1\).

### Actual-condition numerical sensitivities

Solving (3) with (8) at the actual \(Ar=37.18734\) gives
\[
 Re_{t,\mathrm{clean\ continuation}}=2.40452,\qquad
 |w|=0.0348664\ {\rm m\,s^{-1}},\qquad
 C_D=8.57588.
\]
This is the persisted \(Re_t=2.4045\) to rounding.  It demonstrates that the
persisted root is the clean Myint algebraic continuation; it does **not**
demonstrate that the continuation is correct below the source's \(\kappa=0.1\)
gate.

For comparison, applying the fully immobilized branch (9) gives
\[
 Re_{t,\mathrm{immob}}=1.69912,\qquad
 |w|=0.0246379\ {\rm m\,s^{-1}},\qquad
 C_D=11.5821.
\]
At a common \(Re\), the clean-to-immobilized \(K/Re\) coefficient ratio is
\(24/16.18505=1.48285\).  The terminal-speed ratio of the two finite-\(Re\)
roots is \(1.415\).  These are useful uncertainty sensitivities to interfacial
state, not a claim that the actual interface is either clean or fully
immobilized.

## 4. Barry--Parlange: conditional spherical drop-slip candidate

Barry and Parlange (2018) provide the best located analytic, zero-fit,
arbitrary-\(Re\) candidate for a **spherical** fluid drop, bubble, or particle.
Their PLOS ONE Eq. (10), PDF p. 4/10, is
\[
C_D =
\frac{48}{Re(1+X)}\left(1+\frac{3X}{2}\right)
\frac{\sqrt{Re}+AZ+\tau e^{-\lambda\sqrt{Re}}}
{\displaystyle\frac{\sqrt{Re}}{1+X}+3AZ+
3\tau e^{-\omega\sqrt{Re}}}, \tag{10}
\]
where \(X=\mu_D/\mu_C\), \(P=\rho_D/\rho_C\), and
\[
Z=1+
\frac{(\alpha-2)\sqrt{XP}+(\beta-1)XP}
{(1+\sqrt{XP})^2},\qquad
 \alpha=2.5891,\quad \beta=0.9879,
\]
\[
A=\frac25\sqrt{\frac2\pi}(6\sqrt3+5\sqrt2-14)
=1.10534862862,
\]
\[
\lambda\tau=1,\qquad
\omega\tau=\frac{1}{3(1+X)},\qquad
\tau(\tau+AZ)=\frac89\frac{4+3X}{1+X}. \tag{11}
\]
The positive root for \(\tau\) is used.

The paper states that the expression is for one spherical particle in an
otherwise quiescent, infinite homogeneous liquid, with no interphase mass
transfer, and assumes sufficient surface tension to preserve a steady,
non-oscillating sphere.  It is described as valid to Reynolds numbers of a few
hundred; comparisons include approximately \(Re\le200\).  The authors
explicitly note that the equation does not cover oscillating or wobbling
particles.  It has no contamination parameter.

With the actual \(X=\kappa\) and \(P=1.1680092\),
\[
Z=1.07177665,\quad \tau=1.37891638,\quad
\lambda=0.72520714,\quad\omega=0.23614407.
\]
The spherical terminal solve gives
\[
Re_{t,\mathrm{Barry}}=2.52872,\qquad
|w|=0.0366675\ {\rm m\,s^{-1}},\qquad C_D=7.75409.
\]
The difference from the clean Myint continuation is about 5.2% in terminal
speed.  That numerical proximity is not validation: the two relations have
different assumptions, and Barry's equation does not model deformation or
contamination.

**Admission decision:** Barry is admitted to the research model set as a
**conditional generic spherical terminal closure**, rather than being
relegated to an unqualified sensitivity formula.  That admission is
conditional on all of the following:

1. the actual fluid ratios \(X=\mu_D/\mu_C\) and \(P=\rho_D/\rho_C\) are used;
2. the local drop is a steady, spherical, non-wobbling fluid sphere, with no
   unmodelled mass transfer; and
3. the same spherical state remains valid at every forced-slip Reynolds number
   at which the relation is called (characteristic and swarm states included).

This is a **generic conditional route**, not an assertion that the present
RRBO/NMP drop passes the gate.  The current \(Eo=2.93146\), unknown
low-\(\kappa\) interface state, and falling rather than rising source
evidence do not establish those assumptions.  Until they do, Barry's value
remains `CALCULATED_EXTRAPOLATED` sensitivity for this record.  Even after a
terminal spherical gate passes, Barry alone does not close the drop
population, nonterminal Kühni slip, holdup, or flooding.

## 5. Shape and contamination audit at the actual state

The available shape relations are not interchangeable drag laws.

### Myint 2007 clean-drop shape relation

Myint, Hosokawa and Tomiyama (2007) define
\[
E=\frac{b_1+b_2}{2a},\qquad
\gamma=\frac{2b_2}{b_1+b_2},\qquad
Ta=Re\,Mo^{0.23}.
\]
Their clean-drop fit (Eq. (14), pp. 184--195) is
\[
E=1-0.0487Ta-0.0289Ta^2, \tag{12}
\]
with stated range
\[
-11.6\le\log_{10}Mo\le-0.9,\quad
0.015\le Re\le850,\quad
0.017\le Eo\le9.3,\quad
0.0074\le Ta\le3.6,\quad
0.1\le\kappa\le100.
\]
The actual \(Mo,Re,Eo,Ta\) are inside these ranges, but actual \(\kappa\) is
not.  Evaluating (12) anyway gives \(E=0.9269\); this is a low-\(\kappa\)
extrapolation and must not be reported as measured shape evidence.

The same paper reports that for \(\kappa<1\), the rear part is flatter than the
front part for its **rising** drops, and that surfactants break fore-aft
symmetry, especially at low Morton number.  Thus the actual falling state
cannot be represented by a scalar aspect ratio without specifying which end is
the falling front and what interface state is present.

### Wellek shape-only alternatives

The relations reproduced in Myint 2007 are
\[
E=\frac{1}{1+0.091We^{0.95}}
\quad\text{(non-oscillating contaminated liquid drops)}, \tag{13}
\]
and
\[
E=\frac{1}{1+0.163Eo^{0.757}}
\quad\text{(low/moderate-viscosity drop systems)}. \tag{14}
\]
At the persisted clean-branch \(We=0.45576\), these evaluate to \(E=0.9586\)
and \(E=0.7310\), respectively.  The spread is evidence that the interface
and source regime matter, not a permissible shape bracket.  Wellek's primary
abstract reports non-oscillating falling drops over \(Re=6\)--\(1354\); the
actual \(Re_t=2.4045\) is below that stated Reynolds range.  Neither relation
contains \(C_D\), so pairing either with a rigid-oblate-particle drag law would
be a new composite closure.

## 6. Grace, Clift, Hua, and Liu alternatives

### Grace--Wairegi--Nguyen

The accessible reproduction of the Grace terminal correlation is
\[
H=\frac43 Eo\,Mo^{-0.149}
\left(\frac{\mu_C}{9\times10^{-4}\ {\rm Pa\,s}}\right)^{-0.14},
\]
\[
J=
\begin{cases}
0.94H^{0.757},&2<H\le59.3,\\
3.42H^{0.441},&H>59.3,
\end{cases}
\qquad
Re_t=Mo^{-0.149}(J-0.857). \tag{15}
\]
The reported form is for \(Mo<10^{-3}\), \(Eo<40\), and \(Re>1\), and returns
one buoyancy-selected terminal point.  It has no dispersed-phase viscosity
ratio and is not a \(C_D(Re)\) curve for forced drop slip.

The actual \(Eo=2.93\) and \(Re>1\) pass, but
\[
Mo=0.0182163>10^{-3}
\]
fails the stated Morton-number gate by a factor of 18.2.  Grace is therefore
not an actual-condition terminal closure here; it is only a documented
out-of-range comparator if retained in an audit table.

Primary source: Grace, Wairegi & Nguyen, *Trans. Inst. Chem. Eng.* 54
(1976), pp. 167--173, “Shapes and velocities of single drops and bubbles
moving freely through immiscible liquids.”  The full primary article was not
available in the present web access; the equation and domain above are
preserved in the local source audit and should not be treated as a newly
verified page transcription.

### Clift--Grace--Weber

*Bubbles, Drops and Particles* (Academic Press, 1978), Chapter 2, Fig. 2.5,
is a useful \(Re\)--\(Eo\)--\(Mo\) regime map for preliminary shape screening.
It is not a low-\(\kappa\), falling-drop \(C_D(Re)\) closure.  The commonly
reproduced Clift equations in Myint 2007 for drops falling through **air** are
gas--liquid relations and cannot be transferred to RRBO/NMP.  The accessible
book preview exposes bibliographic metadata and selected pages, but not the
full Chapter 2 equations or figure page pagination; the book record is
access-restricted.

### Hua--Lou and Liu--Tang--Quan

The often-cited Hua & Lou paper is **Hua and Lou (2007), “Numerical simulation
of bubble rising in viscous liquid,” J. Comput. Phys. 222, 769--795,
DOI [10.1016/j.jcp.2006.08.008](https://doi.org/10.1016/j.jcp.2006.08.008)**.
It is a gas-bubble model, not a liquid drop with finite internal viscosity;
it is not admissible for this phase class.

The relevant liquid--liquid paper sometimes confused with that citation is
Liu, Tang & Quan (2013), “Shapes and terminal velocities of a drop rising in
stagnant liquids,” *Computers & Fluids* 81, 17--25,
DOI [10.1016/j.compfluid.2013.03.022](https://doi.org/10.1016/j.compfluid.2013.03.022).
It uses front tracking for silicone-oil drops in glycerol--water and defines
\[
\eta=\rho_D/\rho_C,\quad \lambda=\mu_D/\mu_C,\quad
N_f=\frac{\rho_C\sqrt{(\rho_C-\rho_D)gd^3}}{\mu_C},
\]
\[
Eo=\frac{(\rho_C-\rho_D)gd^2}{\sigma},\quad
Fr=U_t\sqrt{\frac{\rho_C}{(\rho_C-\rho_D)gd}},\quad
Re_t=\frac{\rho_CU_td}{\mu_C}.
\]
Its simulated ranges are \(0.65<\eta<0.79\), \(0.1<\lambda<10\),
\(5<N_f<100\), and \(16<Eo<47\).  The actual state fails the listed
\(\lambda\) and \(Eo\) ranges (\(\lambda=0.02368\), \(Eo=2.93\)); the paper
also supplies fitted terminal relations rather than a generally validated
arbitrary-slip \(C_D\) law.  ScienceDirect provided the abstract and section
snippets but required institutional access for the full paper, so no
unavailable fitted equation is reconstructed here.

### Henschke/ReDrop

The Henschke/ReDrop architecture is physically the right *kind* of
liquid--liquid model because it transitions between spherical, deformed, and
oscillating terminal states.  The local dissertation capture identifies fitted
transition and oscillation parameters.  No RRBO/NMP parameter set was found.
It is a future calibration route, not a zero-fit numerical closure for this
record.

## 7. Is falling versus rising mathematically material?

There are two separate answers.

**For the ideal isolated spherical equations, direction is only a sign.**  Use
the signed form (1), preserve \(\Delta\rho<0\), and solve the magnitude form
(2).  H--R, the spherical Barry equation, and the scalar Myint drag expression
are written in terms of \(Re\ge0\) and fluid-property magnitudes.  Under an
exact reflection of an infinite, quiescent, Newtonian spherical problem,
rising and falling have the same speed magnitude.

**For qualification of this real drop, direction is material.**  The primary
Myint measurements are rising, while the present RRBO/NMP dispersed phase is
falling.  A deformed low-\(\kappa\) drop has a front/rear distortion, and
surface-active material is transported along the moving interface.  Reflection
would also reflect the shape and interfacial state; it is not justified to
reuse a rising scalar \(C_D(Re)\) when those states are unknown.  Walls,
column circulation, coalescence, drop history, and imposed characteristic
velocity further break the isolated-drop symmetry.

Accordingly, taking absolute \(\Delta\rho\) in \(Eo\) and \(Mo\) is correct for
dimensionless magnitude screening, but taking absolute density difference and
silently relabeling a falling drop as rising is not evidence of applicability.
The direction gate is analytical; the falling interface/shape gate remains
unresolved.

## 8. Drop-size dependence and d32 limitation

For fixed properties,
\[
Eo(d)=2.93146\left(\frac{d}{d_{32}}\right)^2,\qquad
Ar(d)=37.18734\left(\frac{d}{d_{32}}\right)^3,\qquad
Mo(d)=0.0182163.
\]
In the H--R limit, \(Re_t\propto Ar\propto d^3\) and
\(|w|_t\propto d^2\).  In the finite-\(Re\) Myint or Barry equations the
terminal root must be solved again for each \(d\); \(Eo\), \(We\), shape, and
possibly interface state change with size.  A single \(d_{32}\) root is not a
population closure:
\[
d_{32}=\frac{\sum_i n_i d_i^3}{\sum_i n_i d_i^2}
\]
is a Sauter population mean, whereas the single-drop sources use an
equivalent-volume diameter for each drop.  Larger and smaller classes can
cross different shape and source-validity gates even when \(d_{32}\) itself
passes.

The 4.7457 mm calculation should therefore be called a representative-drop
terminal sensitivity only.  It does not establish a distribution-level
terminal slip, holdup, or flooding relation.

## 9. Candidate qualification matrix

| candidate | source/domain | actual-state gate | disposition |
|---|---|---|---|
| Hadamard--Rybczynski Eq. (4) | exact clean spherical \(Re\to0\) result, all \(\kappa\) | \(Re_t\approx3.06\), \(Eo=2.93\) | asymptotic anchor only |
| Myint Eq. (7), \(\chi=0\) | rising drops; \(0.17<Re<200\), \(0.017<Eo<12.1\), \(-11.6<\log Mo<-0.9\), \(0.1<\kappa<100\) | all groups except \(\kappa\); falling not tested | conditional clean low-\(\kappa\) extrapolation |
| Myint Eq. (7), \(\chi\to\infty\) | fully contaminated/rigid-sphere branch in same source range | interface state unknown; \(\kappa\) still below data gate | sensitivity envelope, not universal bound |
| Barry--Parlange Eq. (10) | spherical, steady, non-wobbling; all viscosity ratios; comparisons to about \(Re=200\) | \(Re\) and \(\kappa\) plausible; spherical shape and contamination gate absent | conditional generic spherical closure; current state sensitivity only |
| Grace Eq. (15) | terminal map, \(Mo<10^{-3}, Eo<40, Re>1\), no \(\kappa\) | \(Mo=0.0182\) fails | out-of-range comparator; no slip closure |
| Clift--Grace--Weber | Chapter 2 shape/regime map; book source | map is qualitative and full pages inaccessible | shape screening only |
| Wellek Eqs. (13)--(14) | shape-only; primary falling data \(Re=6\)--1354 | actual \(Re=2.40\); interface branch unknown | no-go as \(C_D\) closure |
| Hua--Lou 2007 | gas bubble in viscous liquid | wrong dispersed phase | reject |
| Liu--Tang--Quan 2013 | liquid-drop DNS, \(0.1<\lambda<10,16<Eo<47\) | \(\lambda=0.0237,Eo=2.93\) outside; fitted equations inaccessible | future DNS evidence, not closure |
| Henschke/ReDrop | liquid--liquid terminal architecture with fitted parameters | no RRBO/NMP fit | calibration route only |

## 10. Access and primary-source record

| source and locator | access in this audit | evidence used |
|---|---|---|
| Myint, Hosokawa & Tomiyama (2006), JFST 1(2), 72--81, DOI [10.1299/jfst.1.72](https://doi.org/10.1299/jfst.1.72); [J-STAGE full text](https://www.jstage.jst.go.jp/article/jfst/1/2/1_2_72/_article/-char/en); Eqs. (1)--(10), pp. 72--81 | free publisher HTML/PDF | definitions, H--R, Levich, finite-\(Re\) Eq. (9), ranges, \(\sim10\%\) terminal statement, clean/contaminated comparisons |
| Myint, Hosokawa & Tomiyama (2007), JFST 2(1), 184--195, DOI [10.1299/jfst.2.184](https://doi.org/10.1299/jfst.2.184); [J-STAGE full text](https://www.jstage.jst.go.jp/article/jfst/2/1/2_1_184/_article/-char/en); Eq. (14), pp. 184--195 | free publisher HTML/PDF | clean-shape fit, \(Ta\) range, \(\kappa<1\) front/rear distortion, surfactant effects, Wellek/Clift shape alternatives |
| Barry & Parlange (2018), PLOS ONE 13, e0194907, DOI [10.1371/journal.pone.0194907](https://doi.org/10.1371/journal.pone.0194907); [PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC5901779) | open access; PDF Eq. (10) p. 4/10 and HTML equation anchors | all-\(X\) spherical drag, H--R limit, assumptions, comparisons through approximately \(Re=200\) |
| Wellek, Agrawal & Skelland (1966), AIChE J. 12, 854--862, DOI [10.1002/aic.690120506](https://doi.org/10.1002/aic.690120506) | publisher abstract and metadata; full article access limited | primary falling-drop shape study, 45 systems, stated \(Re=6\)--1354 range; no drag equation used |
| Grace, Wairegi & Nguyen (1976), *Trans. Inst. Chem. Eng.* 54, 167--173 | bibliographic record and local reproduction; primary full text not exposed by current access | terminal/shape correlation and domain are treated as a bounded secondary extraction, not a fresh full-text verification |
| Clift, Grace & Weber (1978), *Bubbles, Drops and Particles*, Academic Press, Ch. 2, Fig. 2.5 | Google Books/Internet Archive metadata; chapter access restricted | regime-map role only; no unavailable page equation reconstructed |
| Hua & Lou (2007), JCP 222, 769--795, DOI [10.1016/j.jcp.2006.08.008](https://doi.org/10.1016/j.jcp.2006.08.008) | bibliographic/abstract search | gas-bubble phase-class rejection |
| Liu, Tang & Quan (2013), *Computers & Fluids* 81, 17--25, DOI [10.1016/j.compfluid.2013.03.022](https://doi.org/10.1016/j.compfluid.2013.03.022) | ScienceDirect abstract and section snippets; full text requires organization access | liquid-drop DNS ranges and inaccessible fitted-terminal-equation warning |
| Hatanaka et al. (1988), “Terminal velocity of a contaminated drop at low Reynolds number,” DOI record [0300946788800261](https://www.sciencedirect.com/science/article/abs/pii/0300946788800261) | abstract only | independent warning that contamination makes small drops slower than clean H--R; no equation admitted without full text |

Local source captures used in addition to the web records:

* `research/kuhni-drag-shape/sources/gap-hua-myint-terminal-2006.md`
* `research/kuhni-drag-shape/sources/gap-hua-myint-shape-2007.md`
* `research/kuhni-drag-shape/gap-highkappa-findings.md`
* `research/kuhni-drag-shape/drop-drag-audit.md`
* `research/kuhni-drag-architecture-audit.md`

## 11. Justified next numerical steps

These are offline qualification calculations, not production changes:

1. **Preserve the signed state.**  Store \(\Delta\rho=-146\) and the falling
   direction.  Use absolute values only for \(Eo,Mo,Ar,We\) magnitude groups.
2. **Reproduce a diameter/interface matrix.**  For each measured size class,
   not only \(d_{32}\), solve Eq. (3) with Myint \(\chi=0\), intermediate
   \(\chi\) values, and \(\chi\to\infty\).  Emit source-gate flags for
   \(\kappa,Re,Eo,Mo,Ta\), and never attach the published 10% error below
   \(\kappa=0.1\).
3. **Run Barry as a conditional generic spherical terminal closure.**  Use
   actual \(P=1.1680092\), not \(P=X\), and solve its Eq. (10) at each
   diameter.  Until the spherical gate passes, report it as model spread and
   sensitivity, not validation.
4. **Add a shape/interface decision before any drop-slip use.**  Measure or
   otherwise qualify aspect ratio, fore/aft distortion, and interfacial
   mobility for falling drops.  Wellek, the Myint clean-shape fit, and Clift maps may
   screen; none licenses a new composite drag law.
5. **Obtain the missing evidence.**  The cleanest experiment is a single
   falling RRBO/NMP drop in a sufficiently large stagnant cell at the actual
   \(40^\circ{\rm C}\) properties, with diameter, terminal speed, shape,
   surfactant/interfacial-tension condition, and uncertainty recorded.  If a
   numerical front-tracking/VOF study is used instead, require grid/time
   convergence, explicit interface mobility, and validation against a primary
   benchmark; numerical closure agreement alone is not experimental validation.
6. **Separate terminal from forced slip.**  Even a qualified terminal
   \(C_D(Re_t)\) does not qualify \(C_D\) at Kühni characteristic or swarm
   slip.  Forced-slip measurements or a validated nonterminal constitutive
   model are a separate gate.

**Final Stage 3 disposition:** The clean Myint continuation at
\(\kappa=0.0236789\) is a justified *candidate sensitivity*.  Barry is
admitted as a *conditional generic spherical terminal closure*, but its
current RRBO/NMP use remains `CALCULATED_EXTRAPOLATED` because the
low-\(\kappa\), falling, interface/shape gate is not satisfied.  Neither
route closes the nonterminal swarm-slip or reverse Kühni holdup/flooding
chain.  The actual numerical root \(Re_t=2.4045\) must remain labeled
extrapolated until those separate gates are independently satisfied.