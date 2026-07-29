---
name: Flanges SAP builder
description: Phase 2A Flanges spec-based SAP item code builder — format, field names, and key rules.
---

## SAP Item Code format
`RM-FLG-{STD}-{TYPE}-{SIZE}-{RATING}-{MAT}-{FACE}`

Example: `RM-FLG-B165-BL-DN15-CL150-A105-RF` (live data code, 30 chars)
Worst case: `RM-FLG-B1647A-LWN-DN300-CL2500-F316L-RTJ` (40 chars)

## Attribute field names (from technical_attributes JSON)
- `standard`      → Flange Standard  (e.g. "ASME B16.5")
- `flange_type`   → Flange Type      (e.g. "Blind (BL)")
- `size_nb`       → Nominal Size     (e.g. "15", "DN50", "2\"")
- `pressure`      → Pressure Rating  (e.g. "Class 150", "PN 16")
- `material`      → Material         (e.g. "ASTM A105")
- `facing`        → Facing           (e.g. "RF (Raised Face)")
- `reducing_bore` → Second size for Reducing flanges only

## Size normalisation: normalizeFlangeSizeCode()
Exported function. Converts ANY size input → `DN{n}`.
- "15" / "15 NB" / "DN15" → "DN15"
- "1/2\"" → "DN15" (rational inch parse → ISO 6708 DN lookup)
- "12\"" → "DN300" (NOT "DN15" — inch ambiguity explicitly avoided)
- Rejects empty / unknown formats with clear error

## Standard/Rating compatibility (enforced)
- ASME B16.5, B16.47 Series A/B, MSS SP-44 → Class ratings ONLY
- BS EN 1092-1, DIN 2573/2576, IS 6392    → PN ratings ONLY
- Cross-combination throws with clear message

## Facing format (flange UI ≠ gasket UI)
- Flange form: "RF (Raised Face)" — code first
- Gasket form: "Raised Face (RF)" — name first
- FLG_FACING_CODE accepts both; gasket-format entries are legacy aliases
- Unknown facings are rejected (no silent fallback)

## Reducer format
`DN100XDN50` — both bores normalised through normalizeFlangeSizeCode()

## Dispatcher wiring (pppc-routes.ts)
- POST: isFlanges flag + resolveFlangesSapItemCode block after isStructuralSteel
- PATCH: isFlanges2 flag + block after isStructuralSteel2
- Import: resolveFlangesSapItemCode added to buy-catalog-sap-service imports

## 10 live lines backward compatibility
All 10 existing lines resolve to `RM-FLG-B165-BL-DN15-CL150-A105-RF`.
They will be resolved via Phase 2B backfill — not by manual re-save.

## Regression test
scripts/phase2a-regression.ts — 201 assertions, all passed.
