# Task 306 — automatic end-sizing source audit

> **Superseded evidence state (2026-09-23):** This document preserves the
> original bounded repository/source audit. Its qualification decision remains
> fail-closed, but later review found a controlled formed-end ID **candidate**
> and refined the terminal-model domains. Use
> [`stage5-end-qualification-evidence-review.md`](stage5-end-qualification-evidence-review.md)
> for the current evidence record and
> [`stage5-end-qualification-protocol.md`](stage5-end-qualification-protocol.md)
> for the current `ECR_END_QUALIFICATION_PROTOCOL / 2.0.0` admission procedure.
> Statements below that no controlled series was found describe this earlier
> audit, not a claim that no standard exists.

**Scope:** scientific/process evidence needed by the live, per-end
`droplet → terminal velocity → margin → allowable velocity → calculated
diameter → fabrication diameter → normal-flow residence height` chain.

**Decision:** **no complete source-qualified chain was found for either end.**
This is a finding about the inspected repository and bounded primary-literature
search, not a claim that qualification is impossible. The live resolver should
continue to fail closed and state the particular gap per end.

## 1. Admission rules

1. Top and bottom are different separation duties:
   - **top:** NMP-rich droplets settling/returning against upward RRBO-rich
     raffinate;
   - **bottom:** RRBO-rich droplets rising/returning against downward NMP-rich
     extract after phase inversion.
2. The calculated top active-compartment NMP `d32` does **not** establish a
   flux-weighted top outlet capture population, and cannot govern the
   phase-inverted bottom RRBO population.
3. The offline `200 µm` bottom size and `0.50 × vt` factor are research
   selections, not admitted models. Historical `Ø900/Ø1000` comparisons are not
   a fabrication series or current diameter authority.
4. Normal product flow governs `D` and the ten-minute/0.90-usable-volume `H`.
   `S/O = 1.5` and `120%` apply only to nozzle calculations; they must not alter
   the normal material balance, product densities, `D`, or `H`.
5. “No qualified source found” below means evidence may still be obtained and
   admitted under a new versioned authority. It does not mean the quantity can
   never be qualified.

## 2. Process-source gate common to both ends

| Required live evidence | Audit finding | Admission status / exact gap |
|---|---|---|
| One simultaneous normal raffinate/extract trial tied to frozen Stage 1/2/5 | Historical reports describe adopted 7 theoretical/20 physical stages without a designated product trial; those reports are not current DB authority. The persisted seven-component validator can designate exactly one accepted trial at predictiveNt when the frozen Stage-4 reference supplies an exact job/result hash/stage-count binding. | **CONDITIONAL SOURCE ADAPTER IMPLEMENTED.** The live read path now binds that unique accepted trial, verifies normal Stage-1 compatibility and component closure, and scales its simultaneous product masses to normal oil kg/h. Missing, incompatible or unaccepted frozen references remain blocked, with no latest-job/N4/N7 substitution. Product volumes remain unavailable without qualified densities. See the separate current-design verification record for the actual DB finding. |
| Operating-temperature product densities | The available 40 °C values, 869 kg/m³ RRBO and 1015 kg/m³ NMP, are nominal feed/pure-fluid proxies. The EPD density points are explicitly `Assumed`; they are not equilibrated RRBO-rich raffinate and NMP-rich extract densities. | **NOT FOUND / PROPERTY_SOURCE_REQUIRED.** Supply measured/vendor/literature-supported product-phase densities tied to the admitted normal trial, or admit a separately bounded product-mixture model. |
| Product viscosities and RRBO/NMP interfacial tension for terminal models | Existing values are nominal proxies; no source-qualified composition-dependent outlet closure was found. | **NOT FOUND / PROPERTY_SOURCE_REQUIRED.** Qualify each end’s continuous/dispersed viscosity, density, phase identity, and interfacial tension at operating temperature and representative composition/contamination. |

