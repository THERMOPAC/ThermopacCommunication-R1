/**
 * Preliminary General Arrangement (PGA) — automatically generated scaled
 * elevation and sectional views of the extraction column.
 *
 * Renders ONLY persisted frozen snapshots: the mech-vessel run (geometry,
 * nozzle schedule, support, design conditions, thickness, weights), the
 * llx-ecp run (height breakdown / internals stack, bed arrangement) and the
 * DS-SEL record (effective governing diameter). The engines are never re-run;
 * every dimension on the drawing is the verbatim frozen value. Where a datum
 * has no governed value the drawing shows HOLD — nothing is invented.
 *
 * Governance stamp (non-suppressible, removed only by revision lifecycle):
 *   PRELIMINARY GENERAL ARRANGEMENT
 *   Automatically Generated from Frozen Calculation Snapshot
 *   Pending Mechanical Detail Design
 *   Not for Fabrication
 */
import { pool } from '../db';
import type { ReportPayload, ReportSection, DrawPrimitive } from './report-framework';
import { classifyTaggedSource } from './report-framework';
import { loadCommon } from './ecp-ecr-calculation-reports';

const STAMP_LINES = [
  'PRELIMINARY GENERAL ARRANGEMENT',
  'Automatically Generated from Frozen Calculation Snapshot',
  'Pending Mechanical Detail Design',
  'Not for Fabrication',
];

