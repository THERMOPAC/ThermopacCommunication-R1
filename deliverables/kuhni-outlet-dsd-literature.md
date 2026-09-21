# Kühni/ECR terminal-compartment droplet-size distribution: primary-literature investigation

Research-only report, 21 September 2026. No application, database, saved design, equipment selection, or existing calculation was changed. Source captures are retained under the new prefix `deliverables/kuhni-outlet-dsd-sources/`.

## 1. Scientific answer

**Published experiments do support a size distribution, rather than one drop diameter, in actual Kühni columns. The strongest fully inspected source fits a NUMBER-lognormal distribution to photographic measurements including the last active stage. It does not establish the fine-volume tail leaving the present RRBO/NMP column.**

The most useful primary source is Oliveira et al. (2008), DOI **10.1590/S0104-66322008000400010**. Its final-stage photographs and number-DSD fits are much closer evidence than generic RDC or stirred-tank distributions. However, they concern rising Exxsol drops in water, 150-mm diameter, five stages, and 60–180 rpm. They are **local in-compartment measurements, not a flux-weighted outlet sample, not a post-disengager measurement, and not NMP dispersed in viscous oil**.

Another genuine Kühni experimental study, Asadollahzadeh et al. (2017), DOI **10.1016/j.cherd.2016.08.025**, compares maximum-entropy, Gamma, inverse-Gaussian and Weibull fits. Its publisher abstract favors maximum entropy over those conventional families. The accessible preview does not expose enough of the method, parameter tables or equations to transfer a numerical width.

**Therefore neither 500 µm nor any other prescribed fine-drop duty is established by the measured literature for this service.** A lognormal family is an evidence-informed candidate for testing, not a demonstrated RRBO/NMP distribution. The numerical conditional tails below are explicitly not measured or validated tails.

## 2. Fixed service and the transfer gap

User basis retained without recalculation of the accepted hydraulic thresholds:

| Item | Fixed basis |
|---|---|
| Calculated, not measured, Sauter mean | `d32 = 6.068 mm` |
| Column / active height / compartments | 700 mm / 4200 mm / 20 × 210 mm |
| Rotor / rotation / assigned power number | 231 mm / 30 rpm / 1.2 |
| Stator free-area fraction | 0.40 |
| Continuous RRBO | ρc = 869 kg/m³; μc = 0.0598 Pa·s |
| Dispersed NMP | ρd = 1015 kg/m³; μd = 0.001416 Pa·s |
| Interfacial tension / temperature | 0.011 N/m / 40 °C |
| Raffinate flow | 3.8218 m³/h |
| Accepted top thresholds | 1.455 mm, zero-net; 2.081 mm, `f = 0.5` |

For domain comparison only, `ReR = ρc N DR²/μc = 388`, with N in revolutions/s. Oliveira reports 7225–21675: present Re is about 19 times below its lowest value. Present continuous viscosity is **54.4 times** its water viscosity of 0.0011 Pa·s. Present viscosity ratio μd/μc = 0.02368, versus approximately 1.45 in that experiment. Matching rpm, `d32`, or even a nominal power density cannot cure these differences. Np = 1.2 does not specify a distribution width.

Current rotor/column ratio is 0.330 versus Oliveira's 0.567; stage-height/diameter is 0.300 versus 0.467; free area is 0.40 versus 0.30. Mass-transfer composition gradients, contaminants, interfacial mobility, coalescence, distributor drop sizes and finite compartment residence times remain additional uncontrolled differences.

**Location matters:** the relevant top-side measurement is immediately beyond the upper active compartment, before substantial quiet-zone evolution, and in the upward raffinate withdrawal path. With heavy NMP dispersed in lighter RRBO, NMP's intended net path is downward. “Last stage” in an upward-moving organic-drop experiment is not automatically the corresponding end of the NMP trajectory. A local DSD beside a rotor must not be relabelled the upward entrained outlet DSD.

## 3. Primary-source audit

### S1. Oliveira, Silva, Gondim and Mansur (2008): strongest quantitative DSD evidence

**Citation:** “A study of the drop size distributions and hold-up in short Kühni columns,” *Brazilian Journal of Chemical Engineering* 25(4), 729–741.

