# Stage 5 end qualification — evidence review

**Review date:** 2026-09-23  
**Question:** Can the top NMP-in-RRBO and bottom RRBO-in-NMP outlet-population,
terminal-velocity, margin, and fabricated shell-ID links be released as
controlled automatic-sizing authority?

## Decision

**No complete, end-specific chain is qualified by the material reviewed.**
This is the result of the bounded searches and repository inspection recorded
below, not a claim that no relevant public, proprietary, or future evidence
exists.

The new work does identify two useful advances:

1. Myint, Hosokawa and Tomiyama provide an equation-bearing liquid-drop model
   with explicit mobility endpoints and an explicit experimental
   dimensionless envelope. It remains ineligible for the nominal top
   viscosity ratio and is not independently qualified for either actual
   product service.
2. IS 4049 (Part 2):1996 provides a genuine controlled **inside-diameter**
   table for torispherical formed ends. It is a credible project/fabricator
   series candidate, not yet the project's adopted shell-rounding authority.
   The standard does not itself say to round a process-calculated vessel
   diameter upward, and the inspected offer files do not commit a fabricator
   to that table.

Accordingly, no numerical droplet cutoff, terminal speed, margin factor, or
shell diameter is selected here. In particular, the earlier sensitivity
values and historical comparison diameters are not promoted into evidence.

## 1. Admission test used in this review

An automatic end calculation may be released only when all links below are
bound to the same end, operating state, and authority revision.

| Link | Minimum evidence for admission |
|---|---|
| Outlet population | One-way, crossing-plane **volume-flux** DSD and physical dispersed loading for that end; representative fluids, temperature, flow, agitation and terminal geometry; sampling/optical resolution and bias; upward/downward recrossings treated separately; outlet physical entrainment or carryunder specification. |
| Properties and phase identity | Equilibrated continuous/dispersed densities and viscosities plus interfacial tension at representative composition, temperature, water/solids/contaminant state. |
| Terminal model | Exact equations and iteration convention; spherical/deformed-shape treatment; clean/mobile, partially mobile and immobile/contaminated treatment; mass-transfer assumption; every stated dimensionless and geometric domain checked at the governing population sizes. |
| Allowable velocity | Controlled factor definition, including whether `Uallow = f vt` or another form; protected failure mode; percentile/grade-efficiency basis; treatment of property, DSD and model uncertainty; local withdrawal/nonuniform-flow qualification; end-specific applicability. |
| Physical shell ID | Controlled project/fabricator series stated on an inside-diameter basis, tolerance and thickness convention, next-not-less-than rounding algorithm, maximum size, material/forming availability, and compatibility with the selected head code. |

Passing a terminal correlation is not proof of end capture. Conversely,
measured outlet entrainment can qualify a complete geometry without pretending
that an isolated-drop equation alone predicts recirculation, coalescence, wall
capture or return through the terminal stator.

## 2. Independent outlet-population findings

### 2.1 Top: NMP-rich drops in upward RRBO-rich raffinate

**Status: `NO_QUALIFIED_SOURCE_FOUND` in this bounded review.**

The repository contains active-compartment DSD work and a last-active-stage
Exxsol-in-water photographic donor study. Neither is a one-way top outlet
volume-flux population. The new searches for NMP/oil droplet entrainment did
not retrieve a primary experiment measuring NMP-rich physical droplets
crossing the terminal plane and leaving an RRBO-rich raffinate outlet.

Oliveira et al. measured at least 400 photographed drops per condition in
18 classes over 0–9 mm at stages 0, 1, 3 and 5 of a five-stage, 150-mm Kühni
column. The reported cumulative distribution is number based. The system was
water continuous/Exxsol D-80 dispersed, mutually saturated and without mass
transfer. This verifies local active-stage DSD evidence, not the top duty in
this project. Exact locators are pp. 731–732 (apparatus and Table 1),
pp. 733–736 (Figs. 2–5 and Eqs. 2–5), and p. 736 (empirical cumulative
frequency).

Glatz and Cross provide a useful qualification method rather than a
population: their pilot-testing article defines entrainment as discrete,
undissolved droplets leaving with the other phase and states that entrainment
from **each end** can usually be measured by immediate centrifuging of outlet
samples. The exact locator is PDF pp. 7–8, “Other Pilot Plant Test
Considerations,” item “Entrainment.” It does not report a DSD, crossing-plane
flux, RRBO/NMP data, detection limit or permissible carryover.

