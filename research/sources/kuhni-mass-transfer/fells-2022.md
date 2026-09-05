Source: https://eprints.whiterose.ac.uk/id/eprint/187311/1/processes-10-00968.pdf
Title: Predicting Mass Transfer in Liquid�Liquid Extraction Columns
Fetched: 2026-09-05T15:58:56.657Z

# Article

# Predicting Mass Transfer in Liquid–Liquid Extraction Columns

**Alex Fells <sup>1,</sup>*, Andrea De Santis<sup>1</sup>, Marco Colombo<sup>2</sup>, Daniel W. Theobald<sup>1</sup>, Michael Fairweather<sup>1</sup>,**
**Frans Muller<sup>1</sup> and Bruce Hanson<sup>1</sup>**

## Frans Muller 1 and Bruce Hanson 1

<sup>1</sup>School of Chemical and Process Engineering, University of Leeds, Leeds LS2 9JT, UK;
a.desantis@leeds.ac.uk (A.D.S.); daniel.w.theobald@gmail.com (D.W.T.); m.fairweather@leeds.ac.uk (M.F.);
f.l.muller@leeds.ac.uk (F.M.); b.c.hanson@leeds.ac.uk (B.H.)

<sup>2</sup>Department of Mechanical Engineering, University of Sheffield, Sir Frederick Mappin Building,
Mappin Street, Sheffield S1 3JD, UK; m.colombo@sheffield.ac.uk

***** Correspondence: alexfells@gmail.com

**Citation:** Fells, A.; De Santis, A.;
Colombo, M.; Theobald, D.W.;
Fairweather, M.; Muller, F.;
Hanson, B. Predicting Mass Transfer
in Liquid–Liquid Extraction
Columns. *Processes* **2022**,*10*, 968.
https://doi.org/10.3390/pr10050968

Academic Editor:
Agnieszka Zgoła-Grzéskowiak

Received: 31 March 2022
Accepted: 11 May 2022
Published: 12 May 2022

**Publisher’s Note:** MDPI stays neutral
with regard to jurisdictional claims in
published maps and institutional affiliations.

**Copyright:** © 2022 by the authors.
Licensee MDPI, Basel, Switzerland.
This article is an open access article
distributed under the terms and
conditions of the Creative Commons
Attribution (CC BY) license (https://
creativecommons.org/licenses/by/
4.0/).

**Abstract:** In this work, the GEneralised Multifluid Modelling Approach (GEMMA) is applied to the
simulation of liquid–liquid extraction in a Rotating Disc Column (RDC) and a Pulsed Sieve-plate
Extraction Column (PSEC). A mass transfer modelling methodology is developed, in which the multiphase flows, droplet size distribution and dispersed phase holdup predicted with computational fluid
dynamics are coupled to mass transfer correlations to predict the overall mass transfer. The numerical
results for the stage-averaged dispersed phase holdup, Sauter mean droplet diameter and axial solute
concentration in the RDC and PSEC agree with experimental observations. The proposed modelling
method provides an accurate predictive tool for complex multiphase flows, such as those observed in
intensified liquid–liquid extraction, and provides an alternative approach to column design using
empirical correlations or pilot plant study.

**Keywords:** multiphase flows; computational fluid dynamics; mass transfer; liquid–liquid extraction;
solvent extraction; droplet population balance; pulsed column; pulsed sieve-plate extraction column;
rotating disc column

## 1. Introduction

Multiphase flows are found in countless industrial applications, spanning from power
generation and chemical processes to food production and biomedical applications. In the
context of the nuclear industry, multiphase flows also play a crucial role in current and
advanced reprocessing technologies foreseen for the next generation of nuclear power
plants [1]. Therefore, predicting the local and global transient evolution of multiphase
flows is recognised to be of paramount importance for the nuclear industry at large [2].

Computational fluid dynamics (CFD) has the potential to provide improved predictive capability of multiphase flows. This, however, is hindered by the complexity of
the multiphase flows that are of interest to industrial applications. In particular, most
multiphase flows of practical interest exhibit a broad range of interfacial scales, ranging
from small dispersed phase elements (DPEs), such as particles, droplets or bubbles embedded in a continuous phase, to large interfaces observed in segregated free-surface flows.
Off-the-shelf multiphase flow numerical models generally assume either small or large
interfacial scales, resulting in the so-called interface-averaging and interface-resolving approaches [3,4]. The former method is mainly used for dispersed flows where the interfacial
scales are smaller than the size of the numerical grid; scale separation is assumed, and
the governing equations are conditionally-averaged, resulting in the so-called multifluid
formulation. Due to the averaging operation, suitable closures are needed to account for
the interfacial transfer of momentum, heat and mass. Conversely, the interface-resolving
approach assumes that the mesh size is small enough to allow for an adequate resolution
of the morphology of the interface, which generally applies to large segregated interfaces;

---

this approach leads to interface-tracking and interface-capturing models. In the former, the
interface position is tracked in a Lagrangian fashion, whilst in the latter, it is reconstructed
from a known indicator function; the well-known Volume of Fluid (VoF) approach [5] is an
example of an interface-capturing model.

From the discussion above, it is clear that most multiphase flows of practical interest
exhibit a marked multiscale behaviour, whilst standard multiphase modelling approaches
assume the presence of either “small” dispersed interfacial scales or “large” segregated
interfacial scales. In the numerical simulation context, the terms “small” and “large” are
defined with respect to the size of the numerical grid. Therefore, it is evident that there is a
need for a generalised multiphase modelling approach capable of handling the presence of
a broad range of interfacial scales in the same computational domain; a number of these approaches have been proposed, mainly following the idea of embedding some form of large
interface resolution within a standard multifluid framework [6]. However, most of these
approaches either rely on a priori regime maps based on the local volume fraction [6–8] or
lack the capability of adapting to the local flow regime altogether [9].

To overcome these shortcomings, the GEneralised Multifluid Modelling Approach
(GEMMA) for the simulation of multiscale multiphase flows has been recently developed [10]. The approach adapts its formulation to the local resolution of the interfacial
scales. The GEMMA approach reduces to a standard multifluid formulation suitable for
small/dispersed interfaces in the numerical cells where the interfacial scales are small
compared to the mesh size. In the cells where the mesh size is fine enough to guarantee an
acceptable resolution of the interfacial morphology, a novel multifluid formulation suitable
for the simulation of large/segregated interfaces is introduced; the latter formulation aims
at mimicking the behaviour of an interface resolving approach such as VoF within the
multifluid framework. However, given that the model is based on a multifluid description,
dedicated closures for interfacial momentum transfer and surface tension remain necessary
to describe the underlying physics of interfacial momentum exchange in large interface
regions. The model has been assessed against different fundamental test cases in [10],
where it has been shown that it is as accurate as the VoF approach for cases characterised
by large/segregated interfaces, whilst a standard multifluid behaviour is recovered in
dispersed flows; in the same work, the authors demonstrated the capability of the approach
to adapt its formulation locally in a prototypical multiscale flow, i.e., a water jet plunging
in a quiescent pool.

Furthermore, it has been demonstrated that the GEMMA approach can accurately
represent the complex multiphase hydrodynamics encountered in liquid–liquid extraction
devices [11,12]. Liquid–liquid extraction is when a solute is transferred between two
immiscible fluids, typically a polar aqueous phase and a non-polar organic phase, with
separation occurring based on relative solubility or chemical reaction at the interface.
Liquid–liquid extraction can be performed batch-wise, where phases are sequentially
contacted and then separated; however, this is often impractical when performing the
process at scale. Performing liquid–liquid extraction at scale has traditionally employed
large columns where the heavy phase enters the top before flowing down and exiting via
the base. The less-dense phase of the two phases enters the column at the bottom, where it
travels upwards before leaving at the top. A large surface-area-to-volume ratio between the
two phases is desirable to ensure a high mass transfer rate, necessitating a small dispersed
phase diameter; however, droplets must be sufficiently large to prevent entrainment and
subsequent column flooding. By controlling the amount of turbulence within the column,
it is possible to optimise the mass transfer performance. In the case of a rotating disc
column (RDC), this is achieved by rotating discs attached to a central shaft using a variable
speed motor, while in a pulse sieve-plate extraction column (PSEC), the column fluid is
cyclically pulsed upwards and downwards through sieve-plates, resulting in jetting and
droplet formation.

Traditionally, the design of liquid–liquid extraction columns has relied upon utilising
some of the many published empirical correlations; however, these often perform poorly, resulting in large, expensive over-designed columns. Providing suitable time and research
facilities are available, a pilot plant can be used to determine extraction as a function of
column height and cross-section, which is then scaled accordingly. However, scaleup is a
complicated process that can result in expensive overdesigned columns. Due to the inherent
uncertainty associated with the empirical or pilot plant design of extraction columns,
developing and utilising a modelling and simulation approach to design is desirable.

