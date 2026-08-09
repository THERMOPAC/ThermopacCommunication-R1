---
name: LLX PGA drawing report
description: Governance and rendering pattern for the auto-generated Preliminary General Arrangement (PGA) drawing report.
---

# PGA / drawing-section pattern

- Report framework supports a `drawing` field on `ReportSection`: pure-JSON `DrawPrimitive[]` (line/rect/path/circle/text) rendered on a dedicated page. Payloads are persisted JSON — never executable content. Renderer validates primitives (finite coords) and skips malformed ones so old payloads can't corrupt a page.
- **Why:** reports render frozen snapshots only; the drawing must be reproducible from the stored payload alone.
- Governance rules that survived review and must hold for any future drawing report:
  - Fail closed on parsed data (nozzle Orientation/Elevation come from remarks strings): strict anchored regex + range check vs T/T; out-of-range/unparseable → HOLD in drawing + missing-data register, **never clamped or defaulted**.
  - Internals stack: if any frozen height-breakdown line lacks a finite height, the whole stack renders HOLD — zero is never substituted.
  - DS-SEL vs mech geometry diameter reconciled explicitly: match → "EFFECTIVE GOVERNING — DS-SEL-006" label; mismatch/missing record → label HOLD + missing-data error; the drawn diameter is always the frozen mech geometry.
  - Never claim "verbatim" for formatted numbers — values are "rendered from frozen snapshot data (numeric formatting only)"; only source strings are cited verbatim.
  - Head profile: cubic bezier control = 4/3 × head depth puts the apex exactly at head depth (true scale). Overall-height dim label must state it includes screening head allowances (0.5 m/head) while the drawn head profile is geometric — the two frozen bases differ; render both verbatim, never reconcile.
  - Non-suppressible 4-line stamp box drawn on every view; watermark removed only when lifecycle approved/issued.
- PGA registered in REPORT_BUILDERS and as optional PCB Part 7; drawing sections pass through PCB aggregation unchanged (plain JSON).
- User-accepted final form (Aug 2026): a single A4-**landscape** drawing sheet (framework `landscape` flag on drawing sections; renderer returns to portrait for subsequent pages) with sheet border + drafting title block — not a stack of portrait figures. Elevation is vertical true scale with drawn **width exaggerated ×3**; the exaggeration must be stated on the sheet and in the caption (governance: never present exaggerated width as scale).
- **Why:** a true-scale 600 mm × 8.9 m column renders pencil-thin; slenderness makes honest single-scale drawing illegible.
- Operational lesson: always restart the app workflow after editing report builders — the UI Regenerate button runs the in-memory (stale) builder and silently overwrites the payload with the old layout.
