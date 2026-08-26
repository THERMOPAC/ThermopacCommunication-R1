import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

type AnyRecord = Record<string, any>;

const RUN_ID = 948;
const OUT = path.resolve("reports/LLX-RND-2026-0003-ECR2-Run-948-Review.pdf");
const COMPONENTS = ["Saturates", "Mono-aromatics", "Di-aromatics", "Poly-aromatics", "NMP"];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function valueAt(object: AnyRecord | null | undefined, ...keys: string[]): any {
  for (const key of keys) {
    if (object && object[key] !== undefined && object[key] !== null && object[key] !== "") return object[key];
  }
  return null;
}

function fmt(value: any, digits = 4): string {
  if (value === null || value === undefined || value === "") return "NOT RECORDED";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (number === 0) return "0";
  if (Math.abs(number) >= 10000 || Math.abs(number) < 0.0001) return number.toExponential(Math.max(1, digits - 1));
  return number.toFixed(digits).replace(/\.?0+$/, "");
}

function safeText(value: any): string {
  return String(value ?? "")
    .replace(/×/g, "x")
    .replace(/−/g, "-")
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/₃₂/g, "32")
    .replace(/₍/g, "(")
    .replace(/₎/g, ")")
    .replace(/°/g, " deg")
    .replace(/τ/g, "tau")
    .replace(/φ/g, "phi")
    .replace(/ρ/g, "rho")
    .replace(/γ/g, "gamma")
    .replace(/Δ/g, "delta")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=");
}

function localDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