Local evidence: `deliverables/kuhni-end-section-preliminary-calculation.md`
§§2–3 and §9; `deliverables/end-rule-report.md` §§1–3;
`.agents/memory/llx-density-architecture.md` §§Governed dataset/Governance
status; `server/engine-framework/epd/fluids/nmp.ts` and
`rrbo-sn300.ts` (40 °C density points marked `Assumed`).

## 3. Per-end model audit

### 3.1 Top raffinate end

| Chain item | Evidence found | Qualification decision and remaining gap |
|---|---|---|
| Governing outlet droplet | Oliveira et al. measured photographic **number** distributions, including the fifth active stage, in a 150-mm, five-stage Kühni column with Exxsol D-80 dispersed in water. The paper fits a lognormal number distribution, but does not report a flux-weighted post-stator/outlet NMP-in-RRBO distribution. Its fluid, viscosity, geometry, speed and measurement weighting differ materially from this service [S1]. | **NO QUALIFIED TOP OUTLET-DROPLET MODEL FOUND.** Oliveira supports the need for a distribution and is a candidate-family source only. The active-compartment `d32 = 6.068 mm`, donor widths, 500-µm sensitivities, and a local final-stage population are not admissible outlet capture criteria. Needed: source-labelled one-way top terminal/outlet volume-flux DSD and loading, including resolution/fine-tail uncertainty and return/recrossing definition, at representative operation. |
| Terminal velocity | Schiller–Naumann is a spherical **solid-particle** correlation, not a liquid-drop mobility/deformation model [S2]. Myint et al. provide a liquid-drop expression dependent on `Re`, viscosity ratio and surfactant retardation, but their tested range is `0.1 < κ < 100`; the top nominal `κ ≈ 0.0237` is outside it [S3]. Barry–Parlange covers spherical fluid particles across viscosity ratios and recovers Hadamard–Rybczynski/solid-sphere limits, with comparisons up to Reynolds numbers of a few hundred [S4]. | **NO QUALIFIED TOP TERMINAL MODEL FOUND.** Barry–Parlange is the strongest equation-bearing candidate, not current authority: it requires a spherical isolated drop in an infinite homogeneous liquid and an established mobility/interface condition. The top mean-drop `Eo ≈ 4.79` makes unverified sphericity consequential. Qualify with representative isolated-drop settling measurements or a validated shape/mobility model and explicit domain gates. |
| Design margin / allowable velocity | No primary or controlled project source was found that establishes `Udesign = 0.50 vt` for this Kühni terminal/outlet geometry. Myint’s reported approximately 10% maximum prediction error within its experiments is correlation performance, not a transferable design factor [S3]. | **NO QUALIFIED TOP MARGIN MODEL FOUND.** Admit a versioned convention only after defining whether the factor multiplies or divides `vt`, the protected failure mode, treatment of model/DSD/property uncertainty, nonuniform withdrawal/jet effects, and applicable operating envelope. |
| Fabrication rounding | No controlled project/fabricator standard was found that defines an upward shell-ID series or increment. `0.7/0.9/1.0/1.2 m` are comparison coordinates; `Ø900/Ø1000` are historical options. Pipe dimensional standards do not create a custom vessel-shell diameter series. | **NO QUALIFIED TOP FABRICATION RULE FOUND.** Obtain a project/fabricator standard with nominal **inside-diameter** convention, plate/thickness/tolerance basis, permitted series or increment, upward-rounding rule, and maximum supported size. |

### 3.2 Bottom extract end