To date, there have been several investigations into CFD informed mass transfer
modelling in liquid–liquid extraction columns, with several studies looking at application
within an RDC [13,14] and a PSEC [15]. However, these were done with models unable
to distinguish between the flow regimes. Instead, results in [11,12] demonstrated how an
approach such as GEMMA can make available the key hydrodynamic parameters needed
to characterise mass transfer in these applications. Although implementing mass transfer
directly with GEMMA would provide a detailed understanding of performance, doing
so would be computationally expensive as it requires solving the relevant mass transfer
calculations in each cell in the computational domain. The present work builds on previous
findings [11,12] and presents a modelling framework to evaluate the global mass transfer
performance in complex multiphase systems. The mass transfer modelling framework
relies on input from GEMMA to evaluate the hydrodynamic parameters that influence
mass transfer; successively, a surrogate reduced-order model of the system is created based
on the hydrodynamic information obtained from the CFD model. This surrogate model
is used to infer the global mass transfer performance of the system. This is significantly
quicker as mass transfer performance is only calculated in a small number of compartments as opposed to every cell within the mesh, and, therefore, it requires much less
computational resource.

The paper is organised as follows: the GEMMA modelling approach and the integral
mass transfer modelling methodology are described in Section2; their application to an
RDC and a PSEC are reported in Section3. Finally, conclusions and future work are outlined
in Section4.

## 2. Numerical Modelling

## 2.1. Hydrodynamic Modelling

The GEMMA approach has been implemented in the well-known open-source CFD
code OpenFOAM v7.0 [16,17], and a detailed description can be found in [10]. A high-level
overview of the approach is provided here.

The GEMMA approach has been built on top of the standard multifluid modelling
framework suitable for small/dispersed interfaces given by the OpenFOAM native *re-*
*actingMultiphaseEulerFoam* solver. GEMMA introduces two different formulations within
the multifluid framework; in each cell of the computational domain, one of the two approaches is selected based on the numerical grid’s local capability to resolve the interface’s
morphology. The two formulations are:

(1) A standard multifluid formulation, suitable for small/dispersed interfacial scales:
this approach is used in the cells where the local mesh size is larger than the local
interfacial scales, and, therefore, it is not possible to directly resolve the morphology
of the interface.

(2) An ad-hoc multifluid formulation suitable for large/segregated interfacial scales: this
approach is used in the cells where the local mesh size is smaller than the local interfacial scales and the mesh resolution is fine enough to guarantee an adequate resolution
of the interface. This formulation aims to provide a form of interface resolution,
similar to interface-resolving approaches, in the context of the multifluid framework.

A large interface identifier *Ca*is introduced to identify which formulation is used in
each cell. *C*<sub>a</sub>is equal to zero in the cells where the dispersed formulation is employed and
is instead equal to one in the cells where the large interface formulation is used. A flow
diagram describing the switching logic is shown in Figure1. A detailed description of the

$$
C_{\alpha}
$$

$$
C_{\alpha}
$$

---

4 of 17
and is instead equal to one in the cells where the large interface formulation is used. A

of the logic controlling the local 𝐶𝛼value and of the multifluid formulation for large/seglogic controlling the local *C*<sub>a</sub>value and of the multifluid formulation for large/segregated
regated interfaces is provided in [10].
interfaces is provided in [10].

$$
C_{\alpha}
$$

For every cell in mesh

$IRQ_{cell} \leq IRQ_{crit}$ True $C_{\alpha,cell} = 0$ False $\alpha_{cell} < \alpha_{\min}$ or $\alpha_{cell} > \alpha_{\max}$ True $C_{\alpha,cell} = 0$ False Population balance active True $d_l \geq \Gamma \Delta_{cell}$ False $C_{\alpha,cell} = 0$ True $C_{\alpha,cell} = 1$ Move to next cell

**Figure 1. Figure 1.** Flow chart showing logic for the switching of the large interface identifier Flow chart showing logic for the switching of the large interface identifier *C*𝐶<sub>a</sub>𝛼..

$$
C_{\alpha}
$$

The Interface Resolution Quality (IRQ) index is a numerical indication of interface resolution and is a function of the local mesh size and the local interface curvature, $ \kappa $ A user-specified critical IRQ value is used to determine whether there is sufficient interface resolution for $ C_{\alpha} $ to be activated. IRQ and local interface curvature are defined as:

$$
C_{\alpha}
$$

$$
IRQ=\frac{2}{\sqrt[3]{V_{cell}}\kappa}
$$

(1)
(1)

$$
\kappa=-\nabla.\left(\frac{\nabla\alpha}{\left|\nabla\alpha\right|}\right)
$$

(2)
(2)

$$
C_{\alpha}
$$

To ensure $ C_{\alpha} $ is only enabled in cells where an interface exists, minimum and maximum values for the dispersed phase volume fraction are specified. Finally, $ C_{\alpha} $ is enabled if the calculated diameter of the dispersed phase is larger than the current cell size multiplied by a user-defined value, $ \varGamma. $

$$
C_{\alpha}
$$

In the case of adiabatic flows without mass transfer, the volume-averaged continuity
In the case of adiabatic flows without mass transfer, the volume-averaged continuity 
equation for phase *x* is:
equation for phase  𝑥 is:

$$
\frac{\delta\alpha_{x}}{d t}+\nabla.(\alpha U_{x})+\nabla.(U_{c}\alpha_{x}(1-\alpha_{x}))=0
$$

(3)
(3)

where the $ \alpha_{x}(1-\alpha_{x}) $ term ensures the included compressive velocity term is only active in the presence of a large interface to maintain sharpness by preventing diffusion. The compressive velocity term, $ U_{c} $ , is:

$$
\alpha_{x}(1-\alpha_{x})
$$

$$
U_{c},
$$

$$
U_{c}=C_{\alpha}\left|U_{c}\right|\frac{\nabla\alpha}{\left|\nabla\alpha\right|}
$$

(4)(4)

The corresponding momentum conservation equation is:
The corresponding momentum conservation equation is:

$$
\frac{\delta\alpha_{x}U_{x}}{\delta t}+\nabla.\big(\alpha_{x}U_{x}U_{x}\big)=-\frac{\alpha_{x}\nabla p}{\rho_{x}}+\nabla.\big(\nu_{x}\alpha_{x}\nabla U_{x}\big)+\alpha_{x}g+\frac{\big(F_{x}+F_{st,x}\big)}{\rho_{x}}
$$

(5)

---

where the interfacial exchange is described via the momentum exchange force, *Fx*, and
the surface tension force, *Fst*,*x*. The underpinning phenomena for these are different
depending on if the fluid is dispersed or segregated, and these are formulated accordingly.
The formulation for a generic force is as follows:

$$
F_{x},
$$

$$
F_{st,x}
$$

$$
F=(1-(1-C_{\alpha})f_{x}-(1-C_{\alpha})f_{z})F_{LI}+(1-C_{\alpha})f_{x}F_{xy}+(1-C_{\alpha})f_{z}F_{zx}
$$

(6)

The surface tension force, *F*<sub>st</sub>,*x*, is formulated as:

$$
F_{st,x},
$$

$$
F_{s t,k}=\alpha_{x}\sum_{i=1}^{n_{k}}\left(C_{\alpha_{k,i}}\sigma_{k,i}\alpha_{s m o o t h}\nabla\alpha\frac{2\rho}{\nabla\rho_{k,i}}\right)
$$

(7)

The RDC computational domain has been modelled in 3D as a 60 axisymmetric wedge
with turbulence in both phases modelled with the Large Eddy Simulation (LES) approach
with the standard Smagorinsky [18] closure used for the subgrid stresses. As LES resolves
the grid-level velocity field fluctuations in the unsteady flow field, it is possible to determine
the turbulence kinetic energy (TKE) and turbulence energy dissipation rate. Due to the
large size of the PSEC and the requirement for mesh refinement at the plate region, a fully
3D LES was not deemed computationally feasible, and instead, the column was modelled
as a 2D slice. However, this precludes the use of LES, and, therefore, both phases are instead
modelled with the Unsteady Reynolds-averaged Navier–Stokes (URANS) approach [19].
As URANS can only solve for the averaged flow field and fluctuations in the velocity field,
the TKE and its dissipation rate are modelled using the mixture k-" model.

$$
60^{\circ}
$$

## 2.2. Reduced Population Balance

A population balance approach can be used within GEMMA to evaluate the DPE
size distribution when working in dispersed-interface mode; this feature is particularly
important in cases involving mass transfer since the interfacial area available for the
interfacial exchanges is directly related to the Sauter mean diameter of the dispersed phase
in the regions of small/dispersed interfaces. The formulation of GEMMA is fully compatible
with the MUSIG [20] multigroup inhomogeneous population balance embedded within
the *reactingMultiphaseEulerFoam* solver in OpenFOAM, which allows for the evaluation of
the DPE’s diameter distribution.