async function main() {
  const query = await pool.query(
    "SELECT id, revision_id, calculation_type, engine_name, engine_version, calculation_class, calculation_status, calculated_at, warnings, validation_issues, input_snapshot, result_snapshot FROM design_software_calculation_runs WHERE id = $1",
    [RUN_ID],
  );
  if (!query.rows[0]) throw new Error(`Run #${RUN_ID} was not found`);

  const run = query.rows[0] as AnyRecord;
  const input = run.input_snapshot as AnyRecord;
  const result = run.result_snapshot as AnyRecord;
  const ideal = (result.idealStageCascade || {}) as AnyRecord;
  const bvp = (result.bvp || {}) as AnyRecord;
  const height = (result.heightSizing || {}) as AnyRecord;
  const progressive = (result.progressiveCompartmentSizing || {}) as AnyRecord;
  const thermo = (result.thermodynamicTemperatureValidation || {}) as AnyRecord;
  const transfer = (result.transferStatus || {}) as AnyRecord;
  const forward = (result.forwardSimulationStatus || {}) as AnyRecord;
  const d32 = (result.d32 || {}) as AnyRecord;
  const holdup = (result.holdupCorrelation || {}) as AnyRecord;

  const outputDir = path.dirname(OUT);
  fs.mkdirSync(outputDir, { recursive: true });
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 44, right: 44 },
    bufferPages: true,
    info: {
      Title: "LLX-RND-2026-0003 - ECR-2 Simulation Run 948 Review",
      Author: "Thermopac Engineering",
      Subject: "Frozen ECR-2 simulation run audit",
    },
  });
  doc.pipe(fs.createWriteStream(OUT));

  const colors = {
    navy: "#15324B",
    blue: "#256B8F",
    ink: "#1F2933",
    muted: "#5B6873",
    line: "#D7DEE5",
    paleBlue: "#EAF3F8",
    paleAmber: "#FFF7E6",
    paleRed: "#FDECEC",
    amber: "#8A5A00",
    red: "#B42318",
    green: "#176B42",
    white: "#FFFFFF",
  };
  const left = 44;
  const contentWidth = 507;
  const bottom = 770;

  function footer(page: number) {
    doc.save()
      .font("Helvetica")
      .fontSize(8)
      .fillColor(colors.muted)
      .text(`LLX-RND-2026-0003 | ECR-2 Run #${RUN_ID}`, left, 780, { width: contentWidth })
      .text(`Page ${page}`, left, 780, { width: contentWidth, align: "right" })
      .restore();
  }

  function ensure(height = 48) {
    if (doc.y + height > bottom) {
      doc.addPage();
      doc.y = 52;
    }
  }

  function heading(text: string, subtitle?: string) {
    ensure(54);
    doc.x = left;
    doc.moveDown(0.25);
    doc.font("Helvetica-Bold").fontSize(15).fillColor(colors.navy).text(safeText(text), { width: contentWidth });
    if (subtitle) doc.font("Helvetica").fontSize(8.5).fillColor(colors.muted).text(safeText(subtitle), { width: contentWidth });
    doc.moveDown(0.3);
  }

  function paragraph(text: string, options: AnyRecord = {}) {
    ensure(30);
    doc.x = left;
    doc.font(options.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(options.size || 9)
      .fillColor(options.color || colors.ink)
      .text(safeText(text), { width: contentWidth, lineGap: 2 });
    doc.moveDown(0.16);
  }

  function callout(text: string, fill: string, stroke: string, color = colors.ink) {
    ensure(54);
    const height = doc.heightOfString(safeText(text), {
      width: contentWidth - 24,
      font: "Helvetica-Bold",
      fontSize: 9,
      lineGap: 2,
    }) + 20;
    const y = doc.y;
    doc.roundedRect(left, y, contentWidth, height, 5).fillAndStroke(fill, stroke);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(color).text(safeText(text), left + 12, y + 10, {
      width: contentWidth - 24,
      lineGap: 2,
    });
    doc.y = y + height + 9;
  }

  function table(headers: string[], rows: string[][], widths: number[], options: AnyRecord = {}) {
    const headerHeight = options.headerHeight || 22;
    const rowFont = options.rowFont || 8;
    const pad = 4;
    const total = widths.reduce((a, b) => a + b, 0);

    const drawHeader = () => {
      ensure(headerHeight + 10);
      const y = doc.y;
      doc.rect(left, y, total, headerHeight).fill(colors.navy);
      let x = left;
      headers.forEach((header, index) => {
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.white).text(safeText(header), x + pad, y + 6, {
          width: widths[index] - pad * 2,
          height: headerHeight - 8,
          ellipsis: true,
        });
        x += widths[index];
      });
      doc.y = y + headerHeight;
    };

    drawHeader();
    rows.forEach((row, rowIndex) => {
      const heights = row.map((cell, index) =>
        Math.max(19, doc.heightOfString(safeText(cell), {
          width: widths[index] - pad * 2,
          font: "Helvetica",
          fontSize: rowFont,
          lineGap: 1,
        }) + pad * 2),
      );
      const height = Math.max(...heights);
      if (doc.y + height > bottom) {
        doc.addPage();
        doc.y = 52;
        drawHeader();
      }
      const y = doc.y;
      doc.rect(left, y, total, height).fill(rowIndex % 2 ? "#F6F8FA" : colors.white).stroke(colors.line);
      let x = left;
      row.forEach((cell, index) => {
        doc.font(index === 0 && options.firstBold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(rowFont)
          .fillColor(options.color || colors.ink)
          .text(safeText(cell), x + pad, y + pad, {
            width: widths[index] - pad * 2,
            height: height - pad,
            lineGap: 1,
          });
        x += widths[index];
      });
      doc.y = y + height;
    });
    doc.moveDown(0.45);
  }

  function keyValue(rows: string[][]) {
    table(["Item", "Stored value"], rows, [190, 317], { firstBold: true, rowFont: 8.2 });
  }

  function bullet(text: string, color = colors.ink) {
    ensure(22);
    doc.font("Helvetica").fontSize(8.6).fillColor(color).text(`- ${safeText(text)}`, left + 8, doc.y, {
      width: contentWidth - 8,
      lineGap: 2,
    });
    doc.moveDown(0.08);
  }

  const composition = valueAt(input, "feedCompositionMassFraction") || {};
  const rrboFeed = Number(valueAt(input, "rrboMassFlow_kg_h", "feedFlow") ?? 0);
  const nmpFeed = Number(valueAt(input, "nmpMassFlow_kg_h") ?? 0);
  const tempC = Number(valueAt(input, "operatingTemperatureC", "operating_temperature") ?? 0);
  const target = Number(valueAt(input, "target_raffinate_aromatics_mol") ?? 0);
  const phase = valueAt(input, "phaseConfiguration", "phase_configuration") || "NOT RECORDED";
  const statusLabel = ideal.statusLabel || "THERMODYNAMIC SURROGATE-TO-PHYSICAL MAPPING NOT CLOSED";
  const bvpFailure = bvp.failure?.message || bvp.diagnostics?.[0] || "No accepted BVP result was persisted.";
  const exactTime = localDate(run.calculated_at);
  const warningRows = (Array.isArray(run.warnings) ? run.warnings : []).map((warning: AnyRecord) => [
    String(warning.code || "WARNING"),
    String(warning.message || warning),
  ]);

  // Cover and executive interpretation.
  doc.rect(0, 0, 595, 842).fill("#F7FAFC");
  doc.rect(0, 0, 595, 132).fill(colors.navy);
  doc.font("Helvetica-Bold").fontSize(25).fillColor(colors.white).text("ECR-2 SIMULATION REVIEW", left, 38);
  doc.font("Helvetica").fontSize(11.5).fillColor("#D9E8F1").text("LLX-RND-2026-0003 | Frozen Run Audit", left, 76);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.white).text(`Run #${RUN_ID}`, left, 101);
  doc.font("Helvetica").fontSize(10).fillColor("#D9E8F1").text(`${exactTime} IST`, left + 76, 102);
  doc.y = 158;
  doc.font("Helvetica-Bold").fontSize(18).fillColor(colors.navy).text("Run review and engineering disposition");
  doc.moveDown(0.5);
  paragraph(
    `This report reviews the persisted ECR-2 Simulator snapshot for Run #${RUN_ID}. It does not rerun the engine, alter the database, or reconstruct missing results. The run was created from Revision ${run.revision_id} on ${exactTime} IST.`,
    { size: 10 },
  );
  callout(
    "DISPOSITION: NOT CALCULABLE. The run failed closed before an accepted physical BVP, ideal-stage cascade, theoretical stage count, or RRBO recovery was available. This is a calculation/dependency block, not a finding that the process is infeasible.",
    colors.paleRed,
    "#E6B8B3",
    colors.red,
  );
  heading("Run identity");
  keyValue([
    ["Run ID", `#${run.id}`],
    ["Revision", String(run.revision_id)],
    ["Created", `${run.calculated_at} UTC`],
    ["User-facing time", `${exactTime} IST`],
    ["Calculation type", String(run.calculation_type)],
    ["Engine", `${run.engine_name} v${run.engine_version}`],
    ["Calculation class", String(run.calculation_class)],
    ["Persisted run status", String(run.calculation_status).toUpperCase()],
    ["Calculation status", String(result.calculationRunStatus || "counter_current_bvp_not_accepted")],
    ["Reporting status", String(result.reportingStatus?.status || result.reportingStatus?.label || "NOT_CALCULABLE")],
  ]);

  // Frozen input basis.
  heading("1. Frozen input basis", "Values below are read from input_snapshot; blanks remain reported as not recorded.");
  keyValue([
    ["Operating / extraction temperature", `${fmt(tempC, 2)} deg C / ${fmt(tempC + 273.15, 2)} K`],
    ["RRBO feed", `${fmt(rrboFeed, 3)} kg/h`],
    ["NMP feed", `${fmt(nmpFeed, 3)} kg/h`],
    ["Solvent-to-oil ratio", fmt(valueAt(input, "solventToOilRatio", "so_ratio"), 6)],
    ["NMP purity", fmt(valueAt(input, "nmpPurity", "nmp_purity_value"), 4)],
    ["Phase configuration", phase],
    ["Raffinate aromatic target", `${fmt(target, 4)} mol%; hydrocarbon-only physical outlet basis`],
    ["Requested theoretical stages", fmt(valueAt(input, "theoretical_stages"), 0)],
    ["User column height", `${fmt(valueAt(input, "column_height_m"), 4)} m`],
    ["Column diameter input", `${fmt(valueAt(input, "column_diameter"), 4)} m`],
    ["Stage 8 system acceptance", String(valueAt(input, "stage8_system_values_acceptance_status") || "NOT RECORDED")],
  ]);
  table(
    ["RRBO component", "Stored mass fraction", "Approx. feed flow"],
    [
      ["Saturates", fmt(composition.saturates, 4), `${fmt(rrboFeed * Number(composition.saturates || 0), 3)} kg/h`],
      ["Mono-aromatics", fmt(composition.mono, 4), `${fmt(rrboFeed * Number(composition.mono || 0), 3)} kg/h`],
      ["Di-aromatics", fmt(composition.di, 4), `${fmt(rrboFeed * Number(composition.di || 0), 3)} kg/h`],
      ["Poly-aromatics", fmt(composition.poly, 4), `${fmt(rrboFeed * Number(composition.poly || 0), 3)} kg/h`],
      ["Total RRBO", fmt(Number(composition.saturates || 0) + Number(composition.mono || 0) + Number(composition.di || 0) + Number(composition.poly || 0), 4), `${fmt(rrboFeed, 3)} kg/h`],
    ],
    [170, 150, 187],
    { firstBold: true, rowFont: 8 },
  );

  // Gate review.
  heading("2. Gate-by-gate review", "Each gate is classified from the frozen result snapshot.");
  table(
    ["Gate / surface", "Stored disposition", "Review finding"],
    [
      ["Thermodynamic coordinate mapping", "BLOCKED", "Coto surrogate mole coordinates are not a validated physical RRBO pseudo-component balance."],
      ["Ideal-stage cascade", statusLabel, "nT is null; zero trials; no selected stage count; no recovery reconciliation."],
      ["Physical height sizing", String(height.status || "not_calculable").toUpperCase(), "Initial 0.0100 m trial rejected because K&H 1995 holdup is physically invalid."],
      ["Counter-current BVP", String(bvp.status || "blocked").toUpperCase(), "No accepted outlets, residual vector, axial profile, or compartments persisted."],
      ["Independent 30% compartments", String(progressive.status || "blocked").toUpperCase(), "Correctly not run before a same-specification ideal-stage result existed."],
      ["Transfer output", String(transfer.status || "LOCAL_PRELIMINARY_BLOCKED"), "Governed transfer values unavailable; release status not eligible."],
      ["Optimizer", String(forward.optimizer || "NOT IMPLEMENTED"), "Downstream of an accepted BVP and therefore not executable."],
    ],
    [145, 145, 217],
    { rowFont: 7.6, firstBold: true },
  );
  callout(
    `Primary blocker: ${statusLabel}. The current model must not use either surrogate molecular weights or physical RRBO pseudo-component molecular weights as a validated bridge into the Coto NRTL coordinate. No ideal-stage NRTL recovery is therefore calculated.`,
    colors.paleAmber,
    "#E7B85C",
    colors.amber,
  );
  bullet("The historical 53.6715% recovery is explicitly labelled an unvalidated historical sensitivity and is not a Run #948 result.", colors.red);
  bullet("The absence of a theoretical stage count is a calculation block; it must not be translated into process infeasibility.", colors.red);

  // No-result evidence.
  heading("3. Ideal-stage and BVP result evidence");
  keyValue([
    ["Ideal-stage status", statusLabel],
    ["Theoretical stage count, nT", fmt(ideal.nT, 0)],
    ["Ideal-stage trial count", Array.isArray(ideal.trials) ? String(ideal.trials.length) : "NOT RECORDED"],
    ["Selected ideal-stage trial", ideal.selected === null || ideal.selected === undefined ? "NONE" : JSON.stringify(ideal.selected)],
    ["Independent recovery reconciliation", ideal.reconciliation ? "PRESENT" : "NOT AVAILABLE"],
    ["Ideal-stage diagnostic count", Array.isArray(ideal.diagnostics) ? String(ideal.diagnostics.length) : "NOT RECORDED"],
    ["BVP status", String(bvp.status || "blocked").toUpperCase()],
    ["BVP iterations", fmt(bvp.iterations, 0)],
    ["BVP outlets", bvp.outlets?.raffinate || bvp.outlets?.extract ? "PARTIAL" : "NONE"],
    ["BVP failure", bvpFailure],
    ["Required active height", `${fmt(height.requiredActiveHeight_m, 4)} m`],
    ["Required height status", String(height.requiredActiveHeightStatus || height.status || "NOT_CALCULATED").toUpperCase()],
    ["Recovery result", "NOT CALCULATED"],
  ]);
  if (Array.isArray(ideal.diagnostics)) {
    paragraph("Persisted ideal-stage diagnostics:", { bold: true });
    ideal.diagnostics.forEach((message: string) => bullet(message, colors.muted));
  }
  paragraph("The frozen snapshot contains no physical raffinate or extract outlet flows from which to calculate product quality or NMP-free RRBO recovery.", {
    bold: true,
    color: colors.red,
  });

  // Thermodynamics / physical basis.
  heading("4. Thermodynamic and physical-basis limitations");
  keyValue([
    ["Operating temperature classification", String(thermo.temperatureStatus || "EXTRAPOLATED")],
    ["Selected temperature", `${fmt(thermo.operatingTemperatureC ?? tempC, 2)} deg C / ${fmt(thermo.operatingTemperatureK ?? tempC + 273.15, 2)} K`],
    ["Nearest admitted evidence", `${fmt(thermo.nearestAdmittedTemperatureK, 2)} K`],
    ["Distance outside admitted range", `${fmt(thermo.distanceFromNearestAdmittedTemperatureK, 2)} K`],
    ["Selected-temperature applicability", String(thermo.selectedTemperatureApplicability || "EXTRAPOLATED_PRELIMINARY")],
    ["NRTL calibration reproduction", String(thermo.calibrationTemperatureReproduction?.status || "FAIL")],
    ["Tie-lines within gate", `${fmt(thermo.calibrationTemperatureReproduction?.tieLinesWithinGate, 0)} / ${fmt(thermo.calibrationTemperatureReproduction?.tieLinesTotal, 0)}`],
    ["Maximum calibration deviation", fmt(thermo.calibrationTemperatureReproduction?.maxAbsDeviation, 4)],
    ["Independent multi-temperature validation", String(thermo.independentMultiTemperatureValidation?.status || "INSUFFICIENT_EVIDENCE")],
    ["Optimizer-forward thermodynamic readiness", String(thermo.optimizerForwardThermodynamicReadiness || "NOT_READY")],
    ["d32 status", String(d32.label || d32.status || "PRELIMINARY")],
    ["d32 nominal", `${fmt(d32.d32_mm, 6)} mm`],
    ["Holdup status", String(holdup.status || "physically_invalid")],
    ["Holdup raw value", fmt(holdup.phi_raw ?? holdup.phiRaw, 6)],
  ]);
  paragraph(
    "At 50 deg C the run-level LLE flash is classified preliminary temperature extrapolation from the admitted 298.15 K evidence point. The active NRTL form is calibration-temperature-only, and its reproduction check fails the 3·u(x) gate (2 of 13 tie-lines within gate; maximum absolute deviation 0.092). This is recorded as a limitation, not hidden as a successful validation.",
    { color: colors.amber },
  );

  // Warnings and disposition.
  heading("5. Persisted warnings and final disposition");
  if (warningRows.length) {
    table(["Code", "Stored warning"], warningRows, [150, 357], { rowFont: 7.3, firstBold: true });
  } else {
    paragraph("No run-level warnings were stored.", { color: colors.muted });
  }
  const validationRows = Array.isArray(run.validation_issues)
    ? run.validation_issues.map((issue: AnyRecord) => [String(issue.code || "ISSUE"), String(issue.message || issue)])
    : [];
  if (validationRows.length) {
    paragraph("Persisted validation issues:", { bold: true });
    table(["Code", "Stored issue"], validationRows, [150, 357], { rowFont: 7.3, firstBold: true });
  }
  callout(
    "FINAL ENGINEERING DISPOSITION: Run #948 is NOT CALCULABLE and NOT RELEASE ELIGIBLE. It establishes no valid ECR-2 N_T, no hydrocarbon-only raffinate aromatic result, no NMP-free RRBO recovery, no accepted physical height, and no governed transfer performance.",
    colors.paleRed,
    "#E6B8B3",
    colors.red,
  );
  paragraph(
    "Recommended next action: close the surrogate-to-physical mapping with direct evidence or a separately governed calibration, then create a new run. The new run must independently pass the ideal-stage recovery reconciliation, physical BVP acceptance, terminal component/total balances, and the 95% NMP-free RRBO recovery requirement before any result can support engineering selection.",
    { size: 9, bold: true },
  );
  const pageCount = doc.bufferedPageRange().count;
  for (let index = 0; index < pageCount; index += 1) {
    doc.switchToPage(index);
    footer(index + 1);
  }
  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.on("finish", resolve);
    doc.on("error", reject);
  });
  await pool.end();
  console.log(JSON.stringify({ output: OUT, run: RUN_ID, pages: doc.bufferedPageRange().count }));
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});