**Still required for top:** simultaneously measure (a) one-way upward
NMP-rich volume flux and DSD immediately above the terminal stator, (b) the
population after the fresh-NMP distributor, and (c) physical droplet loading
and DSD in the raffinate withdrawal. Report a separate downward return flux,
recrossing/tag definition, dissolved NMP correction, and a physical-carryover
limit. Centrifuged outlet loading is a useful independent mass-balance check,
but does not by itself recover the entering flux DSD or return probability.

### 2.2 Bottom: RRBO-rich drops in downward NMP-rich extract

**Status: `NO_QUALIFIED_SOURCE_FOUND` in this bounded review.**

The new searches for oil-drop rise or carryunder in NMP-rich liquid did not
retrieve a primary experiment for this service. Generic oil/water separator
studies found by the search have different fluid properties, phase chemistry,
drop generation, interface condition and geometry and are not transferred.
No repository or offer artifact supplies a bottom outlet population.

The top active NMP `d32` cannot be inverted into an RRBO-in-NMP population.
A selected small-drop sensitivity is not a percentile, loading, or measured
carryunder criterion.

**Still required for bottom:** independently measure the one-way downward
RRBO-rich volume-flux DSD/load entering the bottom end, upward return flux,
and physical oil-droplet DSD/load at the extract withdrawal. Define
carryunder acceptance separately from dissolved hydrocarbons and from total
extract composition. Use representative phase-inverted operation, including
startup/interface excursions.

### 2.3 What is verified versus missing

| Proposition | Verified | Missing / not established |
|---|---|---|
| A local Kühni DSD can differ from a transported population | Oliveira's local photographs; Kentish et al. publisher abstract distinguishes static photographic and dynamic probe distributions, DOI [10.1021/ie9702690](https://doi.org/10.1021/ie9702690). | No top or bottom target outlet flux population. |
| Each outlet's physical entrainment can be sampled independently | Glatz/Cross pilot guidance, PDF pp. 7–8. | Target DSD, load, detection limit, sampling bias, carryover/carryunder specification. |
| End populations must be independent | Opposite dispersed-phase identity and direction are fixed by the process duty. | Any source-authorized transformation between the two populations. |
| Coalescence can alter end DSD | Primary Kühni/coalescence literature in the prior repository review supports population evolution and fitted kinetics. | Target kernels, end-region history, collected inventory, and demonstrated return path. |

## 3. Terminal-velocity equation audit

### 3.1 Myint–Hosokawa–Tomiyama (2006)

