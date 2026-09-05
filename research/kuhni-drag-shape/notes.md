# Research Notes: RRBO/NMP Non-Spherical Drop Shape and Drag Closure

**Status:** complete
**Depth:** Standard primary-source audit

## Plan

- **Question:** Which primary-source liquid-liquid shape and Reynolds-dependent drag closure can defensibly replace the current spherical \(Re_t \le 50\) limit for Project 236 at \(X=33.6\) and \(Mo\approx2.86\times10^{-9}\)?
- **Scope:** Primary-source equations, ranges, Project 236 mapping, and compatibility at terminal, characteristic, and swarm-slip states. No optimizer run, geometry resolver, or production changes.
- **Audience:** Engineering governance review.
- **Deliverable:** Proposed governed closure with exact equations, source-supported versus extrapolated use, and remaining genuine physical blockers.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Current Project 236 equations and state mapping | complete | local governed records and archived terminal grid |
| 2 | Grace/Clift liquid-drop regime and terminal-velocity framework | complete | Grace 1976; Clift context; Barry 2018 |
| 3 | Non-spherical liquid-drop aspect-ratio and drag correlations | complete | Myint 2006/2007; Wellek 1966; Henschke/ReDrop |
| 4 | Garthe/Stichlmair characteristic and swarm-slip compatibility | complete | Garthe 2005 rendered Eq. 8.3 |
| 5 | Applicability at \(X=33.6\), \(Mo\approx2.86\times10^{-9}\) | complete | full 0.5–5 mm mapping |

## Coverage Checklist

- [x] Reproduce the current \(Re_t\le50\) blocker and define all local states.
- [x] Identify primary-source shape equations and exact variable definitions.
- [x] Identify the strongest Reynolds-dependent liquid-drop drag equation.
- [x] State published ranges and liquid-liquid system coverage.
- [x] Numerically map Project 236 terminal states and preserve the exact characteristic/swarm equations without inventing missing historical state values.
- [x] Test compatibility with Garthe/Stichlmair equations without circular definitions.
- [x] Separate source-supported use from pre-pilot extrapolation.
- [x] State the remaining genuine physical blocker.

## Findings Log

### Current implementation

- Project \(X\) is the viscosity ratio \(\mu_D/\mu_C=33.6\), not an undefined Grace variable.
- The existing \(Re_t\le50\) cutoff is not a source-supported physical deformation boundary.
- The rendered Garthe Eq. 8.3 retains the square root over the complete drag-ratio/holdup product.

### Shape and regime

- Myint 2007 clean-drop shape: \(E=1-0.0487Ta-0.0289Ta^2\), \(Ta=ReMo^{0.23}\).
- Project \(Mo\), \(\kappa\), and the 0.5–3 mm terminal trajectory satisfy all Myint shape gates.
- The 4 and 5 mm points fail the published \(Ta\le3.6\) shape gate.
- Wellek remains a separate contaminated/non-oscillating shape sensitivity, not a drag law.

### Drag

- Myint 2006 Eq. 9 provides \(C_D(Re,\kappa,\Lambda)\) for isolated liquid drops through \(Re<200\).
- At \(\kappa=33.6\), clean and fully contaminated drag prefactors are 23.7688 and 24.
- Terminal force-balance mapping gives a source-range diameter boundary near 2.98 mm.
- No shape multiplier is added; Myint 2006 drag and Myint 2007 shape remain separate evidence objects.

### Garthe/Stichlmair compatibility

- Garthe Eq. 5.6/5.7 and square-root Eq. 8.3 are preserved.
- In the Eq. 8.3 \(C_D\) ratio, the Myint viscosity/interface prefactor cancels exactly when one unchanged interface branch is used.
- Applying the terminal-data-derived Myint curve at characteristic/swarm states is mathematically compatible but remains pre-pilot extrapolation.

### Project 236 numerical mapping

- Full clean/contaminated terminal results are in `project236-myint-closure-map.csv`.
- Clean \(Re=200\) boundary: \(d=2.97482\) mm.
- Contaminated \(Re=200\) boundary: \(d=2.98444\) mm.
- No frozen 50 °C persisted \(v_{\rm char,0}\), \(h_D\), \(v_s\) triplet was found; these values were not invented or regenerated through the prohibited optimizer.

## Conflicts & Open Questions

- Project \(X=\kappa=33.6\) is resolved and must not be reinterpreted.
- Direct RRBO/NMP validation is not an execution prerequisite for the pre-pilot diagnostic, but the characteristic/swarm extrapolation status must remain explicit.
- Release qualification still requires nonterminal characteristic/swarm validation or an independently qualified arbitrary-slip liquid-drop drag relation.

## Gaps

- The remaining release blocker is validation of \(C_D(Re)\) at the nonterminal characteristic and swarm-slip states under a consistent interface branch.
- Any local or terminal \(Re\ge200\) remains outside the proposed Myint 2006 closure.
- Final report: `project236-myint-garthe-final.md`.
- Source registry: `sources.json`.