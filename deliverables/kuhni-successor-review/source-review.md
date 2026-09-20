# Primary-source review for the proposed successor rotor–stator geometry

**Engineering-review evidence only. PRELIMINARY PRE-PILOT GEOMETRY & DRAWINGS — NOT FOR FABRICATION.**

Scope: the three user briefs ending `1789878862140`, `1789878989358`, and `1789879153465` govern this review. The double-entry, radial-flow, shrouded six-blade turbine is an established project construction decision. This review does not reopen that decision, change Stage 2/3/4, certify an eye dimension, or modify existing R1 geometry. The Stage-3 saved-state audit is a separate workstream; 198-mm OD and 44-mm shaft here are the requested conditional design inputs, not an independently verified live record.

## 1. Primary sources actually inspected

PDF figures/tables listed below were rendered and visually inspected, not inferred from text extraction. PNG and text extracts are in `sources/`; source PDFs remain at their original paths.

### G — Dirk Garthe, *Fluiddynamics and Mass Transfer of Single Particles and Swarms of Particles in Extraction Columns*, TU München dissertation

- Primary local file: `attached_assets/Paper_1788587264307.pdf`.
- Repository record: https://mediatum.ub.tum.de/601973 (cached project HTML reports a bot-protection page; the local supplied primary PDF, not that HTML, was inspected).
- SHA-256: `39a39035d63f0b84bc74957ccf17b7a8c67ec456e73e4277491bc2cbb2bd53fc`.
- Printed pp. 63–64, §4.5 and Figure 4.9 (PDF pages 75–76): the Kühni compartment illustration is bottom-right. It depicts annular stators, a common shaft and six stepped-looking radial blades. The illustrated blades are exposed; a pair of annular rotor shrouds is **not visibly established by this figure**. This is a limit on using this particular illustration as a shrouded-turbine manufacturing reference, not proof that shrouded Kühni turbines do not exist.
- Printed p. 177, Table A.1 (PDF p. 189): Kühni six-blade agitator diameter 45 mm, height 7 mm, relative stator free area 0.40, compartment height 50 mm, shaft diameter 10 mm.
- No turbine-eye diameter, rotor-shroud ID/OD/thickness, blade thickness, hub OD/height, stepped-web numerical proportions, or turbine-to-stator clearance dimension is supplied in that table.
- The table's 1- and 2-mm sieve-tray thicknesses and 2- and 4-mm perforation diameters belong to **different pulsed sieve-tray internals**. They must not be silently assigned to the Kühni stator.
- The 7/45 height ratio and 10/45 shaft ratio are calculated apparatus ratios, not universal scale laws. Applying them at OD 198 gives 30.8-mm height and 44-mm shaft, but those extrapolations are **PRE-PILOT ENGINEERING RULES**, not source-backed target dimensions. Adding shrouds also requires defining whether “height” includes them; Garthe does not settle that for the proposed successor.

### O — N. S. Oliveira, D. Moraes Silva, M. P. C. Gondim, M. Borges Mansur (2008), “A Study of the Drop Size Distributions and Hold-Up in Short Kühni Columns”

- *Brazilian Journal of Chemical Engineering*, 25(4), 729–741.
- Primary local file: `attached_assets/A_STUDY_OF_THE_DROP_SIZE_DISTRIBUTIONS_1788585700948.pdf`.
- SHA-256: `5381a0eb1d1ea54d6f3eacabf644364306d4bcbd0edf226191d6d4947be39317`.
- Printed p. 731, “Experimental / Kühni Pilot Scale Unit” (PDF p. 3): five stages, column diameter 150 mm; six-blade rotor diameter 85 mm and height 10 mm; stator fractional free area 30%; stator spacing 70 mm. Internal parts AISI 316; annular Teflon gaskets prevent bypass between stator and wall.
- Apparatus ratios: 85/150 = 0.5667; 10/85 = 0.11765; 70/150 = 0.4667. These differ from Garthe and do not select target DTI, HR, hub or shroud dimensions.
- The same paragraph describes **170 holes of 1-mm diameter on five concentric circles in the inlet distributor**, not holes in each stator. Do not repurpose the distributor pattern as the proposed stator pattern.
- The inspected apparatus text supplies no eye diameter or detailed shroud/hub/blade-entry dimensions. “Six-blade rotor” alone is not a dimensional shroud specification.
- Its water-continuous/Exxsol-dispersed system must not replace the saved project's phase configuration.

