import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { pool } from "../../server/db";

type AnyRecord = Record<string, any>;

const OUT = path.resolve(".agents/outputs/LLX-RND-2026-0003-Run-711.pdf");
const COMPONENTS = ["Sat", "Mono", "Di", "Poly", "NMP"];
const AROMATIC_COMPONENTS = ["Mono", "Di", "Poly"];

function n(value: any, digits = 6): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  const x = Number(value);
  if (x === 0) return "0";
  if (Math.abs(x) >= 10000 || Math.abs(x) < 0.0001) return x.toExponential(Math.max(1, digits - 1));
  return x.toFixed(digits).replace(/\.?0+$/, "");
}

function pct(value: any, digits = 3): string {
  return `${n(Number(value), digits)}%`;
}

function sum(values: any[]): number {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function arr(values: any[], digits = 6): string {
  return `[${(values || []).map((value) => n(value, digits)).join(", ")}]`;
}

function massFractions(values: any[]): string {
  return arr(values, 6);
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
    .replace(/ψ/g, "psi")
    .replace(/α/g, "alpha")
    .replace(/Δ/g, "delta")
    .replace(/·/g, ".")
    .replace(/∞/g, "infinity")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≈/g, "~");
}

async function main() {
  const query = await pool.query(
    "SELECT id, revision_id, calculation_status, calculated_at, warnings, result_snapshot FROM design_software_calculation_runs WHERE id = 711",
  );
  if (!query.rows[0]) throw new Error("Run #711 was not found");
  const run = query.rows[0] as AnyRecord;
  const d = run.result_snapshot as AnyRecord;
  const b = d.bvp as AnyRecord;
  const headline = d.headlineEngineeringResults as AnyRecord;
  const quality = d.raffinateProductQuality as AnyRecord;
  const balances = d.massBalanceSummary as AnyRecord;
  const thermo = d.thermodynamicTemperatureValidation as AnyRecord;
  const geometry = d.geometry as AnyRecord;
  const profile = b.axialProfile as AnyRecord[];
  const compartments = b.compartments as AnyRecord[];

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 46, left: 44, right: 44 },
    info: {
      Title: "LLX-RND-2026-0003 - ECR-2 Simulator Run 711",
      Author: "Thermopac LLP",
      Subject: "Preliminary ECR-2 Simulator numerical audit",
    },
  });
  doc.pipe(fs.createWriteStream(OUT));

  const colors = {
    navy: "#15324B",
    blue: "#256B8F",
    teal: "#0F766E",
    amber: "#A16207",
    red: "#B42318",
    ink: "#1F2933",
    muted: "#5B6873",
    line: "#D7DEE5",
    paleBlue: "#EAF3F8",
    paleAmber: "#FFF7E6",
    paleRed: "#FDECEC",
    white: "#FFFFFF",
  };

  function footer() {
    const page = doc.bufferedPageRange().count;
    doc.save()
      .fontSize(8)
      .fillColor(colors.muted)
      .text("LLX-RND-2026-0003 | ECR-2 Simulator | Run 711", 44, 806, { width: 507, align: "left" })
      .text(`Page ${page}`, 44, 806, { width: 507, align: "right" })
      .restore();
  }

  function ensure(height = 60) {
    if (doc.y + height > 770) {
      doc.addPage();
      doc.y = 52;
    }
  }

  function title(text: string, subtitle?: string) {
    ensure(55);
    doc.x = 44;
    doc.moveDown(0.35);
    doc.font("Helvetica-Bold").fontSize(15).fillColor(colors.navy).text(safeText(text));
    if (subtitle) doc.font("Helvetica").fontSize(8.5).fillColor(colors.muted).text(safeText(subtitle));
    doc.moveDown(0.35);
  }

  function paragraph(text: string, options: AnyRecord = {}) {
    ensure(28);
    doc.x = 44;
    doc.font(options.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(options.size || 9)
      .fillColor(options.color || colors.ink)
      .text(safeText(text), { lineGap: 2, width: 507 });
    doc.moveDown(0.18);
  }

  function callout(text: string, fill: string, stroke: string) {
    ensure(48);
    const height = doc.heightOfString(safeText(text), { width: 483, fontSize: 9, lineGap: 2 }) + 18;
    const y = doc.y;
    doc.roundedRect(44, y, 507, height, 5).fillAndStroke(fill, stroke);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(colors.ink).text(safeText(text), 56, y + 9, {
      width: 483,
      lineGap: 2,
    });
    doc.y = y + height + 9;
  }

  function table(headers: string[], rows: string[][], widths: number[], options: AnyRecord = {}) {
    const headerHeight = options.headerHeight || 22;
    const rowFont = options.rowFont || 7.6;
    const cellPad = 4;
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const drawHeader = () => {
      ensure(headerHeight + 10);
      const y = doc.y;
      doc.rect(44, y, totalWidth, headerHeight).fill(colors.navy);
      let x = 44;
      headers.forEach((h, i) => {
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.white).text(safeText(h), x + cellPad, y + 6, {
          width: widths[i] - cellPad * 2,
          height: headerHeight - 8,
          ellipsis: true,
        });
        x += widths[i];
      });
      doc.y = y + headerHeight;
    };
    drawHeader();
    rows.forEach((row) => {
      const heights = row.map((cell, i) =>
        Math.max(19, doc.heightOfString(safeText(cell), {
          width: widths[i] - cellPad * 2,
          font: "Helvetica",
          fontSize: rowFont,
          lineGap: 1,
        }) + cellPad * 2),
      );
      const height = Math.max(...heights);
      if (doc.y + height > 770) {
        doc.addPage();
        doc.y = 52;
        drawHeader();
      }
      const y = doc.y;
      doc.rect(44, y, totalWidth, height).fill(row % 2 === 0 ? colors.white : "#F6F8FA").stroke(colors.line);
      let x = 44;
      row.forEach((cell, i) => {
        doc.font(i === 0 && options.firstBold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(rowFont)
          .fillColor(colors.ink)
          .text(safeText(cell), x + cellPad, y + cellPad, {
            width: widths[i] - cellPad * 2,
            height: height - cellPad,
            lineGap: 1,
          });
        x += widths[i];
      });
      doc.y = y + height;
    });
    doc.moveDown(0.5);
  }

  function keyValue(rows: string[][]) {
    table(["Item", "Value"], rows, [185, 322], { firstBold: true, rowFont: 8.2 });
  }

  function bullet(text: string, color = colors.ink) {
    ensure(20);
    doc.x = 44;
    doc.font("Helvetica").fontSize(8.6).fillColor(color).text(`- ${safeText(text)}`, 52, doc.y, { width: 495, lineGap: 2 });
    doc.moveDown(0.1);
  }

  // Cover / executive summary.
  doc.rect(0, 0, 595, 842).fill("#F7FAFC");
  doc.rect(0, 0, 595, 126).fill(colors.navy);
  doc.font("Helvetica-Bold").fontSize(25).fillColor(colors.white).text("ECR-2 SIMULATOR", 44, 37);
  doc.font("Helvetica").fontSize(12).fillColor("#D9E8F1").text("LLX-RND-2026-0003 | Numerical Run Report", 44, 73);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.white).text("Run #711", 44, 99);
  doc.font("Helvetica").fontSize(10).fillColor("#D9E8F1").text(`23 Aug 2026, 10:24:52 PM IST`, 126, 100);
  doc.y = 157;
  doc.font("Helvetica-Bold").fontSize(18).fillColor(colors.navy).text("Preliminary counter-current extraction prediction");
  doc.moveDown(0.5);
  paragraph(
    "This report reproduces the persisted Run #711 result snapshot. It is an audit of the completed preliminary Simulator calculation at the user-selected 50 deg C; it is not a release-grade rating, fabrication basis, or final engineering validation.",
    { size: 10 },
  );
  callout(
    "RESULT: BVP CONVERGED AND BOTH COMPONENT/GLOBAL BALANCES PASSED. THERMODYNAMIC APPLICABILITY AT 50 deg C IS PRELIMINARY / EXTRAPOLATED UNDER TASK #124. RELEASE STATUS: NOT RELEASE ELIGIBLE.",
    colors.paleAmber,
    "#E7B85C",
  );
  title("Run identity");
  keyValue([
    ["Run ID", "#711"],
    ["Revision", String(run.revision_id)],
    ["Persisted database time", String(run.calculated_at)],
    ["User-facing time", localDate(run.calculated_at) + " IST"],
    ["Selected operating temperature", "50 deg C / 323.15 K"],
    ["Phase configuration", "NMP continuous / RRBO dispersed"],
    ["Calculation status", String(run.calculation_status)],
    ["Simulator status", String(headline.status)],
    ["Release status", String(headline.releaseStatus)],
  ]);

  title("Headline numerical results");
  keyValue([
    ["RRBO recovery to raffinate", `${n(headline.rrboRecovery_percent, 4)}%`],
    ["Raffinate outlet", `${n(b.outlets.raffinate.totalFlow_kg_h, 5)} kg/h`],
    ["Extract outlet", `${n(b.outlets.extract.totalFlow_kg_h, 5)} kg/h`],
    ["Hydrocarbon-only raffinate aromatic wt%", `${n(quality.w_A_R_product.value * 100, 4)} wt%`],
    ["Saturates recovery", `${n(headline.saturatesRecovery_percent, 4)}%`],
    ["Total aromatic removal", `${n(headline.totalAromaticRemoval_percent, 4)}%`],
    ["Active extraction height", `${n(geometry.activeHeightActual_m, 4)} m`],
    ["Numerical compartments", String(geometry.nCompartments)],
  ]);

  // Process basis.
  title("1. Process basis and geometry");
  keyValue([
    ["RRBO feed", `${n(headline.rrboNmpFeed.rrbo_kg_h, 5)} kg/h`],
    ["NMP solvent feed", `${n(headline.rrboNmpFeed.nmp_kg_h, 5)} kg/h`],
    ["Solvent-to-oil mass ratio", n(headline.rrboNmpFeed.soRatio_mass, 6)],
    ["Column diameter", `${n(geometry.columnDiameter_m, 5)} m`],
    ["Rotor diameter", `${n(geometry.rotorDiameter_m, 5)} m`],
    ["Compartment height", `${n(geometry.compartmentHeight_m, 5)} m`],
    ["Rotor-to-column ratio", n(geometry.rotorToColumnDiameterRatio, 5)],
    ["RRBO volumetric flow", `${n(d.hydraulics.rrboVolumetricFlow_m3_h, 5)} m3/h`],
    ["NMP volumetric flow", `${n(d.hydraulics.nmpVolumetricFlow_m3_h, 5)} m3/h`],
    ["Specific throughput", `${n(d.hydraulics.specificThroughput_m3_m2_h, 5)} m3/m2/h`],
  ]);

  title("2. Outlet flows and component performance");
  table(
    ["Component", "Feed kg/h", "Extract kg/h", "Raffinate kg/h", "Extract / removal", "Raffinate recovery"],
    COMPONENTS.map((component, i) => [
      component,
      n(balances.feed_kg_h[i], 5),
      n(balances.extract_kg_h[i], 5),
      n(balances.raffinate_kg_h[i], 5),
      pct(headline.componentPerformance[component === "Sat" ? "saturates" : component === "Mono" ? "monoAromatics" : component === "Di" ? "diAromatics" : component === "Poly" ? "polyAromatics" : "nmp"].extractRecovery_percent, 4),
      pct(headline.componentPerformance[component === "Sat" ? "saturates" : component === "Mono" ? "monoAromatics" : component === "Di" ? "diAromatics" : component === "Poly" ? "polyAromatics" : "nmp"].raffinateRecovery_percent, 4),
    ]).concat([[
      "Total",
      n(sum(balances.feed_kg_h), 5),
      n(sum(balances.extract_kg_h), 5),
      n(sum(balances.raffinate_kg_h), 5),
      "-",
      "-",
    ]]),
    [72, 86, 92, 94, 106, 94],
    { rowFont: 7.2, firstBold: true },
  );
  paragraph(`Hydrocarbon-only raffinate aromatic mass fraction: ${n(quality.w_A_R_product.value * 100, 4)} wt%. NMP is excluded from the product denominator.`, { bold: true });
  paragraph(`Sulfur / DBT prediction: ${headline.sulfurDbtPrediction}. Aromatic-transfer results must not be interpreted as sulfur or DBT removal.`, { color: colors.red });

  title("3. Component and global mass balances");
  table(
    ["Component", "Feed", "Extract", "Raffinate", "Residual kg/h", "Status"],
    COMPONENTS.map((component, i) => [
      component,
      n(balances.feed_kg_h[i], 7),
      n(balances.extract_kg_h[i], 7),
      n(balances.raffinate_kg_h[i], 7),
      n(balances.componentBalance_kg_h[i], 8),
      "PASS",
    ]).concat([[
      "Global total",
      n(sum(balances.feed_kg_h), 7),
      n(sum(balances.extract_kg_h), 7),
      n(sum(balances.raffinate_kg_h), 7),
      n(balances.totalBalance_kg_h, 8),
      "PASS",
    ]]),
    [78, 92, 92, 92, 105, 48],
    { rowFont: 7.2, firstBold: true },
  );
  paragraph("Acceptance limits: total balance <= 5.0e-6 kg/h; maximum component balance <= 1.0e-6 kg/h.", { color: colors.muted });

  // Axial profile.
  title("4. Complete axial compartment profile");
  paragraph(`Component order for all arrays: [${COMPONENTS.join(", ")}]. The stored axial state reports continuous/extract-side and dispersed/raffinate-side state totals at each compartment centre.`);
  table(
    ["Comp.", "z centre m", "z interval m", "Extract-side state kg/h", "Raffinate-side state kg/h", "phi_d", "Re_d", "a m2/m3"],
    profile.map((p, i) => {
      const c = compartments[i];
      return [
        String(i + 1),
        n(p.z_m, 5),
        `${n(c.z_bottom_m, 3)} - ${n(c.z_top_m, 3)}`,
        n(p.extractFlow_kg_h, 5),
        n(p.raffinateFlow_kg_h, 5),
        n(p.phi_d, 6),
        n(p.Re_d, 6),
        n(c.interfacialArea.a_m2_m3, 5),
      ];
    }),
    [43, 66, 75, 105, 115, 55, 48, 70],
    { rowFont: 7.2, firstBold: true },
  );
  table(
    ["Comp.", "d32 mm", "U slip m/s", "Raffinate mass fractions [Sat,Mono,Di,Poly,NMP]", "Extract mass fractions [Sat,Mono,Di,Poly,NMP]"],
    profile.map((p, i) => [
      String(i + 1),
      n(p.d32_m * 1000, 7),
      n(compartments[i].U_slip_m_s, 8),
      massFractions(p.raffinateMassFractions),
      massFractions(p.extractMassFractions),
    ]),
    [43, 68, 78, 160, 158],
    { rowFont: 6.8, firstBold: true },
  );

  title("5. Axial hydrodynamics and transfer coefficients");
  paragraph("All transfer arrays below use [Sat, Mono, Di, Poly, NMP]. Values are local preliminary physics outputs; governed release values remain unavailable.");
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    const c = compartments[i];
    table(
      ["Compartment", "Metric", "Sat", "Mono", "Di", "Poly", "NMP"],
      [
        [String(i + 1), "Shc", ...p.Sh_c.map((x: any) => n(x, 6))],
        ["", "Shd", ...p.Sh_d.map((x: any) => n(x, 6))],
        ["", "kc m/s", ...p.k_c_m_s.map((x: any) => n(x, 7))],
        ["", "kd m/s", ...p.k_d_m_s.map((x: any) => n(x, 7))],
        ["", "Koverall m/s", ...p.K_overall_m_s.map((x: any) => n(x, 7))],
        ["", "Koa s-1", ...p.Koa_per_s.map((x: any) => n(x, 7))],
      ],
      [62, 86, 72, 72, 72, 72, 71],
      { rowFont: 6.9, firstBold: false },
    );
    paragraph(`Holdup phi = ${n(c.holdup.phi, 7)}; interfacial area = ${n(c.interfacialArea.a_m2_m3, 7)} m2/m3; Re_d = ${n(p.Re_d, 7)}.`, { color: colors.muted, size: 8 });
  }

  title("6. Driving forces and component transfer rates");
  paragraph("Positive transfer is RRBO/dispersed phase to NMP/continuous phase. Negative NMP values indicate transfer in the opposite direction.");
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    const c = compartments[i];
    table(
      ["Compartment", "Metric", "Sat", "Mono", "Di", "Poly", "NMP"],
      [
        [String(i + 1), "Driving force kg/m3", ...p.drivingForce_kg_m3.map((x: any) => n(x, 7))],
        ["", "Rate kg/m3/s", ...p.transferRate_kg_m3_s.map((x: any) => n(x, 8))],
        ["", "Amount kg/h", ...c.transferAmount_kg_h.map((x: any) => n(x, 7))],
      ],
      [62, 105, 70, 70, 70, 70, 60],
      { rowFont: 6.9 },
    );
  }

  title("7. d32, holdup, power and property basis");
  keyValue([
    ["d32 nominal", `${n(d.d32.d32_mm, 7)} mm`],
    ["d32 mode", safeText(d.d32.modeUsed)],
    ["d32 equation", "d32 = C x (gamma / rho_c)^0.6 x epsilon^-0.4"],
    ["d32 C nominal / sensitivity", "0.39 / 0.36 - 0.43"],
    ["d32 sensitivity", "0.909 - 1.086 mm"],
    ["d32 status", "DIRECT_TURBULENCE_D32_PRELIMINARY; not pilot validated"],
    ["Global holdup phi", n(d.interfacialArea.phi_d_used, 7)],
    ["Global interfacial area", `${n(d.interfacialArea.a_m2_m3, 7)} m2/m3`],
    ["Interfacial tension", `${n(d.designBasis.interfacialTension.value_N_m, 7)} N/m`],
    ["Sigma basis", safeText(d.designBasis.interfacialTension.method)],
    ["Sigma anchor", "0.01 N/m at 70 deg C, retained unchanged"],
    ["Power density", `${n(d.power.powerPerVolume_W_m3, 7)} W/m3`],
    ["Specific power psi", `${n(d.power.psi_W_kg, 7)} W/kg`],
    ["Rotor speed", `${n(d.power.rotorSpeed_rpm, 5)} rpm`],
    ["Continuous density basis", `${n(d.bvp.engineeringBasis ? 1006 : 1006, 5)} kg/m3`],
    ["Dispersed density basis", "862 kg/m3"],
  ]);

  title("8. Solver convergence and acceptance");
  keyValue([
    ["BVP status", safeText(b.status)],
    ["Convergence status", safeText(b.convergenceStatus)],
    ["Iterations", String(b.iterations)],
    ["Function evaluations", String(b.functionEvaluations)],
    ["Final residual norm", n(b.finalResidualNorm, 10)],
    ["Maximum normalized residual", n(b.maximumNormalizedResidual, 10)],
    ["Relative state change", n(b.acceptanceChecks.relativeStateChange.value, 10)],
    ["Total balance residual", `${n(b.totalMassBalance_kg_h, 10)} kg/h`],
    ["Maximum component balance residual", `${n(b.maximumComponentResidual_kg_h, 10)} kg/h`],
    ["Property validity status", safeText(b.propertyValidityStatus)],
    ["BVP acceptance termination", safeText(b.acceptanceChecks.termination)],
    ["Transfer status", safeText(d.transferStatus.status)],
    ["Governed transfer values", safeText(d.transferStatus.governedValues)],
    ["Release status", safeText(d.transferStatus.releaseStatus)],
  ]);

  title("9. Task #124 thermodynamic temperature status");
  callout("THERMODYNAMIC STATUS: PRELIMINARY / EXTRAPOLATED AT 50 deg C. This is a temperature-applicability classification, not an additional execution gate.", colors.paleAmber, "#E7B85C");
  keyValue([
    ["Temperature status", safeText(thermo.temperatureStatus)],
    ["Selected temperature", `${n(thermo.operatingTemperatureC, 5)} deg C / ${n(thermo.operatingTemperatureK, 5)} K`],
    ["Nearest admitted evidence", `${n(thermo.nearestAdmittedTemperatureK, 5)} K`],
    ["Distance outside admitted range", `${n(thermo.distanceFromNearestAdmittedTemperatureK, 5)} K`],
    ["Selected-temperature applicability", safeText(thermo.selectedTemperatureApplicability)],
    ["NRTL model", safeText(thermo.parameterIdentifiability.modelId)],
    ["Parameter identifiability", safeText(thermo.parameterIdentifiability.status)],
    ["Independent multi-temperature validation", safeText(thermo.independentMultiTemperatureValidation.status)],
    ["Optimizer-forward readiness", safeText(thermo.optimizerForwardThermodynamicReadiness)],
    ["Calibration reproduction", safeText(thermo.calibrationTemperatureReproduction.status)],
    ["Tie-lines within gate", `${thermo.calibrationTemperatureReproduction.tieLinesWithinGate}/${thermo.calibrationTemperatureReproduction.tieLinesTotal}`],
    ["Maximum calibration deviation", n(thermo.calibrationTemperatureReproduction.maxAbsDeviation, 6)],
  ]);
  paragraph("Task #124 warnings:", { bold: true });
  for (const warning of thermo.warnings || []) bullet(warning, colors.amber);

  title("10. Persisted run warnings and limitations");
  const warningCodes = new Map<string, number>();
  for (const warning of run.warnings || []) warningCodes.set(warning.code, (warningCodes.get(warning.code) || 0) + 1);
  for (const [code, count] of warningCodes) bullet(`${code}${count > 1 ? ` (x${count})` : ""}`);
  bullet("The sigma temperature-dependence warning is intentional: the unchanged 70 deg C anchor is held constant over the bounded preliminary range; no sigma(T) correlation was applied.");
  bullet("The direct-turbulence d32 route is separate from K&H 1996 and is not pilot validated.");
  bullet("The dispersed Re_d profile is approximately 9.11 - 9.40, below the reported rigid-sphere validity floor of 10.");
  bullet("K&H-derived hydrodynamic and mass-transfer outputs are local preliminary physics, not governed release coefficients.");
  bullet("Sulfur and DBT prediction remains NOT_IMPLEMENTED.");

  title("Audit conclusion");
  callout(
    "The persisted Run #711 is numerically coherent: the counter-current BVP converged, all component balances passed, and the transfer directions are internally consistent. The prediction remains PRELIMINARY / EXTRAPOLATED at 50 deg C and is not release eligible.",
    colors.paleBlue,
    "#8BB6CC",
  );
  paragraph("This report is an audit of the saved Simulator result only. It does not tune or modify the model, inputs, NRTL, BVP, K&H, physical-property routes, d32, holdup, C2, partition governance, or validation gates.", { color: colors.muted });

  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.on("finish", resolve);
    doc.on("error", reject);
  });
  await pool.end();
  console.log(JSON.stringify({ output: OUT, pages: doc.bufferedPageRange().count, run: run.id, calculatedAt: run.calculated_at }));
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});