A reduced-order population balance has been implemented within GEMMA as a less
computationally intensive alternative to MUSIG. The One Primary One Secondary Particle
Method (OPOSPM) [21] is used as a reduced population balance approach. OPOSPM allows
for the conservation of two low-order moments, and the selection of these moments is
arbitrary; however, the total number and volume concentrations are the most commonly
employed moments to guarantee the conservation of the total number and mass of the
DPEs. Since the total number and volume concentration are conserved, the population
density is represented by a single particle (assumed to have a spherical shape) whose size
is characterised by the diameter:
s

$$
d_{30}=\sqrt[3]{\frac{\sum d^3}{\sum d^0}}=\sqrt[3]{\frac{6\alpha_d}{\pi N_{drop}}}
$$

(8)

where *a*<sub>d</sub>and *N*<sub>drop</sub>are the volume fraction and the particle number density of the dispersed
phase, respectively, which are related to the zeroth and third moment of the distribution
0 3
*d* and *d*. Since the volume fraction is already known from the resolution of the standard
multifluid governing equations, the OPOSPM formulation only requires the solution of
one additional conservation equation for *N*<sub>drop</sub>, which is given by:

$$
\alpha_{d}
$$

$$
N_{drop}
$$

$$
d^{0}
$$

$$
d^{3}
$$

$$
N_{drop},
$$

$$
\frac{\partial\Big(\rho_{d}N_{d r o p}\Big)}{\partial t}+\nabla\cdot\Big(\rho_{d}U_{d}N_{d r o p}\Big)=\rho_{d}\;S
$$

(9)

---

where the source term, *S*, is:

$$
S=\left(n_{daugher}-1\right)r_{breakage}N_{drop}-\frac{1}{2}\;r_{coalesce}N_{drop}^2
$$

$$
S,
$$

(10)

Within the source term, droplet formation due to breakage is described as a function
of the mean number of daughter droplets, *ndaughter*, which is assumed to be 2, and the
breakage rate, *r*<sub>breakage</sub>, given by the break-up model of Martinez-Bazan et al. [22]:

$$
n_{daughter},
$$

$$
r_{breakage},
$$

$$
r_{breakage}=\frac{\sqrt{8.2(\epsilon d_{30})^{\frac{2}{3}}-\frac{12\sigma}{\rho_c d_{30}}}}{4d_{30}}
$$

(11)

Finally, droplet coalescence rate, *rcoalescence*, is modelled using the coalescence model
of Prince and Blanch [23], where the initial film thickness, *h*0, and final film thickness, *hf*,
are assumed to be 10 <sup>4</sup>and 10 <sup>8</sup>m, respectively [23]:
0

$$
r_{coalesceence},
$$

$$
h_{0},
$$

$$
h_{f},
$$

$$
10^{-4}
$$

$$
10^{-8}
$$

$$
r_{coalesence}=1.409\epsilon^{\frac{1}{3}}d_{30}^{\frac{1}{3}}\exp\left(-\left(\frac{d_{30}}{2}\right)^{\frac{5}{6}}\frac{\rho_c^{\frac{1}{2}}\epsilon^{\frac{1}{3}}}{4\sigma^{\frac{1}{2}}}\ln\left(\frac{h_0}{h_f}\right)\right)
$$

(12)

The OPOSPM formulation described above allows for the evaluation of *d*<sub>30</sub>; however,
knowledge of the Sauter mean diameter *d₃₂* also allows evaluation of the interfacial area
density as:
<u>6</u><u>a</u>d

$$
d_{30};
$$

$$
d_{32}
$$

$$
a=\frac{6\alpha_{d}}{d_{32}}
$$

(13)

