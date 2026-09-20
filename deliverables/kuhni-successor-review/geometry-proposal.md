# Proposed successor rotor–stator geometry: calculation appendix

**UNAPPROVED ENGINEERING REVIEW CANDIDATE — NOT FOR FABRICATION.**

This is a report-only development, not a replacement of the existing R1 rules or saved drawings. All dimensions below are in mm and areas in mm². The independent companion Stage-3 audit confirms design 269 / saved run 64 and the inherited dimensions below. See source-review.md for the separate primary-reference review; it does not establish the proposed numerical eye or shroud dimensions. A numerical candidate is provided to expose engineering decisions for review, not to disguise the absence of a unique published sizing law.

## 1. Basis and provenance

Provenance labels: **INHERITED** = Stage-3/4 input confirmed by the companion audit; **SYSTEM CALCULATED** = deterministic geometry from stated inputs; **PRE-PILOT R1 ENGINEERING RULE** = explicitly proposed, unapproved successor choice (not an existing approved software rule); **UNRESOLVED** = requires evidence or engineering approval. SOURCE-BACKED REFERENCE is deliberately not assigned to a dimension merely because similar historical equipment exists.

| Quantity | Candidate | Provenance / rationale |
|---|---:|---|
| Column inside diameter D | 600 | INHERITED, confirmed design269/run64 |
| Overall turbine diameter DR | 198 | INHERITED, audited DR/D = 0.33 |
| Compartment pitch hc | 180 | INHERITED, confirmed |
| Empirical stator fraction phi | 0.40 | INHERITED; mapping to physical gross area is an engineering convention, not hydraulic equivalence |
| RPM / feasible window | 45 / 30–60 | INHERITED from companion saved-result audit; not 70 RPM |
| Phase configuration | NMP continuous / RRBO dispersed | INHERITED from companion audit |
| RRBO net flow | 4000 L/h | INHERITED; not equated to turbine circulation |
| Shaft ds | 44 | PRE-PILOT R1 ENGINEERING RULE: user-stipulated preliminary shaft, not strength-qualified or a new hydraulic selection |
| Turbine type | Double-entry radial-flow shrouded | Established user construction basis; no basic type re-selection |
| Blade count / spacing | 6 / 60° | Established six-blade reference construction; geometrical spacing SYSTEM CALCULATED |
| Hub diameter / height | 70 / 24 | PRE-PILOT R1 ENGINEERING RULE: explicit review candidate; 13 mm radial hub material around the shaft, ample overlap with the proposed web. Attachment/key/fit/weld design UNRESOLVED |
| Blade thickness | 3 | PRE-PILOT R1 ENGINEERING RULE: trial plate gauge; stress, vibration, corrosion and joining not qualified |
| Inner web axial height | 16 | PRE-PILOT R1 ENGINEERING RULE: reduced-height web to retain entry paths above and below while connecting the hub to outer paddles |
| Outer blade axial height | 28 | PRE-PILOT R1 ENGINEERING RULE: trial discharge height, independent of net process flow |
| Shroud thickness, each | 2 | PRE-PILOT R1 ENGINEERING RULE: geometric sheet envelope only; strength and distortion not qualified |
| Shroud radial width | 34 | PRE-PILOT R1 ENGINEERING RULE: explicit trial support/outer-paddle width; selection procedure below |
| Overall turbine height HR | 32 | SYSTEM CALCULATED: 28 + 2×2 |
| Stator thickness | 4 | PRE-PILOT R1 ENGINEERING RULE: review plate envelope, not mechanical design; differs from old R1 min(D/160,hc/20) = 3.75 |

The hub is not silently inherited from the former R1 1.6ds convention. The round 70 mm candidate is proposed here and must be approved independently; changing it changes all effective eye calculations.

## 2. Turbine topology and derivation of the eye

### 2.1 Coordinate definition suitable for proposed sketches

Use a rotor-local Cartesian system: Z = 0 at the turbine midplane, Z positive upward, X/Y in the transverse plane, positive azimuth counterclockwise from +X when viewed from +Z. Translate the rotor-local origin to each inherited rotor elevation only after approval. A typical compartment has stator centre planes at Z = ±90.

The candidate consists of:

* Continuous Ø44 shaft.
* Annular hub: radial interval 22 ≤ r ≤ 35; axial interval −12 ≤ Z ≤ +12.
* Lower shroud: annulus 65 ≤ r ≤ 99; −16 ≤ Z ≤ −14.
* Upper shroud: annulus 65 ≤ r ≤ 99; +14 ≤ Z ≤ +16.
* Six 3-mm-thick radial blades at azimuths 0°, 60°, 120°, 180°, 240°, 300°.
* Each blade's inner web occupies 35 ≤ r < 65 and |Z| ≤ 8.
* Each blade's outer paddle occupies 65 ≤ r ≤ 99 and |Z| ≤ 14.
* Both axial eye apertures are Ø130, bounded by the inner shroud edge. The upper and lower entries are geometrically identical.
* Discharge is through the six outer-periphery passages between the shrouds, not through drilled holes in the shrouds.

For an exact blade solid at azimuth alpha, rotate local coordinates (u,v), with u outward along the blade and v transverse. The blade lies within |v| ≤ 1.5, u > 0 and 35 ≤ sqrt(u²+v²) ≤ 99; its axial half-height is 8 for r < 65 and 14 for r ≥ 65. Thus the root, step and outer edge are cylindrical-radius trimmed. There are no rectangular corners protruding beyond DR = 198. Joining surfaces at r = 35 and Z = ±14 are intentional interfaces, not collisions. Six blades are distinct; the opposite blade is not double-counted as part of one strip.

In the zero-thickness centre-plane sketch the positive-radius stepped blade outline is (r,Z):
(35,−8), (65,−8), (65,−14), (99,−14), (99,+14), (65,+14), (65,+8), (35,+8). Finite-thickness construction must use the radial clipping above, not extrude these coordinates into an oversized rectangular outer corner.

### 2.2 Why DTI is not a fixed percentage of DR

Neither the inherited variables nor gross free area uniquely determines DTI. The proposed construction defines it through a **chosen physical shroud/paddle radial width w**:

DTI = DR − 2w.

For review, consider w = 30–38: this provides an outer working/shroud span of 10–12.7 blade thicknesses and leaves an inner radial web reach of 26–34 from the Ø70 hub. These are declared geometric screening choices, not stress criteria, published Kühni proportions or an optimum. A nominal w = 34 balances those two spans and gives:

**DTI = 198 − 2×34 = 130.**

The resulting DTI/DR ratio is merely an output (approximately 0.6566), not the sizing rule. Its unique acceptance remains UNRESOLVED pending engineering review and any primary-source dimensional evidence. Selecting a physical width does not eliminate the engineering assumption; it makes the assumption explicit and testable.

| Trial shroud width | Calculated eye | Minimum eye-disk area in turning region, each side (diagnostic) | Conditional centre-opening candidate using §4 rule |
|---:|---:|---:|---:|
| 30 | 138 | 10,496.577 | 120 |
| **34** | **130** | **8,884.689** | **112** |
| 38 | 122 | 7,373.333 | 104 |

These are sensitivity alternatives, not three approved designs. Remaining calculations use the middle candidate only.

## 3. Upper and lower entry sections and obstruction union

### 3.1 Gross and shaft-corrected areas

For DTI = 130 and ds = 44:

* ATI,gross = π×130²/4 = **13,273.229**.
* Ashaft = π×44²/4 = **1,520.531**.
* ATI,shaft-corrected = **11,752.698**.

For this particular topology, the shaft-only number **is** the actual geometric effective area at each shroud eye face: the hub and blades do not reach those faces. It is not the same as every internal cross-section. The internal station analysis below is necessary but must not be mistaken for a series of identical-flow axial throats.

### 3.2 Actual axial station schedule

Inspect the eye disk r ≤ 65 at each axial station. A solid boundary is evaluated using the fluid-side limit; coincident zero-thickness mathematical faces are not counted twice.

