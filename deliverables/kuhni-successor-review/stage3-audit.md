# Stage-3 saved-selection audit — successor geometry engineering review

**Read-only diagnostic. No production calculation, saved revision, drawing, or rule-set change. PRELIMINARY PRE-PILOT GEOMETRY & DRAWINGS — NOT FOR FABRICATION.**

## 1. Verdict and scope

**Software selection/integrity audit: PASS for the actual saved bounded search.** The selected rotor/column ratio 0.33 is supported by the stored trials and exact offline replay; it is not an unevaluated default, first-iteration selection, or tie/weighting accident. This does **not** validate the underlying correlations outside their published ranges, prove a continuous/global optimum, or qualify the proposed shrouded/perforated successor hydraulically.

The evidence is an actual SELECT-only read of the application-connected database, not a UI fixture. Scientific record identity: design **269**, Stage-3 run **64**, Stage-4 calculation **13**. The two records have matching owner and design, without extracting owner PII. Run 64 is the latest Stage-3 run for this design at the time of the read. Run 63 has the same immutable hash; the duplicate is not a differing numerical result. This audit identifies the saved chain; it does not invoke an API that may create a current optimizer.

**Important correction to the supplied working context: the actual saved speed is 45 RPM, not 70 RPM. Its selected feasible operating window is 30–60 RPM, not 60–105 RPM.** Seventy RPM is the upper bound of the configured search grid. Both Stage 3 and the linked Stage 4 agree on 45 RPM. Do not use 70 RPM as the inherited operating point in the engineering report.

## 2. Confirmed saved authority

| Quantity | Actual saved value | Provenance |
|---|---:|---|
| Column ID D | 600 mm | INHERITED, Stage 3 |
| Rotor ratio D_R/D | 0.33 | INHERITED, Stage 3 |
| Overall turbine OD D_R | 198 mm | INHERITED, Stage 3 |
| Compartment pitch h_c | 180 mm | INHERITED, Stage 3 |
| h_c/D | 0.30 | INHERITED, Stage 3 |
| Empirical stator free-area fraction phi_s | 0.40 | INHERITED, Stage 3 |
| Selected speed | **45 RPM** | INHERITED, Stage 3 |
| Selected contiguous feasible grid window | **30–60 RPM**, 5-RPM grid | INHERITED, Stage 3 |
| Phase configuration | NMP continuous / RRBO dispersed | INHERITED, Stage 1/3 |
| RRBO flow | **4000 L/h** (0.0011111111111111111 m³/s) | INHERITED, saved process basis |
| Wet-solvent flow | 0.0005707717569786535 m³/s = 2054.778325 L/h | INHERITED; unit conversion SYSTEM CALCULATED |
| Temperature | 40 °C | INHERITED |
| S/O mass ratio | 0.6 | INHERITED |
| Required / installed active height | 7000 / 7020 mm | INHERITED, Stage 4 |
| Compartment count | 39 | INHERITED, Stage 4 |
| Fixed design N_t / screening HETS | 7 / 1 m per theoretical stage | INHERITED, Stage 4 |

The discussion's 3500 L/h is not the saved RRBO flow; neither flow is a turbine circulation/pumping specification. The preliminary Ø44 shaft follows the existing Stage-5 geometric proportion (10/45) × 198 and is not a Stage-3 shaft-strength selection.

## 3. Complete candidate coverage

Saved engine: **ECR_STAGE3_STAGE4_OPTIMIZER_V1.3.0**.

Configured grids, all present in the stored full result:

- D: 0.2–1.5 m inclusive, 0.1-m steps (14).
- h_c/D: 0.20, 0.25, 0.30 (3).
- D_R/D: **0.33, 0.40, 0.50** (3).
- phi_s: 0.20, 0.30, 0.40 (3).
- RPM: 30–70 inclusive, steps of 5 (9).
- Two orientations, with the actual saved orientation retained as authoritative.

Each orientation has 378 geometry groups and **3402 stored trials**, total **6804**. Cartesian-key tests verified every configured combination exactly once, with no duplicates or missing combinations. Each rotor ratio has 126 groups / 1134 trials per orientation.

| D_R/D | NMP-continuous feasible trials (all D/h_c/phi/RPM) | Reverse-orientation feasible trials |
|---:|---:|---:|
| 0.33 | 596 | 341 |
| 0.40 | 318 | 74 |
| 0.50 | 102 | 0 |

These are actual persisted trial counts, not inferred from array lengths or just the declared candidate grid.

## 4. Why 600 mm and why 0.33

The implemented policy is lexicographic, not a weighted objective:

1. Determine feasible contiguous RPM windows for each geometry.
2. Treat width >=20 RPM as the useful-window **preference**, not an additional hydraulic equation.
3. Choose the **second-smallest distinct accepted adequate diameter**, deliberately one accepted grid diameter above the smallest.
4. At that diameter choose the widest window, followed only if needed by deterministic tie criteria.

The saved accepted adequate diameter set is 0.5, 0.6, …, 1.5 m. Thus 0.5 m is the smallest adequate diameter and **0.6 m is deliberately selected**. This is an explicit pre-pilot margin policy, not an optimized economic diameter.

At D=600 mm in the inherited orientation:

| Ratio | Best h_c/D, phi_s | Best feasible RPM window | Width | Meets 20-RPM preference |
|---:|---|---|---:|---|
| **0.33** | 0.30, 0.40 | **30–60** | **30** | Yes |
| 0.40 | 0.30, 0.40 | 30–40 | 10 | No |
| 0.50 | None feasible across all tested h_c/D and phi_s at D=600 | None | — | No |

At ratio 0.33 and phi_s=0.4, h_c/D=0.20 and 0.25 both produce 25-RPM windows; h_c/D=0.30 produces 30 RPM. Therefore the selected complete geometry is a **strict width winner**, not a tie. The rotor ratio's late ascending tie-break clause is never needed for this winning decision.

The representative selected speed is the feasible trial nearest the **selected window midpoint**, hence (30+60)/2 = **45 RPM**. The geometry-score power tie-break value is evaluated near the overall search midpoint (50 RPM); it is not the power at the selected 45-RPM point. Specifically, those values are 4.2146800763 and 3.0725017756 W/m³ respectively. Mixing the two would misstate the saved operating point.

## 5. Hydraulic admission evidence and underlying cause

At the selected 45 RPM, the stored candidate is FEASIBLE with no rejection reasons:

- Implemented actual loading = **0.47540999374941056**, below the design flood-fraction threshold **0.70**.
- Tip speed = 0.46652650905808435 m/s, below the implemented 4.5-m/s cap.
- d32 = 0.0044853344930663765 m; dispersed holdup = 0.06398240117180216.
- Power density = 3.072501775637703 W/m³; rotor Reynolds number = 21076.3029661.
- Positive geometry, power, d32 and interfacial area; holdup between 0 and 1.

At D=600 mm, h_c/D=0.30, phi_s=0.40, the implemented loading gate explains the relative windows:

| D_R/D | RPM | Actual loading | Result |
|---:|---:|---:|---|
| 0.33 | 60 | 0.6853015800 | Pass |
| 0.33 | 65 | 0.7616968758 | Fail >0.70 |
| 0.40 | 40 | 0.6208041543 | Pass |
| 0.40 | 45 | 0.7233596686 | Fail >0.70 |
| 0.50 | 30 | 0.7015484950 | Fail >0.70 |

This is model behavior, not evidence that smaller turbines universally perform better. The current primitive couples turbine power/droplet size, characteristic/swarm velocities and a maximized flooding-capacity construction. It contains fixed power/turbulence assumptions (N_P=1.2, C=0.42); the audit neither changes nor independently qualifies them for the successor turbine.

## 6. Order, ties, weights, defaults and persistence

- Canonicalization deduplicates/sorts and range-checks the configured ratio grid; stored controls explicitly include all three ratios.
- The source loops exhaust the Cartesian product; no first-feasible early-return bypass exists in this search.
- Reverse group order and 20 cyclic permutations produced the identical selected group in both orientations.
- Ranking uses ordered comparisons, **no weighted sum**. Window width strictly resolves this case before power or ratio tie-breaks.
- The final deterministic tie chain is edge margin (descending), valid trial count (descending), distance to grid-center speed (ascending), power density (ascending), D, h_c/D, D_R/D and phi_s (ascending). This can favor a smaller ratio only in otherwise tied cases; it does not explain the saved winner.
- Actual selected ratio is recomputed from the persisted controls and basis, not a display fallback. Stage-4 stored hydraulics match Stage 3.
- Full offline pure-function replay reproduced the **entire saved result**, including every trial and calculation hash, exactly after canonical key ordering. No API, service writer, optimizer persistence function or scientific code modification was used.

## 7. Integrity and before/after evidence