In the context of liquid–liquid extraction, Wardle [24] followed the approach of estimating the ratio *d₃₀*/*d₃₂* from known DPE size distributions and combined this with
the *d*<sub>30</sub>evaluated with the reduced population balance to infer the Sauter mean diameter.
For liquid–liquid dispersions in Annular Centrifugal Contactors (ACCs), it has been observed that the *d*<sub>30</sub>/*d*<sub>32</sub>ratio is consistently in the range of 0.75–0.8. Consistent with [24], a
value of 0.76 is used throughout the simulations presented in this work.

$$
d_{30}/d_{32}
$$

$$
d_{30}
$$

$$
d_{30}/d_{32}
$$

## 2.3. Mass Transfer Modelling Approach

The GEMMA approach makes it possible to obtain key information on the hydrodynamic behaviour of complex multiscale multiphase flows that are of interest to the
nuclear industry, as demonstrated in [11] for the case of intensified liquid–liquid extraction in ACCs and in [12] for pulsed sieve-plate extraction columns (PSECs). This section
describes a methodology to predict the global mass transfer rates in these flows based on
the hydrodynamic information provided by a detailed CFD model based on the GEMMA
approach. A continuously stirred tank reactor (CSTR) represents a reasonable approximation for a single compartment of an extraction column, such as a PSEC and an RDC [25,26].
These systems operate in counter-current flow, and therefore, the resolution of a system of
one-dimensional differential equations is needed to characterise them along their entire
active length and account for effects such as backflow and axial dispersion. The model
requires the molar flow rates and solute concentration for both phases at the inlet as input
parameters. The description provided below is aimed at liquid–liquid extraction applications, but the methodology applies to any multiphase flow presenting mass transfer
phenomena driven by concentration gradients.

The approach relies on the two-film theory [27], shown in Figure2, to evaluate the
mass transfer rate (MTR), which is based on the total fluid volume, inclusive of dispersed
and continuous phases, and is expressed in mol m <sup>3</sup>s<sup>1</sup>. The MTR of a solute from the
bulk aqueous to the interface and from the interface to the bulk organic is given by:

$$
\mathrm{m}^{-3}\mathrm{~s}^{-1}
$$

$$
MTR=k_{c}a(C_{c}-C_{c,i})=k_{d}a(C_{d,i}-C_{d})
$$

(14)

---

7 of 17
(14)

where $ k_{c} $ and $ k_{d} $ are the mass transfer coefficients expressed in ms <sup>-1</sup> of the continuous and dispersed phases, respectively, a is the interfacial area per unit volume of reactor in $ \mathrm{m}^{2}\mathrm{m}^{-3} $ and C is the solute concentration in mol $ \mathrm{m}^{-3} $ , with the subscripts c and d denoting if the concentration refers to the aqueous or dispersed phase and the subscript i indicating if the concentration refers to the interface.

$$
k_{c}
$$

$$
\mathrm{ms}^{-1}
$$

$$
k_{d}
$$

$$
\mathrm{m}^{2}\mathrm{~m}^{-3}
$$

$$
\mathfrak{m}^{-3},
$$

Concentration $ \frac{1}{k_{ov}} = \frac{1}{\frac{K_{eq}}{k_c} + \frac{1}{k_d}} $
Overall mass transfer coefficient
$ MTR = \frac{1}{k_{ov}} a(C^*_d - C_d) $
Mass transfer per unit volume of dispersion
$ C_d^* = K_{eq}C_c $
$ C_{c,i} $
$ C_{d,i} = K_{eq}C_{c,i} $
Interfacial equilibrium
Dispersed droplet Film Continuous phase

**Figure 2. Figure 2.** Schematic representation Schematic representation of two-film theory. of two-film theory.

Assuming there is negligible resistance to mass transfer at the interface, the equilibrium distribution $ K_{e q} $ can be calculated using Equation (15) below. The equilibrium assumption is frequently valid and is justified in most absorption applications; on the other hand, interfacial chemical reactions can be the limiting step in extraction with chemical reaction. Despite this, the equilibrium assumption is used in the present modelling methodology, and the inclusion of finite-rate interfacial chemistry will be part of future model development:

$$
K_{eq}
$$

$$
K_{eq}=\frac{C_{d,i}}{C_{c,i}}
$$

(15)

Rearrangement and substitution of Equations (14) and (15) give Equation (16) for the rate of interphase mass transfer:

$$
MTR=\left(\frac{1}{\frac{K_{eq}}{k_c}+\frac{1}{k_d}}\right)a\left(K_{eq}C_c-C_d\right)
$$

(16)
(16)

It can be noted that a first coupling between the mass transfer and the CFD model is represented by the interfacial area density required in Equation (16), which is evaluated as the product of the interfacial area density a and the volume of the reactor V. The interfacial area density is evaluated through the CFD model via Equation (13). Different correlations are available in the literature to evaluate the phase-specific mass transfer coefficients $ k_{d} $ and $ k_{c} $ , which are usually expressed as a function of the Sherwood number Sh; good reviews of such correlations are given in [25,26], and more details on this are presented in Section 3.

$$
k_{c},
$$

$$
k_{d}
$$

𝑆ℎ; good reviews of such correlations are given in The correlations express the Sherwood number as a function of the physical properties [25,26], and more details on this are 
presented in Section 3. of the fluids (e.g., density, viscosity, diffusion coefficient) as well as a function of the
hydrodynamic conditions within the system (e.g., droplet Reynolds number, the diameter of The correlations express the Sherwood number as a function of the physical properties of the fluids (e.g., density, viscosity, diffusion coefficient) as well as a function of the the dispersed phase, relative velocity between the two phases). An accurate hydrodynamic
model of the system is needed to evaluate the latter parameters; this represents another
hydrodynamic conditions within the system (e.g., droplet Reynolds number, the diameter 
level of coupling between the CFD and the mass transfer modelling methodology.

The above set of equations is applied to the extraction of acetone in a water/toluene/acetone
system in an RDC and a PSEC. These cases are then used to validate the mass transfer modelling methodology against the experimental measurements of [25]. A compartment
modelling approach will be utilised, with the unit operations being modelled as a network
of well-mixed sub-volumes, with each stage represented by a single CSTR [28]. Due to the
low solute concentrations and simple extraction mechanism based on relative solubility,
the main assumptions underlying the integral mass transfer modelling approach described
above are that:

(1) The hydrodynamic behaviour of the system is not significantly impacted by mass transfer.

(2) The interfacial chemistry is infinitely fast, i.e., interfacial concentrations are assumed
to be equilibrium concentrations.

(3) The saturation of the solvent is neglected.

## 3. Results and Discussion

## 3.1. Simulation of a Rotating Disc Column

The RDC considered in this simulation is taken from Garthe [24]. The column has
a diameter of 0.08 m, consists of 59 compartments and each compartment has a height
of 0.05 m, resulting in a total active length of 2.95 m. The continuous phase is water,
the dispersed phase is toluene and the solute is acetone; the physical properties of these
components are reported in [25]. The organic and aqueous phases have a volumetric flow
rate of 1.33 10 <sup>5</sup>and 1.11 10 <sup>5</sup>m<sup>3</sup> s<sup>1</sup>, respectively. The stirrer speed was 6.67 s<sup>1</sup>.

$$
1.33\times10^{-5}
$$

$$
6.67s^{-1}
$$

$$
1.11\times10^{-5}m^3s^{-1}
$$

A simplified CFD model of the RDC with the operating conditions listed above was
created following the approach used by [29]; a schematic representation of the computational domain is shown in Figure3. The domain is three-dimensional and axisymmetric
and comprises 59 compartments. A cut-cell mesh having a bulk size of 0.002 m and a size
at the walls of 0.0008 m is used to discretise the computational domain, resulting in a total
of 117,615 quadrilateral cells. A velocity inlet boundary condition was used at the bottom
for both phases, whilst a pressure outlet condition was used at the top. For the volume
fraction, values proportional to the volumetric flow rate of each phase were imposed at
the bottom, and an *inletOulet* condition was used at the top; likewise, a fixed value of
3
*Ndrop*, corresponding to an inlet Sauter diameter equal to 3 10 m for toluene, was
specified at the bottom, and a zero gradient condition was used at the top. The stirrer wall
rotates around the axis with a rotating speed of 6.67 s<sup>1</sup>, whilst the stator wall is stationary;
both walls were treated as no-slip walls. Interphase momentum transfer of dispersion is
modelled with the drag model of Schiller and Naumann [30] and the lift model of Legendre
and Magnaudet [31], whilst interphase momentum transfer between large interfaces is not
modelled. Both phases were assumed to be turbulent and simulated with a wall-modelled
Large Eddy Simulation (LES) approach with the standard Smagorinsky [18] closure for the
subgrid stresses and a wall function [32] to relax mesh requirements at the walls.

$$
N_{drop},
$$

$$
3\times10^{-3}
$$

$$
6.67s^{-1}
$$

The GEMMA approach was used to simulate the multiphase flow within the column;
given the relatively coarse mesh size compared to the droplet size expected within the
system (known from the experiments of [25]), it was expected that the *Ca*identifier will
be equal to zero everywhere in the domain, effectively reducing GEMMA to a standard
dispersed multifluid formulation. Therefore, the logical switching of *C*<sub>a</sub>was disabled. The
organic phase droplet size was evaluated using the reduced OPOSPM population balance
described above.

$$
C_{\alpha}
$$

$$
C_{\alpha}
$$

The compartment-averaged organic phase holdup and Sauter mean diameter obtained
along the column are compared with the experimental measurements of [25] in Figure4.
Overall, the CFD model is in good agreement with the experiments, with an average error
of 9.2% for the organic phase holdup and 6.5% for the Sauter mean diameter, suggesting
that a good representation of the hydrodynamic behaviour of the system has been obtained.

---

average error of 9.2% for the organic phase holdup and 6.5% for the Sauter mean diameter, 
<u>suggesting that a good representation of the hydrodynamic behaviour of the system has</u> 9 of 17
<u>suggesting that a good representation of the hydrodynamic behaviour of the system has</u>

Dispersed phase outlet
Continuous phase inlet
Dispersed phase outlet
Continuous phase outlet

**Figure 3. Figure 3.**Schematic representation and a Schematic representation and a subsection of the axisymmetric computational domain used subsection of the axisymmetric computational domain 
**Figure 3.** Schematic representation and a  subsection of the axisymmetric computational domain 
used for the RDC simulation. for the RDC simulation.
used for the RDC simulation.

Stage averaged holdup (%)
CFD
Garthe
0.8 1.6 2.4 3.2 4.0
Column height (m)

(**a**)
(**a**)

Stage averaged $d_{32} \times 10^{-3}$ (m)
0.8 1.6 2.4 3.2 4.0
Column height (m)

(**b**)
(**b**)

**Figure 4. Figure 4.**Stage-averaged results along the RDC compared to experimental values [5] for: ( Stage-averaged results along the RDC compared to experimental values [5] for: (a) dispersed **a**)  dis-
**Figure 4.** St**a**ge-averaged results along the RDC compared to experimental values [5] for: (**a**)  dispersed phase holdup; (b) Sauter mean droplet diameter.
persed phase holdup; ( phase holdup; (**b**) Sauter mean droplet diameter. **b**) Sauter mean droplet diameter.

The continuous phase inlet solute concentration is $ 0.962\times10^{3}\mathrm{mol} \mathrm{m}^{-3} $ in the experimental set-up, and the dispersed phase solute concentration is $ 0.171\times10^{3}\mathrm{mol} \mathrm{m}^{-3}. $ The resulting experimental solute concentration profiles along the column are shown in Figure 4. In the main body of the column, situated between the inlets, the solute concentration profiles can be reasonably approximated with a linear trend and are shaded in grey. This section of the column, between 1.45 and 3.2 m, was modelled using 1 CSTR per disk, and, in total, 59 CSTR-in-series were used, with organic flowing up and the aqueous phase flowing down. Once this simple approach had been proved in principle, additional complexity can be added when building the reduced-order model used to represent the system within the mass transfer model. The section associated with the disk near the measuring point located at the height of 2.6 m was used to back-calculate the overall mass transfer coefficient on the organic phase side via Equation (16), using the experimental

$$
0.962\text{×}10^{3}
$$

$$
\mathfrak{m}^{-3}
$$

$$
0.171\text{×}10^{3}
$$

$$
\mathrm{m}^{-3}
$$ values available for droplet size, holdup, *C*<sup>d</sup>and *C*<sup>c</sup>; the resulting experimental *k*<sup>ov</sup>value
5 1
is equal to 1.99 10 ms. This value is used below as a benchmark for the *k*<sub>ov</sub>values
calculated with the hydrodynamic parameters obtained from the CFD results and using different correlations available in the literature for the phase-specific mass transfer coefficients
*kd*and *kc*. A review of correlations used for the prediction of multiphase mass transfer
coefficients was published by Attarakiha et al. [26] and is summarised in Table1.

$$
C_{c};
$$

$$
C_{d}
$$

$$
1.99\times10^{-5}\mathrm{~m}\mathrm{s}^{-1}
$$

$$
k_{ov}
$$

$$
k_{ov}
$$

$$
k_{d}
$$

$$
k_{c}
$$

**Table 1.** Correlations used to evaluate the phase-specific mass transfer coefficients (summarised
3 1
from [26]) employed in estimating *k*<sub>c</sub>and *k*<sub>d</sub>for: *d₃₂* = 2.9 10 m, *U*<sub>s</sub>= 0.025 ms, *a* = 7%.

$$
k_{c}
$$

$$
k_{d}
$$

$$
d_{32}=2.9\times10^{-3}
$$

$$
U_{s}=0.025\mathrm{~ms}^{-1},\alpha=7\%
$$

| Phase | Reference | Correlation | Value(ms-1) |
| --- | --- | --- | --- |
| Continuous | Ranz and Marshall[33] | $k_{c}=\frac{D_{c}}{d_{32}}\left(2+0.6Re_{drop}^{\frac{1}{2}}Sc_{c}^{\frac{1}{3}}\right)$ | $1.93\times 10^{-5}$ |
| Continuous | Treybal [34] | $k_{c}=\frac{D_{c}}{d_{32}}\left(0.725Re_{drop}^{0.57}Sc_{c}^{0.42}(1-\alpha_{d})\right)$ | $5.09\times 10^{-5}$ |
| Continuous | Heertjes et al. [35] | $k_{c}=0.83\sqrt{\frac{D_{c}U_{r}}{d_{32}}}$ | $8.05\times 10^{-5}$ |
| Continuous | Kronig and Brink [36] | $k_{c}=\frac{D_{c}}{d_{32}}\left(0.6\sqrt{Re_{drop}Sc_{c}}\right)$ | $5.82\times 10^{-5}$ |
| Dispersed | Handlos and Baron [37] | $k_{d}=0.00375\frac{U_{d}}{1+\frac{\mu_{d}}{\mu_{c}}}$ | $1.38\times 10^{-4}$ |
| Dispersed | Laddha and Degaleesan [38] | $k_{d}=0.023\frac{U_{r}}{Sc_{c}^{0.5}}$ | $3.25\times 10^{-5}$ |
| Dispersed | Pilhofer and Mowes [39] | $k_{d}=0.002\frac{U_{r}}{1+\frac{\mu_{d}}{\mu_{c}}}$ | $3.17\times 10^{-5}$ |

$$
k_{c}=\frac{D_{c}}{d_{32}}\left(2+0.6Re_{drop}^{\frac{1}{2}}Sc_{c}^{\frac{1}{3}}\right)
$$

$$
1.93\times10^{-5}
$$

$$
k_{c}=\frac{D_{c}}{d_{32}}\left(0.725Re_{drop}^{0.57}Sc_{c}^{0.42}(1-\alpha_{d})\right)
$$

$$
5.09\times10^{-5}
$$

$$
k_{c}=0.83\sqrt{\frac{D_{c}U_{r}}{d_{32}}}
$$

$$
8.05\times10^{-5}
$$

$$
k_{c}=\frac{D_{c}}{d_{32}}\left(0.6\sqrt{Re_{drop}S c_{c}}\right)
$$

$$
5.82\times10^{-5}
$$

$$
k_{d}=0.00375\frac{U_{d}}{1+\frac{\mu_{d}}{\mu_{c}}}
$$

$$
1.38\times10^{-4}
$$

$$
k_{d}=0.023\frac{U_{r}}{Sc_{d}^{0.5}}
$$

$$
3.25\times10^{-5}
$$

$$
k_{d}=0.002\frac{U_{r}}{1+\frac{\mu_{d}}{\mu_{c}}}
$$

$$
3.17\times10^{-5}
$$

As shown in Table1, overall, it was observed that all the correlations give comparable
predictions for both phases; the only exception is the Handlos and Baron [37] correlation,
which overestimates *k*<sub>d</sub>markedly with respect to the other correlations. It was decided to
use the correlation of Treybal [34] for *kc*since this was developed to be used in swarms
of droplets rather than single droplets; the correlation of Laddha and Degaleesan [36] has
been used for *k*<sub>d</sub>since this was derived from penetration theory, as opposed to the empirical
nature of the Pilhofer and Mewes [39] correlation.

$$
k_{d}
$$

$$
k_{c}
$$

$$
k_{d}
$$

The overall mass transfer coefficient evaluated using the selected correlations, informed by the hydrodynamic parameters obtained from the CFD simulation, is equal
to 2.12 10 <sup>5</sup>ms<sup>1</sup>, which corresponds to a relative error of 6.19% with respect to the
reference experimental value of 1.99 10 <sup>5</sup>ms<sup>1</sup>. Such a relatively low error is deemed
satisfactory considering the simplifying assumptions taken in the evaluation of *k*<sub>ov</sub>.

$$
2.12\times10^{-5}\mathrm{~m}\mathrm{s}^{-1}
$$

$$
1.\dot{99}\times10^{-5}ms^{-1}
$$

$$
k_{ov}
$$

To validate the mass transfer modelling approach, the mid-section of the column
shaded in grey in Figure5was modelled as a series of CSTRs, each representing a stage.
This region was selected as it eliminates the requirement for modelling mass transfer in the
column inlets and separators, which cannot be approximated as a series of CSTRs. The inlet
boundary conditions for the first CSTR were given by the experimental values at *x* = 1.5 m.
The CSTRs-in-series model used the predicted *a*, *d*<sub>32</sub>and *U*<sub>r</sub>, averaged over the volume of
the stage, to calculate the mass transfer coefficient using Equation (16). The predicted solute
concentrations in the dispersed and continuous phases are shown in Figure5, with good
agreement with the experimental results. The error is calculated to be 1.1 %, which provides
confidence in the capability of the proposed modelling approach to predict the overall
mass transfer performance in addition to the hydrodynamics in intensified liquid–liquid
extraction devices.

$$
\alpha,d_{32}
$$

$$
x=1.5m
$$

$$
U_{r},
$$

## 3.2. Simulation of a Pulsed Sieve-Plate Extraction Column

Using the data presented by Garthe in [25], a PSEC was simulated. The column has an
internal diameter of 0.08 m and contains 26 plates spaced 0.1 m apart. Plates are 0.001 m
thick, with 0.002 m holes and a fractional free area of 0.2. The column is operated at the
same flow rates at the RDC using the same fluids, with a pulse amplitude of 0.008 m and a
pulse frequency of 1.25 s<sup>1</sup>.

$$
1.25s^{-1}
$$

---

1.1 %, which provides confidence in the capability of the proposed modelling approach to 
11 of 17
<u>predict the overall mass transfer performance in addition to the hydrodynamics in inten-</u>

sified liquid–liquid extraction devices.

$C_c$ (model) $C_d$ (model) $C_c$ (exp) $C_d$ (exp)
Solute concentration x $10^{-3}$ (mol/m³)
Column height (m)
0.8 1.2 1.6 2.0 2.4 2.8 3.2 3.6 4.0 4.4

**Figure 5.** Experimental and modelled profiles of the RDC solute concentration in the organic and
**Figure 5.** Experimental and modelled profiles of the RDC solute concentration in the organic and 
aqueous phase—the grey area indicates the portion of the column covered by the CSTR in the
aqueous phase—the grey area indicates the portion of the column covered by the CSTR in the series 
series model.
model.

A simplified CFD model of the PSEC with the above operating conditions was created, a schematic representation of the computational domain is shown in Figure 6. The domain was modelled as a two-dimensional slice consisting of 176,809 predominantly hexahedral cells with refinement towards the column walls and plates. A velocity inlet condition was used for the aqueous inlet, aqueous outlet, organic inlet, and pulse leg. Flowrates were scaled based on the difference in column cross-sectional free area. The organic outlet was modelled using the pressure inletOulet condition. A $ N_{drop} $ corresponding to an inlet Sauter diameter of $ 2\times 10^{-3} $ m for toluene was specified at the organic inlet, with a zero gradient condition used at the top. Interphase momentum transfer of dispersion is modelled with the drag model of Schiller and Naumann [30], whilst interphase momentum transfer between large interfaces is not modelled. Both phases were assumed to be turbulent and simulated with an Unsteady Reynolds-averaged Navier-Stokes (URANS) [19] approach, with turbulence modelled using the mixture k- $ \varepsilon $ model and a wall function [32] to relax mesh requirements at the walls.

$$
N_{drop}
$$

$$
2\times10^{-3}
$$

As above, the GEMMA approach was used to simulate the multiphase flow within the column. Unlike the RDC case, mesh refinement and a coalesced organic phase below the plates result in large values of IRQ, and therefore, logical switching of $ C_{\alpha} $ was enabled. A critical IRQ value of 16, a dispersed phase volume fraction of 0.01 to 0.99 and a $ \varGamma $ of 4 was used to ensure $ C_{\alpha} $ is equal to a value of 1 in the near-plate region whilst being equal to 0 in the inter-plate region. The organic phase droplet size is evaluated using the reduced OPOSPM population balance described above.

$$
C_{\alpha}
$$

$$
C_{\alpha}
$$

The stage-averaged organic phase holdup and Sauter mean diameter along the column
are compared with the experimental measurements of [25] in Figure7. An error of 1.6% for
the organic phase holdup and 8.0% for the Sauter mean diameter was calculated. A greater
degree of variability is observed in both the experimental and modelled results compared
to the RDC. This is expected due to the dynamic flow conditions observed in a PSEC,
with each pulse consisting of an initial jetting phase with droplet breakage followed by
coalescence at the next plate. As with the RDC, the CFD predicted values reasonably agree
with the experimental observations and, therefore, can be considered a good representation
of the system’s hydrodynamics. Simulating the entire column in 3D with an LES approach
would help give a more accurate hydrodynamic field; however, this is not considered to
be computationally feasible at present. Likewise, URANS-based predictions based on a
Reynolds stress turbulence closure are likely to provide more accurate solutions than those
given above and should be explored in further work. Nevertheless, good agreement with
available data was obtained using the URANS approach adopted.

---

12 of 17
12 of 17

Dispersed phase outlet
Continuous phase inlet
Dispersed phase inlet
Continuous phase outlet
Pulse leg

Processes 2022 , 10 , x FOR PEER REVIEW

**Figure 6. Figure 6.**Schematic Schematic representation and a subsection of the axisymmetric computational domain used representation and a  subsection of the axisymmetric computational domain 
used for the PSEC simulation. for the PSEC simulation.

the column. Unlike the RDC case, mesh refinement and a coalesced organic phase below
the plates result in large values of IRQ, and therefore, logical switching of  𝐶 was ena- 𝛼
bled. A critical IRQ value of 16, a dispersed phase volume fraction of 0.01 to 0.99 and a  𝛤
of 4 was used to ensure  𝐶 is equal to a value of 1 in the near-plate region whilst being 𝛼
equal to 0 in the inter-plate region. The organic phase droplet size is evaluated using the

Stage averaged holdup (%)
CFD
Garthe
0.8 1.6 2.4 3.2 4.0
Column height (m)

(a)
PSEC, with each pulse consisti

Stage averaged $d_{32} \times 10^{-3}$ (m)
Column height (m)

A greater degree of variability is observed in both the experimental and modelled results
compared to the RDC. This is expected due to the dynamic flow conditions observed in a

(b)
ng of an initial jetting phase with droplet breakage followed

by coalescence at the next plate. As with the RDC, the CFD predicted values reasonably **Figure 7 Figure 7..** Stage Stage-averaged results along the PSEC compared to experimental values [-averaged results along the PSEC compared to experimental values [2525] for: (] for: (**a**) dis-**a**) disagree with the experimental observations and, therefore, can be considered a good repre-persed phase holdup; (b) Sauter mean droplet diameter.
persed phase holdup; (**b**) Sauter mean droplet diameter.
sentation of the system’s hydrodynamics. Simulating the entire column in 3D with an LES

Figure 8 presents a block flow diagram showing the schematic representation of the continuous and dispersed phase flows within the PSEC. Q represents volumetric flowrate in mol s <sup>-1</sup> C represents solute concentration, n represents the stage number, N represents the upper stage and subscripts c and d denote the phase. As above, axial solute concentrations for the aqueous and organic phases were calculated based on the assumption that each stage of the PSEC is equivalent to a CSTR. Pulsation of the continuous phase was accounted for via the backflow ratio $ \beta $ , representing the degree of recirculation of the continuous phase between adjacent compartments.

$$
s^{-1}
$$

$$
c
$$

$$
\beta,
$$

Three equations were used to give the continuous phase mass balance. For the aqueous
phase inlet, where *n* = *N*, Equation (17) was used. For all stages between the aqueous
*Q*cCc,in QdCd,o ut
phase inlet and the organic phase inlet, where 0 < *n* < *N*, Equation (18) was used. For the
organic phase inlet, Equation (19) was used: *Stage N VNMTRN*

$$
n\;=\;N,
$$

$$
0<n<N_{\mathrm{j}}
$$

$$
Q_{c}\;C_{c,i n}+Q_{c}\;\beta C_{c,N-1}=Q_{c}C_{c,N}+Q_{c}\beta C_{c,N}+V_{N}{M T R}_{N}
$$

(17)

$$
Q_{c}C_{c,n+1}+Q_{c}\beta C_{c,n+1}+Q_{c}\beta C_{c,n-1}=Q_{c}C_{c,n}+Q_{c}\beta C_{c,n}+Q_{c}\beta C_{c,n}+V_{n}{M T R}_{n}
$$

(18)

---

represents the upper stage and subscripts  𝑐 and  𝑑 denote the phase. As above, axial so-13 of 17
lute concentrations for the aqueous and organic phases were calculated based on the as-

$$
Q_{c}C_{c,1}+Q_{c}\beta C_{c,1}=Q_{c}C_{c,0}+Q_{c}\beta C_{c,0}+V_{n}{M T R}_{0}
$$

(19)

$Q_c C_{c,in}$ $Q_d C_{d,out}$

Stage N $V_N MTR_N$

$Q_c C_{c,N}$ $Q_c \beta C_{c,N}$ $Q_c \beta C_{c,N-1}$ $Q_d C_{d,N-1}$

Stage n+1 $V_{n+1} MTR_{n+1}$

$Q_c C_{c,n+1}$ $Q_c \beta C_{c,n+1}$ $Q_c \beta C_{c,n}$ $Q_d C_{d,n}$

Stage n $V_n MTR_n$

$Q_c \beta C_{c,n}$ $Q_c \beta C_{c,n-1}$ $Q_d C_{d,n-1}$

Stage n-1 $V_{n-1} MTR_{n-1}$

$Q_c C_{c,1}$ $Q_c \beta C_{c,1}$ $Q_c \beta C_{c,0}$ $Q_d C_{d,1}$

Stage 0 $V_0 MTR_0$

$Q_c C_{c,0}$ $Q_d C_{d,in}$

**Figure 8. Figure 8.**Counter Counter-current extraction model block flow diagram.-current extraction model block flow diagram.

Thre The following equation then gives the dispersed phase mass balance: e equations were used to give the continuous phase mass balance. For the aqueous phase inlet, where  𝑛 = 𝑁, Equation (17) was used. For all stages between the aqueous

$$
Q_{d}C_{d,n}=Q_{d}C_{d,n-1}+V_{n}MTR_{n}
$$

(20)
𝑁, Equation (18) was used. For the

organic phase inlet, Equation (19) was used:
The mass transfer rate is calculated using Equation (16). Equations (17)–(20) were
solved iteratively until the axial solute concentrations were invariant with subsequent
iterations. The continuous phase inlet solute concentration is 0.922 10 <sup>3</sup>mol m<sup>3</sup> in the
experimental set-up, and the dispersed phase solute concentration is 0.131 10 <sup>3</sup>mol m<sup>3</sup>,
and the resulting axial solute concentration profile is shown in Figure9.

$$
0.922\times10^{-3}
$$

$$
\mathrm{m}^{3}
$$

$$
0.131\times10^{-3}
$$

$$
\mathfrak{m}^{3},
$$

The axial concentration of the organic and aqueous phases in the column section
was modelled, with good results obtained over the entire column length. The model
correctly predicts that the dispersed phase solute concentration increases along the length
of the column, although the calculated values are slightly greater than those measured
experimentally. The increase in aqueous phase solute concentration along the length of the
column was also modelled, although the model slightly underpredicts in the region of the
aqueous phase inlet. The error was calculated to be 24.3 % which is much larger than the
error calculated in the RDC case. This could be reduced by considering mass transfer in the
upper separator and further compartmentalisation of the PSEC stage, with the near-plate
and inter-plate regions modelled separately, with the allocation of the volumes associated
with each performed dynamically to account for the time-varying nature of PSEC operation.

---

in the ex-
<u>mol m<sup>14 of 173</sup>, and</u>

$C_c$ (model) $C_d$ (model) $C_c$ (exp) $C_d$ (exp)
Solute concentration x $10^{-3}$ (mol/m³)
Column height (m)
0.8 1.2 1.6 2.0 2.4 2.8 3.2 3.6 4.0 4.4

**Figure 9.** Experimental and modelled profiles of PSEC solute concentration in the organic and
**Figure 9.** Experimental and modelled profiles of PSEC solute concentration in the organic and aqueaqueous phase.
ous phase.

## 4. Conclusions

The axial concentration of the organic and aqueous phases in the column section was 
This work introduces a mass transfer modelling approach informed by hydrodynamic
modelled, with good results obtained over the entire column length. The model correctly 
information obtained via detailed CFD simulations performed using GEMMA. The appredicts that the dispersed phase solute concentration increases along the length of the 
proach can be used to evaluate mass transfer driven by concentration gradients and relies
column, although the calculated values are slightly greater than those measured experion a reduced-order representation of the device of interest. The following key conclusions
mentally. The increase in aqueous phase solute concentration along the length of the colcan be drawn from this manuscript:
umn was also modelled, although the model slightly underpredicts in the region of the

It has been shown that the proposed modelling methodology represents the mass
aqueous phase inlet. The error was calculated to be 24.3 % which is much larger than the 
transfer performance in liquid–liquid extraction columns and provides a pragmatic
error calculated in the RDC case. This could be reduced by considering mass transfer in 
tool for evaluating complex multiphase flows.
the upper separator and further compartmentalisation of the PSEC stage, with the near-

The hydrodynamic modelling is in good agreement with the experimental observations
plate and inter-plate regions modelled separately, with the allocation of the volumes asfor stage-averaged dispersed phase holdup and Sauter mean droplet diameter in an
sociated with each performed dynamically to account for the time-varying nature of PSEC 
RDC and a PSEC.
operation.

Furthermore, the modelled axial continuous and dispersed phase solute concentrations
in the mid-section of the RDC are in good agreement with experimental observations
**4. Conclusions**
when modelled as a series of CSTRs.

Finally, the modelled axial solute concentrations in both the continuous and dispersed This work introduces a mass transfer modelling approach informed by hydrodynamic information obtained via detailed CFD simulations performed using GEMMA phases of a PSEC agree with experimental observations when modelling the column as. The 
approach can be used to evaluate mass transfer driven by concentration gradients and a series of CSTRs, with pulsation accounted for via backflow in the continuous phase.
relies on a reduced-order representation of the device of interest. The following key con-
It is recommended that future work should focus on the validation of the modelling

clusions can be drawn from this manuscript:
approach over a wider range of operating conditions and chemical systems, further compartmentalisation of the fluid domain, relaxation of the chemical equilibrium assumption at
the interface and the implementation of local mass transfer modelling capabilities directly
within the GEMMA approach.

**Author Contributions:** Conceptualisation, A.F. and A.D.S.; methodology, A.F. and A.D.S.; software,
A.D.S., M.C. and A.F.; validation, A.F. and A.D.S.; formal analysis, A.F. and A.D.S.; investigation,
A.F. and A.D.S.; resources, A.F. and A.D.S.; data curation, A.F. and A.D.S.; writing—original draft
preparation, A.F. and A.D.S.; writing—review and editing, A.D.S., B.H., F.M., M.F., M.C. and D.W.T.;
visualisation, A.F. and A.D.S.; supervision, B.H., F.M. and M.F.; project administration, B.H., F.M. and
M.F.; funding acquisition, B.H., F.M. and M.F. All authors have read and agreed to the published
version of the manuscript.

---

**Funding:** This research was funded by the EPSRC through grant EP/R513258/1 and by the UK
Department for Business, Energy and Industrial Strategies (BEIS) through the Advanced Fuel Cycle
Programme (AFCP), which is a cooperation agreement between BEIS and the National Nuclear
Laboratory (NNL). The University of Leeds was funded by the NNL under contract PO1017418. This
work was undertaken on ARC4, part of the High Performance Computing facilities at the University
of Leeds, UK.

**Data Availability Statement:** The data presented in this study are available on request from the
corresponding author.

**Conflicts of Interest:** The authors declare no conflict of interest.

## Nomenclature

*a* interfacial area per unit volume, *m<sup>2</sup> m<sup>3</sup>*
*C* concentration, *mol m<sup>3</sup>*
*C* dispersed phase concentration driving force, *C* = *K*<sub>eq</sub>*C*<sub>c</sub>
d d
*C*<sub>a</sub>large interface identifier
*d* droplet diameter, *m*
*d*<sub>30</sub>volume mean droplet diameter, *m*
*d*<sub>32</sub>Sauter mean droplet diameter, *m*
*D* molecular diffusion coefficient, *m<sup>2</sup> s<sup>1</sup>*
*F* Force, *kgms<sup>2</sup>*
4
*h*<sub>0</sub>initial film thickness, assumed to be 1 10 *m* in [23]
8
*h*<sub>f</sub>finial film thickness, assumed to be 1 10 *m* in [23]
*IRQ* interface resolution quality
1
*k*<sub>c</sub>continuous phase mass transfer coefficient, *ms*
1
*k*<sub>d</sub>mass transfer coefficient, *ms*
1
*k*<sub>ov</sub>mass transfer coefficient, *ms*
*K*<sub>eq</sub>equilibrium distribution of solute
*MTR* mass transfer rate, *mol m <sup>3</sup>s<sup>1</sup>*
3
*N*<sub>drop</sub>drop number density, *m*
*n*<sub>daughter</sub>mean number of daughter drops
3 1
*Q* volumetric flow rate, *m s*
*r*<sub>breakage</sub>droplet break-up rate
*rcoalescence*droplet coalescence rate
*Re* Reynolds number for multi-particle system, *Re* = *d₃₂U*<sub>s</sub>*r*<sub>x</sub>/*m*<sub>x</sub>
*Re*<sub>drop</sub>Reynolds number for single droplet system, *Re* = *dU*<sub>s</sub>*r*<sub>x</sub>/*m*<sub>x</sub>
*S* source term
*Sc*<sub>x</sub>phase x Schmidt number, *Sc*<sub>x</sub>= *m*<sub>x</sub>/*r*<sub>x</sub>*D*<sub>x</sub>
*Sh*<sub>x</sub>phase x Sherwood number, *Sh*<sub>x</sub>= *k*<sub>x</sub>*d₃₂*/*D*<sub>x</sub>
*t* time, *s*
1
*U* velocity, *ms*
1
*U*<sub>c</sub>compressive velocity, *ms*
1
*U*<sub>s</sub>slip velocity, *ms*
1
*U*<sub>r</sub>relative velocity, *ms*
*V* volume, *m<sup>3</sup>*
3
*V*<sub>cell</sub>cell volume, *m*
*a* volume fraction
*b* ratio of backflow to net forward flow
G user-defined value
2 3
*e* turbulence dissipation rate, *m s*
*p* 3.1416
3
*r* density, *kgm*
2
*m* dynamic viscosity, *Nsm*
2
*s* interfacial tension, *Jm*

