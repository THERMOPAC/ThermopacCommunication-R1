# Independent top-disengager spatial review

**Recommendation: develop Alternative A, Ø700 mm ID × 1600 mm straight with a separately qualified coalescer/guard-separation system, replacing the proposed 1200 mm straight. TOP CAPTURE, HYDRAULIC AND FABRICATION RELEASE: HOLD.** No bare Ø700 gravity-only top is approved. The 1600 mm is an explicitly engineer-selected spatial stack, not a uniquely calculated hydraulic minimum. Alternative B, Ø3000 ×1600 plus transition and protected NMP return, is an illustrative assigned-500-µm-duty option, not a recommended giant vessel based on an unmeasured drop distribution. See the controlling integration annex in §8. If 1200 mm is an immutable envelope, use the compact alternative below only as a HOLD layout; do not quietly delete outlet submergence or count vapor space as settling height.

## 1. Scope and frozen boundaries

Reviewed `disengager-preliminary-proposal.html`, its `.results.json`, and `kuhni-end-section-preliminary-calculation.md`. Source flow/property calculations remain screening proxies with unbound N4/N7 outlet scenarios. No application, database, source report or approved geometry is modified by this review.

Preserve active Ø700 × 4200 mm, 20 × 210 mm compartments, Ø231 mm rotor, 30 rpm, adopted Np = 1.2 and existing terminal internals. Preserve bottom **Ø700 neck × 300 + cone 173.205 + Ø900 straight × 1200 mm**, including its currently selected arrangement; this review does not requalify its performance.

Use top-local elevation **z = 0 at the active top boundary**; global elevation Z = 4200 + z relative to active bottom. Reserve clearance above the uppermost terminal-stator obstruction. The table assumes that obstruction is at or below z = 0. Confirm the actual terminal-stator upper face, shaft features and supports in the mechanical drawing. Any projection above zero consumes the allocated clearance; move the end-section stack upward or increase its length, not the active pitch or rotor location.

The original top has feed CL z = 150, outlet CL z = 900, low/normal/high free-surface levels z = 1000/1050/1100, tangent z = 1200. Consequently its quoted 100 mm minimum submergence is measured to the outlet **center**, only **65 mm over the crown** of a 70 mm clear-bore opening. Its 1200 mm gross straight is not 1200 mm available liquid height.

## 2. Selected preliminary stack

All dimensions are mm. The quiet-path boundary uses the **lowest edge of the outlet opening**, not its center, to avoid crediting the nozzle opening itself as quiet height.

| Region / feature | Local elevation z | Axial allowance | Status and purpose |
|---|---:|---:|---|
| Terminal-stator calming / return clearance | 0–200 | 200 | SELECTED; no demonstrated momentum-decay length |
| NMP distributor and supports envelope | 200–300 | 100 | SELECTED; feed CL 250, downward-directed discharge |
| Clear quiet settling / return path | 300–900 | 600 | SELECTED; excludes distributor envelope and outlet opening |
| Raffinate outlet clear opening | 900–970 | 70 | ASSUMED 70 mm actual bore; CL 935 |
| Liquid cover above outlet crown at low operating level | 970–1270 | **300** | SELECTED minimum layout cover; CL submergence **335** |
| Free-surface operating/control band | 1270–1420 | 150 | SELECTED; normal 1345, ±75 |
| Dry allowance from high operating level to top tangent | 1420–1600 | 180 | SELECTED freeboard; no head volume credited |
| **Top straight total** | **0–1600** | **1600** | **200 + 100 + 600 + 70 + 300 + 150 + 180** |

Global elevations: feed CL **4450**, raffinate outlet CL **5135**, low/normal/high liquid levels **5470/5545/5620**, top tangent **5800**. These supersede top-only preliminary elevations for this proposed option, not the source files.

The top shell is predominantly RRBO-rich continuous liquid, with NMP drops descending toward the active section. The 1270–1420 band is a **liquid–gas free-surface** band, not an invented upper NMP/RRBO interface. Fresh NMP remains at the top of the active section, below the quiet region, and is discharged downward through a distributed arrangement with open return paths. Do not specify an upper heavy-liquid pool, overflow weir or interface controller without an actual accumulation mechanism and corresponding design.