| Upper station (lower is mirror image) | Actual obstruction union in eye disk | Open area |
|---|---|---:|
| Z > +16; aperture at +16 through +14 | Shaft only; shroud is outside r = 65 | 11,752.698 |
| +12 < Z < +14 | Shaft only | 11,752.698 |
| +8 < Z < +12 | Shaft and hub jointly equal one Ø70 solid disk | 9,424.778 |
| 0 ≤ Z < +8 | One Ø70 disk plus six non-overlapping blade strips outside the hub | **8,884.689** |
| −8 < Z ≤ 0 | Mirrored lower eye/web region | **8,884.689** |
| −12 < Z < −8 | Hub/shaft union Ø70 | 9,424.778 |
| −16 through −14; below −16 | Shaft only in aperture | 11,752.698 |

The hub begins at Z = ±12, inside the eye, and therefore changes the real entry area. The inner blade webs begin at Z = ±8. The shroud does not intrude into r < 65; there is no hypothetical full disk blocking entry. The taller outer paddle lies outside the eye disk.

For exact strip area, define:

F(R,t) = t sqrt(R²−t²/4) + 2R² asin[t/(2R)].

F is the intersection area of a circle of radius R with the complete strip |v| ≤ t/2, including both positive and negative u. Each actual radial blade occupies one half, so:

Ablade,eye = (6/2) [F(65,3) − F(35,3)] = **540.089**.

Aeye-disk,turning-min = π(65²−35²) − Ablade,eye = **8,884.689**.

There is no extra shaft subtraction after subtracting the Ø70 hub disk; the shaft is already contained in that disk. Similarly, only the blade strip outside the hub is subtracted. Blade roots do not overlap one another: 3 mm is far smaller than the 35 mm chord between adjacent blade centre lines at the hub radius.

Therefore:

**Actual upper and lower effective eye-face area = 11,752.698 each**, at Z = +16 and −16 respectively (and throughout each shroud aperture).

The downstream hub-cap cuts at Z = +12− and −12+ have **9,424.778** geometric open area each. They are actual internal approach/turning sections, not proven full-branch throats: the eye is not a closed axial duct and flow may already leave the eye cylinder radially above these cuts.

The conservative **minimum eye-disk geometric diagnostic = 8,884.689 each**, in the web/turning region |Z| < 8. It is explicitly **not** reported as a certified controlling entry throat. The minimum pre-turn, whole-branch streamtube section and corresponding hydraulic effective area are **UNRESOLVED**. Only a defined streamtube/control-volume analysis or resolved flow field can establish which internal cut intercepts all of each entry branch before it turns.

Important interpretation: these are minimum *geometric axial cross-sections of the entry/turning region*. The flow turns radially along that region, so the sections must not be modelled as an unbranched constant-throughput axial nozzle train. The station schedule identifies the actual solid obstruction, not a proven controlling hydraulic restriction or discharge coefficient. A single true flow-controlling throat cannot be certified without a flow solution/test. Equality of upper/lower geometric areas does not prove equal entry flow rates.

### 3.3 Separate radial discharge check

At r = 99, clear discharge height is 28. Subtract the six blade arc widths, not their projected eye areas:

Aradial,out = [2π×99 − 6×2×99 asin(3/198)]×28 = **16,912.970**.

At the eye outer edge r = 65+, where full-height outer paddles begin, the separate cylindrical turn-passage area is:

Aradial,turn = [2π×65 − 6×2×65 asin(3/130)]×28 = **10,931.353**.

This is the combined radial passage area over the full 28-mm height, not an axial eye area or a separate full-height area available to each side. A symmetric half-height partition would give half this number per side as a bookkeeping convention, but the two entry streams are not separated by a solid disc. A geometric area smaller than other sections is a warning for flow review, not proof of the controlling streamtube.

The outer cylindrical discharge area is smaller than twice the per-side minimum eye-disk diagnostic (17,769.378), and the turn area at r = 65 is smaller still. These different orientations, branching and flow turning prevent a simple smallest-area argument from certifying the actual hydraulic restriction. No pumping number, throughput equality, circulation multiplier or capacity guarantee is implied.

## 4. Centre opening after eye selection

The adopted construction requirement is DSO < DTI < DR. The candidate adds a transparent, **unapproved and arbitrary comparative geometric screen**: the shaft-corrected stator centre area should be at most 95% of the smaller turning-region minimum eye-disk diagnostic. This is not a solved hydraulic design condition: that diagnostic is not a certified entry throat. The 5% allowance is a proposed comparison margin, not a hydraulic correlation, fabrication tolerance or proof of capture.

