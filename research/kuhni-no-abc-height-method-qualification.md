# Kühni ECR height/HETS/overall-efficiency method qualification — no assumed HETS

**Decision:** **blocked for a numeric RRBO/NMP HETS, active-height, or
overall/Murphree-efficiency interval.** No located source supplies a
visually verified, directly applicable empirical HETS or efficiency
correlation for either specified RRBO/NMP orientation and the supplied data
do not support a directly justified empirical HETS, height, or stage-
efficiency calculation. This is an evidence conclusion, not a claim that a
Kühni ECR cannot be designed or that no such publication exists.

This is a substantive literature qualification only. It does not change data,
run a design calculation, select a speed, assume HETS, infer an outlet
composition, invoke JobABC, or recommend or prescribe an alternative solver.

## 1. Question, fixed envelope, and acceptance rule

The requested geometry and speed envelope is:

| Quantity | Required design envelope |
|---|---:|
| compartment height ratio, \(h_c/D\) | 0.20–0.30 |
| rotor diameter ratio, \(D_R/D\) | 0.33–0.50 |
| stator free-area fraction, \(\epsilon\) | 0.20–0.40 |
| rotor speed | 30–70 rpm |

The two possible phase orientations at their stated temperatures are:

| Case | Continuous / dispersed phase | \(\rho_C,\rho_D\) (kg m\(^{-3}\)) | \(\mu_C,\mu_D\) (Pa s) | \(\sigma\) (N m\(^{-1}\)) | \(\mu_D/\mu_C\) |
|---|---|---:|---:|---:|---:|
| A, 60 °C | NMP / RRBO | 997, 856 | 0.001083, 0.0300 | 0.0103 | 27.7 |
| B, 40 °C | RRBO / NMP | 869, 1015 | 0.0598, 0.001416 | 0.0110 | 0.0237 |

An admissible **direct engineering method** would have to give either (a)
HETS, height per theoretical stage, or (b) a clearly defined overall or
Murphree stage efficiency with the equilibrium convention, stage geometry,
and backmixing treatment stated. Its demonstrated system/domain must not be
silently replaced by RRBO/NMP. A numerical result cannot follow merely
because a general Kühni geometry range is available.

## 2. Result of the method screen

| Candidate | What it actually supplies | Status for current numeric HETS/height | Reason |
|---|---|---|---|
| Perry, with Mögli–Bühlmann and Pratt–Stevens guidance | Kühni geometry and pilot-to-commercial recommendations | **Geometry admitted; no height method** | It gives \(D_R/D\), \(h_c/D\), free-area and pilot guidance, not an HETS or stage-efficiency equation. |
| Sulzer ECR product literature | Commercial/pilot equipment context and nominal industrial speed context | **Context only** | A product range is not a transfer-performance correlation. |
| Garthe | Characteristic/swarm velocity and holdup hydrodynamics | **No direct HETS/efficiency result from the inspected equations** | The inspected Eqs. 5.6–5.7 and 8.3 do not yield theoretical stages, HETS, or component transfer duty; this does not characterize every mass-transfer result in the thesis. |
| Kumar & Hartland (1999) | Individual mass-transfer correlations extended to several column types | **Not-yet primary-equation-verified for use** | Publisher full text was inaccessible. Its abstract reports mass-transfer errors, not HETS error. A secondary image of its equation is not governing primary evidence. |
| Hemmati, Torab-Mostaedi & Asadollahzadeh (2015) | Axial-diffusion interpretation and an empirical enhancement factor intended to estimate height | **Priority not-yet-verified direct-height lead** | The accessible primary record identifies a 117-mm, two-acetone-system study and 36 experiments, but not the full governing equation/ranges/error. It is not RRBO/NMP and does not report HETS or a Murphree-efficiency correlation. |
| Asadollahzadeh et al. (2017) | Acetone-system \(Sh_{oc}\), area and axial-dispersion model | **Not a direct HETS/efficiency result** | Its two fitted overall Sherwood equations are for dilute acetone/toluene/water in one small pilot column; they require equilibrium, diffusivity, holdup/drop size and axial dispersion before height can be determined. |
| Dongaonkar, Pratt & Stevens (1991); Steiner, Kumar & Hartland (1988) | Primary experiments/correlations concerning axial dispersion/backmixing | **Important evidence; not-yet direct-equation-verified** | The accessible publisher records identify the measured Kühni/backmixing subject, but the governing full equations and RRBO/NMP applicability were not obtained and visually checked. |
| Weber, Meyer & Jupke (2019) performance-map population balance | A published route that outputs HETS/flooding and explicitly includes backmixing | **Excluded complex-solver comparison** | Its HETS map belongs to an 80-mm water/toluene/acetone model at 150/200 rpm, not this design envelope. It is retained only to prevent backmixing double counting, not as a replacement route. |
| Laitinen et al. (2019) 1-D axial-dispersion model | A system-fitted, equilibrium-coupled rate model with axial dispersion | **Excluded complex-solver comparison** | It was fitted/validated for levulinic acid/water/2-MTHF in ECR60/50G. It is not an RRBO/NMP HETS correlation and is not proposed as an alternative route. |

