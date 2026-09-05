# Gap-fill: high-viscosity-ratio deformation-aware drop drag

## Verdict

No located primary relation satisfies all of the requested constitutive requirements at once:

1. liquid drop in a liquid;
2. Reynolds-dependent \(C_D\) evaluable at an arbitrary supplied characteristic/swarm-slip \(Re\);
3. deformation-aware;
4. no liquid-system-specific fitted parameters; and
5. source-supported at, or defensibly covering, \(\kappa=\mu_d/\mu_c=33.6\) and \(Mo=2.86\times10^{-9}\).

The closest unfitted arbitrary-\(Re\) result is Barry & Parlange (2018), but it is explicitly for a
**spherical** fluid particle. The closest deformation-aware liquid/liquid approaches (Thorsen,
Grace, and Henschke/ReDrop) return terminal velocity on a buoyancy-selected trajectory rather
than a constitutive \(C_D\) at an independently supplied slip Reynolds number; Henschke also
requires fitted transition/oscillation parameters. Wellek supplies shape, not drag.

## Definitions and reference area

For the spherical-fluid-particle correlations below,
\[
Re=\frac{\rho_c U d}{\mu_c},\qquad \kappa=\frac{\mu_d}{\mu_c},
\]
and the standard drag convention is
\[
F_D=\tfrac12\rho_c U^2 C_D A_0,\qquad A_0=\frac{\pi d^2}{4},
\]
where \(d=2a\) is the spherical or volume-equivalent diameter. This is not the instantaneous
projected area of an oblate drop. At terminal settling/rise this convention gives
\[
C_D=\frac{4\,|\rho_d-\rho_c|g d}{3\rho_c U_t^2}.
\]

## Relations checked

### Wellek, Agrawal & Skelland (1966)

The commonly reproduced Wellek shape relation is
\[
E=\frac{b}{a}=\frac{1}{1+0.163\,Eo^{0.757}},\qquad
Eo=\frac{|\rho_d-\rho_c|g d^2}{\sigma}.
\]
It describes the minor/major axis ratio of nonoscillating drops using an equivalent diameter.
It contains neither \(Re\) nor \(C_D\), and defines no drag reference area. Combining it with a
solid-oblate-particle drag law would be a new composite extrapolation, not a Wellek-supported
liquid-drop constitutive law.

**Verdict:** shape-only; no-go.

### Thorsen, Stordalen & Terjesen (1968)

The oscillating-drop terminal-velocity expression reproduced in the fetched liquid/liquid study is
\[
U_t=
\frac{6.8}{1.65-\Delta\rho/\rho_d}
\sqrt{\frac{\sigma}{(3\rho_d+2\rho_c)d}} .
\]
It was proposed for clean, high-interfacial-tension systems with oscillation. It has no arbitrary
input \(Re\), no direct \(C_D\), and no independent projected-area convention.

**Verdict:** terminal velocity only; no-go.

### Grace, Wairegi & Nguyen (1976)

The reproduced explicit terminal-velocity correlation is
\[
U_t=\frac{\mu_c}{\rho_c d}Mo^{-0.149}(J-0.857),
\]
\[
J=0.94H^{0.757}\quad(2<H\le59.3),\qquad
J=3.42H^{0.441}\quad(H>59.3),
\]
\[
H=\frac43 Eo\,Mo^{-0.149}
\left(\frac{\mu_c}{\mu_w}\right)^{-0.14},\qquad
\mu_w=9\times10^{-4}\ {\rm Pa\,s}.
\]
The source reports \(Mo<10^{-3}\), \(Eo<40\), and \(Re>1\). Thus the requested
\(Mo=2.86\times10^{-9}\) lies inside the stated Morton-number bound, but the model still returns
the buoyancy-selected terminal velocity, not \(C_D\) at arbitrary slip \(Re\).

**Verdict:** Morton range supported, constitutive use unsupported; no-go.

### Henschke/ReDrop