- DOI: https://doi.org/10.1590/S0104-66322008000400010
- Full publisher HTML: https://www.scielo.br/j/bjce/a/xpHL7QGjRbJGQ4XTrsm3BrH?format=html&lang=en
- Full publisher PDF extraction: https://www.scielo.br/j/bjce/a/xpHL7QGjRbJGQ4XTrsm3BrH?format=pdf&lang=en
- **Access:** full primary text read through webFetch, cross-checked against the existing local PDF extraction and page images. Direct curl of the PDF returned an HTML access response, retained honestly as HTML, not passed off as a PDF.
- **Locations:** pp. 731–732 experimental method/Table 1; pp. 733–735 Figs. 2–4; p. 734 Eqs. (2)–(3); p. 736 Eqs. (4)–(5) and Fig. 5; p. 737 onward Sauter-mean discussion/Fig. 6.

**Apparatus and fluid domain**

Five stages, 150-mm column, 85-mm six-blade turbines, 10-mm rotor height, 70-mm stator spacing, 30% stator free area. Water continuous, Exxsol D-80 dispersed, mutually saturated, no mass transfer, room temperature; properties tabulated at 25 °C: 996/801 kg/m³, 0.0011/0.0016 Pa·s, σ = 0.017 N/m. Rotor speed 60, 90, 120, 150 and 180 rpm; both phase flows at 1.24 and 2.00 L/min. Measurements at stage 0 (distributor), 1, 3 and 5. Flow testing is countercurrent.

**Measurement and weighting**

Nikon Coolpix 990 photography, camera 200 mm from wall, external graduated scale, Quantikov image analysis, minimum 400 drops per condition. Vertical drop dimensions were multiplied by 0.8 for parallax correction; spherical shape was assumed. Zoom was used at stages 3/5 and 150/180 rpm to improve fine-drop imaging. Eighteen 0.5-mm classes cover 0–9 mm. Reported measured diameters span 0.5–8.5 mm across the studied conditions.

The text on p. 736 explicitly defines the empirical cumulative frequency from **counts of drops** at/below each diameter divided by total analyzed count plus two. Thus Figs. 2–4 and fitted lognormal cumulative probabilities are **number based**, not volume based. No independently validated sub-500-µm detection/completeness limit is given. The reported 0.5-mm lower observed size is not proof that still smaller droplets cannot occur.

**Family and width**

Equation (2), independently checked against the publisher's equation image, is the conventional number-lognormal:

`pN(d) = exp[-((ln d − μ)/(sqrt(2) s))²] / [sqrt(2π) d s]`.

Here `s` denotes the paper's distribution parameter σ, **the standard deviation of ln(d)**, not interfacial tension and not variance. Diameter units must remain those of the fit (mm); `s` is dimensionless. Equation (3) integrates the PDF to obtain the number CDF.

The original PDF rendering/extraction corrupts mathematical glyphs. These publisher equation images were therefore read visually and retained:

- Eq. (2): https://minio.scielo.br/documentstore/1678-4383/xpHL7QGjRbJGQ4XTrsm3BrH/c52cba500511885bb81df5dbd3f0e68482a2b3e3.gif
- Eqs. (4)–(5): https://minio.scielo.br/documentstore/1678-4383/xpHL7QGjRbJGQ4XTrsm3BrH/17aa1602d7bc2f3e3f23814cac4d2818837fa82b.gif

Nominal fitted equations, with `Qc,Qd` in L/min, `N` in revolutions/s and `E` stage number:

`μ = 2.08 − 0.34 Qc − 0.08 E − 0.52 N + 0.05 Qc E + 0.21 Qc N − 0.03 Qc E N`.

`s = 0.62 − 0.15 Qd − 0.16 Qc − 0.04 N + 0.09 Qd Qc + 0.02 Qc N`.

Equation (5) has no explicit stage term; that is a result of this restricted empirical regression, not evidence that terminal widths are universally stage-independent. The printed coefficient uncertainties are respectively ±0.19, ±0.10, ±0.12, ±0.02, ±0.06 and ±0.01. Overall width-regression R² is 0.67. Authors report roughly 20% width agreement, versus <15% for μ; individual lognormal CDF fits mostly have R² >0.970, minimum 0.927.

Evaluating Eq. (5) **only within its donor experiment** gives nominal `s ≈ 0.2992–0.373984` across the stated flow/speed corners. Fig. 5(b) shows experimental fit widths approximately 0.26–0.44; this is a graphical envelope across conditions, **not a tabulated, final-stage-only confidence interval**. For example, at Qd = 2.00 and Qc = 1.24 L/min, nominal `s = 0.3296` at 60 rpm and `0.2992` at 180 rpm.

