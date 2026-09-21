# Independent TOP disengager physics and conditional sizing decision

## Decision

**Do not finalize a bare-gravity Ø700 top as an entrainment-removal design. Revise the top-area basis, not the frozen active section or bottom.** Under the explicit provisional duty below, Ø700 fails even clean-interface mobility assumptions. This is not a claim that an actual plant with Ø700 necessarily fails an unspecified purity target: no measured entrainment load/distribution or permitted physical carryover is available.

Frozen without alteration: active Ø700 × 4200 mm, 20 × 210 mm compartments, Ø231-mm rotor, 30 rpm, Np=1.2; bottom Ø900 × 1200 mm. This report does not recalculate or approve those items. No application/database modifications. Existing deliverables are preserved.

**Engineer-selected top duty: screen for gravity return of 500-µm NMP-rich drops, with no coalescence-growth credit, using U ≤ 0.5 vt.** This is an assigned sub-millimetre separation duty, not a measured lower-tail percentile, published RRBO standard, “conservative minimum drop,” or specification for total residual solvent. It was chosen to examine a meaningful fine-drop population well below the active mean, in a regime where small-deformation/creeping-flow reasoning is substantially stronger than at 2–6 mm. It is not the inverse size needed to make Ø700 pass. The sensitivity includes 100 and 250 µm precisely because they could still matter: even this duty leaves them unqualified.

For this duty, the immobile spherical screen requires **2854.6 mm ID nominally**. **Ø3000 is a preliminary nominal area candidate, not a release selection.** It offers only ~10.4% area over the nominal requirement. The separately assumed combined stress case requires **4182.4 mm**, so a **Ø4300 area candidate** would cover that particular stress calculation, not unknown uncertainty. Do not silently select Ø3000 as “robust,” or Ø4300 as a probabilistic guarantee. The large expansion from the Ø700 active section requires independent transition, distribution, support and residence/return-path design; a qualified external separator or compatible coalescing aid may be more practical. No height is finalized from these calculations.

## Evidence and applicability (sources actually retrieved)

Searches investigated low-viscosity-ratio liquid drops in viscous liquids and NMP/lubricating-oil drop sizes. **No directly applicable measured NMP-in-RRBO terminal-speed or outlet DSD data were identified in this search.** This means not found in the reviewed evidence, not a proof that such data do not exist.