### Qualification conclusion

**No qualified direct engineering HETS, height, or overall/Murphree-
efficiency method was located in the reviewed accessible evidence.** This
does not prove that no usable method exists. In particular, Hemmati (2015)
appears to be a direct-height lead, but its governing pages have not yet been
obtained and visually verified. Weber and Laitinen are retained as excluded
complex-solver comparisons, not recommended replacement routes.

Accordingly, this review does **not** offer the often quoted
0.1–0.8 m/stage Weber-map span as an RRBO/NMP interval, and does not convert
the prior 1.0 m/stage screening value into evidence. Both would be arbitrary
transfers across chemistry, geometry and speed domains.

## 3. What the directly inspected equations do — and do not — mean

### 3.1 Asadollahzadeh: coefficient/axial-dispersion evidence, not efficiency

The primary PDF was inspected page-by-page in the existing source record.
It is a dilute acetone (about 3.5 wt%) toluene/water study at ambient
temperature. The text says 113 mm ID while its geometry table gives 117 mm;
the report should therefore be described as a **113/117 mm, ten-stage**
apparatus rather than resolving that internal discrepancy by assumption.

Its visually checked equations include:

\[
a = \frac{6\phi}{d_{32}} \tag{2}
\]

\[
N_{oc}=\frac{K_{oc}aH}{V_C}
       =(\mathrm{NTU})_{oc}=\frac{H}{(\mathrm{HTU})_{oc}}, \qquad
Pe_C=\frac{HV_C}{E_C},\quad Pe_D=\frac{HV_D}{E_D}. \tag{3–6}
\]

The fitted **overall continuous-phase Sherwood** equations on printed p. 158
are:

\[
Sh_{oc}=4.89+2.19\,Re(1-\phi)^{-0.65}
\quad\text{(dispersed-to-continuous acetone transfer)} \tag{27}
\]

\[
Sh_{oc}=-5.19+5.39\,Re^{0.78}(1-\phi)^{-0.46}
\quad\text{(continuous-to-dispersed acetone transfer).} \tag{28}
\]

Here \(Sh_{oc}\) is a coefficient/area-rate quantity (the source defines
\(Re=d_{32}V_s\rho_C/\mu_C\)); it is **not** a Murphree stage efficiency and
not HETS. To turn it into a height for another system requires, at minimum,
\(d_{32}\), \(\phi\), transfer-component diffusivities, phase equilibrium and
the composition-dependent driving force, phase flows, and the axial
dispersion closure/boundary conditions. The paper obtains \(K_{oc}a\) from
measured profiles and equilibrium data and explicitly takes dispersed-phase
axial dispersion as negligible for its own system. That is not a safe default
for either RRBO/NMP orientation.

Its stated reduced average prediction error is 3.75% for those fitted
Sherwood equations. That is an error on its acetone-system \(Sh_{oc}\)
correlations, **not** uncertainty on an RRBO/NMP HETS or on a Murphree
efficiency.