Keep feed jets away from the outlet and liquid surface. A ring or equivalent distributor is a concept, not a selected orifice pattern. The 100 mm envelope must accommodate its true outside dimensions and supports. A 70 mm feed bore passing the bulk-velocity screen does not determine hole size, number, jet velocity, breakup, pressure drop or distribution quality. Avoid a solid calming plate that blocks falling NMP; any additional perforated device requires pressure-drop, open-area and two-phase return checks. Do not silently modify the existing terminal stator.

## 3. Outlet cover: verified physics, appropriately limited use

At worst top flow Q = **3.821794230 m³/h = 0.001061609508 m³/s**, actual bore d = 0.070 m:

- V = 4Q/(πd²) = **0.275854 m/s**.
- Fr = V/√(gd) = **0.332943**, g = 9.80665 m/s².
- Hydraulic Institute's published intake relation S = d(1 + 2.3 Fr) gives **S = 123.604 mm**.

The Hydraulic Institute public explanation [1] defines S from free surface to the entry center and identifies pipe-inlet inside diameter (or bell outside diameter) as the characteristic dimension. It concerns liquid withdrawal and avoidance of gas-core vortices, **not** liquid–liquid separation. The NRC-hosted Alden tank-outlet study [2] explicitly uses centerline submergence for horizontal nozzles and discusses return-flow effects. Thus this is a relevant **analog screening calculation for a submerged liquid outlet beneath a free surface**, not a gas-outlet correlation. It must not be applied to a liquid–liquid interface or advertised as verified ANSI/HI compliance for this vessel.

The original 100 mm centerline cover is below even the 123.6 mm analog value. The proposed **335 mm centerline / 300 mm crown cover** removes that shallow geometry and is about 2.71 times the analog value. **The extra margin is an engineering selection, not a literature-prescribed safety factor.** Unknown residual swirl, local withdrawal geometry, upstream agitation and feed-return momentum prevent certification of vortex-free performance. The liquid has nozzle Re ≈ **281** using ρ = 869 kg/m³, μ = 0.0598 Pa·s, unlike many water intake experiments; neither viscous scale effects nor actual inlet geometry have been validated.

Fit a suitably engineered vortex suppressor if required, without crediting it to reduce cover before validation. Its projection, accessible maintenance envelope and any additional intake bell require rechecking the stack and effective entrance diameter. NPSH, if a pump withdraws the raffinate, remains a separate system calculation with pressure, vapor pressure, friction and pump data; cover alone is not NPSH approval.

**Bore is not DN.** A selected 70 mm calculation bore is not “DN70,” and a nominal DN80 connection is not an 80 mm bore. The pipe schedule, lining, nozzle entry and internal takeoff define actual hydraulic diameter and vertical opening. For example an explicitly hypothetical 77.9 mm bore gives V = 0.22274 m/s and S = 123.56 mm; a 52 mm bore gives V = 0.49988 m/s and S = 135.72 mm. Recalculate rather than assuming larger bore monotonically reduces the submergence requirement. The original 0.5 m/s velocity limit is itself a selected screening criterion, not a verified nozzle standard.

## 4. Liquid height, settling and inventory

At Ø700, A = **0.3848451 m²**, top superficial upward velocity U = **2.758537 mm/s** for N4; N7 is slightly lower. The new liquid heights above active top are **1270/1345/1420 mm**, not 1600 mm. The explicitly unobstructed quiet allowance is only **600 mm**. The liquid cover above the outlet is required withdrawal inventory, not automatically an additional upstream separation path: actual streamlines can turn directly into the side outlet.

For an isolated drop in ideal uniform counterflow, downward net speed is vt − U and return time is L/(vt − U), provided vt > U. The prior proposal's Ø700 N4 conditional 50%-velocity cutoff, d = **2.080748 mm**, has vt = **5.517074 mm/s**. Across the assigned 600 mm path:

- Ideal drop return time = **217.51 s**.
- Bulk axial passage time L/U = **217.51 s**.

Their equality is a consequence of the **assumed vt = 2U screen**, not independent proof of capture or adequate residence time. If vt ≤ U, increasing height does not reverse the trajectory. Increasing height also does not cure a failed 50%-velocity criterion. The active d32 ≈ 6.068 mm is not an established exit lower-tail capture diameter; do not use it to guarantee carryover removal.