**Sauter mean and outlet status**

The paper separately analyzes `d32`, the Sauter volume/surface mean, not a number median. Stage-0 reported mean is 4.6 ±0.4 mm; this distributor value is not a final-stage value. Figs. 2–4 explicitly include stage 5, providing actual final-active-stage DSD evidence, but the paper does not tabulate a flux-weighted outgoing fine-volume fraction normalized by `d32`. No digitized histogram is represented here as original numeric data.

Do not extrapolate Eqs. (4)–(5) to 700 mm, 30 rpm, oil-continuous operation or Qraff = 63.70 L/min. The authors explicitly restrict them to the tested fluid, geometry and flow/speed ranges.

### S2. Asadollahzadeh, Torkaman, Torab-Mostaedi and Safdari (2017)

**Citation:** “Using maximum entropy, Gamma, Inverse Gaussian and Weibull approach for prediction of drop size distribution in a liquid–liquid extraction column,” *Chemical Engineering Research and Design* 117, 637–647.

- DOI: https://doi.org/10.1016/j.cherd.2016.08.025
- Publisher: https://www.sciencedirect.com/science/article/abs/pii/S0263876216302763
- **Access:** publisher abstract, introduction and section previews read; full article/parameter tables not obtained.
- **Verified:** actual Kühni, 113-mm diameter, 700-mm section and 10 stages in the apparatus preview; photographic drop sizing; toluene–water, n-butyl-acetate–water and n-butanol–water systems. Experimental mean size and DSD depend strongly on speed and interfacial tension, less on phase velocities. Maximum entropy reportedly represents DSD better than Gamma, inverse Gaussian and Weibull.
- **Not verified from accessible text:** precise imaging height/outlet relation, phase-continuity assignment for every dataset, continuous viscosities, speed/flow ranges, count-versus-volume PDF definition, numerical shape parameters, detection threshold and specific `d32` equation. These are deliberately not filled from another 113-mm-column paper.
- **Consequence:** supports multiple experimentally tested distribution families in a genuine Kühni column, but supplies no defensible RRBO/NMP width or quantifiable fine tail from this accessible evidence. Better global fit does not alone validate an extreme lower tail.

### S3. Shirvani, Ghaemi and Torab-Mostaedi (2016)

**Citation:** “Experimental Investigation of Flooding and Drop Size in a Kuhni Extraction Column,” *International Journal of Engineering*, Transactions C 29(3), 288–296.

- DOI: https://doi.org/10.5829/idosi.ije.2016.29.03c.02
- Publisher: https://www.ije.ir/article_72678.html
- **Access:** existing full primary PDF/text inspected; retained new-prefix text copy. Some running headers incorrectly say 2015/Vol. 28; title-page citation and DOI identify 2016/29.
- **Locations:** p. 289 Tables 1–2; p. 290 §4 and Eqs. (1)–(2); later mean-size/flooding figures.
- 117-mm column, ten stages, about 0.7–0.75-m active section; 50-mm impeller. Technical table specifies 55-mm compartments. Water continuous with organic dispersed: toluene or n-butyl acetate, 20 ±2 °C. μc = 0.963 or 1.027 mPa·s; σ = 36.0 or 14.1 mN/m.
- Nikon D3100 photographs; tray thickness/spacing calibration; at least 300 drops per condition; ellipse-equivalent diameter from major/minor axes. Eq. (2) explicitly gives `d32 = Σ ni di³ / Σ ni di²`.
- Published figures include size tests at 90–180 rpm and flooding tests extending to 270 rpm; these are not treated as a single interchangeable DSD calibration range.
- **Limit:** a mean-size/flooding correlation paper, not verified published final-compartment tail-width data. §4 does not identify an outlet sampling plane sufficient for the present question. It cannot supply missing width by converting its `d32` correlation into a minimum drop diameter.

### S4. Garthe (2006), TUM dissertation

**Title:** *Fluid-Dynamics and Mass Transfer of Single Particles and Swarms of Particles in Extraction Columns*.