$$
m^{2}m^{-3}
$$

$$
m^{-3}
$$

$$
C
$$

$$
C_{d}^{*}
$$

$$
C_{d}^{*}=K_{eq}C_{c}
$$

$$
C_{\alpha}
$$

$$
d
$$

$$
d_{30}
$$

$$
d_{32}
$$

$$
m^{2}s^{-1}
$$

$$
D
$$

$$
F
$$

$$
kgms^{-2}
$$

$$
h_{0}
$$

$$
1\times10^{-4}m
$$

$$
h_{f}
$$

$$
1\times10^{-8}m
$$

$$
IRQ
$$

$$
k_{c}
$$

$$
ms^{-1}
$$

$$
k_{d}
$$

$$
ms^{-1}
$$

$$
k_{ov}
$$

$$
K_{eq}
$$

$$
ms^{-1}
$$

$$
MTR
$$

$$
m^{-3}s^{-1}
$$

$$
N_{drop}
$$

$$
m^{-3}
$$

$$
n_{daughter}
$$

$$
Q
$$

$$
m^{3}s^{-1}
$$

$$
r_{breakage}
$$

$$
r_{coalesce}
$$

$$
Re=d_{32}U_s\rho_x/\mu_x
$$

$$
Re
$$

$$
Re=d U_{s}\rho_{x}/\mu_{x}
$$