1. **Myint, Hosokawa & Tomiyama (2006), “Terminal Velocity of Single Drops in Stagnant Liquids,” JFST 1(2), 72–81, DOI [10.1299/jfst.1.72](https://doi.org/10.1299/jfst.1.72).** Publisher abstract independently fetched; full original and searchable text already retained as `disengager-drag-myint-2006.pdf/.txt`, with equations and envelope checked here. These are liquid–liquid single-drop experiments. Eq. 4 gives HR; Eq. 9 combines mobility/contamination with finite-Re drag; Eq. 10 is spherical solid-particle Schiller–Naumann. Verified envelope: −11.6 < log10 M < −0.9; 0.17 < Re < 200; 0.017 < Eo < 12.1; 0.1 < κ < 100. Top κ=0.023679 is outside that range. At 500 µm Re also lies below the experiment's range, though creeping-flow asymptotics are useful independently. The source's reported approximately 10% experimental error is NOT a transferable design error bar.
2. **Taylor & Acrivos (1964), “On the deformation and drag of a falling viscous drop at low Reynolds number,” JFM 18(3), 466–476, DOI [10.1017/S0022112064000349](https://doi.org/10.1017/S0022112064000349).** Actual Cambridge publisher abstract and bibliographic record fetched; full paper not obtained. This is explicitly a liquid-drop singular-perturbation analysis, not a bubble substitution. It describes initial oblate deformation for small Weber number, subsequent spherical-cap-like geometry with increasing Weber number, and a first-order deformation contribution to drag. The abstract says the shape results are relatively insensitive to viscosity ratio. It supports treating deformation as a real correction, but supplies no verified numerical error limit for our service. No equation is transcribed from an unread full paper; differing Weber conventions are not silently equated.
3. **Myint, Hosokawa & Tomiyama (2007), “Shapes of Single Drops Rising Through Stagnant Liquids,” JFST 2(1), 184–195, DOI [10.1299/jfst.2.184](https://doi.org/10.1299/jfst.2.184).** Actual publisher abstract fetched, not full-paper equations. Reports effects of surfactants on aspect ratio and fore/aft symmetry, and a clean-drop Tadaki-number aspect-ratio correlation, tested at κ=0.1–100, log M=−11.6 to −0.9, Re=0.015–850, Eo=0.017–9.3. Again our κ is outside. No imported aspect-ratio correction is asserted.
4. **University of Liège/Pfennig group, [Coalescence, liquid-liquid phase separation and settlers](https://www.chemeng.uliege.be/cms/c_3668036/en/chemeng-coalescence-liquid-liquid-phase-separation-and-settlers).** Actual research-group page fetched. Describes original-material batch tests, separate sedimentation/coalescence modeling, trace-component sensitivity, and broad DSDs in viscous systems with fine drops remaining in the continuous phase. Supports measurements and carryover qualification; supplies neither our DSD nor a capture cutoff.

The existing `disengager-investigation-literature.md` and `disengager-drag-evidence.md` were read as context, particularly their verified Sulzer inlet-calming and coalescence discussion. No 150-µm oil/water convention or gas-bubble deformation correlation is adopted. The active model's mobile-branch label is not independent verification of a top capture model.

## Equations, orientation and nominal basis

40 °C nominal properties (not measured equilibrium outlet-mixture properties):

- Upward continuous RRBO-rich phase: ρc=869 kg/m³, μc=0.0598 Pa·s.
- Downward dispersed NMP-rich drops: ρd=1015 kg/m³, μd=0.001416 Pa·s.
- Δρ=146 kg/m³; σ=0.011 N/m; g=9.80665 m/s².
- Qtop=3.82179423 m³/h, the requested worst top throughput proxy. This is not the physical entrained NMP-drop load.
- κ=μd/μc=0.02367893; M=g μc⁴ Δρ/(ρc² σ³)=0.01821632, log10 M≈−1.73954.

Force balance and definitions:

`CD ρc vt²/2 = (2/3) d Δρ g`

`Re=ρc vt d/μc; Eo=Δρ g d²/σ; We=ρc vt² d/σ; Ca=μc vt/σ`.

Immobile spherical Schiller–Naumann:

`CD=(24/Re)(1+0.15 Re^0.687)`.

Stokes: `vt=Δρ g d²/(18 μc)`. Clean spherical creeping HR:

`vt_HR=vt_Stokes × 3(1+κ)/(2+3κ)`.

The HR mobility factor is **1.482850** approximately: clean drops can settle about 48% faster in the creeping spherical limit. For comparison only, Myint Eq. 9 with zero surfactant parameter gives

`CD_clean=CD_SN × (2+3κ)/[3(1+κ)]`.

This finite-Re clean comparison is **explicit extrapolation**, not validated top liquid–liquid data. The immobile endpoint avoids credit for unknown interfacial mobility, but is not a theorem bounding deforming drops, dense swarms, contaminated multicomponent phases or local flow. No bubble equation is used.

Area screen: `Areq=Q/(f vt)`, `Dreq=sqrt(4Q/(π f vt))`, with Q in m³/s and **f=0.5 an unqualified engineering assumption**. A uniform dilute zone is assumed; actual interstitial/local upward velocities can be greater. Neither active-section holdup nor a swarm exponent is silently transferred into the top.

## Numerical results and mechanism interpretation

Full nine-size table, clean/immobile comparisons, dimensionless groups and stress calculations are in `top-disengager-physics.tables.md`; unrounded results are in `top-disengager-physics.results.json`.

| Diameter | SN vt mm/s | Required nominal ID mm |
|---:|---:|---:|
| 100 µm | 0.013300 | 14256.8 |
| 250 µm | 0.083087 | 5704.1 |
| 500 µm | 0.331746 | 2854.6 |
| 1 mm | 1.317104 | 1432.7 |
| 1.5 mm | 2.926561 | 961.1 |
| 2 mm | 5.113563 | 727.1 |
| 2.5 mm | 7.819374 | 588.0 |
| 3 mm | 10.978682 | 496.2 |
| 6.068 mm | 36.662734 | 271.5 |

The requested last diameter is exactly 6.068 mm; the frozen active d32 is 6.068311766 mm, explaining the tiny difference from the old 36.665670-mm/s result. Neither size is a guaranteed incoming or coalesced minimum.

At 500 µm: Re=0.002410, Eo=0.032540, We=4.35×10⁻⁶, Ca=0.001803. These small stresses support a near-spherical dilute screening approximation. SN is only 0.238% below Stokes. Clean HR=0.493102 mm/s; finite-Re clean extrapolation=0.491566 mm/s and required ID=2345.1 mm. Thus **mobility is a much bigger sensitivity than finite-Re drag here**, but it cannot rescue Ø700. Small-drop spherical reasoning is materially stronger than at the mean.

At 1 mm Re=0.01914 and Eo=0.1302; at 2 mm Re=0.1486 and Eo=0.5206. At 2.5–3 mm Eo=0.814–1.171; at 6.068 mm Eo=4.793, Re=3.233, We=0.644. Stokes/HR become increasingly unsuitable as velocity predictions and deformation cannot be dismissed. The 2–6-mm SN and clean numbers are diagnostics, not a validated deformed-drop performance curve. There is no verified all-regime liquid-drop drag/deformation closure here at this viscosity ratio.

For Ø700: **U=2.758537 mm/s; required vt=5.517074 mm/s**. Conditional SN equality is **2.080748 mm**, Re=0.16682, Eo=0.56353. That equality is not a measured tail size. Even 2-mm drops narrowly fail the f=0.5 screen; mobility changes that conclusion, which shows why selecting a 2-mm duty solely to preserve Ø700 is weak. Zero net downward motion is a different equality, vt=U, at **1.455343 mm** under SN. At 500 µm the net downward velocity is **−2.426792 mm/s** (i.e. transport upward toward withdrawal in this ideal model). More height cannot reverse that sign.

## Uncertainty is scenario-based, not a confidence interval

At the selected 500-µm duty and f=0.5:

- Nominal ID: 2854.6 mm.
- μc +25% alone: 3190.6 mm.
- Δρ −20% alone: 3191.0 mm.
- Q +10% alone: 2994.0 mm.
- An additional illustrative 20% speed derating alone: 3191.6 mm.
- All four combined: **4182.4 mm**.

These variations are transparent engineer-assigned sensitivities, not measured tolerances, calibrated shape corrections, or independent random variables. The 20% derating is not claimed to bound swarm/deformation/inlet effects. In the creeping limit `D ∝ sqrt(Q μc/(f Δρ))/d`: the assigned capture diameter dominates. A 250-µm duty approximately doubles ID; 100 µm gives ~14.26 m and suggests different separation technology rather than an unsupported optimistic cutoff. Sigma does not enter spherical SN speed; it changes Eo/We and model applicability, so its absence from the area formula is not proof of physical irrelevance. At half nominal sigma, 500-µm Eo doubles to 0.06508; at the mean it rises to ~9.59.

Keeping everything else nominal, f=0.4 raises the 500-µm ID to ~3191.6 mm; f=0.6 reduces it to ~2605.9 mm. These are optional-factor sensitivities, not a proposal to loosen the required f=0.5 basis.

## What remains necessary to finalize the TOP

1. Set a permitted **physical dispersed NMP carryover** (mass or volume rate/concentration), separately from molecularly dissolved NMP. The frozen maximum total NMP composition constraint cannot by itself supply a drop-capture duty. Gravity removes a distinct dispersed phase; it does not strip dissolved solvent from the RRBO-rich equilibrium phase.
2. Measure volume-weighted incoming top DSD and entrainment load, including fines, at representative/worst operating and upset conditions. d32 alone cannot bound the fine-tail fraction. Conceptually, uncaptured dispersed volume is `Qe ∫[1−η(d)]pV(d) dd`; Qe, pV and η are currently unqualified. Do not infer a percent removal from the chosen cutoff.
3. Measure equilibrated phase densities, viscosities and interfacial tension at 40 °C with representative water, contaminants and aging; settling velocities across the relevant tail; batch/continuous coalescence and dispersion-band behavior.
4. Qualify uniform flow and rotor/inlet turbulence decay, expansion and return paths, withdrawal drawdown, coalescing capacity, interface-control envelope and surge inventory. A large nominal shell without adequate distribution does not provide its entire area effectively.
5. Derive height from those layout and dynamic constraints. Travel time per metre at the 500-µm duty in a nominal Ø3000 uniform zone would be ~5508 s (~91.8 min), using `L/(vt−U)`, not a universally applicable residence-time requirement. This long time emphasizes the need to examine actual travel paths/coalescence or aided separation rather than just prescribe a standard quiet-zone height.

**Final disposition:** reject Ø700 as the assigned 500-µm bare-gravity TOP duty; carry forward an enlarged/aided top separation concept (Ø3000 nominal area candidate, ≥4182 mm for the stated combined stress only), with TOP geometry/performance release held. The active section and bottom remain frozen. A truthful final fabrication ID/height or carryover guarantee cannot be established from the current evidence.

## Offline reproducibility

Run `node deliverables/top-disengager-physics.mjs` with Node; no packages, network, app or DB required. It reads only the frozen input, verifies nominal phase properties, records its SHA-256, solves drag by bracketed bisection, checks force-balance residuals, and writes only the new prefixed JSON and table outputs. Source equations, limits, chosen duty and assumptions are stated above; the calculation is independent of the production drag implementation.

## Supplement — integrated capture AND return path

**An enlarged top area alone is not an integrated hydraulic PASS.** The Ø3000/Ø4300 candidates above concern only local settling area. They must not be specified as complete bare-gravity top solutions while the active Ø700 throat is frozen and no independent collected-phase return route has been qualified.

For the simple topology of upward RRBO leaving the Ø700 active section, expanding through a cone into the enlarged top, NMP drops transported upward from the throat can acquire a downward laboratory-frame velocity in the enlarged region. Returning downward then exposes them to increasing upward RRBO velocity as the cone narrows. With constant throughput and constant drop size, a uniform axial-flow approximation gives:

`vdown,net(D)=vt−4Q/(πD²)`

`Dstall=sqrt(4Q/(πvt))=Drequired,f=0.5/sqrt(2)`.

For the 500-µm immobile spherical screen, **Dstall≈2018.5 mm**. Downward net speed is +0.181558 mm/s at Ø3000 but −2.426792 mm/s at Ø700. Thus drops can settle in the enlarged zone yet cannot continuously return through the narrowing cone and active throat as unchanged isolated 500-µm drops. They can accumulate around the zero-net region, recirculate, or be re-entrained. The actual cone has nonuniform velocities, wall effects and possible dense-phase flow, so this is a topology warning and diagnostic location, not a prediction of an exact sharp accumulation ring. Neither wall-film drainage nor coalescence into a descending continuous phase is granted without evidence.

In the same nominal spherical model, positive net downward motion through Ø700 requires a drop larger than **1.455343 mm**, while meeting the separate f=0.5 screen there requires **2.080748 mm**. These are velocity equalities, not measured coalescence products. At these sizes spherical-model limitations also become more significant. Even ideal coalescence from 500 µm to a sufficient size must be demonstrated at the arriving dispersed-phase load and with adequate inventory capacity; it is not a free consequence of enlargement.

| Assigned duty | Nominal area ID at f=0.5, mm | Zero-net local ID, mm | SN net downward speed at Ø700, mm/s |
|---:|---:|---:|---:|
| 500 µm | 2854.6 | 2018.5 | −2.426792 |
| 1 mm | 1432.7 | 1013.0 | −1.441433 |
| 2 mm | 727.1 | 514.1 | +2.355026 |

The 1-mm duty has the same basic return obstruction. The 2-mm idealized drop has positive net downward motion through Ø700, but does not meet the stipulated f=0.5 throat screen, and its mobility/deformation applicability is weaker. None of these alternative duties is established by the actual entrainment distribution or allowed carryover. **500 µm is no more evidenced as the actual tail than 1 or 2 mm.** Its advantage is a more tractable small-drop physics screen and a stricter assigned separation duty, not evidence of a universal correct duty or an acceptable uncaptured fraction.

A possible alternative is a **protected submerged collected-NMP drain/downcomer** that bypasses the high-upflow throat and discharges to a defined receiving region. This changes the topology and can in principle carry a collected NMP-rich phase back, but a proposed line alone is not a qualified solution. Establish collection/coalescence and holdup, continuous or intermittent drain behavior, discharge location/submergence, hydrostatic driving head against receiver pressure and all losses, flow capacity at the actual entrainment load, controls, plugging/fouling, backflow and avoidance of RRBO short-circuiting. A dispersed mixture cannot silently be treated as a clean continuous NMP drain stream. Verify operation and inventory stability over startup and upset conditions.

**Integrated conclusion:** reject Ø700 for the assigned fine-drop duty; also reject “enlarge to Ø3000 and pass” as a complete hydraulic conclusion. Keep the active section/bottom frozen and develop a top system with an explicitly qualified collection-and-return path (or demonstrated coalescence/descending-phase transport through the cone), potentially aided or external separation. Neither final top diameter/height nor carryover performance can be released until both separation duty and this integrated return topology are established.