DSO,max = sqrt[ds² + 4×0.95×Aeye-disk,turning-min/π]
= **112.617585**.

For a simple preliminary centre-opening callout, round downward to an even millimetre:

**DSO = 112; CE = (130−112)/2 = 9.**

This rule is explicitly additional engineering judgment, not a claim that the documents or literature require a 0.95 factor. It is not a universal DSO/DTI ratio. Engineering review may reject it; its sensitivity is visible.

* ASO,gross = π×112²/4 = **9,852.035**.
* ASO,shaft-corrected = π(112²−44²)/4 = **8,331.504**.
* ASO,shaft-corrected / Aeye-disk,turning-min = **0.937737**.
* Actual comparative area allowance = **6.2263%** after rounding.
* Shaft-to-centre-opening radial clearance = (112−44)/2 = **34**.

The centre opening lies inside the eye's gross envelope in axial projection, but it is not a duct or sealed coupling. The stator and turbine are separated axially. A positive CE does not establish streamtube capture or control which perforation flows reach the turbine.

## 5. Gross free area, blockage diagnostics and perforations

AC = π×600²/4 = **282,743.339**.

Inherited phi = 0.40 is mapped under the stated physical gross convention:

Atarget = phi AC = **113,097.336**.

Required hole area after the eye and centre selection:

Aholes = Atarget − ASO,gross = **103,245.301**.

### 5.1 A new independent symmetric pattern

Use four rings with counts 12, 18, 24 and 30, totalling 84 holes. Each ring count is a multiple of six. The rings and their phase shifts reserve six continuous radial no-hole lanes. The choices are explicitly proposed layout decisions, not a reused 54×Ø40 or two-quarter-point pattern.

Proposed preliminary layout goals: hole-to-hole ligament at least 12; centre edge ligament at least 20; shell edge ligament at least 15; six 8-wide no-hole radial lanes with at least 2 separation to the nearest hole. These are geometric screening goals only, not allowable structural values. Selected centres r = 100,155,210,265 give uniform 55 radial pitch and pass these goals.

With N = 84:

d_h = sqrt[(0.40×600² −112²)/84] = **39.5594790278**.

The nonstandard diameter is a profile-cut CAD diameter, not an assertion that a standard drill exists. A released drawing needs fabrication method, tolerances, deburring and an acceptance rule for gross-area deviation. Ø39.56 is a display rounding only; use the unrounded calculation for exact nominal closure. If a standard drill diameter is mandated, this candidate must be rebalanced and re-reviewed.

| Row | PCD | Count | First hole angle | Increment | Chord pitch | Arc pitch | Circumferential ligament |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 200 | 12 | 15° | 30° | 51.763809 | 52.359878 | 12.204330 |
| 2 | 310 | 18 | 10° | 20° | 53.830935 | 54.105207 | 14.271456 |
| 3 | 420 | 24 | 7.5° | 15° | 54.821001 | 54.977871 | 15.261522 |
| 4 | 530 | 30 | 6° | 12° | 55.400086 | 55.501470 | 15.840607 |

For row i, hole j = 0…Ni−1:

theta_ij = (j+0.5)360°/Ni;
X_ij = (PCDi/2) cos(theta_ij);
Y_ij = (PCDi/2) sin(theta_ij).

This is the full pattern definition, not a representative subset. All 84 centres are provided in geometry-proposal.json. Row staggering is the explicit first-angle schedule above, not an undocumented common angle.

### 5.2 Exact closure and separate blockage

DSO² + N d_h² = 112² + 84×39.5594790278² = **144,000**.

* Physical gross free area = **113,097.336**.
* Physical gross fraction = **0.400000**.
* Shaft-only adjusted stator free area = **111,576.805**.
* Shaft-only adjusted fraction = **0.3946222222**.

This candidate places no separate support bar across the centre opening or a hole at the stator plane. The six radial lanes are retained solid plate, already outside the counted openings; subtracting them again would double-count blockage. Wall attachment and final support details are unresolved. Any later support masking a hole or centre opening must have its *intersection with the already-open area* deducted as an additional diagnostic and be checked at its actual Z station. Separate shaft-support planes must not be subtracted from the stator plane as though they were coincident.