$$
Re_{drop}
$$

$$
S
$$

$$
S c_{x}=\mu_{x}/\rho_{x}D_{x}
$$

$$
S c_{x}
$$

$$
S h_{x}=k_{x}d_{32}/D_{x}
$$

$$
Sh_{x}
$$

$$
t
$$

$$
ms^{-1}
$$

$$
ms^{-1}
$$

$$
U
$$

$$
U_{c}
$$

$$
ms^{-1}
$$

$$
U_{s}
$$

$$
ms^{-1}
$$

$$
U_{\ r}
$$

$$
m^{3}
$$

$$
V
$$

$$
V_{cell}
$$

$$
m^{3}
$$

$$
\alpha
$$

$$
\beta
$$

$$
\epsilon
$$

$$
m^{2}s^{-3}
$$

$$
\pi
$$

$$
\rho
$$

$$
k g m^{-3}
$$

$$
\mu
$$

$$
Nsm^{-2}
$$

$$
\sigma
$$

$$
Jm^{-2}
$$

---

## Subscript c

| c | continuous phase |
| --- | --- |
| d | dispersed phase |
| i | interface |
| in | inlet |
| min | minimum value |
| max | maximum value |
| N | upper stage |
| n | stage number |
| out | outlet |
| ov | overall |
| x | generic phase x |

