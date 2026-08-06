---
name: LLX workspace localData hydration rule
description: Invariants for hydrating/saving the per-section working copy in the LLX design workspace
---
**Rules:**
1. `localData` is the source of truth between blur-saves. Server inputs may fully replace it only on the FIRST hydration of a revision; every later refetch merges server data UNDER local values (local wins). `refetchOnWindowFocus` stays disabled for the inputs query.
2. Auto-seeding effects must be gated behind the hydration barrier (state, not a ref) so they never commit a whole-section object built from pre-hydration empty state.

**Why:** Whole-object section saves mean any stale or empty local snapshot that gets saved silently erases server fields (e.g. Operating Temperature/Pressure, Design Capacity). Both a stale focus refetch replacing local state and a seeder firing before first hydration have caused this class of data loss.

**How to apply:** Any new section, seeder, or hydration change must preserve both invariants. Lost values in a live design are user inputs — never re-seed them; the engineer re-enters once the binding is fixed.
