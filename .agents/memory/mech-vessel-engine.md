---
name: Common Mechanical Vessel Engine (C6)
description: Registration wiring, Assumed-scan ordering rule, and matching rules for the mech-vessel screening engine.
---

- Engine index files (`server/engines/llx/index.ts`, `server/engines/common/index.ts`) are side-effect registration modules; they only run because `server/design-software-routes.ts` imports them. Any new engine family index MUST be imported there or the registry never sees it — tests instantiating the class directly won't catch this.
- **Why:** architect review caught mech-vessel absent from the runtime registry despite a green 100+ test suite.
- Assumed-input governance rule: build ONE complete tagged-input pre-pass (including nested/optional structures: plate series, DN series, nozzle defaults, per-nozzle sizes/flows/projections, leg criteria) BEFORE constructing any result item. Deriving item statuses lazily while assumptions are still being discovered produces inconsistent `Calculated` vs `Pending Validation` items in the same run.
- Mandatory nozzle services use exact normalized word match — substring matching is forbidden ('solvent' must never satisfy 'vent'); entered series (plate, DN) must be strictly increasing or the run blocks.
- Plan hand-calcs can round differently than the engine: benchmark head plate was hand-rounded to 8 mm but the correct next plate ≥ 5.993 from [6,8,…] is 6 mm — trust the series arithmetic, note the deviation in closeout.
