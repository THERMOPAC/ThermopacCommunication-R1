---
name: All 10 panel SAP Item Code builders
description: Architecture decisions for spec-based SAP code generation for all panel types in the panels subgroup.
---

# Panel SAP Item Code Builders — Architecture

## Builders and skeletons (server: buy-catalog-sap-service.ts)

| Type | Builder | Skeleton |
|---|---|---|
| MCC | buildMccPanelItemCode | PNL-MCC-{VOLT}-{BUS}-{ICW}-{IP}-{MAT}-{AREA} |
| Starter Panel | buildStarterPanelItemCode | PNL-STR-{STARTER}-{VOLT}-{ICW}-{IP}-{MAT}-{AREA} |
| Distribution Board | buildDbPanelItemCode | PNL-DB-{VOLT}-{BUS}-{ICW}-{IP}-{MAT}-{AREA} (all voltages incl 1Ph) |
| Power Distribution Panel | buildPdpPanelItemCode | PNL-PDP-{VOLT}-{BUS}-{ICW}-{IP}-{MAT}-{AREA} (3Ph only) |
| PLC/DCS/SCADA/REL | buildAutomationPanelItemCode | PNL-{TYPE}-{VOLT}-{IP}-{ENCTYPE}-{MAT}-{AREA} |
| APFC | buildApfcPanelItemCode | PNL-APFC-{VOLT}-{KVAR}KVAR-{IP}-{MAT}-{AREA} |
| VFD | buildVfdPanelItemCode | PNL-VFD-{VOLT}-{DRVKW}KW-{IP}-{MAT}-{BYPASS}-{AREA} |

## Detection pattern (pppc-routes.ts)

Uses a **single `_SPEC_PANELS` Set** (not per-type booleans):
```typescript
const _SPEC_PANELS  = new Set(['MCC (Motor Control Centre)','Starter Panel','Distribution Board (DB)','Power Distribution Panel','PLC Panel','DCS Panel','SCADA Panel','Relay / Protection Panel','APFC Panel','VFD Panel']);
const _panelTypeStr = (groupCode === 'electrical_control' && subgroupCode === 'panels') ? ...panel_type... : '';
const isSpecPanel   = _SPEC_PANELS.has(_panelTypeStr);
```
Then one big if-chain dispatches to the right resolver based on `_panelTypeStr`.
Unknown types fall through to make+model path.

**Why:** Adding more types only requires extending the Set + adding one if-branch, not modifying the bypass guard.

## Shared helper: panelAreaSeg

`panelAreaSeg(attrs, missing)` in service file handles both Safe Area ("SA") and Zone 1/2 (hazardous composite) while accumulating missing fields. All builders call this — do not duplicate the area logic.

## Client preview dispatcher

`buildPanelPreviewCode(attrs)` in electrical-attrs-forms.tsx is the single export used by buy-packages-page.tsx for all panel types. It delegates to `buildMccPanelPreviewCode` for MCC; handles all others inline. Uses shared `_P_*` maps defined in the same file.

**Why:** One import, one preview bar block in the page with per-family colour coding.

## Form panel families (electrical-attrs-forms.tsx)

```typescript
const isMcc      = panelType === "MCC (Motor Control Centre)";
const isStarter  = panelType === "Starter Panel";
const isDb       = panelType === "Distribution Board (DB)";
const isPdp      = panelType === "Power Distribution Panel";
const isPowerBus = isDb || isPdp;
const isAutoType = ["PLC Panel","DCS Panel","SCADA Panel","Relay / Protection Panel"].includes(panelType);
const isApfc     = panelType === "APFC Panel";
const isVfd      = panelType === "VFD Panel";
const isSpecType = isMcc || isStarter || isPowerBus || isAutoType || isApfc || isVfd;
const hasBusBars = isMcc || isStarter || isPowerBus;
```

- `hasBusBars` controls Incoming/Feeder section visibility and Busbars section
- `isAutoType` moves `enclosure_type` (in code) to Electrical Rating section; Enclosure shows material + IP only
- `handleAreaChange` (clears hazardous fields on Safe Area) now applied to ALL spec types via `isSpecType` guard

## New attrs (no DB migration needed — stored in JSONB technicalAttributes)

- `starter_type`: "DOL" | "Star-Delta" | "Soft Starter"
- `kvar_rating`: "25 kVAr" ... "1000 kVAr"
- `drive_power_kw`: "11 kW" ... "1000 kW"  
- `bypass_arrangement`: "None" | "Mechanical Bypass" | "Electronic Bypass"
- `enclosure_type` (already existed): for automation panels this is now a Level-A code field

## Tests

`tests/panel-builders.test.ts` — 49 tests, all passing. Covers all 6 builder families.

---

# Cabling SAP Item Code Builder

Skeleton: `ELC-CBL-{TYPE}-{CORES}Cx{SIZE}-{VOLT}[-{ARM}][-{SCR}]`

Code fields: cable_type, core_config, cable_size, voltage, armour (if not Unarmoured), screening (if not Unscreened)
Spec fields (not in code, but insulation is mandatory gate): insulation, outer_sheath, laying_type, standard

`tests/cable-builder.test.ts` — 26 tests, all passing.

---

# Junction Box SAP Item Code Builder

Skeleton: `ELC-JBX-{TYPE}-{TERMS}T-{MAT}-{IP}[-{AREA}]`

Code fields: jb_type, num_terminals (or "Other"→custom_terminal_count), body_material, enclosure_type (IP)
Area: omitted for Safe Area on standard types; mandatory + hazardous-only for IS and FLP types
Spec fields (not in code): terminal_type, mounting, gland details, certification, earthing, accessories, make

IS/FLP area rule: "Intrinsically Safe JB" and "Flameproof JB" must have a hazardous zone — Safe Area and Non-classified are rejected server-side and filtered out of the form options.

Custom terminal count: when num_terminals === "Other", read custom_terminal_count (positive integer); encode as {n}T.

Form bug fixed: area_classification required condition was `encType === "Flameproof"` (checked IP rating — always false); corrected to `jbType === "Flameproof JB" || jbType === "Intrinsically Safe JB"`.

Make/model gate fix: buy-packages-page.tsx make gate (line ~1627) and model gate (line ~1635) were missing !isPanelMode, !isCablingMode, !isJunctionBoxMode — all three added.

`tests/junction-box-builder.test.ts` — 33 tests, all passing.
