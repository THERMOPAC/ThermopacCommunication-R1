// ── CPS Sizing Tool — PDF Report Generator ────────────────────────────────────
// downloadCustomerPdf — professional customer-facing report (no proprietary data)
// downloadInternalPdf — detailed internal engineering calculation record
//
// REPORT BASIS
// Both functions receive the BuildRowsResult already rendered on the Output
// Sizing tab. This report represents the latest successful CPS sizing
// calculation using the Knowledge Engine parameter snapshot frozen at the
// stated recalculation timestamp. No recalculation is performed here.
//
// Internal PDF — KE values:
//   VALUE, UNIT, PARAMETER_TYPE, CATEGORY  → ke_snapshot (authoritative, frozen)
//   parameter_name, symbol                 → enriched from live keData (descriptive only)
//
// Button gating (enforced in cps-output-sizing.tsx):
//   Disabled unless buildResult.installedColumns !== null AND ke_snapshot !== null.
//
// COMPANY IDENTITY
//   Both PDFs receive CompanyInfo fetched from GET /api/company/active.
//   No company names are hard-coded in this file.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { SizingCase, KeSnapshot, scopeLabel } from "./cps-sizing-shared";
import type { KnowledgeParam } from "./cps-output-sizing";

// ── Company identity (from /api/company/active) ────────────────────────────────
export type CompanyInfo = {
  short_name:    string | null;
  legal_name:    string | null;
  logo_gcs_path: string | null;
};

// ── Brand palette (matches sop-pdf.ts) ────────────────────────────────────────
const C_BLUE:   [number, number, number] = [30,  58,  138];
const C_RED:    [number, number, number] = [185, 28,  28 ];
const C_LGRAY:  [number, number, number] = [241, 245, 249];
const C_MGRAY:  [number, number, number] = [148, 163, 184];
const C_DGRAY:  [number, number, number] = [30,  41,  59 ];
const C_WHITE:  [number, number, number] = [255, 255, 255];
const C_LBORD:  [number, number, number] = [180, 195, 220];
const C_EMPH:   [number, number, number] = [219, 234, 254]; // blue-100 emphasis row
const C_WARN:   [number, number, number] = [254, 243, 199]; // amber-100 warning row

// ── Page geometry (A4 portrait) ────────────────────────────────────────────────
const ML   = 14;
const MR   = 14;
const PW   = 210;
const PH   = 297;
const CW   = PW - ML - MR;  // 182 mm usable width
const TOP  = 20;             // Y where body content starts (below header chrome)
const BOT  = PH - 13;       // Y where body content ends (above footer chrome)

// ── Public types consumed by cps-output-sizing.tsx ────────────────────────────
export type PdfRow = {
  label: string; value: string; unit: string;
  computed?: boolean; emphasis?: boolean; isSubHeader?: boolean; tag?: string;
};

export type PdfMassBalance = {
  totalOilInputKg: number; finishedOilKg: number; semiFinishedOilKg: number;
  blackOilKgPerCycle: number; burnedOilKgPerCycle: number; otherProcessLossKg: number;
  totalAccountedOutputKg: number; differenceKg: number; errorPct: number; closed: boolean;
};

// Structural mirror of BuildRowsResult in cps-output-sizing.tsx.
// Both Customer and Internal PDF functions accept this type.
export type PdfSizingResult = {
  rows:                              PdfRow[];
  mb:                                PdfMassBalance | null;
  vocRows:                           PdfRow[];
  toxRows:                           PdfRow[];
  installedColumns:                  number | null;
  rawRequiredColumns:                number | null;
  requiredMediaKg:                   number | null;
  numberOfSkids:                     number | null;
  totalCpsFlowLph:                   number | null;
  skidConfig:                        string | null;
  skidCount:                         number | null;
  totalSkidCapacity:                 number | null;
  skidSpareCapacity:                 number | null;
  deltaColour:                       number | null;
  deltaSulphur:                      number | null;
  columnFillVolumeL:                 number | null;
  columnFillingTimeH:                number | null;
  finishedPolishingTimeH:            number | null;
  semiFinishedMediaSaturationTimeH:  number | null;
  vacuumDrainTimeH:                  number | null;
  heatUpTimeH:                       number | null;
  regenerationTimeH:                 number | null;
  coolingTimeH:                      number | null;
  switchingSettlingTimeH:            number | null;
  totalCycleTimeH:                   number | null;
  capacityInsufficient:              boolean;
  sulphurSolveFailed:                boolean;
  isSulphurBranch:                   boolean;
  /** BASE_OIL_SG KE value — used for capacity validation calculation only. */
  baseOilSg:                         number | null;
};

// ── Internal helpers ───────────────────────────────────────────────────────────
const fmt = (n: number, dp = 2): string =>
  n.toLocaleString("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: 0 });

const fmtOr = (n: number | null, dp = 2, na = "-"): string =>
  n !== null ? fmt(n, dp) : na;

const pct = (part: number, total: number): string =>
  total > 0 ? `${((part / total) * 100).toFixed(2)}%` : "-";

const safe = (s: string): string =>
  s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/, "");

const dateStr = (iso?: string | null): string => {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString("en-GB"); } catch { return iso; }
};

const todayStr = (): string =>
  new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

// Filter sub-header rows; convert to 3-column body for autotable.
// Also remaps display labels for approved terminology changes.
const remapLabel = (label: string): string => {
  if (label === "Average Oil Burn Rate")              return "Average Oil Burn Rate During Regeneration";
  if (label === "Combustion Air Requirement")         return "Combustion Air Volume Requirement";
  if (label === "Preliminary TOX Heat Requirement")   return "Preliminary Total Combustible Heat Input";
  if (label === "Theoretical SO\u2082 Equivalent")    return "Theoretical SO2 Equivalent";
  return label;
};

