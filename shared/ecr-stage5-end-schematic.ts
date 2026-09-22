import type { EndSectionResult } from "./ecr-stage5-end-sections";

/** Diameter-relative widths only. Axial positions and formed profiles are symbolic,
 * never a claim about unknown residence/neck/head lengths or mechanical radii. */
export function renderEndSchematic(result: EndSectionResult & { sourceHash?: string }): string {
  const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const profile = (end: "top" | "bottom") => {
    const g = result.assemblies[end];
    const cx = 190, neckHalf = .7 * 210 / 2, shellHalf = g.diameterM * 210 / 2;
    const direction = end === "top" ? -1 : 1;
    const y = (outward: number) => (end === "top" ? 710 : 170) + direction * outward;
    const left = cx - shellHalf, right = cx + shellHalf;
    const line = (x1: number, u1: number, x2: number, u2: number, extra = "") =>
      `<line x1="${x1}" y1="${y(u1)}" x2="${x2}" y2="${y(u2)}" ${extra}/>`;
    const label = (u: number, text: string, second?: string) =>
      `<text x="380" y="${y(u) - (second ? 5 : 0)}" font-size="13">${escape(text)}${second ? `<tspan x="380" dy="17">${escape(second)}</tspan>` : ""}</text>`;
    const leader = (u: number, from = right) =>
      line(from, u, 370, u, 'stroke="#94a3b8" stroke-width="1"');
    const bracket = (u1: number, u2: number, x: number) =>
      `${line(x, u1, x, u2)}${line(x - 5, u1, x + 5, u1)}${line(x - 5, u2, x + 5, u2)}`;
    // Smooth shoulders indicate formed junctions only. No radius, angle or axial
    // scale can be measured from these Bézier paths.
    const transition = [-1, 1].map(side => {
      const n = cx + side * neckHalf, s = cx + side * shellHalf;
      return `<path d="M ${n} ${y(65)} C ${n} ${y(78)},${n} ${y(78)},${n + side * (shellHalf - neckHalf) * .18} ${y(85)}
        L ${s - side * (shellHalf - neckHalf) * .18} ${y(115)}
        C ${s} ${y(122)},${s} ${y(125)},${s} ${y(135)}"/>`;
    }).join("");
    const head = `M ${left} ${y(455)}
      C ${left} ${y(485)},${cx - shellHalf * .8} ${y(502)},${cx} ${y(508)}
      C ${cx + shellHalf * .8} ${y(502)},${right} ${y(485)},${right} ${y(455)}`;
    return `<g data-end-profile="${end}" data-shell-width="${shellHalf * 2}" data-neck-width="${neckHalf * 2}" transform="translate(${end === "top" ? 0 : 770},0)">
      <text x="24" y="105" font-size="19" font-weight="bold">${end.toUpperCase()} — Ø${g.diameterM * 1000} mm comparison</text>
      <g fill="none" stroke="#334155" stroke-width="2">
        <rect data-part="frozen-active-reference" x="${cx - neckHalf}" y="${Math.min(y(-55), y(0))}" width="${neckHalf * 2}" height="55" stroke-dasharray="7 5" fill="#f1f5f9"/>
        ${line(cx - neckHalf - 10, 0, cx + neckHalf + 10, 0, 'stroke-dasharray="5 4"')}
        <g data-part="additional-feed-neck">${line(cx - neckHalf, 0, cx - neckHalf, 24)}${line(cx - neckHalf, 40, cx - neckHalf, 65)}${line(cx + neckHalf, 0, cx + neckHalf, 65)}</g>
        <g data-part="symbolic-knuckled-transition">${transition}</g>
        <rect data-part="normal-residence-region" x="${left}" y="${Math.min(y(170), y(355))}" width="${shellHalf * 2}" height="185" fill="#fef3c7" stroke="none"/>
        <g data-part="straight-shell">
          ${line(left, 135, left, 455)}${line(right, 135, right, 355)}${line(right, 375, right, 455)}
        </g>
        <path data-part="symbolic-torispherical-head" d="${head}" fill="#eff6ff"/>
        ${line(left, 455, right, 455, 'stroke-dasharray="4 4" stroke-width="1"')}
        <g data-part="interface" stroke="#0891b2" stroke-dasharray="8 4">${line(left, 170, right, 170)}</g>
        <g data-part="unknown-height-break" stroke="#b45309" stroke-width="2">
          <path d="M ${left - 6} ${y(265)} l 12 ${direction * -7} l -12 ${direction * -7} l 12 ${direction * -7}"/>
          <path d="M ${right - 6} ${y(265)} l 12 ${direction * -7} l -12 ${direction * -7} l 12 ${direction * -7}"/>
        </g>
        <g data-part="feed-nozzle" stroke="#0369a1">
          ${line(cx - neckHalf, 24, 34, 24)}${line(cx - neckHalf, 40, 34, 40)}${line(34, 19, 34, 45)}
          ${line(40, 32, cx - neckHalf - 10, 32)}
          <path d="M ${cx - neckHalf - 20} ${y(27)} L ${cx - neckHalf - 10} ${y(32)} L ${cx - neckHalf - 20} ${y(37)}"/>
        </g>
        <g data-part="product-nozzle" stroke="#0369a1">
          ${line(right, 355, right + 42, 355, 'data-edge="near"')}${line(right, 375, right + 42, 375, 'data-edge="far"')}
          ${line(right + 42, 350, right + 42, 380)}
          ${line(right + 8, 365, right + 35, 365)}
          <path d="M ${right + 27} ${y(360)} L ${right + 35} ${y(365)} L ${right + 27} ${y(370)}"/>
        </g>
        <g data-part="residence-dimension" stroke="#b45309">${bracket(170, 355, cx - 12)}</g>
        <g data-part="interface-offset-dimension" stroke="#0891b2">${bracket(135, 170, right + 13)}</g>
        <g data-part="post-opening-dimension">${bracket(375, 455, right + 13)}</g>
        <g data-part="diameter-dimension" stroke="#64748b">
          ${line(left, 205, right, 205)}${line(left, 200, left, 210)}${line(right, 200, right, 210)}
        </g>
      </g>
      <text x="${cx}" y="${y(205) - 6}" font-size="12" text-anchor="middle">ID ${g.diameterM * 1000} mm</text>
      <text x="${cx + 5}" y="${y(285)}" font-size="13" fill="#92400e">${g.residenceHeightM === null ? "H10 TBD" : `H10 ${g.residenceHeightM.toFixed(3)} m`}</text>
      <text x="${left + 8}" y="${y(355) - direction * 6}" font-size="11" fill="#0369a1">near edge</text>
      <text x="${left + 8}" y="${y(375) + direction * 14}" font-size="11" fill="#0369a1">far edge</text>
      <g fill="#0f172a">
        ${leader(-25, cx + neckHalf)}${label(-25, "FROZEN ACTIVE BOUNDARY — UNCHANGED", "Dashed Ø700 active reference; not resized")}
        ${leader(32, cx + neckHalf)}${label(32, "Additional Ø700 feed/distribution neck", `${end === "top" ? "Wet solvent P03" : "Oil feed P01"} inlet; extra neck length TBD`)}
        ${leader(100)}${label(100, `30° knuckled transition ≥${(g.transitionMinimumM * 1000).toFixed(0)} mm`, "Conical portion; physical length / radii TBD")}
        ${leader(153, right + 13)}${label(153, `Interface 150 mm ${end === "top" ? "above" : "below"} transition`)}
        ${leader(285)}${label(285, g.residenceHeightM === null ? "H10 — PENDING NORMAL PRODUCT AUTHORITY" : `Normal Q ${g.normalProductM3H!.toFixed(3)} m³/h → H10 ${g.residenceHeightM.toFixed(3)} m`, "10 min / 0.90 usable straight volume only")}
        ${leader(365, right + 42)}${label(365, end === "top" ? "Raffinate P04 product opening" : "Extract P02 product opening", "Near edge → envelope TBD → far edge")}
        ${leader(416, right + 13)}${label(416, `Post-opening straight ≥${(g.postOpeningExtensionM * 1000).toFixed(0)} mm`, "Begins at far outer edge; no residence credit")}
        ${leader(485, cx + shellHalf * .85)}${label(485, "Torispherical head — symbolic profile", "Depth / crown / knuckle radii TBD; zero credit")}
      </g>
    </g>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1540 885" role="img" aria-label="Conditional top and bottom vessel profiles, not to scale; widths reflect selected diameters, unknown axial lengths symbolic">
  <title>Conditional top and bottom disengagement vessel profiles — NOT TO SCALE</title>
  <desc>Top assembly rises from a dashed frozen active reference; bottom assembly is mirrored downwards. Each includes an additional 700 mm feed neck and feed nozzle, symbolic knuckled expansion, straight shell, 150 mm interface offset, interrupted H10 residence region governed exclusively by source-qualified normal product flow, product nozzle with near and far opening edges, post-opening extension, and symbolic torispherical head. Horizontal shell widths reflect selected diameters. Vertical lengths, nozzle sizes, 30 degree conical angle and head or knuckle profiles are not drawn to engineering scale. Residence ends at the near edge; post-extension starts at the far edge. Mechanical radii and total assembly heights remain unqualified. Fixed S/O 1.5 mass is for nozzle sizing only and must not alter normal flows or geometry.</desc>
  <metadata>${escape(JSON.stringify({ ruleset: result.ruleset, sourceHash: result.sourceHash ?? null, status: result.status,
    topDiameterM: result.assemblies.top.diameterM, bottomDiameterM: result.assemblies.bottom.diameterM }))}</metadata>
  <rect width="1540" height="885" fill="white"/><g font-family="Arial,sans-serif" fill="#0f172a">
  <text x="20" y="28" font-size="20" font-weight="bold">PROVISIONAL — NOT TO SCALE — NO FABRICATION / SEPARATION CLAIM</text>
  <text x="20" y="49" font-size="13">NORMAL process S/O=${result.feed.solventOilMassRatio} mass | 10 min normal product flow | 0.90 usable volume | S/O=1.5 MASS FOR NOZZLES ONLY</text>
  <text x="20" y="70" font-size="13">Diameter-relative widths only. All axial spacing, nozzle envelopes, head curves and knuckles are symbolic — no dimensions may be measured.</text>
  ${profile("top")}${profile("bottom")}
  <text x="20" y="800" font-size="14">Read top upwards and bottom downwards from the dashed active boundary. Amber zone is the sole residence-credit region.</text>
  <text x="20" y="826" font-size="14">Residence stops at opening near edge; post-extension begins at far outer edge. Cone/head/nozzle band get zero credit.</text>
  <text x="20" y="852" font-size="14">Ø700 comparison has no expansion: rule exception required. Knuckles, heads, ASME and total heights remain TBD.</text>
  </g></svg>`;
}