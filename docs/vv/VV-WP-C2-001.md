# VV-WP-C2-001 — Evidence Work Package: Stage C2 Process Design Engine

**Engine:** `llx-process-design` v1.0.0 · **Register:** PD-001…PD-008, PD-010 (9 entries; PD-009 retired)
**Worked verification case:** LLX-RND-2026-0001 Rev 0 — frozen accepted run #22 (2026-08-06), identical to regression case `LLX-RND-2026-0001-Rev0-baseline`.
**Status:** DRAFT work package — no evidence pillar is pre-completed. Evidence is recorded as **Draft** and counts toward Verified only after independent approval.
**Governance:** regression reproducibility (Phase A) and engineering verification evidence (this package) are separate evidence types sharing one immutable input basis. Citations follow the 2026-08-06 directive: identities/definitions → controlled Thermopac document + unit verification; governance rules → controlled Thermopac governance document; empirical bands/factors/tolerances → original literature/vendor source or approved Thermopac Engineering Practice Standard (TEPS). The label "screening practice" is not a final verification citation.

---

## 1. Worked-case input basis (frozen run #22 — do NOT re-derive from the UI)

| Input | Value | Source tag |
|---|---|---|
| Operating temperature | 70 °C | — |
| Feed flow | 4 m³/h (volumetric basis) | — |
| Feed (RRBO) density | 870 kg/m³ @ 15 °C ref | Assumed — Thermopac Feed Master default |
| Solvent-to-oil ratio (mass) | 1.7004702194357366 | converted from volume-basis 1.5 using ρ_NMP(70 °C) = 986.3, ρ_RRBO = 870 (stored basis note) |
| maxCirculationFactor | 1.2 | — |
| Phase configuration | nmp_continuous_rrbo_dispersed | engineer input |
| x_F (solute mass fraction in feed) | 0.20 | Assumed — Thermopac Preliminary Screening Default |
| r (solute recovery to extract, normal) | 0.90 | Assumed |
| s_L (solvent carryover to raffinate, normal) | 0.02 | Assumed |
| o_L (oil loss to extract, normal) | 0.01 | Assumed |
| applyNormalSplitsToMaximumCase | true (CASE_SPLIT_ASSUMPTIONS_REUSED expected) | explicit option |
| Theoretical stages / stage efficiency | 6 / 0.60 | — |

Engine output values for comparison are taken from the frozen result snapshot of run #22 only (also stored as the regression expected snapshot) — never from a live re-run.

## 2. Dossier template (one per equation): `VV-HC-C2-{REF}`

Each dossier is a controlled document with:

1. **Header** — equation ref; statement verbatim from the Equation Register; engine version 1.0.0; calculator (name, date); checker (name, date); dossier revision; status Draft/Approved.
2. **Pillar 1 — Independent hand calculation.** Inputs transcribed from §1 (frozen snapshot). Calculation performed without reference to engine source code. Every intermediate value shown with units. Comparison against the frozen engine value using **both tolerances**: absolute |Δ| ≤ A and relative |Δ|/|ref| ≤ R. Proposed defaults for C2 (all closed-form): A = 1×10⁻⁶ in the result's own units, R = 1×10⁻⁶; deviations beyond either ⇒ FAIL and a finding.
3. **Pillar 2 — Unit verification.** Dimensional trace of every term; SI-consistency table; confirmation no unit conversion is hidden in the equation (conversions live in CEL unit-conversion).
4. **Pillar 3 — Boundary-condition verification.** Exercise the register's stated limits and confirm the coded behaviour (blocking, warning, Pending Validation) — see per-equation list in §3.
5. **Pillar 4 — Independent engineering review.** An engineer who performed none of pillars 1–3 reviews the dossier against the register entry and signs.
6. **Approval.** Each recorded pillar enters the register as Draft; an independent engineer approves it (approver ≠ recorder, enforced by the system). No pillar is ever auto-completed.