Gross cylindrical liquid volumes at low/normal/high level are **0.488753 / 0.517617 / 0.546480 m³**, before subtracting shaft, distributor and internals. The 150 mm full control band holds **0.057727 m³**. At a full-outlet-rate net imbalance this corresponds to only **54.38 s across the entire band**, or **27.19 s from normal to either boundary**. This is a scale illustration, not an accepted upset duty. Required band follows ΔV = ∫(Qin − Qout)dt with an agreed detection/action time, uncertainty, instrument deadband and trips. Flow imbalance is the net liquid inventory change, not automatically the raffinate rate.

Low/high values are preliminary operating boundaries, not approved alarm/trip setpoints. Provide control and shutdown margins such that credible undershoot does not breach the selected minimum cover. If those margins require extra liquid depth, increase the stack; the 180 mm dry space is not usable liquid surge without revisiting high-level clearance.

**Calming qualification remains HOLD.** Rotor speed, Np and terminal-stator free area do not alone specify outgoing turbulent velocity, swirl or feed-jet momentum. The 200 mm calming reservation is not calculated from an unsupported universal decay rule. Obtain distributor discharge conditions, stator-exit momentum/velocity distribution and return-flow loading; qualify by vendor design, suitable hydraulic modeling or pilot observation.

## 5. Fixed-envelope and enlarged-diameter alternatives

**If Ø700 × 1200 must be retained:** keep calming 200, distributor 100, opening 70, crown cover 300, control band 150 and freeboard 180; only **200 mm** remains as quiet allowance. Outlet lower edge/CL/crown become **500/535/570**; low/normal/high levels **870/945/1020**. This is geometrically consistent and eliminates 100 mm centerline cover, but sacrifices two-thirds of the previously assigned quiet path and moves withdrawal much closer to the distributor. **HOLD / not preferred** until local short-circuiting and carryover are demonstrated acceptable. It is not honest to claim the original 600 mm quiet allowance still fits.

**If independent capture analysis requires a larger top diameter D:** retain the 1600 mm straight spatial reservation initially; enlargement addresses area, not the unknown control, jet-decay or coalescence duties. Add a separate 700-to-D transition above the unchanged active top. For an explicitly selected 30° half-angle to axis, Hcone = (D − 700)/(2 tan30°). At **D = 900 mm**, Hcone = **173.205 mm**, area = **0.636173 m²**, U_N4 ≈ **1.668745 mm/s**. Start the same 1600 mm stack at the upper cone tangent, credit **none of the cone as quiet height**, and shift all its local elevations upward by 173.205 mm. Top tangent is then Z = **5973.205 mm**.

The source screen gives Ø900 N4 cutoff ≈ **1.604444 mm**, versus Ø700 ≈ 2.080748 mm. This is a conditional size screen, not a recommendation to select Ø900 before the independent drag/capture duty is accepted. Recheck expansion recirculation, distributor span/supports, shaft layout and settling paths. A larger area increases inventory for the same level band but does not make the band dynamically adequate by itself.

## 6. Head boundaries and release matrix

The 1600 mm dimension is **straight shell from the active-top boundary to top tangent**, not head-to-head, pole-to-pole or equipment overall height. The top head, head knuckle intrusion, shaft seal, bearings, vent/relief hardware and maintenance envelope are additional mechanical items. Do not count unspecified head volume as settling or minimum freeboard. Freeboard terminates at the tangent for this calculation; actual internal obstructions below it reduce the clear space. Establish whether the operating system genuinely has a controlled gas space; a fully flooded arrangement requires a different pressure/inventory/outlet review.

For the recommended Ø700 option the bottom tangent remains Z = −1673.205 mm, so straight/transition tangent separation is **7473.205 mm**, excluding both heads. The Ø900 top alternative increases it to **7646.410 mm**. Neither is a certified overall vessel envelope.