const toBody = (rows: PdfRow[]): string[][] =>
  rows
    .filter(r => !r.isSubHeader)
    .map(r => [remapLabel(r.label), r.value, r.unit || "-"]);

// Track final Y after each autoTable call.
const fy = (doc: jsPDF): number => (doc as any).lastAutoTable?.finalY ?? TOP;

// Resolved company display helpers
const coShort  = (co: CompanyInfo | null): string => co?.short_name  || "COMPANY";
const coLegal  = (co: CompanyInfo | null): string => co?.legal_name  || "Company";

// ── Page chrome (header + footer) — added on every page ───────────────────────
function addChrome(doc: jsPDF, subtitle: string, co: CompanyInfo | null): void {
  const p = doc.getNumberOfPages();

  // Header bar
  doc.setFillColor(...C_BLUE);
  doc.rect(0, 0, PW, 13, "F");
  doc.setFillColor(...C_RED);
  doc.rect(0, 13, PW, 1.5, "F");

  // Company short name (dynamic)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_WHITE);
  doc.text(coShort(co), ML, 9);

  // Subtitle centred
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(175, 200, 240);
  doc.text(subtitle, PW / 2, 9, { align: "center" });

  // Page number right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(200, 215, 250);
  doc.text(`Page ${p}`, PW - MR, 9, { align: "right" });

  // Footer
  doc.setDrawColor(...C_LBORD);
  doc.setLineWidth(0.25);
  doc.line(ML, BOT, PW - MR, BOT);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(...C_MGRAY);
  doc.text(`CPS Sizing Report  -  ${coLegal(co)}`, ML, BOT + 3.5);
  doc.text(`Page ${p}`, PW - MR, BOT + 3.5, { align: "right" });
}

// ── Section header bar ─────────────────────────────────────────────────────────
function secBar(doc: jsPDF, y: number, title: string): number {
  doc.setFillColor(...C_BLUE);
  doc.rect(ML, y, CW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_WHITE);
  doc.text(title, ML + 3, y + 5);
  return y + 9;
}

// ── Sub-section divider (lighter bar within a main section) ───────────────────
function subBar(doc: jsPDF, y: number, title: string): number {
  doc.setFillColor(...C_EMPH);
  doc.rect(ML, y, CW, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_BLUE);
  doc.text(title, ML + 3, y + 4.2);
  return y + 8;
}

// ── Default autotable options factory ─────────────────────────────────────────
function baseOpts(
  doc: jsPDF, subtitle: string, startY: number, co: CompanyInfo | null,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    startY,
    margin: { top: TOP + 2, bottom: PH - BOT + 4, left: ML, right: MR },
    styles: {
      fontSize: 8.5,
      textColor: C_DGRAY,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
      lineColor: C_LBORD,
      lineWidth: 0.15,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: C_BLUE,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: C_LGRAY },
    didDrawPage: () => addChrome(doc, subtitle, co),
    ...extra,
  };
}

// ── 3-column sizing table column widths ───────────────────────────────────────
const COL3 = {
  columnStyles: {
    0: { cellWidth: 100 },
    1: { cellWidth: 55, halign: "right", fontStyle: "bold" },
    2: { cellWidth: CW - 155, halign: "right", textColor: C_MGRAY, fontSize: 7.5 },
  },
};

// ── 2-column KV table column widths ───────────────────────────────────────────
const COL2 = {
  columnStyles: {
    0: { cellWidth: 72, fontStyle: "bold", textColor: C_BLUE },
    1: { cellWidth: CW - 72 },
  },
};

