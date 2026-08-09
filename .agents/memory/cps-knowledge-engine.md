---
name: CPS Knowledge Engine governance
description: Phase 1 CPS Sizing Tool Knowledge Engine — frozen structure and rules for populating/using parameters
---

## Rules
- Structure is FROZEN as of Aug 2026 (user directive): 7 categories × 5 parameter types; no structural change without a genuine engineering requirement surfaced during population.
- `parameter_code` is immutable — future sizing calcs retrieve constants by code; never hard-code a constant that exists here.
- NULL value = "Not defined"; the system must NEVER substitute a placeholder engineering value.
- Values are decimal STRINGS end-to-end; equality/change detection is done by PostgreSQL NUMERIC (`IS DISTINCT FROM`), never JS floats — history rows would be silently lost otherwise.
- Value changes auto-write `cps_knowledge_parameter_history` in the same transaction; type/unit/text edits write no history.
- Writes are Superuser-only, enforced server-side; no DELETE route (deactivate via is_active).
- Units follow the Thermopac CPS Excel model, not SI convention (e.g. COL_INTERNAL_VOL in L, FLOW_PER_COL in L/h — do not convert to m³).
- `physical_constant` enum value displays as "Physical / Property" (label-only rename; DB value preserved).
- Classification principle: fixed physical/design properties (incl. AMBIENT_TEMP, CW_INLET_TEMP, SURFACE_HEAT_LOSS, COMBUSTION_AIR_REQ) = physical_constant; operating setpoints/endpoints = process_threshold; capacity/absorption/recovery quantities = performance.
- Phase 2 (Customer Input / System Output sizing calcs) NOT started — do not build until asked. Sizing will round columns up to multiples of 20 and select smallest standard skid (60/120/180/200/240).
- Population proceeds category by category with user validation, starting Media & Column.
- Prod: tables not yet created — DDL in llx-prod-db-alters-pending.md; seed via scripts/create-cps-knowledge-tables.ts (idempotent, kept in sync with classification corrections).