- Primary repository: https://mediatum.ub.tum.de/601973
- Persistent identifier: https://nbn-resolving.org/urn:nbn:de:bvb:91-diss20060515-1631220060
- **Access:** primary repository checked; existing full PDF/text inspected and text retained with the new prefix. No DOI identified. Repository lists 272 pages.
- **Locations:** printed pp. 50–51 fluid properties (Table 3.3); pp. 55–56 photoelectrical probe; pp. 61–62 swarm measurement locations; Appendix A.3, Tables A.11–A.12, pp. 213–214.
- Photoelectrical suction probes measured immediately above the dispersed inlet and at three active-column positions, at least 1000 drops per distribution. The method has a different sampling bias from photographs, and the suction velocity is discussed as important.
- Aqueous continuous viscosities in the listed standard systems are about 1.02–1.16 mPa·s, not 59.8 mPa·s. Toluene/butyl acetate and acetone-containing systems are studied with multiple internals, including Kühni and RDC; those apparatus datasets must remain distinguished.
- Appendix A.11–A.12 explicitly tabulate **initial volume-density distributions** `q3(d)` immediately after the finger distributor, at Δd = 0.2 mm. They are **not terminal outlet distributions**. Their relatively narrow initial populations must not be imported as an equilibrium outlet tail.
- The dissertation discusses beta and other daughter-drop distributions in breakup modeling. A mother-drop breakup kernel is not the steady ensemble DSD leaving a column. No universal beta/Gaussian/Mugele–Evans outlet width is adopted here.

### S5. Gomes et al. (2009): additional genuine Kühni DSD experiments

**Title:** “Effects of Mass Transfer on the Steady State and Dynamic Performance of a Kühni Column − Experimental Observations,” *Industrial & Engineering Chemistry Research* 48, starting p. 3580.

- DOI/publisher: https://doi.org/10.1021/ie801034a
- **Access:** primary publisher abstract read; full paper inaccessible.
- Abstract explicitly reports pilot-scale Kühni **local drop-size distributions**, holdup and concentrations, steady and controlled transient tests, with/without mass transfer, and step changes in agitation and both flow rates.
- Numerical widths, PDF weighting, measured locations relative to the terminal stage, viscosity and operating range were not available for verification. Useful primary follow-up source; not numerical evidence of the present outlet tail.

### Scope controls and rejected transfers

Kumar–Hartland (1996), DOI 10.1021/ie950674w, correlates average size across extractor classes: it does not determine a unique DSD from `d32`. Bailes et al. (1986), *Chemical Engineering Research and Design* 64, starting p. 43, includes packed, RDC and Kühni apparatus; no full-source outlet width was retrieved here, and the RDC constants cited by Oliveira are not relabelled Kühni.

Hohl, Röhl and Kraume (2023), DOI 10.1002/ceat.202200589, was screened in full-text search: its silicone-oil/water stirred-vessel experiments vary **dispersed** viscosity, not oil-continuous Kühni terminal flow. It is not a transfer calibration. Similarly, an MEP fit from a multi-impeller contactor is not automatically the 2017 Kühni fit.

## 4. Quantifiable conditional tails, with correct weighting

These calculations are mathematical consequences of an **assumed** family, not extra experimental results.

For a number-lognormal population `ln d ~ Normal(m,s²)`:

`Mk = E_N[d^k] = exp(k m + k² s²/2)`,

`d32 = M3/M2 = exp(m + 2.5 s²)`,

`FV(d*) = E_N[d³ 1(d ≤ d*)]/M3 = Φ([ln(d*/d32) − s²/2]/s)`.

This uses number-to-volume weighting; inserting `d32` as the lognormal median is incorrect. The corresponding number CDF is `FN(d*) = Φ([ln(d*/d32) + 2.5 s²]/s)`.

Below, all entries are **percent of dispersed NMP volume in a hypothetical local population** with `d32 = 6.068 mm`. None is percent of raffinate, an actual outlet concentration, or a measured NMP loss.

| Assumed ln-width `s` | GSD = exp(s) | Below 0.500 mm | Below 1.455 mm | Below 2.081 mm |
|---:|---:|---:|---:|---:|
| 0.28 | 1.323 | 6.8 ×10⁻¹⁸% | 0.0000080% | 0.00372% |
| 0.35 | 1.419 | 1.4 ×10⁻¹¹% | 0.00104% | 0.0613% |
| 0.44 | 1.553 | 1.9 ×10⁻⁷% | 0.0265% | 0.400% |
| 0.70 | 2.014 | 0.00450% | 0.842% | 3.01% |
| 1.00 | 2.718 | 0.137% | 2.69% | 5.82% |