### 3.2 Kumar–Hartland: do not promote a secondary transcription

The accessible primary publisher page for Kumar & Hartland (1999) establishes
that the continuous-side single-drop correlation used 596 measurements from
ten groups (14.1% average absolute error) and that the predicted overall
dispersed-side coefficient comparison had 24.5% average absolute relative
error. It also states that the extraction-column corrections incorporate
power per mass and dispersed holdup and were obtained from *simulated*
overall coefficients for pulsed, Karr, Kühni and RDC columns.

Those statements make the paper a relevant lead for individual coefficient
closure. They do not establish HETS accuracy, nor do they provide an
available, primary-page-verified equation here. A legible equation attributed
to it appears in the 2017 paper's secondary comparison table, but it is not
accepted as the governing transcription in this qualification. In particular,
neither the 14.1% nor 24.5% error may be applied as a height uncertainty.

### 3.3 Hemmati: a priority, not-yet-verified height-estimation lead

Hemmati, Torab-Mostaedi and Asadollahzadeh (2015) is the closest located
primary publication to an empirical height route. The publisher record
reports a 117-mm Kühni column, 36 experiments, toluene/acetone/water and
\(n\)-butyl-acetate/acetone/water systems, axial-diffusion modelling, and an
experimentally determined enhancement-factor correlation in Reynolds number
and dispersed-phase holdup. The record says the correlation can be used to
estimate column height for different processes.

That statement does not make it a current governing height correlation:
the accessible record does not expose the complete printed equation,
calibration range, or reported numerical fit error for visual verification.
This is a **not-yet-verified access boundary**, not a finding that the
publication failed its own validation.
Even if obtained, its acetone systems, phase properties, equilibrium, and
117-mm column must be screened before being extrapolated to either
RRBO/NMP orientation at 30–70 rpm. It supplies neither a published
RRBO/NMP HETS band nor a Murphree stage-efficiency equation.

### 3.4 Garthe: the inspected hydrodynamic equations cannot stand in for transfer height

The local primary thesis includes mass-transfer material as well as
hydrodynamics. This finding is deliberately narrower: the visually checked
printed-p.86 Eqs. 5.6–5.7 and rendered printed-p.126 Eq. 8.3 are not an
end-to-end HETS or efficiency equation:

\[
\frac{v_s}{v_o} =
\sqrt{\frac{C_{D,o}(Re_o)}{C_{D,o}(Re_s)}
\cdot(1-h_d)^{4.65}}\;.
\]

The rendered page shows the holdup term under the radical (the source uses a
multiplication dot between the two factors; the display above expresses that
same product). Its printed p. 86 Eqs. 5.6–5.7 provide characteristic
velocity/power-number hydrodynamics; Eq. 8.3 is a swarm/holdup relation.
They are valuable for slip/holdup modelling, but those inspected equations do
not provide a transfer coefficient, equilibrium-stage count, HETS, or
efficiency. No blanket claim is made about all other thesis sections.

Garthe Figure 5.20 lists 143 Kühni points with 10.7% relative error over
\(D_C=72\)–152 mm, \(d_A=41\)–85 mm, stator diameter 47.5–83.2 mm,
50–250 rpm and drops 0.9–6.4 mm. The swarm relation reports 23.5% relative
error. These are hydrodynamic correlation/data errors, not HETS error bars.
The requested 30–70 rpm range intersects only 50–70 rpm and is otherwise
below this cited speed envelope; no current target diameter was supplied in
this question to establish a diameter intersection.

## 4. Backmixing, overall efficiency, and Murphree efficiency

These terms must not be combined as if they were interchangeable:

* **Overall coefficient** \(K_{oc}\), \(K_{oc}a\), or \(Sh_{oc}\) describes
  rate/resistance under its stated concentration reference and model.
* **Murphree stage efficiency** compares an actual outlet change with the
  change to an equilibrium outlet for a specified physical stage and phase
  convention.
