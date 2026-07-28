---
name: Fasteners procurement model (see also gaskets-procurement-model.md)
description: 8-family SAP Item Code model for Raw Materials → Fasteners, including form field rules and key design decisions.
---

## The 8 families and their skeletons

| Family | Types | Skeleton |
|---|---|---|
| Stud Bolts | Fully Threaded Stud, Double-End Stud | `RM-FST-{TYPE}-{MATL}-{DIA}-{LEN}MM-{THREAD}-{COAT}` |
| Set | Stud + 2 Nut + 2 Washer Set | `RM-FST-STDS-{BMATL}-{NMATL}-{WMATL}-{DIA}-{LEN}MM-{THREAD}-{COAT}` |
| Hex Bolt (inch) | Hex Bolt + inch dia | `RM-FST-HXBT-{MATL}-{DIA}-{LEN}MM-{THREAD}-{COAT}` |
| Hex Bolt (metric) | Hex Bolt + metric dia | `RM-FST-HXBT-{FT|PT}-{MATL}-{DIA}-{LEN}MM-{THREAD}-{COAT}` |
| Anchor Bolt | Anchor Bolt | `RM-FST-ANBT-{SUBTYPE}-{MATL}-{DIA}-{TOTLEN}MM-{THRDLEN}MM-{COAT}` |
| Eye Bolt | Eye Bolt | `RM-FST-EYBT-{SUBTYPE}-{MATL}-{DIA}-{SHANKLEN}MM-{COAT}` |
| U-Bolt | U-Bolt | `RM-FST-UBLT-{MATL}-{RODDIA}-{NB}-{LEGLEN}MM-{COAT}` |
| Nuts | Hex Nut, Heavy Hex Nut | `RM-FST-{TYPE}-{MATL}-{DIA}-{THREAD}-{COAT}` |
| Washers | Flat Washer, Spring Washer | `RM-FST-{TYPE}-{MATL}-{DIA}-{COAT}` |

## Key decisions

- **Coating is mandatory** — no silent default to PLN. User must explicitly select.
- **U-Bolt uses pipe NB not OD** — ASME B36.10M NB→OD mapping is one-to-one and invariant. U-bolt suppliers catalog by NB. Consistent with rest of catalog.
- **Washer series is engineering-only** — not in SAP code. Industrial piping contractors procure "M16 Flat Washer SS304", not by DIN 125A vs 125B.
- **Hex Bolt bolt_profile (FT/PT) only for metric** — DIN 931 vs DIN 933 are different items. Inch hex bolts: ASME B18.2.1 covers both under one standard.
- **Washer material is a separate field** — `washer_material` options: Carbon Steel (IS 2062), SS 304, SS 316, Alloy Steel. Bolt/nut material lists are not reused for washers.
- **Diameter-threading compatibility** — Metric dia (M8–M48) allows only ISO Metric Coarse/Fine. Inch dia allows only UNC/UNF. Enforced on both client (auto-clear) and server (throw).
- **Fastener standard is engineering-only** — excluded from SAP code for all types. Auto-derived from type+threading in the form as a suggestion.
- **Thread protection is engineering-only** — packaging, not stock identity.
- **Washer series is engineering-only** — not in SAP code.
- **Anchor bolt thread_length < overall_length** — cross-field validation enforced in builder.
- **Length range: 1–2000 mm** — validated in builder with `fstCheckLen`. Form inputs have min=1, max=2000.

## UI label changes
- "Stud Bolt (Full Thread)" → "Fully Threaded Stud" (SAP code: STDBF)
- "Stud Bolt (2-end Thread)" → "Double-End Stud" (SAP code: STDBT)
- Old labels will fail the builder (not in FST_TYPE_CODE map) — intentional.

## Inch diameter encoding
Slash removed, inch symbol stripped, `IN` appended:
`1/4"` → `14IN`, `3/8"` → `38IN`, `1/2"` → `12IN`, ... `1-1/4"` → `114IN`, `2"` → `2IN`

## Form field visibility by family
- `bolt_profile`: shown only when type=Hex Bolt AND selected diameter is metric
- `diameter`: hidden for U-Bolt (uses `rod_diameter` + `pipe_size` instead)
- `nut_material`: shown for Set and standalone Nuts only
- `washer_material`: shown for Set and standalone Washers only
- `threading_standard`: shown for Stud Bolts, Set, Hex Bolt, Anchor Bolt, Nuts — hidden for Eye Bolt, U-Bolt, Washers
- `thread_protection`: hidden for Washers

**Why:** Each family has a different geometric identity. Mixing fields across families was the pre-existing bug (bolt_material labelled "Bolt / Stud Material" shown for nuts; `size_dia` validation key that never existed).
