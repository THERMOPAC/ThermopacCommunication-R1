---
name: Gaskets procurement model
description: 5-family SAP Item Code model for Raw Materials → Gaskets. Covers SWIO, CMG, FSG, SCG, O-Ring.
---

## The 5 families

| Family | Dropdown label | Type code | Skeleton |
|---|---|---|---|
| Spiral Wound (full) | Spiral Wound – Inner + Outer Ring | SWIO | `RM-GSK-SWIO-{WIND}-{INNER}-{OUTER}-{NB}-{CLS}-{FACING}` |
| Corrugated Metal | Corrugated Metal Gasket | CMG | `RM-GSK-CMG-{CORE}-[{SURF}]-{NB}-{CLS}-{FACING}` |
| Flat Sheet (standard flanges) | Flat Sheet Gasket | FSG | `RM-GSK-FSG-{MATL}-{THK}MM-{NB}-{CLS}-{FACING}` |
| Soft Cut (custom geometry) | Soft Cut Gasket | SCG | `RM-GSK-SCG-{MATL}-{THK}MM-{SHAPE}-{DIMS}` |
| O-Ring | O-Ring | ORING | `RM-GSK-ORING-{MATL}-{ID}X{OD}X{CS}[-{HARD}]` |

## Key decisions

- **19 types → 5 families** — original 19 types were mostly material variants of flat sheet. Consolidated: RTJ and Kammprofile dropped (not currently procured); Camprofile(Grooved) was duplicate of Kammprofile; PTFE/CAF/CNAF/EPDM/Neoprene/Silicone/Rubber all became `sheet_material` options under FSG or SCG.
- **Flat Sheet vs Soft Cut** — FSG is for standard ASME piping flanges (NB + Class); SCG is for custom geometry (equipment, manways, heat exchangers, tanks). Both use same material list.
- **Spiral Wound: only SWIO** — Outer Ring Only and bare SW removed (not standard procurement).
- **CMG surface layer is optional** — blank = bare CMG; "Graphite" or "PTFE" = faced CMG. Field label: "Surface Layer", not "Facing Material" (avoids confusion with flange facing).
- **O-Ring identity: ID × OD × CS, not NB + class** — dimensions measured with caliper.
- **O-Ring: OD ≈ ID + 2×CS** — enforced on both server (builder throws) and client (inline warning). Tolerance: max(1mm, 3% of expected OD).
- **O-Ring hardness mandatory for elastomers, optional for PTFE** — PTFE O-rings have no Shore A rating. 70A and 90A produce distinct SAP codes (not silently merged).
- **Decimal dimensions in O-Ring SAP code** — trailing zeros stripped (50.0 → 50); meaningful decimals retained (5.33 stays). SAP B1 permits periods in item codes.
- **SCG Custom/Oval shape** — builder throws with "manual SAP code entry" message; user must enter SAP code manually. Ring/Full Face Ring and Rectangular are auto-generated.
- **Outer ring material on SWIO is mandatory and variable** — Carbon Steel is the default selection in form but always stored and always in the SAP code. Not hardcoded.
- **Pressure class encoding** — "150#" → "150" (strip #); "PN 10" → "PN10" (strip space). Note: different from valve builders which use "Class 150" → "CL150".
- **NB used as-is** — COMMON_NB values like "50NB", "100NB" are already compact; no mapping needed.
- **Silicon → Silicone** — corrected spelling in the material list.

**Why outer ring is identity field:** Different clients/projects specify different outer ring materials for corrosion resistance. CS outer ring and SS316 outer ring are different purchased items even for same NB/class/winding.

**Why FSG and SCG are separate families:** FSG has fixed OD/ID derived from ASME B16.21 for the selected NB+class — no custom dimensions needed. SCG is cut to custom print dimensions — no NB+class applicable.