| Decision | Classification |
|---|---|
| Frozen active and bottom dimensions retained | **PASS — scope/dimension integrity only** |
| 1600 mm height arithmetic, outlet opening and cover defined | **PASS — preliminary spatial consistency** |
| Ø700 × 1200 with original 600 mm quiet path plus new selected allowances | **DOES NOT FIT — short by 400 mm** |
| 335 mm centerline cover exceeds verified 123.6 mm intake analog | **PASS — numerical analog comparison only** |
| Vortex suppression, pump suction and allowable low-level excursion | **HOLD — geometry/system-specific evidence** |
| 600 mm quiet path, 200 mm calming, distributor envelope | **HOLD — selected, not hydraulically qualified** |
| Diameter/capture duty and actual entrainment removal | **HOLD — independent physics review, exit PSD/loading and carryover specification** |
| Control band, dry clearance, instrument setpoints | **HOLD — upset inventory, response and mechanical design** |
| Final head/nozzle/shaft/support pressure and fabrication design | **HOLD — no fabrication release** |

## 7. Verified external evidence

1. **Hydraulic Institute, “Submergence,” HI Data Tool**, page last updated July 19, 2024. Fetched and read in this review: https://datatool.pumps.org/pump-fundamentals/submergence . Defines S and Fr and publishes S = D(1 + 2.3 Fr), attributed there to Hecker (1987). This public explanatory page was verified; the complete ANSI/HI standard was not independently reviewed. Its product hyperlinks appear inconsistently labeled, so the public equations and definitions—not linked product metadata—are the evidence used.
2. **Andy Johansson, Alden, “Vortexing and Air Withdrawal Evaluations for Storage Tanks Using Physical Hydraulic Model Studies,” NRC-hosted technical-exchange presentation.** Fetched and read: https://www.nrc.gov/docs/ml1315/ML13150A180.pdf . Identifies centerline versus suction-plane submergence conventions, reports tank model results and warns that overhead/submerged return flows affect submergence. Supports relevance and limitations of tank-liquid-outlet screening, not transfer of a validated criterion to this agitated viscous extraction system.

No retrieved source establishes 200/100/600/300/150/180 mm as universal minimum allowances. Their purpose is to make a reviewable preliminary arrangement instead of disguising a proportional or residence-time guess as hydraulic finalization.

## 8. Integrated alternatives after independent submillimetric-duty review

**This annex controls alternative selection where it qualifies the earlier diameter illustrations. Neither alternative finalizes top separation performance.** The independent physics review relayed an assigned 500 µm NMP-drop duty requiring approximately **2854.6 mm ID** under the same nominal-property, f = 0.50 screen. The actual exit distribution and allowable entrainment remain unknown. The 500 µm choice is a disclosed trial duty, not a measured requirement, conservative lower bound or evidence that a 3 m vessel is economically or technically necessary.

### A — compact shell plus qualified separation equipment

Retain the §2 **Ø700 ×1600 straight** chain and elevations. Require a **qualified coalescer and/or guard separator** for the eventual specified entrainment duty; the existing isolated-drop cutoff near 2.08 mm cannot establish removal of a consequential submillimetric tail.

For dimension integrity, the present arrangement assumes an **external guard-separation package on the raffinate withdrawal**, with a separately designed NMP collection and return route. Package footprint, elevations, pressure drop, operating inventory and piping envelope are **TBD/HOLD**, not included in the 7473.205 mm vessel tangent separation. An internal coalescer is an alternative only after its thickness, supports, drainage and service envelope are known: it cannot occupy the credited 600 mm quiet region while that region is still called clear. Rebuild the height chain if internals require space; no fabricated package dimensions or guaranteed efficiency are assigned.

Qualification must cover actual RRBO/NMP properties, dispersed load and drop distribution, target residual entrainment, wettability, fouling, available pressure, liquid drainage/return and maintenance. Dissolved NMP is outside the gravity/coalescer-removal claim. This is the preferred **development route**, not a conclusion that a compact coalescer is already feasible or sized.

### B — assigned-500-µm enlarged shell with protected return

Reserve **Ø3000 ×1600 mm straight** above a **700→3000 cone of 1991.858 mm rise**, using an engineer-selected 30° half-angle to axis:

Hcone = (3000 − 700)/(2 tan30°) = 1991.858 mm.