const num = (item: any): number | null => {
  const v = item?.result ?? item;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
const f2 = (v: number | null) => (v == null ? 'HOLD' : v.toFixed(2));
const f3 = (v: number | null) => (v == null ? 'HOLD' : v.toFixed(3));

/** Parse "…; Orientation: 90°; Elevation: 7.90 — …" from the frozen nozzle
 *  remarks string. FAIL-CLOSED: the elevation must be a complete numeric token
 *  terminated by the expected delimiter (— / ; / end) and finite — anything
 *  malformed returns null (→ HOLD), never a partial or defaulted value. */
function parseNozzlePosition(remarks: string): { orientation: string | null; elevation_m: number | null } {
  const om = /Orientation:\s*([^;—]+?)\s*(?:;|—|$)/.exec(remarks ?? '');
  const em = /Elevation:\s*(\d+(?:\.\d+)?)\s*(?:—|;|$)/.exec(remarks ?? '');
  const el = em ? Number(em[1]) : null;
  return {
    orientation: om ? om[1].trim() : null,
    elevation_m: el != null && Number.isFinite(el) ? el : null,
  };
}

/** Load the frozen mech-vessel snapshot with the same provenance discipline as
 *  loadCommon (run bound to the snapshot timestamp — fail closed otherwise). */
async function loadMechVessel(revisionId: number) {
  const resQ = await pool.query(`SELECT data, engine_version, computed_at FROM design_software_results WHERE revision_id = $1 AND section = 'mechanical_vessel'`, [revisionId]);
  if (!resQ.rows.length) throw Object.assign(new Error('No persisted mechanical vessel result snapshot for this revision — run the mechanical design calculation first. The GA never re-runs engines.'), { statusCode: 422 });
  const runQ = await pool.query(
    `SELECT id, engine_name, engine_version, calculation_status, calculated_at
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_type = 'mechanical_vessel'
        AND abs(extract(epoch FROM (calculated_at - $2::timestamptz))) <= 60
      ORDER BY abs(extract(epoch FROM (calculated_at - $2::timestamptz))) LIMIT 1`,
    [revisionId, resQ.rows[0].computed_at]);
  if (!runQ.rows.length) throw Object.assign(new Error('No calculation run matches the persisted mechanical vessel snapshot timestamp — refusing to cite an unrelated run.'), { statusCode: 422 });
  return { res: resQ.rows[0], run: runQ.rows[0] };
}

export async function buildPreliminaryGaPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const { rev, res: ecpRes, run: ecpRun, di } = await loadCommon(revisionId, 'ecp');
  const { res: mvRes, run: mvRun } = await loadMechVessel(revisionId);
  const mv = mvRes.data ?? {};
  const ecp = ecpRes.data ?? {};
  const geo = mv.geometry ?? {};
  const hb = ecp.heightBreakdown ?? {};
  const hbLines: any[] = hb.lines ?? [];
  const beds = ecp.bedArrangement ?? {};

  // DS-SEL effective governing diameter (verbatim record, same query as the Decision Record section)
  const selQ = await pool.query(
    `SELECT record FROM design_selection_records WHERE revision_id = $1 AND is_superseded = FALSE ORDER BY created_at DESC LIMIT 1`, [revisionId]);
  const sel = selQ.rows[0]?.record ?? {};
  const effDia_mm: number | null = typeof (sel.effectiveDiameter_mm ?? sel.selectedDiameter_mm) === 'number' ? (sel.effectiveDiameter_mm ?? sel.selectedDiameter_mm) : null;

  const id_m = num(geo.insideDiameter);
  const tt_m = num(geo.tangentToTangentHeight) ?? num(geo.straightShellLength);
  const overall_m = num(geo.overallVesselHeight);
  const headDepth_m = num(geo.headDepth);
  const headType = String(geo.headType?.result ?? 'HOLD');
  if (id_m == null || tt_m == null || overall_m == null) {
    throw Object.assign(new Error('The frozen mech-vessel snapshot has no governed vessel geometry (ID / T-T / overall height) — run the mechanical vessel calculation before generating the Preliminary GA.'), { statusCode: 422 });
  }
  // DS-SEL ↔ mech geometry reconciliation — explicit, never silent:
  // match → drawing may carry the EFFECTIVE GOVERNING label; mismatch or
  // missing record → the governance label is HOLD and the discrepancy is
  // reported as missing-data (the drawn diameter is always the frozen mech
  // geometry — nothing is substituted).
  const diaMatch = effDia_mm != null && Math.abs(effDia_mm / 1000 - id_m) <= 1e-9;
  const idLabel = diaMatch
    ? `ID ${(id_m * 1000).toFixed(0)} mm (EFFECTIVE GOVERNING — DS-SEL-006)`
    : effDia_mm != null
      ? `ID ${(id_m * 1000).toFixed(0)} mm (mech geometry) — DISCREPANCY vs DS-SEL ${effDia_mm} mm: governance label HOLD`
      : `ID ${(id_m * 1000).toFixed(0)} mm (frozen mech geometry) — DS-SEL record not found: governance label HOLD`;

  const nozzles: any[] = (mv.nozzleSchedule ?? []).map((n: any) => ({
    tag: String(n.tag ?? '—'),
    service: String(n.service ?? '—'),
    dn: num(n.size),
    rating: String(n.rating ?? '—'),
    facing: String(n.facing ?? '—'),
    ...parseNozzlePosition(String(n.remarks ?? '')),
    remarks: String(n.remarks ?? ''),
  }));

  // ── Scaling (true scale; PDF points) ───────────────────────────────────────
  const DRAW_H = 380;                       // drawing area height budget (pt) — landscape sheet
  const scale = DRAW_H / overall_m;         // pt per metre
  const cx = 180;                           // vessel centreline x (pt)
  // Slender-column presentation (standard GA-datasheet practice): the vertical
  // axis is TRUE SCALE; the drawn width is exaggerated ×3 purely for internals
  // legibility, and every sheet states this. No dimension value is affected.
  const WIDTH_EXAG = 3;
  const rPt = (id_m / 2) * scale * WIDTH_EXAG;
  const hdPt = (headDepth_m ?? 0) * scale;
  const yTopTan = hdPt + 14;                // top tangent y (leave room for top-head nozzles)
  const yBotTan = yTopTan + tt_m * scale;   // bottom tangent y
  const yEl = (el_m: number) => yBotTan - el_m * scale;   // nozzle elevations are from the bottom tangent line (Stage 9 convention)

  const A = '#000000', DIM = '#7f1d1d', GRAY = '#666666', HATCH = '#bbbbbb';

  const vesselOutline = (prims: DrawPrimitive[]) => {
    prims.push({ kind: 'line', x1: cx - rPt, y1: yTopTan, x2: cx - rPt, y2: yBotTan, lineWidth: 1.2 });
    prims.push({ kind: 'line', x1: cx + rPt, y1: yTopTan, x2: cx + rPt, y2: yBotTan, lineWidth: 1.2 });
    if (hdPt > 0) {
      // Cubic-bezier apex sits at 3/4 of the control offset → control = 4/3 · headDepth
      // makes the drawn head apex EXACTLY the frozen head depth (true scale).
      const c = hdPt * (4 / 3);
      prims.push({ kind: 'path', d: `M ${cx - rPt} ${yTopTan} C ${cx - rPt} ${yTopTan - c} ${cx + rPt} ${yTopTan - c} ${cx + rPt} ${yTopTan}`, lineWidth: 1.2 });
      prims.push({ kind: 'path', d: `M ${cx - rPt} ${yBotTan} C ${cx - rPt} ${yBotTan + c} ${cx + rPt} ${yBotTan + c} ${cx + rPt} ${yBotTan}`, lineWidth: 1.2 });
    }
    // tangent lines
    for (const y of [yTopTan, yBotTan]) prims.push({ kind: 'line', x1: cx - rPt - 8, y1: y, x2: cx + rPt + 8, y2: y, color: GRAY, lineWidth: 0.5, dash: [2, 2] });
    // centreline
    prims.push({ kind: 'line', x1: cx, y1: yTopTan - hdPt - 10, x2: cx, y2: yBotTan + hdPt + 24, color: GRAY, lineWidth: 0.4, dash: [6, 3] });
  };

  const dimString = (prims: DrawPrimitive[], x: number, y1: number, y2: number, label: string) => {
    prims.push({ kind: 'line', x1: x, y1, x2: x, y2, color: DIM, lineWidth: 0.6 });
    for (const y of [y1, y2]) {
      prims.push({ kind: 'line', x1: x - 3, y1: y, x2: x + 3, y2: y, color: DIM, lineWidth: 0.6 });
      prims.push({ kind: 'path', d: `M ${x} ${y} L ${x - 2} ${y + (y === y1 ? 5 : -5)} L ${x + 2} ${y + (y === y1 ? 5 : -5)} Z`, fill: DIM });
    }
    // label rotated -90° so it runs along the dimension line (drafting style)
    prims.push({ kind: 'text', x: x + 2, y: (y1 + y2) / 2 + label.length * 1.5, str: label, size: 6.5, color: DIM, rotate: -90, boxWidth: 300 });
  };

  const stampBox = (prims: DrawPrimitive[], x: number, y: number) => {
    prims.push({ kind: 'rect', x, y, w: 205, h: 52, stroke: DIM, lineWidth: 1.2 });
    STAMP_LINES.forEach((l, i) => prims.push({ kind: 'text', x: x + 6, y: y + 5 + i * 12, str: l, size: i === 0 ? 8 : 6.8, bold: i === 0 || i === 3, color: DIM, boxWidth: 195 }));
  };

  // ── Internals stack (computed FIRST — drawn inside the elevation view) ─────
  // Stack the T/T internals bottom-up in frozen order (head lines excluded).
  const stackLines = hbLines.filter((l: any) => !/head/i.test(String(l.label)));
  const bottomUp = [...stackLines].reverse();
  // FAIL-CLOSED: if ANY stack line lacks a finite height the internals stack
  // cannot be positioned — the whole stack renders as HOLD (nothing is drawn
  // at an invented elevation; zero is never substituted).
  const stackHeightsOk = bottomUp.length > 0 && bottomUp.every((l: any) => num(l) != null);
  // RECONCILIATION: the summed non-head stack must equal the frozen mech T/T
  // (within 1 mm) or the whole stack is HOLD — internals are never drawn
  // extending outside (or short of) the vessel shell.
  const stackSum = stackHeightsOk ? bottomUp.reduce((s: number, l: any) => s + (num(l) ?? 0), 0) : null;
  const stackTtMismatch = stackHeightsOk && Math.abs((stackSum as number) - tt_m) > 0.001;
  const stackComplete = stackHeightsOk && !stackTtMismatch;

  // ── General Arrangement — Elevation (single sheet, datasheet style) ────────
  const elev: DrawPrimitive[] = [];
  // sheet title block (top-left, like a drawing title strip)
  elev.push({ kind: 'text', x: 2, y: 0, str: `${rev.design_number} — ${String(rev.title ?? '').toUpperCase() || 'EXTRACTION COLUMN'}`, size: 8.5, bold: true, boxWidth: 155 });
  elev.push({ kind: 'text', x: 2, y: 11, str: 'VERTICAL PACKED LIQUID-LIQUID EXTRACTOR', size: 5.8, color: GRAY, boxWidth: 155 });
  elev.push({ kind: 'text', x: 2, y: 19, str: 'PRELIMINARY GA — SCREENING GEOMETRY', size: 5.8, color: GRAY, boxWidth: 155 });
  vesselOutline(elev);
  // supports (screening symbol only — support.selection rendered verbatim)
  const supportType = String(mv.support?.selection?.result ?? 'HOLD');
  elev.push({ kind: 'line', x1: cx - rPt - 12, y1: yBotTan + hdPt + 24, x2: cx + rPt + 12, y2: yBotTan + hdPt + 24, lineWidth: 1 });
  for (const sx of [cx - rPt + 2, cx + rPt - 2]) elev.push({ kind: 'line', x1: sx, y1: yBotTan + hdPt * 0.7, x2: sx, y2: yBotTan + hdPt + 24, lineWidth: 1 });
  elev.push({ kind: 'text', x: cx + rPt + 16, y: yBotTan + hdPt + 12, str: `Support: ${supportType} (screening selection — NO structural design)`, size: 6.5, color: GRAY, boxWidth: 180 });
  // nozzles — stubs drawn at true elevation; labels de-collided per side.
  // FAIL-CLOSED: unparseable or out-of-range (outside 0…T/T) elevations are
  // NOT drawn (and never clamped) — they are listed as HOLD on the drawing
  // and reported in the missing-data register.
  const holdNozzles: Array<{ tag: string; reason: string }> = [];
  const sideLabels: Array<{ right: boolean; yTrue: number; xEnd: number; str: string }> = [];
  let topHeadSlot = 0, botHeadSlot = 0;
  for (const n of nozzles) {
    const o = String(n.orientation ?? '');
    const isTopHead = /top head/i.test(o);
    const isBotHead = /bottom head/i.test(o);
    if (n.elevation_m == null) { holdNozzles.push({ tag: n.tag, reason: 'elevation not parseable from the frozen remarks — HOLD' }); continue; }
    if (!isTopHead && !isBotHead && (n.elevation_m < 0 || n.elevation_m > tt_m)) { holdNozzles.push({ tag: n.tag, reason: `elevation ${n.elevation_m.toFixed(2)} m outside 0…T/T (${f2(tt_m)} m) — HOLD, not clamped` }); continue; }
    const y = yEl(n.elevation_m);
    const stub = 14;
    if (isTopHead) {
      // sequential layout slots across the head — presentational only (angular
      // position on the head circumference is not a governed datum)
      const bx = cx - 20 + topHeadSlot * 40; topHeadSlot++;
      elev.push({ kind: 'line', x1: bx, y1: yTopTan - hdPt, x2: bx, y2: yTopTan - hdPt - stub, lineWidth: 1 });
      elev.push({ kind: 'line', x1: bx - 6, y1: yTopTan - hdPt - stub, x2: bx + 6, y2: yTopTan - hdPt - stub, lineWidth: 1.4 });
      elev.push({ kind: 'text', x: bx - 26, y: yTopTan - hdPt - stub - 9, str: n.tag, size: 6.5, bold: true });
    } else if (isBotHead) {
      const bx = cx - 20 + botHeadSlot * 40; botHeadSlot++;
      elev.push({ kind: 'line', x1: bx, y1: yBotTan + hdPt, x2: bx, y2: yBotTan + hdPt + stub, lineWidth: 1 });
      elev.push({ kind: 'line', x1: bx - 6, y1: yBotTan + hdPt + stub, x2: bx + 6, y2: yBotTan + hdPt + stub, lineWidth: 1.4 });
      elev.push({ kind: 'text', x: bx + 8, y: yBotTan + hdPt + stub - 4, str: n.tag, size: 6.5, bold: true });
    } else {
      // shell nozzle: a parseable numeric orientation is REQUIRED for elevation
      // placement — anything else is HOLD (never silently defaulted to a side)
      const am = /^(\d+(?:\.\d+)?)\s*°?$/.exec(o.trim());
      if (!am) { holdNozzles.push({ tag: n.tag, reason: `orientation "${o || '—'}" not parseable — HOLD, not drawn` }); continue; }
      const deg = Number(am[1]) % 360;
      // 0° → right solid; 180° → left solid; anything out-of-plane → dashed
      const right = deg < 90 || deg > 270;
      const dashed = deg !== 0 && deg !== 180 ? [2, 2] as [number, number] : undefined;
      const x1 = right ? cx + rPt : cx - rPt;
      const x2 = right ? cx + rPt + stub : cx - rPt - stub;
      elev.push({ kind: 'line', x1, y1: y, x2, y2: y, lineWidth: 1, dash: dashed });
      elev.push({ kind: 'line', x1: x2, y1: y - 5, x2, y2: y + 5, lineWidth: 1.4 });
      sideLabels.push({ right, yTrue: y, xEnd: x2, str: `${n.tag} (EL ${n.elevation_m.toFixed(2)})` });
    }
  }
  // Right-side nozzle labels: de-collide (sorted by elevation, 9 pt spacing),
  // displaced labels get a thin leader back to their stub.
  {
    const grp = sideLabels.filter(l => l.right).sort((a, b) => a.yTrue - b.yTrue);
    let lastY = -Infinity;
    for (const l of grp) {
      const ly = Math.max(l.yTrue - 3, lastY + 9);
      lastY = ly;
      if (Math.abs(ly - (l.yTrue - 3)) > 2) elev.push({ kind: 'line', x1: l.xEnd, y1: l.yTrue, x2: l.xEnd + 6, y2: ly + 3, color: GRAY, lineWidth: 0.4 });
      elev.push({ kind: 'text', x: l.xEnd + 8, y: ly, str: l.str, size: 6, boxWidth: 54 });
    }
  }
  // Internals drawn INSIDE the elevation (datasheet style, like the reference GA)
  const stackTops: Array<{ el: number; label: string }> = [];
  {
    let elCursor = 0;
    for (const l of stackComplete ? bottomUp : []) {
      const h = num(l)!;
      const y1 = yEl(elCursor + h), y2 = yEl(elCursor);
      const label = String(l.label);
      if (/packing bed/i.test(label)) {
        // shallow parallel hatch (full drawn width, 8 pt drop per line)
        for (let hy = y1 + 4; hy < y2 - 8; hy += 9) {
          elev.push({ kind: 'line', x1: cx - rPt + 3, y1: hy + 8, x2: cx + rPt - 3, y2: hy, color: HATCH, lineWidth: 0.5 });
        }
        elev.push({ kind: 'rect', x: cx - rPt + 1, y: y1, w: 2 * rPt - 2, h: y2 - y1, stroke: A, lineWidth: 0.8 });
        elev.push({ kind: 'text', x: cx - 3, y: (y1 + y2) / 2 + 34, str: `${label} (${f2(h)} m)`, size: 7, bold: true, rotate: -90, boxWidth: 90 });
      } else if (/hold-down|packing support/i.test(label)) {
        const ym = (y1 + y2) / 2;
        elev.push({ kind: 'line', x1: cx - rPt + 2, y1: ym, x2: cx + rPt - 2, y2: ym, lineWidth: 1.4 });
        for (let tx = -rPt + 4; tx < rPt - 2; tx += 6) elev.push({ kind: 'line', x1: cx + tx, y1: ym, x2: cx + tx + 3, y2: ym + (/hold/i.test(label) ? -4 : 4), lineWidth: 0.6 });
      } else if (/distributor/i.test(label)) {
        const ym = (y1 + y2) / 2;
        elev.push({ kind: 'line', x1: cx - rPt + 2, y1: ym, x2: cx + rPt - 2, y2: ym, lineWidth: 1 });
        for (let tx = -rPt + 6; tx < rPt - 4; tx += 9) elev.push({ kind: 'circle', cx: cx + tx, cy: ym + 3, r: 1.2, fill: A });
      }
      elCursor += h;
      stackTops.push({ el: elCursor, label });
    }
  }
  if (!stackComplete) {
    const why = stackTtMismatch
      ? `frozen ECP stack sum ${f2(stackSum)} m ≠ mech T/T ${f2(tt_m)} m — irreconcilable, nothing drawn`
      : 'frozen height breakdown incomplete (no invented elevations)';
    elev.push({ kind: 'text', x: cx - rPt - 6, y: (yTopTan + yBotTan) / 2 - 5, str: `INTERNALS STACK HOLD — ${why}`, size: 7.5, bold: true, color: DIM, align: 'right', boxWidth: 150 });
  }
  // Left EL ladder (reference-GA style): BTL, every internals boundary, and the
  // left/out-of-plane nozzles — one de-collided column with leader lines.
  {
    const entries: Array<{ el: number; str: string; noz: boolean; xTick: number }> = [
      { el: 0, str: 'EL +0.00 (BTL)', noz: false, xTick: cx - rPt },
      ...(stackComplete ? stackTops.filter(t => t.el <= tt_m + 1e-9).map(t => ({ el: t.el, str: `EL +${t.el.toFixed(2)} — T/${t.label}`, noz: false, xTick: cx - rPt })) : []),
      ...sideLabels.filter(l => !l.right).map(l => ({ el: (yBotTan - l.yTrue) / scale, str: l.str, noz: true, xTick: l.xEnd })),
    ].sort((a, b) => b.el - a.el); // top of drawing first (ascending y)
    let lastY = 33; // keep the ladder clear of the sheet title strip (top-left)
    for (const e of entries) {
      const yTrue = yEl(e.el);
      const ly = Math.max(yTrue - 3, lastY + 8);
      lastY = ly;
      elev.push({ kind: 'line', x1: 118, y1: ly + 3, x2: e.xTick, y2: yTrue, color: e.noz ? GRAY : HATCH, lineWidth: 0.4 });
      elev.push({ kind: 'text', x: 2, y: ly, str: e.str, size: e.noz ? 6 : 5.8, bold: e.noz, color: e.noz ? A : GRAY, align: 'right', boxWidth: 114 });
    }
  }
  // flow arrows: dispersed phase down, continuous phase up — from the frozen ECP phase configuration
  const flows = ecp.maximumCase?.flows ?? {};
  elev.push({ kind: 'path', d: `M ${cx - rPt / 2} ${yTopTan + 8} L ${cx - rPt / 2} ${yTopTan + 30} L ${cx - rPt / 2 - 3} ${yTopTan + 26} M ${cx - rPt / 2} ${yTopTan + 30} L ${cx - rPt / 2 + 3} ${yTopTan + 26}`, stroke: DIM, lineWidth: 1 });
  elev.push({ kind: 'text', x: cx + rPt + 8, y: yTopTan + 52, str: `${flows.dispersedPhase ?? 'HOLD'} (dispersed) DOWN`, size: 6, color: DIM, boxWidth: 90 });
  elev.push({ kind: 'path', d: `M ${cx + rPt / 2} ${yBotTan - 8} L ${cx + rPt / 2} ${yBotTan - 30} L ${cx + rPt / 2 - 3} ${yBotTan - 26} M ${cx + rPt / 2} ${yBotTan - 30} L ${cx + rPt / 2 + 3} ${yBotTan - 26}`, stroke: DIM, lineWidth: 1 });
  elev.push({ kind: 'text', x: cx + rPt / 2 + 6, y: yBotTan - 40, str: `${flows.continuousPhase ?? 'HOLD'} (continuous) UP`, size: 6, color: DIM, boxWidth: 90 });
  // dimension strings (right)
  dimString(elev, cx + rPt + 58, yTopTan, yBotTan, `T/T ${f2(tt_m)} m`);
  dimString(elev, cx + rPt + 88, yTopTan - hdPt, yBotTan + hdPt, `Overall ${f2(overall_m)} m *`);
  // bottom strip: HOLD list + bed summary left, stamp right
  holdNozzles.forEach((h, i) => elev.push({ kind: 'text', x: 2, y: DRAW_H + 4 + i * 9, str: `HOLD — ${h.tag}: ${h.reason}`, size: 6.5, color: DIM, boxWidth: 275 }));
  elev.push({ kind: 'text', x: 2, y: DRAW_H + 4 + holdNozzles.length * 9, str: `Beds: ${(beds.beds ?? []).map((b: any) => `#${b.bed} ${f2(b.height_m)} m`).join(', ') || 'HOLD'} — redistributors: ${beds.redistributors ?? 'HOLD'} — Basis: ${String(beds.basis ?? '—')}`, size: 6, color: GRAY, boxWidth: 300 });
  elev.push({ kind: 'text', x: 2, y: DRAW_H + 22 + holdNozzles.length * 9, str: `${idLabel} — drawn width exaggerated x${WIDTH_EXAG} for legibility`, size: 6, color: GRAY, boxWidth: 300 });
  elev.push({ kind: 'text', x: 2, y: DRAW_H + 31 + holdNozzles.length * 9, str: `* Overall height is the frozen value incl. screening head allowances; drawn head profile is geometric (see governance note).`, size: 6, color: GRAY, boxWidth: 300 });
  // ── Plan view (top) + typical packed-bed section (right half of the sheet) ─
  const plan: DrawPrimitive[] = [];
  {
    const pc = { x: 130, y: 150 }, R = 70;   // plan drawn at its own (larger) scale — noted in the caption
    plan.push({ kind: 'text', x: 2, y: 0, str: 'PLAN (TOP VIEW) — NOZZLE ORIENTATIONS', size: 7.5, bold: true, boxWidth: 220 });
    plan.push({ kind: 'circle', cx: pc.x, cy: pc.y, r: R, lineWidth: 1.2 });
    plan.push({ kind: 'circle', cx: pc.x, cy: pc.y, r: R * 0.94, stroke: GRAY, lineWidth: 0.4 });
    plan.push({ kind: 'line', x1: pc.x - R - 12, y1: pc.y, x2: pc.x + R + 12, y2: pc.y, color: GRAY, lineWidth: 0.4, dash: [6, 3] });
    plan.push({ kind: 'line', x1: pc.x, y1: pc.y - R - 12, x2: pc.x, y2: pc.y + R + 12, color: GRAY, lineWidth: 0.4, dash: [6, 3] });
    for (const [deg, lbl] of [[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']] as const) {
      const a = (deg - 90) * Math.PI / 180; // 0° at top, clockwise
      plan.push({ kind: 'text', x: pc.x + Math.cos(a) * (R + 16) - 8, y: pc.y + Math.sin(a) * (R + 16) - 3, str: lbl, size: 6, color: GRAY, boxWidth: 20 });
    }
    // group shell nozzles by entered orientation angle (only numeric angles are drawable)
    const byAngle = new Map<number, string[]>();
    const headTags: string[] = [];
    const planHold: string[] = [];
    for (const n of nozzles) {
      const o = String(n.orientation ?? '');
      if (/top head|bottom head/i.test(o)) { headTags.push(`${n.tag} (${o.toLowerCase()})`); continue; }
      const m = /^(\d+(?:\.\d+)?)\s*°?$/.exec(o.trim());
      if (!m) { planHold.push(n.tag); continue; }
      const deg = Number(m[1]) % 360;
      byAngle.set(deg, [...(byAngle.get(deg) ?? []), n.tag]);
    }
    for (const [deg, tags] of Array.from(byAngle.entries()).sort((a, b) => a[0] - b[0])) {
      const a = (deg - 90) * Math.PI / 180;
      const x1 = pc.x + Math.cos(a) * (R - 4), y1 = pc.y + Math.sin(a) * (R - 4);
      const x2 = pc.x + Math.cos(a) * (R + 10), y2 = pc.y + Math.sin(a) * (R + 10);
      plan.push({ kind: 'line', x1, y1, x2, y2, lineWidth: 1.2 });
      plan.push({ kind: 'circle', cx: x2, cy: y2, r: 2, fill: A });
      const lx = pc.x + Math.cos(a) * (R + 26), ly2 = pc.y + Math.sin(a) * (R + 26);
      const rightSide = Math.cos(a) > 0.01, leftSide = Math.cos(a) < -0.01;
      plan.push({ kind: 'text', x: rightSide ? lx : leftSide ? lx - 78 : lx - 39, y: ly2 - 3, str: tags.join(' / '), size: 6.5, bold: true, align: rightSide ? 'left' : leftSide ? 'right' : 'center', boxWidth: 78 });
    }
    plan.push({ kind: 'text', x: 2, y: pc.y + R + 26, str: `On heads (not on shell): ${headTags.join(', ') || '—'}`, size: 6, color: GRAY, boxWidth: 230 });
    if (planHold.length) plan.push({ kind: 'text', x: 2, y: pc.y + R + 36, str: `HOLD — orientation not parseable: ${planHold.join(', ')}`, size: 6, color: DIM, boxWidth: 230 });
    plan.push({ kind: 'text', x: 2, y: pc.y + R + 46, str: 'Angular datum: angles as entered at Stage 9 (0° drawn at top, clockwise). Absolute plant-North orientation: HOLD.', size: 5.8, color: GRAY, boxWidth: 230 });

    // typical section through packed bed (schematic detail — labels only, NO dimensions)
    const dx1 = 255, dx2 = 345, dTop = 26, dBot = 268;
    plan.push({ kind: 'text', x: dx1 - 20, y: 0, str: 'TYPICAL SECTION THROUGH PACKED BED (SCHEMATIC)', size: 7.5, bold: true, boxWidth: 200 });
    plan.push({ kind: 'line', x1: dx1, y1: dTop, x2: dx1, y2: dBot, lineWidth: 1.2 });
    plan.push({ kind: 'line', x1: dx2, y1: dTop, x2: dx2, y2: dBot, lineWidth: 1.2 });
    const lblDetail = (y: number, s: string) => { plan.push({ kind: 'line', x1: dx2, y1: y, x2: dx2 + 8, y2: y, color: GRAY, lineWidth: 0.4 }); plan.push({ kind: 'text', x: dx2 + 10, y: y - 3, str: s, size: 6, color: GRAY, boxWidth: 75 }); };
    // distributor
    plan.push({ kind: 'line', x1: dx1 + 4, y1: 48, x2: dx2 - 4, y2: 48, lineWidth: 1 });
    for (let tx = dx1 + 10; tx < dx2 - 8; tx += 12) plan.push({ kind: 'circle', cx: tx, cy: 52, r: 1.5, fill: A });
    lblDetail(48, 'Liquid distributor');
    // hold-down
    plan.push({ kind: 'line', x1: dx1 + 4, y1: 84, x2: dx2 - 4, y2: 84, lineWidth: 1.4 });
    for (let tx = dx1 + 8; tx < dx2 - 6; tx += 8) plan.push({ kind: 'line', x1: tx, y1: 84, x2: tx + 4, y2: 79, lineWidth: 0.6 });
    lblDetail(84, 'Hold-down plate');
    // packing
    for (let hy = 92; hy < 212; hy += 9) plan.push({ kind: 'line', x1: dx1 + 4, y1: hy + 8, x2: dx2 - 4, y2: hy, color: HATCH, lineWidth: 0.5 });
    plan.push({ kind: 'rect', x: dx1 + 3, y: 88, w: dx2 - dx1 - 6, h: 128, stroke: A, lineWidth: 0.8 });
    lblDetail(150, 'Random/structured packing (per frozen packing basis)');
    // support plate
    plan.push({ kind: 'line', x1: dx1 + 4, y1: 222, x2: dx2 - 4, y2: 222, lineWidth: 1.4 });
    for (let tx = dx1 + 8; tx < dx2 - 6; tx += 8) plan.push({ kind: 'line', x1: tx, y1: 222, x2: tx + 4, y2: 227, lineWidth: 0.6 });
    lblDetail(222, 'Packing support plate');
    // bottom distributor
    plan.push({ kind: 'line', x1: dx1 + 4, y1: 250, x2: dx2 - 4, y2: 250, lineWidth: 1 });
    for (let tx = dx1 + 10; tx < dx2 - 8; tx += 12) plan.push({ kind: 'circle', cx: tx, cy: 254, r: 1.5, fill: A });
    lblDetail(250, 'Bottom distributor');
  }

  // ── Assemble the single landscape GA drawing sheet ─────────────────────────
  // (sheet border + elevation left + plan/typical-section right + title block)
  const translate = (prims: DrawPrimitive[], dx: number, dy: number): DrawPrimitive[] => prims.map((p) => {
    switch (p.kind) {
      case 'line': return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
      case 'rect': return { ...p, x: p.x + dx, y: p.y + dy };
      case 'circle': return { ...p, cx: p.cx + dx, cy: p.cy + dy };
      case 'text': return { ...p, x: p.x + dx, y: p.y + dy };
      case 'path': {
        // our path strings are strictly "M x y L x y ..." — numeric tokens alternate x,y
        let isX = true;
        const d = p.d.replace(/-?\d+(?:\.\d+)?/g, (t) => { const v = Number(t) + (isX ? dx : dy); isX = !isX; return String(Math.round(v * 100) / 100); });
        return { ...p, d };
      }
      default: return p;
    }
  });
  const SHEET_W = 778, SHEET_H = 468;
  const sheet: DrawPrimitive[] = [
    { kind: 'rect', x: 0, y: 0, w: SHEET_W, h: SHEET_H, lineWidth: 1.4 },
    { kind: 'rect', x: 3, y: 3, w: SHEET_W - 6, h: SHEET_H - 6, lineWidth: 0.5, stroke: GRAY },
    ...translate(elev, 14, 4),
    { kind: 'line', x1: 348, y1: 8, x2: 348, y2: 380, color: GRAY, lineWidth: 0.4, dash: [4, 3] },
    ...translate(plan, 355, 8),
  ];
  // title block (drafting style, bottom-right)
  {
    const tbX = 452, tbY = 384, tbW = 320, tbH = 78;
    sheet.push({ kind: 'rect', x: tbX, y: tbY, w: tbW, h: tbH, lineWidth: 1.2 });
    sheet.push({ kind: 'line', x1: tbX, y1: tbY + 16, x2: tbX + tbW, y2: tbY + 16, lineWidth: 0.6 });
    sheet.push({ kind: 'line', x1: tbX, y1: tbY + 30, x2: tbX + tbW, y2: tbY + 30, lineWidth: 0.6 });
    sheet.push({ kind: 'line', x1: tbX, y1: tbY + 44, x2: tbX + tbW, y2: tbY + 44, lineWidth: 0.6 });
    sheet.push({ kind: 'line', x1: tbX + 200, y1: tbY + 30, x2: tbX + 200, y2: tbY + 44, lineWidth: 0.6 });
    sheet.push({ kind: 'text', x: tbX + 4, y: tbY + 4, str: 'THERMOPAC ENGINEERING — PRELIMINARY GENERAL ARRANGEMENT', size: 7, bold: true, boxWidth: tbW - 8 });
    sheet.push({ kind: 'text', x: tbX + 4, y: tbY + 19, str: `${rev.design_number} — ${String(rev.title ?? '')}`, size: 7.5, bold: true, boxWidth: tbW - 8 });
    sheet.push({ kind: 'text', x: tbX + 4, y: tbY + 33, str: `Rev ${rev.revision_number ?? 0} · Vertical: true scale · Drawn width: exaggerated x${WIDTH_EXAG}`, size: 6, boxWidth: 192 });
    sheet.push({ kind: 'text', x: tbX + 204, y: tbY + 33, str: 'Sheet 1 of 1 · A4 landscape', size: 6, boxWidth: tbW - 208 });
    sheet.push({ kind: 'text', x: tbX + 4, y: tbY + 48, str: 'Automatically generated from frozen calculation snapshot — pending mechanical detail design.', size: 6, color: GRAY, boxWidth: tbW - 8 });
    sheet.push({ kind: 'text', x: tbX + 4, y: tbY + 58, str: 'PRELIMINARY — NOT FOR FABRICATION', size: 9, bold: true, color: DIM, boxWidth: tbW - 8 });
  }

  // ── Design & Operating Data (datasheet block, reference-GA style) ──────────
  const dc = mv.mechanicalDatasheet?.designConditions ?? {};
  const wt = mv.mechanicalDatasheet?.weights ?? {};
  const dv = (v: any) => (v == null ? 'HOLD' : String(v));
  const mvSrc = `Frozen mech-vessel snapshot — run #${mvRun.id}`;
  const ecpSrc = `Frozen llx-ecp snapshot — run #${ecpRun.id}`;
  const designDataRows = [
    { label: 'Equipment designation', value: `${rev.design_number} — ${rev.title ?? ''}`, unit: '', sourceType: 'Design identity', sourceRef: 'Design register' },
    { label: 'Selected technology', value: String(sel.selectedTechnology ?? 'HOLD'), unit: '', sourceType: sel.selectedTechnology != null ? 'Technology selection (frozen DS-SEL record, verbatim)' : 'Not Entered', sourceRef: sel.selectedTechnology != null ? 'DS-SEL selectedTechnology field' : 'No non-superseded DS-SEL record found' },
    { label: 'Dispersed phase (flows DOWN)', value: dv(flows.dispersedPhase), unit: '', sourceType: 'Frozen ECP phase configuration', sourceRef: ecpSrc },
    { label: 'Continuous phase (flows UP)', value: dv(flows.continuousPhase), unit: '', sourceType: 'Frozen ECP phase configuration', sourceRef: ecpSrc },
    { label: 'Shell inside diameter', value: `${(id_m * 1000).toFixed(0)}${diaMatch ? '' : ' (governance label HOLD)'}`, unit: 'mm', sourceType: classifyTaggedSource(geo.insideDiameter?.source), sourceRef: String(geo.insideDiameter?.source ?? '—') },
    { label: 'T/T length', value: f2(tt_m), unit: 'm', sourceType: classifyTaggedSource(geo.tangentToTangentHeight?.source), sourceRef: String(geo.tangentToTangentHeight?.source ?? '—') },
    { label: 'Overall height', value: f2(overall_m), unit: 'm', sourceType: classifyTaggedSource(geo.overallVesselHeight?.source), sourceRef: String(geo.overallVesselHeight?.source ?? '—') },
    { label: 'Head type / depth', value: `${headType} / ${f3(headDepth_m)} m`, unit: '', sourceType: classifyTaggedSource(geo.headDepth?.source), sourceRef: String(geo.headDepth?.source ?? '—') },
    { label: 'Total packed height', value: f2(num(ecp.packingHeight?.totalPackingHeight ?? ecp.packingHeight)), unit: 'm', sourceType: 'Calculated Screening Result', sourceRef: 'ECP-005 — ' + ecpSrc },
    { label: 'Number of beds / redistributors', value: `${(beds.beds ?? []).length || 'HOLD'} / ${beds.redistributors ?? 'HOLD'}`, unit: '', sourceType: 'Calculated Screening Result', sourceRef: 'ECP-006 — ' + ecpSrc },
    { label: 'Design pressure', value: dv(dc.designPressure_barg), unit: 'barg', sourceType: 'Engineer Entry', sourceRef: mvSrc },
    { label: 'Design temperature', value: dv(dc.designTemperature_C), unit: '°C', sourceType: 'Engineer Entry', sourceRef: mvSrc },
    { label: 'Operating pressure', value: dv(dc.operatingPressure_barg), unit: 'barg', sourceType: 'Engineer Entry', sourceRef: mvSrc },
    { label: 'Operating temperature', value: dv(dc.operatingTemperature_C), unit: '°C', sourceType: 'Engineer Entry', sourceRef: mvSrc },
    { label: 'Design code / joint efficiency', value: `${dv(dc.designCode)} / ${dv(dc.jointEfficiency)}`, unit: '', sourceType: 'Engineer Entry', sourceRef: mvSrc },
    { label: 'Shell thickness (selected)', value: f2(num(mv.shellDesign?.shellThicknessSelected)), unit: 'mm', sourceType: classifyTaggedSource(mv.shellDesign?.shellThicknessSelected?.source), sourceRef: String(mv.shellDesign?.shellThicknessSelected?.source ?? '—') },
    { label: 'Weight — empty / operating / hydrotest', value: `${f2(wt.empty_kg ?? null)} / ${f2(wt.operating_kg ?? null)} / ${f2(wt.hydrotest_kg ?? null)}`, unit: 'kg', sourceType: 'Calculated Screening Result', sourceRef: mvSrc },
    { label: 'Support', value: `${supportType} (screening selection — NO structural design)`, unit: '', sourceType: classifyTaggedSource(mv.support?.selection?.source), sourceRef: String(mv.support?.selection?.source ?? '—') },
    { label: 'Materials of construction', value: 'HOLD', unit: '', sourceType: 'Not Entered', sourceRef: 'No governed MOC datum in the frozen snapshots — mechanical detail design scope' },
    { label: 'Radiography / PWHT / corrosion allowance detail', value: 'HOLD', unit: '', sourceType: 'Not Entered', sourceRef: 'Mechanical detail design scope — deliberately excluded' },
  ];

  // ── Nozzle schedule ─────────────────────────────────────────────────────────
  const nozzleTable: string[][] = [
    ['Tag', 'Size (DN)', 'Rating', 'Facing', 'Elevation (m, from BTL)', 'Orientation', 'Service'],
    ...nozzles.map(n => [n.tag, n.dn != null ? String(n.dn) : 'HOLD', n.rating, n.facing, n.elevation_m != null ? n.elevation_m.toFixed(2) : 'HOLD', n.orientation ?? 'HOLD', n.service]),
  ];

  // ── Dimension table ─────────────────────────────────────────────────────────
  const cum: Array<[string, string, string]> = [];
  if (stackComplete) {
    let c = 0;
    for (const l of bottomUp) { cum.push([String(l.label), c.toFixed(2), String(l.source ?? '—')]); c += num(l)!; }
  }
  const dimTable: string[][] = [
    ['Item', 'Value', 'Source (cited verbatim from the frozen snapshot)'],
    [diaMatch ? 'Shell ID (EFFECTIVE GOVERNING diameter, DS-SEL-006)' : 'Shell ID (governance label HOLD — see missing-data register)', `${(id_m * 1000).toFixed(0)} mm`, String(geo.insideDiameter?.source ?? '—')],
    ['T/T length', `${f2(tt_m)} m`, String(geo.tangentToTangentHeight?.source ?? geo.straightShellLength?.source ?? '—')],
    ['Overall height', `${f2(overall_m)} m`, String(geo.overallVesselHeight?.source ?? '—')],
    ['Head type / head depth', `${headType} / ${f3(headDepth_m)} m`, String(geo.headDepth?.source ?? '—')],
    ['Packing height (total)', `${f2(num(ecp.packingHeight?.totalPackingHeight ?? ecp.packingHeight))} m`, 'ECP-005 (frozen ECP snapshot)'],
    ...(stackComplete
      ? cum.map(([label, el, src]) => [`${label} — elevation above BTL (bottom of segment)`, `${el} m`, src] as string[])
      : [['Internals stack elevations', 'HOLD', 'Frozen ECP height breakdown incomplete — elevations cannot be positioned without invention'] as string[]]),
    ['Support elevation (u/s baseplate)', 'HOLD', 'No governed support elevation datum — support is a screening selection with NO structural design (MEC-007)'],
  ];

  const sections: ReportSection[] = [
    { title: 'Governance & Basis of This Drawing', paragraphs: [
      `${STAMP_LINES.join(' — ')}.`,
      `This Preliminary General Arrangement is generated automatically and exclusively from frozen calculation snapshots: mech-vessel run #${mvRun?.id ?? '—'} (v${mvRes.engine_version ?? '—'}) and ECP run #${ecpRun?.id ?? '—'} (v${ecpRes.engine_version ?? '—'}), with the effective governing diameter from the DS-SEL record. No engine was re-run and no dimension was invented; every value inherits the maturity of its source (most internals elevations are Thermopac Preliminary Screening Defaults — Pending Vendor Validation). Items without a governed datum are marked HOLD.`,
      `Deliberately excluded (mechanical detail design scope — drawing them from assumptions would contradict the Not-for-Fabrication stamp): nozzle projections/reinforcement pads, support structural detail, weld geometry, internals attachment detail, ladder/platform arrangement.`,
      `Note on head allowances: the sectional internals stack uses the process screening head allowances of the frozen ECP height breakdown (0.50 m per head, Assumed), while the drawn head profile uses the geometric ${headType} head depth ${f3(headDepth_m)} m from the frozen mech-vessel geometry (MEC-002). Both values are rendered verbatim from their respective frozen snapshots; reconciliation is a mechanical detail-design action.`,
    ]},
    { title: 'Design & Operating Data', intro: 'Datasheet block rendered from the frozen snapshots (numeric display formatting only — no recalculation); source strings cited verbatim. HOLD = no governed datum exists.', rows: designDataRows },
    { title: 'General Arrangement — Drawing Sheet', drawing: { heightPt: SHEET_H + 4, landscape: true, primitives: sheet, caption: `Elevation: vertical axis TRUE SCALE, drawn width exaggerated x${WIDTH_EXAG} for internals legibility (all dimension VALUES are frozen snapshot values). Internals stacked verbatim from the frozen ECP height breakdown (ECP-008); hatched = packed bed, toothed = support (up)/hold-down (down), perforated = distributors. Ladder elevations from BTL as entered at Stage 9 (frozen); out-of-plane nozzles dashed. Plan view at its own scale; angular datum as entered (plant-North HOLD). Typical packed-bed section is a SCHEMATIC key only — no dimensions. Support symbol schematic only.` } },
    { title: 'Nozzle Schedule', intro: 'Verbatim from the frozen mech-vessel nozzle schedule (MEC-006). Elevations/orientations as entered at Stage 9; sizes are Assumed — Pending Validation; no reinforcement calculation has been performed.', table: nozzleTable },
    { title: 'Internal Layout & Size Summary', intro: 'Values are rendered from frozen snapshot data (numeric display formatting only — no recalculation); source strings are cited verbatim. BTL = bottom tangent line. HOLD = no governed datum exists (never defaulted, never clamped).', table: dimTable },
  ];

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'PGA', docTypeTitle: 'Preliminary General Arrangement (Auto-Generated)',
    docNumber: `${rev.design_number}-PGA`, reportRev: `Rev ${rev.revision_number}`,
    designNumber: rev.design_number, designTitle: rev.title ?? '',
    designType: rev.design_type === 'rnd' ? 'R&D / Independent Design' : 'Project Design',
    module: 'Liquid-Liquid Extraction', revisionLabel: `Rev ${rev.revision_number}`, revisionLifecycle: lifecycle,
    client: di.client, plantLocation: di.plant_location,
    preparedBy: di.prepared_by, checkedBy: di.checked_by, approvedBy: di.approved_by,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC', generatedByName,
    traceability: {
      revisionId,
      runs: [
        { engine: mvRun?.engine_name ?? 'mech-vessel', version: String(mvRes.engine_version ?? '—'), runId: mvRun?.id ?? null },
        { engine: ecpRun?.engine_name ?? 'llx-ecp', version: String(ecpRes.engine_version ?? '—'), runId: ecpRun?.id ?? null },
      ],
      note: 'Preliminary GA drawn programmatically from frozen snapshots only — no engine re-run, no invented dimension. Not a fabrication document.',
    },
    sections,
    assumptions: [
      { item: 'Internals elevations (disengagement spaces, distributor/support/hold-down allowances)', value: 'per height breakdown', sourceRef: 'Thermopac Preliminary Equipment Screening Default v1.0 (frozen ECP snapshot)', status: 'Pending Vendor Validation' },
      { item: 'Nozzle sizes, elevations and orientations', value: `${nozzles.length} nozzles`, sourceRef: 'Stage 9 nozzle schedule entries (Assumed) — frozen mech-vessel snapshot', status: 'Pending Validation — no reinforcement calculation performed' },
    ],
    missingData: [
      { item: 'Support elevation / structural detail', reason: 'Support is a screening selection (MEC-007) with no structural design — shown schematically, elevation HOLD.', severity: 'warning' },
      { item: 'Nozzle projections & reinforcement', reason: 'Future code method — deliberately excluded from this preliminary GA.', severity: 'warning' },
      ...holdNozzles.map(h => ({ item: `Nozzle ${h.tag} position`, reason: h.reason, severity: 'warning' as const })),
      ...(stackTtMismatch ? [{ item: 'Internals stack ↔ shell reconciliation', reason: `Frozen ECP non-head stack sum ${f2(stackSum)} m does not equal frozen mech T/T ${f2(tt_m)} m — internals stack rendered HOLD (nothing drawn at an invented elevation).`, severity: 'error' as const }] : []),
      ...(diaMatch ? [] : [{ item: 'DS-SEL governance label on shell ID', reason: effDia_mm != null ? `Frozen mech ID ${(id_m * 1000).toFixed(0)} mm does not equal the DS-SEL effective governing diameter ${effDia_mm} mm — label HOLD; the drawn diameter is the frozen mech geometry, nothing was substituted.` : 'No non-superseded DS-SEL record found — governance label HOLD.', severity: 'error' as const }]),
      ...(stackComplete ? [] : [{ item: 'Internals stack', reason: 'Frozen ECP height breakdown has lines without finite heights — stack rendered as HOLD (no invented elevations).', severity: 'error' as const }]),
    ],
    references: [
      'Frozen mech-vessel result snapshot (geometry, nozzle schedule, support, design conditions, weights)',
      'Frozen llx-ecp result snapshot (height breakdown ECP-008, bed arrangement ECP-006, packing height ECP-005)',
      'DS-SEL design selection record (effective governing diameter, DS-SEL-006)',
    ],
    revisionHistory: [],
    watermark: ['approved', 'issued'].includes(lifecycle) ? undefined : 'PRELIMINARY GA — NOT FOR FABRICATION',
  };
  return { payload, blocking: 0 };
}
