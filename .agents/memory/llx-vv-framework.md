---
name: LLX V&V framework (Phases A+B)
description: Regression harness + equation register discipline for the LLX calculation engines — governance rules that must hold for all future phases.
---

## The Rule
Software Verification (release-scoped, per engine version) and Engineering Confidence (revision-scoped, per design) are two separate assessments that must NEVER be merged into one score. Verification status is always COMPUTED from evidence (equation register pillars + regression pass state), never asserted or hand-set.

**Why:** Prasad's approved V&V architecture (Aug 2026) — an engine may be fully Verified while the design confidence stays Medium because governing parameters are Assumed. Merging them destroys both meanings.

**How to apply:**
- Regression cases freeze full result snapshots with tight tolerances (rel 1e-9). Never widen a tolerance to make a case pass — a legitimate volatile field (timestamps) goes into `ignorePaths` instead; a numeric change is a real regression or a deliberate engine version bump.
- Regression expected values are a reproducibility baseline (provenance = the accepted run), NOT engineering validation — say so in every source string.
- Equation register entries are seeded only from formula references/sources the engines actually emit — never invented. C2 (llx-process-design) and C3 (llx-hydraulics) emit no formulaReference fields, so their registers stay empty (⇒ Unverified) until refs are documented from engine code.
- Evidence pillars (handCalc, unitCheck, boundaryCheck, independentReview) require a named engineer + document reference; no anonymous evidence.
- mech-vessel registers under moduleType 'common' (not 'llx') in the engine registry.
- Engines are DB-free and deterministic — the harness calls engine.calculate(inputSnapshot, ctx) directly through the registry; never modify engines for V&V purposes.
- Envelope/validation phases (C+): three-state verdict Within / Outside / No Validated Envelope Available; never invent validated ranges; six validation source classes never aggregated.