## 3. Per-equation scope, hand-calc content and boundary cases

| Ref | Hand calculation (from §1 inputs) | Boundary cases (Pillar 3) |
|---|---|---|
| PD-001 | ṁ_feed = 4 m³/h × ρ_RRBO(70 °C); Q = ṁ/ρ back-check; solvent flows both cases | volumetric vs mass basis; density entry missing ⇒ blocked (no default correlation) |
| PD-002 | R_SO = S_normal/ṁ_feed vs stored 1.7004702194357366 (total_feed_mass basis) | basis string present in snapshot; no de-solvated basis mixing |
| PD-003 | relDiff formula with both flow AND ratio entered; confirm tolerance arithmetic at 0.1 % | consistent pair accepted; inconsistent pair (>0.1 %) ⇒ calculation_blocked (register example 7600 & 1.5) |
| PD-004 | S_max = 1.2 × S_normal | f_max < 1.0 rejected; f_max = 1.05 warns (band itself under open finding) |
| PD-005 | Δρ = \|ρ_NMP(70) − ρ_RRBO(70)\| = 116.3 kg/m³ (frozen); lighter/heavier assignment | Δρ = 0 ⇒ Not Calculable; Δρ < 30 warns (threshold under open finding); continuity NEVER from density |
| PD-006 | Full 8-term balance from §1 splits; R & E totals; closure F + S − R − E = 0 to 1e-9 relative | any missing split ⇒ gross inlet balance only + Pending Validation, no zero default; explicit zero-loss ⇒ assumptions register; splits reuse ⇒ CASE_SPLIT_ASSUMPTIONS_REUSED |
| PD-007 | All 7 yield ratios from PD-006 stream values | oilCarrierInFeed = 0 and soluteInFeed = 0 ⇒ null (no division); solvent-containing ratios never labelled product yields |
| PD-008 | Not exercised in run #22 (no distributionRatio entered) — hand calc uses register example m = 1.8, S/F = 1.5 → A = 2.70; verify definition-only (no recovery prediction anywhere in snapshot) | incomplete metadata ⇒ Pending Validation + DISTRIBUTION_RATIO_BASIS_INCOMPLETE; Assumed source ⇒ Pending Validation |
| PD-010 | ⌈6/0.60⌉ = 10 vs frozen estimatedPhysicalStages | efficiency > 1 rejected; N non-integer rejected; label "Preliminary Stage-Equivalent Estimate" present (warning limits under open finding) |

C2 contains no iterative equations, so the iterative-evidence extensions (convergence, tolerance sensitivity, root selection, multiple-root, boundary behaviour) do not apply here; they enter with C3 (HYD-004/007/008).

## 4. Citation completion required before C2 can reach Verified

Open critical findings (raised 2026-08-06, block Verified until closed with a named engineer + closure reference):

- PD-003 — 0.1 % consistency tolerance: literature/vendor source or approved TEPS.
- PD-004 — 1.1–1.5 f_max band: literature/vendor source or approved TEPS.
- PD-005 — Δρ < 30 kg/m³ threshold: literature/vendor source or approved TEPS.
- PD-010 — stage-efficiency/stage-count warning limits: literature/vendor source or approved TEPS.

Identities/definitions (PD-001, PD-002, PD-006, PD-007 arithmetic, PD-008 definition) require no external literature; their citation is the controlled Correlation Register plus the Pillar-2 unit verification, per the directive.

## 5. Path to Verified for `llx-process-design` v1.0.0

1. 9 dossiers VV-HC-C2-PD-001…008, 010 executed (4 pillars each) — 36 evidence records, each Draft → independently Approved.
2. All 4 critical findings closed with sourced/TEPS references.
3. Regression case passing at v1.0.0 (currently green).
4. Independent engine-version approval recorded for v1.0.0 (named engineer + reference; immutable).

The system computes Verified only when all four conditions hold; nothing is asserted manually.