// ── Capacity validation helper ─────────────────────────────────────────────────
// CALCULATED_FINISHED_CAPACITY_L_DAY = (finishedOilKg / baseOilSg) * 24 / totalCycleTimeH
// Report-only validation — does NOT alter sizing.
function calcFinishedCapLDay(r: PdfSizingResult): number | null {
  if (
    r.mb && r.mb.finishedOilKg > 0 &&
    r.baseOilSg !== null && r.baseOilSg > 0 &&
    r.totalCycleTimeH !== null && r.totalCycleTimeH > 0
  ) {
    return (r.mb.finishedOilKg / r.baseOilSg) * 24 / r.totalCycleTimeH;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// CUSTOMER PDF
// ════════════════════════════════════════════════════════════════════════════════
/**
 * Generates and downloads the customer-facing CPS Sizing Report PDF.
 *
 * WHAT IS EXCLUDED:
 *   - KE parameter codes / values / calibration constants
 *   - SULPHUR_ABS_FACTOR, COLOUR_ABS_FACTOR
 *   - Raw Required Columns, Governing Sizing Basis
 *   - Internal warnings, formula intermediates
 *   - KE snapshot data
 *
 * Uses the same sizing result already displayed — no recalculation.
 */
export function downloadCustomerPdf(
  sizingCase: SizingCase,
  r: PdfSizingResult,
  co: CompanyInfo | null,
): void {
  const sub  = "CPS Sizing Report - Customer";
  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const tbl  = (sy: number, extra?: Record<string, unknown>) =>
    autoTable(doc, baseOpts(doc, sub, sy, co, extra));
  const sulphur = r.isSulphurBranch;

  // ── Page 1 chrome + title block ─────────────────────────────────────────────
  addChrome(doc, sub, co);
  let y = TOP + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...C_BLUE);
  doc.text("CPS Sizing Report", PW / 2, y + 8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C_MGRAY);
  doc.text("Colour Purification System - Engineering Sizing Summary", PW / 2, y + 16, { align: "center" });

  doc.setDrawColor(...C_RED);
  doc.setLineWidth(0.7);
  doc.line(PW / 2 - 38, y + 20.5, PW / 2 + 38, y + 20.5);
  y += 30;

  // ── 1. Report Header ────────────────────────────────────────────────────────
  y = secBar(doc, y, "1  -  Report Header");
  tbl(y, {
    head: [["Field", "Details"]],
    body: [
      ["Customer",                   sizingCase.customer_name],
      ["Project / Plant Location",   sizingCase.plant_location || "-"],
      ["Report Date",                todayStr()],
      ["Required Treatment",         scopeLabel(sizingCase.treatment_scope)],
    ],
    ...COL2,
  });
  y = fy(doc) + 6;

  // ── 2. Customer Design Basis ─────────────────────────────────────────────────
  y = secBar(doc, y, "2  -  Customer Design Basis");

  // Capacity validation
  const calcCap = calcFinishedCapLDay(r);
  const reqCap  = Number(sizingCase.cps_feed_capacity);
  const capPass = calcCap !== null && Math.abs(calcCap - reqCap) / Math.max(reqCap, 1) < 0.01; // <1% tolerance

  const basisRows: string[][] = [
    ["Required Finished Product Capacity",    `${sizingCase.cps_feed_capacity}`,                            "L/Day"],
    ["Calculated Finished Product Capacity",  calcCap !== null ? fmt(calcCap, 1) : "-",                     "L/Day"],
    ["Capacity Check",                        calcCap !== null ? (capPass ? "PASS" : "FAIL") : "-",         ""],
    ["RRBO Grade",                            sizingCase.rrbo_grade,                                        ""],
    ["Feed Oil Viscosity @ 40°C",             `${sizingCase.feed_oil_visc_40c}`,                            "cSt"],
    ["Inlet ASTM Colour",                     sizingCase.inlet_colour,                                      "ASTM"],
    ["Target ASTM Colour",                    sizingCase.target_colour,                                     "ASTM"],
  ];
  if (sulphur) {
    basisRows.push(["Inlet Sulphur",  sizingCase.inlet_sulphur  ?? "-", "ppm"]);
    basisRows.push(["Target Sulphur", sizingCase.target_sulphur ?? "-", "ppm"]);
  }
  tbl(y, {
    head: [["Parameter", "Value", "Unit"]],
    body: basisRows,
    columnStyles: {
      0: { cellWidth: 80, fontStyle: "bold", textColor: C_BLUE },
      1: { cellWidth: 72, halign: "right" },
      2: { cellWidth: CW - 152, halign: "right", textColor: C_MGRAY, fontSize: 7.5 },
    },
    willDrawCell: (d: any) => {
      if (d.section === "body" && d.row.index === 2) {
        // Capacity Check row
        doc.setFillColor(calcCap !== null && capPass ? 209 : 254, calcCap !== null && capPass ? 250 : 202, calcCap !== null && capPass ? 229 : 202);
      }
    },
  });
  y = fy(doc) + 6;

  // ── 3. Recommended CPS Configuration ─────────────────────────────────────────
  y = secBar(doc, y, "3  -  Recommended CPS Configuration");
  const configBody: string[][] = [
    ["Required Media",                        fmtOr(r.requiredMediaKg, 2),   "kg"],
    ["Installed CPS Columns",                 fmtOr(r.installedColumns, 0),  "columns"],
    ["Number of 20-Column Modules",           fmtOr(r.numberOfSkids, 0),     "modules"],
    ["Rotating Equipment Skid Configuration", r.skidConfig ?? "-",           ""],
    ["Number of Rotating Equipment Skids",    fmtOr(r.skidCount, 0),         "skids"],
    ["Total Rotating Equipment Capacity",     fmtOr(r.totalSkidCapacity, 0), "columns"],
    ["Spare / Future Expansion Capacity",     fmtOr(r.skidSpareCapacity, 0), "columns"],
    ["Gross CPS Processing Flow",             fmtOr(r.totalCpsFlowLph),      "L/h"],
  ];
  tbl(y, {
    head: [["Output", "Value", "Unit"]],
    body: configBody,
    ...COL3,
    willDrawCell: (d: any) => {
      if (d.section === "body" && d.row.index === 3) doc.setFillColor(...C_EMPH);
    },
  });
  y = fy(doc) + 6;

  // ── 4. Process Performance ────────────────────────────────────────────────────
  y = secBar(doc, y, "4  -  Process Performance");
  const perfBody: string[][] = [];
  if (sulphur) perfBody.push(["Expected Sulphur Improvement", fmtOr(r.deltaSulphur, 0), "ppm reduction"]);
  perfBody.push(
    ["Expected Colour Improvement",           fmtOr(r.deltaColour, 2),                    "ASTM reduction"],
    ["Finished Polishing Time",               fmtOr(r.finishedPolishingTimeH),             "h"],
    ["Semi-finished / Media Saturation Time", fmtOr(r.semiFinishedMediaSaturationTimeH),  "h"],
    ["Total Cycle Time",                      fmtOr(r.totalCycleTimeH),                   "h"],
  );
  tbl(y, {
    head: [["Parameter", "Value", "Unit"]],
    body: perfBody,
    ...COL3,
    willDrawCell: (d: any) => {
      if (d.section === "body" && d.row.index === perfBody.length - 1) doc.setFillColor(...C_EMPH);
    },
  });
  y = fy(doc) + 6;

  // ── 5. Cycle / Product Information ───────────────────────────────────────────
  y = secBar(doc, y, "5  -  Cycle / Product Information");
  tbl(y, {
    head: [["Product Stream", "Quantity", "Unit"]],
    body: [
      ["Finished Oil / Cycle",                 fmtOr(r.mb?.finishedOilKg     ?? null, 0), "kg/cycle"],
      ["Semi-finished Oil / Cycle  (RECYCLE)", fmtOr(r.mb?.semiFinishedOilKg ?? null, 0), "kg/cycle"],
    ],
    ...COL3,
  });
  y = fy(doc) + 3;

  // Recycle note
  const recycleNote =
    "Semi-finished oil is returned to the CPS system in the subsequent processing cycle. " +
    "It is a recycle stream - not a material loss from the process.";
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MGRAY);
  const rnLines = doc.splitTextToSize(`Note:  ${recycleNote}`, CW);
  doc.text(rnLines, ML, y + 4);
  y += 4 + rnLines.length * 4.2 + 4;

  // ── 6. Regeneration / Off-Gas Information ─────────────────────────────────────
  // Customer-approved values only — no per-column KE constants, no proprietary factors.
  y = secBar(doc, y, "6  -  Regeneration / Off-Gas Information");
  const offgasRow = r.vocRows.find(rv => rv.label === "Total Regeneration Off-Gas Flow");
  const toxTmpRow = r.vocRows.find(rv => rv.label === "Off-Gas TOX Inlet Temperature");
  tbl(y, {
    head: [["Parameter", "Value", "Unit"]],
    body: [
      ["Regeneration Time",               fmtOr(r.regenerationTimeH),   "h"],
      ["Total Regeneration Off-Gas Flow", offgasRow?.value ?? "-",       offgasRow?.unit ?? "Nm3/h"],
      ["Off-Gas TOX Inlet Temperature",   toxTmpRow?.value ?? "-",       toxTmpRow?.unit ?? "deg C"],
    ],
    ...COL3,
  });
  y = fy(doc) + 6;

  // ── 7. Mass Balance Summary ────────────────────────────────────────────────────
  y = secBar(doc, y, "7  -  Mass Balance Summary");
  if (r.mb) {
    const { totalOilInputKg: tot, finishedOilKg: fin, semiFinishedOilKg: semi,
            blackOilKgPerCycle: blk, burnedOilKgPerCycle: brn } = r.mb;
    tbl(y, {
      head: [["Stream", "kg / Cycle", "% of Input", "Note"]],
      body: [
        ["Total Oil Input",           fmt(tot, 0),  "100.00%",       "Feed"],
        ["Finished Oil",              fmt(fin, 0),  pct(fin, tot),   "Product"],
        ["Semi-finished Oil",         fmt(semi, 0), pct(semi, tot),  "RECYCLE"],
        ["Black Oil",                 fmt(blk, 0),  pct(blk, tot),   "Waste / Disposal"],
        ["Burned Oil (Regeneration)", fmt(brn, 0),  pct(brn, tot),   "Regeneration Fuel"],
      ],
      columnStyles: {
        0: { cellWidth: 65 },
        1: { cellWidth: 35, halign: "right", fontStyle: "bold" },
        2: { cellWidth: 30, halign: "right" },
        3: { cellWidth: CW - 130, fontSize: 7.5, textColor: C_MGRAY },
      },
      willDrawCell: (d: any) => {
        if (d.section === "body" && d.row.index === 0) doc.setFillColor(...C_EMPH);
      },
    });
  } else {
    y += 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...C_MGRAY);
    doc.text("Mass balance not available - one or more parameters not defined.", ML, y);
    y += 8;
  }
  y = fy(doc) + 6;

  // ── 8. Engineering Notes ──────────────────────────────────────────────────────
  y = secBar(doc, y, "8  -  Engineering Notes");
  y += 4;
  const notes = [
    `Sizing is based on the customer information provided and ${coLegal(co)}'s current CPS engineering design basis.`,
    "Final equipment configuration is subject to detailed engineering.",
    "Semi-finished oil is recycled through subsequent CPS processing cycles and does not represent a material loss from the system.",
    "Regeneration off-gas data is provided for downstream system planning only. Thermal Oxidizer sizing is subject to a separate engineering scope.",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_DGRAY);
  for (const note of notes) {
    const lines = doc.splitTextToSize(`-  ${note}`, CW - 4);
    doc.text(lines, ML + 2, y);
    y += lines.length * 5 + 2;
  }

  doc.save(`CPS_Sizing_${safe(sizingCase.customer_name)}_Customer.pdf`);
}