The first three rows illustrate widths within the approximate Oliveira graphical envelope, **rescaled to a different mean and fluid system without validation**. The last two are deliberately broader analyst sensitivities, not literature-recommended Kühni widths. Very small computed probabilities are mathematical extrapolations far below the empirical resolving power of 400-drop photographic samples, not evidence of essentially zero real carryover.

For example, at `s = 0.44`, the count fraction below 2.081 mm is approximately **9.14%**, whereas the volume fraction is **0.400%**. At 1.455 mm the count fraction is **1.60%** versus **0.0265%** by volume. Confusing these weightings can radically misstate solvent inventory.

The above source reports no universal width versus `d32` scaling law. It is not defensible to select whichever row makes a preferred disengager pass, or to present the first three rows as an RRBO confidence band. Small satellite/emulsion modes could violate a single-lognormal model while preserving the same Sauter mean.

### A distribution-free statement, conditional on this actually being the local mean

For positive drop sizes in the same population,

`1/d32 = E_V[1/d] ≥ FV(d*)/d*`,

so `0 ≤ FV(d*) ≤ d*/d32` for `d* < d32`.

At 6.068 mm this permits upper bounds **8.24% below 0.500 mm, 23.98% below 1.455 mm, and 34.29% below 2.081 mm**. These very loose moment bounds are not expected fractions or measured bounds: even their application requires the assumed mean to describe the relevant local population. Without a specified maximum diameter they are limiting bounds; no fine-fraction lower bound above zero follows. Thus a mean contains some mathematical information, but nothing resembling the narrow, reassuring tails obtained by assuming a particular width.

## 5. Local distribution is not outlet entrainment

Oliveira's stage photographs count a spatial population. For an idealized plane crossing, the positive outward dispersed-volume flux is proportional to `d³ n(d) max(vout(d),0)`. Its normalized distribution is different from `d³ n(d)` unless crossing velocities are size independent. Turbulent exchange/backflow and coalescence require further terms or direct measurement.

Consequently:

1. The terminal-stage number distribution must first be converted to local volume weighting.
2. The local volume distribution must then be related to the **actual raffinate-path flux** through a measured or validated size-dependent transport model.
3. Breakup/coalescence between that plane and the final outlet can change the DSD again.
4. A fine-volume fraction still needs total entrained NMP flow to become kg/h or ppm; Qraff alone does not supply that inventory.

The accepted 1.455-mm zero-net threshold and 2.081-mm margin threshold are hydraulic comparison sizes. They do not themselves define an incoming population, a probability of entrainment, or a universal hard separation-efficiency curve.

## 6. Evidence needed to close this particular question

Measure NMP-in-RRBO at 40 °C with representative compositions, contamination history, 30-rpm internals and steady phase flows. Prefer a resolved in-situ or minimally disruptive sample at the upper active-compartment exit **and** a separate raffinate-path/outlet measurement. State axial/radial sampling location, whether sampling is spatial or flux weighted, minimum detectable diameter, sampling recovery and number of droplets.

Report `n(d)` or raw per-drop sizes, volume histogram/CDF, measured `d32`, `dV10/dV50/dV90`, and `FV(0.500)`, `FV(1.455)` and `FV(2.081 mm)`, with uncertainty and unresolved sub-resolution volume. Verify whether a single lognormal is adequate or a second fine mode is present. Quantify total entrained solvent separately from dissolved solvent. These observations can test, rather than assume, the literature family.

## 7. Access and reproducibility record

Searches covered Kühni/Kuhni/ECR, outlet/final-stage DSD, lognormal and other families, photographic/probe methods, viscosity, and references within the primary papers. Search captures are retained; several query routes returned irrelevant generic distribution results, which were excluded. This is a documented accessible-literature investigation, not a claim that no other measurements exist anywhere.

New-prefix source files include full Oliveira webFetch PDF/HTML text, the existing PDF extraction, visually checked publisher equation images, Asadollahzadeh preview, Gomes abstract, Garthe repository record/full text, Shirvani full text, and conditional numerical results. Older artifacts were read only.

**Bottom line:** genuine Kühni final-stage experiments justify investigating a distributed, potentially fine-tailed population and offer a number-lognormal comparison family with measured donor widths. They do **not** establish the actual NMP fine-volume tail, a 500-µm capture duty, or a gravity/coalescer selection for this RRBO service.