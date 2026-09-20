---
name: Stage 4 HETS screening boundary
description: User-approved assumption-based sizing replaces the operational finite-rate calculation without claiming scientific qualification.
---

Treat the operational Stage 4 result as fixed-`Ndesign=7` HETS-based pre-pilot physical screening, independently of the unqualified finite-rate/Broyden research route.

The current approved basis supersedes fixed HETS and the former 40% efficiency: fixed Stage-4 Ndesign=7 and adopted average physical-compartment efficiency 0.35. Stage-2 N_T remains reference-only.

**Why:** On 2026-09-20 the user explicitly superseded the 40% assumption with 35%, reaffirmed the fixed-seven rule, and required formula-derived compartment counts rather than hard-coded counts. Disengagement-zone enlargement is a separate, deferred decision.

**How to apply:** Use NC=ceil(Ndesign/eta), active height=NC×persisted Stage-3 hc. Never rerun Stage 3 to create missing authority. Hactive/7 is diagnostic-only implied installed HETS. Preserve old HETS/40% calculations and Stage-5 snapshots under their historical methodology.

New optimized sizing must never fall back to historical fixed-ratio geometry when a current optimizer result is absent.

**Why:** Installing an optimizer alone left the real project displaying its old 0.50D result as current because no optimization had been saved. Historical compatibility must not silently defeat the user's changed design basis.

**How to apply:** Keep reads read-only and historical results visibly historical; an explicit Calculate action obtains current optimized geometry before sizing. Verify the existing-project transition, not only isolated new-result formulas.

Ranking changes also invalidate downstream sizing even when Stage-1 inputs are identical.

**Why:** A saved wider-window result remained displayed as calculated after the size-balanced ranking was introduced; input freshness alone cannot establish methodology freshness.

**How to apply:** Check current optimizer version and implementation identity in Stage-4 freshness, keep recalculation available for historical results, and expose the persisted ranking rationale on Stage 4 itself.

**Why:** The user stopped the expensive whole-column qualification and explicitly approved a transparent assumed-HETS conversion of existing hydraulic geometry using a fixed Stage-4 design basis of seven theoretical stages. The decision expressly applies to both NMP-continuous/RRBO-dispersed and RRBO-continuous/NMP-dispersed orientations. This is a change in engineering scope, not evidence that the stopped solver converged.

**How to apply:** Do not restore finite-rate convergence or transport-property requirements as prerequisites for this screening route. Preserve current Stage-1/Stage-3 hydraulic snapshot integrity and Stage-3 HETS admission through lightweight persisted-evidence checks without executing scientific-runtime preflight. Preserve Stage-2 scientific acceptance checks when Stage-2 evidence exists, but do not make an actual Stage-2 value a gate for the fixed-7 assumption-based sizing. Show that actual value as nullable reference-only evidence, never as the fixed sizing value.

The adopted efficiency is an engineering assumption, not a published Kühni constant or a calculated/validated RRBO/NMP performance value.

The approved replacement investigation excludes Job A/B/C and alternative
full-column rate/population-balance solvers. Seek published engineering
HETS/overall-efficiency/reference scale-up methods first.

**Why:** Requiring the unsuccessful scientific solver again would defeat the
user's expressly chosen engineering-design route.

**How to apply:** Keep accessible evidence gaps distinct from disproven
methods. The no-ABC height review identifies Hemmati 2015 governing equation
pages as an unresolved lead, not an admitted correlation. Do not substitute
another chemistry's HETS band or promise a separation-qualified optimum.

**Why:** Integer compartment rounding creates extra installed height but does not demonstrate an adequate allowance for uncertain mass transfer.

**How to apply:** Round NC upward from Ndesign/eta, then determine active height from NC×hc. Do not preserve the superseded fixed-HETS formula in current sizing. Distinguish active height from total mechanical vessel height. Never infer outlet performance, target compliance, or release-ready mechanical sizing from the screening result.

For a reduced transport diagnostic, preserve the saved counter-current section boundaries and signed component transfer; a straight path between terminal products cannot substitute for the saved intermediate profile.

**Why:** The accepted theoretical cascade can reverse component transfer locally. Endpoint-only interpolation hides those reversals and can fabricate positive heights. Frozen tie-line scalar ratios may disagree with that coupled transfer without invalidating the accepted equilibrium calculation.

**How to apply:** Pair extract-incoming with raffinate-leaving at one section boundary and extract-leaving with raffinate-incoming at the other. Test the signed transfer against the driving force throughout each section; never use absolute values to conceal negative-height sections or integrate through a zero-force crossing. Label frozen-ratio, no-dispersion heights as conditional diagnostics, not column sizing.