Primary source: W. Myint, S. Hosokawa and A. Tomiyama, “Terminal Velocity of
Single Drops in Stagnant Liquids,” *Journal of Fluid Science and Technology*
1(2), 72–81, DOI
[10.1299/jfst.1.72](https://doi.org/10.1299/jfst.1.72). The publisher PDF was
newly downloaded and rendered for this review; SHA-256
`8986cba980b1db3590a48c5b608efb3a0ce71b0f0b9094d9c92e289a52f66b85`,
identical to the retained repository PDF.

**Exact equation structure and locators**

- p. 72, Eqs. (1)–(3): `Eo = g(ρc−ρd)d²/σ`,
  `Re = ρc VT d/μc`, and
  `M = g μc⁴(ρc−ρd)/(ρc² σ³)` under the paper's sign/orientation convention.
- p. 73, Eq. (4): Hadamard–Rybczynski spherical clean-drop drag,
  `CD = [8/Re][(2+3κ)/(1+κ)]`, with `κ = μd/μc`.
- p. 73, Eq. (5): Levich interface-retardation form introduces `C/μc`;
  `C = 0` is clean/mobile and `C → ∞` is fully contaminated/immobile.
- p. 77, Eq. (9): the Levich mobility factor multiplies the
  Schiller–Naumann finite-`Re` term `(1 + 0.15 Re^0.687)`. Solve it
  consistently with the buoyancy/drag balance and the definition of `Re`;
  do not insert a rigid-particle terminal speed and then relabel it.
- p. 77, Eq. (10): the cited Schiller–Naumann expression is the single
  spherical **solid-particle** endpoint.
- pp. 79–80 and Fig. 9: reported maximum velocity prediction error is about
  10% within the experiments.

**Published experimental envelope:** `−11.6 < log10(M) < −0.9`,
`0.17 < Re < 200`, `0.017 < Eo < 12.1`, and `0.1 < κ < 100`.
The paper includes clean and fully contaminated systems. Finite, partially
mobile target interfaces require a sourced `C` rather than an arbitrary
interpolation.

**Decision:** candidate, not authority. The nominal top `κ ≈ 0.0237` is
outside the published range. The nominal bottom `κ ≈ 42.2` is inside that one
range, but actual product properties, governing sizes, `M`, `Re`, `Eo`,
interface state and mass-transfer/contamination state remain unqualified.
The paper's 10% in-range model error is not an end-design safety factor.

### 3.2 Shape companion evidence

A. Tomiyama, W. Myint and S. Hosokawa, “Shapes of Single Drops Rising Through
Stagnant Liquids,” *Journal of Fluid Science and Technology* 2(1), 184–197,
DOI [10.1299/jfst.2.184](https://doi.org/10.1299/jfst.2.184). The publisher
PDF was downloaded and rendered; SHA-256
`d5a396fe66768bed2acecbe99a666ea9e85bedfdcafdc959c913155e03906dbc`.

The paper correlates the clean-drop aspect ratio with Tadaki number and
documents surfactant and viscosity-ratio effects on fore/aft distortion. Its
abstract/conclusions state the clean-drop shape-correlation envelope:
`−11.6 ≤ log10(M) ≤ −0.9`, `0.015 ≤ Re ≤ 850`,
`0.017 ≤ Eo ≤ 9.3`, `0.0074 ≤ Ta ≤ 3.6`, and
`0.1 ≤ κ ≤ 100`.

This is valuable shape evidence, but it does not turn Eq. (9) of Myint et al.
into an all-shape, all-mobility target-service model. The clean aspect-ratio
correlation and the contaminated-interface terminal correlation have
different stated purposes and ranges; both still exclude the nominal top
viscosity ratio.

### 3.3 Other equation-bearing candidates

| Source | Exact support | Domain/assumption that prevents present admission |
|---|---|---|
| Barry & Parlange (2018), “Universal expression for the drag on a fluid sphere,” DOI [10.1371/journal.pone.0194907](https://doi.org/10.1371/journal.pone.0194907) | Eq. (10), pp. 3–7, covers viscosity ratios from bubble to solid-sphere limits; comparisons on pp. 8–9. | **Spherical**, isolated particle in infinite homogeneous liquid, no interphase mass transfer, no wobble/oscillation; stated useful Reynolds range only up to a few hundred. Shape-domain selection is referred to `Re/Eo/M` diagrams rather than supplied as a target gate. |
| Weber et al. (2019), “Performance Map for the Design of Liquid-Liquid Extraction Columns,” DOI [10.1002/cite.201900057](https://doi.org/10.1002/cite.201900057) | Main-text Eqs. (1)–(2) interpolate rigid and ideally mobile terminal speeds with mobility weight `γ`; small spherical mobile branch uses Thorsen et al. (SI Eq. S1), deformed mobile branch Hamielec–Johnson (SI Eqs. S2–S3), and rigid branch SI Eqs. S4–S5. Section 3.1 fits `γ = 0.2` to 491 literature measurements, average deviation 10.4%, maximum below 30%. | No complete `Re/Eo/M/κ` validation envelope is stated in the fetched main text. The universal fitted `γ` is not target interface evidence; shape-branch continuity and target mass-transfer/contamination transfer remain to be checked. |
| Henschke & Pfennig (1996), “Simulation of packed extraction columns with the REDROP model” | PDF §2.1 uses separate Ishii–Zuber rigid/circulating and Hu–Kintner oscillating-drop formulas, choosing the intersection as transition. Newly fetched PDF SHA-256 `f464da14ce179d45c5ed22be2f7ca61881b64456d7754bf5f64e228b8d8c18f3`. | Packed-column simulation, not this end region; formula domains and target-service validation are not supplied by this conference paper. It also states its splitting/coalescence probabilities are ad hoc and require experimental verification (§2.3). |

**Terminal-model conclusion:** no reviewed equation set simultaneously has
qualified target properties, outlet sizes, shape branch, mobility/interface
condition, mass-transfer condition and complete dimensionless-domain checks
for either end. The bottom has the stronger correlation candidate; that does
not make it released.

## 4. Allowable-velocity/margin convention

**Status for both ends: `NO_QUALIFIED_SOURCE_FOUND` in this bounded review.**

Searches for extraction-column end settlers, liquid-liquid gravity
separators, and superficial-velocity fractions did not yield a primary or
controlled source establishing the repository's earlier factor for this
duty. Gas/liquid separator `K` methods and oil/water horizontal-settler
criteria address different mechanics. Active-column percent-of-flooding or
percent-of-modeled-capacity rules are not terminal outlet-capture margins.

Glatz/Cross supports an outcome-based convention: measure physical
entrainment at each outlet during pilot operation and enlarge the chamber,
add a coalescing element, or add an external separator if the tolerated
entrainment is exceeded. It supplies no universal terminal-velocity fraction.

### Controlled convention recommended for qualification

The project may adopt a versioned engineering convention, but it should not be
misrepresented as a literature constant. Its approval record should contain:

1. equation and direction, for example `Uallow(d*) = fU × vt,lower(d*)` with
   `0 < fU < 1`, or a grade-efficiency equation if a full DSD is used;
2. the end-specific governing percentile/physical-load criterion `d*` and why
   that criterion protects the accepted carryover/carryunder limit;
3. lower-confidence treatment of product properties, DSD resolution,
   terminal-model error and interface mobility—without counting the same
   uncertainty twice;
4. local-flow multiplier or resolved withdrawal-field evidence for
   nonuniformity, jets, level band, swarm and recirculation;
5. explicit return-path requirement, because local settling without a route
   back through/around the terminal boundary is not capture;
6. validation points at normal, maximum intended process throughput,
   startup/interface excursion and representative contamination/age;
7. separate top and bottom approval, unless common applicability is
   demonstrated.

A correlation's prediction error cannot be copied directly into `fU`. A
margin should be calibrated or verified against the protected outlet result,
with acceptance such as an upper confidence bound on physical dispersed mass
or volume leaving the outlet.

## 5. Fabrication shell-ID evidence

### 5.1 Repository and vendor-file inspection

Nine retained `uploads/offer-templates/tmp/*uor-with-solvant-extraction-offer_001.pdf`
files were text-extracted and searched for vessel/column diameter, shell,
inside diameter, settler and disengagement terms. They describe the NMP
extraction system but do not contain a controlled end-shell ID series,
next-size rule, thickness/tolerance basis, or fabricator commitment. One
representative file has SHA-256
`fd81890d3063901eefae65dee1fceb4fee944b82c781ea94c030783ae9670d48`;
the conclusion is based on all nine inspected offer-template PDFs, not on
that hash alone.

The repository's historical alternatives, active-column search grids and
reserved layouts are engineering comparisons, not purchasing/fabrication
series. Pipe nominal sizes are not custom shell IDs.

### 5.2 Newly verified controlled candidate: IS 4049 (Part 2):1996

Primary controlled standard:
[IS 4049 (Part 2):1996, Formed Ends for Tanks and Pressure Vessels —
Specification, Part 2 Inside Diameter Basis](https://archive.org/download/gov.in.is.4049.2.1996/is.4049.2.1996.pdf).
The PDF was downloaded and rendered, SHA-256
`a5c5289ddb8fb95f4ee2fe52e7eb1542c2003cb40ba0c5a35d6d2a4250923a83`.

Verified exact content:

- p. 1, §§1 and 4.1: the standard covers pressed/spun formed ends on an
  **inside-diameter** basis; inside diameter, crown radius and knuckle radius
  must conform to Tables 1–3.
- p. 1, §4.4.1: finished-end inside circumference tolerance is ±5 mm through
  400 mm ID and ±0.25% above 400 mm ID, unless a more stringent tolerance is
  specified.
- p. 2, §§4.4.2–4.4.4: circularity, thickness and profile tolerances.
- p. 3, Table 1: controlled IDs for deep torispherical ends:
  400–2400 mm in 100-mm steps, then 2600, 2800, 3000, 3200, 3400, 3600,
  3800, 4000, 4250, 4500, 4750 and 5000 mm. Table 1 also gives crown and
  inside-knuckle radii. Sizes below 400 mm are directed to pipe-cap outside
  diameters.
- p. 6, Annex A: purchaser/manufacturer enquiry information; the body also
  makes material, thickness and certain delivery conditions purchaser or
  purchaser/manufacturer responsibilities.

This is a formed-**end** dimensional standard, not an automatic process-sizing
or shell-rounding rule. It references IS 2825:1969 as a necessary adjunct;
the current project design-code/edition hierarchy has not been reconciled.
No inspected fabricator file confirms tooling or commercial availability for
every table entry.

**Current status: `CANDIDATE_NOT_QUALIFIED`, not an adopted diameter.**

### 5.3 Exact adoption action

A controlled project/fabricator authority can adopt the applicable IS 4049
Table 1 ID set (or another supplied controlled set) and define:

`Dshell = min { D in approved_ID_set | D >= Dcalc }`.

The adoption record must identify standard/edition/table and checksum,
torispherical profile, vessel code hierarchy, shell/head ID matching datum,
formed-head and rolled-shell tolerances, corrosion allowance and nominal
thickness treatment, material/forming/tooling availability, permitted minimum
and maximum, and tie behavior when `Dcalc` equals a listed ID. It should state
that process calculations use the guaranteed minimum usable ID if tolerance
can reduce clear diameter.

Until procurement/fabrication authority signs that record, the standard is
strong evidence for a controllable candidate series but does not release a
physical shell diameter.

## 6. Dated search and inspection log

All searches below were executed on **2026-09-23** using the repository's web
search/fetch capability; critical propositions were checked in fetched pages
or PDFs rather than accepted from snippets.

| Search angle / representative queries | Sources opened or rendered | Result |
|---|---|---|
| Kühni/RDC outlet DSD; extraction settler carryover; one-way outlet entrainment | Oliveira DOI; ACS/Kentish records; AIChE Glatz/Cross PDF; Kühni terminal repository reviews | Local/static/active DSD and outlet bulk-entrainment method found; no target top or bottom flux-weighted outlet DSD. |
| NMP droplets in oil/raffinate/RRBO; oil drops in NMP; NMP carryunder | Search results screened against phase chemistry and duty | No target primary population retrieved; generic oil/water results rejected as non-transferable. |
| Liquid-drop terminal velocity across shape and mobility | Myint 2006 PDF rendered (pp. 72, 73, 77–80); Tomiyama 2007 PDF rendered; Barry/PLOS full text fetched; Weber/Wiley full text fetched; Henschke/Pfennig PDF rendered | Explicit candidates and domains documented above; no complete target-qualified all-link model. |
| Extraction end-settler allowable velocity / terminal-velocity safety factor | Liquid-liquid extractor sizing, gravity separator and pilot-testing results screened | No controlled target factor found. Outcome measurement guidance found; gas/liquid and oil/water criteria not transferred. |
| Pressure-vessel preferred IDs; ASME/EN/Indian standards; fabricated shell increments | ASME scope pages; DOE code comparison; IS 4049 Parts 1 and 2 PDFs; repository offer PDFs | ASME/EN scope material did not provide a preferred custom shell-ID series. IS 4049 Part 2 Table 1 provides a controlled formed-end ID candidate, with adoption gaps stated above. |
| Repository/vendor artifacts | `docs/task-306-end-sizing-source-audit.md`; relevant `deliverables/`; three attached Stage-5 rule texts; nine offer-template PDFs; mechanical-vessel governance memory | No current outlet populations, margin authority or signed fabricator series. Prior numerical sensitivities remain excluded. |

Searches were bounded by public indexing/access and the repository contents.
Paywalled full texts and proprietary vendor datasets may exist. The proper
statement is therefore “no qualified source was retrieved and admitted in
this review,” not “the literature contains none.”

## 7. Per-end release matrix and next qualification work

| End / link | Status after this review | Smallest defensible next action |
|---|---|---|
| Top outlet population | `NO_QUALIFIED_SOURCE_FOUND` | Representative one-way terminal/top/outlet DSD and physical-load campaign with dissolved-NMP correction and return tracing. |
| Bottom outlet population | `NO_QUALIFIED_SOURCE_FOUND` | Independent phase-inverted terminal/bottom/outlet DSD/load campaign and oil carryunder specification. |
| Top terminal equation | `CANDIDATE_NOT_QUALIFIED` | Measure isolated NMP-rich drop settling over the governing top population using equilibrated RRBO-rich continuous phase; fit/validate shape and mobility; top nominal `κ` requires a model whose range includes it. |
| Bottom terminal equation | `CANDIDATE_NOT_QUALIFIED` | Select measured bottom population first, source equilibrated properties, then check `M/Re/Eo/κ` point-by-point and validate RRBO-drop rise. |
| Top allowable velocity | `NO_QUALIFIED_SOURCE_FOUND` | Approve and pilot-verify an explicit convention against physical raffinate entrainment. |
| Bottom allowable velocity | `NO_QUALIFIED_SOURCE_FOUND` | Approve and pilot-verify an explicit convention against physical extract carryunder. |
| Shell-ID series | `CANDIDATE_NOT_QUALIFIED` | Project mechanical authority and actual fabricator jointly adopt a versioned ID series/round-up rule; IS 4049 Part 2 Table 1 is a documented candidate. |

The normal-product flow/property gate from the Task 306 audit remains in
force. The terminal-property measurements should be taken from the same
accepted operating trial as the outlet populations wherever practicable.

## Release conclusion

Keep both automatic end diameters on **HOLD**. The evidence now supports a
more precise qualification plan and a non-arbitrary candidate formed-end ID
series, but it does not support a preferred top or bottom diameter. Release
requires, independently for each end: source-bound normal product flow and
properties, measured outlet-flux population and accepted physical
entrainment criterion, a shape/mobility model proven inside every stated
domain, an approved margin convention, and a project/fabricator-controlled
inside-diameter round-up authority.