| Chain item | Evidence found | Qualification decision and remaining gap |
|---|---|---|
| Governing outlet droplet | No inspected source measured or predicted the bottom one-way RRBO-in-NMP-rich extract outlet/carryunder population for this service. The offline 200-µm case is explicitly an assumed sensitivity. | **NO QUALIFIED BOTTOM OUTLET-DROPLET MODEL FOUND.** Independently measure or validate the bottom RRBO volume-flux DSD/loading at the relevant crossing/outlet plane and define the carryunder criterion. Never transplant the top NMP `d32` across phase inversion. |
| Terminal velocity | At the nominal proxy, bottom `κ = μRRBO/μNMP ≈ 42.2` lies inside Myint’s `0.1–100` viscosity-ratio range, and the small candidate drops have low deformation indicators. However, the earlier 250-µm inverse threshold has `Eo ≈ 0.008`, below Myint’s reported experimental `0.017 < Eo < 12.1`, and its product properties, contamination/mobility and actual droplet size are not qualified [S3]. Barry–Parlange remains a spherical isolated-fluid-particle candidate [S4]. | **PROMISING CANDIDATE; NOT YET QUALIFIED.** A bottom-specific version could be admitted only after selecting the actual governing outlet population, product properties/interface state, checking every dimensionless range at that size, and validating against representative RRBO-drop rise data. Schiller–Naumann may be retained only as an explicitly immobile rigid-sphere endpoint/screen, not asserted as a proven liquid-drop lower bound. |
| Design margin / allowable velocity | As for the top, no controlled source establishes the offline `0.50 × vt` factor. The active-column 70%-of-modeled-capacity criterion addresses a different model and cannot be reused. | **NO QUALIFIED BOTTOM MARGIN MODEL FOUND.** A bottom-specific or demonstrably common convention must define factor direction, protected failure mode, uncertainty treatment, interface/dispersion-band effects, and domain. |
| Fabrication rounding | Same repository finding as top; the old `Ø900 × 1200` reservation arose from assumed 200-µm/0.50 screening and is not a series [local audit below]. | **NO QUALIFIED BOTTOM FABRICATION RULE FOUND.** Obtain controlled fabricator/project shell-ID series or increment metadata; do not seed it from historical comparison sizes. |

The prescribed ten-minute normal-flow residence height with 0.90 usable
straight-shell volume can remain a **process rule** after `Qnormal` and the
rounded diameter are qualified. It does not validate droplet capture, return,
coalescence, or the velocity margin. Transition, interface, nozzle band, head,
and post-nozzle extension receive no residence credit under the current rule.

## 4. Primary-source record