The old Ø379.473 central opening is not used. The new centre opening supplies only part of the target; holes supply the remainder. No shaft-adjusted value is returned to Stage 3.

## 6. Geometry and ligament validation

The accompanying standalone calculation enumerates all 3,486 hole pairs, not just pairs in the same row. It calculates centre distances and subtracts the common hole diameter. Each row is also checked against the centre boundary, shell and six radial lane boundaries.

| Check | Result | Status / limitation |
|---|---:|---|
| DSO < DTI < DR | 112 < 130 < 198 | Geometric pass |
| Positive capture allowance CE | 9 | Geometric pass; not hydraulic capture proof |
| Hub-eye radial interval | 30 | Positive entry annulus |
| Rotor-wall radial clearance | 201 | Geometric pass |
| Stator planes relative to rotor | ±90 | From hc/2 |
| Stator inner faces | ±88 | With proposed 4 plate |
| Rotor extremes | ±16 | With proposed 32 HR |
| Rotor-to-stator axial clearance, each side | **72** | Geometric pass |
| Web top to shroud inner-face plane | 6 | Step space; radial positions differ at the boundary |
| Hub cap to shroud inner-face plane | 2 | Axial plane offset only; not a collision clearance between overlapping radial solids |
| Minimum same-row and global hole-pair ligament | **12.204330** | Row 1 adjacent holes |
| Minimum cross-row centre distance | **55.345639** | Between rows 3 and 4 |
| Minimum cross-row ligament | **15.786160** | All cross-row pairs checked |
| Centre-opening to nearest hole ligament | **24.220260** | r1 − d_h/2 − DSO/2 |
| Outer hole to shell ligament | **15.220260** | 300 − r4 − d_h/2 |
| Six reserved radial lane widths | **8** | Solid geometric lanes, not structurally qualified spokes |
| Minimum hole edge to lane boundary | **2.102165** | Row 1; exact r sin(π/N) − d_h/2 − 4 |
| Sixfold plate rotational symmetry | exact | Counts and phases repeat at 60° |
| Total gross area closure | 0.400000 | Nominal arithmetic pass |
| Rotor swept diameter | 198 exact | Cylindrical clipping includes finite blade thickness |
| Upper/lower eye obstruction topology | mirrored | Equal geometry, not demonstrated equal flux |

The 72-mm axial gap uses stator **centre-plane** pitch, consistent with the existing R1 stack definitions inspected read-only in shared/ecr-stage5-r1.ts: stators z0+i hc, rotor centres z0+(i+0.5)hc (manifest lines 18–21 and compartment mapping lines 211–212). This is a verified existing geometry convention, not a new inference from the database.

No-hole lanes are strips about radial axes at 0°,60°,…300°, from the centre-opening edge to the outer plate. Because every ring has an even number of holes per 120° and half-step phase, the nearest hole on each side of a lane has distance r sin(π/N) to the lane axis; the table verifies actual lane clearance. These are not additional pieces intruding into the opening.

## 7. Assembly counts and inherited-support limitation

The confirmed Stage-4 count is **39 compartments**, installed active height 7020 = 39×180. If the existing one-turbine-per-compartment and **N+1 shared stator boundaries including two terminal stators** convention is retained, the proposed complete active stack contains:

| Component | Conditional stack quantity | Basis |
|---|---:|---|
| Turbine assemblies / hubs | 39 / 39 | One per inherited compartment |
| Upper shrouds / lower shrouds | 39 / 39 | Two per turbine, 78 total |
| Individual radial blades | 234 | 39×6 |
| Stator plates | 40 | N+1 retained terminal-boundary convention |
| Stator perforations | 3360 | 40×84; centre openings excluded |
| Continuous main shaft | 1 | Existing common-shaft architecture; length/support verification separate |

The N+1 count is a retained existing R1 engineering convention, not a universal published Kühni count. Terminal stators may require separate treatment; approval of the repeating pattern does not automatically approve terminal support/flow conditions.