$$
c
$$

$$
d
$$

$$
i
$$

$$
in
$$

$$
m i n
$$

$$
m a x
$$

$$
N
$$

$$
n
$$

$$
o u t
$$

$$
o v
$$

*of Spent Nuclear Fuel*; Taylor, R., Ed.; Woodhead Publishing: Oxford, UK, 2015; pp. 125–151.
2.D’Auria, F. Prioritisation of nuclear thermal-hydraulics researches. *Nucl. Eng. Des.* **2018**,*340*, 105–111. [CrossRef]
3. Marschall, H. Towards the Numerical Simulation of Multi-Scale Two-Phase Flows. Ph.D. Thesis, Lehrstuhl für Technische Chemie,
Technische Universität München, Munich, Germany, 2011.
4.Prosperetti, A.; Tryggvason, G. *Computational Methods for Multiphase Flow*; Cambridge University Press: Cambridge, UK, 2007.
5. Hirt, C.W.; Nichols, B.D. Volume of fluid VOF method for the dynamics of free boundaries. *J. Comput. Phys.* **1981**,*39*, 201–225.
[CrossRef]
6.Strubelj, L.; Tiselj, I. Two-fluid model with interface sharpening. *Int. J. Numer. Methods Eng.* **2011**,*85*, 575–590. [CrossRef]
7. Hänsch, S.; Lucas, D.; Krepper, E.; Höhne, T. A multi-field two-fluid concept for transitions between different scales of interfacial
structures. *Int. J. Multiph. Flow* **2012**,*47*, 171–182. [CrossRef]
8. Mathur, A.; Dovizio, D.; Frederix, E.M.A.; Komen, E.M.J. A Hybrid Dispersed-Large Interface Solver for multiscale two-phase
flow modelling. *Nucl. Eng. Des.* **2019**,*344*, 69–82. [CrossRef]
9. Marschall, H.; Hinrichsen, O. Numerical simulation of multiscale two-phase flows using a hybrid interface-resolving two-fluid
model (HIRES-TFM). *J. Chem. Eng. Jpn.* **2013**,*46*, 517–523. [CrossRef]
10. de Santis, A.; Colombo, M.; Hanson, B.C.; Fairweather, M. A generalised multiphase modelling approach for multiscale flows.
*J. Comput. Phys.* **2021**,*436*, 110321. [CrossRef]
11.De Santis, A.; Hanson, B.C.; Fairweather, M. Hydrodynamics of Annular Centrifugal Contactors: A CFD analysis using a novel
multiphase flow modelling approach. *Chem. Eng. Sci.* **2021**,*242*, 116729. [CrossRef]
12. Theobald, D. Computational Engineering for Nuclear Solvent Extraction Equipment. Ph.D. Thesis, University of Leeds, Leeds,
UK, 2020.
13. Hlawitschka, M.W.; Bart, H.J. CFD-mass transfer simulation of an RDC column. In *Computer Aided Chemical Engineering*; Elsevier:
Amsterdam, The Netherlands, 2012; Volume 31, pp. 920–924.
14. Attarakih, M.; Hlawitschka, M.W.; Abu-Khader, M.; Al-Zyod, S.; Bart, H.J. CFD-population balance modeling and simulation of
coupled hydrodynamics and mass transfer in liquid extraction columns. *Appl. Math. Model.* **2015**,*39*, 5105–5120. [CrossRef]
15. Alzyod, S.; Attarakih, M.; Bart, H.J. CFD modelling of pulsed sieve plate liquid extraction columns using OPOSPM as a reduced
population balance model: Hydrodynamics and mass transfer. In *Computer Aided Chemical Engineering*; Elsevier: Amsterdam,
The Netherlands, 2018; Volume 43, pp. 451–456.
16. The OpenFOAM Foundation. OpenFOAM-User Guide. 2019. Available online:https://www.openfoam.com(accessed on
31 March 2022).
17. Weller, H.G.; Tabor, G.; Jasak, H.; Fureby, C. A tensorial approach to computational continuum mechanics using object-oriented
techniques. *Comput. Phys.* **1998**,*12*, 620–631. [CrossRef]
18.Smagorinsky, J. General Circulation Experiments With the Primitive Equations. *Mon. Weather Rev.* **1963**,*91*, 99–164. [CrossRef]
19. Behzadi, A.; Issa, R.; Rusche, H. Modelling of dispersed bubble and droplet flow at high phase fractions. *Chem. Eng. Sci.* **2004**,*59*,
759–770. [CrossRef]
20. Krepper, E.; Lucas, D.; Frank, T.; Prasser, H.-M.; Zwart, P.J. The inhomogeneous MUSIG model for the simulation of polydispersed
flows. *Nucl. Eng. Des.* **2008**,*238*, 1690–1702. [CrossRef]
21. Drumm, C.; Attarakih, M.; Hlawitschka, M.W.; Bart, H.-J. One-Group Reduced Population Balance Model for CFD Simulation of
a Pilot-Plant Extraction Column. *Ind. Eng. Chem. Res.* **2010**,*49*, 3442–3451. [CrossRef]
22. Martinez-Bazan, C.; Montanes, J.L.; Lasheras, J.C. On the breakup of an air bubble injected into a fully developed turbulent flow.
*J. Fluid Mech.* **1999**,*401*, 157–182. [CrossRef]

