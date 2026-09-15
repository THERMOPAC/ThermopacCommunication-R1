# Kühni ECR industrial/pilot scale-up audit

## Scope and decision

This is a literature and vendor-evidence audit of the diameter and scale-up
claims used by the pre-pilot Kühni model. It is deliberately limited to:

1. industrial and pilot diameter evidence;
2. geometry and scale-up criteria; and
3. the distinction between measured experimental ranges, explicit limits, and
   recommended scale-up practice.

It is not a validation of the mass-transfer model, a flooding calculation, or
an approval to build an industrial column.

**Decision for the current 0.693099697 m target:** **B — major scale-up
extrapolation, but not an invalid design.** This is a conservative evidence
classification, not a claim that a column larger than 152 mm cannot work.
The diameter is inside Perry's published pilot-to-commercial recommendation
for a 60 mm pilot (target columns up to 1 m), but the current compartment
ratio is outside the cited Kühni range and no target-specific pilot evidence
is present. The category-B value is a pre-pilot estimate and does not require
a pilot merely to be predicted; a 60 mm pilot campaign with the geometry and
measurements listed below is evidence needed before upgrading it to a
defensible commercial design status.

The 0.974212919 m alternative has the same classification: it is still below
the 1 m boundary in the Perry recommendation, but remains well beyond the
individual published apparatus and retains the out-of-range compartment
ratio.

## 1. What the sources actually establish

### 1.1 Industrial diameter and speed are product-range evidence, not a
universal validity limit

Sulzer's current Kühni ECR product page lists:

- diameter: **30 mm–3.5 m**;
- typical industrial agitator speed: **10–100 rpm**; and
- a geometry that can be adapted to changing hydrodynamic conditions.

The associated Sulzer brochure E10556 (English, marked 5.2025, p. 4) lists
the same diameter range but says typical industrial speed is **10–70 rpm**.
The discrepancy is a revision difference in the vendor material, not a
justification for treating either endpoint as a physical limit.

These are the manufacturer's product envelope and typical practice. They do
not mean that every chemistry, internals design, or model correlation is
validated throughout 30 mm–3.5 m. In particular, **3.5 m is not an explicit
maximum commercial diameter for scale-up applicability**.

### 1.2 Sulzer pilot equipment is 32/60/150 mm

Sulzer E10556, p. 8, lists its available agitated pilot columns as:

> 32, 60, 150 mm

The same page describes the design sequence as feasibility study, basic data,
pilot trials, then scale-up/design. It says that pilot trials establish
operating conditions and favorable internals, and that successful trials allow
scale-up to an industrial-size unit. On p. 9, Sulzer states that scaling from
pilot to industrial equipment is critical, that simple empirical methods
normally fail, and that the scale-up must use an understanding of
hydrodynamics and mass transfer.

Therefore:

- 32/60/150 mm are **available pilot apparatus sizes**, not commercial
  diameter limits;
- Sulzer does **not** publish a rule saying that 150 mm is the largest
  commercial column that may be designed; and
- pilot evidence is still expected even though Sulzer sells columns up to
  3.5 m.

### 1.3 Perry gives an explicit pilot-to-commercial diameter recommendation

The most specific diameter mapping located is in **Perry's Chemical
Engineers' Handbook, 8th ed. (2008), Section 15, “Agitated Extraction
Columns,” p. 15-83**. Perry attributes the guidance to Mögli and Bühlmann
and Pratt and Stevens:

- minimum recommended pilot diameter **60 mm** for specifying columns **up
  to 1 m** diameter;
- minimum recommended pilot diameter **150 mm** for specifying **larger
  diameter** columns.

This is an explicit **recommendation**, not an observed limit or a claim that
all 1 m designs are valid after a 60 mm test. It maps the current 0.693 m and
0.974 m targets to the 60 mm pilot recommendation. If the commercial target
is increased above 1 m, the cited recommendation moves to a 150 mm pilot.
The page does not state an upper commercial diameter for the 150 mm pilot.

Perry also says that some pilot testing is recommended for a final commercial
design. That statement is important: the 60/150 mm rule is not permission to
extrapolate a correlation without testing.

## 2. Observed experimental evidence versus limits

The following table keeps apparatus facts separate from design rules.