**[S1]** Oliveira, R. C.; Silva, F. A.; Gondim, M. P.; Mansur, M. B.
“A study of the drop size distributions and hold-up in short Kühni columns.”
*Brazilian Journal of Chemical Engineering* **25**(4) (2008), 729–741.
DOI: [10.1590/S0104-66322008000400010](https://doi.org/10.1590/S0104-66322008000400010).
Relevant locations: pp. 731–732 apparatus/method and Table 1; pp. 733–736
Figs. 2–5 and Eqs. (2)–(5); p. 736 count-based empirical cumulative
frequency. Full publisher text and rendered equation images were inspected;
local audit: `deliverables/kuhni-outlet-dsd-literature.md` §§S1, 4–5.

**[S2]** Schiller, L.; Naumann, A. “Über die grundlegenden Berechnungen bei der
Schwerkraftaufbereitung.” *Zeitschrift des Vereines Deutscher Ingenieure*
**77** (1933), 318–320. Original citation is reproduced by Myint et al.,
p. 81, ref. 15; no DOI is asserted. Myint et al. p. 77, Eq. (10), explicitly
identify `CD = 24/Re(1 + 0.15 Re^0.687)` as the single spherical solid-particle
equation.

**[S3]** Myint, W.; Hosokawa, S.; Tomiyama, A. “Terminal Velocity of Single
Drops in Stagnant Liquids.” *Journal of Fluid Science and Technology*
**1**(2) (2006), 72–81.
DOI: [10.1299/jfst.1.72](https://doi.org/10.1299/jfst.1.72).
Relevant locations: p. 72 Eqs. (1)–(3); p. 73 Eq. (4); p. 77 Eqs. (9)–(10);
pp. 79–80 tested envelope and conclusions. The retained publisher PDF was
visually inspected. Local evidence:
`deliverables/disengager-drag-myint-2006.pdf` and
`deliverables/disengager-drag-evidence.md`.

**[S4]** Barry, D. A.; Parlange, J.-Y. “Universal expression for the drag on a
fluid sphere.” *PLOS ONE* **13**(4) (2018), e0194907.
DOI: [10.1371/journal.pone.0194907](https://doi.org/10.1371/journal.pone.0194907).
Relevant locations: abstract; pp. 3–7 definitions and Eqs. (1)–(14), especially
the general Eq. (10); pp. 8–9 comparison/domain discussion. The retained
primary PDF was visually inspected:
`deliverables/rrbo-hydraulic-method/sources/barry-parlange-2018.pdf`.

## 5. Recommended `modelAudit` records

Each row should carry, at minimum:

`end`, `chainRole`, `modelId`, `authorityVersion`, `status`,
`sourceType`, `citation`, `exactLocator`, `sourceArtifact/hash`,
`verifiedProposition`, `requiredInputs`, `validityDomain`,
`currentDomainComparison`, `factorConvention` (margin only),
`roundingDirection` and `diameterBasis` (fabrication only), `reason`, and
`evidenceNeeded`.

Use distinct statuses rather than a single unavailable flag:

- `QUALIFIED` — exact source, transcription, inputs, range and end duty admitted;
- `CANDIDATE_NOT_QUALIFIED` — relevant equation/evidence exists, but transfer or
  input/domain validation is open;
- `NOT_ELIGIBLE_FOR_END_DUTY` — source is real but addresses another population,
  phase orientation or purpose;
- `NO_QUALIFIED_SOURCE_FOUND` — bounded audit found no admissible source;
- `PROCESS_SOURCE_REQUIRED` / `PROPERTY_SOURCE_REQUIRED` — model may be usable
  only after source-bound operating data exist.

Current recommended records are:

| End / role | Status | Reason summary |
|---|---|---|
| Top / droplet | `NO_QUALIFIED_SOURCE_FOUND` | Kühni donor DSD is local, number-weighted and wrong-service; active `d32` is not outlet flux/capture evidence. |
| Bottom / droplet | `NO_QUALIFIED_SOURCE_FOUND` | No RRBO-in-NMP-rich bottom outlet population; phase inversion forbids top `d32` transfer. |
| Top / terminal | `CANDIDATE_NOT_QUALIFIED` | Barry–Parlange candidate; sphericity, mobility, product properties and representative validation open; Myint `κ` out of range. |
| Bottom / terminal | `CANDIDATE_NOT_QUALIFIED` | Myint/Barry candidates; actual size, product properties/interface and full domain validation open. |
| Both / margin | `NO_QUALIFIED_SOURCE_FOUND` | `0.50` is an offline selection; correlation error and active capacity margin are not end-design factors. |
| Both / fabrication | `NO_QUALIFIED_SOURCE_FOUND` | No controlled shell-ID series/increment; historical comparisons excluded. |
| Both / normal flow and properties | `PROCESS_SOURCE_REQUIRED` + `PROPERTY_SOURCE_REQUIRED` | Accepted-trial mass binding is implemented where a compatible frozen reference exists; qualified operating product-phase densities and the full terminal-property set remain absent. No volumetric flow is admitted. |

## 6. Release conclusion

The implemented fail-closed structure is scientifically appropriate. The
automatic end-sizing authority must remain **HOLD** until the common process
gate and every per-end model row are independently qualified. The evidence does
not support admitting a preferred diameter, fabricating an end section, or
reporting actual separation performance today. It does identify viable future
work: source-bind the normal product trial/properties, measure each end’s
outlet-flux population, validate a per-end liquid-drop terminal model, adopt a
controlled margin convention, and obtain the fabricator’s shell-ID rounding
rule.