$$
x
$$

## References

1. Hanson, B. Process engineering and design for spent nuclear fuel reprocessing and recycling plants. In *Reprocessing and Recycling*

23. Prince, M.J.; Blanch, H.W. Bubble coalescence and break-up in air-sparged bubble columns. *AIChE J.* **1990**, *36*, 1485–1499.
[CrossRef]

---

24. Wardle, K.E. Hybrid multiphase CFD simulation for liquid-liquid interfacial area prediction in annular centrifugal contactors. In
Proceedings of the Global 2013, Salt Lake City, UT, USA, 29 September–30 October 2013.
25. Garthe, D. Fluid-Dynamics and Mass Transfer of Single Particles and Swarm of Particles in Extraction Columns. Ph.D. Thesis,
Lehrstuhl für Fluidverfahrenstechnik, Technische Universität München, Munich, Germany, 2006.
26. Attarakih, M.; Al-Zyod, S.; Abu-Khader, M.; Bart, H.J. PPBLAB: A New Multivariate Population Balance Environment for
Particulate System Modelling and Simulation. *Procedia Eng.* **2012**,*42*, 1445–1462. [CrossRef]
27.Lewis, W.K.; Whitman, W.G. Principles of Gas Absorption. *Ind. Eng. Chem.* **1924**,*16*, 1215–1220. [CrossRef]
28. Jourdan, N.; Neveux, T.; Potier, O.; Kanniche, M.; Wicks, J.; Nopens, I.; Rehman, U.; Le Moullec, Y. Compartmental Modelling in
chemical engineering: A critical review. *Chem. Eng. Sci.* **2019**,*210*, 115196. [CrossRef]
29. Attarakih, M.M.; Drumm, C.; Bart, H. Solution of the population balance equation using the sectional quadrature method of
moments (SQMOM). *Chem. Eng. Sci.* **2009**,*64*, 742–752. [CrossRef]
30. Yilmaz, F.; Gundogdu, Y.M. Analysis of conventional drag and lift models for multiphase CFD modeling of blood flow. *Korea-Aust.*
*Rheol. J.***2009**,*21*, 161–173.
31. Legendre, D.; Magnaudet, J. The lift force on a spherical bubble in a viscous linear shear flow. *J. Fluid Mech.* **1998**,*368*, 81–126.
[CrossRef]
32. Launder, B.E.; Spalding, D.B. The numerical computation of turbulent flows. *Comput. Methods Appl. Mech. Eng.* **1974**,*3*, 269–289.
[CrossRef]
33.Ranz, W.E.; Marshall, W.R. Evaporation from drosp. *Chem. Eng. Prog.* **1952**,*48*, 141–146.
34.Treybal, R.R. *Liquid Extraction*; McGraw Hill: New York, NY, USA, 1963.
35. Heertjes, P.M.; Holve, P.M.; Talsma, H. Mass transfer between isobutanol and water in a spray-column. *Chem. Eng. Sci.* **1954**,*3*,
122–142. [CrossRef]
36.Kronig, R.; Brink, J. On the theory of extraction from falling droplets. *Appl. Sci. Res.* **1954**,*2*, 142–154. [CrossRef]
37.Handlos, A.E.; Baron, T. Mass and heat transfer from drops in liquid-liquid extraction. *AIChE J.***1957**,*3*, 127–136. [CrossRef]
38.Laddha, G.S.; Degaleesan, T.E. *Transport Phenomena in Liquid Extraction*; Tata–McGraw Hill: New York, NY, USA, 1976.

39.Pilhofer, T.; Mowes, D. *Siebboden Extraktionkolonnen*; VCH: Vancouver, BC, Canada, 1979.