| Record | What was actually tested or reported | Evidence class | What it does **not** establish |
|---|---|---|---|
| Dongaonkar, Pratt & Stevens, AIChE Journal 37 (1991) 694–704, DOI [10.1002/aic.690370508](https://doi.org/10.1002/aic.690370508) | Primary abstract: MIBK–water–acetic acid in a **72.45 mm** Kühni column with **25 stages**; concentration profiles, backmixing, and mass transfer were measured. | Observed experiment | 72.45 mm is not a maximum column diameter or a scale-up limit. |
| Kentish, Stevens & Pratt, Ind. Eng. Chem. Res. 36 (1997) 4928–4933, DOI [10.1021/ie9702690](https://doi.org/10.1021/ie9702690) | The ACS record identifies a 25-stage, **72.45 mm** precision-bore glass Kühni apparatus with 50 mm stator spacing. | Observed experiment (full article access is paywalled) | No commercial diameter ceiling; no evidence for a universal 50–250 rpm rule. |
| Weber, Meyer & Jupke, Chemie Ingenieur Technik 91 (2019) 1674–1680, DOI [10.1002/cite.201900057](https://doi.org/10.1002/cite.201900057) | Open-access paper reproduces Garthe's pilot apparatus as **DN 80**, height **2.95 m**, compartment height **50 mm**, rotor diameter **45 mm**, and stator free cross section **40%**. It compares operation at **150 and 200 rpm**. | Secondary report of Garthe pilot data; open full text | This is one DN80 apparatus and two highlighted speeds, not a claimed diameter or speed validity envelope. |
| Hlawitschka et al., Chemie Ingenieur Technik 92 (2020) 914–925, DOI [10.1002/cite.202000043](https://doi.org/10.1002/cite.202000043) | Open-access review tables include Kühni studies at **152 mm** with turbine agitation, as well as 32 mm studies. | Secondary literature survey | 152 mm is a reported apparatus size, not a hard upper limit. |
| Garthe, *Fluiddynamics and Mass Transfer of Single Particles and Swarms of Particles in Extraction Columns* (PhD thesis, TU München, accepted 3 April 2006; local PDF SHA-256 `39a39035d63f0b84bc74957ccf17b7a8c67ec456e73e4277491bc2cbb2bd53fc`) | Local primary PDF inspected by text extraction and page rendering. Printed p. 86 contains Kühni Eqs. 5.6–5.7; rendered printed p. 126 Eq. 8.3 is `v_s/v_o = sqrt[C_D,o(Re_o)/C_D,o(Re_s) * (1-h_d)^4.65]`; Figure 5.20 lists the Kühni data/correlation ranges `D_C=72–152 mm`, `d_A=41–85 mm`, `d_s=47.5–83.2 mm`, `n_R=50–250 rpm`, `d=0.9–6.4 mm`. | Inspected primary source | The radical visibly spans the full Eq. 8.3 product and matches the frozen resolver; Figure 5.20 ranges are a correlation/data envelope, not a commercial maximum or universal scale-up validity boundary. |

### Treatment of the current 72–152 mm / 50–250 rpm warning

The diameter endpoints and the **50–250 rpm** span are now confirmed as the
ranges listed with Figure 5.20 in the inspected local Garthe PDF. Weber's
open-access report independently documents one DN80 apparatus and highlighted
150/200 rpm operation; the Dongaonkar and Kentish primary records verify
72.45 mm. These are complementary records, not a universal commercial
validity boundary.

The warning should therefore be retained with this wording:

> “Garthe Figure 5.20 lists Kühni correlation/data ranges of 72–152 mm and
> 50–250 rpm; Weber independently documents a DN80 apparatus with 150/200 rpm
> points. These are evidence envelopes, not commercial limits.”

It should **not** be rendered as:

> “Kühni columns larger than 152 mm are invalid.”

That stronger statement is contradicted by the explicit Perry 60/150 mm
pilot recommendation and the Sulzer 3.5 m product range.

## 3. Geometry and scale-up criteria

### 3.1 Ratios explicitly attributed to Pratt and Stevens

Perry p. 15-83 reports the following recommended Kühni scale-up factors
(attributed to Pratt and Stevens, *Science and Practice of Liquid-Liquid
Extraction*, vol. 1, Chap. 8, p. 541):

| Quantity | Reported recommendation | Current resolver value | Assessment |
|---|---:|---:|---|
| Rotor/turbine diameter, \(D_i/D_t\) | **0.33–0.50** | **0.50** | At the upper boundary; not outside. |
| Compartment height, \(h_c/D_t\) | **0.20–0.30** | **0.50** | **Outside the cited range; explicit flag required.** |
| Stator fractional free area | **0.20–0.40** | **0.35** | Inside the reported range. |

The current resolver source is
`server/ecr-pre-pilot/kuhni-geometry-resolver.ts`, where the corresponding
constants are 0.5, 0.5, and 0.35. This audit does not change those
constants; it records that the second one is outside the published
recommendation.

For the current **0.693099697 m** target:

- \(D_i = 0.346549849\) m;
- current \(h_c = 0.346549849\) m;
- \(D_i/D_t = 0.50\);
- \(h_c/D_t = 0.50\);
- a cited-range compartment height would be **0.138619939–0.207929909 m**
  (0.20–0.30 \(D_t\));
- a cited-range rotor diameter would be **0.228722900–0.346549849 m**
  (0.33–0.50 \(D_t\)).

For comparison, the **0.974212919 m** alternative gives:

- \(D_i = 0.487106460\) m;
- current \(h_c = 0.487106460\) m;
- cited-range compartment height **0.194842584–0.292263876 m**; and
- cited-range rotor diameter **0.321490263–0.487106460 m**.

### 3.2 Free area is a design variable, not a demonstrated invariant

Perry p. 15-83 says that free-flow area can be adjusted through the rotor
opening and/or stator perforations. It reports the trade-off directly:
increasing free area increases throughput but also increases continuous-phase
axial mixing and reduces mass-transfer performance.

The same passage summarizes Mögli and Bühlmann as allowing individual stage
geometry, including impeller size and stator free area, to be tailored when
physical properties vary along the column. The objective can be to maintain a
somewhat uniform interfacial area; that is not the same as keeping free area
fraction invariant.

**Finding:** the current 0.35 fraction is inside the cited 0.20–0.40
recommendation, but literature does not support labeling 0.35 as a mandatory
scale-up invariant. Any implementation assumption that free area is invariant
must be called an engineering choice and checked in pilot trials.

### 3.3 Power, tip speed, and characteristic velocity are not Kühni-specific
invariants in the cited scale-up passage

The Kühni-specific Perry passage gives geometric ratios, free-area guidance,
pilot diameter recommendations, and a stagewise design procedure. It does
**not** prescribe a constant power-per-volume, constant tip-speed, or
constant “characteristic velocity” criterion for Kühni scale-up.

Perry does discuss equal power per volume, geometric similarity, and equal tip
speed later in the chapter (p. 15-88 and following) under **generic agitated
vessel** scale-up. Those criteria must not be silently promoted to
Kühni-specific evidence. Sulzer's ECR material likewise discusses radial
mixing, hydrodynamics, and mass transfer but gives no power-number or
tip-speed invariant.

The current resolver's `POWER_NUMBER = 1.2`,
`DIRECT_TURBULENCE_C = 0.42`, and derived Garthe characteristic factor are
therefore model assumptions/empirical implementation parameters, not
published industrial scale-up invariants established by this audit. RPM alone
also cannot establish equivalence: the pilot and target must be compared on
geometry, phase properties, holdup/flooding, drop behavior, axial mixing, and
mass transfer.

### 3.4 Rendered Garthe Eq. 8.3 versus the frozen resolver closure

The inspected primary PDF was rendered at printed p. 126 (PDF page 138), not
only text-extracted. The rendered equation shows the radical bar spanning the
complete product, including `(1-h_d)^4.65`; the multiplication dot is inside
the radical. The source is therefore:

```text
v_s/v_o = sqrt[C_D,o(Re_o)/C_D,o(Re_s) * (1-h_d)^4.65]
```

The frozen resolver's as-coded closure is the same:

```text
v_swarm/v_char = sqrt[(C_D,char/C_D,swarm) * (1-h)^4.65]
```

The full-page screenshot is
`.agents/outputs/garthe-eq83-correct/pdf-page-138-printed-126.png` and the
focused equation crop is `.agents/outputs/garthe-eq83-correct/eq83-radical-crop.png`.
The rendered equation and resolver therefore agree, and the independent
report/script uses the source-consistent closure.

## 4. Recommended evidence classification

### Current 0.693099697 m target: **B — major scale-up extrapolation**

Reasons for B:

1. \(0.6931/0.152 = 4.56\), so the target is materially larger than the
   largest 152 mm apparatus located in the cited experimental/review records.
2. The model's \(h_c/D_t=0.50\) is outside the published 0.20–0.30 Kühni
   recommendation.
3. The Garthe-derived correlation is represented in accessible literature by
   a DN80 apparatus; a commercial-diameter target has no direct target-size
   validation in the source set.
4. The current power/tip/characteristic-velocity choices are not supported as
   Kühni-specific invariants.

Why the industrial scale-up designation remains B:

1. There is no authoritative 152 mm maximum-diameter prohibition.
2. Perry explicitly recommends a 60 mm pilot for specifying columns up to 1 m,
   which includes 0.6931 m.
3. Sulzer's product page and brochure show industrial ECR columns to 3.5 m.

### What would support a change from this diagnostic pre-pilot estimate to a defensible design status

The pre-pilot estimate does not require a pilot merely to be generated. Before
calling it a defensible design status, record all of the following:

1. A 60 mm Kühni pilot campaign for the 0.6931 m target (use the 150 mm pilot
   recommendation if the target is changed to >1 m).
2. A selected \(D_i/D_t\) within 0.33–0.50 and a compartment ratio within
   0.20–0.30, or a documented vendor-specific deviation supported by trials.
3. Stator free area and rotor opening as measured geometry, not only a
   nominal fraction.
4. Pilot measurements of phase holdup, flooding/load envelope, drop-size
   distribution, axial mixing/backmixing, and mass-transfer performance.
5. A scale-up record stating which quantity is held constant and why. Do not
   infer a Kühni power/tip/characteristic-velocity invariant from generic
   stirred-vessel guidance.
6. Vendor review of internals and mechanical feasibility, consistent with
   Sulzer's statement that successful pilot trials support safe industrial
   scale-up.

## 5. Source and access notes

The machine-readable source manifest is in
`server/research/ecr-pre-pilot-kuhni-scale-up/provenance-manifest.json`.
Primary publisher/manufacturer links are used where available. Perry's
copyrighted handbook is cited by edition, section, and printed page; no
handbook PDF is copied into the repository. The Weber and Hlawitschka Wiley
records are open-access HTML pages. The ACS Kentish record is an abstract/
metadata page and identifies the article as paywalled. The exact Garthe
thesis apparatus table remains an explicit evidence gap rather than being
filled with a guessed value.