* **Overall stage efficiency** is a cascade/result convention and must state
  whether axial mixing, non-equilibrium contacts, and both phases are already
  represented.
* **HETS** is active height per *theoretical equilibrium* stage in the
  particular design/model basis. It is not generally \(h_c/E_M\), and a
  physical-compartment count cannot be obtained by applying an unverified
  efficiency multiplier to a HETS.

The double-counting hazard is concrete. Weber et al. state that their
population-balance model considers continuous-phase backmixing by the
Breysse–Bühlmann model. A HETS output from that configured model already
contains the effect represented by its backmixing closure; applying a
separate Breysse–Bühlmann, axial-dispersion, or arbitrary Murphree penalty to
that HETS would double count unless the actual configured equations prove the
effect is absent.

Conversely, Asadollahzadeh solves an axial-dispersion formulation using
\(E_C\), and assumes \(E_D\) negligible for its acetone test system. It must
not be treated as an implicit universal efficiency conversion. Dongaonkar,
Pratt and Stevens measured profile-derived mass-transfer and backmixing
parameters for MIBK/water/acetic acid; their accessible abstract establishes
the method's relevance but not a transferable numeric RRBO/NMP correction.

## 5. Applicability to the requested envelope

### Geometry and scale-up context

Perry's printed p. 15-83 reports the requested \(D_R/D=0.33\)–0.50,
\(h_c/D=0.20\)–0.30 and free-area 0.20–0.40 recommendations, attributed in
that passage to Pratt–Stevens and Mögli–Bühlmann. It further recommends a
60-mm pilot for specifying columns up to 1 m and a 150-mm pilot for larger
targets. The same passage treats free area as a throughput/axial-mixing/
mass-transfer trade-off and allows compartment geometry to be tailored.

Thus the requested ratios are literature-aligned geometry guidance. They
neither select the location within the envelope nor make an HETS correlation
valid. This report deliberately keeps them separate from a prior 0.5D
compartment-height screening geometry, which is outside Perry's reported
0.20–0.30 range.

Sulzer's E10556 brochure gives a 10–70 rpm typical industrial context, ECR
diameters of 30 mm–3.5 m, and 32/60/150-mm pilot equipment. Its product page
states 10–100 rpm in the current revision. The revision difference is not a
physical validity limit. The requested 30–70 rpm is therefore consistent
with one vendor practice envelope, but it is not validation of an
RRBO/NMP mass-transfer or HETS model.

### Chemistry and orientation gap

The best documented published HETS map (Weber) used a 80-mm, 2.95-m Kühni
column with 50-mm compartments, 45-mm rotor, 40% free stator area,
water/toluene/acetone, and highlighted 150/200-rpm operation. Its physical
property table has continuous aqueous viscosity about 0.00103–0.00113 Pa s,
dispersed organic viscosity about 0.000566–0.000596 Pa s, and interfacial
tension 0.02431–0.03431 N m\(^{-1}\). It cannot bound:

* **A:** a dispersed phase roughly 28 times as viscous as its continuous
  phase, at 30–70 rpm and \(\sigma=0.0103\) N m\(^{-1}\); or
* **B:** a continuous phase about 42 times as viscous as its dispersed phase,
  at 30–70 rpm and \(\sigma=0.0110\) N m\(^{-1}\).

The 2017 acetone correlation has the same core limitation: its continuous
phase is approximately water-like and its dispersed phase approximately
toluene-like, with \(\sigma=0.0275\)–0.0301 N m\(^{-1}\), not either present
orientation. Its 0.212 free-area apparatus is near the lower requested
free-area edge but that single geometric similarity does not bridge the
viscosity, interfacial-tension, solute/equilibrium, speed, and scale gaps.

## 6. Next evidence gate — not a new solver roadmap

No pilot test is made mandatory by this literature finding. The present block
is simpler: the reviewed, accessible evidence does not currently justify a
numerical RRBO/NMP interval. The next gate is therefore documentary and
empirical rather than a new modelling exercise:

1. obtain the complete primary governing pages of Hemmati et al. (2015),
   including its enhancement-factor equation, variable definitions,
   calibration envelope and error statement, and visually verify them;
2. assess that **simple empirical height route** against both RRBO/NMP
   orientations, the requested 30–70 rpm range and the fixed geometry
   envelope, without inserting unavailable properties or an assumed
   efficiency; and
3. if its domain does not cover the case, record that limitation and retain
   the no-numeric-interval conclusion. Do not substitute a population balance,
   CFD, or any other alternative solver.

## 7. Source manifest and audit trail

| Source | Class / access | Checked pages, equations, domain and reported error | Use and limitation |
|---|---|---|---|
| [Perry's Chemical Engineers' Handbook, 8th ed.](https://www.mheducation.com/highered/mhp/product/perry-s-chemical-engineers-handbook-eighth-edition.html), Section 15 | Published handbook; cited through printed p. 15-83 | p. 15-83: \(D_i/D_t=0.33\)–0.50, \(h_c/D_t=0.20\)–0.30, free area 0.20–0.40, 60/150-mm pilot recommendation and geometry/backmixing trade-off. No HETS equation/error is provided. | Admits the requested geometry envelope only. It attributes the guidance to Mögli–Bühlmann and Pratt–Stevens; it is not a transfer-height correlation. |
| [Sulzer, Kühni agitated columns (ECR)](https://www.sulzer.com/en/shared/products/kuehni-agitated-columns-ecr) and [E10556 brochure](https://www.sulzer.com/en/-/media/files/products/separation-technology/brochures/english/liquid_liquid_extraction_technology_e10556_en_web.pdf) | Manufacturer current page and brochure | Web page: 30 mm–3.5 m and 10–100 rpm. E10556 (5.2025): pp. 4, 8–9 give 10–70 rpm, adjustable compartment geometry, 32/60/150-mm pilots and pilot/scale-up guidance. No HETS/error equation. | Equipment/practice context, not a universal validity range or efficiency method. |
| [Garthe thesis](attached_assets/Paper_1788587264307.pdf) | Local primary thesis, visually rendered | Printed p. 86 Eqs. 5.6–5.7; printed p. 126 Eq. 8.3. Figure 5.20: 143 Kühni points, 10.7% characteristic-velocity error, \(D_C=72\)–152 mm, 50–250 rpm, 0.9–6.4-mm drops. Eq. 8.3 render: `.agents/outputs/garthe-eq83-correct/eq83-radical-crop.png`. | The inspected equations are hydrodynamic and do not give end-to-end HETS; this does not characterize uninspected thesis mass-transfer sections. |
| [Kumar & Hartland (1999)](https://doi.org/10.1205/026387699526359), *Chem. Eng. Res. Des.* 77, 372–384 | Primary publisher landing page, full equation pages paywalled | Publisher abstract: 596 continuous-side measurements/10 groups, 14.1% average absolute error; 21-source dispersed-side comparison, 24.5% AARE; column corrections based on simulated overall coefficients. | Relevant coefficient lead, not-yet primary-equation-verified here. No governing equation is transcribed and no HETS error is stated. |
| [Hemmati, Torab-Mostaedi & Asadollahzadeh (2015)](https://doi.org/10.1016/j.cherd.2014.07.011), *Chem. Eng. Res. Des.* 93, 747–754 | Primary publisher abstract/section-preview record; full equation pages paywalled | 117-mm Kühni; 36 experiments; toluene/acetone/water and \(n\)-butyl-acetate/acetone/water. Axial-diffusion model, effective diffusivity in a Gröber treatment, and empirical enhancement factor in \(Re\) and dispersed holdup. Publisher says it can estimate height; no accessible printed equation/range/error. | Priority not-yet-verified direct-height lead; no conclusion is drawn about whether its full published correlation will pass applicability screening. |
| [Asadollahzadeh, Torkaman & Torab-Mostaedi (2017)](https://ijcce.ac.ir/jufile?ar_sfile=344118), *Int. J. Chem. Chem. Eng.* 7, 149–161 | Primary PDF, visually checked; local record `research/sources/kuhni-mass-transfer/asadollahzadeh-2017-primary.pdf` | pp. 152–153 Eqs. 2–9; p. 158 Eqs. 27–28. 113/117-mm, 10-stage, 0.7-m acetone/toluene/water pilot; \(\epsilon=0.212\), ambient dilute acetone. Fitted-\(Sh_{oc}\) reduced average error 3.75%. | Direct, well-identified \(Sh_{oc}\)/axial-dispersion building block; not HETS/Murphree efficiency and not RRBO/NMP. |
| [Dongaonkar, Pratt & Stevens (1991)](https://doi.org/10.1002/aic.690370508), *AIChE J.* 37, 694–704 | Primary publisher abstract/PDF landing record | 72.45-mm, 25-stage Kühni; MIBK/water/acetic acid; concentration profiles used to estimate mass-transfer and backmixing parameters by a backflow model. Full governing pages not acquired for visual equation verification. | Important backmixing evidence, but not-yet direct-equation-verified here; no transferable numerical correction is asserted. |
| [Steiner, Kumar & Hartland (1988)](https://doi.org/10.1002/cjce.5450660208), *Can. J. Chem. Eng.* 66 | Primary publisher abstract record | Pilot Kühni dispersion coefficients; two stator sets; prior continuous-phase backmixing correlations checked/improved. Full equation/range pages unavailable. | Important backmixing lead, not-yet equation/range-verified here; no formula is used. |
| [Weber, Meyer & Jupke (2019)](https://doi.org/10.1002/cite.201900057), *Chemie Ingenieur Technik* 91, 1674–1680 | Open-access primary article, web-fetched | Sections 2–3/Table 1/performance maps: 80-mm, 2.95-m water/toluene/acetone pilot model, 50-mm compartments, 45-mm rotor, 40% free stator area, 150/200 rpm. HETS map about 0.1–0.8 m only in that system/model domain; model average deviation 10.4%; one chemical-system coalescence fit required; Breysse–Bühlmann continuous backmixing included. | Excluded complex-solver comparison. Its numerical map is expressly not transferred to RRBO/NMP; it is cited only to avoid double-counting backmixing. |
| [Laitinen et al. (2019)](https://doi.org/10.1016/j.cherd.2019.04.018), accepted manuscript [repository PDF](https://aaltodoc.aalto.fi/bitstreams/9872b82a-0ae5-41b9-a88f-f4e7ac255278/download) | Peer-reviewed accepted manuscript, local extracted source | ECR60/50G: 60-mm ID, 50 compartments, 1.860-m active height; levulinic acid/water/2-MTHF; 1-D axial-dispersion/NRTL model. Profile AARE 23%; \(k a\) range reported for its system. | Excluded complex-solver comparison, not a supplied HETS correlation or a proposed replacement route. |

### Verification boundary

Critical source facts above were searched and then fetched from the cited
publisher/manufacturer/repository records. Primary local PDFs were visually
checked where they were available (Asadollahzadeh and Garthe). Hemmati and
Kumar–Hartland governing equation pages remain **not-yet-verified** because
the accessible publisher records are paywalled; this is not a finding that
their full papers are unusable. The secondary 2017 equation image is retained
only as a research lead. This prevents an OCR- or secondary-source typography
error from becoming a governing design equation.

## 8. Readiness statement

**Readiness: blocked for numeric HETS/height/efficiency selection; ready for
the Hemmati primary-page evidence gate.**

The required geometry and 30–70 rpm operating envelope have legitimate
published/vendor context. They do not, in the accessible reviewed evidence,
close the direct empirical height/efficiency gap for either RRBO/NMP
orientation. Until the Hemmati governing pages are obtained and screened (or
another directly applicable empirical source is visually verified), no
bounded HETS interval, active height \(N_T\times HETS\), number of physical
compartments, overall efficiency, or Murphree factor is currently justified.
This is not a pilot mandate; it is an absence-of-direct-evidence conclusion.