- Stage-3 immutable hash, independently reconstructed and verified: `e2afc059444f3c22c5d3a64b83ed81b59b5a122bd51ac1c9bc9897337d788249`.
- Stage-3 engine/implementation hash: `faa56fdd99b0904a5e524fb8350859192d94b269331e91bbd34cc5d946ccb550`.
- Stage-3 calculation hash, saved = replay: `f7cacea88792a9b70aecb65e187728c5e4aae1fa038920a450d9e2385bf850ef`.
- Full result canonical SHA-256, saved = replay: `7dc0cc2a2350bb06b4c024ac82bd86a21d7efacb57164094695dd8c4447a9ebf`.
- Stage-1 snapshot hash: `549dffa428356ee5e94d8baff297c114e1f0c6f345b84e121181e7b5f6b5f15b`.
- Stage-4 ID 13 lineage hash: `5a9a6446a4e59faff9d5a86ee02f21afbaf11b1524e02641d5dd449424d380b3`.
- Stage-4's stored Stage-3 immutable hash equals the verified run-64 hash.
- SELECT export file SHA-256 before and after the final offline replay/re-read: `a20f1b5039e3b9f56c99dd8964f126e39c5ee5e9b4ce184910e947785f9e7fc8` both times.

The export includes Stage-3/4 scientific records and comparison IDs, not credentials or owner personal data. Different hashes above represent different envelopes and must not be substituted for one another. Stage-4's `optimizerResultHash` is its projected/compacted representation identity, not the full raw Stage-3 calculation hash.

## 8. Limits and disposition for successor geometry

**Proceed using inherited D_R=198 mm and 45 RPM for engineering development, but keep the hydraulic-qualification caveat explicit.**

The selected trial is expressly `SCALE_UP_EXTRAPOLATION`, not a source-range-qualified design. Persisted diagnostics include:

- KH1995 source ranges exceeded for continuous density 1015 kg/m³, dispersed viscosity 0.0598 Pa·s, D=0.6 m, D_R=0.198 m, h_c=0.18 m, h_c/D=0.30 and D_R/D=0.33.
- In particular, the reported KH1995 D_R/D source range is 0.43–0.69, although the configured engineering search range includes 0.33–0.50.
- Myint terminal Reynolds 374.177, characteristic Reynolds 286.844 and shape Taylor 4.42967 extrapolation flags.
- A retained primitive diagnostic states that no generic Kühni flooding capacity is admitted; the optimizer separately applies its coupled resolver loading gate. This is not a license to present the latter as independently validated plant flooding capacity.

Thus the audit passes **algorithmic correctness against the implemented screening policy**, not universal Kühni performance, source applicability, or applicability of the inherited results to the changed shrouded/perforated geometry. The finite ratio grid cannot establish an interior optimum or justify extrapolating below its lower boundary. No new hydraulic equivalence claim is made.

## 9. Reproducibility and exact code citations

Evidence files in this directory:

- `saved-evidence.json`: actual saved records and owner/design-match booleans.
- `ranking-evidence.json`: exact replay identities, Cartesian completeness, ratio counts, ordering tests and all D=600-mm group summaries.
- `audit-read.ts`: direct database SELECTs inside `BEGIN READ ONLY`, rolled back after reading.
- `audit-replay.ts`: imports only pure scientific functions; no database access or writes except review evidence files.

Source citations:

- `server/ecr-pre-pilot/stage3-stage4-optimizer.ts:76–86`: configured grid and fixed 20-RPM preference.
- Same file `:340–378`, `:381–466`: deterministic canonicalization and bounded grids.
- Same file `:536–596`, `:665–735`: candidate physical checks and hydraulic loading admission.
- Same file `:775–784`, `:870–880`, `:950–977`, `:1043–1085`: tie order, width ranking, second-smallest adequate diameter.
- Same file `:1091–1117`: selected RPM midpoint policy.
- Same file `:1120–1206`: exhaustive loops, contiguous windows and geometry score construction.
- Same file `:1358–1384`: authoritative orientation retained; alternate orientation is comparison, not an automatic phase switch.
- Same file `:1525–1531`, `:1572–1589`: pure optimizer entry and API-only compaction (stored trials retained).
- `server/ecr-pre-pilot/kuhni-geometry-resolver.ts:180–242`: d32, characteristic/swarm velocity and implemented loading construction.
- `server/ecr-pre-pilot-service.ts:491–547`: authority loading, full-result immutable envelope and persisted-result/API-compaction separation.
- `server/ecr-pre-pilot/stage4-pre-pilot-sizing-service.ts:605–658`: current saved record lookup and immutable/calculation integrity checks.

Stop gate: this audit authorizes **no implementation change**. Detailed eye, shroud, hub, stator and perforation dimensions remain the engineering report's next work, with provenance and unresolved items stated explicitly.