If the existing R1 z0 = 1.25D = 750 stack datum is retained, proposed rotor centres are z_i = 750+(i+0.5)180, i=0…38, i.e. 840 through 7680; stator centres are z_j=750+j180, j=0…39, i.e. 750 through 7770. These formulas give all component elevations without reselecting counts or active height.

No saved Stage-5 snapshot/support geometry was supplied in the audit evidence available for this appendix. Therefore **complete-assembly collision approval is not claimed**. The read-only current R1 source has end-zone support centres at 0.75D and z1+D/2, with axial half-depth 0.02D. Conditionally retaining that source convention gives centres 450 and 8070, axial envelopes [438,462] and [8058,8082]. With proposed 4-mm terminal stators, their nearest faces are 748 and 7772, leaving 286 axial separation to the respective supports; first/last rotor envelopes also remain separated. This is a source-convention compatibility calculation, **not verification against an actual immutable Stage-5 snapshot**. Final saved support housings, arms, nozzles, attachments and interface coordinates must be compared with the successor solids before a complete assembly can be approved. Do not subtract these separate end-zone support projections from active-stator plane areas.

## 8. Required proposed drawing content

1. **Turbine plan/section:** Ø198 swept envelope; Ø130 eye; Ø70×24 hub; Ø44 shaft; upper/lower Ø198/Ø130×2 shrouds; six stepped blades; 16 inner-web/28 outer-paddle/32 overall heights; exact radial trim rule; assembly interfaces. Show upper downward and lower upward entry arrows turning to radial discharge. Do not draw axial arrows through the solid hub.
2. **Stator plan/section:** Ø600 plate envelope; Ø112 centre; 84×Ø39.5594790278 nominal profile holes; complete row schedule; six 8-mm no-hole lanes; 4-mm plate envelope; minimum ligaments; gross and shaft-only fractions distinctly labelled.
3. **Typical compartment section:** stators centred at ±90, rotor centred at 0, stator inner faces ±88, rotor outer shroud faces ±16, 72 clearances, CE marked as an axial-projection overlap rather than a sealed passage. Flow arrows must distinguish local circulation from inter-compartment flow.

These instructions and coordinates define proposed review sketches only. They must not overwrite saved R1 drawings.

## 9. Open engineering decisions and stop gate

* Acceptance of the specific 34-mm shroud width / Ø130 eye remains **UNRESOLVED**: the numerical candidate is a deliberately exposed engineering choice, not a sourced unique solution.
* Hub dimensions, blade plate gauge and stepped heights, shroud gauge, 5% comparative entry-area allowance, even-mm centre rounding, stator thickness, ring placement, lane/ligament screening criteria and fabrication method all require approval.
* The shape and dimensions are geometrically connected and collision-free for the stated ideal solids. They are not qualified for rotational strength, weld fatigue, balance, critical speed, erosion/corrosion, thermal expansion, deflection, pressure loading or shaft attachment.
* Weld beads, fillets, hub fasteners, surface finish, runout, tolerances and real shroud transitions are absent. Their real intersections may reduce effective areas; recalculate after they are defined.
* Station-area arithmetic is not a hydraulic performance validation. Local loss coefficients, nonuniform inflow, radial passage pressure gradients, operating power/pumping characteristics, phase holdup and backmixing remain unvalidated.
* A separate radial discharge area does not by itself identify the actual hydraulic minimum passage. Do not impose Q_turbine = process throughput or infer pumping capacity from any of these area values.
* Equal gross phi does not demonstrate hydraulic equivalence between the old annular stator and this perforated design. The empirical Stage-3 model is unchanged, but the successor physical mapping needs independent qualification.
* All assembly supports, end-compartment differences and any inherited shaft-support elevations must be reconciled by the full report before a new complete rule set can be issued.
* The companion audit confirms the inherited dimensional tuple, 45 RPM and NMP-continuous/RRBO-dispersed configuration. That software audit does not approve these new engineering choices or qualify the successor hydrodynamics.

**Stop after engineering review. No production calculations, persisted records, R1 datasets or drawings have been changed by this standalone calculation.**

Reproduction: `node deliverables/kuhni-successor-review/geometry-proposal.mjs`. The script imports only Node filesystem, writes its own report JSON, asserts area closure and positive clearances, and does not invoke application modules, databases or optimizer services.