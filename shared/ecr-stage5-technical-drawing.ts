/** Presentation primitives only. Coordinates are sheet units; dimensions are SI inputs. */
export const escapeDrawingText = (value: unknown) => String(value ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
export const drawingMm = (metres: number) => Number((metres * 1000).toFixed(3)).toLocaleString("en-US", { maximumFractionDigits: 3, useGrouping: false });
export interface Stage5DrawingContext {
  projectName?: string;
  designId?: string | number;
  revision?: string | number;
  date?: string;
}

export class TechnicalSheet {
  parts: string[] = [];
  constructor(readonly title: string, readonly width = 1200, readonly height = 1000) {}
  text(x: number, y: number, text: unknown, size = 16, anchor = "start", extra = "") {
    this.parts.push(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" ${extra}>${escapeDrawingText(text)}</text>`);
  }
  line(x1: number, y1: number, x2: number, y2: number, cls = "object") {
    this.parts.push(`<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  }
  rect(x: number, y: number, width: number, height: number, tag = "", fill = "none") {
    this.parts.push(`<rect class="object" data-component="${escapeDrawingText(tag)}" x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`);
  }
  circle(x: number, y: number, r: number, cls = "object") {
    this.parts.push(`<circle class="${cls}" cx="${x}" cy="${y}" r="${r}" fill="none"/>`);
  }
  path(path: string, tag = "", fill = "none") {
    this.parts.push(`<path class="object" data-component="${escapeDrawingText(tag)}" d="${path}" fill="${fill}"/>`);
  }
  centerline(x1: number, y1: number, x2: number, y2: number) { this.line(x1, y1, x2, y2, "centerline"); }
  dimensionH(x1: number, x2: number, featureY: number, y: number, label: string) {
    this.parts.push(`<g data-dimension="${escapeDrawingText(label)}">`);
    this.line(x1, featureY, x1, y + 8, "extension"); this.line(x2, featureY, x2, y + 8, "extension");
    this.parts.push(`<path class="dimension" d="M${x1},${y} H${x2}" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"/>`);
    this.text((x1 + x2) / 2, y - 9, label, 16, "middle", 'class="dimension-label"');
    this.parts.push("</g>");
  }
  dimensionV(y1: number, y2: number, featureX: number, x: number, label: string) {
    const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
    this.parts.push(`<g data-dimension="${escapeDrawingText(label)}">`);
    this.line(featureX, top, x + 8, top, "extension"); this.line(featureX, bottom, x + 8, bottom, "extension");
    this.parts.push(`<path class="dimension" d="M${x},${top} V${bottom}" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"/>`);
    if (bottom - top > 95) this.text(x - 10, (top + bottom) / 2, label, 16, "middle",
      `class="dimension-label" transform="rotate(-90 ${x - 10} ${(top + bottom) / 2})"`);
    else this.text(x + 12, (top + bottom) / 2 + 5, label, 14, "start", 'class="dimension-label"');
    this.parts.push("</g>");
  }
  leader(x: number, y: number, tx: number, ty: number, label: string) {
    this.parts.push(`<g data-leader="${escapeDrawingText(label)}"><path class="dimension" d="M${tx},${ty - 5} H${tx - 14} L${x},${y}" marker-end="url(#dim-arrow)"/>`);
    this.text(tx, ty - 10, label, 15, "start", 'class="dimension-label"'); this.parts.push("</g>");
  }
  elevation(x: number, y: number, label: string, side: "left" | "right" = "right") {
    this.parts.push(`<g data-elevation-marker="${escapeDrawingText(label)}">`);
    this.path(`M${x},${y} l8,-9 h-16 Z`, "datum", "#243444");
    if (side === "left") {
      this.line(x - 115, y, x + 10, y, "extension");
      this.text(x - 14, y - 5, label, 14, "end");
    } else {
      this.line(x - 10, y, x + 105, y, "extension");
      this.text(x + 14, y - 5, label, 14);
    }
    this.parts.push("</g>");
  }
  callout(x: number, y: number, letter: string) { this.circle(x, y, 17); this.text(x, y + 5, letter, 16, "middle"); }
  breakLine(x1: number, x2: number, y: number) {
    const cx = (x1 + x2) / 2;
    this.parts.push(`<path class="object" data-break="repetitive" d="M${x1},${y} H${cx - 14} l8,-7 l12,14 l8,-7 H${x2}"/>`);
  }
  finish(meta: { ruleset: string; stage3: unknown; stage4: unknown; status: string; watermark: string; context?: Stage5DrawingContext; scale?: string }) {
    const c = meta.context ?? {};
    this.rect(18, 18, this.width - 36, this.height - 36, "drawing-border");
    this.text(36, 47, this.title, 24);
    this.text(this.width - 36, 47, "ALL DIMENSIONS mm • DO NOT SCALE", 14, "end");
    this.line(18, 63, this.width - 18, 63, "extension");
    const y = this.height - 132;
    this.rect(18, y, this.width - 36, 114, "title-block");
    this.line(18, y + 31, this.width - 18, y + 31, "extension");
    this.text(32, y + 22, c.projectName || `ECR pre-pilot design${c.designId !== undefined ? ` ${c.designId}` : ""}`, 17);
    this.text(this.width - 32, y + 22, `REV ${c.revision ?? "R1"}  |  DATE ${c.date ?? "Saved source revision"}`, 14, "end");
    this.text(32, y + 53, `Stage 3: ${meta.stage3}   /   Stage 4: ${meta.stage4}   •   ${meta.scale ?? "Scale: fitted sheet; use dimensions"}`, 14);
    this.text(32, y + 73, meta.ruleset, 13);
    this.text(32, y + 91, meta.status, 13);
    this.text(this.width - 32, y + 108, meta.watermark, 14, "end");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" width="${this.width}" height="${this.height}" role="img" aria-label="${escapeDrawingText(this.title)}"><title>${escapeDrawingText(this.title)}</title><defs><marker id="dim-arrow" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M10,1 L0,5 L10,9 Z" fill="#243444"/></marker><pattern id="section-hatch" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0,7 L7,0" stroke="#81909b" stroke-width=".6"/></pattern></defs><style>text{font-family:Arial,Helvetica,sans-serif;fill:#172a3b;stroke:none}.object{stroke:#172a3b;stroke-width:1.5}.extension{stroke:#70818e;stroke-width:.65}.dimension{stroke:#344b5e;stroke-width:.85;fill:none}.centerline{stroke:#77909d;stroke-width:.8;stroke-dasharray:12 4 2 4}.dimension-label{paint-order:stroke;stroke:white;stroke-width:5;stroke-linejoin:round;fill:#172a3b}</style><rect width="100%" height="100%" fill="white"/>${this.parts.join("")}</svg>`;
  }
}