// ════════════════════════════════════════════════════════════════════════════════
// INTERNAL PDF
// ════════════════════════════════════════════════════════════════════════════════
/**
 * Generates and downloads the internal engineering calculation record.
 *
 * KE BASIS RULE:
 *   VALUE / UNIT / PARAMETER_TYPE / CATEGORY  -> ke_snapshot (authoritative, frozen)
 *   parameter_name / symbol                   -> enriched from keData (descriptive only)
 *
 * Uses the same sizing result already displayed — no recalculation.
 */
export function downloadInternalPdf(
  sizingCase: SizingCase,
  r: PdfSizingResult,
  keData: KnowledgeParam[],   // live — name/symbol enrichment ONLY
  co: CompanyInfo | null,
): void {
  const sub = "CPS Sizing Report - Internal Engineering Record";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const tbl = (sy: number, extra?: Record<string, unknown>) =>
    autoTable(doc, baseOpts(doc, sub, sy, co, extra));
  const snap: KeSnapshot | null = sizingCase.ke_snapshot;
  const sulphur = r.isSulphurBranch;

  // ── Page 1 chrome + title ────────────────────────────────────────────────────
  addChrome(doc, sub, co);
  let y = TOP + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...C_BLUE);
  doc.text("CPS Sizing Report", PW / 2, y + 8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C_MGRAY);
  doc.text("Internal Engineering Calculation Record", PW / 2, y + 16, { align: "center" });

  doc.setDrawColor(...C_RED);
  doc.setLineWidth(0.7);
  doc.line(PW / 2 - 40, y + 20.5, PW / 2 + 40, y + 20.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_RED);
  // Dynamic confidential stamp — uses short company name
  doc.text(
    `INTERNAL - NOT FOR EXTERNAL DISTRIBUTION - ${coShort(co)} CONFIDENTIAL`,
    PW / 2, y + 27, { align: "center" },
  );
  y += 34;

  // ── 1. Report Identification ─────────────────────────────────────────────────
  y = secBar(doc, y, "1  -  Report Identification");
  tbl(y, {
    head: [["Field", "Value"]],
    body: [
      ["Customer",                 sizingCase.customer_name],
      ["Project / Plant Location", sizingCase.plant_location || "-"],
      ["Sizing Case ID",           `CS-${sizingCase.id}`],
      ["Required Treatment",       scopeLabel(sizingCase.treatment_scope)],
      ["Calculation Timestamp",    dateStr(snap?.calculation_timestamp)],
      ["Report Generated",         new Date().toLocaleString("en-GB")],
    ],
    ...COL2,
  });
  y = fy(doc) + 6;

  // ── 2. Customer Inputs ───────────────────────────────────────────────────────
  y = secBar(doc, y, "2  -  Customer Inputs");

  // Capacity validation
  const calcCap = calcFinishedCapLDay(r);
  const reqCap  = Number(sizingCase.cps_feed_capacity);
  const capPass = calcCap !== null && Math.abs(calcCap - reqCap) / Math.max(reqCap, 1) < 0.01;

  const inputBody: string[][] = [
    ["Required Finished Product Capacity",   sizingCase.cps_feed_capacity,                                "L/Day"],
    ["Calculated Finished Product Capacity", calcCap !== null ? fmt(calcCap, 2) : "-",                    "L/Day"],
    ["Capacity Check",                       calcCap !== null ? (capPass ? "PASS" : "FAIL") : "-",        ""],
    ["RRBO Grade",                           sizingCase.rrbo_grade,                                       ""],
    ["Feed Oil Viscosity @ 40 deg C",        sizingCase.feed_oil_visc_40c,                                "cSt"],
    ["Inlet ASTM Colour",                    sizingCase.inlet_colour,                                     "ASTM"],
    ["Target ASTM Colour",                   sizingCase.target_colour,                                    "ASTM"],
  ];
  if (sulphur) {
    inputBody.push(["Inlet Sulphur",  sizingCase.inlet_sulphur  ?? "-", "ppm"]);
    inputBody.push(["Target Sulphur", sizingCase.target_sulphur ?? "-", "ppm"]);
  }
  tbl(y, {
    head: [["Input Parameter", "Value", "Unit"]],
    body: inputBody,
    ...COL3,
    columnStyles: {
      0: { cellWidth: 100, fontStyle: "bold", textColor: C_BLUE },
      1: { cellWidth: 55, halign: "right" },
      2: { cellWidth: CW - 155, halign: "right", textColor: C_MGRAY, fontSize: 7.5 },
    },
    willDrawCell: (d: any) => {
      if (d.section === "body" && d.row.index === 2) {
        doc.setFillColor(calcCap !== null && capPass ? 209 : 254, calcCap !== null && capPass ? 250 : 202, calcCap !== null && capPass ? 229 : 202);
      }
    },
  });
  y = fy(doc) + 6;

  // ── 3. Full Output Sizing ────────────────────────────────────────────────────
  y = secBar(doc, y, "3  -  Full Output Sizing");
  const dataRows = r.rows.filter(rx => !rx.isSubHeader);
  tbl(y, {
    head: [["Output Parameter", "Value", "Unit"]],
    body: dataRows.map(rx => [rx.label, rx.value, rx.unit || "-"]),
    ...COL3,
    willDrawCell: (d: any) => {
      if (d.section === "body") {
        const rx = dataRows[d.row.index];
        if (rx?.emphasis) doc.setFillColor(...C_EMPH);
      }
    },
  });
  y = fy(doc) + 6;

  // ── 4. Mass Balance ──────────────────────────────────────────────────────────
  y = secBar(doc, y, "4  -  Mass Balance");
  if (r.mb) {
    const m = r.mb;
    const diffSign = m.differenceKg >= 0 ? "+" : "";
    const errSign  = m.errorPct    >= 0 ? "+" : "";
    tbl(y, {
      head: [["Stream", "kg / Cycle", "% of Input"]],
      body: [
        ["Total Oil Input",             fmt(m.totalOilInputKg, 3),        "100.000%"],
        ["Finished Oil",                fmt(m.finishedOilKg, 3),          pct(m.finishedOilKg,          m.totalOilInputKg)],
        ["Semi-finished Oil (RECYCLE)", fmt(m.semiFinishedOilKg, 3),      pct(m.semiFinishedOilKg,      m.totalOilInputKg)],
        ["Black Oil",                   fmt(m.blackOilKgPerCycle, 3),     pct(m.blackOilKgPerCycle,     m.totalOilInputKg)],
        ["Burned Oil (Regeneration)",   fmt(m.burnedOilKgPerCycle, 3),    pct(m.burnedOilKgPerCycle,    m.totalOilInputKg)],
        ["Other Process Losses",        fmt(m.otherProcessLossKg, 3),     pct(m.otherProcessLossKg,     m.totalOilInputKg)],
        ["Total Accounted Output",      fmt(m.totalAccountedOutputKg, 3), pct(m.totalAccountedOutputKg, m.totalOilInputKg)],
        ["Difference (Output - Input)", `${diffSign}${m.differenceKg.toFixed(6)}`, `${errSign}${m.errorPct.toFixed(4)}%`],
        ["Balance Status",              m.closed ? "PASS - CLOSED" : "FAIL - NOT CLOSED", ""],
      ],
      columnStyles: {
        0: { cellWidth: 90, fontStyle: "bold" },
        1: { cellWidth: 55, halign: "right" },
        2: { cellWidth: CW - 145, halign: "right" },
      },
      willDrawCell: (d: any) => {
        if (d.section !== "body") return;
        if (d.row.index === 0 || d.row.index === 6) doc.setFillColor(...C_EMPH);
        if (d.row.index === 8) {
          doc.setFillColor(
            m.closed ? 209 : 254,
            m.closed ? 250 : 202,
            m.closed ? 229 : 202,
          );
        }
      },
    });
  } else {
    y += 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...C_MGRAY);
    doc.text("Mass balance not computed - one or more required KE parameters not defined.", ML, y);
    y += 8;
  }
  y = fy(doc) + 6;

  // ── 5. VOC / Regeneration Off-Gas ────────────────────────────────────────────
  // Restructured into three sub-sections:
  //   A. Reference Test Basis    — KE constants (per-column / per-test measurements)
  //   B. Scaled CPS Load         — computed totals for installed column count
  //   C. Sulphur Load            — derived sulphur mass-balance (if applicable)
  y = secBar(doc, y, "5  -  VOC / Regeneration Off-Gas");

  const vocRef     = r.vocRows.filter(rv => !rv.computed && !rv.isSubHeader); // KE reference
  const vocScaled  = r.vocRows.filter(rv =>  rv.computed && !rv.isSubHeader &&
    !rv.label.includes("Sulphur") && !rv.label.includes("SO")); // scaled non-sulphur
  const vocSulphur = r.vocRows.filter(rv =>  rv.computed && !rv.isSubHeader &&
    (rv.label.includes("Sulphur") || rv.label.includes("SO"))); // sulphur

  // 5A — Reference Test Basis
  if (y > BOT - 20) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
  y = subBar(doc, y, "A.  Reference Test Basis  (KE — measured / calibrated constants)");
  tbl(y, {
    head: [["Parameter", "Value", "Unit"]],
    body: vocRef.map(rv => [remapLabel(rv.label), rv.value, rv.unit || "-"]),
    ...COL3,
  });
  y = fy(doc) + 5;

  // 5B — Scaled CPS Regeneration Load
  if (y > BOT - 20) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
  y = subBar(doc, y, "B.  Scaled CPS Regeneration Load  (Installed Columns x Reference)");
  tbl(y, {
    head: [["Parameter", "Value", "Unit"]],
    body: vocScaled.map(rv => [remapLabel(rv.label), rv.value, rv.unit || "-"]),
    ...COL3,
    willDrawCell: (d: any) => {
      if (d.section === "body") {
        const rv = vocScaled[d.row.index];
        if (rv?.emphasis) doc.setFillColor(...C_EMPH);
      }
    },
  });
  y = fy(doc) + 5;

  // 5C — Sulphur Load (derived; only included when sulphur rows are present)
  if (vocSulphur.length > 0) {
    if (y > BOT - 20) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
    y = subBar(doc, y, "C.  Regeneration Sulphur Load  (Derived - case-specific)");
    tbl(y, {
      head: [["Parameter", "Value", "Unit"]],
      body: vocSulphur.map(rv => [remapLabel(rv.label), rv.value, rv.unit || "-"]),
      ...COL3,
      willDrawCell: (d: any) => {
        if (d.section === "body") {
          const rv = vocSulphur[d.row.index];
          if (rv?.emphasis) doc.setFillColor(...C_EMPH);
        }
      },
    });
    y = fy(doc) + 5;
  }
  y += 2;

  // ── 6. Preliminary Thermal Oxidizer Design Load ────────────────────────────────
  // Restructured into three sub-sections:
  //   A. Reference Test Basis    — process basis inputs
  //   B. Combustible / Contaminant Load — heat-balance derived values
  //   C. Thermal Balance + Gas Flow + Equipment Sizing (D and E consolidated here)
  if (r.toxRows.length > 0) {
    if (y > BOT - 20) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
    y = secBar(doc, y, "6  -  Preliminary Thermal Oxidizer Design Load");

    // Split toxRows by sub-section header
    type ToxGroup = { header: string; rows: PdfRow[] };
    const groups: ToxGroup[] = [];
    let current: ToxGroup | null = null;
    for (const rv of r.toxRows) {
      if (rv.isSubHeader) {
        if (current) groups.push(current);
        current = { header: rv.label, rows: [] };
      } else if (current) {
        current.rows.push(rv);
      }
    }
    if (current) groups.push(current);

    // Map original A/B/C/D/E subheaders to revised display names
    const subHeaderMap: Record<string, string> = {
      "A. PROCESS BASIS":                  "A.  Process Basis",
      "B. COMBUSTIBLE / CONTAMINANT LOAD": "B.  Combustible / Contaminant Load",
      "C. THERMAL BALANCE":                "C.  Thermal Balance",
      "D. GAS FLOW":                       "D.  Gas Flow  (Preliminary - excludes combustion-product volume change and excess air)",
      "E. FINAL EQUIPMENT SIZING":         "E.  Equipment Sizing",
    };

    for (const grp of groups) {
      if (grp.rows.length === 0) continue;
      if (y > BOT - 20) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
      const displayHeader = subHeaderMap[grp.header] ?? grp.header;
      y = subBar(doc, y, displayHeader);
      tbl(y, {
        head: [["Parameter", "Value", "Unit"]],
        body: grp.rows.map(rv => [remapLabel(rv.label), rv.value, rv.unit || "-"]),
        ...COL3,
        willDrawCell: (d: any) => {
          if (d.section === "body") {
            const rv = grp.rows[d.row.index];
            if (rv?.emphasis) doc.setFillColor(...C_EMPH);
          }
        },
      });
      y = fy(doc) + 5;
    }

    // Combustion air unit note
    if (y > BOT - 10) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MGRAY);
    doc.text(
      "Note: Combustion Air Volume Requirement KE constant (COMBUSTION_AIR_REQ) has unit Nm3 air/kg combustible.",
      ML, y,
    );
    y += 6;

    y += 2;
  }

  // ── 7. Knowledge Engine Snapshot ─────────────────────────────────────────────
  // VALUES / UNITS / TYPE / CATEGORY: from ke_snapshot (authoritative, frozen at Recalculate).
  // parameter_name / symbol: enriched from live keData (descriptive metadata only).
  if (y > BOT - 20) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
  y = secBar(doc, y, "7  -  Knowledge Engine Snapshot  (Calculation Basis)");

  if (!snap) {
    y += 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...C_RED);
    doc.text("KE snapshot not available. Click Recalculate on the Output Sizing tab to generate it.", ML, y);
    y += 10;
  } else {
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C_BLUE);
    doc.text(
      `Snapshot frozen at Recalculate: ${dateStr(snap.calculation_timestamp)}  -  Scope: ${scopeLabel(snap.treatment_scope)}`,
      ML, y,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MGRAY);
    doc.text(
      "Parameter values, units, types and categories are from the saved snapshot - not current live KE values.",
      ML, y + 4.5,
    );
    y += 11;

    // Build enriched table: values from snapshot, names/symbols from live keData
    const keMap = new Map(keData.map(p => [p.parameter_code, p]));
    const keBody: string[][] = snap.parameters.map(sp => {
      const live = keMap.get(sp.parameter_code);
      return [
        sp.parameter_code,                         // CODE — from snapshot
        live?.parameter_name ?? sp.parameter_code, // NAME — from live (descriptive only)
        live?.symbol ?? "-",                       // SYMBOL — from live (descriptive only)
        sp.value ?? "-",                           // VALUE  — from snapshot (authoritative)
        sp.unit ?? "-",                            // UNIT   — from snapshot (authoritative)
        sp.parameter_type ?? "-",                  // TYPE   — from snapshot (authoritative)
        sp.category ?? "-",                        // CAT    — from snapshot (authoritative)
      ];
    });

    tbl(y, {
      head: [["Code", "Parameter Name", "Symbol", "Value", "Unit", "Type", "Category"]],
      body: keBody,
      styles: {
        fontSize: 7.5,
        textColor: C_DGRAY,
        cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
        lineColor: C_LBORD,
        lineWidth: 0.15,
        overflow: "linebreak",
      },
      headStyles: { fillColor: C_BLUE, textColor: C_WHITE, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: C_LGRAY },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: "bold", textColor: C_BLUE },
        1: { cellWidth: 48 },
        2: { cellWidth: 14, halign: "center", textColor: C_MGRAY },
        3: { cellWidth: 23, halign: "right", fontStyle: "bold" },
        4: { cellWidth: 18, halign: "right", textColor: C_MGRAY, fontSize: 7 },
        5: { cellWidth: 25, fontSize: 7 },
        6: { cellWidth: CW - 166, fontSize: 7 },
      },
    });
  }
  y = fy(doc) + 6;

  // ── 8. Calculation Detail ─────────────────────────────────────────────────────
  if (y > BOT - 20) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
  y = secBar(doc, y, "8  -  Calculation Detail");
  y += 4;
  const calcLines: string[] = [];

  // Colour branch chain
  calcLines.push("Colour-Reduction Chain:");
  calcLines.push(`  DELTA_COLOUR      = INLET_COLOUR - TARGET_COLOUR = ${fmtOr(r.deltaColour, 2)} ASTM`);
  calcLines.push(`  OIL_INPUT_KL      = REQUIRED_CPS_CAPACITY_L / 1,000 = ${(Number(sizingCase.cps_feed_capacity) / 1000).toFixed(3)} kL`);
  calcLines.push(`  REQUIRED_MEDIA_KG = OIL_INPUT_KL x DELTA_COLOUR x COLOUR_ABS_FACTOR [f_C, KE] = ${fmtOr(r.requiredMediaKg, 0)} kg`);
  calcLines.push(`  RAW_REQUIRED_COLUMNS = REQUIRED_MEDIA_KG / MEDIA_WT_PER_COL [KE] = ${fmtOr(r.rawRequiredColumns, 4)}`);
  calcLines.push(`  INSTALLED_COLUMNS = ceil(round(RAW, 6) / COLUMNS_PER_MODULE) x COLUMNS_PER_MODULE = ${fmtOr(r.installedColumns, 0)}`);

  if (sulphur) {
    calcLines.push("");
    calcLines.push("Sulphur Mass-Balance Iteration Chain:");
    calcLines.push(`  Iterates N = COLUMNS_PER_MODULE, 2xCPM, 3xCPM ... (safety guard: 10,000 columns)`);
    calcLines.push(`  For each N: evaluates sulphur absorption balance and tests N >= RAW_REQUIRED_COLUMNS.`);
    calcLines.push(`  Solver status: ${r.sulphurSolveFailed ? "WARNING: FAILED - no feasible solution found" : "OK - converged"}`);
    calcLines.push(`  Installed Columns (solver result): ${fmtOr(r.installedColumns, 0)}`);
  }

  calcLines.push("");
  calcLines.push("Capacity Validation (report-only - does not alter sizing):");
  calcLines.push(`  Required Finished Product Capacity: ${sizingCase.cps_feed_capacity} L/Day`);
  const calcCap2 = calcFinishedCapLDay(r);
  if (calcCap2 !== null) {
    const capPass2 = Math.abs(calcCap2 - Number(sizingCase.cps_feed_capacity)) / Math.max(Number(sizingCase.cps_feed_capacity), 1) < 0.01;
    calcLines.push(`  Calculated Finished Product Capacity: ${fmt(calcCap2, 2)} L/Day`);
    calcLines.push(`    = (FINISHED_OIL_KG_PER_CYCLE / BASE_OIL_SG) x 24 / TOTAL_CYCLE_TIME_H`);
    calcLines.push(`    = (${fmt(r.mb?.finishedOilKg ?? 0, 3)} / ${fmtOr(r.baseOilSg, 4)}) x 24 / ${fmtOr(r.totalCycleTimeH, 4)} h`);
    calcLines.push(`  Capacity Check: ${capPass2 ? "PASS" : "FAIL"}`);
  } else {
    calcLines.push(`  Calculated Finished Product Capacity: Not calculated (BASE_OIL_SG or total cycle time not resolved)`);
  }

  calcLines.push("");
  calcLines.push("Module Rounding:");
  calcLines.push(`  NUMBER_OF_20-COLUMN_MODULES = INSTALLED_COLUMNS / COLUMNS_PER_MODULE = ${fmtOr(r.numberOfSkids, 0)}`);

  calcLines.push("");
  calcLines.push("Rotating Equipment Skid Selection:");
  calcLines.push(`  Algorithm: P1 min spare -> P2 fewest skids -> P3 lex-largest standard cap.`);
  calcLines.push(`  Installed Columns required: ${fmtOr(r.installedColumns, 0)}`);
  calcLines.push(`  Selected configuration: ${r.skidConfig ?? "-"}`);
  calcLines.push(`  Total skid capacity: ${fmtOr(r.totalSkidCapacity, 0)} columns`);
  calcLines.push(`  Spare capacity: ${fmtOr(r.skidSpareCapacity, 0)} columns`);

  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_DGRAY);
  for (const line of calcLines) {
    if (y > BOT - 6) {
      doc.addPage();
      addChrome(doc, sub, co);
      y = TOP + 4;
    }
    doc.text(line, ML + 1, y);
    y += 5;
  }
  y += 4;

  // ── 9. Engineering Governance ──────────────────────────────────────────────────
  if (y > BOT - 40) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
  y = secBar(doc, y, "9  -  Engineering Governance");
  y += 4;

  const govRows: [string, string, boolean][] = [
    [
      "Treatment Branch",
      sulphur
        ? "COLOUR_ODOR_SULPHUR - sulphur mass-balance iteration"
        : "COLOUR_ODOR - colour reduction formula",
      false,
    ],
    [
      "Sulphur Solver",
      sulphur
        ? (r.sulphurSolveFailed
            ? "WARNING: FAILED - no feasible solution found within safety guard (10,000 columns)"
            : "PASS - Converged successfully")
        : "N/A",
      sulphur && r.sulphurSolveFailed,
    ],
    [
      "Capacity Warning",
      r.capacityInsufficient
        ? "WARNING: INSTALLED CAPACITY BELOW REQUIRED CAPACITY - review feed conditions"
        : "PASS - None",
      r.capacityInsufficient,
    ],
    [
      "KE Snapshot",
      snap
        ? `PASS - Frozen at ${dateStr(snap.calculation_timestamp)}`
        : "WARNING: NOT AVAILABLE - Recalculate has not been run",
      !snap,
    ],
    [
      "Report Basis",
      "This report represents the latest successful CPS sizing calculation using the Knowledge Engine parameter snapshot frozen at the stated recalculation timestamp.",
      false,
    ],
    [
      "KE Values in Report",
      "VALUE / UNIT / PARAMETER_TYPE / CATEGORY sourced from ke_snapshot (frozen at Recalculate). parameter_name / symbol sourced from live KE data (descriptive enrichment only).",
      false,
    ],
  ];

  doc.setFontSize(8.5);
  for (const [key, val, warn] of govRows) {
    if (y > BOT - 6) { doc.addPage(); addChrome(doc, sub, co); y = TOP + 4; }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_BLUE);
    doc.text(`${key}:`, ML + 2, y);
    doc.setFont("helvetica", "normal");
    const isPass = val.startsWith("PASS");
    const col: [number, number, number] = warn ? C_RED : (isPass ? [22, 101, 52] : C_DGRAY);
    doc.setTextColor(...col);
    const vLines = doc.splitTextToSize(val, CW - 58);
    doc.text(vLines, ML + 56, y);
    y += Math.max(6, vLines.length * 5);
  }

  doc.save(`CPS_Sizing_${safe(sizingCase.customer_name)}_Internal.pdf`);
}