The spherical branch uses
\[
C_D(Ar)=\frac{432}{Ar}+\frac{20}{Ar^{1/3}}
+\frac{0.51Ar^{1/3}}{140+Ar^{1/3}},\qquad 0<Re<3\times10^5,
\]
\[
Re_{\rm mobile}=\frac{Ar}{a_{DA}(0.065Ar+1)^{1/6}},\qquad a_{DA}=12,
\]
with interpolation between rigid and mobile limits. The deformation and oscillation branches are
\[
U_{\rm def}=\sqrt{\frac{\Delta\rho g d}{2\rho_c}},\qquad
U_{\rm osc}=\sqrt{\frac{2a_{15}\sigma}{\rho_c d}},
\]
\[
U_{\rm osc/def}=(U_{\rm osc}^8+U_{\rm def}^8)^{1/8},
\]
followed by another crossover to the spherical velocity. The dissertation identifies fitted
\(d_{SW}\), \(a_{15}\), and \(a_{16}\); a later low-IFT application reports five fitted parameters
\((p_1,p_2,p_3,p_4,p_5)=(1.28,4,2.471,1.594,1.842)\).

**Verdict:** deformation-aware but fitted and terminal-velocity-based; no-go.

### Hamielec (1963), Rivkind/Ryskin, Brauer, Saboni/Alexandrova

These are arbitrary-\(Re\) fluid-sphere relations, not deformation-aware relations.

Hamielec:
\[
C_D=
\frac{3.05(783\kappa^2+2142\kappa+1080)}
{(60+29\kappa)(4+3\kappa)Re^{0.74}},\qquad 4<Re<100.
\]

Rivkind/Ryskin interpolation:
\[
C_D\simeq
\frac{\kappa(24Re^{-1}+4Re^{-1/3})+14.9Re^{-0.78}}{1+\kappa}.
\]
The later source notes recommended use over \(2<Re\le50\), with a separate low-\(Re\)
expression.

Brauer:
\[
C_D=\frac{16}{Re}+
\frac{14.9}{Re^{0.78}}\frac{1}{1+10Re^{-0.6}},
\qquad Re<3\times10^5.
\]

Saboni & Alexandrova:
\[
C_D=
\frac{
\left[\kappa\left(\frac{24}{Re}+\frac4{Re^{1/3}}\right)
+\frac{14.9}{Re^{0.78}}\right]Re^2
+40\frac{3\kappa+2}{Re}+15\kappa+10
}{
(1+\kappa)(5+Re^2)
},
\qquad 0.01\le Re<400.
\]
The last relation directly accepts \(\kappa=33.6\), but neither it nor the other three contains
\(Mo\), \(Eo\), \(We\), aspect ratio, or projected-area deformation.

**Verdict:** \(\kappa\) and arbitrary-\(Re\) use are plausible/supported; deformation is absent,
so all are no-go for the requested constitutive role.

### Barry & Parlange (2018)

This is a primary, analytical Padé relation with no coefficients fitted to numerical drag data. It
covers all viscosity ratios from bubble to rigid sphere and Reynolds numbers up to a few hundred,
but explicitly assumes enough surface tension to keep the particle spherical and excludes
oscillation/wobble. It therefore supports \(\kappa=33.6\) only on the spherical-shape branch.
\(Mo\) is not an equation input; \(Mo\), \(Eo\), and \(Re\) must instead be used externally to
establish that the drop remains spherical.

**Verdict:** best unfitted arbitrary-\(Re\) candidate, but not deformation-aware; no-go whenever
the Wellek/deformed branch is active.

### Taylor & Acrivos; Dandy & Leal; oblate-drop computations

Taylor & Acrivos is a low-\(Re\), weak-deformation asymptotic theory, not a finite-\(Re\)
correlation spanning characteristic/swarm-slip conditions. Dandy & Leal and related oblate-drop
work solve coupled buoyancy/deformation problems and report solution families; no source-native,
closed arbitrary-\(Re\), arbitrary-\(\kappa\), deformation-aware \(C_D\) closure was located.

**Verdict:** useful validation/theory evidence, but not a drop-in Garthe Eq. 8.3 closure.

## Constitutive decision

Do not represent Wellek + Brauer/Saboni/Loth/solid-oblate drag as source-supported. It is an
engineering composite requiring explicit governance and validation. For Garthe Eq. 8.3, either:

* retain a spherical fluid-sphere \(C_D(Re,\kappa)\) only where a separately documented shape
  criterion confirms near-sphericity; or
* mark the high-\(\kappa\), deformed/swarm-slip case as an unresolved evidence gap and obtain a
  validated liquid/liquid DNS/experiment-based closure.