### A — Asadollahzadeh et al. (2017), “Experimental Determination of Continuous Phase Overall Mass Transfer Coefficients: Case Study: Kühni Extraction Column”

- *Iranian Journal of Chemistry and Chemical Engineering*, 36(5), primary article.
- Primary local file: `research/sources/kuhni-mass-transfer/asadollahzadeh-2017-primary.pdf`.
- Primary source URL recorded with the project copy: https://ijcce.ac.ir/jufile?ar_sfile=344118
- SHA-256: `317c207d4fa0618f123b14239794aab51c1f29ddba217b91a08af2e532190239`.
- Printed p. 150 (PDF p. 2), “Description of the Equipment”: explicit **50-mm diameter shrouded six-blade turbine agitator**, ten stages. This is direct primary support for a shrouded six-blade Kühni construction family.
- Printed p. 151 (PDF p. 3), Table 1: shrouded six-bladed turbine diameter 0.05 m; working height 0.7 m; stator fractional free area 0.212; ten compartments.
- Figure 1 on p. 151 includes an enlarged compartment sketch with perforated stators and a visibly shrouded rotor. It is a **schematic**, not a dimensioned component drawing: do not measure or scale its eye, hub, blade geometry, stator hole count or PCD.
- Important source inconsistency: prose says column internal diameter **113 mm**, while Table 1 says column diameter **0.117 m**. Preserve this discrepancy; neither is needed to infer the target eye.
- The inspected paper supports the construction family and a perforated-stator illustration, not a universal DSO/DTI relation, total free area of 0.40 for the successor, or published 198-mm turbine dimensions.

## 2. Evidence conclusion

There is primary support for shrouded six-blade Kühni turbines, and a primary illustration of perforated stators. The accepted user topology therefore need not be reopened. However, **Garthe's illustrated exposed-blade geometry cannot be presented as a dimensioned source for the new upper/lower shrouds**.

No inspected primary source establishes a numerical turbine eye DTI, eye/OD ratio, upper/lower eye thickness, lip radius, entry-blade start radius, or capture margin CE for this proposed 198-mm turbine. A limited additional web search returned no usable dimensioned primary eye source; unrelated pump/compressor/wind-turbine sources were rejected. This is an evidence gap, not a claim that such evidence cannot exist.

Consequently:

| Item | Valid report classification |
|---|---|
| D, DR, hc, RPM, empirical phi and phase orientation from verified saved Stage 3 | INHERITED |
| Six blades and shrouded construction family | SOURCE-BACKED REFERENCE, also adopted project topology |
| Explicit double entry and turbine-first successor sequence | Adopted PRE-PILOT ENGINEERING RULE / user design basis |
| Garthe 45-mm rotor, 7-mm height, 10-mm shaft in its own apparatus | SOURCE-BACKED REFERENCE |
| Scaling those to HR = 30.8 mm and ds = 44 mm for DR = 198 mm | PRE-PILOT ENGINEERING RULE (shaft not strength verified) |
| New hub, shroud thickness, stepped inner web, eye and DSO values | Proposed PRE-PILOT ENGINEERING RULE with rationale, or UNRESOLVED |
| DSO < DTI < DR and positive CE | Adopted PRE-PILOT ENGINEERING FLOW-PATH RULE, not literature correlation |
| Area and ligament results from fully defined proposed solids | SYSTEM CALCULATED |
| Pumping number, circulation ratio, hydraulic equivalence, shaft adequacy | UNRESOLVED / outside demonstrated evidence |

## 3. Physically coherent topology available for a review candidate

The parent report can propose the following **explicit engineering topology**, without attributing it to proprietary Kühni detail:

1. Shaft on the z axis, rotor centered at z = 0; common OD 198 mm defines the maximum swept envelope. Shaft OD 44 mm is preliminary.
2. Upper and lower **annular** rotating shrouds, each with a central eye DTI; no solid disc covering the inlet. Declare outer/inner surfaces and thicknesses explicitly. If HR is overall height, internal clear separation is HR minus the two shroud thicknesses, not HR.
3. Hub attached to the shaft; hub OD and axial extent stated independently. Six radial blades at 60° increments connect the hub/rotor structure to the discharge region. Full-height outer paddles meet the two inner shroud faces; any thinner stepped inner web must be explicitly dimensioned, not inferred from Garthe's undimensioned picture.
4. Upper and lower approach liquid enters through the two annular eyes, turns into the blade passages, and discharges through the open cylindrical perimeter between shrouds. Do not close that perimeter with a continuous rim.
5. The hub may project to the eye planes or terminate inside them. These are different area cases; identify which candidate is drawn. A shaft-only eye calculation is valid at a face only if the hub/blades do not intersect that face.
6. A double-entry shared chamber need not include a full middle dividing disc. If a dividing disc is proposed, identify and dimension it; its presence changes the turn passages and blade topology and cannot be added invisibly.
7. No topology can determine a unique eye diameter from DR alone. A candidate eye can be chosen from explicit component-fit, passage-area and manufacturing constraints, provided those constraints are themselves labelled proposed engineering rules. Do not dress a target fraction of DR as a solved physical law.

## 4. Correct effective-area accounting for that topology

For each **actual inlet cut** S at axial coordinate z:

`A_open(z) = area(eye-domain(S) minus union(shaft, hub, blades, lips and other solids intersecting S))`.

Use union geometry, not the sum of independently projected blockers. The shaft's cross-section is already inside a solid coaxial hub cross-section whenever both exist; subtracting both would double-count. A shroud annulus outside the nominal DTI does not additionally block the nominal eye unless a lip/fillet intrudes into it.

Report at least:

- Upper and lower gross eye areas, each pi DTI²/4 (equal only for symmetric eyes).
- Upper and lower shaft-only corrections, each pi(DTI² − 44²)/4.
- Upper and lower actual eye-face areas, with solids present at those faces.
- Distinct internal pre-turn throat areas where hub or inner blades intrude.
- The controlling admissible inlet section for each entry branch, with z and physical drawing section identified.
- Radial turn/discharge passage areas as separate geometric diagnostics, not casually called “axial eye area.”

Do **not** search all horizontal planes through the rotor for the smallest number without regard to the flow turning radially: a central dividing disc or symmetry/stagnation plane may have zero axial-through area but does not mean both entries are blocked. Conversely, gross inlet face area alone can miss a smaller internal throat. Sections must intercept the same branch before its flow leaves radially, or a control-volume/stream-tube construction must be stated.

For straight rectangular radial blades within a circular annular eye, an exact 2D cut or circle–strip intersection should be used. `6 * blade_thickness * (eye_radius − hub_radius)` is only an approximation when defining radial start/end by circles; swept corner geometry and overlaps must be handled consistently.

In a perfectly mirrored candidate, upper and lower effective areas may calculate equal. Report them separately and explain that equality follows from the proposed symmetry, not from a measurement or universal Kühni result.

An “effective” area in this report is **geometric unobstructed area**. It is not discharge-coefficient-adjusted hydraulic area, a pumping capacity, a validated NQ, or proof of local circulation rate.

## 5. Implications for downstream stator and clearances

- Establish DTI first; choose DSO with DSO < DTI and show CE = (DTI − DSO)/2 > 0. Compare actual entry areas as well as diameters.
- Keep the user-approved gross convention: pi DSO²/4 + sum(pi dh_i²/4) = 0.40*pi*600²/4. For identical holes, DSO² + Nh*dh² = 144000 mm².
- The 379.473-mm old central opening exceeds the proposed 198-mm rotor and already exhausts 40% gross area. It cannot be reused for this successor.
- Do not compensate shaft blockage by inflating the gross perforation area unless the governing convention itself is explicitly changed in a later approved rule set.
- Stator support projections, where physically crossing apertures, reduce a separate net diagnostic by the **union** of actual obstruction footprints. Support arms below/above a plate are not equivalent to removed plate hole area but may form another flow section.
- Turbine/stator face clearance for centered rotor, pitch hc and stator thickness ts: `(hc − ts − HR)/2` only when stator centers delimit the compartment and HR is total shrouded envelope. If the model datum uses plate faces, change the expression accordingly.
- Available source ratios do not establish material strength, minimum acceptable ligament, shroud buckling, weldability, fatigue, shaft critical speed or fabrication tolerance. A hole pattern can be geometrically non-overlapping while structurally unqualified.

## 6. Deliverable boundary

This evidence review is intentionally not an approved final successor rule set. No application source files, database records, saved revisions or historical drawing artifacts were edited. Only this report, a PDF evidence-rendering helper, and local rendered evidence extracts were added under `deliverables/kuhni-successor-review/`.