Keep the full upper straight spatial stack **200 + 100 + 600 + 70 + 300 + 150 + 180 = 1600 mm**. Here its lower 200 mm is an expansion-exit calming reserve and the next 100 mm is a provisional collection/redistribution envelope, **not evidence that a protected collector can fit**. Keep fresh NMP feeding near the active top rather than automatically moving it approximately 2 m up: provisionally retain fresh-feed CL at **Z = 4450 mm**, in the lower cone, directed down toward the active section. This different cone-mounted distributor requires its own structural, jet and clearance verification. The terminal-stator 200 mm clearance remains measured upward from active top in the lower cone; it is separate from the upper-straight expansion-calming reserve. Neither portion of cone is credited as quiet settling height.

| Feature | A: Ø700 top, Z mm | B: Ø3000 top, Z mm |
|---|---:|---:|
| Fixed bottom tangent | −1673.205 | −1673.205 |
| Active bottom / top | 0 / 4200 | 0 / 4200 |
| Fresh NMP feed CL, preliminary | 4450 | 4450, lower-cone distributor |
| Upper straight start | 4200 | 6191.858 |
| Upper straight quiet region | 4500–5100 | 6491.858–7091.858 |
| Raffinate outlet lower edge / CL / crown | 5100 / 5135 / 5170 | 7091.858 / 7126.858 / 7161.858 |
| Low / normal / high free surface | 5470 / 5545 / 5620 | 7461.858 / 7536.858 / 7611.858 |
| Top tangent | 5800 | 7791.858 |
| Bottom-to-top tangent separation | **7473.205** | **9465.064** |

Both options retain **300 mm crown cover**, **335 mm centerline cover**, **150 mm full control band** and **180 mm high-level-to-tangent dry allowance**. They exclude heads, shaft/bearing supports and external separation/return equipment. B's 3 m distributor/collector supports and outlet-flow uniformity are not represented by the 70 mm nozzle calculation; the same outlet flow and bore give the same intake analog, but very different local approach flow.

**Why area PASS is not return PASS:** Inverting the relayed nominal 2854.6 mm area requirement gives vt ≈ **0.33175 mm/s** at 500 µm. At Ø3000, U ≈ **0.15019 mm/s** and 0.50vt/U ≈ **1.1045**: the assigned area screen passes. But in the contracting downward path,

U(D) = 4Q/(πD²); Dstall = √[4Q/(πvt)] = Drequired/√2 ≈ **2018.5 mm**.

A freely settling 500 µm drop meets zero ideal net downward velocity near that diameter and upward net transport below it. Ø700 U ≈ **2.75854 mm/s**, far greater than this vt. The stall section is approximately **1141.9 mm above the cone lower end** (Z ≈ **5341.9 mm**). Nonuniform cone flow can further invalidate the ideal path. Accumulation/coalescence there might occur, but it is not a demonstrated return mechanism or an authorized interface location. **Do not label bare-cone gravity return PASS.**

B therefore requires a **protected collected-NMP return system**: a qualified collector above the obstructed-return region and a segregated, liquid-sealed downcomer or controlled pumped return to an approved process location. Return must not encounter the full opposing bulk raffinate velocity. Collection effectiveness, continuous-phase bypass, pressure balance, gas sealing, capacity for actual entrained load, plugging, drainability and discharge interaction with the active section all remain HOLD. Do not assign the fresh-solvent rate as the entrained return load. A collector can introduce a local NMP inventory; its interface and control design must be explicitly developed rather than assuming an existing stable top interface.

The provisional 100 mm collection envelope is **not** a validated fit for that system; B's 1600 mm straight may increase after collector/drain and supports are designed. At Ø3000 the selected 150 mm level band represents **1.06029 m³ gross**, but this large inventory does not independently validate upset capacity or justify enlargement.

### Integrated decision

- **A: preliminary vessel dimensions PASS; submillimetric capture and package/return design HOLD.** Develop against an explicit carryover specification and actual or authorized bounded drop distribution.
- **B: assigned nominal 500 µm area screen PASS; bare gravity return NOT PASS; protected collection/return and all final hydraulic performance HOLD.** Treat as a dimensional comparison pending actual duty, not a justified purchase or fabrication recommendation.
- **Top finalization remains HOLD for both.** The honest deliverable is a complete provisional vessel dimension chain plus explicit unsized separation/return equipment, not a claim that all equipment is already dimensioned. Neither alternative changes the frozen active section or bottom assembly.